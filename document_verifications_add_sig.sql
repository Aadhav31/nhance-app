-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add HMAC signature column to document_verifications
--
-- Run this in Supabase SQL Editor AFTER document_verifications.sql
-- Adds the `sig` column that stores the HMAC-SHA256 signature of the document
-- fields. Existing records will have sig = NULL (legacy; integrity check skipped
-- on the verify page for those records).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE document_verifications
  ADD COLUMN IF NOT EXISTS sig TEXT;

-- Optional: index for fast sig lookups (not strictly required)
CREATE INDEX IF NOT EXISTS document_verifications_sig_idx
  ON document_verifications(sig)
  WHERE sig IS NOT NULL;
