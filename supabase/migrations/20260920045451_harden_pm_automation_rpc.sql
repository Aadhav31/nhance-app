-- Keep privileged PM automation callable only through database triggers, while the
-- user-facing RPC runs with the signed-in user's RLS permissions.

revoke all on function public.sync_pm_jobs_after_meter_change() from public, anon, authenticated;
revoke all on function public.sync_pm_jobs_after_schedule_change() from public, anon, authenticated;

create index if not exists pm_schedules_created_by
  on public.pm_schedules(created_by)
  where created_by is not null;

create index if not exists maintenance_records_job_card
  on public.maintenance_records(job_card_id)
  where job_card_id is not null;

create or replace function public.open_pm_job(p_schedule_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_schedule public.pm_schedules%rowtype;
  v_equipment public.equipment%rowtype;
  v_existing uuid;
  v_job uuid;
begin
  if auth.uid() is null or public.auth_role()::text not in ('supervisor', 'manager', 'admin') then
    raise exception 'Maintenance permission denied' using errcode = '42501';
  end if;

  select * into v_schedule
  from public.pm_schedules
  where id = p_schedule_id
    and company_id = public.auth_company_id()
    and is_active;
  if not found then raise exception 'PM schedule not found'; end if;

  select * into v_equipment
  from public.equipment
  where id = v_schedule.equipment_id
    and company_id = v_schedule.company_id;
  if not found then raise exception 'Equipment not found'; end if;

  select id into v_existing
  from public.job_cards
  where pm_schedule_id = v_schedule.id
    and status in ('open', 'in_progress')
  order by created_at desc
  limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.job_cards (
    company_id, jc_number, equipment_id, equipment_name, pm_schedule_id,
    jc_type, status, complaint, opened_date, meter_at_open, created_by
  ) values (
    v_schedule.company_id, '', v_equipment.id, v_equipment.name, v_schedule.id,
    'pm_service', 'open',
    v_schedule.schedule_name || ' due at ' || coalesce(
      v_schedule.next_due_meter::text || ' hrs',
      v_schedule.next_due_date::text,
      'scheduled interval'
    ),
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
      when v_schedule.next_due_meter is not null
        and coalesce(v_equipment.current_meter_reading, 0) >= v_schedule.next_due_meter then 'high'
      when v_schedule.next_due_date is not null
        and v_schedule.next_due_date <= current_date then 'high'
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
    where pm_schedule_id = p_schedule_id
      and status in ('open', 'in_progress')
    order by created_at desc
    limit 1;
    return v_existing;
end;
$$;

revoke all on function public.open_pm_job(uuid) from public, anon;
grant execute on function public.open_pm_job(uuid) to authenticated;
