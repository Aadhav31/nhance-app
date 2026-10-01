import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const company=id(1), actor=id(2), other=id(3), foreign=id(4), foreignActor=id(5)
const query=(sql,args=[])=>db.query(sql,args)
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; grant usage on schema auth to authenticated,anon;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
create function public.auth_company_id() returns uuid language sql as $$ select nullif(current_setting('test.company',true),'')::uuid $$;
create table public.notifications(id uuid primary key,company_id uuid not null,user_id uuid,type text not null,title text not null,body text,reference_type text,reference_id uuid,is_read boolean not null default false,created_at timestamptz default now(),metadata jsonb);
alter table public.notifications enable row level security;
create policy company_notifications on public.notifications for all using(company_id=public.auth_company_id());
create policy tenant_isolation_notifications on public.notifications for all using(company_id=public.auth_company_id());
grant all on public.notifications to anon,authenticated;
`)
await query('insert into auth.users values ($1),($2),($3)',[actor,other,foreignActor])
const migration=await readFile('supabase/migrations/20261001112647_notification_inbox.sql','utf8')
await db.exec(migration)
await db.exec(migration) // Additive migration remains safe if retried.
async function add(n,{tenant=company,recipient=null,type='info',metadata=null,time='2026-10-01T10:00:00Z',read=false}={}){
  await query('insert into notifications(id,company_id,user_id,type,title,created_at,metadata,is_read) values($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),tenant,recipient,type,`Notification ${n}`,time,metadata,read])
}
await add(10,{type:'incident_breakdown'}); await add(11,{recipient:actor,type:'outstanding_dues'})
await add(12,{recipient:other}); await add(13,{tenant:foreign}); await add(14,{read:true})
await add(15,{type:'future_type',metadata:{severity:'warning'}})
await add(16,{type:'custom_update'}); await add(17,{time:null})
for(let n=100;n<1205;n++) await add(n,{time:'2026-09-01T01:00:00Z'})
async function asUser(user=actor,tenant=company){await db.exec('reset role');await query("select set_config('test.user',$1,false),set_config('test.company',$2,false)",[user,tenant]);await db.exec('set role authenticated')}
const feed=async(view='all',cursor=null,limit=25)=>(await query('select public.get_notification_feed($1,$2,$3,$4) as feed',[view,limit,cursor?.created_at||null,cursor?.id||null])).rows[0].feed
const mark=async(ids=null,through=null,review=false)=>(await query('select public.mark_notifications_read($1,$2,$3,$4) as count',[ids,through?.created_at||null,through?.id||null,review])).rows[0].count
await asUser()
let first=await feed(); assert.equal(first.actor_id,actor); assert.equal(first.company_id,company)
assert.equal(first.items.length,25);assert.equal(first.total_count,1111);assert.equal(first.unread_count,1110)
assert.ok(first.next_cursor); assert.equal(first.items.some(n=>[id(12),id(13)].includes(n.id)),false)
assert.equal((await query('select count(*)::int as count from notifications')).rows[0].count,1111)
// Stable keyset pagination includes every tied timestamp once, beyond API row limits.
const seen=new Set();let cursor=null
while(true){const page=await feed('all',cursor,100);for(const n of page.items){assert.equal(seen.has(n.id),false);seen.add(n.id)}cursor=page.next_cursor;if(!cursor)break}
assert.equal(seen.size,1111);assert.ok(seen.has(id(17)))
let alerts=await feed('alerts');assert.equal(alerts.total_count,3);assert.equal(alerts.items.find(n=>n.id===id(10)).alert_level,'critical')
assert.equal(alerts.items.find(n=>n.id===id(15)).alert_level,'warning')
await mark([id(10),id(12),id(13)]);assert.equal((await feed()).unread_count,1109)
assert.equal((await feed('alerts')).total_count,3) // Reading in bell is not acknowledging on Home.
await mark([id(10)],null,true);assert.equal((await feed('alerts')).total_count,2)
await asUser(other);assert.equal((await feed()).items.find(n=>n.id===id(10)).is_read,false)
assert.equal((await feed('alerts')).total_count,2) // Only broadcast + metadata warning.
await asUser();const snapshot=(await feed()).snapshot
await db.exec('reset role');await add(1300,{time:'2026-10-01T11:00:00Z'})
await asUser();await mark(null,snapshot)
assert.equal((await feed()).unread_count,1);assert.equal((await feed()).items[0].id,id(1300))
assert.equal((await feed('alerts')).total_count,2) // Mark all read keeps unreviewed warnings on Home.
await mark([id(11),id(15)],null,true);assert.equal((await feed('alerts')).total_count,0)
await asUser();assert.equal((await feed()).unread_count,1) // Persists across sessions.
// Forged receipts cannot target another user, company, or an invisible notification.
for(const args of [[id(1300),company,other],[id(1300),foreign,actor],[id(12),company,actor],[id(13),foreign,actor]]){
  await assert.rejects(query('insert into notification_receipts(notification_id,company_id,user_id) values($1,$2,$3)',args),/row-level security/)
}
assert.equal((await query('update notifications set is_read=true where id=$1 returning id',[id(10)])).rows.length,0)
await assert.rejects(query('update notification_receipts set user_id=$1 where notification_id=$2',[other,id(10)]),/row-level security/)
await assert.rejects(feed('wrong'),/Invalid notification feed/)
await assert.rejects(feed('all',{id:id(10)}),/Invalid notification feed/)
await assert.rejects(mark(),/Invalid notification read/)
await assert.rejects(mark(null,snapshot,true),/Invalid notification read/)
assert.equal(await mark([]),0)
await asUser(foreignActor,foreign);assert.equal((await feed()).total_count,1)
await asUser('',company);await assert.rejects(feed(),/Sign in/)
await db.exec('reset role; set role anon');await assert.rejects(feed(),/permission denied/);await assert.rejects(mark([id(10)]),/permission denied/)
await db.exec('reset role');assert.equal((await query('select is_read from notifications where id=$1',[id(10)])).rows[0].is_read,false)
assert.equal((await query('select count(*)::int as count from notification_receipts where user_id=$1',[other])).rows[0].count,0)
await db.close();console.log('Notification database checks passed: exact counts >1000, stable pagination, tenant/recipient privacy, per-user persistence, read/review separation, snapshot-safe mark all, RLS/grants, validation and retry-safe migration.')
