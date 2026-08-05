-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Link fuel_tank_replenishments ↔ bills
--   Adds bill_id FK so a tank replenishment can be traced back to its
--   purchase bill — closing the loop: Bill → Tank Receipt → Issue to Machine
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fuel_tank_replenishments
  ADD COLUMN IF NOT EXISTS bill_id UUID REFERENCES bills(id) ON DELETE SET NULL;

COMMENT ON COLUMN fuel_tank_replenishments.bill_id IS
  'Purchase bill that funded this replenishment. Allows full audit trail: '
  'Bill → Tank Receipt → Fuel Issue to Machine.';

CREATE INDEX IF NOT EXISTS idx_fuel_replenishments_bill
  ON fuel_tank_replenishments(bill_id) WHERE bill_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
