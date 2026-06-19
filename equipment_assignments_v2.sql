-- equipment_assignments_v2.sql
-- Add shift_type to equipment_assignments so admin presets it during operator mapping
-- Run in Supabase SQL Editor

ALTER TABLE equipment_assignments
  ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'day'
    CHECK (shift_type IN ('day', 'night', 'double'));

NOTIFY pgrst, 'reload schema';

-- ── Flow after this migration ─────────────────────────────────────────────────
-- 1. Admin opens Fleet → Equipment → Assigned Operators
-- 2. Selects operator from HR dropdown + selects shift type (Day / Night / Double)
-- 3. When operator starts shift, shift_type is pre-filled and locked
-- 4. Manager/Admin can still override shift type at shift start if needed
