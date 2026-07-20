-- Add bank details + MSME + extra phone fields to companies table
-- Used by crusher invoice PDF generator

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS phone2         text,
  ADD COLUMN IF NOT EXISTS office_phone   text,
  ADD COLUMN IF NOT EXISTS msme           text,
  ADD COLUMN IF NOT EXISTS bank_name      text,
  ADD COLUMN IF NOT EXISTS bank_account   text,
  ADD COLUMN IF NOT EXISTS bank_branch    text,
  ADD COLUMN IF NOT EXISTS bank_ifsc      text,
  ADD COLUMN IF NOT EXISTS upi_number     text;
