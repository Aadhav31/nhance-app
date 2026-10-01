CREATE OR REPLACE FUNCTION public.create_workshop_job(p_equipment_id uuid, p_jc_type text, p_complaint text, p_priority text DEFAULT 'normal'::text, p_project_id uuid DEFAULT NULL::uuid, p_technician_id uuid DEFAULT NULL::uuid, p_sla_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_breakdown_alert_id uuid DEFAULT NULL::uuid, p_incident_id uuid DEFAULT NULL::uuid, p_meter_at_open numeric DEFAULT NULL::numeric, p_pm_schedule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$

