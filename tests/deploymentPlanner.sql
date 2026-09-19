-- Run against a migrated database with an admin, linked project, and a free
-- machine. Every fixture/change is rolled back, including the role test.
begin;
do $$
declare fixture record;
begin
  select e.id equipment_id, p.id project_id, e.company_id, r.user_id into fixture
  from public.equipment e
  join public.projects p on p.company_id=e.company_id and p.client_id is not null
  join public.user_roles r on r.company_id=e.company_id and r.role::text='admin'
  where e.current_project_id is null and e.status::text not in ('breakdown','maintenance','disposed')
    and not exists(select 1 from public.equipment_deployments where equipment_id=e.id and status='active')
    and not exists(select 1 from public.equipment_deployment_plans where equipment_id=e.id and status in ('planned','confirmed'))
  limit 1;
  if not found then raise exception 'No safe planner test fixture found'; end if;
  perform set_config('planner_test.equipment',fixture.equipment_id::text,true);
  perform set_config('planner_test.project',fixture.project_id::text,true);
  perform set_config('planner_test.company',fixture.company_id::text,true);
  perform set_config('planner_test.foreign_equipment',coalesce((select id::text from public.equipment where company_id<>fixture.company_id limit 1),''),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',fixture.user_id,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare
  v_equipment uuid := current_setting('planner_test.equipment')::uuid;
  v_project uuid := current_setting('planner_test.project')::uuid;
  v_company uuid := current_setting('planner_test.company')::uuid;
  booking uuid; next_booking uuid; deployment uuid;
  payload jsonb := jsonb_build_object('equipment_id',v_equipment,'project_id',v_project,'deployed_date',current_date,'expected_return_date',current_date+2,'rental_rate',1000,'rate_unit','per_hour','billing_basis','hourly','rate_per_hour',1000);
begin
  if current_setting('planner_test.foreign_equipment')<>'' then
    begin
      insert into public.equipment_deployment_plans(company_id,equipment_id,project_id,mobilisation_date,expected_return_date)
        values(v_company,current_setting('planner_test.foreign_equipment')::uuid,v_project,current_date,current_date+2);
      raise exception 'TEST FAILED: another tenant machine accepted';
    exception when insufficient_privilege then null; end;
  end if;
  insert into public.equipment_deployment_plans(company_id,equipment_id,project_id,mobilisation_date,expected_return_date)
    values(v_company,v_equipment,v_project,current_date,current_date+2) returning id into booking;
  begin
    insert into public.equipment_deployment_plans(company_id,equipment_id,project_id,mobilisation_date,expected_return_date)
      values(v_company,v_equipment,v_project,current_date+2,current_date+4);
    raise exception 'TEST FAILED: same-day overlap allowed';
  exception when exclusion_violation then null; end;
  insert into public.equipment_deployment_plans(company_id,equipment_id,project_id,mobilisation_date,expected_return_date)
    values(v_company,v_equipment,v_project,current_date+3,current_date+5) returning id into next_booking;
  update public.equipment_deployment_plans set status='cancelled' where id=next_booking;
  insert into public.equipment_deployment_plans(company_id,equipment_id,project_id,mobilisation_date,expected_return_date)
    values(v_company,v_equipment,v_project,current_date+3,current_date+5) returning id into next_booking;
  begin
    perform public.planner_deploy_equipment(payload||jsonb_build_object('rate_item_id',gen_random_uuid()),null,booking);
    raise exception 'TEST FAILED: invalid rate card accepted';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.equipment_deployments where equipment_id=v_equipment and status='active')
     or (select current_project_id from public.equipment where id=v_equipment) is not null
     or (select status from public.equipment_deployment_plans where id=booking)<>'planned' then
    raise exception 'TEST FAILED: failed mobilisation partially wrote data';
  end if;
  deployment := public.planner_deploy_equipment(payload,null,booking);
  if (select status from public.equipment_deployment_plans where id=booking)<>'mobilised'
     or (select current_project_id from public.equipment where id=v_equipment) is distinct from v_project
     or (select rental_rate from public.equipment_deployments where id=deployment)<>1000 then
    raise exception 'TEST FAILED: mobilisation did not update all linked records';
  end if;
  begin
    perform public.planner_deploy_equipment(payload);
    raise exception 'TEST FAILED: duplicate mobilisation accepted';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED:%' then raise; end if;
    if sqlerrm<>'Machine is still deployed. Return or transfer it first' then raise; end if;
  end;
  begin
    update public.equipment_deployments set expected_return_date=current_date+4 where id=deployment;
    raise exception 'TEST FAILED: deployment extension overlaps next reservation';
  exception when exclusion_violation then null; end;
  update public.equipment set status='breakdown' where id=v_equipment;
  perform public.planner_return_equipment(deployment,current_date);
  if (select status from public.equipment_deployments where id=deployment)<>'completed'
     or (select current_project_id from public.equipment where id=v_equipment) is not null
     or (select status from public.equipment_deployment_plans where id=booking)<>'completed' then
    raise exception 'TEST FAILED: return did not update all linked records';
  end if;
  if (select status::text from public.equipment where id=v_equipment)<>'breakdown' then raise exception 'TEST FAILED: return cleared machine breakdown'; end if;
  update public.equipment set status='idle' where id=v_equipment;
  begin
    insert into public.equipment_deployment_plans(company_id,equipment_id,project_id,mobilisation_date,expected_return_date)
      values(v_company,v_equipment,v_project,current_date,current_date+1);
    raise exception 'TEST FAILED: actual return day became bookable';
  exception when exclusion_violation then null; end;
  -- An overdue forecast is never treated as an actual return.
  begin
    deployment := public.planner_deploy_equipment(payload||jsonb_build_object('deployed_date',current_date-2,'expected_return_date',current_date-1));
    -- The pending future booking blocks this undated/overdue deployment.
    raise exception 'TEST FAILED: overdue deployment bypassed future reservation';
  exception when exclusion_violation then null; end;
  perform set_config('planner_test.transactions_passed','true',true);
end $$;
reset role;
do $$ begin
  if current_setting('planner_test.transactions_passed',true) is distinct from 'true' then
    raise exception 'TEST FAILED: transaction checks did not finish';
  end if;
  update public.user_roles set role='supervisor' where user_id=(current_setting('request.jwt.claims')::jsonb->>'sub')::uuid;
end $$;
set local role authenticated;
do $$ begin
  begin
    insert into public.equipment_deployment_plans(company_id,equipment_id,project_id,mobilisation_date,expected_return_date)
      values(current_setting('planner_test.company')::uuid,current_setting('planner_test.equipment')::uuid,current_setting('planner_test.project')::uuid,current_date+10,current_date+11);
    raise exception 'TEST FAILED: supervisor created a booking';
  exception when insufficient_privilege then null; end;
  begin
    perform public.planner_deploy_equipment('{}'::jsonb);
    raise exception 'TEST FAILED: supervisor mobilised a machine';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.equipment_deployment_plans where company_id<>current_setting('planner_test.company')::uuid) then
    raise exception 'TEST FAILED: another tenant booking is visible';
  end if;
end $$;
rollback;
