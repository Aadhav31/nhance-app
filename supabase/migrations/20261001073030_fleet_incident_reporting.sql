-- Fleet reports are standalone incidents; a shift is not required. Keep the
-- incident, machine status, escalation and workshop records in one transaction.
alter table public.shift_incidents
  add column if not exists job_card_id uuid references public.job_cards(id) on delete set null;
create index if not exists shift_incidents_job_card_id_idx
  on public.shift_incidents(job_card_id) where job_card_id is not null;

create or replace function public.report_equipment_incident(
  p_incident_id uuid, p_equipment_id uuid, p_details jsonb
) returns jsonb
language plpgsql security invoker set search_path = public
as $function$
declare
  v_company uuid := public.auth_company_id();
  v_actor uuid := auth.uid();
  v_equipment public.equipment%rowtype;
  v_existing public.shift_incidents%rowtype;
  v_project public.projects%rowtype;
  v_job public.job_cards%rowtype;
  v_type text := p_details->>'incident_type';
  v_description text := nullif(trim(p_details->>'description'), '');
  v_cause text;
  v_damage text;
  v_severity text;
  v_at timestamptz;
  v_lat double precision := nullif(p_details->>'location_lat', '')::double precision;
  v_lng double precision := nullif(p_details->>'location_lng', '')::double precision;
  v_name text;
  v_label text;
  v_chain jsonb := '[]'::jsonb;
  v_alert uuid;
  v_new_alert boolean := false;
  v_job_id uuid;
  v_contact jsonb;
