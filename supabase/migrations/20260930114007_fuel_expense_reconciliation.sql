-- Fuel expense capture and approval-controlled reconciliation.
--
-- A fuel expense is captured once at the source. It is visible as pending
-- evidence immediately, but it does not enter the official fuel register or
-- reconciliation totals until an independent approver completes the existing
-- enterprise expense workflow.

alter table public.field_expenses
  add column if not exists fuel_quantity_liters numeric(14,3),
  add column if not exists fuel_rate_per_liter numeric(14,3),
  add column if not exists fuel_meter_reading numeric(14,2),
  add column if not exists fuel_source text;

alter table public.expenses
  add column if not exists fuel_quantity_liters numeric(14,3),
  add column if not exists fuel_rate_per_liter numeric(14,3),
  add column if not exists fuel_meter_reading numeric(14,2),
  add column if not exists fuel_source text;

create table if not exists public.fuel_expense_captures (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_document_type text not null
    check (source_document_type in ('field_expense','expense')),
  source_document_id uuid not null,
  expense_date date not null,
  equipment_id uuid references public.equipment(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  quantity_liters numeric(14,3),
  rate_per_liter numeric(14,3),
  total_amount numeric(18,2) not null default 0,
  meter_reading numeric(14,2),
  fuel_source text not null default 'petrol_pump'
    check (fuel_source in ('company_bowser','company_tank','vendor_supply','petrol_pump')),
  vendor_name text,
  bill_number text,
  receipt_url text,
  approval_case_id uuid references public.approval_cases(id) on delete set null,
  status text not null default 'pending_review'
    check (status in ('pending_review','needs_information','approved','returned','rejected','cancelled')),
  missing_fields text[] not null default array[]::text[],
  source_snapshot jsonb not null default '{}'::jsonb,
  fuel_issue_id uuid references public.fuel_issues(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source_document_type, source_document_id),
  check (quantity_liters is null or quantity_liters > 0),
  check (rate_per_liter is null or rate_per_liter >= 0),
  check (total_amount >= 0)
);

create index if not exists idx_fuel_expense_captures_review_queue
  on public.fuel_expense_captures(company_id, status, expense_date desc);
create index if not exists idx_fuel_expense_captures_equipment
  on public.fuel_expense_captures(company_id, equipment_id, expense_date desc);
create index if not exists idx_fuel_expense_captures_project
  on public.fuel_expense_captures(company_id, project_id, expense_date desc);

alter table public.fuel_issues
  add column if not exists vendor_name text,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists rate_per_liter numeric(14,3),
  add column if not exists total_amount numeric(18,2),
  add column if not exists expense_capture_id uuid references public.fuel_expense_captures(id) on delete restrict,
  add column if not exists approval_status text not null default 'approved';

create unique index if not exists ux_fuel_issues_expense_capture
  on public.fuel_issues(expense_capture_id)
  where expense_capture_id is not null;

alter table public.fuel_expense_captures enable row level security;

drop policy if exists fuel_expense_captures_company_read on public.fuel_expense_captures;
create policy fuel_expense_captures_company_read
  on public.fuel_expense_captures for select to authenticated
  using (company_id = public.auth_company_id());

revoke all on table public.fuel_expense_captures from anon, authenticated, service_role;
grant select on table public.fuel_expense_captures to authenticated, service_role;

comment on table public.fuel_expense_captures is
  'Approval-controlled staging ledger for fuel-category expenses. Only approved captures materialize into fuel_issues.';

-- Prevent an auto-cleared threshold approval, an emergency self-override, or
-- an edit during review from putting unverified diesel into the official fuel
-- register.
create or replace function public.guard_fuel_expense_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_document_type text := case when tg_table_name='field_expenses' then 'field_expense' else 'expense' end;
  v_status text;
  v_critical_changed boolean := false;
begin
  -- public.expenses mirrors field expenses for accounting. The field expense
  -- remains the sole workflow source and is guarded separately.
  if tg_table_name='expenses' and nullif(v_old->>'field_expense_id','') is not null then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if lower(coalesce(v_old->>'category','')) <> 'fuel'
     and (tg_op='DELETE' or lower(coalesce(v_new->>'category','')) <> 'fuel') then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='DELETE' then
    v_critical_changed := true;
  else
    v_critical_changed :=
      (v_old->'category') is distinct from (v_new->'category') or
      (v_old->'equipment_id') is distinct from (v_new->'equipment_id') or
      (v_old->'project_id') is distinct from (v_new->'project_id') or
      (v_old->'expense_date') is distinct from (v_new->'expense_date') or
      (v_old->'amount') is distinct from (v_new->'amount') or
      (v_old->'total_amount') is distinct from (v_new->'total_amount') or
      (v_old->'fuel_quantity_liters') is distinct from (v_new->'fuel_quantity_liters') or
      (v_old->'fuel_rate_per_liter') is distinct from (v_new->'fuel_rate_per_liter') or
      (v_old->'fuel_meter_reading') is distinct from (v_new->'fuel_meter_reading') or
      (v_old->'fuel_source') is distinct from (v_new->'fuel_source') or
      (v_old->'bill_number') is distinct from (v_new->'bill_number') or
      (v_old->'bank_reference') is distinct from (v_new->'bank_reference') or
      (v_old->'transaction_ref') is distinct from (v_new->'transaction_ref') or
      (v_old->'vendor_name') is distinct from (v_new->'vendor_name') or
      (v_old->'payee_name') is distinct from (v_new->'payee_name');
  end if;

  if v_critical_changed and exists (
    select 1 from public.approval_cases c
    where c.company_id=(v_old->>'company_id')::uuid
      and c.document_type=v_document_type
      and c.document_id=(v_old->>'id')::uuid
      and c.status='in_review'
  ) then
    raise exception 'Return or cancel the fuel approval before changing equipment, project, litres, rate, amount or evidence.' using errcode='42501';
  end if;

  if v_critical_changed and exists (
    select 1 from public.fuel_expense_captures f
    where f.company_id=(v_old->>'company_id')::uuid
      and f.source_document_type=v_document_type
      and f.source_document_id=(v_old->>'id')::uuid
      and f.status='approved'
  ) then
    raise exception 'Approved fuel evidence is immutable. Record a correcting expense instead.' using errcode='42501';
  end if;

  if tg_op<>'DELETE' then
    v_status := case when tg_table_name='field_expenses'
      then coalesce(v_new->>'approval_status','not_submitted')
      else coalesce(v_new->>'status','draft') end;
    if v_status='approved' and not exists (
      select 1
      from public.approval_cases c
      join public.approval_tasks t on t.case_id=c.id
      where c.company_id=(v_new->>'company_id')::uuid
        and c.document_type=v_document_type
        and c.document_id=(v_new->>'id')::uuid
        and c.status='approved'
        and coalesce((c.snapshot->>'mandatory_fuel_review')::boolean,false)
        and t.status='approved'
        and t.acted_by is distinct from c.submitted_by
    ) then
      raise exception 'Fuel expenses require an independent review before approval.' using errcode='42501';
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function public.guard_fuel_expense_integrity() from public, anon, authenticated, service_role;

drop trigger if exists guard_fuel_expense_integrity on public.field_expenses;
create trigger guard_fuel_expense_integrity
  before update or delete on public.field_expenses
  for each row execute function public.guard_fuel_expense_integrity();
drop trigger if exists guard_fuel_expense_integrity on public.expenses;
create trigger guard_fuel_expense_integrity
  before update or delete on public.expenses
  for each row execute function public.guard_fuel_expense_integrity();

create or replace function public.sync_fuel_expense_capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_document_type text := case when tg_table_name='field_expenses' then 'field_expense' else 'expense' end;
  v_company_id uuid := nullif(v_row->>'company_id','')::uuid;
  v_document_id uuid := nullif(v_row->>'id','')::uuid;
  v_equipment_id uuid := nullif(v_row->>'equipment_id','')::uuid;
  v_project_id uuid := nullif(v_row->>'project_id','')::uuid;
  v_quantity numeric := nullif(v_row->>'fuel_quantity_liters','')::numeric;
  v_amount numeric := coalesce(nullif(v_row->>'total_amount','')::numeric, nullif(v_row->>'amount','')::numeric, 0);
  v_rate numeric := nullif(v_row->>'fuel_rate_per_liter','')::numeric;
  v_meter numeric := nullif(v_row->>'fuel_meter_reading','')::numeric;
  v_source text := coalesce(nullif(v_row->>'fuel_source',''),'petrol_pump');
  v_missing text[] := array[]::text[];
  v_case_id uuid;
  v_case_status text;
  v_case_fuel_review boolean := false;
  v_capture_status text := 'pending_review';
  v_capture_id uuid;
  v_issue_id uuid;
  v_created_by uuid := nullif(v_row->>'created_by','')::uuid;
  v_actor uuid;
begin
  -- The field expense mirror in public.expenses is not a second source.
  if tg_table_name='expenses' and nullif(v_row->>'field_expense_id','') is not null then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='DELETE' then
    update public.fuel_expense_captures
    set status='cancelled',updated_at=now()
    where company_id=v_company_id and source_document_type=v_document_type
      and source_document_id=v_document_id and status<>'approved';
    return old;
  end if;

  if lower(coalesce(v_row->>'category','')) <> 'fuel' then
    if lower(coalesce(v_old->>'category',''))='fuel' then
      update public.fuel_expense_captures
      set status='cancelled',updated_at=now()
      where company_id=v_company_id and source_document_type=v_document_type
        and source_document_id=v_document_id and status<>'approved';
    end if;
    return new;
  end if;

  if v_equipment_id is null then v_missing := array_append(v_missing,'equipment'); end if;
  if v_project_id is null then v_missing := array_append(v_missing,'project'); end if;
  if coalesce(v_quantity,0)<=0 then v_missing := array_append(v_missing,'litres'); end if;
  if v_amount<=0 then v_missing := array_append(v_missing,'amount'); end if;

  if v_equipment_id is not null and not exists (
    select 1 from public.equipment e where e.id=v_equipment_id and e.company_id=v_company_id
  ) then
    raise exception 'The selected equipment does not belong to this company' using errcode='42501';
  end if;
  if v_project_id is not null and not exists (
    select 1 from public.projects p where p.id=v_project_id and p.company_id=v_company_id
  ) then
    raise exception 'The selected project does not belong to this company' using errcode='42501';
  end if;

  if coalesce(v_rate,0)<=0 and coalesce(v_quantity,0)>0 and v_amount>0 then
    v_rate := round(v_amount/v_quantity,3);
  end if;

  select c.id,c.status,coalesce((c.snapshot->>'mandatory_fuel_review')::boolean,false)
    into v_case_id,v_case_status,v_case_fuel_review
  from public.approval_cases c
  where c.company_id=v_company_id and c.document_type=v_document_type and c.document_id=v_document_id
  order by c.submitted_at desc limit 1;

  if v_case_id is null or not v_case_fuel_review then
    v_missing := array_append(v_missing,'approval_route');
  end if;

  v_capture_status := case
    when cardinality(v_missing)>0 then 'needs_information'
    when v_case_status='approved' and v_case_fuel_review and exists (
      select 1 from public.approval_tasks t
      where t.case_id=v_case_id and t.status='approved'
        and t.acted_by is distinct from v_created_by
    ) then 'approved'
    when v_case_status='returned' then 'returned'
    when v_case_status='rejected' then 'rejected'
    when v_case_status='cancelled' then 'cancelled'
    else 'pending_review'
  end;

  insert into public.fuel_expense_captures (
    company_id,source_document_type,source_document_id,expense_date,equipment_id,project_id,
    quantity_liters,rate_per_liter,total_amount,meter_reading,fuel_source,vendor_name,
    bill_number,receipt_url,approval_case_id,status,missing_fields,source_snapshot,created_by,updated_at
  ) values (
    v_company_id,v_document_type,v_document_id,(v_row->>'expense_date')::date,v_equipment_id,v_project_id,
    v_quantity,v_rate,v_amount,v_meter,v_source,
    coalesce(v_row->>'vendor_name',v_row->>'payee_name'),
    coalesce(v_row->>'bill_number',v_row->>'reference_number',v_row->>'transaction_ref',v_row->>'bank_reference'),
    coalesce(v_row->>'bill_photo_url',v_row->>'receipt_url'),v_case_id,v_capture_status,v_missing,
    jsonb_strip_nulls(jsonb_build_object(
      'expense_date',v_row->>'expense_date','equipment_id',v_equipment_id,'project_id',v_project_id,
      'quantity_liters',v_quantity,'rate_per_liter',v_rate,'amount',v_amount,
      'meter_reading',v_meter,'fuel_source',v_source,'description',v_row->>'description'
    )),v_created_by,now()
  )
  on conflict (company_id,source_document_type,source_document_id) do update set
    expense_date=excluded.expense_date,equipment_id=excluded.equipment_id,project_id=excluded.project_id,
    quantity_liters=excluded.quantity_liters,rate_per_liter=excluded.rate_per_liter,
    total_amount=excluded.total_amount,meter_reading=excluded.meter_reading,
    fuel_source=excluded.fuel_source,vendor_name=excluded.vendor_name,bill_number=excluded.bill_number,
    receipt_url=excluded.receipt_url,approval_case_id=excluded.approval_case_id,
    status=excluded.status,missing_fields=excluded.missing_fields,
    source_snapshot=excluded.source_snapshot,updated_at=now()
  returning id into v_capture_id;

  if v_capture_status='approved' then
    select t.acted_by into v_actor
    from public.approval_tasks t
    where t.case_id=v_case_id and t.status='approved'
    order by t.acted_at desc nulls last limit 1;

    insert into public.fuel_issues (
      company_id,issue_date,equipment_id,equipment_name,quantity_liters,fuel_source,
      meter_at_issue,issued_by,issued_by_name,voucher_number,notes,vendor_name,
      project_id,rate_per_liter,total_amount,expense_capture_id,approval_status
    )
    select
      v_company_id,(v_row->>'expense_date')::date,v_equipment_id,e.name,v_quantity,v_source,
      v_meter,
      case when exists (select 1 from public.user_profiles up where up.id=v_created_by) then v_created_by else null end,
      coalesce(v_row->>'created_by_name','Expense capture'),
      coalesce(v_row->>'bill_number',v_row->>'reference_number',v_row->>'transaction_ref',v_row->>'bank_reference'),
      'Auto-captured from approved '||replace(v_document_type,'_',' ')||' '||left(v_document_id::text,8),
      coalesce(v_row->>'vendor_name',v_row->>'payee_name'),v_project_id,v_rate,v_amount,v_capture_id,'approved'
    from public.equipment e
    where e.id=v_equipment_id and e.company_id=v_company_id
    on conflict (expense_capture_id) where expense_capture_id is not null do nothing
    returning id into v_issue_id;

    if v_issue_id is null then
      select fi.id into v_issue_id from public.fuel_issues fi where fi.expense_capture_id=v_capture_id;
    end if;
    update public.fuel_expense_captures
    set fuel_issue_id=v_issue_id,reviewed_by=v_actor,reviewed_at=now(),updated_at=now()
    where id=v_capture_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_fuel_expense_capture() from public, anon, authenticated, service_role;

drop trigger if exists sync_fuel_expense_capture on public.field_expenses;
create trigger sync_fuel_expense_capture
  after insert or update or delete on public.field_expenses
  for each row execute function public.sync_fuel_expense_capture();
drop trigger if exists sync_fuel_expense_capture on public.expenses;
create trigger sync_fuel_expense_capture
  after insert or update or delete on public.expenses
  for each row execute function public.sync_fuel_expense_capture();

-- Mandatory, independent fuel review using the existing expense workflow.
-- The database re-reads every routing and fuel value from the source row.
create or replace function public.submit_fuel_expense_approval_case(
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
$$;

revoke all on function public.submit_fuel_expense_approval_case(text,uuid,text,text,jsonb)
  from public, anon, service_role;
grant execute on function public.submit_fuel_expense_approval_case(text,uuid,text,text,jsonb)
  to authenticated;

notify pgrst,'reload schema';
