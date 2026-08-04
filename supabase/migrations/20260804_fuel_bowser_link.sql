-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Link fuel_tanks ↔ equipment for Fuel Bowser registration
--   Bowsers are now registered in Fleet as equipment (type = 'Fuel Bowser')
--   and optionally linked to a fuel_tanks record for stock tracking.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fuel_tanks
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL;

COMMENT ON COLUMN fuel_tanks.equipment_id IS
  'For bowser-type tanks: FK to the equipment record registered in Fleet. '
  'Allows full vehicle tracking (reg no, insurance, driver) while fuel stock '
  'stays in fuel_tanks.';

CREATE INDEX IF NOT EXISTS idx_fuel_tanks_equipment
  ON fuel_tanks(equipment_id) WHERE equipment_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
