-- Consolidated workshop execution for PM, breakdown, repair and inspection jobs.
-- `status` remains the coarse legacy state used by existing screens while
-- `workflow_stage` drives the detailed workshop board.

alter table public.job_cards
  add column if not exists workflow_stage text not null default 'open',
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists breakdown_alert_id uuid references public.breakdown_alerts(id) on delete set null,
  add column if not exists incident_id uuid references public.shift_incidents(id) on delete set null,
  add column if not exists priority text not null default 'normal',
  add column if not exists failure_code text,
  add column if not exists failed_component text,
  add column if not exists root_cause text,
  add column if not exists corrective_action text,
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists acknowledged_at timestamptz,
  add column if not exists assigned_at timestamptz,
  add column if not exists work_started_at timestamptz,
  add column if not exists repair_completed_at timestamptz,
  add column if not exists tested_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists sla_due_at timestamptz,
  add column if not exists meter_at_close numeric(12,1),
  add column if not exists external_cost numeric(12,2) not null default 0,
  add column if not exists production_loss numeric(12,2) not null default 0,
  add column if not exists test_result text not null default 'pending',
  add column if not exists completion_checklist jsonb not null default '{"guards_fitted":false,"leaks_checked":false,"trial_completed":false,"site_released":false}'::jsonb,
  add column if not exists supervisor_notes text,
  add column if not exists approved_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists approved_by_name text,
  add column if not exists cancelled_reason text;

update public.job_cards
set workflow_stage = case
  when status = 'closed' then 'closed'
  when status = 'in_progress' then 'in_progress'
  else 'open'
end
where workflow_stage is null
   or workflow_stage not in ('open','assigned','awaiting_parts','in_progress','testing','pending_approval','closed','cancelled');

update public.job_cards jc
set project_id = e.current_project_id
from public.equipment e
where e.id = jc.equipment_id and jc.project_id is null;

update public.job_cards
set opened_at = opened_date::timestamptz
where opened_date is not null;

