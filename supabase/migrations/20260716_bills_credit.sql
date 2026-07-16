-- Add payment_type and credit_days to bills
-- payment_type: 'cash' (paid immediately) | 'credit' (payment within credit_days)
-- credit_days: number of days for credit period (30, 45, 60, 90, etc.)
-- due_date already exists on the table — will be auto-computed from bill_date + credit_days

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS payment_type TEXT    DEFAULT 'credit',
  ADD COLUMN IF NOT EXISTS credit_days  INTEGER DEFAULT 30;

-- Back-fill existing bills: if they already have a due_date they are credit bills
UPDATE bills SET payment_type = 'credit' WHERE payment_type IS NULL;
