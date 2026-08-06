-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: shift_enforcement setting on companies
--
-- off      → no time restriction, operators start anytime
-- flexible → operators can start within the project's shift window ± grace (default)
-- strict   → operators must start within ±grace_mins of their scheduled shift START
--
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS shift_enforcement TEXT
    NOT NULL DEFAULT 'flexible'
    CHECK (shift_enforcement IN ('off', 'flexible', 'strict'));

NOTIFY pgrst, 'reload schema';
