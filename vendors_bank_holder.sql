-- vendors_bank_holder.sql
-- Run in Supabase SQL Editor

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT;

NOTIFY pgrst, 'reload schema';
