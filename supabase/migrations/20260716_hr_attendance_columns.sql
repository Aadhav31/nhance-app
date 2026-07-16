-- Add missing columns to hr_attendance
-- source: 'manual' | 'shift_auto'
-- ot_hours: stored OT hours for payroll
-- shift_start_time / shift_end_time: HH:MM clock-in/out for shift workers
-- extra_shifts: count of additional shifts worked on same day (e.g. covering an absent colleague)
-- substitutions_given: JSONB array [{id, name}] of employees this person covered for
-- covered_by_id / covered_by_name: who covered for this employee if they were absent

ALTER TABLE hr_attendance
  ADD COLUMN IF NOT EXISTS source             TEXT     DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ot_hours           NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_start_time   TEXT,
  ADD COLUMN IF NOT EXISTS shift_end_time     TEXT,
  ADD COLUMN IF NOT EXISTS extra_shifts       SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS substitutions_given JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS covered_by_id      UUID,
  ADD COLUMN IF NOT EXISTS covered_by_name    TEXT;
