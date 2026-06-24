-- ─────────────────────────────────────────────────────────────────────────────
-- operator_assignment_schema.sql
-- Operator assignment, shift time windows, salary history, substitution log
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & run
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Equipment — operator assignment & default shift ───────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS assigned_operator_id  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_shift_type    TEXT DEFAULT 'day';   -- day | night | double

CREATE INDEX IF NOT EXISTS idx_equipment_operator ON equipment(assigned_operator_id);

-- ─── 2. Projects — shift time window ─────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS shift_start_time   TIME,          -- e.g. 08:00
  ADD COLUMN IF NOT EXISTS shift_end_time     TIME,          -- e.g. 20:00
  ADD COLUMN IF NOT EXISTS shift_grace_mins   INTEGER DEFAULT 30; -- minutes grace before/after

-- ─── 3. Sites — shift time window (fallback if project doesn't have one) ──────
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS shift_start_time   TIME,
  ADD COLUMN IF NOT EXISTS shift_end_time     TIME,
  ADD COLUMN IF NOT EXISTS shift_grace_mins   INTEGER DEFAULT 30;

-- ─── 4. Salary history log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_salary_history (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL,                                -- hr_employees.id
  change_type       TEXT NOT NULL DEFAULT 'raise',               -- raise | revision | initial | deduction
  previous_basic    NUMERIC(12,2),
  new_basic         NUMERIC(12,2),
  previous_daily    NUMERIC(10,2),
  new_daily         NUMERIC(10,2),
  percentage_change NUMERIC(5,2),                                -- e.g. 10.00 for 10%
  effective_date    DATE NOT NULL,
  reason            TEXT,
  changed_by        UUID REFERENCES user_profiles(id),
  notified_at       TIMESTAMPTZ,                                 -- when admin/HR was notified
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_history_employee ON hr_salary_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_history_company  ON hr_salary_history(company_id, created_at DESC);

-- ─── 5. Operator substitution log ────────────────────────────────────────────
-- Tracks last-minute operator changes — who replaced whom, approved by whom
CREATE TABLE IF NOT EXISTS operator_substitutions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id            UUID NOT NULL REFERENCES equipment(id),
  original_operator_id    UUID REFERENCES user_profiles(id),  -- who was scheduled
  substitute_operator_id  UUID NOT NULL REFERENCES user_profiles(id),  -- who actually worked
  shift_date              DATE NOT NULL,
  shift_type              TEXT,
  reason                  TEXT,                                -- absent | consecutive | other
  approved_by             UUID REFERENCES user_profiles(id),  -- manager/HR/admin who approved
  notified_admin          BOOLEAN DEFAULT false,
  notified_hr             BOOLEAN DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_substitutions_equipment ON operator_substitutions(equipment_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_substitutions_substitute ON operator_substitutions(substitute_operator_id);

-- ─── 6. Verify ────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE assigned_operator_id IS NOT NULL) AS assigned_operators,
  COUNT(*) AS total_equipment
FROM equipment;

SELECT COUNT(*) AS salary_history_records FROM hr_salary_history;
SELECT COUNT(*) AS substitution_records   FROM operator_substitutions;
