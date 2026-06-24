-- ─────────────────────────────────────────────────────────────────────────────
-- operator_driver_role_audit.sql
-- Verifies that all Operator/Driver employees have role = 'operator' in system.
-- The role VALUE stays 'operator' in the DB (changing the enum breaks auth).
-- The LABEL shown in the UI now says "Operator/Driver" everywhere.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Show all Operator/Driver employees and their current system role
SELECT
  e.id          AS employee_id,
  e.name,
  e.designation,
  e.email,
  up.role       AS system_role,
  up.id         AS user_profile_id
FROM hr_employees e
LEFT JOIN user_profiles up ON up.id = e.user_id
WHERE e.designation = 'Operator/Driver'
ORDER BY e.name;

-- 2. Flag any Operator/Driver who has a login but NOT role='operator'
--    (should return 0 rows if everything is correct)
SELECT
  e.name,
  e.designation,
  up.role AS system_role,
  'MISMATCH — expected operator role' AS issue
FROM hr_employees e
JOIN user_profiles up ON up.id = e.user_id
WHERE e.designation = 'Operator/Driver'
  AND up.role <> 'operator';

-- 3. Confirm designation counts after the merge
SELECT designation, COUNT(*) AS count
FROM hr_employees
WHERE designation IN ('Operator/Driver', 'Equipment Operator', 'Tipper / Dumper Driver')
GROUP BY designation
ORDER BY designation;

-- NOTE: If query 2 returns any rows, fix them with:
--   UPDATE user_profiles SET role = 'operator'
--   WHERE id IN (
--     SELECT up.id FROM user_profiles up
--     JOIN hr_employees e ON e.user_id = up.id
--     WHERE e.designation = 'Operator/Driver' AND up.role <> 'operator'
--   );
