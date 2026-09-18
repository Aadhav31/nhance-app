-- Nhance tenant security hardening.
-- Keeps existing browser workflows working while removing anonymous access and
-- enforcing company/role checks inside privileged SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- 1. Protect exposed tables with tenant-scoped RLS.
-- ---------------------------------------------------------------------------

alter table public.hr_salary_history enable row level security;

drop policy if exists salary_history_tenant_select on public.hr_salary_history;
drop policy if exists salary_history_tenant_insert on public.hr_salary_history;
drop policy if exists salary_history_tenant_update on public.hr_salary_history;
drop policy if exists salary_history_tenant_delete on public.hr_salary_history;

create policy salary_history_tenant_select
on public.hr_salary_history for select to authenticated
using (
  company_id = (select public.auth_company_id())
  and (select public.auth_role()) in ('admin', 'manager', 'accounts', 'hr')
);

create policy salary_history_tenant_insert
on public.hr_salary_history for insert to authenticated
with check (
  company_id = (select public.auth_company_id())
  and changed_by = (select auth.uid())
  and (select public.auth_role()) in ('admin', 'manager', 'accounts', 'hr')
);

create policy salary_history_tenant_update
on public.hr_salary_history for update to authenticated
using (
  company_id = (select public.auth_company_id())
  and (select public.auth_role()) in ('admin', 'manager', 'accounts', 'hr')
)
with check (
  company_id = (select public.auth_company_id())
  and (select public.auth_role()) in ('admin', 'manager', 'accounts', 'hr')
);

create policy salary_history_tenant_delete
on public.hr_salary_history for delete to authenticated
using (
  company_id = (select public.auth_company_id())
  and (select public.auth_role()) in ('admin', 'manager')
);

alter table public.operator_substitutions enable row level security;

drop policy if exists operator_substitutions_tenant_select on public.operator_substitutions;
drop policy if exists operator_substitutions_tenant_insert on public.operator_substitutions;
drop policy if exists operator_substitutions_tenant_update on public.operator_substitutions;
drop policy if exists operator_substitutions_tenant_delete on public.operator_substitutions;

create policy operator_substitutions_tenant_select
on public.operator_substitutions for select to authenticated
using (company_id = (select public.auth_company_id()));

create policy operator_substitutions_tenant_insert
on public.operator_substitutions for insert to authenticated
with check (
  company_id = (select public.auth_company_id())
  and approved_by = (select auth.uid())
  and (select public.auth_role()) in ('admin', 'manager', 'hr')
);

create policy operator_substitutions_tenant_update
on public.operator_substitutions for update to authenticated
using (
  company_id = (select public.auth_company_id())
  and (select public.auth_role()) in ('admin', 'manager', 'hr')
)
with check (
  company_id = (select public.auth_company_id())
  and (select public.auth_role()) in ('admin', 'manager', 'hr')
);

create policy operator_substitutions_tenant_delete
on public.operator_substitutions for delete to authenticated
using (
  company_id = (select public.auth_company_id())
  and (select public.auth_role()) in ('admin', 'manager', 'hr')
);

