-- Preventive Maintenance Automation
-- Connect approved daily meter readings to PM schedules and duplicate-safe work orders.

alter table public.pm_schedules
  add column if not exists alert_before_hours numeric(10,1) not null default 50,
  add column if not exists auto_create_job_card boolean not null default true,
  add column if not exists created_by uuid references auth.users(id);

alter table public.pm_schedules
  drop constraint if exists pm_schedules_interval_positive,
  add constraint pm_schedules_interval_positive check (interval_hours > 0),
  drop constraint if exists pm_schedules_alert_nonnegative,
  add constraint pm_schedules_alert_nonnegative check (alert_before_hours >= 0);

alter table public.maintenance_records
  add column if not exists pm_schedule_id uuid references public.pm_schedules(id) on delete set null,
  add column if not exists job_card_id uuid references public.job_cards(id) on delete set null;

create index if not exists pm_schedules_due_lookup
  on public.pm_schedules(company_id, is_active, next_due_meter, next_due_date)
  where is_active;

create index if not exists maintenance_records_pm_schedule
  on public.maintenance_records(pm_schedule_id)
  where pm_schedule_id is not null;

create unique index if not exists job_cards_one_open_pm_schedule
  on public.job_cards(pm_schedule_id)
  where pm_schedule_id is not null and status in ('open', 'in_progress');

drop policy if exists "company members can manage pm_schedules" on public.pm_schedules;
drop policy if exists pm_schedules_tenant_select on public.pm_schedules;
drop policy if exists pm_schedules_tenant_insert on public.pm_schedules;
drop policy if exists pm_schedules_tenant_update on public.pm_schedules;
drop policy if exists pm_schedules_tenant_delete on public.pm_schedules;

create policy pm_schedules_tenant_select
on public.pm_schedules for select to authenticated
using (company_id = (select public.auth_company_id()));

create policy pm_schedules_tenant_insert
on public.pm_schedules for insert to authenticated
with check (
  company_id = (select public.auth_company_id())
  and (select public.auth_role())::text in ('supervisor', 'manager', 'admin')
);

create policy pm_schedules_tenant_update
on public.pm_schedules for update to authenticated
using (
  company_id = (select public.auth_company_id())
  and (select public.auth_role())::text in ('supervisor', 'manager', 'admin')
)
with check (
  company_id = (select public.auth_company_id())
  and (select public.auth_role())::text in ('supervisor', 'manager', 'admin')
);

