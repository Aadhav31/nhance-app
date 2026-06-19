-- shifts_schema_v2.sql
-- Add work summary and handover fields to shifts table
-- Run in Supabase SQL Editor

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS work_done          TEXT,          -- what was done this shift (voice entry)
  ADD COLUMN IF NOT EXISTS handover_notes     TEXT,          -- notes passed to next shift operator
  ADD COLUMN IF NOT EXISTS end_location_lat   FLOAT8,        -- GPS at shift end
  ADD COLUMN IF NOT EXISTS end_location_lng   FLOAT8,
  ADD COLUMN IF NOT EXISTS end_location_address TEXT;        -- reverse-geocoded address at shift end

NOTIFY pgrst, 'reload schema';

-- ── Usage ─────────────────────────────────────────────────────────────────────
-- work_done       → "Loaded 12 trips, completed cut at grid C4" (voice-transcribed)
-- handover_notes  → "Left machine at lower bench, tyre pressure low on rear-left" (voice)
-- end_location_*  → auto-captured from browser GPS when operator ends shift

