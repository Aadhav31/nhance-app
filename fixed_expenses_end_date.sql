-- Add end_date to fixed_expenses
-- Run once in Supabase SQL Editor

ALTER TABLE fixed_expenses
  ADD COLUMN IF NOT EXISTS end_date DATE DEFAULT NULL;

COMMENT ON COLUMN fixed_expenses.end_date IS
  'Optional date after which this fixed expense stops recurring. NULL = ongoing.';
