-- equipment_utilization_targets
-- Stores planned working days per machine per calendar month,
-- set by P&M manager / admin at the start of each month.

create table if not exists equipment_utilization_targets (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  year         integer not null,
  month        integer not null check (month between 1 and 12),
  planned_days integer not null check (planned_days between 0 and 31),
  set_by       uuid references user_profiles(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (equipment_id, year, month)
);

alter table equipment_utilization_targets enable row level security;

create policy "company members can read utilization targets"
  on equipment_utilization_targets for select
  using (company_id = (select company_id from user_roles where user_id = auth.uid()));

create policy "admins and managers can upsert utilization targets"
  on equipment_utilization_targets for all
  using (company_id = (select company_id from user_roles where user_id = auth.uid()))
  with check (
    company_id = (select company_id from user_roles where user_id = auth.uid())
    and exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role::text in ('admin', 'manager', 'pm_manager')
    )
  );

-- Updated_at trigger
create or replace function update_utilization_targets_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_utilization_targets_updated_at
  before update on equipment_utilization_targets
  for each row execute function update_utilization_targets_updated_at();
