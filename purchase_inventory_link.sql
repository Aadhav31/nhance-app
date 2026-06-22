-- purchase_inventory_link.sql
-- Links Purchase Bills → Inventory (stock_transactions)
-- Run in Supabase SQL Editor

-- 1. Add inventory columns to bill line items
ALTER TABLE bill_line_items
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_id          UUID REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inward_type       TEXT DEFAULT NULL
    CHECK (inward_type IS NULL OR inward_type IN ('to_stock', 'direct_issue'));

-- 2. Let stock_transactions know which bill triggered the inward
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS bill_id UUID REFERENCES bills(id) ON DELETE SET NULL;

-- 3. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_bill_line_inv_item ON bill_line_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stxn_bill          ON stock_transactions(bill_id);

NOTIFY pgrst, 'reload schema';

-- ── What this enables ─────────────────────────────────────────────────────────
-- When a vendor bill is created with line items linked to inventory items:
--   inward_type = 'to_stock'    → auto-inserts stock_transaction (type: in)
--                                  Updates inventory_stock via existing DB trigger
--   inward_type = 'direct_issue' → bill is recorded but no inventory entry
--                                  Material went straight to site / production
-- stock_transactions.bill_id lets you trace every stock inward back to its bill.