alter view public.company_razorpay_status set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 2. Add authorization inside privileged browser-callable RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.next_doc_seq(p_company_id uuid, p_seq_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is distinct from public.auth_company_id()
     and coalesce(auth.jwt() ->> 'email', '') <> 'aadhav31@gmail.com' then
    raise exception 'Company access denied' using errcode = '42501';
  end if;

  insert into public.document_sequences (company_id, seq_key, last_seq)
  values (p_company_id, p_seq_key, 1)
  on conflict (company_id, seq_key)
  do update set last_seq = public.document_sequences.last_seq + 1
  returning last_seq into v_next;
  return v_next;
end;
$$;

create or replace function public.create_invoice_with_items(p_invoice jsonb, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p_invoice ->> 'id')::uuid;
  v_company_id uuid := (p_invoice ->> 'company_id')::uuid;
  item jsonb;
  i integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_company_id is distinct from public.auth_company_id() then
    raise exception 'Company access denied' using errcode = '42501';
  end if;
  if public.auth_role() not in ('admin', 'manager', 'accounts') then
    raise exception 'Invoice permission denied' using errcode = '42501';
  end if;

  insert into public.client_invoices (
    id, company_id, invoice_number, invoice_date, due_date,
    client_name, client_address, client_gstin,
    project_name, work_order_number, work_order_date,
    work_done_from, work_done_to, nature_of_supply,
    place_of_supply, place_of_supply_address,
    subtotal, discount_amount, taxable_amount,
    cgst_rate, sgst_rate, igst_rate,
    cgst_amount, sgst_amount, igst_amount,
    total_amount, status, notes, terms, created_by,
    invoice_type, converted_from_id
  ) values (
    v_id, v_company_id, p_invoice ->> 'invoice_number',
    (p_invoice ->> 'invoice_date')::date, nullif(p_invoice ->> 'due_date', '')::date,
    p_invoice ->> 'client_name', nullif(p_invoice ->> 'client_address', ''),
    nullif(p_invoice ->> 'client_gstin', ''), nullif(p_invoice ->> 'project_name', ''),
    nullif(p_invoice ->> 'work_order_number', ''), nullif(p_invoice ->> 'work_order_date', '')::date,
    nullif(p_invoice ->> 'work_done_from', '')::date, nullif(p_invoice ->> 'work_done_to', '')::date,
    nullif(p_invoice ->> 'nature_of_supply', ''), nullif(p_invoice ->> 'place_of_supply', ''),
    nullif(p_invoice ->> 'place_of_supply_address', ''),
    coalesce((p_invoice ->> 'subtotal')::numeric, 0),
    coalesce((p_invoice ->> 'discount_amount')::numeric, 0),
    coalesce(nullif(p_invoice ->> 'taxable_amount', '')::numeric, (p_invoice ->> 'subtotal')::numeric, 0),
    coalesce((p_invoice ->> 'cgst_rate')::numeric, 0),
    coalesce((p_invoice ->> 'sgst_rate')::numeric, 0),
    coalesce((p_invoice ->> 'igst_rate')::numeric, 0),
    coalesce((p_invoice ->> 'cgst_amount')::numeric, 0),
    coalesce((p_invoice ->> 'sgst_amount')::numeric, 0),
    coalesce((p_invoice ->> 'igst_amount')::numeric, 0),
    coalesce((p_invoice ->> 'total_amount')::numeric, 0),
    coalesce(nullif(p_invoice ->> 'status', ''), 'draft'),
    nullif(p_invoice ->> 'notes', ''), nullif(p_invoice ->> 'terms', ''),
    auth.uid(), coalesce(nullif(p_invoice ->> 'invoice_type', ''), 'tax_invoice'),
    nullif(p_invoice ->> 'converted_from_id', '')::uuid
  );

  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_line_items (
      invoice_id, company_id, description, item_code, sac_hsn_code, gst_rate,
      quantity, unit, rate, amount, sort_order, equipment_id
    ) values (
      v_id, v_company_id, item ->> 'description', nullif(item ->> 'item_code', ''),
      nullif(item ->> 'sac_hsn_code', ''), nullif(item ->> 'gst_rate', '')::numeric,
      coalesce((item ->> 'quantity')::numeric, 1), coalesce(nullif(item ->> 'unit', ''), 'nos'),
      coalesce((item ->> 'rate')::numeric, 0), coalesce((item ->> 'amount')::numeric, 0),
      coalesce((item ->> 'sort_order')::integer, i), nullif(item ->> 'equipment_id', '')::uuid
    );
    i := i + 1;
  end loop;
end;
$$;

create or replace function public.reset_employee_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select company_id into v_target_company from public.user_profiles where id = p_user_id;
  if public.auth_role() not in ('admin', 'manager')
     or v_target_company is distinct from public.auth_company_id() then
    raise exception 'Employee credential permission denied' using errcode = '42501';
  end if;
  if length(p_new_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now()
  where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
end;
$$;

create or replace function public.reset_employee_email(p_user_id uuid, p_new_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_new_email));
  v_target_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select company_id into v_target_company from public.user_profiles where id = p_user_id;
  if public.auth_role() not in ('admin', 'manager')
     or v_target_company is distinct from public.auth_company_id() then
    raise exception 'Employee credential permission denied' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address';
  end if;
  update auth.users
  set email = v_email, email_confirmed_at = now(), updated_at = now()
  where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
end;
$$;

create or replace function public.delete_company_cascade(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null
     or coalesce(auth.jwt() ->> 'email', '') <> 'aadhav31@gmail.com' then
    raise exception 'Platform administrator permission required' using errcode = '42501';
  end if;

  set local session_replication_role = replica;
  delete from public.bill_line_items where bill_id in (select id from public.bills where company_id = p_company_id);
  delete from public.po_line_items where po_id in (select id from public.purchase_orders where company_id = p_company_id);
  delete from public.invoice_line_items where invoice_id in (select id from public.client_invoices where company_id = p_company_id);
  delete from public.quote_line_items where quote_id in (select id from public.quotes where company_id = p_company_id);
  delete from public.so_line_items where so_id in (select id from public.sales_orders where company_id = p_company_id);
  delete from public.dc_line_items where dc_id in (select id from public.delivery_challans where company_id = p_company_id);
  delete from public.cn_line_items where cn_id in (select id from public.credit_notes where company_id = p_company_id);

  for r in
    select distinct table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'company_id' and table_name <> 'companies'
    order by table_name
  loop
    execute format('delete from public.%I where company_id = $1', r.table_name) using p_company_id;
  end loop;
  delete from public.companies where id = p_company_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Remove implicit API execution and re-grant only intentional RPCs.
-- ---------------------------------------------------------------------------

revoke all on function public.auth_company_id() from public, anon;
revoke all on function public.auth_role() from public, anon;
revoke all on function public.get_my_company_id() from public, anon;
revoke all on function public.get_my_equipment() from public, anon;
revoke all on function public.next_doc_seq(uuid, text) from public, anon;
revoke all on function public.create_invoice_with_items(jsonb, jsonb) from public, anon;
revoke all on function public.delete_company_cascade(uuid) from public, anon;
revoke all on function public.reset_employee_password(uuid, text) from public, anon;
revoke all on function public.reset_employee_email(uuid, text) from public, anon;

grant execute on function public.auth_company_id() to authenticated;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.get_my_company_id() to authenticated;
grant execute on function public.get_my_equipment() to authenticated;
grant execute on function public.next_doc_seq(uuid, text) to authenticated;
grant execute on function public.create_invoice_with_items(jsonb, jsonb) to authenticated;
grant execute on function public.delete_company_cascade(uuid) to authenticated;
grant execute on function public.reset_employee_password(uuid, text) to authenticated;
grant execute on function public.reset_employee_email(uuid, text) to authenticated;

-- Trigger functions never need direct Data API execution.
revoke all on function public.fn_auto_create_payment_voucher() from public, anon, authenticated;
revoke all on function public.fn_auto_voucher_from_expenses() from public, anon, authenticated;
revoke all on function public.fn_cleanup_field_expense_accounts() from public, anon, authenticated;
revoke all on function public.fn_sync_field_expense_to_accounts() from public, anon, authenticated;
revoke all on function public.fn_update_field_expense_sync() from public, anon, authenticated;
revoke all on function public.fn_update_inventory_stock() from public, anon, authenticated;
revoke all on function public.fn_update_price_catalog() from public, anon, authenticated;

alter function public.set_updated_at() set search_path = public;
alter function public.seed_default_accounts(uuid) set search_path = public;

notify pgrst, 'reload schema';
