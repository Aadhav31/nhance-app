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
create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email','test@example.invalid') $$;
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

alter table approval_tasks add column decision_type text;
create function public.seed_default_approval_workflows(uuid) returns void language plpgsql as $$ begin return; end $$;
create function public.sync_approval_source_status(text,uuid,text) returns void language plpgsql set search_path = public as $$ begin
 if $1='field_expense' then update field_expenses set approval_status=$3 where id=$2;
 else update expenses set status=$3 where id=$2; end if; end $$;
create table fuel_expense_captures(id uuid primary key default gen_random_uuid(),company_id uuid,source_document_type text,source_document_id uuid,expense_date date,equipment_id uuid,project_id uuid,quantity_liters numeric,rate_per_liter numeric,total_amount numeric,meter_reading numeric,fuel_source text,vendor_name text,bill_number text,receipt_url text,approval_case_id uuid,status text,missing_fields text[],source_snapshot jsonb,created_by uuid,updated_at timestamptz,fuel_issue_id uuid,reviewed_by uuid,reviewed_at timestamptz,unique(company_id,source_document_type,source_document_id));
create table fuel_issues(id uuid primary key default gen_random_uuid(),company_id uuid,issue_date date,equipment_id uuid,equipment_name text,quantity_liters numeric,fuel_source text,meter_at_issue numeric,issued_by uuid,issued_by_name text,voucher_number text,notes text,vendor_name text,project_id uuid,rate_per_liter numeric,total_amount numeric,expense_capture_id uuid,approval_status text);
create unique index on fuel_issues(expense_capture_id) where expense_capture_id is not null;
`)
const migration = await readFile('supabase/migrations/20260930171153_fuel_capture_completion.sql', 'utf8')
await db.exec(migration)
for (const table of ['field_expenses', 'expenses']) await db.exec(`
create trigger guard_fuel before update or delete on ${table} for each row execute function guard_fuel_expense_integrity();
create trigger sync_fuel after insert or update or delete on ${table} for each row execute function sync_fuel_expense_capture();`)
await query(`select set_config('test.company',$1,false),set_config('test.user',$2,false),set_config('test.role','admin',false)`, [company,actor])
await query('insert into companies values($1)',[company])
await query('insert into auth.users values($1),($2)',[actor,reviewer])
for (const type of ['field_expense','expense']) {
 const workflow=(await query('insert into approval_workflows(company_id,workflow_key,document_type,name) values($1,$2,$2,$2) returning id',[company,type])).rows[0].id
 for(const [i,role] of ['manager','accounts','admin'].entries()) await query('insert into approval_workflow_steps(workflow_id,step_order,step_key,name,required_role) values($1,$2,$3,$3,$3)',[workflow,i+1,role])
}
await query('insert into equipment values($1,$2,$3)',[machine,company,'Test excavator'])
await query('insert into projects values($1,$2,$3)',[project,company,'Test project'])
await query('insert into equipment values($1,$2,$3)',[id(11),foreignCompany,'Other company equipment'])
await query('insert into projects values($1,$2,$3)',[id(12),foreignCompany,'Other company project'])
await query("insert into user_profiles(id,company_id,full_name) values($1,$2,'Test owner'),($3,$2,'Test manager')",[actor,company,reviewer])
await query("insert into user_roles values($1,'admin'),($2,'manager')",[actor,reviewer])
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
await query("update approval_tasks set status='approved',acted_by=$1,acted_at=now() where case_id=$2",[actor,approval.id])
await query("update approval_cases set status='approved' where id=$1",[approval.id])
await assert.rejects(query("update field_expenses set approval_status='approved' where id=$1",[source]), /independent review/)
assert.equal((await query('select count(*) from fuel_issues')).rows[0].count,0)
await query("update approval_tasks set acted_by=$1 where case_id=$2",[reviewer,approval.id])
await query("update approval_cases set status='approved' where id=$1",[approval.id])
await query("update field_expenses set approval_status='approved' where id=$1",[source])
await query('update field_expenses set id=id where id=$1',[source])
assert.equal((await row('fuel_expense_captures',capture)).status,'approved')
const issues = (await query('select * from fuel_issues')).rows
assert.equal(issues.length,1)
assert.equal(issues[0].vendor_name,'Test operator')
assert.equal(issues[0].station_name,'Test Fuel Station')
assert.equal(issues[0].voucher_number,'DEMO-01')
assert.equal(Number(issues[0].quantity_liters),20)
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
await db.close()
console.log('Fuel database checks passed: tenant/actor authorization, receipt validation, atomic rollback, mirrors, pending exclusion, approval posting, immutability and no duplicate fuel issue.')