begin
  if v_actor is null or v_company is null or coalesce(public.auth_role(), '') not in ('supervisor','manager','admin') then
    raise exception 'Incident reporting permission denied' using errcode = '42501';
  end if;
  if p_incident_id is null or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'Invalid incident report';
  end if;
  -- Serialize reports for this machine, including simultaneous duplicate retries.
  select * into v_equipment from public.equipment
  where id = p_equipment_id and company_id = v_company for update;
  if not found then raise exception 'Equipment not found'; end if;

  select * into v_existing from public.shift_incidents where id = p_incident_id;
  if found then
    if v_existing.company_id is distinct from v_company or v_existing.equipment_id is distinct from p_equipment_id
       or v_existing.reported_by is distinct from v_actor then
      raise exception 'Incident reference already used' using errcode = '42501';
    end if;
    return jsonb_build_object('incident_id', v_existing.id, 'created', false,
      'job_card_id', v_existing.job_card_id, 'alert_created', false, 'reported_at', v_existing.incident_time);
  end if;
  if v_equipment.status = 'disposed' then raise exception 'Disposed equipment cannot receive new incident reports'; end if;
  if v_type is null or v_type not in ('breakdown','unscheduled_maintenance','regular_maintenance','damage',
      'theft','safety_issue','accident','near_miss','other') then raise exception 'Invalid incident type'; end if;
  v_at := nullif(p_details->>'occurred_at', '')::timestamptz;
  if v_at is null or not isfinite(v_at) or v_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'Enter a valid incident date that is not in the future';
  end if;
  if v_type = 'breakdown' then
    v_cause := nullif(trim(p_details->>'breakdown_cause'), '');
    if v_cause is null then raise exception 'Cause of breakdown is required'; end if;
  elsif v_type = 'damage' then
    v_damage := nullif(trim(p_details->>'damage_cause'), '');
    if v_damage is null then raise exception 'Describe how the damage happened'; end if;
  end if;
  v_description := coalesce(v_description, v_cause, v_damage);
  if v_description is null then raise exception 'Description is required'; end if;
  if v_type in ('safety_issue','accident','near_miss') then
    v_severity := coalesce(nullif(p_details->>'severity', ''), 'medium');
    if v_severity not in ('low','medium','high','critical') then raise exception 'Invalid incident severity'; end if;
  end if;
  if v_lat is not null and not (v_lat between -90 and 90) or v_lng is not null and not (v_lng between -180 and 180) then
    raise exception 'Invalid incident location';
  end if;
  select full_name into v_name from public.user_profiles where id = v_actor and company_id = v_company;
  insert into public.shift_incidents (
    id, company_id, equipment_id, shift_id, incident_type, severity, description,
    action_taken, breakdown_cause, rectification_needed, damage_cause, what_needs_to_be_done,
    notify_assigned, location_lat, location_lng, location_address,
    reported_by, incident_time, created_at, resolved
  ) values (
    p_incident_id, v_company, p_equipment_id, null, v_type, v_severity, v_description,
    case when v_type in ('regular_maintenance','unscheduled_maintenance','safety_issue','accident','near_miss')
      then nullif(trim(p_details->>'action_taken'), '') end,
    v_cause, case when v_type = 'breakdown' then nullif(trim(p_details->>'rectification_needed'), '') end,
    v_damage, case when v_type = 'damage' then nullif(trim(p_details->>'what_needs_to_be_done'), '') end,
    v_type in ('damage','safety_issue','theft','accident','breakdown'), v_lat, v_lng,
    nullif(trim(p_details->>'location_address'), ''), v_actor, v_at, v_at, false
  );

  if v_type = 'breakdown' then
    -- Workshop transitions lock the job before the machine. NOWAIT avoids
    -- waiting in the opposite order while this report holds the machine lock.
    begin
      select * into v_job from public.job_cards
      where company_id = v_company and equipment_id = p_equipment_id and jc_type = 'breakdown' and status <> 'closed'
      order by created_at desc limit 1 for update nowait;
    exception when lock_not_available then
      raise exception 'A workshop update is in progress. Please retry.' using errcode = '55P03';
    end;
    -- Prefer the active job's alert; otherwise reuse the current escalation.
    select id, notify_chain into v_alert, v_chain from public.breakdown_alerts
    where company_id = v_company and equipment_id = p_equipment_id and resolved_at is null
    order by (id = v_job.breakdown_alert_id) desc nulls last, reported_at desc limit 1;
    if v_alert is null then
      v_chain := '[]'::jsonb;
      select * into v_project from public.projects
      where id = v_equipment.current_project_id and company_id = v_company;
      for v_contact in select value from jsonb_array_elements(
        case when jsonb_typeof(v_project.our_supervisors) = 'array' then v_project.our_supervisors else '[]'::jsonb end)
      loop
        if nullif(trim(v_contact->>'name'), '') is not null then
          v_chain := v_chain || jsonb_build_array(jsonb_build_object('level',1,'role','Site Supervisor',
            'name',v_contact->>'name','phone',v_contact->>'phone','email',v_contact->>'email'));
        end if;
      end loop;
      for v_contact in select value from jsonb_array_elements(
        case when jsonb_typeof(v_project.our_pnm_contacts) = 'array' then v_project.our_pnm_contacts else '[]'::jsonb end)
      loop
        if nullif(trim(v_contact->>'name'), '') is not null then
          v_chain := v_chain || jsonb_build_array(jsonb_build_object('level',2,'role','P&M Incharge',
            'name',v_contact->>'name','phone',v_contact->>'phone','email',v_contact->>'email'));
        end if;
      end loop;
      for v_contact in select value from jsonb_array_elements(
        case when jsonb_typeof(v_project.our_managers) = 'array' then v_project.our_managers else '[]'::jsonb end)
      loop
        if nullif(trim(v_contact->>'name'), '') is not null then
          v_chain := v_chain || jsonb_build_array(jsonb_build_object('level',3,'role','Manager',
            'name',v_contact->>'name','phone',v_contact->>'phone','email',v_contact->>'email'));
        end if;
      end loop;
      if nullif(trim(v_project.our_pm_name), '') is not null then
        v_chain := v_chain || jsonb_build_array(jsonb_build_object('level',4,'role','Project Manager',
          'name',v_project.our_pm_name,'phone',v_project.our_pm_phone,'email',v_project.our_pm_email));
      end if;
      insert into public.breakdown_alerts(company_id, equipment_id, incident_id, equipment_name, project_id,
        breakdown_cause, reported_by_name, reported_at, notify_chain)
      values(v_company, p_equipment_id, p_incident_id, v_equipment.name, v_equipment.current_project_id,
        v_cause, v_name, v_at, v_chain) returning id into v_alert;
      v_new_alert := true;
    end if;
    v_job_id := public.create_workshop_job(p_equipment_id, 'breakdown', v_cause, 'high',
      v_equipment.current_project_id, null, null, v_alert, p_incident_id, v_equipment.current_meter_reading);
    update public.job_cards set breakdown_alert_id = v_alert, incident_id = coalesce(incident_id, p_incident_id), updated_at = now()
    where id = v_job_id and company_id = v_company
      and (breakdown_alert_id is distinct from v_alert or incident_id is null);
    select * into v_job from public.job_cards where id = v_job_id and company_id = v_company;
    update public.shift_incidents set job_card_id = v_job_id where id = p_incident_id;
    -- A second report must not reset an existing repair or its approval stage.
    update public.equipment set status = case
      when v_job.workflow_stage in ('in_progress','testing','pending_approval') then 'maintenance'::public.equipment_status
      else 'breakdown'::public.equipment_status end, updated_at = now()
    where id = p_equipment_id and company_id = v_company;
    insert into public.job_card_events(company_id, job_card_id, event_type, notes, actor_id, actor_name)
    values(v_company, v_job_id, 'incident_reported', 'Incident ' || p_incident_id::text || ': ' || v_description, v_actor, v_name);
  elsif v_type in ('regular_maintenance','unscheduled_maintenance') then
    update public.equipment set status = 'maintenance', updated_at = now()
    where id = p_equipment_id and company_id = v_company and status <> 'breakdown';
  end if;

  if v_type in ('damage','safety_issue','theft','accident','breakdown') then
    v_label := case v_type when 'breakdown' then 'Breakdown' when 'damage' then 'Damage / Broken'
      when 'safety_issue' then 'Safety Issue' when 'theft' then 'Theft' else 'Accident' end;
    insert into public.notifications(company_id, type, title, body, metadata)
    values(v_company, 'incident_' || v_type, v_label || ' — ' || v_equipment.name, v_description,
      jsonb_build_object('equipment_id',p_equipment_id,'equipment_name',v_equipment.name,
        'incident_type',v_type,'incident_id',p_incident_id,'job_card_id',v_job_id,'breakdown_alert_id',v_alert));
  end if;
  return jsonb_build_object('incident_id',p_incident_id,'created',true,'job_card_id',v_job_id,
    'breakdown_alert_id',v_alert,'alert_created',v_new_alert,'notify_chain',v_chain,'reported_at',v_at);
