-- ============================================================
-- Nhance — Backfill: Cross-link existing breakdown records
-- Run in: Supabase → SQL Editor → Run
-- Safe to run multiple times — all inserts use WHERE NOT EXISTS
-- ============================================================


-- ============================================================
-- STEP 1: For every breakdown job_card that has no maintenance_record
--         → create a maintenance_record
-- ============================================================
INSERT INTO public.maintenance_records (
  company_id, equipment_id, maintenance_type, description,
  service_date, status, priority, done_by,
  labour_cost, total_cost, downtime_hours, source
)
SELECT
  jc.company_id,
  jc.equipment_id,
  'breakdown',
  COALESCE(jc.complaint, jc.work_done, 'Breakdown — see job card ' || jc.jc_number),
  jc.opened_date,
  CASE jc.status
    WHEN 'completed' THEN 'completed'
    WHEN 'closed'    THEN 'completed'
    ELSE 'open'
  END,
  'high',
  'inhouse',
  0, 0, 0,
  'job_card'
FROM public.job_cards jc
WHERE jc.jc_type = 'breakdown'
  AND NOT EXISTS (
    SELECT 1 FROM public.maintenance_records mr
    WHERE mr.equipment_id = jc.equipment_id
      AND mr.maintenance_type = 'breakdown'
      AND ABS(EXTRACT(EPOCH FROM (mr.service_date::timestamp - jc.opened_date::timestamp)) / 86400) <= 3
  );


-- ============================================================
-- STEP 2: For every breakdown maintenance_record that has no job_card
--         → create a job_card
-- ============================================================
INSERT INTO public.job_cards (
  company_id, equipment_id, equipment_name, jc_type,
  complaint, status, opened_date, source
)
SELECT
  mr.company_id,
  mr.equipment_id,
  e.name,
  'breakdown',
  COALESCE(mr.description, 'Breakdown — see maintenance record'),
  CASE mr.status
    WHEN 'completed' THEN 'completed'
    ELSE 'open'
  END,
  mr.service_date,
  'maintenance'
FROM public.maintenance_records mr
JOIN public.equipment e ON e.id = mr.equipment_id
WHERE mr.maintenance_type = 'breakdown'
  AND NOT EXISTS (
    SELECT 1 FROM public.job_cards jc
    WHERE jc.equipment_id = mr.equipment_id
      AND jc.jc_type = 'breakdown'
      AND ABS(EXTRACT(EPOCH FROM (jc.opened_date::timestamp - mr.service_date::timestamp)) / 86400) <= 3
  );


-- ============================================================
-- STEP 3: For every open breakdown shift_incident that has no job_card
--         → create a job_card
-- ============================================================
INSERT INTO public.job_cards (
  company_id, equipment_id, equipment_name, jc_type,
  complaint, status, opened_date, source
)
SELECT
  si.company_id,
  si.equipment_id,
  si.equipment_name,
  'breakdown',
  COALESCE(si.description, si.breakdown_cause, 'Breakdown — see incident report'),
  CASE si.status
    WHEN 'resolved' THEN 'completed'
    ELSE 'open'
  END,
  si.created_at::date,
  'ops_incident'
FROM public.shift_incidents si
WHERE si.incident_type = 'breakdown'
  AND si.equipment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.job_cards jc
    WHERE jc.equipment_id = si.equipment_id
      AND jc.jc_type = 'breakdown'
      AND ABS(EXTRACT(EPOCH FROM (jc.opened_date::timestamp - si.created_at)) / 86400) <= 3
  );


-- ============================================================
-- STEP 4: For every open breakdown shift_incident that has no maintenance_record
--         → create a maintenance_record
-- ============================================================
INSERT INTO public.maintenance_records (
  company_id, equipment_id, maintenance_type, description,
  service_date, status, priority, done_by,
  labour_cost, total_cost, downtime_hours, source
)
SELECT
  si.company_id,
  si.equipment_id,
  'breakdown',
  COALESCE(si.description, si.breakdown_cause, 'Breakdown — see incident report'),
  si.created_at::date,
  CASE si.status
    WHEN 'resolved' THEN 'completed'
    ELSE 'open'
  END,
  'high',
  'inhouse',
  0, 0, 0,
  'ops_incident'
FROM public.shift_incidents si
WHERE si.incident_type = 'breakdown'
  AND si.equipment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.maintenance_records mr
    WHERE mr.equipment_id = si.equipment_id
      AND mr.maintenance_type = 'breakdown'
      AND ABS(EXTRACT(EPOCH FROM (mr.service_date::timestamp - si.created_at)) / 86400) <= 3
  );


-- ============================================================
-- STEP 5: Resolve shift_incidents for equipment whose
--         maintenance_record is marked completed
-- ============================================================
UPDATE public.shift_incidents si
SET
  status           = 'resolved',
  resolved_at      = NOW(),
  resolution_notes = 'Auto-resolved: maintenance record marked completed'
FROM public.maintenance_records mr
WHERE si.equipment_id    = mr.equipment_id
  AND si.incident_type   = 'breakdown'
  AND si.status          = 'open'
  AND mr.maintenance_type = 'breakdown'
  AND mr.status           = 'completed';


-- ============================================================
-- DONE — check counts
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM public.maintenance_records WHERE maintenance_type = 'breakdown') AS total_breakdown_maint_records,
  (SELECT COUNT(*) FROM public.job_cards           WHERE jc_type = 'breakdown')          AS total_breakdown_job_cards,
  (SELECT COUNT(*) FROM public.shift_incidents     WHERE incident_type = 'breakdown')    AS total_breakdown_incidents;
