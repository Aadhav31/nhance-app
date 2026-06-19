-- ─────────────────────────────────────────────────────────────────────────────
-- Nhance — Clients schema v4
-- Adds: client_type (business/individual), salutation, first_name,
--       last_name, display_name
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_type   TEXT DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS salutation    TEXT,
  ADD COLUMN IF NOT EXISTS first_name    TEXT,
  ADD COLUMN IF NOT EXISTS last_name     TEXT,
  ADD COLUMN IF NOT EXISTS display_name  TEXT;

NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_name IN ('client_type','salutation','first_name','last_name','display_name')
ORDER BY column_name;
