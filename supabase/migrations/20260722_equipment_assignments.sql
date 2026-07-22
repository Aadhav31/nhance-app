-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: equipment_assignments table
--
-- Managers / shift supervisors assign operators & drivers to equipment daily.
-- Status changes (present / absent / half_day) auto-sync to hr_attendance
-- via app logic (updateAssignmentStatus in ProductionTrackerPage).
--
-- After running: NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment_assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assignment_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  shift_type        TEXT        NOT NULL DEFAULT 'day'
                                CHECK (shift_type IN ('day', 'night', 'general')),

  -- Equipment (snapshot so history stays readable if equipment is renamed/deleted)
  equipment_id      UUID        REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_name    TEXT,

  -- Employee (snapshot)
  employee_id       UUID        REFERENCES hr_employees(id) ON DELETE SET NULL,
  employee_name     TEXT,
  employee_number   TEXT,

  -- Role for this assignment
  assignment_role   TEXT        NOT NULL DEFAULT 'primary_operator'
                                CHECK (assignment_role IN (
                                  'primary_operator', 'assistant_operator', 'driver', 'helper'
                                )),

  -- Attendance status — set by supervisor during / end of shift
  -- 'assigned' = scheduled but not yet confirmed
  status            TEXT        NOT NULL DEFAULT 'assigned'
                                CHECK (status IN ('assigned', 'present', 'half_day', 'absent')),

  notes             TEXT,
  assigned_by       UUID        REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eq_assign_company_date
  ON equipment_assignments(company_id, assignment_date DESC);

CREATE INDEX IF NOT EXISTS idx_eq_assign_employee_date
  ON equipment_assignments(employee_id, assignment_date DESC)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eq_assign_equipment_date
  ON equipment_assignments(equipment_id, assignment_date DESC)
  WHERE equipment_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION _set_eq_assign_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_eq_assign_updated_at ON equipment_assignments;
CREATE TRIGGER trg_eq_assign_updated_at
  BEFORE UPDATE ON equipment_assignments
  FOR EACH ROW EXECUTE FUNCTION _set_eq_assign_updated_at();

-- Row-level security
ALTER TABLE equipment_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members can manage equipment_assignments" ON equipment_assignments;
CREATE POLICY "company members can manage equipment_assignments"
  ON equipment_assignments FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
