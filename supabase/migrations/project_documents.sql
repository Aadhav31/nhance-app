-- ── Project Documents ─────────────────────────────────────────────────────────
-- Stores POs, Work Orders, Contracts, Drawings received from clients
-- Files are stored in Supabase Storage bucket: project-documents

CREATE TABLE IF NOT EXISTS project_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,

  -- Document metadata
  doc_type      TEXT NOT NULL CHECK (doc_type IN ('po', 'work_order', 'contract', 'drawing')),
  doc_name      TEXT NOT NULL,
  doc_number    TEXT,
  doc_date      DATE,
  amount        NUMERIC(15,2),
  notes         TEXT,

  -- Storage reference
  file_path     TEXT,          -- path inside the bucket, e.g. company_id/project_id/uuid-filename
  file_name     TEXT,          -- original filename shown to user
  file_size     BIGINT,        -- bytes
  file_type     TEXT,          -- MIME type

  uploaded_by   UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row-level security
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_documents_company_access"
ON project_documents FOR ALL
USING (
  company_id IN (
    SELECT company_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS project_documents_project_idx  ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS project_documents_company_idx  ON project_documents(company_id);
CREATE INDEX IF NOT EXISTS project_documents_doc_type_idx ON project_documents(doc_type);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'project_documents_updated_at'
  ) THEN
    CREATE TRIGGER project_documents_updated_at
    BEFORE UPDATE ON project_documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── Storage bucket setup instructions ─────────────────────────────────────────
-- Run these in the Supabase dashboard → Storage, or via supabase CLI:
--
-- 1. Create a bucket named: project-documents
--    - Public: false (signed URLs only)
--    - File size limit: 50 MB
--    - Allowed MIME types: application/pdf, image/*, application/msword,
--      application/vnd.openxmlformats-officedocument.*
--
-- 2. Storage policy (in Supabase dashboard → Storage → project-documents → Policies):
--    Allow authenticated users to SELECT/INSERT/DELETE their company's files.
--    The path convention is:  {company_id}/{project_id}/{uuid}-{filename}
--
-- Or paste this in Supabase SQL editor after creating the bucket:
-- INSERT INTO storage.buckets (id, name, public, file_size_limit)
-- VALUES ('project-documents', 'project-documents', false, 52428800)
-- ON CONFLICT (id) DO NOTHING;
--
-- CREATE POLICY "Authenticated upload"
-- ON storage.objects FOR INSERT TO authenticated
-- WITH CHECK (bucket_id = 'project-documents');
--
-- CREATE POLICY "Authenticated read own"
-- ON storage.objects FOR SELECT TO authenticated
-- USING (bucket_id = 'project-documents');
--
-- CREATE POLICY "Authenticated delete own"
-- ON storage.objects FOR DELETE TO authenticated
-- USING (bucket_id = 'project-documents');
