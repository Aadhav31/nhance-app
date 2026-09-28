-- Enterprise approval workflows for multi-project construction companies.
--
-- Design goals:
--   * one sequential workflow engine for every commercial and operational document
--   * maker/checker separation with role, department and named-user routing
--   * amount-aware approval levels, SLA dates, delegation and immutable actions
--   * atomic transitions: a task and its source document cannot disagree
--   * additive rollout alongside the legacy approval_requests table

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

alter table public.field_expenses
  add column if not exists approval_status text not null default 'not_submitted'
  check (approval_status in ('not_submitted','in_review','approved','rejected','returned','cancelled'));

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

create table if not exists public.approval_delegations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delegator_id uuid not null references auth.users(id) on delete cascade,
  delegate_id uuid not null references auth.users(id) on delete cascade,
  document_type text,
  department text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (delegator_id <> delegate_id),
  check (starts_at < ends_at)
);

create index if not exists approval_delegations_active
  on public.approval_delegations(company_id, delegate_id, starts_at, ends_at)
  where is_active;

-- Source record for vendor payments. Approval and payment execution are separate
-- so an approval never pretends that money has already moved.
create table if not exists public.vendor_payment_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_number text not null,
  bill_id uuid references public.bills(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete restrict,
  vendor_name text not null,
  requested_amount numeric(18,2) not null check (requested_amount > 0),
  requested_payment_date date,
  payment_mode text,
  notes text,
  status text not null default 'draft'
    check (status in ('draft','in_review','approved','rejected','returned','processed','cancelled')),
  requested_by uuid not null references auth.users(id),
  approved_at timestamptz,
  processed_at timestamptz,
  processed_by uuid references auth.users(id),
  processed_payment_id uuid references public.payments_made(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, request_number)
);

-- Unified transfer request for equipment and tools/tackles. Final approval makes
-- the transfer ready for dispatch; destination receipt remains an explicit event.
create table if not exists public.asset_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_number text not null,
  asset_kind text not null check (asset_kind in ('equipment','tools_tackles')),
  equipment_id uuid references public.equipment(id) on delete restrict,
  item_id uuid references public.inventory_items(id) on delete restrict,
  quantity numeric(18,3),
  from_project_id uuid references public.projects(id) on delete restrict,
  to_project_id uuid references public.projects(id) on delete restrict,
  from_store_id uuid references public.stores(id) on delete restrict,
  to_store_id uuid references public.stores(id) on delete restrict,
  required_by date,
  reason text not null,
  notes text,
  status text not null default 'draft'
    check (status in ('draft','in_review','approved','rejected','returned','dispatched','received','cancelled')),
  requested_by uuid not null references auth.users(id),
  approved_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  received_by uuid references auth.users(id),
  executed_transaction_id uuid references public.stock_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, transfer_number),
  check (
    (asset_kind = 'equipment' and equipment_id is not null)
    or (asset_kind = 'tools_tackles' and item_id is not null and quantity > 0)
  )
);

