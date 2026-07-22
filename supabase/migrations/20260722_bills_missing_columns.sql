-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add missing columns to bills table
--
-- These columns are referenced in PurchasePage.jsx but were never added
-- via a migration (likely created/tested manually in Supabase Studio).
--
-- Run in Supabase SQL Editor, then:
--   NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS vendor_gstin       text,
  ADD COLUMN IF NOT EXISTS bill_ref           text,
  ADD COLUMN IF NOT EXISTS use_igst           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_tax_invoice     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tax_inclusive      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_type       text    NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS credit_days        integer,
  ADD COLUMN IF NOT EXISTS taxable_amount     numeric(14,2),
  ADD COLUMN IF NOT EXISTS discount_amount    numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_rate          numeric(6,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_rate          numeric(6,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_rate          numeric(6,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount        numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount        numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount        numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachment_url     text,
  ADD COLUMN IF NOT EXISTS equipment_name     text;

NOTIFY pgrst, 'reload schema';
