-- ─────────────────────────────────────────────────────────────────────────────
-- diagnose_equipment_project_link.sql
-- Run in Supabase SQL Editor to check why equipment doesn't appear in project
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Show current_project_id saved on the TATA Hitachi Zaxis equipment
SELECT
  id,
  name,
  status,
  current_project_id,
  current_site_name,
  current_client_id
FROM equipment
WHERE name ILIKE '%zaxis%' OR name ILIKE '%hitachi%'
ORDER BY name;

-- 2. Show all projects to get the UUID for PRJ-2026-004
SELECT id, project_code, project_name
FROM projects
WHERE project_code = 'PRJ-2026-004';

-- 3. Cross-check: do the UUIDs actually match?
-- (If current_project_id = project.id the equipment WILL show up after the code fix)
SELECT
  e.name AS equipment_name,
  e.current_project_id,
  p.id   AS project_id,
  e.current_project_id = p.id AS ids_match
FROM equipment e
CROSS JOIN projects p
WHERE (e.name ILIKE '%zaxis%' OR e.name ILIKE '%hitachi%')
  AND p.project_code = 'PRJ-2026-004';

-- 4. All equipment with any current_project_id set
SELECT name, status, current_project_id, current_site_name
FROM equipment
WHERE current_project_id IS NOT NULL;
