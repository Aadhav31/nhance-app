import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
process.on('uncaughtException', error => { console.error(error.message, error.code, error.detail || '', error.where || ''); process.exit(1) });
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [company, actor, reviewer, machine, project, source, mirror, capture] = [1,2,3,4,5,6,7,8].map(id)
const foreignCompany = id(10)
const query = (sql, args = []) => db.query(sql, args)
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create table companies(id uuid primary key);
create table company_units(id uuid primary key);
create table vendors(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
create function public.auth_company_id() returns uuid language sql as $$ select nullif(current_setting('test.company',true),'')::uuid $$;
create function public.auth_role() returns text language sql as $$ select current_setting('test.role',true) $$;
create table equipment(id uuid primary key,company_id uuid,name text);
create table projects(id uuid primary key,company_id uuid,project_name text);
create table user_profiles(id uuid primary key,company_id uuid,is_active boolean default true,full_name text,department text);
create table user_roles(user_id uuid,role text);
create table field_expenses(id uuid primary key,company_id uuid,expense_date date,equipment_id uuid,equipment_name text,project_id uuid,project_name text,category text,payee_name text,amount numeric,created_by uuid,created_by_name text,approval_status text,updated_at timestamptz,fuel_quantity_liters numeric(14,3),fuel_rate_per_liter numeric(14,3),fuel_meter_reading numeric(14,2),fuel_source text,bill_number text,unit_id uuid);
create table expenses(id uuid primary key,company_id uuid,expense_date date,equipment_id uuid,project_id uuid,category text,vendor_name text,amount numeric,total_amount numeric,created_by uuid,field_expense_id uuid,expense_scope text,status text,fuel_quantity_liters numeric(14,3),fuel_rate_per_liter numeric(14,3),fuel_meter_reading numeric(14,2),fuel_source text,bill_number text,unit_id uuid,vendor_id uuid,reference_number text,bank_reference text);
create table account_transactions(company_id uuid,reference_type text,reference_id uuid,txn_date date,amount numeric);
create table if not exists public.approval_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_key text not null,
  document_type text not null,
  name text not null,
  description text,
  project_id uuid references public.projects(id) on delete cascade,
  unit_id uuid references public.company_units(id) on delete cascade,
  priority integer not null default 100,
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, workflow_key, version)
);

create table if not exists public.approval_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.approval_workflows(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  step_key text not null,
  name text not null,
  department text,
  required_role text not null check (required_role in ('operator','supervisor','manager','accounts','admin')),
  approver_user_id uuid references auth.users(id) on delete set null,
  enforce_department boolean not null default false,
  allow_self_approval boolean not null default false,
  sla_hours integer not null default 24 check (sla_hours between 1 and 8760),
  min_amount numeric(18,2),
  max_amount numeric(18,2),
  instructions text,
  created_at timestamptz not null default now(),
  unique (workflow_id, step_order),
  unique (workflow_id, step_key),
  check (min_amount is null or max_amount is null or min_amount <= max_amount)
);

create table if not exists public.approval_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_id uuid not null references public.approval_workflows(id),
  workflow_version integer not null,
  document_type text not null,
  document_id uuid not null,
  document_ref text,
  title text not null,
  amount numeric(18,2) not null default 0,
  metric_label text not null default 'Amount',
  project_id uuid references public.projects(id) on delete set null,
  unit_id uuid references public.company_units(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  requester_department text,
  submitted_by uuid not null references auth.users(id),
  submitted_by_name text,
  current_step_order integer,
  status text not null default 'in_review'
    check (status in ('in_review','approved','rejected','returned','cancelled')),
  snapshot jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists approval_cases_one_active_document
  on public.approval_cases(company_id, document_type, document_id)
  where status = 'in_review';
create index if not exists approval_cases_company_status
  on public.approval_cases(company_id, status, submitted_at desc);
create index if not exists approval_cases_requester
  on public.approval_cases(submitted_by, submitted_at desc);

create table if not exists public.approval_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.approval_cases(id) on delete cascade,
  workflow_step_id uuid not null references public.approval_workflow_steps(id),
  step_order integer not null,
  step_name text not null,
  department text,
  required_role text not null,
  approver_user_id uuid references auth.users(id) on delete set null,
  enforce_department boolean not null default false,
  allow_self_approval boolean not null default false,
  status text not null default 'blocked'
    check (status in ('blocked','pending','approved','rejected','returned','skipped','cancelled')),
  due_at timestamptz,
  acted_by uuid references auth.users(id) on delete set null,
  acted_by_name text,
  acted_at timestamptz,
  comments text,
  created_at timestamptz not null default now(),
  unique (case_id, workflow_step_id)
);

