-- Expense approval refinement for lean and growing construction companies.
--
-- Policy:
--   * ad-hoc company expenses, field expenses and reimbursements above the
--     configured threshold must enter the Approval Centre
--   * the requester never approves their own transaction
--   * an admin/owner submission is an owner authorisation; a manager performs
--     independent verification (the manager is not shown as approving owner)
--   * manager submissions route to the owner/admin for approval
--   * employee submissions route through each staffed control role, ending
--     with owner/admin sanction
--   * an owner may use a reason-required emergency override which is retained
--     in the immutable approval action history

create table if not exists public.approval_policy_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  expense_approval_threshold numeric(18,2) not null default 2000
    check (expense_approval_threshold >= 0),
  owner_override_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.approval_policy_settings (company_id, expense_approval_threshold)
select id, 2000 from public.companies
on conflict (company_id) do nothing;

alter table public.approval_policy_settings enable row level security;

drop policy if exists approval_policy_settings_select on public.approval_policy_settings;
create policy approval_policy_settings_select
  on public.approval_policy_settings for select to authenticated
  using (company_id = (select public.auth_company_id()));

drop policy if exists approval_policy_settings_admin_write on public.approval_policy_settings;
create policy approval_policy_settings_admin_write
  on public.approval_policy_settings for all to authenticated
  using (
    company_id = (select public.auth_company_id())
    and (select public.auth_role()) = 'admin'
  )
  with check (
    company_id = (select public.auth_company_id())
    and (select public.auth_role()) = 'admin'
    and updated_by = auth.uid()
  );

revoke all on public.approval_policy_settings from anon;
grant select,insert,update on public.approval_policy_settings to authenticated;

alter table public.approval_workflow_steps
  add column if not exists decision_type text not null default 'approval';
alter table public.approval_workflow_steps
  drop constraint if exists approval_workflow_steps_decision_type_check;
alter table public.approval_workflow_steps
  add constraint approval_workflow_steps_decision_type_check
  check (decision_type in ('approval','verification','sanction','compliance'));

alter table public.approval_tasks
  add column if not exists decision_type text not null default 'approval';
alter table public.approval_tasks
  drop constraint if exists approval_tasks_decision_type_check;
alter table public.approval_tasks
  add constraint approval_tasks_decision_type_check
  check (decision_type in ('approval','verification','sanction','compliance'));

alter table public.approval_actions
  drop constraint if exists approval_actions_action_check;
alter table public.approval_actions
  add constraint approval_actions_action_check
  check (action in (
    'submitted','approved','rejected','returned','cancelled','reassigned',
    'delegated','processed','overridden'
  ));

update public.approval_workflows
set description = case document_type
  when 'field_expense' then 'Expenses above the company threshold: manager approval or owner verification, staffed finance checks, and owner sanction.'
  when 'expense' then 'Ad-hoc expenses above the company threshold: manager approval or owner verification, staffed finance checks, and owner sanction.'
  when 'employee_reimbursement' then 'Claims above the company threshold: manager approval, staffed finance checks, and owner sanction.'
  else description
end,
updated_at = now()
where document_type in ('field_expense','expense','employee_reimbursement');

