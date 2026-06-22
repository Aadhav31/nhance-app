-- vendors_full_table.sql
-- Run in Supabase SQL Editor
-- Creates vendors table with ALL columns from scratch

CREATE TABLE IF NOT EXISTS vendors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Identity
  vendor_name       TEXT NOT NULL,
  vendor_code       TEXT,
  category          TEXT DEFAULT 'general'
                    CHECK (category IN ('general','fuel_supplier','spare_parts','tyres','lubricants',
                                        'civil','electrical','subcontractor','transport','misc')),
  gstin             TEXT,

  -- Contact
  contact_name      TEXT,
  contact_phone     TEXT,
  contact_email     TEXT,
  address           TEXT,
  notes             TEXT,

  -- Bank details
  bank_name         TEXT,
  bank_account_name TEXT,
  bank_account      TEXT,
  bank_ifsc         TEXT,

  -- KYC documents (storage URLs)
  aadhar_url        TEXT,
  pan_url           TEXT,
  cheque_url        TEXT,
  gst_cert_url      TEXT,

  -- Meta
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors_company_isolation" ON vendors;
CREATE POLICY "vendors_company_isolation" ON vendors
  USING (company_id IN (
    SELECT company_id FROM user_profiles WHERE id = auth.uid()
  ));

-- Index
CREATE INDEX IF NOT EXISTS idx_vendors_company ON vendors(company_id);

NOTIFY pgrst, 'reload schema';
