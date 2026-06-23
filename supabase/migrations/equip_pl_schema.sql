-- ─────────────────────────────────────────────────────────────────────────────
-- equip_pl_schema.sql
-- Adds columns required for the full Equipment P&L model:
--   1. equipment.specific_consumption_lph   — standard fuel litres per hour
--   2. equipment.fuel_by_client             — true = client supplies fuel (default false)
--   3. equipment_deployments upgrades       — stores the rate card chosen at deploy time
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Equipment — fuel configuration ───────────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS specific_consumption_lph  NUMERIC(6,3),   -- expected L/hr (e.g. 12.5)
  ADD COLUMN IF NOT EXISTS fuel_by_client            BOOLEAN DEFAULT false; -- client supplies fuel?

-- ─── 2. equipment_deployments — rate card details ────────────────────────────
-- These columns store the exact rate agreed when the equipment was deployed,
-- sourced from project_rate_items at the time of deployment.
ALTER TABLE equipment_deployments
  ADD COLUMN IF NOT EXISTS rate_item_id        UUID,                         -- ref to project_rate_items.id (no FK — table created by app)
  ADD COLUMN IF NOT EXISTS billing_basis       TEXT,                         -- 'hourly' | 'daily' | 'monthly' | 'short_term_hourly'
  ADD COLUMN IF NOT EXISTS rate_per_hour       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS rate_per_day        NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS rate_per_month      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS max_hours_per_day   NUMERIC(5,2)  DEFAULT 8,
  ADD COLUMN IF NOT EXISTS max_hours_per_month NUMERIC(6,2)  DEFAULT 200,
  ADD COLUMN IF NOT EXISTS ot_percentage       NUMERIC(5,2)  DEFAULT 125,    -- OT charged at X% of pro-rata hourly
  ADD COLUMN IF NOT EXISTS fuel_by_client      BOOLEAN       DEFAULT false,  -- per-deployment override
  ADD COLUMN IF NOT EXISTS item_name           TEXT;                         -- rate item description (denormalized for reporting)

-- ─── 3. Relax NOT NULL constraints (original schema was stricter than needed) ─
-- client_id was NOT NULL — equipment can be deployed internally without a client
ALTER TABLE equipment_deployments ALTER COLUMN client_id  DROP NOT NULL;
-- rental_rate was NOT NULL — rate card model makes it optional (rate_per_hour/day/month used instead)
ALTER TABLE equipment_deployments ALTER COLUMN rental_rate DROP NOT NULL;

-- ─── 5. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eq_deployments_equipment ON equipment_deployments(equipment_id);
CREATE INDEX IF NOT EXISTS idx_eq_deployments_project   ON equipment_deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_eq_deployments_status    ON equipment_deployments(status);

-- ─── 6. Verify ───────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                             AS total_equipment,
  COUNT(*) FILTER (WHERE specific_consumption_lph IS NOT NULL) AS with_consumption_rate,
  COUNT(*) FILTER (WHERE fuel_by_client = true)        AS client_fuel_machines
FROM equipment;

SELECT
  COUNT(*)                                             AS total_deployments,
  COUNT(*) FILTER (WHERE billing_basis IS NOT NULL)    AS with_rate_card,
  COUNT(*) FILTER (WHERE fuel_by_client = true)        AS client_fuel_deployments
FROM equipment_deployments;
