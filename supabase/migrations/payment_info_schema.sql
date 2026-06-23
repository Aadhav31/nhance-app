-- ─────────────────────────────────────────────────────────────────────────────
-- payment_info_schema.sql
-- Adds UPI and bank account details to the companies table.
-- These are shown on invoices so clients can pay directly (0% commission).
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS upi_id               TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_account_name    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_account_number  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_ifsc            TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_name            TEXT DEFAULT NULL;

COMMENT ON COLUMN companies.upi_id IS
  'Company UPI ID (e.g. businessname@ybl). Shown as QR code on invoices for 0% fee payments.';
COMMENT ON COLUMN companies.bank_account_name IS
  'Account holder name for NEFT/RTGS transfers shown on invoices.';
COMMENT ON COLUMN companies.bank_account_number IS
  'Bank account number shown on invoices for direct transfers.';
COMMENT ON COLUMN companies.bank_ifsc IS
  'Bank IFSC code for NEFT/RTGS/IMPS transfers.';
COMMENT ON COLUMN companies.bank_name IS
  'Bank name (e.g. HDFC Bank, SBI) shown on invoices.';
