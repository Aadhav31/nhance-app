-- Add missing columns to hr_attendance
-- source: 'manual' | 'shift_auto' — tracks whether attendance was manually marked or auto-filled from equipment shifts
-- ot_hours: stored OT hours for payroll calculations
-- shift_start_time / shift_end_time: clock-in and clock-out times (HH:MM) for shift workers

ALTER TABLE hr_attendance
  ADD COLUMN IF NOT EXISTS source           TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ot_hours         NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_start_time TEXT,
  ADD COLUMN IF NOT EXISTS shift_end_time   TEXT;
