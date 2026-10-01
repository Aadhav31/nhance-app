-- Read/review state belongs to the recipient, including company broadcasts.
create table if not exists public.notification_receipts (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  company_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  reviewed_at timestamptz,
  primary key (notification_id, user_id)
);
create index if not exists notification_receipts_recipient
  on public.notification_receipts(user_id, company_id, notification_id);
create index if not exists notifications_inbox_order
  on public.notifications(company_id, (coalesce(created_at, '1970-01-01'::timestamptz)) desc, id desc);
create index if not exists notifications_recipient_order
  on public.notifications(company_id, user_id, created_at desc, id desc);
alter table public.notification_receipts enable row level security;
revoke all on public.notification_receipts from public, anon;
grant select, insert, update on public.notification_receipts to authenticated;
grant all on public.notification_receipts to service_role;

drop policy if exists notification_receipts_own on public.notification_receipts;
create policy notification_receipts_own on public.notification_receipts for all to authenticated
  using (user_id = (select auth.uid()) and company_id = (select public.auth_company_id())
    and exists (select 1 from public.notifications n where n.id = notification_id
      and n.company_id = notification_receipts.company_id
      and (n.user_id is null or n.user_id = (select auth.uid()))))
  with check (user_id = (select auth.uid()) and company_id = (select public.auth_company_id())
    and exists (select 1 from public.notifications n where n.id = notification_id
      and n.company_id = notification_receipts.company_id
      and (n.user_id is null or n.user_id = (select auth.uid()))));

-- Tighten the existing permissive tenant policies for private deliveries and
-- prevent a browser from marking a broadcast read on behalf of every user.
drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications as restrictive
  for select to authenticated
  using (company_id = (select public.auth_company_id()) and (user_id is null or user_id = (select auth.uid())));
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications as restrictive
  for update to authenticated
  using (company_id = (select public.auth_company_id()) and user_id = (select auth.uid()))
  with check (company_id = (select public.auth_company_id()) and user_id = (select auth.uid()));

create or replace function public.notification_alert_level(p_type text, p_metadata jsonb)
returns text language sql immutable security invoker set search_path = public, pg_temp as $$
  select case
    when p_type in ('incident_breakdown','incident_theft','incident_accident','critical','error')
      or lower(p_metadata->>'severity') = 'critical' then 'critical'
    when p_type like 'incident\_%' escape '\' or p_type in ('meter_discrepancy','outstanding_dues','alert','warning')
      or p_type like '%\_alert' escape '\' or p_metadata->>'alert' = 'true'
      or lower(p_metadata->>'category') = 'alert'
      or lower(p_metadata->>'severity') in ('warning','high') then 'warning'
    else null end
$$;
revoke all on function public.notification_alert_level(text,jsonb) from public, anon;
grant execute on function public.notification_alert_level(text,jsonb) to authenticated;

create or replace function public.get_notification_feed(
  p_view text default 'all', p_limit integer default 25,
  p_before_created_at timestamptz default null, p_before_id uuid default null
) returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := public.auth_company_id();
  v_result jsonb;
begin
  if v_actor is null or v_company is null then raise exception 'Sign in to view notifications' using errcode = '42501'; end if;
  if p_view is null or p_view not in ('all','alerts') or p_limit is null or p_limit not between 1 and 100
    or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Invalid notification feed request' using errcode = '22023';
  end if;
  with visible as materialized (
    select n.*, coalesce(n.created_at, '1970-01-01'::timestamptz) as sort_time,
      (n.is_read or r.read_at is not null) as effective_read,
      r.reviewed_at, public.notification_alert_level(n.type,n.metadata) as alert_level
    from public.notifications n
    left join public.notification_receipts r on r.notification_id = n.id and r.user_id = v_actor and r.company_id = v_company
    where n.company_id = v_company and (n.user_id is null or n.user_id = v_actor)
  ), eligible as materialized (
    select * from visible where p_view = 'all' or (alert_level is not null and reviewed_at is null)
  ), window_rows as materialized (
    select * from eligible where p_before_id is null or (sort_time,id) < (p_before_created_at,p_before_id)
    order by sort_time desc,id desc limit p_limit + 1
  ), page_rows as materialized (
    select * from window_rows order by sort_time desc,id desc limit p_limit
  )
  select jsonb_build_object(
    'company_id',v_company, 'actor_id',v_actor,
    'items',coalesce((select jsonb_agg((to_jsonb(p) - 'effective_read' - 'sort_time') ||
      jsonb_build_object('is_read',p.effective_read,'created_at',p.sort_time) order by p.sort_time desc,p.id desc) from page_rows p),'[]'::jsonb),
    'unread_count',(select count(*) from visible where not effective_read),
    'total_count',(select count(*) from eligible),
    'snapshot',(select jsonb_build_object('created_at',sort_time,'id',id) from visible order by sort_time desc,id desc limit 1),
    'next_cursor',case when (select count(*) from window_rows) > p_limit then
      (select jsonb_build_object('created_at',sort_time,'id',id) from page_rows order by sort_time,id limit 1) else null end
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.get_notification_feed(text,integer,timestamptz,uuid) from public, anon;
grant execute on function public.get_notification_feed(text,integer,timestamptz,uuid) to authenticated;

create or replace function public.mark_notifications_read(
  p_ids uuid[] default null, p_through_created_at timestamptz default null,
  p_through_id uuid default null, p_review boolean default false
) returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := public.auth_company_id();
  v_count integer;
begin
  if v_actor is null or v_company is null then raise exception 'Sign in to read notifications' using errcode = '42501'; end if;
  if (p_through_created_at is null) <> (p_through_id is null)
    or (p_ids is null and p_through_id is null)
    or (p_ids is not null and p_through_id is not null)
    or coalesce(cardinality(p_ids),0) > 1000
    or (p_review and p_ids is null) then
    raise exception 'Invalid notification read request' using errcode = '22023';
  end if;
  insert into public.notification_receipts(notification_id,company_id,user_id,read_at,reviewed_at)
    select n.id,v_company,v_actor,now(),case when p_review then now() else null end
    from public.notifications n
    where n.company_id = v_company and (n.user_id is null or n.user_id = v_actor)
      and (case when p_ids is not null then n.id = any(p_ids)
        else (coalesce(n.created_at,'1970-01-01'::timestamptz),n.id) <= (p_through_created_at,p_through_id) end)
    on conflict (notification_id,user_id) do update
      set reviewed_at = coalesce(notification_receipts.reviewed_at,excluded.reviewed_at);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.mark_notifications_read(uuid[],timestamptz,uuid,boolean) from public, anon;
grant execute on function public.mark_notifications_read(uuid[],timestamptz,uuid,boolean) to authenticated;

-- Polling remains a fallback when Realtime is disconnected.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_receipts') then
      alter publication supabase_realtime add table public.notification_receipts;
    end if;
  end if;
end $$;
notify pgrst, 'reload schema';
