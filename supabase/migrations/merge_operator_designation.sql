-- ─────────────────────────────────────────────────────────────────────────────
-- merge_operator_designation.sql
-- Merges 'Equipment Operator' and 'Tipper / Dumper Driver' into 'Operator/Driver'
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & run
-- Safe to run multiple times (WHERE clause prevents duplicate updates)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE hr_employees
SET designation = 'Operator/Driver'
WHERE designation IN ('Equipment Operator', 'Tipper / Dumper Driver');

-- Verify
SELECT designation, COUNT(*) AS count
FROM hr_employees
WHERE designation IN ('Operator/Driver', 'Equipment Operator', 'Tipper / Dumper Driver')
GROUP BY designation
ORDER BY designation;