create index if not exists approval_tasks_inbox
  on public.approval_tasks(company_id, status, due_at)
  where status = 'pending';
create index if not exists approval_tasks_case
  on public.approval_tasks(case_id, step_order);

create table if not exists public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.approval_cases(id) on delete cascade,
  task_id uuid references public.approval_tasks(id) on delete set null,
  action text not null check (action in ('submitted','approved','rejected','returned','cancelled','reassigned','delegated','processed')),
  from_status text,
  to_status text,
  actor_id uuid not null references auth.users(id),
  actor_name text,
  actor_role text,
  actor_department text,
  comments text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists approval_actions_case
  on public.approval_actions(case_id, created_at);

create table fuel_expense_captures(id uuid primary key default gen_random_uuid(),company_id uuid,source_document_type text,source_document_id uuid,expense_date date,equipment_id uuid,project_id uuid,quantity_liters numeric,rate_per_liter numeric,total_amount numeric,meter_reading numeric,fuel_source text,vendor_name text,bill_number text,receipt_url text,approval_case_id uuid,status text,missing_fields text[],source_snapshot jsonb,created_by uuid,updated_at timestamptz,fuel_issue_id uuid,reviewed_by uuid,reviewed_at timestamptz,unique(company_id,source_document_type,source_document_id));
create table fuel_issues(id uuid primary key default gen_random_uuid(),company_id uuid,issue_date date,equipment_id uuid,equipment_name text,quantity_liters numeric,fuel_source text,meter_at_issue numeric,issued_by uuid,issued_by_name text,voucher_number text,notes text,vendor_name text,project_id uuid,rate_per_liter numeric,total_amount numeric,expense_capture_id uuid,approval_status text);
create unique index on fuel_issues(expense_capture_id) where expense_capture_id is not null;
`)
await db.exec(`
alter table public.approval_tasks add column decision_type text;
create table public.approval_delegations(company_id uuid,delegate_id uuid,delegator_id uuid,is_active boolean,starts_at timestamptz,ends_at timestamptz,document_type text,department text);
create or replace function public.seed_default_approval_workflows(uuid) returns void language plpgsql as $$ begin return; end $$;
create or replace function public.sync_approval_source_status(text,uuid,text) returns void language plpgsql as $$ begin if $1='field_expense' then update public.field_expenses set approval_status=$3 where id=$2; else update public.expenses set status=$3 where id=$2; end if; end $$;
create or replace function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
`)
await db.exec(`create or replace function public.act_on_approval_task(
  p_task_id uuid,
  p_action text,
  p_comments text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_task public.approval_tasks%rowtype;
  v_case public.approval_cases%rowtype;
  v_actor_name text;
  v_actor_department text;
  v_actor_role text := public.auth_role();
  v_eligible boolean := false;
  v_next public.approval_tasks%rowtype;
  v_sla integer;
  v_final_status text;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_action not in ('approved','rejected','returned') then
    raise exception 'Action must be approved, rejected or returned';
  end if;
  if p_action in ('rejected','returned') and nullif(trim(p_comments),'') is null then
    raise exception 'A reason is required when rejecting or returning an item';
  end if;

  select * into v_task from public.approval_tasks where id=p_task_id for update;
  if v_task.id is null or v_task.company_id is distinct from v_company_id then
    raise exception 'Approval task not found' using errcode='42501';
  end if;
  if v_task.status <> 'pending' then raise exception 'This task is no longer pending'; end if;
  select * into v_case from public.approval_cases where id=v_task.case_id for update;
  if v_case.status <> 'in_review' then raise exception 'This approval is already closed'; end if;

  select up.full_name, nullif(trim(up.department),'') into v_actor_name,v_actor_department
  from public.user_profiles up where up.id=auth.uid() and up.company_id=v_company_id;

  v_eligible := v_actor_role='admin'
    or (
      v_task.required_role=v_actor_role
      and (v_task.approver_user_id is null or v_task.approver_user_id=auth.uid())
      and (not v_task.enforce_department or lower(coalesce(v_task.department,''))=lower(coalesce(v_actor_department,'')))
    )
    or exists (
      select 1
      from public.approval_delegations d
      join public.user_profiles delegator
        on delegator.id=d.delegator_id and delegator.company_id=d.company_id and delegator.is_active
      join public.user_roles delegator_role on delegator_role.user_id=d.delegator_id
      where d.company_id=v_company_id and d.delegate_id=auth.uid() and d.is_active
        and now() between d.starts_at and d.ends_at
        and (d.document_type is null or d.document_type=v_case.document_type)
        and (d.department is null or lower(d.department)=lower(coalesce(v_task.department,'')))
        and (
          (v_task.approver_user_id is not null and d.delegator_id=v_task.approver_user_id)
          or (
            v_task.approver_user_id is null
            and delegator_role.role::text=v_task.required_role
            and (not v_task.enforce_department or lower(coalesce(delegator.department,''))=lower(coalesce(v_task.department,'')))
          )
        )
    );
  if not v_eligible then raise exception 'You are not an eligible approver for this step' using errcode='42501'; end if;
  if not v_task.allow_self_approval and v_case.submitted_by=auth.uid() then
    raise exception 'Maker-checker rule: the requester cannot approve this item' using errcode='42501';
  end if;

  update public.approval_tasks set status=p_action,acted_by=auth.uid(),
    acted_by_name=coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),acted_at=now(),comments=nullif(trim(p_comments),'')
  where id=p_task_id;

  if p_action='approved' then
    select * into v_next from public.approval_tasks
    where case_id=v_case.id and status='blocked' and step_order>v_task.step_order
    order by step_order limit 1 for update;
    if v_next.id is not null then
      select sla_hours into v_sla from public.approval_workflow_steps where id=v_next.workflow_step_id;
      update public.approval_tasks set status='pending',due_at=now()+make_interval(hours=>coalesce(v_sla,24)) where id=v_next.id;
      update public.approval_cases set current_step_order=v_next.step_order,updated_at=now() where id=v_case.id;
      v_final_status := 'in_review';
    else
      update public.approval_cases set status='approved',current_step_order=null,completed_at=now(),updated_at=now() where id=v_case.id;
      perform public.sync_approval_source_status(v_case.document_type,v_case.document_id,'approved');
      v_final_status := 'approved';
    end if;
  else
    update public.approval_tasks set status='cancelled' where case_id=v_case.id and status='blocked';
    update public.approval_cases set status=p_action,current_step_order=null,completed_at=now(),updated_at=now() where id=v_case.id;
    perform public.sync_approval_source_status(v_case.document_type,v_case.document_id,p_action);
    v_final_status := p_action;
  end if;

  insert into public.approval_actions (
    company_id,case_id,task_id,action,from_status,to_status,actor_id,actor_name,actor_role,actor_department,comments,
    metadata
  ) values (
    v_company_id,v_case.id,p_task_id,p_action,'pending',v_final_status,auth.uid(),
    coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),v_actor_role,v_actor_department,nullif(trim(p_comments),''),
    jsonb_build_object('step_order',v_task.step_order,'step_name',v_task.step_name)
  );
  return v_case.id;
