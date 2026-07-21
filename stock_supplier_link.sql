-- Supplier + delivery mode tracking for stock receipts
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS supplier_id   UUID REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT;  -- 'supplier_vehicle' | 'own_vehicle'

-- Allow 'draft' bill status for auto-created draft bills from stock receipts
-- (bills table likely has no CHECK constraint on status, so this is informational only)
