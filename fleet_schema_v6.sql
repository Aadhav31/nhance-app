-- fleet_schema_v6.sql
-- Adds missing ownership + service columns to equipment table
-- Safe to run — uses ADD COLUMN IF NOT EXISTS throughout

-- ── Ownership ─────────────────────────────────────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS ownership_type   TEXT DEFAULT 'own',  -- 'own' | 'hired' | 'client_supplied'
  ADD COLUMN IF NOT EXISTS owner_name       TEXT,
  ADD COLUMN IF NOT EXISTS owner_contact    TEXT,
  ADD COLUMN IF NOT EXISTS hire_start_date  DATE,
  ADD COLUMN IF NOT EXISTS hire_end_date    DATE;

-- ── Service Schedule ──────────────────────────────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS last_service_date    DATE,
  ADD COLUMN IF NOT EXISTS last_service_meter   NUMERIC,
  ADD COLUMN IF NOT EXISTS service_interval_hrs NUMERIC DEFAULT 250,
  ADD COLUMN IF NOT EXISTS next_service_date    DATE,
  ADD COLUMN IF NOT EXISTS next_service_meter   NUMERIC;

-- ── Sub-category (also in v5, safe to repeat) ────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS sub_category TEXT;

NOTIFY pgrst, 'reload schema';
