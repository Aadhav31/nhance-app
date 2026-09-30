-- Tamper-evident, append-only audit ledger for every business-table mutation.
--
-- Guarantees:
--   * INSERT / UPDATE / DELETE are captured inside the same transaction.
--   * Deletes retain the complete pre-delete row snapshot.
--   * Updates retain before + after snapshots and the exact changed fields.
--   * Direct INSERT / UPDATE / DELETE / TRUNCATE is denied to app roles.
--   * Each company has a serialized SHA-256 hash chain that can be verified.
--   * Newly-created public tables automatically receive the audit trigger.
--
-- Database owners can always change database objects. The hash chain therefore
-- provides tamper evidence, while grants, RLS and blocking triggers make the
-- ledger immutable to application, authenticated and service-role traffic.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists audit_private;
revoke all on schema audit_private from public, anon, authenticated, service_role;

-- The original table exists in production, but lacked row snapshots and a
-- cryptographic chain. Extend it in place so the existing UI/API name remains
-- stable and any historical rows can be retained.
create table if not exists public.audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid references public.companies(id) on delete restrict,
  module text not null,
  action text not null,
  record_id uuid,
  record_ref text,
  description text,
  actor_id uuid,
  actor_name text,
  actor_role text,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs
  add column if not exists event_no bigint,
  add column if not exists chain_key uuid,
  add column if not exists table_schema text,
  add column if not exists table_name text,
  add column if not exists operation text,
  add column if not exists record_pk jsonb,
  add column if not exists old_data jsonb,
  add column if not exists new_data jsonb,
  add column if not exists changed_fields text[],
  add column if not exists previous_hash text,
  add column if not exists event_hash text,
  add column if not exists hash_version smallint,
  add column if not exists transaction_id bigint,
  add column if not exists request_id text,
  add column if not exists source text;

alter table public.audit_logs
  drop constraint if exists audit_logs_company_id_fkey,
  add constraint audit_logs_company_id_fkey
    foreign key (company_id) references public.companies(id) on delete restrict;

comment on table public.audit_logs is
  'Append-only, per-company tamper-evident ledger of business data mutations and explicit governance events.';
comment on column public.audit_logs.old_data is
  'Sanitized row snapshot immediately before UPDATE or DELETE.';
comment on column public.audit_logs.new_data is
  'Sanitized row snapshot immediately after INSERT or UPDATE.';
comment on column public.audit_logs.event_hash is
  'SHA-256 of the complete event payload, including previous_hash.';

