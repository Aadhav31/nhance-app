-- Add shift_type to hr_attendance so payroll can apply the correct rate
-- (day / night / double) per shift worked.
ALTER TABLE hr_attendance
  ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'day'
    CHECK (shift_type IN ('day', 'night', 'double'));

-- Back-fill existing rows: leave as 'day' (safe default).
-- Rows written after this migration will carry the real shift type
-- from the shifts table via the operator portal end-shift flow.

NOTIFY pgrst, 'reload schema';
