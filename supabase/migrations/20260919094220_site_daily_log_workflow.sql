-- Site Daily Log & Compliance Workflow
-- One authoritative record per machine/date/shift, with submit/review locking.

alter table public.daily_operations
  add column if not exists workflow_status text not null default 'draft',
  add column if not exists meter_reading numeric(12,2),
  add column if not exists meter_photo_url text,
  add column if not exists logsheet_photo_url text,
  add column if not exists entry_source text not null default 'manual',
  add column if not exists submitted_by uuid references auth.users(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.daily_operations
  drop constraint if exists daily_operations_workflow_status_check,
  add constraint daily_operations_workflow_status_check
    check (workflow_status in ('draft', 'submitted', 'approved', 'rejected')),
  drop constraint if exists daily_operations_entry_source_check,
  add constraint daily_operations_entry_source_check
    check (entry_source in ('manual', 'site_log', 'status_update', 'shift_close')),
  drop constraint if exists daily_operations_nonnegative_usage_check,
  add constraint daily_operations_nonnegative_usage_check
    check (
      coalesce(running_hours, 0) >= 0 and coalesce(running_hours, 0) <= 24
      and coalesce(kilometer_run, 0) >= 0
      and coalesce(trip_count, 0) >= 0
      and coalesce(fuel_consumed, 0) >= 0
      and coalesce(material_moved, 0) >= 0
      and coalesce(meter_reading, 0) >= 0
    );

create unique index if not exists daily_operations_machine_shift_unique
  on public.daily_operations(company_id, equipment_id, ops_date, shift_type)
  where equipment_id is not null;

create index if not exists daily_operations_review_queue
  on public.daily_operations(company_id, workflow_status, ops_date desc);

create or replace function public.guard_daily_operation_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text := coalesce(public.auth_role()::text, '');
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    elsif old.workflow_status = 'approved' and v_role not in ('admin', 'manager') then
      raise exception 'Approved daily logs are locked' using errcode = '42501';
    end if;

    if new.workflow_status = 'submitted' then
      if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.workflow_status is distinct from 'submitted') then
        new.submitted_by := auth.uid();
        new.submitted_at := now();
        new.reviewed_by := null;
        new.reviewed_at := null;
        new.review_note := null;
      end if;
    end if;

    if new.workflow_status in ('approved', 'rejected') then
      if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.workflow_status is distinct from new.workflow_status) then
        if v_role not in ('admin', 'manager') then
          raise exception 'Manager or admin approval required' using errcode = '42501';
        end if;
        new.reviewed_by := auth.uid();
        new.reviewed_at := now();
      end if;
    end if;
  end if;

  if new.status = 'idle' and new.idle_reason is null then
    raise exception 'Idle reason is required for idle equipment';
  end if;
  if new.status <> 'idle' then new.idle_reason := null; end if;
  return new;
end;
$$;

drop trigger if exists daily_operation_workflow_guard on public.daily_operations;
create trigger daily_operation_workflow_guard
before insert or update on public.daily_operations
for each row execute function public.guard_daily_operation_workflow();

drop policy if exists "company members can manage daily_operations" on public.daily_operations;
drop policy if exists daily_operations_tenant_select on public.daily_operations;
drop policy if exists daily_operations_tenant_insert on public.daily_operations;
drop policy if exists daily_operations_tenant_update on public.daily_operations;
drop policy if exists daily_operations_tenant_delete on public.daily_operations;

create policy daily_operations_tenant_select
on public.daily_operations for select to authenticated
using (company_id = (select public.auth_company_id()));

create policy daily_operations_tenant_insert
on public.daily_operations for insert to authenticated
with check (
  company_id = (select public.auth_company_id())
  and created_by = (select auth.uid())
  and (select public.auth_role())::text in ('operator', 'supervisor', 'manager', 'admin')
);

create policy daily_operations_tenant_update
on public.daily_operations for update to authenticated
using (
  company_id = (select public.auth_company_id())
  and (
    (select public.auth_role())::text in ('manager', 'admin')
    or (created_by = (select auth.uid()) and workflow_status in ('draft', 'rejected'))
  )
)
with check (
  company_id = (select public.auth_company_id())
  and (
    (select public.auth_role())::text in ('manager', 'admin')
    or (created_by = (select auth.uid()) and workflow_status in ('draft', 'submitted', 'rejected'))
  )
);

create policy daily_operations_tenant_delete
on public.daily_operations for delete to authenticated
using (
  company_id = (select public.auth_company_id())
  and (
    (select public.auth_role())::text in ('manager', 'admin')
    or (created_by = (select auth.uid()) and workflow_status = 'draft')
  )
);

