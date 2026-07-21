-- Stock receipt → bill linking
-- Adds vehicle number capture, pending-bill flag, and bill link to stock transactions

ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
  ADD COLUMN IF NOT EXISTS requires_bill  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bill_id        UUID REFERENCES bills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stxn_requires_bill ON stock_transactions(company_id, requires_bill) WHERE requires_bill = TRUE;
CREATE INDEX IF NOT EXISTS idx_stxn_bill_id       ON stock_transactions(bill_id) WHERE bill_id IS NOT NULL;