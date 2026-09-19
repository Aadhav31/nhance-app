-- Separate reservations from actual deployments and their billing snapshots.
-- Filename matches the version recorded by the remote migration runner.
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

alter table public.equipment_deployments add column if not exists expected_return_date date;
alter table public.equipment_deployments add column if not exists planner_plan_id uuid;
alter table public.equipment_deployments add constraint planner_return_after_mobilisation
  check (expected_return_date is null or expected_return_date >= deployed_date);

create table public.equipment_deployment_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id),
  project_id uuid not null references public.projects(id),
  mobilisation_date date not null,
  expected_return_date date not null,
  actual_return_date date,
  status text not null default 'planned' check (status in ('planned','confirmed','mobilised','completed','cancelled')),
  site_name text,
  notes text,
  deployment_id uuid references public.equipment_deployments(id),
  created_by uuid default auth.uid() references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_return_date >= mobilisation_date),
  check (actual_return_date is null or actual_return_date >= mobilisation_date),
  check (status not in ('mobilised','completed') or deployment_id is not null),
  constraint planner_no_overlapping_bookings exclude using gist (
    equipment_id with =,
    daterange(mobilisation_date, expected_return_date, '[]') with &&
  ) where (status in ('planned','confirmed'))
);

alter table public.equipment_deployments add constraint equipment_deployments_planner_plan_fkey
  foreign key (planner_plan_id) references public.equipment_deployment_plans(id);
create unique index planner_one_active_deployment on public.equipment_deployments(equipment_id) where status = 'active';
create index planner_company_dates on public.equipment_deployment_plans(company_id, mobilisation_date);
create index planner_project on public.equipment_deployment_plans(project_id);
create index planner_deployment on public.equipment_deployment_plans(deployment_id);
create index planner_created_by on public.equipment_deployment_plans(created_by);
create index deployments_planner_plan on public.equipment_deployments(planner_plan_id);

alter table public.equipment_deployment_plans enable row level security;
revoke all on public.equipment_deployment_plans from anon;
revoke all on public.equipment_deployment_plans from authenticated;
grant select, insert, update on public.equipment_deployment_plans to authenticated;
create policy planner_tenant_read on public.equipment_deployment_plans for select to authenticated
  using (company_id = (select public.auth_company_id()) and (select public.auth_role()) in ('admin','manager','supervisor','accounts'));
create policy planner_manager_insert on public.equipment_deployment_plans for insert to authenticated
  with check (company_id = (select public.auth_company_id()) and created_by = (select auth.uid()) and (select public.auth_role()) in ('admin','manager'));
create policy planner_manager_update on public.equipment_deployment_plans for update to authenticated
  using (company_id = (select public.auth_company_id()) and (select public.auth_role()) in ('admin','manager'))
  with check (company_id = (select public.auth_company_id()) and (select public.auth_role()) in ('admin','manager'));

create function public.planner_validate_booking() returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  machine public.equipment%rowtype;
begin
  select * into machine from public.equipment where id = new.equipment_id and company_id = new.company_id for update;
  if not found or not exists (select 1 from public.projects where id = new.project_id and company_id = new.company_id) then
    raise exception 'Machine and project must belong to the same company' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.company_id is distinct from old.company_id or new.created_by is distinct from old.created_by) then
    raise exception 'Booking ownership cannot be changed' using errcode = '42501';
  end if;
  if new.deployment_id is not null and not exists (
    select 1 from public.equipment_deployments where id = new.deployment_id and company_id = new.company_id and equipment_id = new.equipment_id and project_id = new.project_id
  ) then raise exception 'Invalid deployment link' using errcode = '42501'; end if;
  if new.status in ('planned','confirmed') then
    if machine.status::text in ('breakdown','maintenance','disposed') then
      raise exception 'Machine is not ready for booking; resolve its breakdown/maintenance status first';
    end if;
    if exists (
      select 1 from public.equipment_deployments d where d.equipment_id = new.equipment_id and d.status = 'active'
      and daterange(new.mobilisation_date, new.expected_return_date, '[]') && daterange(d.deployed_date,
        case when d.expected_return_date < current_date then null else d.expected_return_date end, '[]')
    ) then raise exception 'Booking overlaps an active deployment; record its return date or choose another machine' using errcode = '23P01'; end if;
    if machine.current_project_id is not null and not exists (
      select 1 from public.equipment_deployments where equipment_id = machine.id and status = 'active'
    ) then raise exception 'Resolve the current site assignment before booking'; end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger validate_planner_booking before insert or update on public.equipment_deployment_plans
  for each row execute function public.planner_validate_booking();

