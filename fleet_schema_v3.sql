-- fleet_schema_v3.sql
-- Run AFTER fleet_schema_v2.sql
-- Adds: equipment_documents table for file-level document storage

CREATE TABLE IF NOT EXISTS equipment_documents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID NOT NULL,
  equipment_id  UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,

  -- Document classification
  doc_type      TEXT NOT NULL,    -- 'purchase_invoice' | 'rc_book' | 'insurance' | 'fitness' | 'puc' | 'permit' | 'other'
  doc_name      TEXT,             -- custom label (required for 'other', optional for rest)

  -- File storage
  file_url      TEXT NOT NULL,    -- Supabase Storage public URL
  file_name     TEXT,             -- original filename for display
  file_size_kb  NUMERIC,          -- optional, for display

  -- Dates
  issued_date   DATE,
  expiry_date   DATE,             -- null for non-expiring docs like purchase invoice

  notes         TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by   TEXT              -- name of person who uploaded
);

-- Index for fast per-equipment lookups
CREATE INDEX IF NOT EXISTS idx_equipment_docs_equipment_id ON equipment_documents(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_docs_expiry ON equipment_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- RLS: same pattern as other tables — company_id based
ALTER TABLE equipment_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "company_docs_select"
  ON equipment_documents FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY IF NOT EXISTS "company_docs_insert"
  ON equipment_documents FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY IF NOT EXISTS "company_docs_delete"
  ON equipment_documents FOR DELETE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
