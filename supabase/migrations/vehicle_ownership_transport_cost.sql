-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: vehicle_ownership_type + transport_cost on stock_transactions
--
-- Context:
--   Stock-In auto-detects vehicle ownership by looking up the vehicle number
--   in the company's Equipment DB (equipment table, registration_number col).
--
--   Company Fleet vehicles (own or hired) → bill = materials only
--   External (unregistered) vehicles      → bill = materials + transport cost
--
-- Run in Supabase SQL Editor, then:
--   NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS vehicle_ownership_type text,        -- 'company_fleet' | 'external_hired'
  ADD COLUMN IF NOT EXISTS transport_cost         numeric(12,2); -- flat transport cost per GRN (external only)

-- Optional: index on ownership type for filtering
CREATE INDEX IF NOT EXISTS idx_stxn_vehicle_ownership
  ON stock_transactions (company_id, vehicle_ownership_type)
  WHERE vehicle_ownership_type IS NOT NULL;

-- After running this migration, reload PostgREST schema cache:
-- NOTIFY pgrst, 'reload schema';
