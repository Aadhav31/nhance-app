-- Mark stock receipt as resolved via transfer (or other non-bill action)
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS action_taken BOOLEAN DEFAULT FALSE;

-- Per-transaction UOM (can differ from item's default — e.g. receive in tonnes, issue in bags)
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS unit TEXT;