create or replace function public.submit_expense_approval_case(
  p_document_type text,
  p_document_id uuid,
  p_document_ref text default null,
  p_title text default null,
  p_metric_label text default 'Amount',
  p_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_actor_role text := public.auth_role();
  v_actor_name text;
  v_actor_department text;
  v_workflow public.approval_workflows%rowtype;
  v_manager_step public.approval_workflow_steps%rowtype;
  v_accounts_step public.approval_workflow_steps%rowtype;
  v_admin_step public.approval_workflow_steps%rowtype;
  v_case_id uuid;
  v_amount numeric := 0;
  v_threshold numeric := 2000;
  v_project_id uuid;
  v_unit_id uuid;
  v_vendor_id uuid;
  v_document_ref text := nullif(trim(p_document_ref),'');
  v_title text := nullif(trim(p_title),'');
  v_snapshot jsonb := coalesce(p_snapshot,'{}'::jsonb);
  v_has_manager boolean := false;
  v_has_accounts boolean := false;
  v_has_admin boolean := false;
  v_task_order integer := 0;
  v_first_order integer;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_document_type not in ('field_expense','expense','employee_reimbursement') then
    raise exception 'Expense approval supports field expense, company expense and reimbursement only';
  end if;
  if p_document_id is null then
    raise exception 'Expense document id is required';
  end if;
  if exists (
    select 1 from public.approval_cases
    where company_id=v_company_id and document_type=p_document_type
      and document_id=p_document_id and status='in_review'
  ) then
    raise exception 'This expense already has an active approval';
  end if;

  -- Resolve value and routing data from the source row. Client-supplied values
  -- never decide whether approval is compulsory.
  if p_document_type='field_expense' then
    select fe.amount,fe.project_id,fe.unit_id,coalesce(fe.bill_number,v_document_ref)
      into v_amount,v_project_id,v_unit_id,v_document_ref
    from public.field_expenses fe
    where fe.id=p_document_id and fe.company_id=v_company_id;
  elsif p_document_type='expense' then
    select coalesce(e.total_amount,e.amount),e.project_id,e.unit_id,e.vendor_id,
      coalesce(e.reference_number,e.bank_reference,v_document_ref)
      into v_amount,v_project_id,v_unit_id,v_vendor_id,v_document_ref
    from public.expenses e
    where e.id=p_document_id and e.company_id=v_company_id;
  else
    select er.amount,coalesce((er.flags->>'bill_ref'),v_document_ref)
      into v_amount,v_document_ref
    from public.employee_reimbursements er
    where er.id=p_document_id and er.company_id=v_company_id;
  end if;
  if not found then
    raise exception 'Expense source was not found in your company' using errcode='42501';
  end if;

  insert into public.approval_policy_settings (company_id,expense_approval_threshold)
  values (v_company_id,2000)
  on conflict (company_id) do nothing;
  select coalesce(aps.expense_approval_threshold,2000)
    into v_threshold
  from public.approval_policy_settings aps
  where aps.company_id=v_company_id;
  v_threshold := coalesce(v_threshold,2000);
  v_amount := coalesce(v_amount,0);
  v_title := coalesce(v_title,v_document_ref,p_document_type);

  perform public.seed_default_approval_workflows(v_company_id);
  select * into v_workflow
  from public.approval_workflows w
  where w.company_id=v_company_id and w.document_type=p_document_type and w.is_active
    and (w.project_id is null or w.project_id=v_project_id)
    and (w.unit_id is null or w.unit_id=v_unit_id)
  order by (w.project_id is not null) desc, (w.unit_id is not null) desc,
    w.priority desc, w.version desc
  limit 1;
  if v_workflow.id is null then
    raise exception 'No active approval workflow is configured for %', p_document_type;
  end if;

  select up.full_name,nullif(trim(up.department),'')
    into v_actor_name,v_actor_department
  from public.user_profiles up
  where up.id=auth.uid() and up.company_id=v_company_id;

  v_snapshot := v_snapshot || jsonb_build_object(
    'server_verified',true,
    'verified_value',v_amount,
    'verified_reference',v_document_ref,
    'expense_approval_threshold',v_threshold,
    'requester_role',v_actor_role,
    'owner_authorised',v_actor_role='admin'
  );

  -- Up to and including the threshold, retain a policy-cleared history entry
  -- without creating a pending approval task.
  if v_amount <= v_threshold then
    insert into public.approval_cases (
      company_id,workflow_id,workflow_version,document_type,document_id,
      document_ref,title,amount,metric_label,project_id,unit_id,vendor_id,
      requester_department,submitted_by,submitted_by_name,status,snapshot,
      current_step_order,completed_at
    ) values (
      v_company_id,v_workflow.id,v_workflow.version,p_document_type,p_document_id,
      v_document_ref,v_title,v_amount,coalesce(nullif(trim(p_metric_label),''),'Amount'),
      v_project_id,v_unit_id,v_vendor_id,v_actor_department,auth.uid(),
      coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),'approved',
      v_snapshot || jsonb_build_object('policy_outcome','within_threshold'),null,now()
    ) returning id into v_case_id;

    insert into public.approval_actions (
      company_id,case_id,action,to_status,actor_id,actor_name,actor_role,
      actor_department,comments,metadata
    ) values (
      v_company_id,v_case_id,'submitted','approved',auth.uid(),
      coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),v_actor_role,
      v_actor_department,'Within company expense threshold; no approval task required.',
      jsonb_build_object('policy_auto_cleared',true,'threshold',v_threshold)
    );
    perform public.sync_approval_source_status(p_document_type,p_document_id,'approved');
    return jsonb_build_object(
      'case_id',v_case_id,'status','approved','approval_required',false,
      'route','within_threshold','threshold',v_threshold
    );
  end if;

  select * into v_manager_step
  from public.approval_workflow_steps
  where workflow_id=v_workflow.id and required_role='manager'
  order by step_order limit 1;
  select * into v_accounts_step
  from public.approval_workflow_steps
  where workflow_id=v_workflow.id and required_role='accounts'
  order by step_order limit 1;
  select * into v_admin_step
  from public.approval_workflow_steps
  where workflow_id=v_workflow.id and required_role='admin'
  order by step_order limit 1;

  select exists (
    select 1 from public.user_profiles up
    join public.user_roles ur on ur.user_id=up.id
    where up.company_id=v_company_id and up.is_active
      and ur.role::text='manager' and up.id<>auth.uid()
  ) into v_has_manager;
  select exists (
    select 1 from public.user_profiles up
    join public.user_roles ur on ur.user_id=up.id
    where up.company_id=v_company_id and up.is_active
      and ur.role::text='accounts' and up.id<>auth.uid()
  ) into v_has_accounts;
  select exists (
    select 1 from public.user_profiles up
    join public.user_roles ur on ur.user_id=up.id
    where up.company_id=v_company_id and up.is_active
      and ur.role::text='admin' and up.id<>auth.uid()
  ) into v_has_admin;

  insert into public.approval_cases (
    company_id,workflow_id,workflow_version,document_type,document_id,
    document_ref,title,amount,metric_label,project_id,unit_id,vendor_id,
    requester_department,submitted_by,submitted_by_name,snapshot
  ) values (
    v_company_id,v_workflow.id,v_workflow.version,p_document_type,p_document_id,
    v_document_ref,v_title,v_amount,coalesce(nullif(trim(p_metric_label),''),'Amount'),
    v_project_id,v_unit_id,v_vendor_id,v_actor_department,auth.uid(),
    coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),
    v_snapshot || jsonb_build_object(
      'policy_outcome','approval_required',
      'has_manager',v_has_manager,
      'has_accounts',v_has_accounts,
      'has_independent_admin',v_has_admin
    )
  ) returning id into v_case_id;

  if v_actor_role='admin' then
    -- The owner/director has already authorised the transaction by submitting
    -- it. A manager checks the evidence and business purpose; the UI labels
    -- this as verification, never approval of the owner.
    if v_manager_step.id is null then
      raise exception 'The expense workflow needs a manager step for owner verification';
    end if;
    v_task_order := v_task_order + 1;
    insert into public.approval_tasks (
      company_id,case_id,workflow_step_id,step_order,step_name,department,
      required_role,approver_user_id,enforce_department,allow_self_approval,
      decision_type,status,due_at
    ) values (
      v_company_id,v_case_id,v_manager_step.id,v_task_order,'Manager verification',
      'Management Control','manager',v_manager_step.approver_user_id,false,false,
      'verification','blocked',null
    );
    if v_has_accounts and v_accounts_step.id is not null then
      v_task_order := v_task_order + 1;
      insert into public.approval_tasks (
        company_id,case_id,workflow_step_id,step_order,step_name,department,
        required_role,approver_user_id,enforce_department,allow_self_approval,
        decision_type,status,due_at
      ) values (
        v_company_id,v_case_id,v_accounts_step.id,v_task_order,'Accounts verification',
        'Accounts','accounts',v_accounts_step.approver_user_id,false,false,
        'verification','blocked',null
      );
    end if;
  else
    -- Skip the requester's own role and use only roles which are staffed. This
    -- keeps a lean company moving without weakening maker/checker separation.
    if not v_has_admin then
      raise exception 'No active owner/admin is configured to sanction this expense';
    end if;
    if v_actor_role<>'manager' and v_has_manager and v_manager_step.id is not null then
      v_task_order := v_task_order + 1;
      insert into public.approval_tasks (
        company_id,case_id,workflow_step_id,step_order,step_name,department,
        required_role,approver_user_id,enforce_department,allow_self_approval,
        decision_type,status,due_at
      ) values (
        v_company_id,v_case_id,v_manager_step.id,v_task_order,'Manager approval',
        coalesce(v_manager_step.department,'Management'),'manager',
        v_manager_step.approver_user_id,false,false,'approval','blocked',null
      );
    end if;
    if v_actor_role<>'accounts' and v_has_accounts and v_accounts_step.id is not null then
      v_task_order := v_task_order + 1;
      insert into public.approval_tasks (
        company_id,case_id,workflow_step_id,step_order,step_name,department,
        required_role,approver_user_id,enforce_department,allow_self_approval,
        decision_type,status,due_at
      ) values (
        v_company_id,v_case_id,v_accounts_step.id,v_task_order,'Accounts verification',
        'Accounts','accounts',v_accounts_step.approver_user_id,false,false,
        'verification','blocked',null
      );
    end if;
    if v_admin_step.id is not null and v_has_admin then
      v_task_order := v_task_order + 1;
      insert into public.approval_tasks (
        company_id,case_id,workflow_step_id,step_order,step_name,department,
        required_role,approver_user_id,enforce_department,allow_self_approval,
        decision_type,status,due_at
      ) values (
        v_company_id,v_case_id,v_admin_step.id,v_task_order,
        case when v_actor_role='manager' then 'Owner approval' else 'Owner sanction' end,
        'Management','admin',v_admin_step.approver_user_id,false,false,
        'sanction','blocked',null
      );
    end if;
  end if;

  select min(step_order) into v_first_order
  from public.approval_tasks where case_id=v_case_id;
  if v_first_order is null then
    raise exception 'No independent approver is configured for this expense. Assign a manager or owner/admin before submitting.';
  end if;
  update public.approval_tasks t
  set status='pending',
      due_at=now()+make_interval(hours=>coalesce(s.sla_hours,24))
  from public.approval_workflow_steps s
  where t.case_id=v_case_id and t.step_order=v_first_order
    and s.id=t.workflow_step_id;
  update public.approval_cases
  set current_step_order=v_first_order,updated_at=now()
  where id=v_case_id;

  insert into public.approval_actions (
    company_id,case_id,action,to_status,actor_id,actor_name,actor_role,
    actor_department,comments,metadata
  ) values (
    v_company_id,v_case_id,'submitted','in_review',auth.uid(),
    coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),v_actor_role,
    v_actor_department,
    case when v_actor_role='admin'
      then 'Owner/director authorisation recorded at submission.'
      else null end,
    jsonb_build_object(
      'workflow',v_workflow.name,
      'workflow_version',v_workflow.version,
      'threshold',v_threshold,
      'owner_authorised',v_actor_role='admin'
    )
  );
  perform public.sync_approval_source_status(p_document_type,p_document_id,'in_review');
  return jsonb_build_object(
    'case_id',v_case_id,'status','in_review','approval_required',true,
    'route',case when v_actor_role='admin' then 'owner_to_verifier'
      when v_actor_role='manager' then 'manager_to_owner'
      else 'employee_to_management' end,
    'threshold',v_threshold
  );
