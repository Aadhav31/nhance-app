-- ─────────────────────────────────────────────────────────────────────────────
-- incidents_schema_upgrade.sql
-- Fixes shift_incidents table + notifications table to match OperationsPage.jsx
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add missing values to incident_type enum ──────────────────────────────
-- Original enum only had: breakdown, accident, near_miss, damage, theft, other
ALTER TYPE incident_type ADD VALUE IF NOT EXISTS 'safety_issue';
ALTER TYPE incident_type ADD VALUE IF NOT EXISTS 'unscheduled_maintenance';
ALTER TYPE incident_type ADD VALUE IF NOT EXISTS 'regular_maintenance';

-- ── 2. Make shift_id nullable ─────────────────────────────────────────────────
-- Incidents can be reported outside of an active shift (standalone report)
ALTER TABLE shift_incidents
  ALTER COLUMN shift_id DROP NOT NULL;

-- ── 3. Make severity nullable ─────────────────────────────────────────────────
-- Non-safety incidents (breakdown, maintenance, theft) pass severity = null
ALTER TABLE shift_incidents
  ALTER COLUMN severity DROP NOT NULL;

-- ── 4. Add missing detail columns ─────────────────────────────────────────────
ALTER TABLE shift_incidents
  ADD COLUMN IF NOT EXISTS breakdown_cause       TEXT,
  ADD COLUMN IF NOT EXISTS rectification_needed  TEXT,
  ADD COLUMN IF NOT EXISTS parts_status          TEXT,        -- 'to_order', 'ordered', 'in_hand'
  ADD COLUMN IF NOT EXISTS damage_cause          TEXT,
  ADD COLUMN IF NOT EXISTS what_needs_to_be_done TEXT,
  ADD COLUMN IF NOT EXISTS location_lat          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_address      TEXT;

-- ── 5. Add missing values to notification_type enum ──────────────────────────
-- The notifications insert uses type = 'incident_<type>' strings
-- Easiest fix: change the column to TEXT (no enum restriction) so any string works
ALTER TABLE notifications
  ALTER COLUMN type TYPE TEXT;

-- Drop the old enum (only if no other column uses it)
-- We keep it commented out in case other code references it
-- DROP TYPE notification_type;

-- ── 6. Add metadata JSONB column to notifications ─────────────────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- ── 7. Ensure RLS policy allows insert on shift_incidents ─────────────────────
-- (In case the existing policy only covered NOT NULL shift_id rows)
-- Check existing policy first; recreate if needed.
DROP POLICY IF EXISTS "company_members_shift_incidents" ON shift_incidents;

CREATE POLICY "company_members_shift_incidents" ON shift_incidents
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM user_roles    WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM user_roles    WHERE user_id = auth.uid()
    )
  );

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this, incident reporting should work for all incident types.
-- The .catch(()=>{}) on the notifications insert means those errors are already
-- silently swallowed — but now it will succeed too.
