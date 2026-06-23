-- ─────────────────────────────────────────────────────────────────────────────
-- operator_portal_schema.sql
-- Adds photo + location columns for the Operator Portal
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
--
-- ALSO REQUIRED (do once in Supabase Dashboard → Storage):
--   Create a public bucket called "operator-photos"
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Shifts — photo & GPS at start / end ───────────────────────────────────
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS start_meter_photo  TEXT,   -- public URL or data-URL of hour-meter photo at shift start
  ADD COLUMN IF NOT EXISTS end_meter_photo    TEXT,   -- public URL or data-URL of hour-meter photo at shift end
  ADD COLUMN IF NOT EXISTS start_location     TEXT,   -- "lat,lng" captured at shift start
  ADD COLUMN IF NOT EXISTS end_location       TEXT,   -- "lat,lng" captured at shift end
  ADD COLUMN IF NOT EXISTS operator_name      TEXT;   -- denormalised for quick display

-- ─── 2. shift_fuel_entries — fuel proof photo ─────────────────────────────────
-- receipt_url already exists — no change needed

-- ─── 3. hr_leaves table (if not already created by HR module) ─────────────────
CREATE TABLE IF NOT EXISTS hr_leaves (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL,   -- hr_employees.id
  leave_type     TEXT NOT NULL DEFAULT 'casual',   -- casual | sick | earned | unpaid | comp_off
  from_date      DATE NOT NULL,
  to_date        DATE NOT NULL,
  days           NUMERIC(4,1) NOT NULL DEFAULT 1,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  approved_by    UUID REFERENCES user_profiles(id),
  approved_at    TIMESTAMPTZ,
  remarks        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_leaves_employee ON hr_leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_company  ON hr_leaves(company_id, status);

-- ─── 4. hr_attendance table (if not already created by HR module) ─────────────
CREATE TABLE IF NOT EXISTS hr_attendance (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL,   -- hr_employees.id
  attendance_date  DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'present',   -- present | absent | half_day | on_leave | holiday
  shift_start_time TIME,
  shift_end_time   TIME,
  overtime_hours   NUMERIC(5,2) DEFAULT 0,
  check_in_location  TEXT,
  check_out_location TEXT,
  notes            TEXT,
  marked_by        UUID REFERENCES user_profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_hr_attendance_employee ON hr_attendance(employee_id, attendance_date);

-- ─── 5. Verify ────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE start_meter_photo IS NOT NULL) AS shifts_with_photos,
  COUNT(*) AS total_shifts
FROM shifts;
