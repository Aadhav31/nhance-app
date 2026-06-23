-- ─────────────────────────────────────────────────────────────────────────────
-- operator_fk_schema.sql
-- Adds operator_id FK from shifts → hr_employees so the operator is properly
-- linked across Operations, HR, and Accounts modules.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add operator_id column to shifts
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL;

-- Step 2: Add project_id + client_id if somehow still missing
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS client_id  UUID;

-- Step 3: Backfill operator_id for existing shifts by matching operator_name
-- (matches on same company and operator name)
UPDATE shifts s
SET operator_id = e.id
FROM hr_employees e
WHERE e.company_id = s.company_id
  AND e.name = s.operator_name
  AND s.operator_id IS NULL;

-- Step 4: Backfill project_id + client_id for existing shifts from equipment
UPDATE shifts s
SET
  project_id = eq.current_project_id,
  client_id  = eq.current_client_id
FROM equipment eq
WHERE eq.id = s.equipment_id
  AND s.project_id IS NULL
  AND eq.current_project_id IS NOT NULL;

-- Step 5: Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_shifts_operator ON shifts(operator_id);
CREATE INDEX IF NOT EXISTS idx_shifts_project  ON shifts(project_id);
CREATE INDEX IF NOT EXISTS idx_shifts_client   ON shifts(client_id);

-- Done. Check results:
SELECT
  COUNT(*) FILTER (WHERE operator_id IS NOT NULL) AS shifts_with_operator_id,
  COUNT(*) FILTER (WHERE project_id  IS NOT NULL) AS shifts_with_project_id,
  COUNT(*) FILTER (WHERE client_id   IS NOT NULL) AS shifts_with_client_id,
  COUNT(*) AS total_shifts
FROM shifts;