end;
$$;`)
await db.exec(`create or replace function public.submit_fuel_expense_approval_case(
  p_document_type text,
  p_document_id uuid,
  p_document_ref text default null,
  p_title text default null,
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
  v_amount numeric;
  v_project_id uuid;
  v_equipment_id uuid;
  v_unit_id uuid;
  v_vendor_id uuid;
  v_quantity numeric;
  v_rate numeric;
  v_meter numeric;
  v_source text;
  v_category text;
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
  if p_document_type not in ('field_expense','expense') or p_document_id is null then
    raise exception 'Fuel review supports field expense and company expense records only';
  end if;
  if exists (
    select 1 from public.approval_cases c
    where c.company_id=v_company_id and c.document_type=p_document_type
      and c.document_id=p_document_id and c.status='in_review'
  ) then
    raise exception 'This fuel expense already has an active approval';
  end if;

  if p_document_type='field_expense' then
    select fe.amount,fe.project_id,fe.equipment_id,fe.unit_id,null::uuid,fe.category,
      fe.fuel_quantity_liters,fe.fuel_rate_per_liter,fe.fuel_meter_reading,
      coalesce(fe.fuel_source,'petrol_pump'),coalesce(fe.bill_number,v_document_ref)
    into v_amount,v_project_id,v_equipment_id,v_unit_id,v_vendor_id,v_category,
      v_quantity,v_rate,v_meter,v_source,v_document_ref
    from public.field_expenses fe
    where fe.id=p_document_id and fe.company_id=v_company_id;
  else
    select coalesce(e.total_amount,e.amount),e.project_id,e.equipment_id,e.unit_id,e.vendor_id,e.category,
      e.fuel_quantity_liters,e.fuel_rate_per_liter,e.fuel_meter_reading,
      coalesce(e.fuel_source,'petrol_pump'),
      coalesce(e.reference_number,e.bill_number,e.bank_reference,v_document_ref)
    into v_amount,v_project_id,v_equipment_id,v_unit_id,v_vendor_id,v_category,
      v_quantity,v_rate,v_meter,v_source,v_document_ref
    from public.expenses e
    where e.id=p_document_id and e.company_id=v_company_id and e.field_expense_id is null;
  end if;
  if not found then raise exception 'Fuel expense was not found in your company' using errcode='42501'; end if;
  if lower(coalesce(v_category,''))<>'fuel' then raise exception 'The source expense is not categorised as fuel'; end if;
  if v_equipment_id is null then raise exception 'Select the equipment receiving the fuel'; end if;
  if v_project_id is null then raise exception 'Select the project using the fuel'; end if;
  if coalesce(v_quantity,0)<=0 then raise exception 'Enter the diesel quantity in litres'; end if;
  if coalesce(v_amount,0)<=0 then raise exception 'Enter the fuel expense amount'; end if;
  if not exists (select 1 from public.equipment e where e.id=v_equipment_id and e.company_id=v_company_id) then
    raise exception 'The selected equipment does not belong to this company' using errcode='42501';
  end if;
  if not exists (select 1 from public.projects p where p.id=v_project_id and p.company_id=v_company_id) then
    raise exception 'The selected project does not belong to this company' using errcode='42501';
  end if;
  if coalesce(v_rate,0)<=0 then v_rate := round(v_amount/v_quantity,3); end if;

  perform public.seed_default_approval_workflows(v_company_id);
  select * into v_workflow
  from public.approval_workflows w
  where w.company_id=v_company_id and w.document_type=p_document_type and w.is_active
    and (w.project_id is null or w.project_id=v_project_id)
    and (w.unit_id is null or w.unit_id=v_unit_id)
  order by (w.project_id is not null) desc,(w.unit_id is not null) desc,w.priority desc,w.version desc
  limit 1;
  if v_workflow.id is null then raise exception 'No active expense approval workflow is configured'; end if;

  select * into v_manager_step from public.approval_workflow_steps
  where workflow_id=v_workflow.id and required_role='manager' order by step_order limit 1;
  select * into v_accounts_step from public.approval_workflow_steps
  where workflow_id=v_workflow.id and required_role='accounts' order by step_order limit 1;
  select * into v_admin_step from public.approval_workflow_steps
  where workflow_id=v_workflow.id and required_role='admin' order by step_order limit 1;

  select up.full_name,nullif(trim(up.department),'') into v_actor_name,v_actor_department
  from public.user_profiles up where up.id=auth.uid() and up.company_id=v_company_id;
  select exists (
    select 1 from public.user_profiles up join public.user_roles ur on ur.user_id=up.id
    where up.company_id=v_company_id and up.is_active and ur.role::text='manager' and up.id<>auth.uid()
  ) into v_has_manager;
  select exists (
    select 1 from public.user_profiles up join public.user_roles ur on ur.user_id=up.id
    where up.company_id=v_company_id and up.is_active and ur.role::text='accounts' and up.id<>auth.uid()
  ) into v_has_accounts;
  select exists (
    select 1 from public.user_profiles up join public.user_roles ur on ur.user_id=up.id
    where up.company_id=v_company_id and up.is_active and ur.role::text='admin' and up.id<>auth.uid()
  ) into v_has_admin;

  v_title := coalesce(v_title,'Fuel expense · '||v_quantity||' L',v_document_ref);
  v_snapshot := v_snapshot || jsonb_build_object(
    'server_verified',true,'mandatory_fuel_review',true,'verified_value',v_amount,
    'verified_reference',v_document_ref,'equipment_id',v_equipment_id,'project_id',v_project_id,
    'quantity_liters',v_quantity,'rate_per_liter',v_rate,'meter_reading',v_meter,
    'fuel_source',v_source,'requester_role',v_actor_role,'owner_authorised',v_actor_role='admin'
  );

  insert into public.approval_cases (
    company_id,workflow_id,workflow_version,document_type,document_id,document_ref,title,
    amount,metric_label,project_id,unit_id,vendor_id,requester_department,
    submitted_by,submitted_by_name,snapshot
  ) values (
    v_company_id,v_workflow.id,v_workflow.version,p_document_type,p_document_id,v_document_ref,v_title,
    v_amount,'Fuel expense',v_project_id,v_unit_id,v_vendor_id,v_actor_department,
    auth.uid(),coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),v_snapshot
  ) returning id into v_case_id;

  if v_actor_role='admin' then
    if not v_has_manager or v_manager_step.id is null then
      raise exception 'Assign an active manager to independently verify the owner''s fuel expense';
    end if;
    v_task_order := v_task_order+1;
    insert into public.approval_tasks (
      company_id,case_id,workflow_step_id,step_order,step_name,department,required_role,
      approver_user_id,enforce_department,allow_self_approval,decision_type,status
    ) values (
      v_company_id,v_case_id,v_manager_step.id,v_task_order,'Fuel quantity & equipment verification',
      'Management Control','manager',v_manager_step.approver_user_id,false,false,'verification','blocked'
    );
    if v_has_accounts and v_accounts_step.id is not null then
      v_task_order := v_task_order+1;
      insert into public.approval_tasks (
        company_id,case_id,workflow_step_id,step_order,step_name,department,required_role,
        approver_user_id,enforce_department,allow_self_approval,decision_type,status
      ) values (
        v_company_id,v_case_id,v_accounts_step.id,v_task_order,'Fuel bill & rate verification',
        'Accounts','accounts',v_accounts_step.approver_user_id,false,false,'verification','blocked'
      );
    end if;
  else
    if not v_has_admin then raise exception 'No active owner/admin is configured to approve this fuel expense'; end if;
    if v_actor_role<>'manager' and v_has_manager and v_manager_step.id is not null then
      v_task_order := v_task_order+1;
      insert into public.approval_tasks (
        company_id,case_id,workflow_step_id,step_order,step_name,department,required_role,
        approver_user_id,enforce_department,allow_self_approval,decision_type,status
      ) values (
        v_company_id,v_case_id,v_manager_step.id,v_task_order,'Fuel quantity & equipment verification',
        'Management Control','manager',v_manager_step.approver_user_id,false,false,'verification','blocked'
      );
    end if;
    if v_actor_role<>'accounts' and v_has_accounts and v_accounts_step.id is not null then
      v_task_order := v_task_order+1;
      insert into public.approval_tasks (
        company_id,case_id,workflow_step_id,step_order,step_name,department,required_role,
        approver_user_id,enforce_department,allow_self_approval,decision_type,status
      ) values (
        v_company_id,v_case_id,v_accounts_step.id,v_task_order,'Fuel bill & rate verification',
        'Accounts','accounts',v_accounts_step.approver_user_id,false,false,'verification','blocked'
      );
    end if;
    if v_admin_step.id is null then raise exception 'The expense workflow needs an owner/admin step'; end if;
    v_task_order := v_task_order+1;
    insert into public.approval_tasks (
      company_id,case_id,workflow_step_id,step_order,step_name,department,required_role,
      approver_user_id,enforce_department,allow_self_approval,decision_type,status
    ) values (
      v_company_id,v_case_id,v_admin_step.id,v_task_order,
      case when v_actor_role='manager' then 'Owner approval' else 'Owner fuel sanction' end,
      'Management','admin',v_admin_step.approver_user_id,false,false,'sanction','blocked'
    );
  end if;

  select min(step_order) into v_first_order from public.approval_tasks where case_id=v_case_id;
  if v_first_order is null then raise exception 'No independent fuel reviewer is configured'; end if;
  update public.approval_tasks t set status='pending',due_at=now()+make_interval(hours=>coalesce(s.sla_hours,24))
  from public.approval_workflow_steps s
  where t.case_id=v_case_id and t.step_order=v_first_order and s.id=t.workflow_step_id;
  update public.approval_cases set current_step_order=v_first_order,updated_at=now() where id=v_case_id;

  insert into public.approval_actions (
    company_id,case_id,action,to_status,actor_id,actor_name,actor_role,actor_department,comments,metadata
  ) values (
    v_company_id,v_case_id,'submitted','in_review',auth.uid(),
    coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),v_actor_role,v_actor_department,
    'Fuel is staged only; the official equipment register updates after independent approval.',
    jsonb_build_object('mandatory_fuel_review',true,'quantity_liters',v_quantity,'rate_per_liter',v_rate)
  );
  perform public.sync_approval_source_status(p_document_type,p_document_id,'in_review');
  return jsonb_build_object(
    'case_id',v_case_id,'status','in_review','approval_required',true,
    'route',case when v_actor_role='admin' then 'owner_to_fuel_verifier'
      when v_actor_role='manager' then 'manager_to_owner' else 'employee_to_management' end,
    'mandatory_fuel_review',true
  );