do $$ begin
  alter table public.job_cards
    add constraint job_cards_workflow_stage_check
    check (workflow_stage in ('open','assigned','awaiting_parts','in_progress','testing','pending_approval','closed','cancelled'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.job_cards
    add constraint job_cards_priority_workshop_check
    check (priority in ('low','normal','high','critical'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.job_cards
    add constraint job_cards_test_result_check
    check (test_result in ('pending','passed','failed'));
exception when duplicate_object then null;
end $$;

create index if not exists job_cards_workshop_board
  on public.job_cards(company_id, workflow_stage, opened_at desc);
create index if not exists job_cards_workshop_sla
  on public.job_cards(company_id, sla_due_at)
  where workflow_stage not in ('closed','cancelled');
create index if not exists job_cards_project
  on public.job_cards(project_id)
  where project_id is not null;
create index if not exists job_cards_breakdown_alert
  on public.job_cards(breakdown_alert_id)
  where breakdown_alert_id is not null;

alter table public.job_card_parts
  add column if not exists store_id uuid references public.stores(id) on delete set null,
  add column if not exists quantity_requested numeric(10,3),
  add column if not exists quantity_issued numeric(10,3) not null default 0,
  add column if not exists issue_status text not null default 'manual',
  add column if not exists stock_transaction_id uuid references public.stock_transactions(id) on delete set null,
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references auth.users(id) on delete set null;

update public.job_card_parts
set quantity_requested = coalesce(quantity_requested, quantity),
    quantity_issued = case when quantity_issued = 0 then quantity else quantity_issued end,
    issue_status = case when inventory_item_id is null then 'manual' else 'issued' end
where quantity_requested is null;

alter table public.job_card_parts
  alter column quantity_requested set default 1,
  alter column quantity_requested set not null;

do $$ begin
  alter table public.job_card_parts
    add constraint job_card_parts_issue_status_check
    check (issue_status in ('requested','partially_issued','issued','manual','returned'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.job_card_parts
    add constraint job_card_parts_inventory_item_fkey
    foreign key (inventory_item_id) references public.inventory_items(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists public.job_card_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  event_type text not null,
  from_stage text,
  to_stage text,
  notes text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists job_card_events_job_time
  on public.job_card_events(job_card_id, created_at desc);

alter table public.job_card_events enable row level security;
revoke all on table public.job_card_events from anon, authenticated;
grant select, insert on table public.job_card_events to authenticated;

drop policy if exists "company members read job card events" on public.job_card_events;
create policy "company members read job card events"
  on public.job_card_events for select to authenticated
  using (company_id = public.auth_company_id());
drop policy if exists "company members add job card events" on public.job_card_events;
create policy "company members add job card events"
  on public.job_card_events for insert to authenticated
  with check (company_id = public.auth_company_id());

create table if not exists public.job_card_part_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  job_card_part_id uuid not null references public.job_card_parts(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  store_id uuid not null references public.stores(id),
  stock_transaction_id uuid not null references public.stock_transactions(id),
  quantity numeric(10,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0,
  total_cost numeric(12,2) generated always as (round(quantity * unit_cost, 2)) stored,
  issued_by uuid references auth.users(id) on delete set null,
  issued_by_name text,
  issued_at timestamptz not null default now()
);

create index if not exists job_card_part_issues_job_time
  on public.job_card_part_issues(job_card_id, issued_at desc);

alter table public.job_card_part_issues enable row level security;
revoke all on table public.job_card_part_issues from anon, authenticated;
grant select, insert on table public.job_card_part_issues to authenticated;

drop policy if exists "company members read job card part issues" on public.job_card_part_issues;
create policy "company members read job card part issues"
  on public.job_card_part_issues for select to authenticated
  using (company_id = public.auth_company_id());
drop policy if exists "company members add job card part issues" on public.job_card_part_issues;
create policy "company members add job card part issues"
  on public.job_card_part_issues for insert to authenticated
  with check (company_id = public.auth_company_id());

create or replace function public._update_jc_total_cost()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.total_cost := coalesce(new.labor_cost, 0)
                  + coalesce(new.parts_cost, 0)
                  + coalesce(new.external_cost, 0);
  return new;
end;
$$;

create or replace function public._sync_jc_parts_cost()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_job_id uuid;
  v_total numeric(12,2);
begin
  v_job_id := coalesce(new.job_card_id, old.job_card_id);
  select coalesce(sum(total_cost), 0) into v_total
  from public.job_card_parts where job_card_id = v_job_id;

  update public.job_cards
  set parts_cost = v_total,
      total_cost = coalesce(labor_cost, 0) + v_total + coalesce(external_cost, 0)
  where id = v_job_id;
  return coalesce(new, old);
end;
$$;

create or replace function public.create_workshop_job(
  p_equipment_id uuid,
  p_jc_type text,
  p_complaint text,
  p_priority text default 'normal',
  p_project_id uuid default null,
  p_technician_id uuid default null,
  p_sla_due_at timestamptz default null,
  p_breakdown_alert_id uuid default null,
  p_incident_id uuid default null,
  p_meter_at_open numeric default null,
  p_pm_schedule_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_role text := public.auth_role();
  v_equipment public.equipment%rowtype;
  v_job_id uuid;
  v_existing uuid;
  v_technician_name text;
  v_alert_id uuid := p_breakdown_alert_id;
  v_incident_id uuid := p_incident_id;
  v_maintenance_type public.maintenance_type;
begin
  if auth.uid() is null or coalesce(v_role, '') not in ('supervisor','manager','admin') then
    raise exception 'Maintenance permission denied' using errcode = '42501';
  end if;
  if p_jc_type not in ('pm_service','breakdown','unscheduled','inspection') then
    raise exception 'Invalid job card type';
  end if;
  if p_priority not in ('low','normal','high','critical') then
    raise exception 'Invalid priority';
  end if;
  if nullif(trim(p_complaint), '') is null then
    raise exception 'Complaint is required';
  end if;

  select * into v_equipment
  from public.equipment
  where id = p_equipment_id and company_id = v_company_id;
  if not found then raise exception 'Equipment not found'; end if;

  if p_jc_type = 'breakdown' then
    select id into v_existing
    from public.job_cards
    where company_id = v_company_id
      and equipment_id = p_equipment_id
      and jc_type = 'breakdown'
      and status <> 'closed'
    order by created_at desc limit 1;
    if v_existing is not null then return v_existing; end if;

    if v_alert_id is null then
      select id, incident_id into v_alert_id, v_incident_id
      from public.breakdown_alerts
      where company_id = v_company_id and equipment_id = p_equipment_id and resolved_at is null
      order by reported_at desc limit 1;
    end if;
    if v_incident_id is null then
      select id into v_incident_id
      from public.shift_incidents
      where company_id = v_company_id and equipment_id = p_equipment_id
        and incident_type = 'breakdown' and not resolved
      order by incident_time desc limit 1;
    end if;
  end if;

  if p_technician_id is not null then
    select full_name into v_technician_name
    from public.user_profiles
    where id = p_technician_id and company_id = v_company_id and is_active;
    if v_technician_name is null then raise exception 'Technician not found'; end if;
  end if;

  insert into public.job_cards (
    company_id, jc_number, equipment_id, equipment_name, pm_schedule_id,
    jc_type, status, workflow_stage, complaint, technician_id, technician_name,
    opened_date, opened_at, meter_at_open, project_id, breakdown_alert_id,
    incident_id, priority, sla_due_at, assigned_at, created_by
  ) values (
    v_company_id, '', v_equipment.id, v_equipment.name, p_pm_schedule_id,
    p_jc_type, 'open', case when p_technician_id is null then 'open' else 'assigned' end,
    trim(p_complaint), p_technician_id, v_technician_name,
    current_date, now(), coalesce(p_meter_at_open, v_equipment.current_meter_reading),
    coalesce(p_project_id, v_equipment.current_project_id), v_alert_id,
    v_incident_id, p_priority, p_sla_due_at,
    case when p_technician_id is null then null else now() end, auth.uid()
  ) returning id into v_job_id;

  v_maintenance_type := case
    when p_jc_type = 'pm_service' then 'preventive'::public.maintenance_type
    when p_jc_type in ('breakdown','unscheduled') then 'breakdown'::public.maintenance_type
    else 'preventive'::public.maintenance_type
  end;

  insert into public.maintenance_records (
    company_id, equipment_id, maintenance_type, description, meter_at_service,
    service_date, status, priority, project_id, client_id, created_by,
    pm_schedule_id, job_card_id
  ) values (
    v_company_id, v_equipment.id, v_maintenance_type, trim(p_complaint),
    coalesce(p_meter_at_open, v_equipment.current_meter_reading), current_date,
    'open', p_priority, coalesce(p_project_id, v_equipment.current_project_id),
    v_equipment.current_client_id, auth.uid(), p_pm_schedule_id, v_job_id
  );

  update public.equipment
  set status = case
    when p_jc_type = 'breakdown' then 'breakdown'::public.equipment_status
    else status
  end,
  updated_at = now()
  where id = v_equipment.id;

  insert into public.job_card_events (
    company_id, job_card_id, event_type, to_stage, notes, actor_id, actor_name
  ) values (
    v_company_id, v_job_id, 'created',
    case when p_technician_id is null then 'open' else 'assigned' end,
    trim(p_complaint), auth.uid(),
    (select full_name from public.user_profiles where id = auth.uid())
  );

  return v_job_id;
end;
$$;

create or replace function public.transition_workshop_job(
  p_job_card_id uuid,
  p_stage text,
  p_note text default null,
  p_meter_at_close numeric default null,
  p_test_result text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job public.job_cards%rowtype;
  v_role text := public.auth_role();
  v_actor_name text;
  v_status text;
  v_maintenance_type public.maintenance_type;
  v_meter numeric;
  v_from_stage text;
begin
  if auth.uid() is null or coalesce(v_role, '') not in ('supervisor','manager','admin') then
    raise exception 'Maintenance permission denied' using errcode = '42501';
  end if;
  if p_stage not in ('open','assigned','awaiting_parts','in_progress','testing','pending_approval','closed','cancelled') then
    raise exception 'Invalid workshop stage';
  end if;

  select * into v_job
  from public.job_cards
  where id = p_job_card_id and company_id = public.auth_company_id()
  for update;
  if not found then raise exception 'Job card not found'; end if;
  v_from_stage := v_job.workflow_stage;
  if v_job.workflow_stage in ('closed','cancelled') and p_stage <> v_job.workflow_stage then
    raise exception 'Closed or cancelled jobs cannot be reopened';
  end if;
  if p_stage = 'pending_approval'
     and (nullif(trim(v_job.diagnosis), '') is null or nullif(trim(v_job.work_done), '') is null) then
    raise exception 'Diagnosis and work completed are required before approval';
  end if;
  if p_stage = 'closed' and v_role not in ('manager','admin') then
    raise exception 'Manager approval is required to close the job' using errcode = '42501';
  end if;
  if p_stage = 'closed' and coalesce(p_test_result, v_job.test_result) <> 'passed' then
    raise exception 'A passed test result is required before release';
  end if;
  if p_stage = 'closed' and v_job.pm_schedule_id is not null
     and coalesce(p_meter_at_close, v_job.meter_at_close) is null then
    raise exception 'Completion meter is required for PM closure';
  end if;

  select full_name into v_actor_name from public.user_profiles where id = auth.uid();
  v_status := case
    when p_stage in ('closed','cancelled') then 'closed'
    when p_stage in ('in_progress','testing','pending_approval') then 'in_progress'
    else 'open'
  end;

  update public.job_cards
  set workflow_stage = p_stage,
      status = v_status,
      acknowledged_at = case when p_stage <> 'open' then coalesce(acknowledged_at, now()) else acknowledged_at end,
      assigned_at = case when p_stage = 'assigned' then coalesce(assigned_at, now()) else assigned_at end,
      work_started_at = case when p_stage = 'in_progress' then coalesce(work_started_at, now()) else work_started_at end,
      repair_completed_at = case when p_stage = 'testing' then coalesce(repair_completed_at, now()) else repair_completed_at end,
      tested_at = case when p_stage in ('pending_approval','closed') then coalesce(tested_at, now()) else tested_at end,
      approved_at = case when p_stage = 'closed' then coalesce(approved_at, now()) else approved_at end,
      released_at = case when p_stage = 'closed' then coalesce(released_at, now()) else released_at end,
      closed_date = case when p_stage in ('closed','cancelled') then current_date else closed_date end,
      meter_at_close = coalesce(p_meter_at_close, meter_at_close),
      test_result = coalesce(p_test_result, test_result),
      supervisor_notes = coalesce(nullif(trim(p_note), ''), supervisor_notes),
      approved_by = case when p_stage = 'closed' then auth.uid() else approved_by end,
      approved_by_name = case when p_stage = 'closed' then v_actor_name else approved_by_name end,
      cancelled_reason = case when p_stage = 'cancelled' then nullif(trim(p_note), '') else cancelled_reason end,
      downtime_hours = case
        when p_stage = 'closed' and coalesce(downtime_hours, 0) = 0
          then round((extract(epoch from (now() - opened_at)) / 3600)::numeric, 2)
        else downtime_hours
      end,
      updated_at = now()
  where id = v_job.id;

  select * into v_job from public.job_cards where id = p_job_card_id;

  if p_stage not in ('closed','cancelled') then
    update public.equipment
    set status = case
      when v_job.jc_type = 'breakdown' and p_stage in ('open','assigned','awaiting_parts')
        then 'breakdown'::public.equipment_status
      when p_stage in ('in_progress','testing','pending_approval')
        then 'maintenance'::public.equipment_status
      else status
    end,
    updated_at = now()
    where id = v_job.equipment_id and company_id = v_job.company_id;
  elsif p_stage = 'closed' then
    update public.equipment
    set status = case when status in ('breakdown','maintenance') then 'idle'::public.equipment_status else status end,
        updated_at = now()
    where id = v_job.equipment_id and company_id = v_job.company_id;

    v_maintenance_type := case
      when v_job.jc_type = 'pm_service' then 'preventive'::public.maintenance_type
      when v_job.jc_type in ('breakdown','unscheduled') then 'breakdown'::public.maintenance_type
      else 'preventive'::public.maintenance_type
    end;

    update public.maintenance_records
    set status = 'completed', completed_date = current_date, service_date = current_date,
        description = coalesce(nullif(trim(v_job.work_done), ''), description),
        meter_at_service = coalesce(v_job.meter_at_close, v_job.meter_at_open, meter_at_service),
        technician_name = coalesce(v_job.technician_name, technician_name),
        labour_cost = coalesce(v_job.labor_cost, 0), total_cost = coalesce(v_job.total_cost, 0),
        downtime_hours = coalesce(v_job.downtime_hours, 0), priority = v_job.priority,
        project_id = coalesce(v_job.project_id, project_id),
        notes = concat_ws(E'\n', notes, v_job.root_cause, v_job.corrective_action)
    where job_card_id = v_job.id;

    if not found then
      insert into public.maintenance_records (
        company_id, equipment_id, maintenance_type, description, meter_at_service,
        service_date, completed_date, done_by, technician_name, labour_cost,
        total_cost, downtime_hours, status, created_by, project_id, notes,
        priority, pm_schedule_id, job_card_id
      ) values (
        v_job.company_id, v_job.equipment_id, v_maintenance_type,
        coalesce(nullif(trim(v_job.work_done), ''), nullif(trim(v_job.complaint), ''), 'Workshop repair'),
        coalesce(v_job.meter_at_close, v_job.meter_at_open), current_date, current_date,
        coalesce(v_job.done_by, 'inhouse'), v_job.technician_name,
        coalesce(v_job.labor_cost, 0), coalesce(v_job.total_cost, 0),
        coalesce(v_job.downtime_hours, 0), 'completed', auth.uid(), v_job.project_id,
        concat_ws(E'\n', v_job.root_cause, v_job.corrective_action), v_job.priority,
        v_job.pm_schedule_id, v_job.id
      );
    end if;

    if v_job.pm_schedule_id is not null then
      v_meter := coalesce(v_job.meter_at_close, p_meter_at_close, v_job.meter_at_open, 0);
      update public.pm_schedules
      set last_done_meter = v_meter, last_done_date = current_date,
          next_due_meter = v_meter + interval_hours, next_due_date = null, updated_at = now()
      where id = v_job.pm_schedule_id and company_id = v_job.company_id;
      update public.equipment e
      set last_service_meter = v_meter, last_service_date = current_date,
          service_interval_hrs = ps.interval_hours,
          next_service_meter = v_meter + ps.interval_hours, updated_at = now()
      from public.pm_schedules ps
      where e.id = v_job.equipment_id and ps.id = v_job.pm_schedule_id;
    end if;

    update public.breakdown_alerts
    set resolved_at = coalesce(resolved_at, now()), resolved_by_name = coalesce(resolved_by_name, v_actor_name)
    where company_id = v_job.company_id and resolved_at is null
      and (id = v_job.breakdown_alert_id
           or (v_job.breakdown_alert_id is null and equipment_id = v_job.equipment_id));

    update public.shift_incidents
    set resolved = true, resolved_at = coalesce(resolved_at, now()), resolved_by = coalesce(resolved_by, auth.uid()),
        action_taken = coalesce(nullif(trim(v_job.corrective_action), ''), nullif(trim(v_job.work_done), ''), action_taken)
    where company_id = v_job.company_id and not resolved
      and (id = v_job.incident_id
           or (v_job.incident_id is null and equipment_id = v_job.equipment_id and incident_type = 'breakdown'));
  end if;

  insert into public.job_card_events (
    company_id, job_card_id, event_type, from_stage, to_stage, notes, actor_id, actor_name
  ) values (
    v_job.company_id, v_job.id,
    case when p_stage = 'closed' then 'approved_and_closed' else 'stage_changed' end,
    v_from_stage, p_stage, nullif(trim(p_note), ''), auth.uid(), v_actor_name
  );

  return jsonb_build_object('job_card_id', v_job.id, 'stage', p_stage, 'status', v_status);
end;
$$;

create or replace function public.issue_workshop_part(
  p_job_card_part_id uuid,
  p_store_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_part public.job_card_parts%rowtype;
  v_job public.job_cards%rowtype;
  v_item public.inventory_items%rowtype;
  v_stock public.inventory_stock%rowtype;
  v_transaction_id uuid;
  v_issue_status text;
  v_actor_name text;
  v_txn_number text;
begin
  if auth.uid() is null or coalesce(public.auth_role(), '') not in ('supervisor','manager','admin') then
    raise exception 'Inventory issue permission denied' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Issue quantity must be greater than zero'; end if;

  select * into v_part from public.job_card_parts
  where id = p_job_card_part_id and company_id = public.auth_company_id()
  for update;
  if not found then raise exception 'Job card part not found'; end if;
  if v_part.inventory_item_id is null then raise exception 'Select an inventory item before issuing stock'; end if;

  select * into v_job from public.job_cards
  where id = v_part.job_card_id and company_id = v_part.company_id
  for update;
  if not found or v_job.status = 'closed' then raise exception 'Job card is closed or unavailable'; end if;

  select * into v_item from public.inventory_items
  where id = v_part.inventory_item_id and company_id = v_part.company_id and is_active;
  if not found then raise exception 'Inventory item not found'; end if;

  select * into v_stock from public.inventory_stock
  where company_id = v_part.company_id and item_id = v_item.id and store_id = p_store_id
  for update;
  if not found then raise exception 'No stock is recorded for this item at the selected store'; end if;
  if coalesce(v_stock.quantity_on_hand, 0) < p_quantity then
    raise exception 'Only % available at the selected store', coalesce(v_stock.quantity_on_hand, 0);
  end if;
  if coalesce(v_part.quantity_issued, 0) + p_quantity > v_part.quantity_requested then
    raise exception 'Issue quantity exceeds the requested quantity';
  end if;

  v_txn_number := 'JC-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 6);
  select full_name into v_actor_name from public.user_profiles where id = auth.uid();

  insert into public.stock_transactions (
    company_id, txn_number, txn_type, txn_date, item_id, store_id, quantity,
    unit_cost, total_cost, project_id, equipment_id, issued_to, reason, notes, created_by
  ) values (
    v_part.company_id, v_txn_number, 'out', current_date, v_item.id, p_store_id, p_quantity,
    coalesce(nullif(v_stock.avg_unit_cost, 0), v_item.avg_unit_cost, 0),
    round(p_quantity * coalesce(nullif(v_stock.avg_unit_cost, 0), v_item.avg_unit_cost, 0), 2),
    v_job.project_id, v_job.equipment_id, coalesce(v_job.technician_name, v_actor_name),
    'Workshop job card ' || v_job.jc_number, 'Issued against ' || v_job.jc_number, auth.uid()
  ) returning id into v_transaction_id;

  v_issue_status := case
    when coalesce(v_part.quantity_issued, 0) + p_quantity >= v_part.quantity_requested then 'issued'
    else 'partially_issued'
  end;

  update public.job_card_parts
  set store_id = p_store_id,
      quantity = coalesce(quantity, 0) + p_quantity,
      quantity_issued = coalesce(quantity_issued, 0) + p_quantity,
      unit_cost = coalesce(nullif(v_stock.avg_unit_cost, 0), v_item.avg_unit_cost, 0),
      issue_status = v_issue_status,
      stock_transaction_id = v_transaction_id,
      issued_at = now(), issued_by = auth.uid()
  where id = v_part.id;

  insert into public.job_card_part_issues (
    company_id, job_card_id, job_card_part_id, inventory_item_id, store_id,
    stock_transaction_id, quantity, unit_cost, issued_by, issued_by_name
  ) values (
    v_part.company_id, v_job.id, v_part.id, v_item.id, p_store_id,
    v_transaction_id, p_quantity, coalesce(nullif(v_stock.avg_unit_cost, 0), v_item.avg_unit_cost, 0),
    auth.uid(), v_actor_name
  );

  insert into public.job_card_events (
    company_id, job_card_id, event_type, from_stage, to_stage, notes, actor_id, actor_name
  ) values (
    v_part.company_id, v_job.id, 'part_issued', v_job.workflow_stage, v_job.workflow_stage,
    v_item.item_name || ' × ' || p_quantity::text, auth.uid(), v_actor_name
  );

  return jsonb_build_object(
    'job_card_id', v_job.id, 'part_id', v_part.id,
    'stock_transaction_id', v_transaction_id, 'issue_status', v_issue_status
  );
end;
$$;

revoke all on function public.create_workshop_job(uuid,text,text,text,uuid,uuid,timestamptz,uuid,uuid,numeric,uuid) from public, anon;
grant execute on function public.create_workshop_job(uuid,text,text,text,uuid,uuid,timestamptz,uuid,uuid,numeric,uuid) to authenticated;
revoke all on function public.transition_workshop_job(uuid,text,text,numeric,text) from public, anon;
grant execute on function public.transition_workshop_job(uuid,text,text,numeric,text) to authenticated;
revoke all on function public.issue_workshop_part(uuid,uuid,numeric) from public, anon;
grant execute on function public.issue_workshop_part(uuid,uuid,numeric) to authenticated;

notify pgrst, 'reload schema';
