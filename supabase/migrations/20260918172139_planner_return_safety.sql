-- Match the inclusive daily board with reservations, including actual returns.
-- Filename matches the version recorded by the remote migration runner.
create or replace function public.planner_validate_booking() returns trigger language plpgsql security invoker set search_path = '' as $$
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
      select 1 from public.equipment_deployments d where d.equipment_id = new.equipment_id
      and daterange(new.mobilisation_date, new.expected_return_date, '[]') && daterange(d.deployed_date,
        case when d.status='active' then
          case when d.expected_return_date < current_date then null else d.expected_return_date end
        else coalesce(d.withdrawn_date,d.deployed_date) end, '[]')
    ) then raise exception 'Booking overlaps a deployment; the actual or expected return day is reserved too' using errcode = '23P01'; end if;
    if machine.current_project_id is not null and not exists (
      select 1 from public.equipment_deployments where equipment_id = machine.id and status = 'active'
    ) then raise exception 'Resolve the current site assignment before booking'; end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.planner_return_equipment(p_deployment_id uuid, p_return_date date)
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
  update public.equipment set current_project_id=null,current_client_id=null,current_site_name=null,
    status=case when status::text in ('breakdown','maintenance','disposed') then status else 'idle' end
    where id=deployment.equipment_id and current_project_id=deployment.project_id;
  update public.equipment_deployment_plans set status='completed', actual_return_date=p_return_date where deployment_id=p_deployment_id and status='mobilised';
end;
$$;
notify pgrst, 'reload schema';
