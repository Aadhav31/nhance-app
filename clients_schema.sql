-- ─────────────────────────────────────────────────────────────────────────────
-- Nhance — Clients table migration (run in Supabase SQL Editor)
-- Safe to run even if clients table already exists
-- ─────────────────────────────────────────────────────────────────────────────

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS clients (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add all columns safely (safe to run even if some already exist)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS trade_name         TEXT,
  ADD COLUMN IF NOT EXISTS business_type      TEXT,

  -- Government IDs
  ADD COLUMN IF NOT EXISTS gstin              TEXT,
  ADD COLUMN IF NOT EXISTS gstin_status       TEXT,
  ADD COLUMN IF NOT EXISTS gstin_verified     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gstin_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pan                TEXT,
  ADD COLUMN IF NOT EXISTS udyam_number       TEXT,
  ADD COLUMN IF NOT EXISTS cin                TEXT,
  ADD COLUMN IF NOT EXISTS tan                TEXT,

  -- Registered Address
  ADD COLUMN IF NOT EXISTS registered_address TEXT,
  ADD COLUMN IF NOT EXISTS city               TEXT,
  ADD COLUMN IF NOT EXISTS state              TEXT,
  ADD COLUMN IF NOT EXISTS pincode            TEXT,

  -- Billing Address
  ADD COLUMN IF NOT EXISTS billing_address    TEXT,
  ADD COLUMN IF NOT EXISTS billing_city       TEXT,
  ADD COLUMN IF NOT EXISTS billing_state      TEXT,
  ADD COLUMN IF NOT EXISTS billing_pincode    TEXT,
  ADD COLUMN IF NOT EXISTS same_as_registered BOOLEAN DEFAULT TRUE,

  -- Primary Contact
  ADD COLUMN IF NOT EXISTS contact_name         TEXT,
  ADD COLUMN IF NOT EXISTS contact_designation  TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone        TEXT,
  ADD COLUMN IF NOT EXISTS contact_email        TEXT,

  -- Secondary Contact
  ADD COLUMN IF NOT EXISTS contact2_name        TEXT,
  ADD COLUMN IF NOT EXISTS contact2_designation TEXT,
  ADD COLUMN IF NOT EXISTS contact2_phone       TEXT,
  ADD COLUMN IF NOT EXISTS contact2_email       TEXT,

  -- Business Terms
  ADD COLUMN IF NOT EXISTS payment_terms  TEXT,
  ADD COLUMN IF NOT EXISTS credit_limit   NUMERIC,

  ADD COLUMN IF NOT EXISTS notes          TEXT;

-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Create policy (safe — skips if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'company_clients'
  ) THEN
    CREATE POLICY "company_clients" ON clients
      FOR ALL TO authenticated USING (company_id = auth_company_id());
  END IF;
END $$;

-- ─── Verify ───────────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;