create policy pm_schedules_tenant_delete
on public.pm_schedules for delete to authenticated
using (
  company_id = (select public.auth_company_id())
  and (select public.auth_role())::text in ('manager', 'admin')
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.ensure_pm_job_for_schedule(p_schedule_id uuid, p_force boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_schedule public.pm_schedules%rowtype;
  v_equipment public.equipment%rowtype;
  v_existing uuid;
  v_job uuid;
  v_is_due boolean;
begin
  select * into v_schedule from public.pm_schedules where id = p_schedule_id and is_active;
  if not found then return null; end if;

  select * into v_equipment
  from public.equipment
  where id = v_schedule.equipment_id and company_id = v_schedule.company_id;
  if not found then return null; end if;

  select id into v_existing
  from public.job_cards
  where pm_schedule_id = v_schedule.id and status in ('open', 'in_progress')
  order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_is_due := p_force
    or (v_schedule.next_due_meter is not null and
        coalesce(v_equipment.current_meter_reading, 0) >=
          v_schedule.next_due_meter - v_schedule.alert_before_hours)
    or (v_schedule.next_due_date is not null and v_schedule.next_due_date <= current_date + 14);

  if not v_is_due then return null; end if;

  insert into public.job_cards (
    company_id, jc_number, equipment_id, equipment_name, pm_schedule_id,
    jc_type, status, complaint, opened_date, meter_at_open, created_by
  ) values (
    v_schedule.company_id, '', v_equipment.id, v_equipment.name, v_schedule.id,
    'pm_service', 'open',
    v_schedule.schedule_name || ' due at ' || coalesce(v_schedule.next_due_meter::text || ' hrs', v_schedule.next_due_date::text, 'scheduled interval'),
    current_date, v_equipment.current_meter_reading, auth.uid()
  ) returning id into v_job;

  insert into public.maintenance_records (
    company_id, equipment_id, maintenance_type, description, meter_at_service,
    service_date, status, priority, project_id, client_id, created_by,
    pm_schedule_id, job_card_id
  ) values (
    v_schedule.company_id, v_equipment.id, 'preventive', v_schedule.schedule_name,
    v_equipment.current_meter_reading, current_date, 'open',
    case
      when v_schedule.next_due_meter is not null and coalesce(v_equipment.current_meter_reading, 0) >= v_schedule.next_due_meter then 'high'
      when v_schedule.next_due_date is not null and v_schedule.next_due_date <= current_date then 'high'
      else 'normal'
    end,
    v_equipment.current_project_id, v_equipment.current_client_id, auth.uid(),
    v_schedule.id, v_job
  );

  return v_job;
exception
  when unique_violation then
    select id into v_existing
    from public.job_cards
    where pm_schedule_id = p_schedule_id and status in ('open', 'in_progress')
    order by created_at desc limit 1;
    return v_existing;
end;
$$;

revoke all on function private.ensure_pm_job_for_schedule(uuid, boolean) from public, anon, authenticated;

create or replace function private.sync_pm_jobs_for_equipment(p_equipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_schedule_id uuid;
begin
  for v_schedule_id in
    select ps.id
    from public.pm_schedules ps
    where ps.equipment_id = p_equipment_id
      and ps.is_active
      and ps.auto_create_job_card
  loop
    perform private.ensure_pm_job_for_schedule(v_schedule_id, false);
  end loop;
end;
$$;

revoke all on function private.sync_pm_jobs_for_equipment(uuid) from public, anon, authenticated;

create or replace function public.sync_pm_jobs_after_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.is_active and new.auto_create_job_card then
    perform private.ensure_pm_job_for_schedule(new.id, false);
  end if;
  return new;
end;
$$;

create or replace function public.prepare_pm_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_equipment public.equipment%rowtype;
begin
  select * into v_equipment
  from public.equipment
  where id = new.equipment_id and company_id = new.company_id;
  if not found then raise exception 'Equipment not found in this company'; end if;

  new.equipment_name := v_equipment.name;
  new.created_by := coalesce(new.created_by, auth.uid());
  new.last_done_meter := coalesce(new.last_done_meter, v_equipment.current_meter_reading, 0);
  new.next_due_meter := coalesce(new.next_due_meter, new.last_done_meter + new.interval_hours);
  return new;
end;
$$;

drop trigger if exists prepare_pm_schedule_values on public.pm_schedules;
create trigger prepare_pm_schedule_values
before insert or update of equipment_id, company_id, interval_hours, last_done_meter, next_due_meter
on public.pm_schedules
for each row execute function public.prepare_pm_schedule();

drop trigger if exists sync_pm_jobs_after_schedule_change on public.pm_schedules;
create trigger sync_pm_jobs_after_schedule_change
after insert or update of next_due_meter, next_due_date, alert_before_hours, auto_create_job_card, is_active
on public.pm_schedules
for each row execute function public.sync_pm_jobs_after_schedule_change();

create or replace function public.sync_approved_daily_log_meter()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.workflow_status = 'approved'
     and new.equipment_id is not null
     and new.meter_reading is not null
     and (tg_op = 'INSERT' or old.workflow_status is distinct from 'approved' or old.meter_reading is distinct from new.meter_reading) then
    update public.equipment
    set current_meter_reading = greatest(coalesce(current_meter_reading, 0), new.meter_reading),
        updated_at = now()
    where id = new.equipment_id and company_id = new.company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_approved_daily_log_meter on public.daily_operations;
create trigger sync_approved_daily_log_meter
after insert or update of workflow_status, meter_reading on public.daily_operations
for each row execute function public.sync_approved_daily_log_meter();

create or replace function public.sync_pm_jobs_after_meter_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.current_meter_reading is distinct from old.current_meter_reading then
    perform private.sync_pm_jobs_for_equipment(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_pm_jobs_after_meter_change on public.equipment;
create trigger sync_pm_jobs_after_meter_change
after update of current_meter_reading on public.equipment
for each row execute function public.sync_pm_jobs_after_meter_change();

create or replace function public.open_pm_job(p_schedule_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_schedule public.pm_schedules%rowtype;
begin
  if auth.uid() is null or public.auth_role()::text not in ('supervisor', 'manager', 'admin') then
    raise exception 'Maintenance permission denied' using errcode = '42501';
  end if;

  select * into v_schedule
  from public.pm_schedules
  where id = p_schedule_id and company_id = public.auth_company_id();
  if not found then raise exception 'PM schedule not found'; end if;

  return private.ensure_pm_job_for_schedule(v_schedule.id, true);
end;
$$;

revoke all on function public.open_pm_job(uuid) from public, anon;
grant execute on function public.open_pm_job(uuid) to authenticated;

create or replace function public.complete_pm_job(
  p_job_card_id uuid,
  p_meter numeric,
  p_work_done text default null,
  p_technician_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job public.job_cards%rowtype;
  v_schedule public.pm_schedules%rowtype;
  v_meter numeric;
begin
  if auth.uid() is null or public.auth_role()::text not in ('supervisor', 'manager', 'admin') then
    raise exception 'Maintenance permission denied' using errcode = '42501';
  end if;

  select * into v_job
  from public.job_cards
  where id = p_job_card_id and company_id = public.auth_company_id()
  for update;
  if not found then raise exception 'PM job card not found'; end if;
  if v_job.pm_schedule_id is null then raise exception 'Job card is not linked to a PM schedule'; end if;

  select * into v_schedule from public.pm_schedules where id = v_job.pm_schedule_id for update;
  v_meter := coalesce(p_meter, v_job.meter_at_open, 0);
  if v_meter < coalesce(v_schedule.last_done_meter, 0) then
    raise exception 'Completion meter cannot be below the last service meter';
  end if;

  update public.job_cards
  set status = 'closed', closed_date = current_date,
      work_done = coalesce(nullif(trim(p_work_done), ''), work_done, v_schedule.schedule_name),
      technician_name = coalesce(nullif(trim(p_technician_name), ''), technician_name),
      updated_at = now()
  where id = v_job.id;

  update public.maintenance_records
  set status = 'completed', completed_date = current_date, service_date = current_date,
      meter_at_service = v_meter,
      technician_name = coalesce(nullif(trim(p_technician_name), ''), technician_name),
      description = coalesce(nullif(trim(p_work_done), ''), description)
  where job_card_id = v_job.id;

  update public.pm_schedules
  set last_done_meter = v_meter,
      last_done_date = current_date,
      next_due_meter = v_meter + interval_hours,
      next_due_date = null,
      updated_at = now()
  where id = v_schedule.id;

  update public.equipment
  set last_service_meter = v_meter,
      last_service_date = current_date,
      service_interval_hrs = v_schedule.interval_hours,
      next_service_meter = v_meter + v_schedule.interval_hours,
      status = case when status = 'maintenance' then 'idle'::public.equipment_status else status end,
      updated_at = now()
  where id = v_job.equipment_id and company_id = v_job.company_id;

  return jsonb_build_object(
    'job_card_id', v_job.id,
    'schedule_id', v_schedule.id,
    'next_due_meter', v_meter + v_schedule.interval_hours
  );
end;
$$;

revoke all on function public.complete_pm_job(uuid, numeric, text, text) from public, anon;
grant execute on function public.complete_pm_job(uuid, numeric, text, text) to authenticated;

insert into public.pm_schedules (
  company_id, equipment_id, equipment_name, schedule_name, interval_hours,
  last_done_meter, last_done_date, next_due_meter, next_due_date,
  alert_before_hours, auto_create_job_card, notes
)
select
  e.company_id, e.id, e.name,
  'Standard ' || trim(to_char(round(coalesce(e.service_interval_hrs, 250)), 'FM999999990')) || ' hr Service',
  coalesce(e.service_interval_hrs, 250),
  coalesce(e.last_service_meter, e.current_meter_reading, 0),
  e.last_service_date,
  coalesce(
    e.next_service_meter,
    coalesce(e.last_service_meter, e.current_meter_reading, 0) + coalesce(e.service_interval_hrs, 250)
  ),
  e.next_service_date,
  least(50, coalesce(e.service_interval_hrs, 250) / 4),
  true,
  case when e.last_service_meter is null
    then 'Baseline created from the current equipment meter. Confirm the last service meter before relying on due alerts.'
    else null end
from public.equipment e
where e.status <> 'disposed'
  and coalesce(e.service_interval_hrs, 250) > 0
  and not exists (
    select 1 from public.pm_schedules ps
    where ps.equipment_id = e.id and ps.is_active
  );

notify pgrst, 'reload schema';
