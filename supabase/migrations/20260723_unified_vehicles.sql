-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Unified Vehicles Table
-- Replaces crusher_client_vehicles with a company-wide vehicle registry
-- Serves both Purchase (vendor/transport) and Sales (client/delivery) contexts
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 1. Create unified vehicles table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Identity
  vehicle_number       TEXT NOT NULL,                    -- registration plate
  vehicle_type         TEXT DEFAULT 'truck',             -- truck/tipper/tractor/trailer/other
  description          TEXT,                             -- optional notes

  -- Ownership
  ownership_type       TEXT NOT NULL DEFAULT 'own',      -- 'own' | 'vendor' | 'client' | 'transporter'
  vendor_id            UUID REFERENCES vendors(id) ON DELETE SET NULL,
  client_id            UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Driver
  driver_name          TEXT,
  driver_phone         TEXT,

  -- Transport billing
  transport_rate       NUMERIC(12,2),                    -- rate value (null = no auto-billing)
  transport_rate_unit  TEXT DEFAULT 'per_trip',          -- 'per_trip' | 'per_ton' | 'per_km'

  -- Status
  is_active            BOOLEAN DEFAULT TRUE,

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, vehicle_number)
);

-- ── 2. Migrate existing crusher_client_vehicles data ────────────────────────
INSERT INTO vehicles (
  company_id, vehicle_number, vehicle_type, ownership_type,
  client_id, is_active, created_at
)
SELECT
  ccv.company_id,
  ccv.vehicle_number,
  COALESCE(ccv.vehicle_type, 'truck'),
  CASE
    WHEN ccv.owner_type = 'third_party' THEN 'transporter'
    ELSE 'client'
  END,
  ccv.client_id,
  TRUE,
  NOW()
FROM crusher_client_vehicles ccv
WHERE NOT EXISTS (
  SELECT 1 FROM vehicles v
  WHERE v.company_id = ccv.company_id
    AND v.vehicle_number = ccv.vehicle_number
)
ON CONFLICT (company_id, vehicle_number) DO NOTHING;

-- ── 3. Add vehicle_id to stock_transactions ──────────────────────────────────
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

-- Back-fill vehicle_id from vehicle_number where possible
UPDATE stock_transactions st
SET vehicle_id = v.id
FROM vehicles v
WHERE v.company_id = st.company_id
  AND v.vehicle_number = st.vehicle_number
  AND st.vehicle_id IS NULL;

-- ── 4. Transport bill linkage on stock transactions ──────────────────────────
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS transport_bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport_cost    NUMERIC(12,2);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vehicles' AND policyname = 'vehicles_company_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY vehicles_company_access ON vehicles
        USING (
          company_id = (
            SELECT company_id FROM user_profiles WHERE id = auth.uid()
          )
        )
    $pol$;
  END IF;
END;
$$;

-- ── 6. Updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_vehicles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS vehicles_updated_at ON vehicles;
CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_vehicles_updated_at();

-- ── 7. Reload schema cache ───────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
