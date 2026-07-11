-- Letter soft-delete: adds deleted_at timestamp to document_verifications
-- Run in Supabase SQL Editor

-- 1. Add deleted_at column (stores when a letter was deleted)
ALTER TABLE document_verifications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Index for fast deleted-doc queries
CREATE INDEX IF NOT EXISTS document_verifications_deleted_at_idx
  ON document_verifications (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 3. (Optional) If there's a CHECK constraint on status that doesn't allow 'deleted',
--    update it. Run this only if you get a constraint violation error on delete:
-- ALTER TABLE document_verifications DROP CONSTRAINT IF EXISTS document_verifications_status_check;
-- ALTER TABLE document_verifications ADD CONSTRAINT document_verifications_status_check
--   CHECK (status IN ('active', 'void', 'deleted'));
