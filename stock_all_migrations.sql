-- ============================================================
-- NHANCE INVENTORY — STOCK TRANSACTIONS MASTER MIGRATION
-- Run ONCE in Supabase SQL Editor (fully idempotent)
-- Consolidates: stock_bill_link + stock_receipt_action + stock_supplier_link
-- ============================================================

-- 1. Vehicle number + pending-bill flag + bill link
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS vehicle_number  TEXT,
  ADD COLUMN IF NOT EXISTS requires_bill   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bill_id         UUID REFERENCES bills(id) ON DELETE SET NULL;

-- 2. Action-taken flag (receipt resolved w/o bill) + per-receipt unit
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS action_taken    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unit            TEXT;

-- 3. Supplier tracking + delivery mode
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS supplier_id     UUID REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_mode   TEXT;  -- 'supplier_vehicle' | 'own_vehicle'

-- 4. Backfill NULLs so boolean filters work correctly
UPDATE stock_transactions SET requires_bill = FALSE WHERE requires_bill IS NULL;
UPDATE stock_transactions SET action_taken  = FALSE WHERE action_taken  IS NULL;

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS idx_stxn_requires_bill
  ON stock_transactions(company_id, requires_bill) WHERE requires_bill = TRUE;

CREATE INDEX IF NOT EXISTS idx_stxn_bill_id
  ON stock_transactions(bill_id) WHERE bill_id IS NOT NULL;

-- ============================================================
-- DONE. All stock_transactions extended columns are now present.
-- ============================================================