create function public.planner_validate_deployment() returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  machine public.equipment%rowtype;
begin
  if auth.uid() is not null and (new.company_id is distinct from public.auth_company_id() or coalesce(public.auth_role(),'') not in ('admin','manager')) then
    raise exception 'Deployment management permission required' using errcode = '42501';
  end if;
  select * into machine from public.equipment where id = new.equipment_id and company_id = new.company_id for update;
  if not found or not exists (select 1 from public.projects where id = new.project_id and company_id = new.company_id)
     or not exists (select 1 from public.clients where id = new.client_id and company_id = new.company_id) then
    raise exception 'Deployment references must belong to the same company' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then raise exception 'Deployment ownership cannot be changed' using errcode = '42501'; end if;
  if new.planner_plan_id is not null and not exists (
    select 1 from public.equipment_deployment_plans where id = new.planner_plan_id and company_id = new.company_id and equipment_id = new.equipment_id and project_id = new.project_id
  ) then raise exception 'Invalid booking link' using errcode = '42501'; end if;
  if new.rate_item_id is not null and (tg_op = 'INSERT' or new.rate_item_id is distinct from old.rate_item_id or new.project_id is distinct from old.project_id) and not exists (
    select 1 from public.project_rate_items where id = new.rate_item_id and company_id = new.company_id and project_id = new.project_id
  ) then raise exception 'Rate card must belong to the deployment project' using errcode = '42501'; end if;
  if new.status = 'active' then
    if (tg_op = 'INSERT' or old.status <> 'active' or old.equipment_id is distinct from new.equipment_id)
       and machine.status::text in ('breakdown','maintenance','disposed') then raise exception 'Machine is not ready for mobilisation'; end if;
    if exists (
      select 1 from public.equipment_deployment_plans p where p.equipment_id = new.equipment_id and p.status in ('planned','confirmed')
      and p.id is distinct from new.planner_plan_id
      and daterange(new.deployed_date, case when new.expected_return_date < current_date then null else new.expected_return_date end, '[]')
        && daterange(p.mobilisation_date, p.expected_return_date, '[]')
    ) then raise exception 'Deployment dates overlap a reserved booking; set a compatible expected return date' using errcode = '23P01'; end if;
  end if;
  return new;
end;
$$;
create trigger validate_planner_deployment before insert or update of company_id, equipment_id, project_id, client_id, status, deployed_date, expected_return_date, planner_plan_id, rate_item_id
  on public.equipment_deployments for each row execute function public.planner_validate_deployment();

