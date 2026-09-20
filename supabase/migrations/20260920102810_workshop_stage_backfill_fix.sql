-- Correct legacy jobs that received the new column default before their coarse
-- status was mapped, then enforce the release gate at the database boundary.

update public.job_cards
set workflow_stage = case
  when status = 'closed' then 'closed'
  when status = 'in_progress' then 'in_progress'
  else 'open'
end
where (status = 'closed' and workflow_stage <> 'closed')
   or (status = 'in_progress' and workflow_stage = 'open');

create index if not exists job_card_events_company_job
  on public.job_card_events(company_id, job_card_id, created_at desc);
create index if not exists job_card_part_issues_company_job
  on public.job_card_part_issues(company_id, job_card_id, issued_at desc);
create index if not exists job_card_part_issues_part
  on public.job_card_part_issues(job_card_part_id);
create index if not exists job_card_parts_inventory_status
  on public.job_card_parts(inventory_item_id, issue_status)
  where inventory_item_id is not null;
create index if not exists job_cards_incident
  on public.job_cards(incident_id)
  where incident_id is not null;

create or replace function public.validate_workshop_release()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text := public.auth_role();
  v_actor_name text;
begin
  if new.workflow_stage = 'closed' and old.workflow_stage <> 'closed' then
    if auth.uid() is null or coalesce(v_role, '') not in ('manager','admin') then
      raise exception 'Manager approval is required to release equipment' using errcode = '42501';
    end if;
    if new.test_result <> 'passed' then
      raise exception 'A passed test result is required before release';
    end if;
    if nullif(trim(new.diagnosis), '') is null or nullif(trim(new.work_done), '') is null then
      raise exception 'Diagnosis and work completed are required before release';
    end if;
    if new.pm_schedule_id is not null and new.meter_at_close is null then
      raise exception 'Completion meter is required for PM release';
    end if;
    if not coalesce((new.completion_checklist ->> 'guards_fitted')::boolean, false)
       or not coalesce((new.completion_checklist ->> 'leaks_checked')::boolean, false)
       or not coalesce((new.completion_checklist ->> 'trial_completed')::boolean, false) then
      raise exception 'Safety, leak and trial-run checks must be completed before release';
    end if;

    select full_name into v_actor_name from public.user_profiles where id = auth.uid();
    new.status := 'closed';
    new.closed_date := coalesce(new.closed_date, current_date);
    new.approved_at := coalesce(new.approved_at, now());
    new.released_at := coalesce(new.released_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
    new.approved_by_name := coalesce(new.approved_by_name, v_actor_name);
    new.completion_checklist := jsonb_set(
      coalesce(new.completion_checklist, '{}'::jsonb),
      '{site_released}', 'true'::jsonb, true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists validate_workshop_release on public.job_cards;
create trigger validate_workshop_release
  before update of workflow_stage on public.job_cards
  for each row execute function public.validate_workshop_release();

revoke all on function public.validate_workshop_release() from public, anon, authenticated;

notify pgrst, 'reload schema';
