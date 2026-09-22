-- Personal assistant conversations and reviewed business drafts.
create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_threads_user_recent on public.assistant_threads(user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) <= 12000),
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_thread_recent on public.assistant_messages(thread_id, created_at desc);
create index if not exists assistant_messages_rate on public.assistant_messages(user_id, created_at desc) where role = 'user';

create table if not exists public.assistant_artifacts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('letter','email','report','checklist','plan','other')),
  title text not null check (length(title) between 1 and 160),
  content text not null check (length(content) between 1 and 16000),
  status text not null default 'proposed' check (status in ('proposed','saved')),
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  saved_at timestamptz
);
create index if not exists assistant_artifacts_user_recent on public.assistant_artifacts(user_id, created_at desc);

alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_artifacts enable row level security;

create policy assistant_threads_owner on public.assistant_threads
  for select to authenticated
  using (user_id = (select auth.uid()) and company_id = (select public.auth_company_id()));
create policy assistant_threads_insert on public.assistant_threads
  for insert to authenticated
  with check (user_id = (select auth.uid()) and company_id = (select public.auth_company_id()));
create policy assistant_threads_update on public.assistant_threads
  for update to authenticated
  using (user_id = (select auth.uid()) and company_id = (select public.auth_company_id()))
  with check (user_id = (select auth.uid()) and company_id = (select public.auth_company_id()));
create policy assistant_messages_owner on public.assistant_messages
  for select to authenticated
  using (user_id = (select auth.uid()) and company_id = (select public.auth_company_id())
    and exists (select 1 from public.assistant_threads t where t.id = thread_id and t.user_id = (select auth.uid())));
create policy assistant_messages_insert on public.assistant_messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and company_id = (select public.auth_company_id())
    and exists (select 1 from public.assistant_threads t where t.id = thread_id and t.user_id = (select auth.uid())));
create policy assistant_artifacts_owner on public.assistant_artifacts
  for select to authenticated
  using (user_id = (select auth.uid()) and company_id = (select public.auth_company_id())
    and exists (select 1 from public.assistant_threads t where t.id = thread_id and t.user_id = (select auth.uid())));
create policy assistant_artifacts_insert on public.assistant_artifacts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and company_id = (select public.auth_company_id())
    and exists (select 1 from public.assistant_threads t where t.id = thread_id and t.user_id = (select auth.uid())));
create policy assistant_artifacts_update on public.assistant_artifacts
  for update to authenticated
  using (user_id = (select auth.uid()) and company_id = (select public.auth_company_id()))
  with check (user_id = (select auth.uid()) and company_id = (select public.auth_company_id()));

grant select, insert, update on public.assistant_threads to authenticated;
grant select, insert on public.assistant_messages to authenticated;
grant select, insert, update on public.assistant_artifacts to authenticated;
notify pgrst, 'reload schema';