-- Prevent credentials and tokens from being duplicated into the ledger. This
-- operates on the top-level row object, which is how table columns are encoded.
create or replace function audit_private.sanitize_snapshot(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, extensions
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
begin
  if p_value is null then
    return null;
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_value)
  loop
    if v_key ~* '(password|secret|token|api[_-]?key|private[_-]?key)' then
      v_result := v_result || jsonb_build_object(v_key, '[REDACTED]');
    else
      v_result := v_result || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function audit_private.module_for_table(p_table_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_table_name ~ '^(approval_|asset_transfer_requests)' then 'approvals'
    when p_table_name ~ '^(account_|chart_of_accounts|expenses|fixed_expense|payment_|payments|payroll_postings)' then 'finance'
    when p_table_name ~ '^(invoice|client_invoice|sales_order|quotes|quote_|delivery_challan|dc_|credit_note|cn_)' then 'sales'
    when p_table_name ~ '^(purchase_order|po_|bills|bill_|vendor)' then 'purchases'
    when p_table_name ~ '^(equipment|vehicles|fuel_|shift_)' then 'equipment'
    when p_table_name ~ '^(maintenance|pm_|job_card|breakdown_|lifecycle_)' then 'equipment_health'
    when p_table_name ~ '^(hr_|attendance|salary_|employee_reimbursements|operator_)' then 'hr'
    when p_table_name ~ '^(inventory|stock_|stores|item_catalog)' then 'inventory'
    when p_table_name ~ '^(projects|project_|sites|boq_|ra_bill)' then 'projects'
    when p_table_name ~ '^(clients|client_billing)' then 'clients'
    when p_table_name ~ '^(crusher_)' then 'crusher'
    when p_table_name ~ '^(chat_|assistant_|sticky_notes)' then 'collaboration'
    when p_table_name ~ '^(companies|company_|user_)' then 'administration'
    else 'operations'
  end;
$$;

create or replace function audit_private.event_hash(p_payload jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $$
  select encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$$;

-- Central insert path. Per-company advisory locking prevents concurrent writes
-- from forking the chain or receiving the same event number.
create or replace function audit_private.insert_event(
  p_company_id uuid,
  p_module text,
  p_action text,
  p_record_id uuid,
  p_record_ref text,
  p_description text,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_meta jsonb,
  p_table_schema text,
  p_table_name text,
  p_operation text,
  p_record_pk jsonb,
  p_old_data jsonb,
  p_new_data jsonb,
  p_changed_fields text[],
  p_request_id text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, audit_private
as $$
declare
  v_id uuid := extensions.gen_random_uuid();
  v_chain_key uuid := coalesce(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_event_no bigint;
  v_previous_hash text;
  v_created_at timestamptz := clock_timestamp();
  v_transaction_id bigint := txid_current();
  v_hash_version smallint := 1;
  v_payload jsonb;
  v_event_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_chain_key::text, 0));

  select al.event_no, al.event_hash
    into v_event_no, v_previous_hash
  from public.audit_logs al
  where al.chain_key = v_chain_key
  order by al.event_no desc
  limit 1;

  v_event_no := coalesce(v_event_no, 0) + 1;
  v_previous_hash := coalesce(v_previous_hash, repeat('0', 64));

  v_payload := jsonb_build_object(
    'id', v_id,
    'company_id', p_company_id,
    'module', p_module,
    'action', p_action,
    'record_id', p_record_id,
    'record_ref', p_record_ref,
    'description', p_description,
    'actor_id', p_actor_id,
    'actor_name', p_actor_name,
    'actor_role', p_actor_role,
    'meta', p_meta,
    'created_at', v_created_at,
    'event_no', v_event_no,
    'chain_key', v_chain_key,
    'table_schema', p_table_schema,
    'table_name', p_table_name,
    'operation', p_operation,
    'record_pk', p_record_pk,
    'old_data', p_old_data,
    'new_data', p_new_data,
    'changed_fields', p_changed_fields,
    'previous_hash', v_previous_hash,
    'hash_version', v_hash_version,
    'transaction_id', v_transaction_id,
    'request_id', p_request_id,
    'source', p_source
  );
  v_event_hash := audit_private.event_hash(v_payload);

  insert into public.audit_logs (
    id, company_id, module, action, record_id, record_ref, description,
    actor_id, actor_name, actor_role, meta, created_at, event_no, chain_key,
    table_schema, table_name, operation, record_pk, old_data, new_data,
    changed_fields, previous_hash, event_hash, hash_version, transaction_id,
    request_id, source
  ) values (
    v_id, p_company_id, p_module, p_action, p_record_id, p_record_ref, p_description,
    p_actor_id, p_actor_name, p_actor_role, p_meta, v_created_at, v_event_no, v_chain_key,
    p_table_schema, p_table_name, p_operation, p_record_pk, p_old_data, p_new_data,
    p_changed_fields, v_previous_hash, v_event_hash, v_hash_version, v_transaction_id,
    p_request_id, p_source
  );

  return v_id;
end;
$$;

revoke all on function audit_private.sanitize_snapshot(jsonb) from public, anon, authenticated, service_role;
revoke all on function audit_private.module_for_table(text) from public, anon, authenticated, service_role;
revoke all on function audit_private.event_hash(jsonb) from public, anon, authenticated, service_role;
revoke all on function audit_private.insert_event(uuid,text,text,uuid,text,text,uuid,text,text,jsonb,text,text,text,jsonb,jsonb,jsonb,text[],text,text) from public, anon, authenticated, service_role;

-- Drop the old immutability trigger temporarily so any historical rows can be
-- assigned their chain position and hash. Production currently has no rows,
-- but this keeps the migration safe for other installations.
drop trigger if exists enforce_audit_immutability on public.audit_logs;
drop trigger if exists enforce_audit_no_truncate on public.audit_logs;

do $$
declare
  r public.audit_logs%rowtype;
  v_current_chain uuid := null;
  v_event_no bigint := 0;
  v_previous_hash text := repeat('0', 64);
  v_payload jsonb;
  v_event_hash text;
begin
  for r in
    select *
    from public.audit_logs
    order by coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), created_at, id
  loop
    r.chain_key := coalesce(r.company_id, '00000000-0000-0000-0000-000000000000'::uuid);
    if v_current_chain is distinct from r.chain_key then
      v_current_chain := r.chain_key;
      v_event_no := 0;
      v_previous_hash := repeat('0', 64);
    end if;

    v_event_no := v_event_no + 1;
    r.event_no := v_event_no;
    r.table_schema := coalesce(r.table_schema, 'legacy');
    r.table_name := coalesce(r.table_name, r.module);
    r.operation := coalesce(r.operation, upper(r.action));
    r.record_pk := coalesce(r.record_pk, case when r.record_id is null then '{}'::jsonb else jsonb_build_object('id', r.record_id) end);
    r.old_data := coalesce(r.old_data, r.meta -> 'old_values');
    r.new_data := coalesce(r.new_data, r.meta -> 'new_values');
    r.changed_fields := coalesce(r.changed_fields, array[]::text[]);
    r.previous_hash := v_previous_hash;
    r.hash_version := 1;
    r.transaction_id := coalesce(r.transaction_id, 0);
    r.source := coalesce(r.source, 'legacy_client');
    r.event_hash := null;

    v_payload := to_jsonb(r) - 'event_hash';
    v_event_hash := audit_private.event_hash(v_payload);

    update public.audit_logs
    set event_no = r.event_no,
        chain_key = r.chain_key,
        table_schema = r.table_schema,
        table_name = r.table_name,
        operation = r.operation,
        record_pk = r.record_pk,
        old_data = r.old_data,
        new_data = r.new_data,
        changed_fields = r.changed_fields,
        previous_hash = r.previous_hash,
        event_hash = v_event_hash,
        hash_version = r.hash_version,
        transaction_id = r.transaction_id,
        source = r.source
    where id = r.id;

    v_previous_hash := v_event_hash;
  end loop;
end;
$$;

alter table public.audit_logs
  alter column event_no set not null,
  alter column chain_key set not null,
  alter column changed_fields set default array[]::text[],
  alter column changed_fields set not null,
  alter column previous_hash set not null,
  alter column event_hash set not null,
  alter column hash_version set default 1,
  alter column hash_version set not null,
  alter column transaction_id set not null,
  alter column source set default 'database_trigger',
  alter column source set not null;

alter table public.audit_logs
  drop constraint if exists audit_logs_operation_check,
  add constraint audit_logs_operation_check
    check (operation is null or operation in ('INSERT', 'UPDATE', 'DELETE', 'CUSTOM')),
  drop constraint if exists audit_logs_hash_format_check,
  add constraint audit_logs_hash_format_check
    check (previous_hash ~ '^[0-9a-f]{64}$' and event_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists ux_audit_logs_chain_event
  on public.audit_logs(chain_key, event_no);
create index if not exists idx_audit_logs_company_table_created
  on public.audit_logs(company_id, table_name, created_at desc);
create index if not exists idx_audit_logs_company_action_created
  on public.audit_logs(company_id, action, created_at desc);
create index if not exists idx_audit_logs_record_pk
  on public.audit_logs using gin(record_pk jsonb_path_ops)
  where record_pk is not null;

create or replace function public.fn_audit_logs_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Audit ledger is append-only. Update, delete and truncate are prohibited.';
end;
$$;

revoke all on function public.fn_audit_logs_immutable() from public, anon, authenticated, service_role;

create trigger enforce_audit_immutability
  before update or delete on public.audit_logs
  for each row execute function public.fn_audit_logs_immutable();

create trigger enforce_audit_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.fn_audit_logs_immutable();

-- Direct writes are not needed. All writes go through a database trigger or the
-- validated record_audit_event RPC below.
revoke all on table public.audit_logs from anon, authenticated, service_role;
grant select on table public.audit_logs to authenticated, service_role;

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

drop policy if exists "Admins can view audit_logs" on public.audit_logs;
drop policy if exists "Company members can insert audit_logs" on public.audit_logs;
drop policy if exists "Company admins can verify audit_logs" on public.audit_logs;

create policy "Company admins can verify audit_logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and company_id = (select up.company_id from public.user_profiles up where up.id = (select auth.uid()))
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.company_id = audit_logs.company_id
        and ur.role::text = 'admin'
    )
  );

