-- ─────────────────────────────────────────────────────────────────────────────
-- Nhance — Clients schema v3 (run in Supabase SQL Editor)
-- Adds: client_number, gst_treatment, tax_preference, currency,
--       country codes for contacts, shipping address columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_number        TEXT,
  ADD COLUMN IF NOT EXISTS gst_treatment        TEXT,
  ADD COLUMN IF NOT EXISTS tax_preference       TEXT DEFAULT 'tax_payer',
  ADD COLUMN IF NOT EXISTS currency             TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS contact_country_code  TEXT DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS contact2_country_code TEXT DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS shipping_address     TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city        TEXT,
  ADD COLUMN IF NOT EXISTS shipping_state       TEXT,
  ADD COLUMN IF NOT EXISTS shipping_pincode     TEXT,
  ADD COLUMN IF NOT EXISTS shipping_same_as_billing BOOLEAN DEFAULT TRUE;

NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_name IN (
    'client_number','gst_treatment','tax_preference','currency',
    'contact_country_code','contact2_country_code',
    'shipping_address','shipping_city','shipping_state','shipping_pincode','shipping_same_as_billing'
  )
ORDER BY column_name;
