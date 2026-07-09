-- ─────────────────────────────────────────────────────────────────────────────
-- line_items_3dp_migration.sql
-- Widen quantity, rate, amount columns in invoice_line_items to 3 decimal places
-- Run ONCE in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Widen the three numeric columns that need sub-rupee precision
ALTER TABLE invoice_line_items
  ALTER COLUMN quantity TYPE NUMERIC(15,3),
  ALTER COLUMN rate     TYPE NUMERIC(15,3),
  ALTER COLUMN amount   TYPE NUMERIC(15,3);

-- Verify
SELECT column_name, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'invoice_line_items'
  AND column_name IN ('quantity', 'rate', 'amount')
ORDER BY column_name;
