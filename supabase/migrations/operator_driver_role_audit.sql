-- ─────────────────────────────────────────────────────────────────────────────
-- operator_driver_role_audit.sql
-- Verifies that all Operator/Driver employees have role = 'operator' in system.
-- The role VALUE stays 'operator' in DB (changing enum breaks auth).
-- The LABEL shown in the UI now says "Operator/Driver" everywhere.
-- Role is stored in the 'user_roles' table, NOT user_profiles.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Show all Operator/Driver employees and their current system role
SELECT
  e.id          AS employee_id,
  e.name,
  e.designation,
  e.email,
  ur.role       AS system_role,
  ur.user_id
FROM hr_employees e
LEFT JOIN user_roles ur ON ur.user_id = e.user_id
WHERE e.designation = 'Operator/Driver'
ORDER BY e.name;

-- 2. Flag any Operator/Driver who has a login but NOT role='operator'
--    (should return 0 rows if everything is correct)
SELECT
  e.name,
  e.designation,
  ur.role AS system_role,
  'MISMATCH — expected operator role' AS issue
FROM hr_employees e
JOIN user_roles ur ON ur.user_id = e.user_id
WHERE e.designation = 'Operator/Driver'
  AND ur.role <> 'operator';

-- 3. Confirm designation counts after the merge
SELECT designation, COUNT(*) AS count
FROM hr_employees
WHERE designation IN ('Operator/Driver', 'Equipment Operator', 'Tipper / Dumper Driver')
GROUP BY designation
ORDER BY designation;

-- NOTE: If query 2 returns any rows, fix them with:
--   UPDATE user_roles SET role = 'operator'
--   WHERE user_id IN (
--     SELECT e.user_id FROM hr_employees e
--     JOIN user_roles ur ON ur.user_id = e.user_id
--     WHERE e.designation = 'Operator/Driver' AND ur.role <> 'operator'
--   );
