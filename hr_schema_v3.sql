-- hr_schema_v3.sql
-- Link Supabase auth accounts to HR employee records
-- Run in Supabase SQL Editor

-- Add user_id column — one login = one employee, enforced by UNIQUE
ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- UNIQUE so two employees can't be linked to the same login
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_user_id_unique
  ON hr_employees(user_id)
  WHERE user_id IS NOT NULL;

-- Fast lookup: given session.user.id → find employee record instantly
CREATE INDEX IF NOT EXISTS idx_hr_employees_user_id
  ON hr_employees(user_id);

NOTIFY pgrst, 'reload schema';

-- ── How this works ────────────────────────────────────────────────────────────
-- 1. Admin opens HR → Employee → Edit → Compliance & Bank tab
-- 2. "Login Account" dropdown shows all user_profiles in the company
-- 3. Admin selects the login account for this employee → saves user_id
-- 4. When that user logs in as 'operator':
--      a. OperationsPage TodayTab fetches hr_employees WHERE user_id = auth.uid()
--      b. Then fetches equipment_assignments WHERE operator_name = employee.name
--      c. Equipment list is filtered to only those assigned equipment IDs
-- 5. StartShiftModal auto-fills operator_name from employee.name, locked
-- 6. Result: Salim logs in → sees only his excavator → starts shift with his name auto-filled

