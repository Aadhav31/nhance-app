-- hr_attendance_v2.sql
-- Add shift clock-in / clock-out columns to hr_attendance
-- Run in Supabase SQL Editor

ALTER TABLE hr_attendance
  ADD COLUMN IF NOT EXISTS shift_start_time TEXT,  -- 'HH:MM' (24-hour)
  ADD COLUMN IF NOT EXISTS shift_end_time   TEXT;  -- 'HH:MM' (24-hour, may be next day)

-- Index for faster payroll processing queries
CREATE INDEX IF NOT EXISTS idx_hr_attendance_employee_date
  ON hr_attendance(employee_id, attendance_date);

NOTIFY pgrst, 'reload schema';

-- ── Rule reference ────────────────────────────────────────────────────────────
-- shift_duration = end - start (add 24h if end < start, i.e. cross-midnight)
-- < 4 hours  → half_day
-- 4–8 hours  → present
-- > 8 hours  → present + OT = (duration - 8) stored in ot_hours column
-- (OT threshold: 8h/day per Factories Act, 1948 — verify with your CA)
