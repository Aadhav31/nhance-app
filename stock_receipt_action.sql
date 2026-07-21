-- Mark stock receipt as resolved via transfer (or other non-bill action)
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS action_taken BOOLEAN DEFAULT FALSE;
