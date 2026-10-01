import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [company, actor, machine, project, foreignCompany, foreignMachine, disposed, secondMachine] = [1,2,3,4,5,6,7,8].map(id)
const q = (sql, args = []) => db.query(sql, args)
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function auth_company_id() returns uuid language sql as $$select nullif(current_setting('test.company',true),'')::uuid$$;
create function auth_role() returns text language sql as $$select current_setting('test.role',true)$$;
create type equipment_status as enum('active','idle','breakdown','maintenance','disposed');
create type maintenance_type as enum('preventive','breakdown');
create table equipment(id uuid primary key,company_id uuid,name text,status equipment_status,current_project_id uuid,
 current_client_id uuid,current_meter_reading numeric,updated_at timestamptz default now(),last_service_meter numeric,
 last_service_date date,service_interval_hrs numeric,next_service_meter numeric);
create table projects(id uuid primary key,company_id uuid,our_supervisors jsonb,our_pnm_contacts jsonb,our_managers jsonb,
 our_pm_name text,our_pm_phone text,our_pm_email text);
create table user_profiles(id uuid primary key,company_id uuid,full_name text,is_active boolean default true);
create table shift_incidents(id uuid primary key default gen_random_uuid(),company_id uuid,equipment_id uuid,shift_id uuid,
 incident_type text,severity text,description text,action_taken text,breakdown_cause text,rectification_needed text,
 damage_cause text,what_needs_to_be_done text,notify_assigned boolean,location_lat double precision,location_lng double precision,
 location_address text,reported_by uuid references user_profiles(id),incident_time timestamptz default now(),created_at timestamptz default now(),
 resolved boolean default false,resolved_at timestamptz,resolved_by uuid);
create table breakdown_alerts(id uuid primary key default gen_random_uuid(),company_id uuid,equipment_id uuid,incident_id uuid,
 equipment_name text,project_id uuid,breakdown_cause text,reported_by_name text,reported_at timestamptz default now(),notify_chain jsonb,
 resolved_at timestamptz,resolved_by_name text);
create table job_cards(id uuid primary key default gen_random_uuid(),company_id uuid,jc_number text,equipment_id uuid,equipment_name text,
 pm_schedule_id uuid,jc_type text,status text,workflow_stage text,complaint text,technician_id uuid,technician_name text,
 opened_date date,opened_at timestamptz,meter_at_open numeric,project_id uuid,breakdown_alert_id uuid,incident_id uuid,
 priority text,sla_due_at timestamptz,assigned_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),
 corrective_action text,work_done text,diagnosis text,test_result text,meter_at_close numeric,acknowledged_at timestamptz,
 work_started_at timestamptz,repair_completed_at timestamptz,tested_at timestamptz,approved_at timestamptz,released_at timestamptz,
 closed_date date,supervisor_notes text,approved_by uuid,approved_by_name text,cancelled_reason text,downtime_hours numeric,
 done_by text,labor_cost numeric,total_cost numeric,root_cause text);
create table maintenance_records(id uuid primary key default gen_random_uuid(),company_id uuid,equipment_id uuid,
 maintenance_type maintenance_type,description text,meter_at_service numeric,service_date date,status text,priority text,
 project_id uuid,client_id uuid,created_by uuid,pm_schedule_id uuid,job_card_id uuid references job_cards(id),completed_date date,
 done_by text,technician_name text,labour_cost numeric,total_cost numeric,downtime_hours numeric,notes text);
create table job_card_events(id uuid primary key default gen_random_uuid(),company_id uuid,job_card_id uuid,event_type text,
 from_stage text,to_stage text,notes text,actor_id uuid,actor_name text);
create table pm_schedules(id uuid primary key,company_id uuid,last_done_meter numeric,last_done_date date,interval_hours numeric,
 next_due_meter numeric,next_due_date date,updated_at timestamptz);
