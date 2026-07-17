-- Track when a field expense has been recorded as a bill payment
-- linked_bill_id: set when "Record as Bill Payment" is used in FieldExpensePage
-- prevents double-linking and shows the bill link badge on the expense card

ALTER TABLE field_expenses
  ADD COLUMN IF NOT EXISTS linked_bill_id     UUID,
  ADD COLUMN IF NOT EXISTS linked_bill_number TEXT;
