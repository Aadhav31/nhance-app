-- operator_certifications
-- Tracks HEMM/equipment certifications per operator with expiry dates.
-- equipment_category matches the category field on equipment_registry.

create table if not exists operator_certifications (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  employee_id        uuid not null references hr_employees(id) on delete cascade,
  equipment_category text not null,   -- e.g. 'Excavator', 'Crane', 'Grader'
  cert_name          text not null,   -- e.g. 'HEMM License', 'Crane Operator Cert'
  cert_number        text,
  issued_date        date,
  expiry_date        date,            -- null = no expiry (lifetime cert)
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table operator_certifications enable row level security;

create policy "company members can read certifications"
  on operator_certifications for select
  using (company_id = (select company_id from user_roles where user_id = auth.uid()));

create policy "admins and managers can manage certifications"
  on operator_certifications for all
  using (company_id = (select company_id from user_roles where user_id = auth.uid()))
  with check (
    company_id = (select company_id from user_roles where user_id = auth.uid())
    and exists (
      select 1 from user_roles
      where user_id = auth.uid()
      and role::text in ('admin', 'manager', 'hr', 'pm_manager')
    )
  );

-- updated_at trigger
create or replace function update_operator_certifications_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_operator_certifications_updated_at
  before update on operator_certifications
  for each row execute function update_operator_certifications_updated_at();

-- Index for fast lookup by employee + category
create index if not exists idx_operator_certs_employee
  on operator_certifications(employee_id, equipment_category);