-- All changes are atomic and run as the signed-in caller, respecting existing RLS.
create function public.planner_deploy_equipment(p_data jsonb, p_from_deployment_id uuid default null, p_plan_id uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  machine public.equipment%rowtype;
  project public.projects%rowtype;
  existing public.equipment_deployments%rowtype;
  booking public.equipment_deployment_plans%rowtype;
  v_deployment_id uuid;
  deployment_date date := coalesce((p_data->>'deployed_date')::date, current_date);
  return_date date := (p_data->>'expected_return_date')::date;
  company uuid := public.auth_company_id();
begin
  if auth.uid() is null or coalesce(public.auth_role(),'') not in ('admin','manager') then raise exception 'Deployment management permission required' using errcode = '42501'; end if;
  select * into machine from public.equipment where id = (p_data->>'equipment_id')::uuid and company_id = company for update;
  if not found then raise exception 'Machine access denied' using errcode = '42501'; end if;
  select * into project from public.projects where id = (p_data->>'project_id')::uuid and company_id = company;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  if deployment_date > current_date or (return_date is not null and return_date < deployment_date) then raise exception 'Invalid mobilisation/return dates'; end if;
  if coalesce((p_data->>'client_id')::uuid, project.client_id) is null then raise exception 'Link the project to a client before mobilisation'; end if;
  if coalesce((p_data->>'rental_rate')::numeric,0) < 0 or coalesce((p_data->>'hour_meter_at_deployment')::numeric,0) < 0 then raise exception 'Rate and meter reading cannot be negative'; end if;
  if p_plan_id is not null then
    select * into booking from public.equipment_deployment_plans where id = p_plan_id and company_id = company and equipment_id = machine.id and project_id = project.id for update;
    if not found or booking.status not in ('planned','confirmed') then raise exception 'Booking is no longer available for mobilisation'; end if;
    return_date := booking.expected_return_date;
    if return_date < deployment_date then raise exception 'Update the booking return date before mobilisation'; end if;
  end if;
  select * into existing from public.equipment_deployments where equipment_id = machine.id and status = 'active' for update;
  if found then
    if p_from_deployment_id is distinct from existing.id then raise exception 'Machine is still deployed. Return or transfer it first'; end if;
    if deployment_date < existing.deployed_date then raise exception 'Transfer date cannot precede the current deployment'; end if;
    update public.equipment_deployments set status = 'withdrawn', withdrawn_date = deployment_date,
      tc_from_project = p_data->>'tc_from_project', tc_to_project = project.project_name,
      tc_generated_at = (p_data->>'tc_generated_at')::timestamptz where id = existing.id;
    update public.equipment_deployment_plans set status='completed', actual_return_date=deployment_date where deployment_id=existing.id and status='mobilised';
  elsif machine.current_project_id is not null then
    raise exception 'Resolve the current site assignment before mobilisation';
  elsif p_from_deployment_id is not null then
    raise exception 'Current deployment changed; refresh before transferring';
  end if;
  insert into public.equipment_deployments (
    company_id, equipment_id, project_id, client_id, deployed_date, expected_return_date, status, rental_rate, rate_unit,
    rate_item_id, item_name, billing_basis, rate_per_hour, rate_per_day, rate_per_month, max_hours_per_day, max_hours_per_month,
    working_days_per_month, ot_percentage, fuel_by_client, hour_meter_at_deployment, operator_name, site_incharge, work_order_ref,
    machine_photo_url, hour_meter_photo_url, deployment_location, notes, planner_plan_id
  ) values (
    company, machine.id, project.id, coalesce((p_data->>'client_id')::uuid, project.client_id), deployment_date, return_date, 'active',
    coalesce((p_data->>'rental_rate')::numeric,0), coalesce((p_data->>'rate_unit')::public.rate_unit,'per_hour'),
    (p_data->>'rate_item_id')::uuid, p_data->>'item_name', p_data->>'billing_basis', (p_data->>'rate_per_hour')::numeric,
    (p_data->>'rate_per_day')::numeric, (p_data->>'rate_per_month')::numeric, coalesce((p_data->>'max_hours_per_day')::numeric,8),
    coalesce((p_data->>'max_hours_per_month')::numeric,200), coalesce((p_data->>'working_days_per_month')::integer,26),
    coalesce((p_data->>'ot_percentage')::numeric,125), coalesce((p_data->>'fuel_by_client')::boolean,false),
    (p_data->>'hour_meter_at_deployment')::numeric, p_data->>'operator_name', p_data->>'site_incharge', p_data->>'work_order_ref',
    p_data->>'machine_photo_url', p_data->>'hour_meter_photo_url', p_data->>'deployment_location', p_data->>'notes', p_plan_id
  ) returning id into v_deployment_id;
  update public.equipment set current_project_id=project.id, current_client_id=coalesce((p_data->>'client_id')::uuid,project.client_id),
    current_site_name=coalesce(p_data->>'deployment_location',project.site_name), fuel_by_client=coalesce((p_data->>'fuel_by_client')::boolean,false), status='active'
    where id=machine.id;
  if p_plan_id is not null then update public.equipment_deployment_plans set status='mobilised', mobilisation_date=deployment_date, deployment_id=v_deployment_id where id=p_plan_id; end if;
  return v_deployment_id;
end;
$$;

create function public.planner_return_equipment(p_deployment_id uuid, p_return_date date)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  deployment public.equipment_deployments%rowtype;
begin
  if auth.uid() is null or coalesce(public.auth_role(),'') not in ('admin','manager') then raise exception 'Deployment management permission required' using errcode = '42501'; end if;
  select * into deployment from public.equipment_deployments where id=p_deployment_id and company_id=public.auth_company_id();
  if not found then raise exception 'Deployment access denied' using errcode = '42501'; end if;
  perform 1 from public.equipment where id=deployment.equipment_id for update;
  select * into deployment from public.equipment_deployments where id=p_deployment_id for update;
  if deployment.status <> 'active' then raise exception 'Deployment is already closed'; end if;
  if p_return_date is null or p_return_date < deployment.deployed_date or p_return_date > current_date then raise exception 'Invalid actual return date'; end if;
  update public.equipment_deployments set status='completed', withdrawn_date=p_return_date where id=p_deployment_id;
  update public.equipment set current_project_id=null,current_client_id=null,current_site_name=null,status='idle'
    where id=deployment.equipment_id and current_project_id=deployment.project_id;
  update public.equipment_deployment_plans set status='completed', actual_return_date=p_return_date where deployment_id=p_deployment_id and status='mobilised';
end;
$$;

revoke all on function public.planner_deploy_equipment(jsonb,uuid,uuid) from public,anon;
revoke all on function public.planner_return_equipment(uuid,date) from public,anon;
revoke all on function public.planner_validate_booking() from public,anon;
revoke all on function public.planner_validate_deployment() from public,anon;
grant execute on function public.planner_deploy_equipment(jsonb,uuid,uuid) to authenticated;
grant execute on function public.planner_return_equipment(uuid,date) to authenticated;

-- Older open browser sessions used to change the equipment site before inserting
-- a deployment. Reject that premature change when a reservation exists, preventing
-- a rejected insert from leaving the site assignment inconsistent.
create function public.planner_guard_site_assignment() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.current_project_id is not null and new.current_project_id is distinct from old.current_project_id
     and exists (select 1 from public.equipment_deployment_plans where equipment_id=new.id and status in ('planned','confirmed'))
     and not exists (select 1 from public.equipment_deployments where equipment_id=new.id and project_id=new.current_project_id and status='active') then
    raise exception 'This machine has reserved bookings. Use Deployment Planner to mobilise it safely';
  end if;
  return new;
end;
$$;
create trigger guard_reserved_machine_site before update of current_project_id on public.equipment
  for each row execute function public.planner_guard_site_assignment();
revoke all on function public.planner_guard_site_assignment() from public,anon;

do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='equipment_deployment_plans') then
      alter publication supabase_realtime add table public.equipment_deployment_plans;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='equipment_deployments') then
      alter publication supabase_realtime add table public.equipment_deployments;
    end if;
  end if;
end $$;
notify pgrst, 'reload schema';