create table if not exists public.vendor_work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_order_number text not null,
  work_order_date date not null default current_date,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  vendor_name text not null,
  project_id uuid references public.projects(id) on delete restrict,
  scope_of_work text not null,
  contract_amount numeric(18,2) not null check (contract_amount > 0),
  start_date date,
  completion_date date,
  payment_terms text,
  retention_percent numeric(7,3) not null default 0,
  performance_security text,
  notes text,
  status text not null default 'draft'
    check (status in ('draft','in_review','approved','rejected','returned','issued','closed','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, work_order_number)
);

-- ---------------------------------------------------------------------------
-- Default policy catalogue. Amount thresholds are deliberately visible and
-- editable by a company admin after the safe baseline is created.
-- ---------------------------------------------------------------------------

create or replace function public.seed_default_approval_workflows(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow_id uuid;
  v_actor uuid := auth.uid();
begin
  if p_company_id is null then return; end if;
  if auth.uid() is not null and p_company_id is distinct from public.auth_company_id() then
    raise exception 'Company access denied' using errcode = '42501';
  end if;

  insert into public.approval_workflows
    (company_id, workflow_key, document_type, name, description, created_by)
  values
    (p_company_id, 'purchase_order_default', 'purchase_order', 'Purchase order', 'Site need, procurement, budget and management sanction.', v_actor)
  on conflict (company_id, workflow_key, version) do nothing
  returning id into v_workflow_id;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='purchase_order_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'project_need','Project need approval','Projects','manager',24,null,'Confirm scope, quantity and project requirement.'),
    (v_workflow_id,2,'procurement_check','Procurement & commercial check','Procurement','manager',24,null,'Validate quotations, vendor and negotiated rate.'),
    (v_workflow_id,3,'budget_check','Budget availability','Accounts','accounts',24,500000,'Confirm budget head, tax and cash-flow impact.'),
    (v_workflow_id,4,'management_sanction','Management sanction','Management','admin',24,5000000,'Final sanction for high-value commitments.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'work_order_default','work_order','Vendor work order','Technical, commercial, finance and management approval.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='work_order_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'technical_scope','Technical scope','Projects','manager',24,null,'Verify scope, specifications and deliverables.'),
    (v_workflow_id,2,'commercial_terms','Commercial terms','Procurement','manager',24,null,'Verify rate analysis, terms, retention and penalties.'),
    (v_workflow_id,3,'finance_commitment','Finance commitment','Accounts','accounts',24,500000,'Validate budget, taxes and payment milestones.'),
    (v_workflow_id,4,'management_sanction','Management sanction','Management','admin',24,5000000,'Final sanction for high-value work orders.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'vendor_bill_default','vendor_bill','Vendor invoice','Receipt, work/quantity certification, tax check and sanction.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='vendor_bill_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'site_certification','Site / quantity certification','Projects','manager',24,null,'Match invoice to receipt, measurement or completed work.'),
    (v_workflow_id,2,'commercial_match','PO / WO commercial match','Procurement','manager',24,null,'Perform PO/WO, rate and variation check.'),
    (v_workflow_id,3,'accounts_verification','Accounts & tax verification','Accounts','accounts',24,null,'Check GST, deductions, duplicate invoice and ledger coding.'),
    (v_workflow_id,4,'management_sanction','Management sanction','Management','admin',24,2500000,'Sanction high-value vendor liability.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'vendor_payment_default','vendor_payment','Vendor payment','Due validation, treasury review and payment sanction.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='vendor_payment_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'bill_owner_release','Bill owner release','Projects','manager',16,null,'Confirm no hold, dispute or recoverable item remains.'),
    (v_workflow_id,2,'accounts_due_check','Accounts due check','Accounts','accounts',16,null,'Confirm approved bill, due date, deductions and bank details.'),
    (v_workflow_id,3,'finance_release','Finance / treasury release','Finance','manager',16,100000,'Check cash-flow plan and payment priority.'),
    (v_workflow_id,4,'management_sanction','Management sanction','Management','admin',16,1000000,'Final sanction for high-value payment release.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'field_expense_default','field_expense','Field expense','Site verification, accounts review and high-value sanction.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='field_expense_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'site_verification','Site verification','Projects','manager',16,null,'Validate business purpose, evidence and project allocation.'),
    (v_workflow_id,2,'accounts_check','Accounts check','Accounts','accounts',24,null,'Check receipt, tax and ledger classification.'),
    (v_workflow_id,3,'management_sanction','Management sanction','Management','admin',24,500000,'Sanction exceptional or high-value expenses.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'reimbursement_default','employee_reimbursement','Employee reimbursement','Reporting manager, accounts and high-value sanction.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='reimbursement_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'manager_check','Reporting manager','Projects','manager',24,null,'Verify expense was authorised and business-related.'),
    (v_workflow_id,2,'accounts_check','Accounts verification','Accounts','accounts',24,null,'Verify evidence, policy limit and duplicate claims.'),
    (v_workflow_id,3,'management_sanction','Management sanction','Management','admin',24,100000,'Sanction high-value reimbursement.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'expense_default','expense','Company expense','Department owner, accounts evidence review and management sanction.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='expense_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'department_owner','Department owner','Operations','manager',16,null,'Confirm business purpose, project allocation and evidence.'),
    (v_workflow_id,2,'accounts_check','Accounts & evidence check','Accounts','accounts',24,null,'Validate tax, evidence, duplicate entry and ledger head.'),
    (v_workflow_id,3,'management_sanction','Management sanction','Management','admin',24,500000,'Sanction high-value company expenses.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'leave_default','leave_request','Leave request','Reporting manager, HR record and long-leave sanction.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='leave_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'manager_coverage','Reporting manager & coverage','Projects','manager',24,null,'Confirm work coverage and site manpower.'),
    (v_workflow_id,2,'hr_validation','HR balance & policy','HR','manager',24,null,'Validate balance, leave type and policy.'),
    (v_workflow_id,3,'long_leave_sanction','Long leave sanction','Management','admin',24,15,'Required for leave of 15 days or more.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'equipment_transfer_default','equipment_transfer','Equipment transfer','Source release, P&M control and destination acceptance.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='equipment_transfer_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,instructions) values
    (v_workflow_id,1,'source_release','Source site release','Projects','manager',16,'Confirm release date, meter reading and pending liabilities.'),
    (v_workflow_id,2,'pnm_clearance','P&M clearance','P&M','manager',16,'Check condition, documents, transport and deployment plan.'),
    (v_workflow_id,3,'destination_acceptance','Destination site acceptance','Projects','manager',16,'Confirm readiness, custody and expected receipt.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'stock_transfer_default','stock_transfer','Tools & tackles transfer','Source store, project control and destination acceptance.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='stock_transfer_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,instructions) values
    (v_workflow_id,1,'source_store_release','Source store release','Stores','supervisor',12,'Verify quantity, condition and stock availability.'),
    (v_workflow_id,2,'project_clearance','Project / P&M clearance','P&M','manager',16,'Confirm requirement, transport and custody.'),
    (v_workflow_id,3,'destination_acceptance','Destination store acceptance','Stores','supervisor',16,'Accept custody and record shortages on receipt.')
  on conflict (workflow_id,step_order) do nothing;

  insert into public.approval_workflows (company_id,workflow_key,document_type,name,description,created_by)
  values (p_company_id,'ra_bill_default','ra_bill','RA bill certification','Project certification, accounts check and high-value sanction.',v_actor)
  on conflict (company_id,workflow_key,version) do nothing;
  select id into v_workflow_id from public.approval_workflows where company_id=p_company_id and workflow_key='ra_bill_default' and version=1;
  insert into public.approval_workflow_steps (workflow_id,step_order,step_key,name,department,required_role,sla_hours,min_amount,instructions) values
    (v_workflow_id,1,'project_certification','Project certification','Projects','manager',24,null,'Validate quantities, measurements, deductions and client evidence.'),
    (v_workflow_id,2,'accounts_check','Accounts & tax check','Accounts','accounts',24,null,'Validate tax, retention, advances and ledger impact.'),
    (v_workflow_id,3,'management_sanction','Management sanction','Management','admin',24,10000000,'Sanction RA bills of Rs. 1 crore and above.')
  on conflict (workflow_id,step_order) do nothing;
end;
$$;

-- Seed safe defaults for every existing tenant. New tenants are lazily seeded
-- on their first submission, so company creation remains decoupled.
do $$ declare c record; begin
  for c in select id from public.companies loop
    perform public.seed_default_approval_workflows(c.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Source status synchronization. This whitelist intentionally avoids dynamic
-- table names and runs inside the same transaction as each workflow action.
-- ---------------------------------------------------------------------------

create or replace function public.sync_approval_source_status(
  p_document_type text,
  p_document_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_document_type = 'purchase_order' then
    update public.purchase_orders set status = case p_status when 'in_review' then 'pending_approval' when 'approved' then 'confirmed' when 'returned' then 'draft' else p_status end
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type = 'work_order' then
    update public.vendor_work_orders set status=p_status,updated_at=now()
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type = 'vendor_bill' then
    update public.bills set status = case p_status when 'in_review' then 'pending_approval' when 'approved' then 'pending' when 'returned' then 'draft' else p_status end
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type = 'employee_reimbursement' then
    update public.employee_reimbursements set status=case when p_status='in_review' then 'pending' else p_status end
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type = 'field_expense' then
    update public.field_expenses set approval_status=p_status,updated_at=now()
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type = 'expense' then
    update public.expenses set status=(case when p_status in ('in_review','returned') then 'draft' else p_status end)::public.record_status
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type = 'leave_request' then
    update public.hr_leaves set status=case when p_status='in_review' then 'pending' else p_status end,
      approved_by=case when p_status='approved' then auth.uid()::text else approved_by end,
      approved_at=case when p_status='approved' then now() else approved_at end
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type = 'ra_bill' then
    update public.ra_bills set status=case p_status when 'in_review' then 'submitted' when 'returned' then 'draft' when 'rejected' then 'draft' else p_status end
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type = 'vendor_payment' then
    update public.vendor_payment_requests set status=p_status,
      approved_at=case when p_status='approved' then now() else approved_at end,
      updated_at=now()
    where id=p_document_id and company_id=public.auth_company_id();
  elsif p_document_type in ('equipment_transfer','stock_transfer') then
    update public.asset_transfer_requests set status=p_status,
      approved_at=case when p_status='approved' then now() else approved_at end,
      updated_at=now()
    where id=p_document_id and company_id=public.auth_company_id();
  end if;
end;
$$;

create or replace function public.submit_approval_case(
  p_document_type text,
  p_document_id uuid,
  p_document_ref text,
  p_title text,
  p_amount numeric default 0,
  p_project_id uuid default null,
  p_unit_id uuid default null,
  p_vendor_id uuid default null,
  p_metric_label text default 'Amount',
  p_snapshot jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_workflow public.approval_workflows%rowtype;
  v_case_id uuid;
  v_first_order integer;
  v_actor_name text;
  v_actor_department text;
  v_actor_role text := public.auth_role();
  v_amount numeric := 0;
  v_project_id uuid;
  v_unit_id uuid;
  v_vendor_id uuid;
  v_document_ref text;
  v_title text;
  v_snapshot jsonb;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_document_id is null or nullif(trim(p_document_type),'') is null then
    raise exception 'Document type and id are required';
  end if;
  if exists (
    select 1 from public.approval_cases
    where company_id=v_company_id and document_type=p_document_type
      and document_id=p_document_id and status='in_review'
  ) then
    raise exception 'This document already has an active approval';
  end if;

  -- Never trust client-supplied monetary values or routing dimensions. Resolve
  -- them from the source row in the authenticated tenant before selecting a
  -- workflow or applying a value threshold.
  v_document_ref := nullif(trim(p_document_ref),'');
  v_title := nullif(trim(p_title),'');
  v_snapshot := coalesce(p_snapshot,'{}'::jsonb);
  if p_document_type='purchase_order' then
    select po.total_amount,po.unit_id,po.vendor_id,po.po_number
      into v_amount,v_unit_id,v_vendor_id,v_document_ref
    from public.purchase_orders po where po.id=p_document_id and po.company_id=v_company_id;
  elsif p_document_type='work_order' then
    select wo.contract_amount,wo.project_id,wo.vendor_id,wo.work_order_number
      into v_amount,v_project_id,v_vendor_id,v_document_ref
    from public.vendor_work_orders wo where wo.id=p_document_id and wo.company_id=v_company_id;
  elsif p_document_type='vendor_bill' then
    select b.total_amount,b.project_id,b.unit_id,b.vendor_id,b.bill_number
      into v_amount,v_project_id,v_unit_id,v_vendor_id,v_document_ref
    from public.bills b where b.id=p_document_id and b.company_id=v_company_id;
  elsif p_document_type='vendor_payment' then
    select pr.requested_amount,pr.vendor_id,pr.request_number
      into v_amount,v_vendor_id,v_document_ref
    from public.vendor_payment_requests pr where pr.id=p_document_id and pr.company_id=v_company_id;
  elsif p_document_type='field_expense' then
    select fe.amount,fe.project_id,fe.unit_id,coalesce(fe.bill_number,v_document_ref)
      into v_amount,v_project_id,v_unit_id,v_document_ref
    from public.field_expenses fe where fe.id=p_document_id and fe.company_id=v_company_id;
  elsif p_document_type='expense' then
    select coalesce(e.total_amount,e.amount),e.project_id,e.unit_id,e.vendor_id
      into v_amount,v_project_id,v_unit_id,v_vendor_id
    from public.expenses e where e.id=p_document_id and e.company_id=v_company_id;
  elsif p_document_type='employee_reimbursement' then
    select er.amount into v_amount
    from public.employee_reimbursements er where er.id=p_document_id and er.company_id=v_company_id;
  elsif p_document_type='leave_request' then
    select l.days into v_amount
    from public.hr_leaves l where l.id=p_document_id and l.company_id=v_company_id;
  elsif p_document_type in ('equipment_transfer','stock_transfer') then
    select case when tr.asset_kind='tools_tackles' then coalesce(tr.quantity,0) else 0 end,
      tr.to_project_id,tr.transfer_number
      into v_amount,v_project_id,v_document_ref
    from public.asset_transfer_requests tr
    where tr.id=p_document_id and tr.company_id=v_company_id
      and tr.asset_kind=case when p_document_type='equipment_transfer' then 'equipment' else 'tools_tackles' end;
  elsif p_document_type='ra_bill' then
    select coalesce(ra.net_payable,ra.total_amount),boq.project_id,ra.ra_number
      into v_amount,v_project_id,v_document_ref
    from public.ra_bills ra
    join public.boq_documents boq on boq.id=ra.boq_id and boq.company_id=ra.company_id
    where ra.id=p_document_id and ra.company_id=v_company_id;
  else
    raise exception 'Unsupported approval document type: %', p_document_type;
  end if;
  if not found then
    raise exception 'Source document was not found in your company' using errcode='42501';
  end if;
  v_amount := coalesce(v_amount,0);
  v_title := coalesce(v_title,v_document_ref,p_document_type);
  v_snapshot := v_snapshot || jsonb_build_object(
    'server_verified',true,'verified_value',v_amount,'verified_reference',v_document_ref
  );

  perform public.seed_default_approval_workflows(v_company_id);
  select * into v_workflow
  from public.approval_workflows w
  where w.company_id=v_company_id and w.document_type=p_document_type and w.is_active
    and (w.project_id is null or w.project_id=v_project_id)
    and (w.unit_id is null or w.unit_id=v_unit_id)
  order by (w.project_id is not null) desc, (w.unit_id is not null) desc, w.priority desc, w.version desc
  limit 1;
  if v_workflow.id is null then
    raise exception 'No active approval workflow is configured for %', p_document_type;
  end if;

  select up.full_name, nullif(trim(up.department),'') into v_actor_name, v_actor_department
  from public.user_profiles up where up.id=auth.uid() and up.company_id=v_company_id;

  insert into public.approval_cases (
    company_id,workflow_id,workflow_version,document_type,document_id,document_ref,title,
    amount,metric_label,project_id,unit_id,vendor_id,requester_department,
    submitted_by,submitted_by_name,snapshot
  ) values (
    v_company_id,v_workflow.id,v_workflow.version,p_document_type,p_document_id,v_document_ref,
    v_title,v_amount,coalesce(nullif(trim(p_metric_label),''),'Amount'),v_project_id,v_unit_id,v_vendor_id,
    v_actor_department,auth.uid(),coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),v_snapshot
  ) returning id into v_case_id;

  insert into public.approval_tasks (
    company_id,case_id,workflow_step_id,step_order,step_name,department,required_role,
    approver_user_id,enforce_department,allow_self_approval,status,due_at
  )
  select v_company_id,v_case_id,s.id,s.step_order,s.name,s.department,s.required_role,
    s.approver_user_id,s.enforce_department,s.allow_self_approval,'blocked',null
  from public.approval_workflow_steps s
  where s.workflow_id=v_workflow.id
    and (s.min_amount is null or v_amount >= s.min_amount)
    and (s.max_amount is null or v_amount <= s.max_amount)
  order by s.step_order;

  select min(step_order) into v_first_order from public.approval_tasks where case_id=v_case_id;
  if v_first_order is null then
    raise exception 'The selected workflow has no applicable steps';
  end if;
  update public.approval_tasks t set status='pending',
    due_at=now()+make_interval(hours=>s.sla_hours)
  from public.approval_workflow_steps s
  where t.case_id=v_case_id and t.step_order=v_first_order and s.id=t.workflow_step_id;
  update public.approval_cases set current_step_order=v_first_order where id=v_case_id;

  insert into public.approval_actions (
    company_id,case_id,action,to_status,actor_id,actor_name,actor_role,actor_department,metadata
  ) values (
    v_company_id,v_case_id,'submitted','in_review',auth.uid(),coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),
    v_actor_role,v_actor_department,jsonb_build_object('workflow',v_workflow.name,'workflow_version',v_workflow.version)
  );
  perform public.sync_approval_source_status(p_document_type,p_document_id,'in_review');
  return v_case_id;
end;
$$;

create or replace function public.act_on_approval_task(
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
$$;

-- A requester can withdraw an open submission without deleting its history.
-- The source returns to an editable state while the case remains permanently
-- visible as cancelled in the audit trail.
create or replace function public.cancel_approval_case(
  p_case_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_case public.approval_cases%rowtype;
  v_actor_name text;
  v_actor_department text;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Withdrawal reason is required'; end if;
  select * into v_case from public.approval_cases where id=p_case_id for update;
  if v_case.id is null or v_case.company_id is distinct from v_company_id then
    raise exception 'Approval case not found' using errcode='42501';
  end if;
  if v_case.status <> 'in_review' then raise exception 'Only an open approval can be withdrawn'; end if;
  if v_case.submitted_by <> auth.uid() and public.auth_role() <> 'admin' then
    raise exception 'Only the requester or an admin can withdraw this approval' using errcode='42501';
  end if;

  update public.approval_tasks set status='cancelled'
  where case_id=v_case.id and status in ('pending','blocked');
  update public.approval_cases
  set status='cancelled',current_step_order=null,completed_at=now(),updated_at=now()
  where id=v_case.id;
  -- Returned is the portable editable state across legacy source tables.
  perform public.sync_approval_source_status(v_case.document_type,v_case.document_id,'returned');

  select full_name,nullif(trim(department),'') into v_actor_name,v_actor_department
  from public.user_profiles where id=auth.uid() and company_id=v_company_id;
  insert into public.approval_actions (
    company_id,case_id,action,from_status,to_status,actor_id,actor_name,actor_role,actor_department,comments
  ) values (
    v_company_id,v_case.id,'cancelled','in_review','cancelled',auth.uid(),
    coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),public.auth_role(),v_actor_department,trim(p_reason)
  );
  return v_case.id;
end;
$$;

-- Only an approved request can be turned into an actual payment. The payment,
-- ledger posting and bill balance update commit or roll back together.
create or replace function public.process_vendor_payment_request(
  p_request_id uuid,
  p_payment_date date,
  p_payment_mode text,
  p_bank_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_request public.vendor_payment_requests%rowtype;
  v_payment_id uuid;
  v_payment_number text;
  v_total_paid numeric;
  v_bill_total numeric;
  v_case_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null or public.auth_role() not in ('accounts','admin') then
    raise exception 'Accounts or admin permission required' using errcode='42501';
  end if;
  select * into v_request from public.vendor_payment_requests where id=p_request_id for update;
  if v_request.id is null or v_request.company_id is distinct from v_company_id then
    raise exception 'Payment request not found' using errcode='42501';
  end if;
  if v_request.status <> 'approved' or v_request.processed_payment_id is not null then
    raise exception 'Payment request is not approved or was already processed';
  end if;
  select id into v_case_id from public.approval_cases
    where company_id=v_company_id and document_type='vendor_payment' and document_id=p_request_id and status='approved'
    order by submitted_at desc limit 1;
  if v_case_id is null then raise exception 'Completed approval case not found'; end if;

  v_payment_number := 'PM-' || to_char(now(),'YYYYMMDDHH24MISSMS');
  insert into public.payments_made (
    company_id,payment_number,payment_date,bill_id,vendor_id,vendor_name,amount,payment_mode,bank_reference,notes,created_by,source_type,source_id
  ) values (
    v_company_id,v_payment_number,coalesce(p_payment_date,current_date),v_request.bill_id,v_request.vendor_id,v_request.vendor_name,
    v_request.requested_amount,coalesce(nullif(trim(p_payment_mode),''),v_request.payment_mode),nullif(trim(p_bank_reference),''),
    'Processed from approved request '||v_request.request_number,auth.uid(),'vendor_payment_request',v_request.id
  ) returning id into v_payment_id;

  insert into public.account_transactions (
    company_id,txn_date,type,description,amount,payment_mode,bank_reference,reference_type,reference_id,notes,created_by
  ) values (
    v_company_id,coalesce(p_payment_date,current_date),'expense','Payment made — '||v_payment_number||' ('||v_request.vendor_name||')',
    v_request.requested_amount,coalesce(nullif(trim(p_payment_mode),''),v_request.payment_mode),nullif(trim(p_bank_reference),''),
    'payment_made',v_payment_id,'Approved request '||v_request.request_number,auth.uid()
  );

  if v_request.bill_id is not null then
    select coalesce(sum(amount),0) into v_total_paid from public.payments_made where bill_id=v_request.bill_id;
    select total_amount into v_bill_total from public.bills where id=v_request.bill_id and company_id=v_company_id;
    update public.bills set paid_amount=v_total_paid,balance_due=greatest(0,coalesce(v_bill_total,0)-v_total_paid),
      status=case when v_total_paid<=0 then 'pending' when v_total_paid>=coalesce(v_bill_total,0) then 'paid' else 'partial' end
    where id=v_request.bill_id and company_id=v_company_id;
  end if;

  update public.vendor_payment_requests set status='processed',processed_at=now(),processed_by=auth.uid(),
    processed_payment_id=v_payment_id,updated_at=now() where id=v_request.id;
  select full_name into v_actor_name from public.user_profiles where id=auth.uid();
  insert into public.approval_actions (company_id,case_id,action,from_status,to_status,actor_id,actor_name,actor_role,comments,metadata)
  values (v_company_id,v_case_id,'processed','approved','processed',auth.uid(),v_actor_name,public.auth_role(),
    'Payment processed as '||v_payment_number,jsonb_build_object('payment_id',v_payment_id,'payment_number',v_payment_number));
  return v_payment_id;
end;
$$;

-- Dispatch an approved tools/tackles request exactly once. The existing stock
-- transaction trigger moves quantity between stores in the same transaction;
-- insufficient stock or any posting failure rolls the entire dispatch back.
create or replace function public.execute_approved_stock_transfer(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_request public.asset_transfer_requests%rowtype;
  v_transaction_id uuid;
  v_available numeric := 0;
  v_case_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null or public.auth_role() not in ('supervisor','manager','admin') then
    raise exception 'Supervisor, manager or admin permission required' using errcode='42501';
  end if;

  select * into v_request
  from public.asset_transfer_requests
  where id=p_request_id
  for update;

  if v_request.id is null or v_request.company_id is distinct from v_company_id then
    raise exception 'Transfer request not found' using errcode='42501';
  end if;
  if v_request.asset_kind <> 'tools_tackles' then
    raise exception 'This operation is only for tools and tackles transfers';
  end if;
  if v_request.status <> 'approved' or v_request.executed_transaction_id is not null then
    raise exception 'Transfer is not approved or was already dispatched';
  end if;
  if v_request.from_store_id is null or v_request.to_store_id is null
     or v_request.from_store_id=v_request.to_store_id then
    raise exception 'Valid source and destination stores are required';
  end if;

  select quantity_on_hand into v_available
  from public.inventory_stock
  where company_id=v_company_id and item_id=v_request.item_id and store_id=v_request.from_store_id
  for update;
  v_available := coalesce(v_available,0);
  if v_available < v_request.quantity then
    raise exception 'Insufficient source stock. Available: %, required: %', v_available, v_request.quantity;
  end if;

  select id into v_case_id
  from public.approval_cases
  where company_id=v_company_id and document_type='stock_transfer'
    and document_id=v_request.id and status='approved'
  order by submitted_at desc limit 1;
  if v_case_id is null then raise exception 'Completed approval case not found'; end if;

  insert into public.stock_transactions (
    company_id,txn_number,txn_type,txn_date,item_id,store_id,to_store_id,quantity,reason,notes,created_by
  ) values (
    v_company_id,v_request.transfer_number,'transfer',coalesce(v_request.required_by,current_date),
    v_request.item_id,v_request.from_store_id,v_request.to_store_id,v_request.quantity,
    v_request.reason,coalesce(v_request.notes,'Dispatched from approved transfer request'),auth.uid()
  ) returning id into v_transaction_id;

  update public.asset_transfer_requests
  set status='dispatched',dispatched_at=now(),executed_transaction_id=v_transaction_id,updated_at=now()
  where id=v_request.id;

  select full_name into v_actor_name from public.user_profiles where id=auth.uid();
  insert into public.approval_actions (
    company_id,case_id,action,from_status,to_status,actor_id,actor_name,actor_role,comments,metadata
  ) values (
    v_company_id,v_case_id,'processed','approved','dispatched',auth.uid(),
    coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),public.auth_role(),
    'Stock dispatched as '||v_request.transfer_number,
    jsonb_build_object('event','stock_dispatched','stock_transaction_id',v_transaction_id)
  );
  return v_transaction_id;
end;
$$;

-- Destination acknowledgement is separate from approval and dispatch. For an
-- equipment transfer the deployment operation is the dispatch, so it may move
-- directly from approved to received after planner_deploy_equipment succeeds.
create or replace function public.receive_asset_transfer(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_request public.asset_transfer_requests%rowtype;
  v_case_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null or public.auth_role() not in ('supervisor','manager','admin') then
    raise exception 'Supervisor, manager or admin permission required' using errcode='42501';
  end if;

  select * into v_request
  from public.asset_transfer_requests
  where id=p_request_id
  for update;
  if v_request.id is null or v_request.company_id is distinct from v_company_id then
    raise exception 'Transfer request not found' using errcode='42501';
  end if;
  if v_request.asset_kind='tools_tackles'
     and (v_request.status <> 'dispatched' or v_request.executed_transaction_id is null) then
    raise exception 'Stock transfer must be dispatched before receipt';
  end if;
  if v_request.asset_kind='equipment' and v_request.status <> 'approved' then
    raise exception 'Equipment transfer is not approved or is already completed';
  end if;

  select id into v_case_id
  from public.approval_cases
  where company_id=v_company_id
    and document_type=case when v_request.asset_kind='equipment' then 'equipment_transfer' else 'stock_transfer' end
    and document_id=v_request.id and status='approved'
  order by submitted_at desc limit 1;
  if v_case_id is null then raise exception 'Completed approval case not found'; end if;

  update public.asset_transfer_requests
  set status='received',dispatched_at=coalesce(dispatched_at,now()),received_at=now(),
    received_by=auth.uid(),updated_at=now()
  where id=v_request.id;

  select full_name into v_actor_name from public.user_profiles where id=auth.uid();
  insert into public.approval_actions (
    company_id,case_id,action,from_status,to_status,actor_id,actor_name,actor_role,comments,metadata
  ) values (
    v_company_id,v_case_id,'processed',v_request.status,'received',auth.uid(),
    coalesce(v_actor_name,auth.jwt()->>'email','Unknown'),public.auth_role(),
    'Destination receipt confirmed for '||v_request.transfer_number,
    jsonb_build_object('event','destination_received','asset_kind',v_request.asset_kind)
  );
  return v_request.id;
end;
$$;

-- Keep the physical equipment deployment and approval completion atomic. A
-- failed planner validation leaves the request approved and untouched; a failed
-- receipt/audit write rolls the deployment back as part of the same transaction.
create or replace function public.execute_approved_equipment_transfer(
  p_request_id uuid,
  p_data jsonb,
  p_from_deployment_id uuid default null,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.auth_company_id();
  v_request public.asset_transfer_requests%rowtype;
  v_current public.equipment_deployments%rowtype;
  v_deployment_id uuid;
begin
  if auth.uid() is null or public.auth_role() not in ('manager','admin') then
    raise exception 'Manager or admin permission required' using errcode='42501';
  end if;
  select * into v_request
  from public.asset_transfer_requests
  where id=p_request_id
  for update;
  if v_request.id is null or v_request.company_id is distinct from v_company_id then
    raise exception 'Transfer request not found' using errcode='42501';
  end if;
  if v_request.asset_kind <> 'equipment' or v_request.status <> 'approved' then
    raise exception 'Equipment transfer is not approved or was already completed';
  end if;
  if (p_data->>'equipment_id')::uuid is distinct from v_request.equipment_id
     or (p_data->>'project_id')::uuid is distinct from v_request.to_project_id then
    raise exception 'Deployment does not match the approved equipment and destination';
  end if;
  if p_from_deployment_id is not null then
    select * into v_current
    from public.equipment_deployments
    where id=p_from_deployment_id and company_id=v_company_id
      and equipment_id=v_request.equipment_id and project_id=v_request.from_project_id
      and status='active'
    for update;
    if v_current.id is null then raise exception 'Source deployment no longer matches the approved transfer'; end if;
  end if;

  v_deployment_id := public.planner_deploy_equipment(p_data,p_from_deployment_id,p_plan_id);
  perform public.receive_asset_transfer(v_request.id);
  return v_deployment_id;
end;
$$;

-- Source tables may still have broad edit policies for their normal business
-- fields. This trigger prevents a client-side update from forging an approval
-- status: every protected transition must be backed by the matching workflow
-- case, which the client cannot insert or update directly.
create or replace function public.guard_workflow_controlled_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_type text;
  v_expected_status text;
  v_old_status text;
  v_new_status text;
begin
  if tg_table_name='field_expenses' then
    v_old_status := to_jsonb(old)->>'approval_status';
    v_new_status := to_jsonb(new)->>'approval_status';
  else
    v_old_status := to_jsonb(old)->>'status';
    v_new_status := to_jsonb(new)->>'status';
  end if;
  if v_old_status is not distinct from v_new_status then return new; end if;

  case tg_table_name
    when 'purchase_orders' then
      v_document_type := 'purchase_order';
      v_expected_status := case v_new_status when 'pending_approval' then 'in_review' when 'confirmed' then 'approved' when 'rejected' then 'rejected' end;
    when 'vendor_work_orders' then
      v_document_type := 'work_order';
      v_expected_status := case when v_new_status in ('in_review','approved','rejected','returned') then v_new_status end;
    when 'bills' then
      v_document_type := 'vendor_bill';
      v_expected_status := case when v_new_status='pending_approval' then 'in_review' when v_old_status='pending_approval' and v_new_status='pending' then 'approved' when v_new_status='rejected' then 'rejected' end;
    when 'vendor_payment_requests' then
      v_document_type := 'vendor_payment';
      v_expected_status := case when v_new_status in ('in_review','approved','rejected','returned') then v_new_status when v_new_status='processed' then 'approved' end;
    when 'expenses' then
      v_document_type := 'expense';
      v_expected_status := case when v_new_status in ('approved','rejected') then v_new_status end;
    when 'field_expenses' then
      v_document_type := 'field_expense';
      v_expected_status := case when v_new_status in ('in_review','approved','rejected','returned') then v_new_status end;
    when 'employee_reimbursements' then
      v_document_type := 'employee_reimbursement';
      v_expected_status := case when v_new_status in ('approved','rejected','returned') then v_new_status end;
    when 'hr_leaves' then
      v_document_type := 'leave_request';
      v_expected_status := case when v_new_status in ('approved','rejected','returned') then v_new_status end;
    when 'ra_bills' then
      v_document_type := 'ra_bill';
      v_expected_status := case when v_new_status='submitted' then 'in_review' when v_new_status='approved' then 'approved' end;
    when 'asset_transfer_requests' then
      v_document_type := case when new.asset_kind='equipment' then 'equipment_transfer' else 'stock_transfer' end;
      v_expected_status := case when v_new_status in ('in_review','approved','rejected','returned') then v_new_status when v_new_status in ('dispatched','received') then 'approved' end;
  end case;

  if v_expected_status is null then return new; end if;
  if not exists (
    select 1 from public.approval_cases c
    where c.company_id=new.company_id and c.document_type=v_document_type and c.document_id=new.id
      and (
        c.status=v_expected_status
        or (v_expected_status='returned' and c.status='cancelled')
      )
  ) then
    raise exception 'This status is controlled by Approval Centre' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_purchase_order_approval_status on public.purchase_orders;
create trigger guard_purchase_order_approval_status before update of status on public.purchase_orders
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_work_order_approval_status on public.vendor_work_orders;
create trigger guard_work_order_approval_status before update of status on public.vendor_work_orders
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_bill_approval_status on public.bills;
create trigger guard_bill_approval_status before update of status on public.bills
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_vendor_payment_approval_status on public.vendor_payment_requests;
create trigger guard_vendor_payment_approval_status before update of status on public.vendor_payment_requests
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_expense_approval_status on public.expenses;
create trigger guard_expense_approval_status before update of status on public.expenses
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_field_expense_approval_status on public.field_expenses;
create trigger guard_field_expense_approval_status before update of approval_status on public.field_expenses
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_reimbursement_approval_status on public.employee_reimbursements;
create trigger guard_reimbursement_approval_status before update of status on public.employee_reimbursements
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_leave_approval_status on public.hr_leaves;
create trigger guard_leave_approval_status before update of status on public.hr_leaves
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_ra_bill_approval_status on public.ra_bills;
create trigger guard_ra_bill_approval_status before update of status on public.ra_bills
  for each row execute function public.guard_workflow_controlled_status();
drop trigger if exists guard_asset_transfer_approval_status on public.asset_transfer_requests;
create trigger guard_asset_transfer_approval_status before update of status on public.asset_transfer_requests
  for each row execute function public.guard_workflow_controlled_status();

-- ---------------------------------------------------------------------------
-- RLS and API privileges.
-- ---------------------------------------------------------------------------

alter table public.approval_workflows enable row level security;
alter table public.approval_workflow_steps enable row level security;
alter table public.approval_cases enable row level security;
alter table public.approval_tasks enable row level security;
alter table public.approval_actions enable row level security;
alter table public.approval_delegations enable row level security;
alter table public.vendor_payment_requests enable row level security;
alter table public.asset_transfer_requests enable row level security;
alter table public.vendor_work_orders enable row level security;

-- Close the broad legacy write policy while allowing old pending requests to
-- be completed during the transition.
drop policy if exists "Company members can view approval_requests" on public.approval_requests;
drop policy if exists "Company members can insert approval_requests" on public.approval_requests;
drop policy if exists "Company members can update approval_requests" on public.approval_requests;
create policy approval_requests_legacy_select on public.approval_requests for select to authenticated
  using (company_id=(select public.auth_company_id()));
create policy approval_requests_legacy_insert on public.approval_requests for insert to authenticated
  with check (company_id=(select public.auth_company_id()) and requested_by=auth.uid());
create policy approval_requests_legacy_review on public.approval_requests for update to authenticated
  using (
    company_id=(select public.auth_company_id()) and status='pending'
    and ((select public.auth_role())='admin' or required_role=(select public.auth_role())::text)
  )
  with check (
    company_id=(select public.auth_company_id()) and reviewed_by=auth.uid()
    and status in ('approved','rejected','acknowledged')
  );

create policy approval_workflows_select on public.approval_workflows for select to authenticated
  using (company_id=(select public.auth_company_id()));
create policy approval_workflows_admin_write on public.approval_workflows for all to authenticated
  using (company_id=(select public.auth_company_id()) and (select public.auth_role())='admin')
  with check (company_id=(select public.auth_company_id()) and (select public.auth_role())='admin');

create policy approval_steps_select on public.approval_workflow_steps for select to authenticated
  using (exists (select 1 from public.approval_workflows w where w.id=workflow_id and w.company_id=(select public.auth_company_id())));
create policy approval_steps_admin_write on public.approval_workflow_steps for all to authenticated
  using (exists (select 1 from public.approval_workflows w where w.id=workflow_id and w.company_id=(select public.auth_company_id()) and (select public.auth_role())='admin'))
  with check (exists (select 1 from public.approval_workflows w where w.id=workflow_id and w.company_id=(select public.auth_company_id()) and (select public.auth_role())='admin'));

create policy approval_cases_select on public.approval_cases for select to authenticated
  using (company_id=(select public.auth_company_id()));
create policy approval_tasks_select on public.approval_tasks for select to authenticated
  using (company_id=(select public.auth_company_id()));
create policy approval_actions_select on public.approval_actions for select to authenticated
  using (company_id=(select public.auth_company_id()));

create policy approval_delegations_select on public.approval_delegations for select to authenticated
  using (company_id=(select public.auth_company_id()) and (delegator_id=auth.uid() or delegate_id=auth.uid() or (select public.auth_role())='admin'));
create policy approval_delegations_admin_write on public.approval_delegations for all to authenticated
  using (company_id=(select public.auth_company_id()) and (delegator_id=auth.uid() or (select public.auth_role())='admin'))
  with check (company_id=(select public.auth_company_id()) and (delegator_id=auth.uid() or (select public.auth_role())='admin') and (created_by=auth.uid() or (select public.auth_role())='admin'));

create policy vendor_payment_requests_select on public.vendor_payment_requests for select to authenticated
  using (company_id=(select public.auth_company_id()));
create policy vendor_payment_requests_insert on public.vendor_payment_requests for insert to authenticated
  with check (company_id=(select public.auth_company_id()) and requested_by=auth.uid());
create policy vendor_payment_requests_update on public.vendor_payment_requests for update to authenticated
  using (company_id=(select public.auth_company_id()) and status in ('draft','returned') and requested_by=auth.uid())
  with check (company_id=(select public.auth_company_id()) and requested_by=auth.uid());

create policy asset_transfer_requests_select on public.asset_transfer_requests for select to authenticated
  using (company_id=(select public.auth_company_id()));
create policy asset_transfer_requests_insert on public.asset_transfer_requests for insert to authenticated
  with check (company_id=(select public.auth_company_id()) and requested_by=auth.uid());
create policy asset_transfer_requests_update on public.asset_transfer_requests for update to authenticated
  using (company_id=(select public.auth_company_id()) and status in ('draft','returned') and requested_by=auth.uid())
  with check (company_id=(select public.auth_company_id()) and requested_by=auth.uid());

create policy vendor_work_orders_select on public.vendor_work_orders for select to authenticated
  using (company_id=(select public.auth_company_id()));
create policy vendor_work_orders_insert on public.vendor_work_orders for insert to authenticated
  with check (company_id=(select public.auth_company_id()) and created_by=auth.uid());
create policy vendor_work_orders_update on public.vendor_work_orders for update to authenticated
  using (company_id=(select public.auth_company_id()) and status in ('draft','returned') and created_by=auth.uid())
  with check (company_id=(select public.auth_company_id()) and created_by=auth.uid());

-- Server-filtered inbox. Department enforcement can be enabled per step after
-- profiles are populated; until then the required role remains the safe gate.
create or replace view public.approval_task_inbox
with (security_invoker=true)
as
select
  t.id as task_id,t.case_id,t.step_order,t.step_name,t.department,t.required_role,t.due_at,
  c.document_type,c.document_id,c.document_ref,c.title,c.amount,c.metric_label,c.project_id,c.unit_id,c.vendor_id,
  c.submitted_by,c.submitted_by_name,c.submitted_at,c.snapshot,w.name as workflow_name
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

revoke all on public.approval_cases,public.approval_tasks,public.approval_actions from anon;
revoke insert,update,delete on public.approval_cases,public.approval_tasks,public.approval_actions from authenticated;
grant select on public.approval_workflows,public.approval_workflow_steps,public.approval_cases,public.approval_tasks,public.approval_actions,public.approval_delegations,public.vendor_payment_requests,public.asset_transfer_requests,public.approval_task_inbox to authenticated;
grant insert,update,delete on public.approval_workflows,public.approval_workflow_steps to authenticated;
grant insert,update,delete on public.approval_delegations to authenticated;
grant insert,update on public.vendor_payment_requests,public.asset_transfer_requests to authenticated;
grant select,insert,update on public.vendor_work_orders to authenticated;

revoke all on function public.seed_default_approval_workflows(uuid) from public,anon;
revoke all on function public.sync_approval_source_status(text,uuid,text) from public,anon,authenticated;
revoke all on function public.submit_approval_case(text,uuid,text,text,numeric,uuid,uuid,uuid,text,jsonb) from public,anon;
revoke all on function public.act_on_approval_task(uuid,text,text) from public,anon;
revoke all on function public.cancel_approval_case(uuid,text) from public,anon;
revoke all on function public.process_vendor_payment_request(uuid,date,text,text) from public,anon;
revoke all on function public.execute_approved_stock_transfer(uuid) from public,anon;
revoke all on function public.receive_asset_transfer(uuid) from public,anon;
revoke all on function public.execute_approved_equipment_transfer(uuid,jsonb,uuid,uuid) from public,anon;
revoke all on function public.guard_workflow_controlled_status() from public,anon,authenticated;
grant execute on function public.seed_default_approval_workflows(uuid) to authenticated;
grant execute on function public.submit_approval_case(text,uuid,text,text,numeric,uuid,uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.act_on_approval_task(uuid,text,text) to authenticated;
grant execute on function public.cancel_approval_case(uuid,text) to authenticated;
grant execute on function public.process_vendor_payment_request(uuid,date,text,text) to authenticated;
grant execute on function public.execute_approved_stock_transfer(uuid) to authenticated;
grant execute on function public.receive_asset_transfer(uuid) to authenticated;
grant execute on function public.execute_approved_equipment_transfer(uuid,jsonb,uuid,uuid) to authenticated;

notify pgrst,'reload schema';
