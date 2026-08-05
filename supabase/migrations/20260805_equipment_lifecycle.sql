-- ─────────────────────────────────────────────────────────────────────────────
-- Equipment Lifecycle Tracking
-- Adds three columns to the equipment table so P&M can maintain a full
-- picture of each machine's life stage: how many hours it has left, when the
-- major overhaul is due, and what reading it was at when the company bought it.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Expected total useful life (hours)
--    Set by P&M manager based on manufacturer spec or company standard.
--    Typical values: Excavator 220LC → 20,000 hrs, Tipper → 10,000 hrs
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS useful_life_hours     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS major_overhaul_hours  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS meter_at_purchase     NUMERIC(10,2) DEFAULT 0;

-- 2. Comments for clarity
COMMENT ON COLUMN equipment.useful_life_hours    IS 'Expected total life in hours (from new). Used to compute % life used and remaining hours.';
COMMENT ON COLUMN equipment.major_overhaul_hours IS 'Hour meter reading at which a major overhaul is due (e.g. 15000 for a Hitachi 220LC).';
COMMENT ON COLUMN equipment.meter_at_purchase    IS 'Hour meter reading when this company purchased the machine. 0 = purchased new.';

NOTIFY pgrst, 'reload schema';
