-- ─────────────────────────────────────────────────────────────────────────────
-- Extend crusher_client_vehicles:
--   1. Add 'third_party' to owner_type (hired transport contractor)
--   2. Add transporter_name for third_party vehicles
--   3. client_id stays optional/informational — "usual client" hint for auto-fill
--      NOT a restriction. Any vehicle can serve any client per trip.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old check constraint (name may vary — try both common forms)
ALTER TABLE crusher_client_vehicles
  DROP CONSTRAINT IF EXISTS crusher_client_vehicles_owner_type_check;

-- Re-add with third_party included
ALTER TABLE crusher_client_vehicles
  ADD CONSTRAINT crusher_client_vehicles_owner_type_check
    CHECK (owner_type IN ('client', 'own', 'third_party'));

-- transporter_name: used when owner_type = 'third_party'
ALTER TABLE crusher_client_vehicles
  ADD COLUMN IF NOT EXISTS transporter_name text;
