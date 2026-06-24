-- ─────────────────────────────────────────────────────────────────────────────
-- employee_ot_threshold.sql
-- Adds per-employee OT threshold (hours after which OT is counted)
-- Default 12 hrs. Defined when adding/editing employee, not on attendance page.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & run
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS ot_threshold_hours NUMERIC(5,2) DEFAULT 12;

-- Backfill existing employees with company default
UPDATE hr_employees SET ot_threshold_hours = 12 WHERE ot_threshold_hours IS NULL;

-- Verify
SELECT designation, AVG(ot_threshold_hours) AS avg_ot_threshold, COUNT(*) AS count
FROM hr_employees
GROUP BY designation
ORDER BY designation;