create table notifications(id uuid primary key default gen_random_uuid(),company_id uuid,type text,title text,body text,metadata jsonb);
`)
await db.exec(await readFile('tests/fixtures/createWorkshopJob.sql', 'utf8'))
await db.exec(await readFile('tests/fixtures/transitionWorkshopJob.sql', 'utf8'))
const migration = await readFile('supabase/migrations/20261001073030_fleet_incident_reporting.sql', 'utf8')
await db.exec(migration)
await db.exec(migration) // additive migration can safely be reapplied
await q('insert into auth.users values($1)', [actor])
await q('insert into user_profiles(id,company_id,full_name) values($1,$2,$3)', [actor,company,'Demo Reporter'])
await q(`insert into projects values($1,$2,'[{"name":"Site supervisor","email":"supervisor@example.invalid"}]',
 '[{"name":"P&M contact"}]','[{"name":"Manager"}]','Project manager',null,'pm@example.invalid')`, [project,company])
for (const [eq,tenant,status] of [[machine,company,'active'],[foreignMachine,foreignCompany,'active'],[disposed,company,'disposed'],[secondMachine,company,'active']])
 await q('insert into equipment(id,company_id,name,status,current_project_id,current_meter_reading) values($1,$2,$3,$4,$5,0)', [eq,tenant,'Demo machine',status,project])
// Exercise the invoker function under tenant RLS, including child writes.
for (const table of ['equipment','projects','user_profiles','shift_incidents','breakdown_alerts','job_cards','maintenance_records','job_card_events','pm_schedules','notifications']) {
 await db.exec(`alter table ${table} enable row level security; create policy tenant on ${table} to authenticated
 using(company_id=auth_company_id()) with check(company_id=auth_company_id());`)
}
await db.exec('grant usage on schema auth to authenticated; grant all on all tables in schema public to authenticated; grant execute on all functions in schema auth to authenticated; set role authenticated;')
async function auth(role='admin', user=actor) {
 await q("select set_config('test.user',$1,false),set_config('test.company',$2,false),set_config('test.role',$3,false)",[user || '',company,role])
}
await auth()
const at = '2026-09-29T20:00:00.000Z'
const details = (type='breakdown', extra={}) => ({ incident_type:type,occurred_at:at,breakdown_cause:'Hydraulic hose burst',description:'',...extra })
async function report(n, type='breakdown', extra={}, eq=machine) {
 return (await q('select report_equipment_incident($1,$2,$3::jsonb) result',[id(n),eq,JSON.stringify(details(type,extra))])).rows[0].result
}
const counts = async () => (await q(`select (select count(*)::int from shift_incidents) incidents,
 (select count(*)::int from breakdown_alerts) alerts,(select count(*)::int from job_cards) jobs,
 (select count(*)::int from maintenance_records) records,(select count(*)::int from notifications) notifications,
 (select count(*)::int from job_card_events) events`)).rows[0]
const first = await report(20)
assert.equal(first.created,true); assert.equal(first.alert_created,true); assert.ok(first.job_card_id)
assert.deepEqual(first.notify_chain.map(c=>c.level),[1,2,3,4])
const row = (await q('select * from shift_incidents where id=$1',[id(20)])).rows[0]
assert.equal(row.shift_id,null); assert.equal(row.reported_by,actor); assert.equal(row.description,'Hydraulic hose burst')
assert.equal(new Date(row.incident_time).toISOString(),at); assert.equal(new Date(row.created_at).toISOString(),at)
assert.equal(row.job_card_id,first.job_card_id)
const alert = (await q('select * from breakdown_alerts')).rows[0]
assert.equal(alert.incident_id,row.id); assert.equal(alert.reported_by_name,'Demo Reporter')
assert.equal((await q('select status from equipment where id=$1',[machine])).rows[0].status,'breakdown')
assert.deepEqual(await counts(),{incidents:1,alerts:1,jobs:1,records:1,notifications:1,events:2})
const duplicate = await report(20)
assert.equal(duplicate.created,false); assert.equal(duplicate.alert_created,false)
assert.deepEqual(await counts(),{incidents:1,alerts:1,jobs:1,records:1,notifications:1,events:2})
await q("select transition_workshop_job($1,'in_progress')",[first.job_card_id])
const second = await report(21,'breakdown',{ breakdown_cause:'Second report on same repair' })
assert.equal(second.alert_created,false); assert.equal(second.job_card_id,first.job_card_id)
assert.equal((await q('select workflow_stage from job_cards where id=$1',[first.job_card_id])).rows[0].workflow_stage,'in_progress')
assert.equal((await q('select status from equipment where id=$1',[machine])).rows[0].status,'maintenance')
assert.equal((await counts()).alerts,1); assert.equal((await counts()).jobs,1); assert.equal((await counts()).records,1)
await q("update job_cards set diagnosis='Failed hose',work_done='Replaced hose',corrective_action='Pressure tested',test_result='passed' where id=$1",[first.job_card_id])
await auth('supervisor'); await assert.rejects(q("select transition_workshop_job($1,'closed')",[first.job_card_id]),/Manager approval/)
assert.equal((await q('select count(*)::int n from shift_incidents where resolved')).rows[0].n,0)
await auth('manager'); await q("select transition_workshop_job($1,'closed')",[first.job_card_id])
assert.equal((await q('select count(*)::int n from shift_incidents where resolved')).rows[0].n,2)
assert.equal((await q('select status from maintenance_records')).rows[0].status,'completed')
assert.ok((await q('select resolved_at from breakdown_alerts')).rows[0].resolved_at)
const third = await report(22)
assert.equal(third.alert_created,true); assert.notEqual(third.job_card_id,first.job_card_id)
const damage = await report(23,'damage',{damage_cause:'Bucket impact',location_lat:0,location_lng:0,rectification_needed:'Hidden old cause'})
const damaged = (await q('select * from shift_incidents where id=$1',[damage.incident_id])).rows[0]
assert.equal(damaged.description,'Bucket impact'); assert.equal(damaged.location_lat,0); assert.equal(damaged.location_lng,0)
assert.equal(damaged.breakdown_cause,null); assert.equal(damaged.rectification_needed,null)
for (const type of ['unscheduled_maintenance','regular_maintenance','theft','safety_issue','accident','near_miss','other'])
 await report(30+['unscheduled_maintenance','regular_maintenance','theft','safety_issue','accident','near_miss','other'].indexOf(type),type,{description:type,action_taken:'Action',severity:'high'})
assert.equal((await q('select status from equipment where id=$1',[machine])).rows[0].status,'breakdown') // maintenance report cannot clear failure
await report(40,'regular_maintenance',{description:'Oil change'},secondMachine)
assert.equal((await q('select status from equipment where id=$1',[secondMachine])).rows[0].status,'maintenance')
const beforeInvalid = await counts()
for (const [type,extra,eq,pattern] of [
 ['breakdown',{breakdown_cause:''},machine,/Cause/],['damage',{},machine,/damage/],['bad',{},machine,/type/],
 ['other',{description:''},machine,/Description/],['safety_issue',{description:'Hazard',severity:'bad'},machine,/severity/],
 ['other',{description:'Report',occurred_at:'2099-01-01'},machine,/date/],['other',{description:'Report',location_lat:100},machine,/location/],
 ['other',{description:'Report'},foreignMachine,/Equipment/],['other',{description:'Report'},disposed,/Disposed/]])
 await assert.rejects(report(90,type,extra,eq),pattern)
for (const role of ['operator','accounts']) { await auth(role); await assert.rejects(report(90),/permission denied/) }
await auth('admin',null); await assert.rejects(report(90),/permission denied/)
await auth(); assert.deepEqual(await counts(),beforeInvalid)
// Any child write failure must roll back the incident, equipment status and all linked records.
await db.exec('reset role; create function fail_notification() returns trigger language plpgsql as $$begin raise exception \'Notification insert failed\'; end$$; create trigger fail_notification before insert on notifications for each row execute function fail_notification(); set role authenticated;')
const beforeFailure = await counts()
await assert.rejects(report(91,'breakdown',{},secondMachine),/Notification insert failed/)
assert.deepEqual(await counts(),beforeFailure)
assert.equal((await q('select status from equipment where id=$1',[secondMachine])).rows[0].status,'maintenance')
await db.exec('reset role; drop trigger fail_notification on notifications; create function fail_record() returns trigger language plpgsql as $$begin raise exception \'Workshop record failed\'; end$$; create trigger fail_record before insert on maintenance_records for each row execute function fail_record(); set role authenticated;')
await assert.rejects(report(91,'breakdown',{},secondMachine),/Workshop record failed/)
assert.deepEqual(await counts(),beforeFailure)
await db.exec('reset role; drop trigger fail_record on maintenance_records; set role authenticated;')
assert.equal((await report(91,'breakdown',{},secondMachine)).created,true)
// IDs cannot be reused for another machine or another reporter.
await assert.rejects(report(20,'breakdown',{},secondMachine),/reference already used/)
await auth('admin',id(99)); await assert.rejects(report(20),/reference already used/)
await auth()
console.log('PASS: atomic standalone reports, all types, tenant/role guards, exact links, retries, child-failure rollback, workshop reuse and approved closure')
await db.close()