end;
$function$;
revoke all on function public.report_equipment_incident(uuid,uuid,jsonb) from public, anon;
grant execute on function public.report_equipment_incident(uuid,uuid,jsonb) to authenticated;

-- Existing Workshop closure resolves its primary incident. Resolve additional
-- Fleet reports linked to the same job only when the repair is approved/closed.
create or replace function public.resolve_fleet_job_incidents()
returns trigger language plpgsql security invoker set search_path = public
as $function$
begin
  update public.shift_incidents
  set resolved = true, resolved_at = coalesce(resolved_at, now()), resolved_by = coalesce(resolved_by, auth.uid()),
    action_taken = coalesce(nullif(trim(new.corrective_action), ''), nullif(trim(new.work_done), ''), action_taken)
  where job_card_id = new.id and company_id = new.company_id and equipment_id = new.equipment_id and not resolved;
  return new;
end;
$function$;
revoke all on function public.resolve_fleet_job_incidents() from public, anon, authenticated;
drop trigger if exists resolve_fleet_job_incidents on public.job_cards;
create trigger resolve_fleet_job_incidents after update of workflow_stage on public.job_cards
for each row when (new.workflow_stage = 'closed' and old.workflow_stage is distinct from new.workflow_stage)
execute function public.resolve_fleet_job_incidents();
notify pgrst, 'reload schema';