-- Resolve tenant and actor information in the database, then capture the full
-- before/after row state. For child tables without company_id, follow a direct
-- single-column foreign key to its parent; otherwise fall back to the actor's
-- company.
create or replace function audit_private.capture_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, audit_private
as $$
declare
  v_old_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then audit_private.sanitize_snapshot(to_jsonb(old)) else null end;
  v_new_data jsonb := case when tg_op in ('INSERT', 'UPDATE') then audit_private.sanitize_snapshot(to_jsonb(new)) else null end;
  v_row_data jsonb := coalesce(v_new_data, v_old_data);
  v_company_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_company_id uuid;
  v_actor_name text;
  v_actor_role text;
  v_record_id uuid;
  v_record_pk jsonb;
  v_record_ref text;
  v_changed_fields text[] := array[]::text[];
  v_request_id text;
  v_headers text;
  v_fk record;
  v_fk_value text;
begin
  begin
    if nullif(v_row_data ->> 'company_id', '') is not null then
      v_company_id := (v_row_data ->> 'company_id')::uuid;
    elsif tg_table_name = 'companies' and nullif(v_row_data ->> 'id', '') is not null then
      v_company_id := (v_row_data ->> 'id')::uuid;
    end if;
  exception when invalid_text_representation then
    v_company_id := null;
  end;

  if v_actor_id is not null then
    select up.full_name, up.company_id, ur.role::text
      into v_actor_name, v_actor_company_id, v_actor_role
    from public.user_profiles up
    left join public.user_roles ur
      on ur.user_id = up.id and ur.company_id = up.company_id
    where up.id = v_actor_id
    limit 1;

    v_company_id := coalesce(v_company_id, v_actor_company_id);
  end if;

  if v_company_id is null then
    for v_fk in
      select src.attname as source_column,
             tgt_ns.nspname as target_schema,
             tgt.relname as target_table,
             dst.attname as target_column,
             exists (
               select 1
               from pg_attribute ca
               where ca.attrelid = tgt.oid
                 and ca.attname = 'company_id'
                 and ca.attnum > 0
                 and not ca.attisdropped
             ) as target_has_company
      from pg_constraint con
      join pg_class src_table on src_table.oid = con.conrelid
      join pg_attribute src on src.attrelid = con.conrelid and src.attnum = con.conkey[1]
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
      join pg_attribute dst on dst.attrelid = con.confrelid and dst.attnum = con.confkey[1]
      where con.contype = 'f'
        and con.conrelid = tg_relid
        and array_length(con.conkey, 1) = 1
    loop
      v_fk_value := v_row_data ->> v_fk.source_column;
      continue when nullif(v_fk_value, '') is null;

      begin
        if v_fk.target_schema = 'public' and v_fk.target_table = 'companies' and v_fk.target_column = 'id' then
          v_company_id := v_fk_value::uuid;
        elsif v_fk.target_schema = 'public' and v_fk.target_has_company then
          execute format(
            'select company_id from %I.%I where %I::text = $1 limit 1',
            v_fk.target_schema, v_fk.target_table, v_fk.target_column
          ) into v_company_id using v_fk_value;
        end if;
      exception when others then
        v_company_id := null;
      end;

      exit when v_company_id is not null;
    end loop;
  end if;

  select coalesce(jsonb_object_agg(a.attname, v_row_data -> a.attname), '{}'::jsonb)
    into v_record_pk
  from pg_index i
  join lateral unnest(i.indkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = tg_relid and i.indisprimary;

  if v_record_pk = '{}'::jsonb then
    if v_row_data ? 'id' then
      v_record_pk := jsonb_build_object('id', v_row_data -> 'id');
    else
      v_record_pk := null;
    end if;
  end if;

  begin
    if nullif(v_row_data ->> 'id', '') is not null
       and (v_row_data ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_record_id := (v_row_data ->> 'id')::uuid;
    end if;
  exception when invalid_text_representation then
    v_record_id := null;
  end;

  v_record_ref := left(coalesce(
    v_row_data ->> 'invoice_number',
    v_row_data ->> 'bill_number',
    v_row_data ->> 'po_number',
    v_row_data ->> 'voucher_number',
    v_row_data ->> 'ra_number',
    v_row_data ->> 'contract_number',
    v_row_data ->> 'project_code',
    v_row_data ->> 'registration_number',
    v_row_data ->> 'equipment_code',
    v_row_data ->> 'employee_code',
    v_row_data ->> 'name',
    v_row_data ->> 'id'
  ), 160);

  select coalesce(array_agg(keys.key order by keys.key), array[]::text[])
    into v_changed_fields
  from (
    select jsonb_object_keys(coalesce(v_old_data, '{}'::jsonb)) as key
    union
    select jsonb_object_keys(coalesce(v_new_data, '{}'::jsonb)) as key
  ) keys
  where (v_old_data -> keys.key) is distinct from (v_new_data -> keys.key);

  v_headers := current_setting('request.headers', true);
  if nullif(v_headers, '') is not null then
    begin
      v_request_id := (v_headers::jsonb) ->> 'x-request-id';
    exception when others then
      v_request_id := null;
    end;
  end if;

  perform audit_private.insert_event(
    v_company_id,
    audit_private.module_for_table(tg_table_name),
    lower(tg_op),
    v_record_id,
    v_record_ref,
    format('%s %s', initcap(lower(tg_op)), replace(tg_table_name, '_', ' ')),
    v_actor_id,
    coalesce(v_actor_name, case when v_actor_id is null then 'System' else 'Unknown user' end),
    coalesce(v_actor_role, case when v_actor_id is null then 'system' else null end),
    jsonb_build_object('trigger', 'database', 'schema', tg_table_schema),
    tg_table_schema,
    tg_table_name,
    tg_op,
    v_record_pk,
    v_old_data,
    v_new_data,
    v_changed_fields,
    v_request_id,
    'database_trigger'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function audit_private.capture_change() from public, anon, authenticated, service_role;

-- Explicit application events (submit, approve, export, login, etc.) use this
-- validated RPC. The database derives the actor; clients cannot impersonate it.
create or replace function public.record_audit_event(
  p_company_id uuid,
  p_module text,
  p_action text,
  p_record_id uuid default null,
  p_record_ref text default null,
  p_description text default null,
  p_meta jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, audit_private
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_request_id text;
  v_headers text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select up.full_name, ur.role::text
    into v_actor_name, v_actor_role
  from public.user_profiles up
  left join public.user_roles ur
    on ur.user_id = up.id and ur.company_id = up.company_id
  where up.id = v_actor_id
    and up.company_id = p_company_id
  limit 1;

  if v_actor_name is null then
    raise exception using errcode = '42501', message = 'The user does not belong to this company.';
  end if;

  if nullif(trim(p_module), '') is null or nullif(trim(p_action), '') is null then
    raise exception using errcode = '22023', message = 'Module and action are required.';
  end if;

  v_headers := current_setting('request.headers', true);
  if nullif(v_headers, '') is not null then
    begin
      v_request_id := (v_headers::jsonb) ->> 'x-request-id';
    exception when others then
      v_request_id := null;
    end;
  end if;

  return audit_private.insert_event(
    p_company_id,
    lower(trim(p_module)),
    lower(trim(p_action)),
    p_record_id,
    left(p_record_ref, 160),
    left(p_description, 1000),
    v_actor_id,
    v_actor_name,
    v_actor_role,
    audit_private.sanitize_snapshot(p_meta),
    null,
    null,
    'CUSTOM',
    case when p_record_id is null then null else jsonb_build_object('id', p_record_id) end,
    null,
    null,
    array[]::text[],
    v_request_id,
    'application_event'
  );
end;
$$;

revoke all on function public.record_audit_event(uuid,text,text,uuid,text,text,jsonb) from public, anon, service_role;
grant execute on function public.record_audit_event(uuid,text,text,uuid,text,text,jsonb) to authenticated;

-- Admin-facing cryptographic verification. It checks sequence continuity,
-- previous-hash continuity, and recomputes every event hash from stored data.
create or replace function public.verify_audit_chain(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, audit_private
as $$
declare
  r public.audit_logs%rowtype;
  v_expected_no bigint := 1;
  v_expected_previous text := repeat('0', 64);
  v_computed text;
  v_total bigint := 0;
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.company_id = p_company_id
      and ur.role::text = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Company administrator access is required.';
  end if;

  for r in
    select *
    from public.audit_logs
    where company_id = p_company_id
    order by event_no
  loop
    v_total := v_total + 1;
    v_computed := audit_private.event_hash(to_jsonb(r) - 'event_hash');

    if r.event_no <> v_expected_no
       or r.previous_hash <> v_expected_previous
       or r.event_hash <> v_computed then
      return jsonb_build_object(
        'valid', false,
        'total_events', v_total,
        'first_invalid_event_no', r.event_no,
        'checked_at', clock_timestamp()
      );
    end if;

    v_expected_no := v_expected_no + 1;
    v_expected_previous := r.event_hash;
  end loop;

  return jsonb_build_object(
    'valid', true,
    'total_events', v_total,
    'first_invalid_event_no', null,
    'latest_hash', case when v_total = 0 then null else v_expected_previous end,
    'checked_at', clock_timestamp()
  );
end;
$$;

revoke all on function public.verify_audit_chain(uuid) from public, anon, service_role;
grant execute on function public.verify_audit_chain(uuid) to authenticated;

-- Install the trigger on every current business table. The two audit tables are
-- excluded to avoid recursion and to preserve the old table as read-only legacy.
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as table_regclass
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relispartition
      and c.relname not in ('audit_logs', 'audit_log')
  loop
    execute format('drop trigger if exists audit_capture_change on %s', r.table_regclass);
    execute format(
      'create trigger audit_capture_change after insert or update or delete on %s for each row execute function audit_private.capture_change()',
      r.table_regclass
    );
  end loop;
end;
$$;

-- Automatically protect tables introduced by future migrations.
create or replace function audit_private.audit_new_public_table()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog, public, audit_private
as $$
declare
  cmd record;
  v_table regclass;
  v_name text;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
  loop
    continue when cmd.schema_name is distinct from 'public';
    continue when cmd.object_type not in ('table', 'partitioned table');

    v_table := cmd.objid::regclass;
    select c.relname into v_name from pg_class c where c.oid = cmd.objid;
    continue when v_name in ('audit_logs', 'audit_log');

    execute format('drop trigger if exists audit_capture_change on %s', v_table);
    execute format(
      'create trigger audit_capture_change after insert or update or delete on %s for each row execute function audit_private.capture_change()',
      v_table
    );
  end loop;
end;
$$;

revoke all on function audit_private.audit_new_public_table() from public, anon, authenticated, service_role;

drop event trigger if exists audit_new_public_table;
create event trigger audit_new_public_table
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function audit_private.audit_new_public_table();

-- Lock down the unused singular legacy table as well. It is retained only to
-- avoid a destructive migration and can be inspected by database owners.
do $$
begin
  if to_regclass('public.audit_log') is not null then
    execute 'revoke all on table public.audit_log from anon, authenticated, service_role';
  end if;
end;
$$;
