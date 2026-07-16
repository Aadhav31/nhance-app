-- Add missing columns to equipment_documents
-- The original table was created without file metadata and extra fields
-- that the Fleet page document upload modal now uses.

ALTER TABLE equipment_documents
  ADD COLUMN IF NOT EXISTS file_name        TEXT,
  ADD COLUMN IF NOT EXISTS file_size_kb     INTEGER,
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS issued_date      DATE,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_at      TIMESTAMPTZ DEFAULT NOW();

-- Back-fill uploaded_at from created_at for existing rows
UPDATE equipment_documents SET uploaded_at = created_at WHERE uploaded_at IS NULL;
