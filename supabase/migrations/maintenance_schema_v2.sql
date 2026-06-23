-- ─────────────────────────────────────────────────────────────────────────────
-- maintenance_schema_v2.sql
-- Adds project_id + client_id to maintenance_records so maintenance work
-- can be traced back to the project / client the equipment is deployed on.
-- Also adds notes and priority columns for richer record-keeping.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add project_id and client_id to maintenance_records
ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id  UUID REFERENCES clients(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes      TEXT,
  ADD COLUMN IF NOT EXISTS priority   TEXT DEFAULT 'normal';  -- 'low','normal','high','critical'

-- Step 2: Backfill project_id + client_id from equipment current deployment
UPDATE maintenance_records mr
SET
  project_id = eq.current_project_id,
  client_id  = eq.current_client_id
FROM equipment eq
WHERE eq.id = mr.equipment_id
  AND mr.project_id IS NULL
  AND eq.current_project_id IS NOT NULL;

-- Step 3: Add maintenance_type TEXT fallback (allow custom types beyond enum)
-- Keep the enum column as-is; add a free-text override column
ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS maintenance_type_label TEXT;

-- Step 4: Indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_project ON maintenance_records(project_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_client  ON maintenance_records(client_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status  ON maintenance_records(company_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_date    ON maintenance_records(company_id, service_date DESC);

-- Step 5: Verify
SELECT
  COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS records_with_project,
  COUNT(*) AS total_records
FROM maintenance_records;
