-- attendance_auto_schema.sql
-- Auto-attendance from shift close + configurable OT threshold
-- Run in Supabase SQL Editor

-- 1. OT threshold on company (default 12 hours per user requirement)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ot_threshold_hours NUMERIC DEFAULT 12;

-- 2. Source field on hr_attendance — tracks whether it was manual or auto-filled from shift
ALTER TABLE hr_attendance
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',  -- 'manual' | 'shift_auto'
  ADD COLUMN IF NOT EXISTS shift_id UUID;                 -- link back to the shift record

-- 3. Index for fast shift-source lookups
CREATE INDEX IF NOT EXISTS idx_hr_attendance_shift_id ON hr_attendance(shift_id);

NOTIFY pgrst, 'reload schema';

-- ── Notes ─────────────────────────────────────────────────────────────────────
-- ot_threshold_hours: hours beyond which OT kicks in. Default 12.
--   < 4h  → half_day
--   4–threshold → present (no OT)
--   > threshold → present + OT hours stored in ot_hours
-- source='shift_auto' means attendance was written when operator closed their shift.
-- HR can still override by clicking status buttons in the Attendance tab.
