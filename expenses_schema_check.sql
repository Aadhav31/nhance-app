-- Run this FIRST in a separate tab to see all NOT NULL columns in expenses
-- So we don't hit any more hidden constraint errors
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'expenses'
ORDER BY ordinal_position;