create or replace function public.save_daily_log_batch(p_entries jsonb, p_submit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company_id();
  v_role text := coalesce(public.auth_role()::text, '');
  v_entry jsonb;
  v_equipment public.equipment%rowtype;
  v_project_id uuid;
  v_date date;
  v_shift text;
  v_status text;
  v_idle_reason text;
  v_saved_id uuid;
  v_count integer := 0;
  v_workflow text := case when p_submit then 'submitted' else 'draft' end;
begin
  if auth.uid() is null or v_company is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_role not in ('operator', 'supervisor', 'manager', 'admin') then
    raise exception 'Daily log permission denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0
     or jsonb_array_length(p_entries) > 100 then
    raise exception 'Submit between 1 and 100 daily log entries';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    select * into v_equipment
    from public.equipment
    where id = (v_entry ->> 'equipment_id')::uuid and company_id = v_company;
    if not found then raise exception 'Equipment not found in your company'; end if;

    v_date := coalesce(nullif(v_entry ->> 'ops_date', '')::date, current_date);
    v_shift := coalesce(nullif(v_entry ->> 'shift_type', ''), 'general');
    v_status := coalesce(nullif(v_entry ->> 'status', ''), 'working');
    v_idle_reason := nullif(v_entry ->> 'idle_reason', '');
    v_project_id := nullif(v_entry ->> 'project_id', '')::uuid;

    if v_date > current_date then raise exception 'Future daily logs are not allowed'; end if;
    if v_date < current_date - 31 and v_role not in ('manager', 'admin') then
      raise exception 'Only managers can enter logs older than 31 days';
    end if;
    if v_shift not in ('day', 'night', 'general') then raise exception 'Invalid shift'; end if;
    if v_status not in ('working', 'idle', 'breakdown', 'maintenance') then raise exception 'Invalid equipment status'; end if;
    if v_status = 'idle' and v_idle_reason is null then raise exception 'Idle reason is required for %', v_equipment.name; end if;
    if v_project_id is not null and not exists (
      select 1 from public.projects where id = v_project_id and company_id = v_company
    ) then raise exception 'Project not found in your company'; end if;

    v_saved_id := null;
    insert into public.daily_operations (
      company_id, ops_date, shift_type, equipment_id, equipment_name, equipment_type,
      project_id, status, running_hours, kilometer_run, trip_count, fuel_consumed,
      material_moved, meter_reading, operator_name, activity, idle_reason, notes,
      meter_photo_url, logsheet_photo_url, entry_source, workflow_status, created_by
    ) values (
      v_company, v_date, v_shift, v_equipment.id, v_equipment.name, v_equipment.category,
      v_project_id, v_status,
      nullif(v_entry ->> 'running_hours', '')::numeric,
      nullif(v_entry ->> 'kilometer_run', '')::numeric,
      nullif(v_entry ->> 'trip_count', '')::integer,
      nullif(v_entry ->> 'fuel_consumed', '')::numeric,
      nullif(v_entry ->> 'material_moved', '')::numeric,
      nullif(v_entry ->> 'meter_reading', '')::numeric,
      nullif(trim(v_entry ->> 'operator_name'), ''),
      nullif(trim(v_entry ->> 'activity'), ''),
      v_idle_reason,
      nullif(trim(v_entry ->> 'notes'), ''),
      nullif(v_entry ->> 'meter_photo_url', ''),
      nullif(v_entry ->> 'logsheet_photo_url', ''),
      'site_log', v_workflow, auth.uid()
    )
    on conflict (company_id, equipment_id, ops_date, shift_type) where equipment_id is not null
    do update set
      project_id = excluded.project_id,
      status = excluded.status,
      running_hours = excluded.running_hours,
      kilometer_run = excluded.kilometer_run,
      trip_count = excluded.trip_count,
      fuel_consumed = excluded.fuel_consumed,
      material_moved = excluded.material_moved,
      meter_reading = excluded.meter_reading,
      operator_name = excluded.operator_name,
      activity = excluded.activity,
      idle_reason = excluded.idle_reason,
      notes = excluded.notes,
      meter_photo_url = coalesce(excluded.meter_photo_url, public.daily_operations.meter_photo_url),
      logsheet_photo_url = coalesce(excluded.logsheet_photo_url, public.daily_operations.logsheet_photo_url),
      entry_source = 'site_log',
      workflow_status = excluded.workflow_status,
      updated_at = now()
    where public.daily_operations.workflow_status <> 'approved'
      and (
        v_role in ('manager', 'admin')
        or (
          public.daily_operations.created_by = auth.uid()
          and public.daily_operations.workflow_status in ('draft', 'rejected')
        )
      )
    returning id into v_saved_id;

    if v_saved_id is null then
      raise exception '% already has a submitted or approved log for this shift', v_equipment.name;
    end if;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('saved', v_count, 'workflow_status', v_workflow);
end;
$$;

create or replace function public.review_daily_logs(p_ids uuid[], p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company_id();
  v_count integer;
begin
  if auth.uid() is null or public.auth_role()::text not in ('manager', 'admin') then
    raise exception 'Manager or admin approval required' using errcode = '42501';
  end if;
  if p_action not in ('approved', 'rejected') then raise exception 'Invalid review action'; end if;
  if p_action = 'rejected' and nullif(trim(p_note), '') is null then
    raise exception 'A return reason is required';
  end if;

  update public.daily_operations
  set workflow_status = p_action,
      review_note = nullif(trim(p_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where company_id = v_company and id = any(p_ids) and workflow_status = 'submitted';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'No submitted daily logs were available to review'; end if;
  return jsonb_build_object('reviewed', v_count, 'workflow_status', p_action);
end;
$$;

revoke all on function public.save_daily_log_batch(jsonb, boolean) from public, anon;
revoke all on function public.review_daily_logs(uuid[], text, text) from public, anon;
grant execute on function public.save_daily_log_batch(jsonb, boolean) to authenticated;
grant execute on function public.review_daily_logs(uuid[], text, text) to authenticated;
revoke all on function public.guard_daily_operation_workflow() from public, anon, authenticated;

-- Restrict uploads to the authenticated user's company folder. Existing app
-- paths already begin with company_id, so this tightens access without changing URLs.
drop policy if exists "Authenticated uploads" on storage.objects;
drop policy if exists authenticated_upload on storage.objects;
create policy daily_log_company_photo_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'nhance-photos'
  and (storage.foldername(name))[1] = (select public.auth_company_id())::text
);

notify pgrst, 'reload schema';
