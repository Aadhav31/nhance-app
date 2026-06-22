-- vendors_documents.sql
-- Run in Supabase SQL Editor

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS aadhar_url   TEXT,
  ADD COLUMN IF NOT EXISTS pan_url      TEXT,
  ADD COLUMN IF NOT EXISTS cheque_url   TEXT,
  ADD COLUMN IF NOT EXISTS gst_cert_url TEXT;

NOTIFY pgrst, 'reload schema';
