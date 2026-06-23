-- ─────────────────────────────────────────────────────────────────────────────
-- operator_fk_fix.sql
-- The column operator_id already existed on shifts with an FK pointing to
-- user_profiles. This migration corrects the FK to hr_employees, then
-- backfills operator_id and project_id/client_id.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → NEW TAB → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Drop the wrong FK constraint (points to user_profiles)
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_operator_id_fkey;

-- Step 2: Drop operator_id column entirely so we can re-add with correct FK
-- (safest — no data loss since it was never properly populated)
ALTER TABLE shifts DROP COLUMN IF EXISTS operator_id;

-- Step 3: Re-add with correct FK → hr_employees
ALTER TABLE shifts
  ADD COLUMN operator_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL;

-- Step 4: Ensure project_id + client_id exist
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS client_id  UUID;

-- Step 5: Backfill operator_id by matching operator_name → hr_employees.name
UPDATE shifts s
SET operator_id = e.id
FROM hr_employees e
WHERE e.company_id = s.company_id
  AND e.name = s.operator_name
  AND s.operator_id IS NULL;

-- Step 6: Backfill project_id + client_id from equipment's current deployment
UPDATE shifts s
SET
  project_id = eq.current_project_id,
  client_id  = eq.current_client_id
FROM equipment eq
WHERE eq.id = s.equipment_id
  AND s.project_id IS NULL
  AND eq.current_project_id IS NOT NULL;

-- Step 7: Indexes
CREATE INDEX IF NOT EXISTS idx_shifts_operator ON shifts(operator_id);
CREATE INDEX IF NOT EXISTS idx_shifts_project  ON shifts(project_id);
CREATE INDEX IF NOT EXISTS idx_shifts_client   ON shifts(client_id);

-- Verify
SELECT
  COUNT(*) FILTER (WHERE operator_id IS NOT NULL) AS shifts_with_operator_id,
  COUNT(*) FILTER (WHERE project_id  IS NOT NULL) AS shifts_with_project_id,
  COUNT(*) FILTER (WHERE client_id   IS NOT NULL) AS shifts_with_client_id,
  COUNT(*) AS total_shifts
FROM shifts;
