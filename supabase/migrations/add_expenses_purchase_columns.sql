-- ─────────────────────────────────────────────────────────────────────────────
-- add_expenses_purchase_columns.sql
-- The nhance-expense-app "purchase" path inserts bill_number, bill_photo_url,
-- total_amount, and inventory fields directly into the expenses table.
-- These columns were never added to the base expenses schema, causing:
--   "Could not find the 'bill_number' column of 'expenses' in the schema cache"
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS bill_number    TEXT,
  ADD COLUMN IF NOT EXISTS bill_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS total_amount   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS tax_amount     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inv_item_name  TEXT,
  ADD COLUMN IF NOT EXISTS inv_quantity   NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS inv_unit       TEXT;
