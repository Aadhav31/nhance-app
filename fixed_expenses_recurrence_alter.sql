-- ============================================================
-- Fixed Expenses — Add recurrence columns
-- Run AFTER fixed_expenses_migration.sql
-- ============================================================

ALTER TABLE fixed_expenses
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT NOT NULL DEFAULT 'monthly'
    CHECK (recurrence_type IN ('monthly','quarterly','half_yearly','yearly','custom_days')),
  ADD COLUMN IF NOT EXISTS start_date      DATE,
  ADD COLUMN IF NOT EXISTS recurrence_days INTEGER;

-- Confirm
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'fixed_expenses'
  AND column_name IN ('recurrence_type','start_date','recurrence_days');
