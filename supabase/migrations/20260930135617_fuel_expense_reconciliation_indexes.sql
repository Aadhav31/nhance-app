-- Cover foreign keys used by the fuel-expense review and reconciliation flow.
-- These indexes keep joins, approval lookups, and referential checks fast as
-- the capture queue grows.
create index if not exists idx_fuel_expense_captures_approval_case_id
  on public.fuel_expense_captures (approval_case_id);

create index if not exists idx_fuel_expense_captures_created_by
  on public.fuel_expense_captures (created_by);

create index if not exists idx_fuel_expense_captures_equipment_id
  on public.fuel_expense_captures (equipment_id);

create index if not exists idx_fuel_expense_captures_fuel_issue_id
  on public.fuel_expense_captures (fuel_issue_id);

create index if not exists idx_fuel_expense_captures_project_id
  on public.fuel_expense_captures (project_id);

create index if not exists idx_fuel_expense_captures_reviewed_by
  on public.fuel_expense_captures (reviewed_by);

create index if not exists idx_fuel_issues_project_id
  on public.fuel_issues (project_id);
