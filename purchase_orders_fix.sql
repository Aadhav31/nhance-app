-- purchase_orders_fix.sql
-- Adds missing columns to purchase_orders and po_line_items,
-- and fixes the status CHECK constraint to include 'confirmed'.
-- Run in Supabase SQL Editor.

-- ── 1. Add missing columns to purchase_orders ─────────────────────────────────

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_address  TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply   TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_rate         NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_rate         NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_rate         NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount       NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount       NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount       NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_gstin      TEXT,
  ADD COLUMN IF NOT EXISTS is_tax_invoice    BOOLEAN DEFAULT false;

-- ── 2. Fix status CHECK constraint to include 'confirmed' ─────────────────────

-- Drop the old constraint (Postgres auto-names it <table>_<col>_check)
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- Add the new constraint with 'confirmed' included
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('draft','sent','confirmed','partially_received','received','cancelled'));

-- ── 3. Add hsn_sac to po_line_items (used in line item inserts) ───────────────

ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS hsn_sac TEXT;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running, POs should create and display correctly.
