-- ─────────────────────────────────────────────────────────────────────────────
-- Nhance — Display Mode schema (run in Supabase SQL Editor)
-- Adds Basic/Advanced mode preference per user + role defaults per company
-- ─────────────────────────────────────────────────────────────────────────────

-- User's personal mode preference (NULL = use company role default)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_mode TEXT DEFAULT NULL;

-- Company-wide default mode per role
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS role_default_modes JSONB
  DEFAULT '{"admin":"advanced","manager":"advanced","supervisor":"basic","operator":"basic","viewer":"basic","driver":"basic"}';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('user_profiles', 'companies')
  AND column_name IN ('display_mode', 'role_default_modes');
