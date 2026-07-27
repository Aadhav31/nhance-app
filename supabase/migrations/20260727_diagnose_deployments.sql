-- ── Diagnostic: run this in Supabase SQL Editor to see what deployment data exists ──

-- 1. How many equipment records have current_project_id set?
SELECT COUNT(*) AS equipment_with_project FROM equipment WHERE current_project_id IS NOT NULL;

-- 2. How many active equipment_deployments exist?
SELECT COUNT(*) AS active_deployments FROM equipment_deployments WHERE status = 'active';

-- 3. Show equipment + their linked project
SELECT e.name, e.equipment_number, e.current_project_id, p.project_name
FROM equipment e
LEFT JOIN projects p ON p.id = e.current_project_id
WHERE e.current_project_id IS NOT NULL
LIMIT 20;

-- 4. Show active deployments with equipment + project names
SELECT ed.id, ed.status, ed.deployed_date, ed.withdrawn_date,
       eq.name AS equipment_name, pr.project_name
FROM equipment_deployments ed
JOIN equipment eq ON eq.id = ed.equipment_id
JOIN projects  pr ON pr.id = ed.project_id
WHERE ed.status = 'active'
LIMIT 20;