end;
$$;`)
const migration = await readFile('supabase/migrations/20260930171153_fuel_capture_completion.sql', 'utf8')
await db.exec(migration)
for (const table of ['field_expenses', 'expenses']) await db.exec(`
create trigger guard_fuel before update or delete on ${table} for each row execute function guard_fuel_expense_integrity();
create trigger sync_fuel after insert or update or delete on ${table} for each row execute function sync_fuel_expense_capture();`)
await query(`select set_config('test.company',$1,false),set_config('test.user',$2,false),set_config('test.role','admin',false)`, [company,actor])
await query('insert into equipment values($1,$2,$3)',[machine,company,'Test excavator'])
await query('insert into projects values($1,$2,$3)',[project,company,'Test project'])
await query('insert into equipment values($1,$2,$3)',[id(11),foreignCompany,'Other company equipment'])
await query('insert into projects values($1,$2,$3)',[id(12),foreignCompany,'Other company project'])
await query('insert into user_profiles(id,company_id) values($1,$2),($3,$2)',[actor,company,reviewer])
await query('insert into companies values($1)',[company])
await query('insert into auth.users values($1),($2)',[actor,reviewer])
await query("insert into user_roles values($1,'admin'),($2,'manager')",[actor,reviewer])
for (const type of ['field_expense','expense']) {
 const workflow=(await query('insert into approval_workflows(company_id,workflow_key,document_type,name) values($1,$2,$2,$2) returning id',[company,type])).rows[0].id
 await query("insert into approval_workflow_steps(workflow_id,step_order,step_key,name,required_role) values($1,1,'admin','Owner','admin'),($1,2,'manager','Manager','manager')",[workflow])
}

await query(`insert into field_expenses(id,company_id,expense_date,equipment_id,category,payee_name,amount,created_by,approval_status) values($1,$2,'2026-09-30',$3,'fuel','Test operator',2000,$4,'not_submitted')`,[source,company,machine,actor])
await query(`update fuel_expense_captures set id=$1 where source_document_id=$2`,[capture,source])
await query(`insert into expenses(id,company_id,field_expense_id,expense_date,category,vendor_name,amount,total_amount,created_by,status) values($1,$2,$3,'2026-09-30','fuel','Test operator',2000,2000,$4,'draft')`,[mirror,company,source,actor])
await query(`insert into account_transactions values($1,'field_expense',$2,'2026-09-30',2000)`,[company,source])
const details = { expense_date:'2026-09-29', equipment_id:machine, project_id:project, quantity_liters:20, rate_per_liter:100, station_name:'Test Fuel Station', bill_number:'DEMO-01', meter_reading:0, fuel_source:'petrol_pump' }
const complete = (change={},submit=true,captureId=capture) => query('select complete_fuel_expense_capture($1,$2::jsonb,$3) result',[captureId,JSON.stringify({...details,...change}),submit])
const row = async (table, rowId) => (await query(`select * from ${table} where id=$1`,[rowId])).rows[0]
await assert.rejects(complete({ quantity_liters:10 }), /must match/)
await assert.rejects(complete({ equipment_id:id(11) }), /your company/)
await assert.rejects(complete({ project_id:id(12) }), /your company/)
await assert.rejects(complete({ rate_per_liter:'NaN' }), /positive litres/)
await query("select set_config('test.user',$1,false),set_config('test.role','operator',false)",[reviewer])
await assert.rejects(complete(), /submitter or finance team/)
await query("select set_config('test.company',$1,false)",[foreignCompany])
await assert.rejects(complete(), /not found in your company|Authentication required/)
await query("select set_config('test.company',$1,false),set_config('test.user',$2,false),set_config('test.role','admin',false)",[company,actor]); await query('update user_profiles set is_active=false where id=$1',[reviewer])
await assert.rejects(complete(), /independently verify/)
assert.equal((await row('field_expenses',source)).fuel_quantity_liters,null)
assert.equal((await row('expenses',mirror)).fuel_quantity_liters,null)
assert.equal((await query('select count(*) from approval_cases')).rows[0].count,0)
await query('update user_profiles set is_active=true where id=$1',[reviewer])
await complete({},false)
assert.equal((await row('field_expenses',source)).payee_name,'Test operator')
assert.equal((await row('expenses',mirror)).vendor_name,'Test operator')
assert.equal(Number((await row('expenses',mirror)).total_amount),2000)
assert.equal((await row('fuel_expense_captures',capture)).source_snapshot.station_name,'Test Fuel Station')
assert.equal((await query('select count(*) from fuel_issues')).rows[0].count,0)
await complete()
assert.equal((await row('fuel_expense_captures',capture)).status,'pending_review')
await assert.rejects(complete(), /awaiting review/)
await assert.rejects(query('update field_expenses set fuel_station_name=$1 where id=$2',['Changed',source]), /Return or cancel/)
const approval = (await query('select * from approval_cases')).rows[0]
assert.equal(approval.snapshot.station_name,'Test Fuel Station')
const task=(await query('select * from approval_tasks where case_id=$1',[approval.id])).rows[0]
assert.equal(task.required_role,'manager'); assert.equal(task.allow_self_approval,false)
await assert.rejects(query("select act_on_approval_task($1,'approved')",[task.id]), /requester cannot approve/)
await query("select set_config('test.user',$1,false),set_config('test.role','manager',false)",[reviewer])
await query("select act_on_approval_task($1,'approved')",[task.id])
await query('update field_expenses set id=id where id=$1',[source])
assert.equal((await row('fuel_expense_captures',capture)).status,'approved')
const issues = (await query('select * from fuel_issues')).rows
assert.equal(issues.length,1)
assert.equal(issues[0].vendor_name,'Test operator')
assert.equal(issues[0].station_name,'Test Fuel Station')
assert.equal(issues[0].voucher_number,'DEMO-01')
assert.equal(Number(issues[0].quantity_liters),20)
await query("select set_config('test.user',$1,false),set_config('test.role','admin',false)",[actor])
await assert.rejects(complete(), /approved or awaiting review/)
await assert.rejects(query('update field_expenses set fuel_station_name=$1 where id=$2',['Changed',source]), /immutable/)
// Standalone company expenses follow the same atomic path and avoid a mirror.
await query(`insert into expenses(id,company_id,expense_date,equipment_id,category,vendor_name,amount,total_amount,created_by,status) values($1,$2,'2026-09-30',$3,'fuel','Company vendor',2000,2000,$4,'draft')`,[id(15),company,machine,actor])
const companyCapture=(await query('select id from fuel_expense_captures where source_document_id=$1',[id(15)])).rows[0].id
await complete({},false,companyCapture)
assert.equal((await row('expenses',id(15))).fuel_station_name,'Test Fuel Station')
assert.equal(Number((await row('expenses',id(15))).total_amount),2000)
assert.equal((await query('select count(*) from fuel_issues')).rows[0].count,1)
assert.equal((await query("select has_function_privilege('anon','complete_fuel_expense_capture(uuid,jsonb,boolean)','execute') allowed")).rows[0].allowed,false)
await db.exec(`
grant usage on schema public,auth to authenticated;
grant select on public.field_expenses,public.expenses,public.fuel_expense_captures,public.approval_cases,public.user_profiles,public.equipment,public.projects to authenticated;
grant update on public.field_expenses,public.expenses to authenticated;
alter table public.fuel_expense_captures enable row level security;
create policy capture_company_read on public.fuel_expense_captures for select to authenticated using(company_id=auth_company_id());
`)
await db.exec('set role authenticated')
await complete({},false,companyCapture)
assert.equal((await query("select prosecdef from pg_proc where oid='public.complete_fuel_expense_capture(uuid,jsonb,boolean)'::regprocedure")).rows[0].prosecdef,false)
await db.exec('reset role')
await db.close()
console.log('Fuel database checks passed: tenant/actor authorization, receipt validation, atomic rollback, mirrors, pending exclusion, approval posting, immutability and no duplicate fuel issue.')
