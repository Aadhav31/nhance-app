-- vendors_missing_columns.sql
-- Run in Supabase SQL Editor

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS vendor_code   TEXT,
  ADD COLUMN IF NOT EXISTS contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS address       TEXT,
  ADD COLUMN IF NOT EXISTS notes         TEXT;

NOTIFY pgrst, 'reload schema';
