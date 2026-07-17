-- Track origin of payments_made entries
-- source_type = 'field_expense' when created via "Record as Bill Payment" in FieldExpensePage
-- source_id   = field_expenses.id of the originating expense
-- Used to show "Via Field Exp" badge in Payments Made tab and prevent double-counting

ALTER TABLE payments_made
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id   UUID;

CREATE INDEX IF NOT EXISTS idx_payments_made_source ON payments_made(source_type, source_id);