end;
$$;

create or replace function public.override_expense_approval_case(
  p_case_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_case public.approval_cases%rowtype;
  v_actor_name text;
  v_actor_department text;
  v_enabled boolean := false;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if public.auth_role()<>'admin' then
    raise exception 'Only the owner/admin can use an emergency override' using errcode='42501';
  end if;
  if nullif(trim(p_reason),'') is null then
    raise exception 'An emergency override reason is required';
  end if;

  select * into v_case from public.approval_cases where id=p_case_id for update;
  if v_case.id is null or v_case.company_id is distinct from v_company_id then
    raise exception 'Approval case not found' using errcode='42501';
  end if;
  if v_case.document_type not in ('field_expense','expense','employee_reimbursement') then
    raise exception 'Emergency owner override is limited to expense approvals';
  end if;
  if v_case.submitted_by<>auth.uid() then
    raise exception 'Owner override is only available for the owner''s own submission' using errcode='42501';
  end if;
  if v_case.status<>'in_review' then
    raise exception 'This approval is no longer open';
  end if;
  select coalesce(owner_override_enabled,false) into v_enabled
  from public.approval_policy_settings where company_id=v_company_id;
  if not v_enabled then
    raise exception 'Owner emergency override is disabled by company policy' using errcode='42501';
  end if;

  select up.full_name,nullif(trim(up.department),'')
    into v_actor_name,v_actor_department
  from public.user_profiles up
  where up.id=auth.uid() and up.company_id=v_company_id;

  update public.approval_tasks
  set status='skipped',acted_by=auth.uid(),
      acted_by_name=coalesce(v_actor_name,auth.jwt()->>'email','Owner/Admin'),
      acted_at=now(),comments='Emergency owner override: '||trim(p_reason)
  where case_id=v_case.id and status in ('pending','blocked');

  update public.approval_cases
  set status='approved',current_step_order=null,completed_at=now(),updated_at=now(),
      snapshot=snapshot||jsonb_build_object('owner_override',true,'owner_override_reason',trim(p_reason))
  where id=v_case.id;
  perform public.sync_approval_source_status(v_case.document_type,v_case.document_id,'approved');

  insert into public.approval_actions (
    company_id,case_id,action,from_status,to_status,actor_id,actor_name,
    actor_role,actor_department,comments,metadata
  ) values (
    v_company_id,v_case.id,'overridden','in_review','approved',auth.uid(),
    coalesce(v_actor_name,auth.jwt()->>'email','Owner/Admin'),'admin',
    v_actor_department,trim(p_reason),
    jsonb_build_object('emergency_override',true,'skipped_independent_review',true)
  );
  return v_case.id;
end;
$$;

-- Existing open owner expenses adopt the new terminology and no longer wait
-- for a later self-sanction step. Their current manager task remains pending;
-- the reason-required owner override is available when no manager is assigned.
update public.approval_tasks t
set step_name='Manager verification',decision_type='verification',department='Management Control'
from public.approval_cases c
join public.user_roles ur on ur.user_id=c.submitted_by
where t.case_id=c.id and c.status='in_review'
  and c.document_type in ('field_expense','expense','employee_reimbursement')
  and ur.role::text='admin' and t.required_role='manager'
  and t.status in ('pending','blocked');

update public.approval_tasks t
set status='skipped',comments='Skipped: owner authorisation is recorded at submission.'
from public.approval_cases c
join public.user_roles ur on ur.user_id=c.submitted_by
where t.case_id=c.id and c.status='in_review'
  and c.document_type in ('field_expense','expense','employee_reimbursement')
  and ur.role::text='admin' and t.required_role in ('accounts','admin')
  and t.status='blocked';

create or replace view public.approval_task_inbox
with (security_invoker=true)
as
select
  t.id as task_id,t.case_id,t.step_order,t.step_name,t.department,t.required_role,t.due_at,
  c.document_type,c.document_id,c.document_ref,c.title,c.amount,c.metric_label,c.project_id,c.unit_id,c.vendor_id,
  c.submitted_by,c.submitted_by_name,c.submitted_at,c.snapshot,w.name as workflow_name,
  t.decision_type
from public.approval_tasks t
join public.approval_cases c on c.id=t.case_id
join public.approval_workflows w on w.id=c.workflow_id
where t.status='pending'
  and t.company_id=public.auth_company_id()
  and c.submitted_by<>auth.uid()
  and (
    public.auth_role()='admin'
    or (
      t.required_role=public.auth_role()
      and (t.approver_user_id is null or t.approver_user_id=auth.uid())
      and (
        not t.enforce_department
        or lower(coalesce(t.department,''))=lower(coalesce((select department from public.user_profiles where id=auth.uid()),''))
      )
    )
    or exists (
      select 1
      from public.approval_delegations d
      join public.user_profiles delegator
        on delegator.id=d.delegator_id and delegator.company_id=d.company_id and delegator.is_active
      join public.user_roles delegator_role on delegator_role.user_id=d.delegator_id
      where d.company_id=t.company_id and d.delegate_id=auth.uid() and d.is_active
        and now() between d.starts_at and d.ends_at
        and (d.document_type is null or d.document_type=c.document_type)
        and (d.department is null or lower(d.department)=lower(coalesce(t.department,'')))
        and (
          (t.approver_user_id is not null and d.delegator_id=t.approver_user_id)
          or (
            t.approver_user_id is null
            and delegator_role.role::text=t.required_role
            and (not t.enforce_department or lower(coalesce(delegator.department,''))=lower(coalesce(t.department,'')))
          )
        )
    )
  );

grant select on public.approval_task_inbox to authenticated;

revoke all on function public.submit_expense_approval_case(text,uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.submit_expense_approval_case(text,uuid,text,text,text,jsonb) to authenticated;
revoke all on function public.override_expense_approval_case(uuid,text) from public,anon;
grant execute on function public.override_expense_approval_case(uuid,text) to authenticated;

notify pgrst,'reload schema';
