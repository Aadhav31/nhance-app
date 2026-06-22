-- vendors_created_by.sql
-- Run in Supabase SQL Editor

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
