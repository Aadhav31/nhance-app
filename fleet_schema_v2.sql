-- fleet_schema_v2.sql
-- Run in Supabase SQL Editor
-- Adds: equipment ownership, document expiry tracking, service schedule

-- ── Ownership ────────────────────────────────────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS ownership_type   TEXT DEFAULT 'own',  -- 'own' | 'hired' | 'client_supplied'
  ADD COLUMN IF NOT EXISTS owner_name       TEXT,                -- hired: vendor/owner | client: client name
  ADD COLUMN IF NOT EXISTS owner_contact    TEXT,                -- phone / email of owner/vendor
  ADD COLUMN IF NOT EXISTS hire_start_date  DATE,                -- hired: when hire period started
  ADD COLUMN IF NOT EXISTS hire_end_date    DATE;                -- hired: when hire period ends

-- ── Document Expiry Tracking ─────────────────────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
  ADD COLUMN IF NOT EXISTS rc_expiry        DATE,                -- registration certificate
  ADD COLUMN IF NOT EXISTS fitness_expiry   DATE,                -- fitness / roadworthiness
  ADD COLUMN IF NOT EXISTS puc_expiry       DATE,                -- pollution under control
  ADD COLUMN IF NOT EXISTS permit_expiry    DATE;                -- operating / route permit

-- ── Service Schedule ─────────────────────────────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS last_service_date   DATE,
  ADD COLUMN IF NOT EXISTS last_service_meter  NUMERIC,           -- meter reading at last service
  ADD COLUMN IF NOT EXISTS service_interval_hrs NUMERIC DEFAULT 250, -- hours between services
  ADD COLUMN IF NOT EXISTS next_service_date   DATE,
  ADD COLUMN IF NOT EXISTS next_service_meter  NUMERIC;           -- meter reading when next service is due

-- ── Future HR/Payroll linking (nullable — populated when HR module is built) ─
ALTER TABLE equipment_assignments
  ADD COLUMN IF NOT EXISTS staff_id UUID;                         -- will reference hr_staff.id later

NOTIFY pgrst, 'reload schema';
