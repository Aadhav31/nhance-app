CREATE OR REPLACE FUNCTION public.transition_workshop_job(p_job_card_id uuid, p_stage text, p_note text DEFAULT NULL::text, p_meter_at_close numeric DEFAULT NULL::numeric, p_test_result text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$

