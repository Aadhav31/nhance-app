-- ─────────────────────────────────────────────────────────────────────────────
-- operator_shift_tables.sql
-- Tables for operator portal: fuel entries, incidents per shift
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & run
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Shift fuel entries ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_fuel_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id          UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  equipment_id      UUID NOT NULL REFERENCES equipment(id),
  quantity_liters   NUMERIC(8,2) NOT NULL,
  rate_per_liter    NUMERIC(8,2),            -- advanced mode only
  total_amount      NUMERIC(12,2),           -- computed: qty × rate
  meter_at_filling  NUMERIC(10,2),           -- hour meter reading when fuel was added
  fuel_source       TEXT NOT NULL DEFAULT 'tank', -- 'tank' | 'client'
  receipt_url       TEXT,                    -- stamped proof photo
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_entries_shift     ON shift_fuel_entries(shift_id);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_equipment ON shift_fuel_entries(equipment_id);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_company   ON shift_fuel_entries(company_id, created_at DESC);

-- ─── 2. Shift incidents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_incidents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id       UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  equipment_id   UUID NOT NULL REFERENCES equipment(id),
  incident_type  TEXT NOT NULL DEFAULT 'breakdown',
    -- breakdown | accident | near_miss | damage | theft | other
  severity       TEXT NOT NULL DEFAULT 'low',
    -- low | medium | high | critical
  description    TEXT NOT NULL,
  action_taken   TEXT,                       -- advanced mode only
  reported_by    UUID REFERENCES user_profiles(id),
  photo_urls     TEXT[] DEFAULT '{}',
  incident_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved       BOOLEAN DEFAULT false,
  resolved_at    TIMESTAMPTZ,
  resolved_by    UUID REFERENCES user_profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_shift     ON shift_incidents(shift_id);
CREATE INDEX IF NOT EXISTS idx_incidents_equipment ON shift_incidents(equipment_id);
CREATE INDEX IF NOT EXISTS idx_incidents_company   ON shift_incidents(company_id, incident_time DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_severity  ON shift_incidents(company_id, severity) WHERE resolved = false;

-- ─── 3. Shifts — add idle_hours and project_id if not present ────────────────
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS idle_hours   NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_id   UUID REFERENCES projects(id) ON DELETE SET NULL;

-- ─── 4. Verify ────────────────────────────────────────────────────────────────
SELECT 'shift_fuel_entries' AS tbl, COUNT(*) FROM shift_fuel_entries
UNION ALL
SELECT 'shift_incidents',           COUNT(*) FROM shift_incidents;
