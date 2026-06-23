-- ─────────────────────────────────────────────────────────────────────────────
-- incidents_schema_upgrade_v2.sql
-- IMPORTANT: Run this in Supabase SQL Editor — paste the WHOLE file at once.
--
-- Root cause: incident_type and severity are PostgreSQL ENUMs — new values
-- (safety_issue, unscheduled_maintenance, regular_maintenance) cannot be added
-- inside a transaction. This migration converts them to TEXT to avoid that
-- limitation entirely, then adds all missing columns.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Convert incident_type column to TEXT ──────────────────────────────
-- This removes the enum restriction so any string value works.
ALTER TABLE shift_incidents
  ALTER COLUMN incident_type TYPE TEXT USING incident_type::TEXT;

-- ── Step 2: Convert severity column to TEXT (and make nullable) ───────────────
ALTER TABLE shift_incidents
  ALTER COLUMN severity TYPE TEXT USING severity::TEXT,
  ALTER COLUMN severity DROP NOT NULL;

-- ── Step 3: Make shift_id nullable ───────────────────────────────────────────
-- Incidents can be reported without an active shift
ALTER TABLE shift_incidents
  ALTER COLUMN shift_id DROP NOT NULL;

-- ── Step 4: Add all missing detail columns ────────────────────────────────────
ALTER TABLE shift_incidents
  ADD COLUMN IF NOT EXISTS breakdown_cause       TEXT,
  ADD COLUMN IF NOT EXISTS rectification_needed  TEXT,
  ADD COLUMN IF NOT EXISTS parts_status          TEXT,
  ADD COLUMN IF NOT EXISTS damage_cause          TEXT,
  ADD COLUMN IF NOT EXISTS what_needs_to_be_done TEXT,
  ADD COLUMN IF NOT EXISTS location_lat          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_address      TEXT;

-- ── Step 5: Fix notifications table ──────────────────────────────────────────
-- Convert type to TEXT (avoids notification_type enum restriction)
ALTER TABLE notifications
  ALTER COLUMN type TYPE TEXT;

-- Add metadata column for incident details
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- ── Step 6: Verify (optional — check the columns exist) ───────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'shift_incidents'
-- ORDER BY ordinal_position;
