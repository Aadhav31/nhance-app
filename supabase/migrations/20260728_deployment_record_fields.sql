-- ─────────────────────────────────────────────────────────────────────────────
-- 20260728_deployment_record_fields.sql
--
-- Adds deployment-record fields to equipment_deployments so that at the moment
-- a machine is deployed the operator, hour meter, site in-charge, work order
-- reference, and optional photos are captured.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE equipment_deployments
  ADD COLUMN IF NOT EXISTS hour_meter_at_deployment  NUMERIC,
  ADD COLUMN IF NOT EXISTS operator_name             TEXT,
  ADD COLUMN IF NOT EXISTS operator_id               UUID,
  ADD COLUMN IF NOT EXISTS site_incharge             TEXT,
  ADD COLUMN IF NOT EXISTS work_order_ref            TEXT,
  ADD COLUMN IF NOT EXISTS machine_photo_url         TEXT,
  ADD COLUMN IF NOT EXISTS hour_meter_photo_url      TEXT,
  ADD COLUMN IF NOT EXISTS deployment_location       TEXT;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
