-- Add issuer metadata columns to document_verifications
-- These are stored at creation time so the public verify page
-- doesn't need to join authenticated tables (which RLS blocks).

ALTER TABLE document_verifications
  ADD COLUMN IF NOT EXISTS company_name   text,
  ADD COLUMN IF NOT EXISTS issued_by_name text;

COMMENT ON COLUMN document_verifications.company_name   IS 'Company display name snapshot at verification creation';
COMMENT ON COLUMN document_verifications.issued_by_name IS 'Full name of the user who generated the document';
