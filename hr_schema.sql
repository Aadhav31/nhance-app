-- hr_schema.sql
-- Nhance HR & Payroll module — run in Supabase SQL Editor

-- ── Employees ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_employees (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        UUID NOT NULL,
  employee_number   TEXT,                          -- auto: EMP-001
  name              TEXT NOT NULL,
  designation       TEXT,                          -- Operator, Driver, Labour, Supervisor, etc.
  department        TEXT,                          -- Operations, Site, Admin, etc.
  employment_type   TEXT DEFAULT 'monthly',        -- 'shift' | 'daily' | 'monthly'
  status            TEXT DEFAULT 'active',         -- 'active' | 'inactive'
  joining_date      DATE,
  date_of_birth     DATE,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  aadhar_number     TEXT,
  pan_number        TEXT,
  bank_account      TEXT,
  bank_name         TEXT,
  ifsc_code         TEXT,
  uan_number        TEXT,                          -- UAN for PF
  esi_number        TEXT,
  pf_applicable     BOOLEAN DEFAULT false,
  esi_applicable    BOOLEAN DEFAULT false,
  pt_applicable     BOOLEAN DEFAULT true,
  photo_url         TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_employees_company ON hr_employees(company_id);
ALTER TABLE hr_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_employees_select" ON hr_employees;
CREATE POLICY "hr_employees_select" ON hr_employees FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_employees_insert" ON hr_employees;
CREATE POLICY "hr_employees_insert" ON hr_employees FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_employees_update" ON hr_employees;
CREATE POLICY "hr_employees_update" ON hr_employees FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_employees_delete" ON hr_employees;
CREATE POLICY "hr_employees_delete" ON hr_employees FOR DELETE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- ── Salary Structure ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_salary_structure (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID NOT NULL,
  employee_id         UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Monthly salary components
  basic_salary        NUMERIC DEFAULT 0,
  hra                 NUMERIC DEFAULT 0,
  special_allowance   NUMERIC DEFAULT 0,
  other_allowance     NUMERIC DEFAULT 0,
  -- Daily wage rate
  daily_rate          NUMERIC DEFAULT 0,
  -- Shift-based rates
  day_shift_rate      NUMERIC DEFAULT 0,
  night_shift_rate    NUMERIC DEFAULT 0,
  double_shift_rate   NUMERIC DEFAULT 0,
  ot_rate_per_hour    NUMERIC DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_salary_employee ON hr_salary_structure(employee_id);
ALTER TABLE hr_salary_structure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_salary_select" ON hr_salary_structure;
CREATE POLICY "hr_salary_select" ON hr_salary_structure FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_salary_insert" ON hr_salary_structure;
CREATE POLICY "hr_salary_insert" ON hr_salary_structure FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_salary_update" ON hr_salary_structure;
CREATE POLICY "hr_salary_update" ON hr_salary_structure FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_salary_delete" ON hr_salary_structure;
CREATE POLICY "hr_salary_delete" ON hr_salary_structure FOR DELETE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- ── Attendance ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_attendance (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID NOT NULL,
  employee_id     UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'absent',
    -- 'present' | 'absent' | 'half_day' | 'leave' | 'week_off' | 'holiday'
  shift_id        UUID,                            -- optional link to shifts table
  ot_hours        NUMERIC DEFAULT 0,
  in_time         TEXT,
  out_time        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_hr_attendance_employee_date ON hr_attendance(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_date ON hr_attendance(attendance_date);
ALTER TABLE hr_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_attendance_select" ON hr_attendance;
CREATE POLICY "hr_attendance_select" ON hr_attendance FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_attendance_insert" ON hr_attendance;
CREATE POLICY "hr_attendance_insert" ON hr_attendance FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_attendance_update" ON hr_attendance;
CREATE POLICY "hr_attendance_update" ON hr_attendance FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_attendance_delete" ON hr_attendance;
CREATE POLICY "hr_attendance_delete" ON hr_attendance FOR DELETE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- ── Leave Balances ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_leave_balances (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id            UUID NOT NULL,
  employee_id           UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  year                  INT NOT NULL,
  casual_leave_total    NUMERIC DEFAULT 12,
  casual_leave_used     NUMERIC DEFAULT 0,
  earned_leave_total    NUMERIC DEFAULT 15,
  earned_leave_used     NUMERIC DEFAULT 0,
  sick_leave_total      NUMERIC DEFAULT 7,
  sick_leave_used       NUMERIC DEFAULT 0,
  UNIQUE(employee_id, year)
);

ALTER TABLE hr_leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hr_leave_bal_select" ON hr_leave_balances;
CREATE POLICY "hr_leave_bal_select" ON hr_leave_balances FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_leave_bal_insert" ON hr_leave_balances;
CREATE POLICY "hr_leave_bal_insert" ON hr_leave_balances FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_leave_bal_update" ON hr_leave_balances;
CREATE POLICY "hr_leave_bal_update" ON hr_leave_balances FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- ── Leave Requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_leaves (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID NOT NULL,
  employee_id  UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  leave_type   TEXT NOT NULL,   -- 'casual' | 'earned' | 'sick' | 'unpaid'
  from_date    DATE NOT NULL,
  to_date      DATE NOT NULL,
  days         NUMERIC NOT NULL,
  reason       TEXT,
  status       TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  approved_by  TEXT,
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_leaves_employee ON hr_leaves(employee_id);
ALTER TABLE hr_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_leaves_select" ON hr_leaves;
CREATE POLICY "hr_leaves_select" ON hr_leaves FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_leaves_insert" ON hr_leaves;
CREATE POLICY "hr_leaves_insert" ON hr_leaves FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_leaves_update" ON hr_leaves;
CREATE POLICY "hr_leaves_update" ON hr_leaves FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_leaves_delete" ON hr_leaves;
CREATE POLICY "hr_leaves_delete" ON hr_leaves FOR DELETE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- ── Monthly Payroll Run ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_payroll (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        UUID NOT NULL,
  month             INT NOT NULL,   -- 1–12
  year              INT NOT NULL,
  status            TEXT DEFAULT 'draft',  -- 'draft' | 'processed' | 'paid'
  total_gross       NUMERIC DEFAULT 0,
  total_deductions  NUMERIC DEFAULT 0,
  total_net         NUMERIC DEFAULT 0,
  total_pf_employer NUMERIC DEFAULT 0,
  total_esi_employer NUMERIC DEFAULT 0,
  processed_at      TIMESTAMPTZ,
  processed_by      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, month, year)
);

ALTER TABLE hr_payroll ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hr_payroll_select" ON hr_payroll;
CREATE POLICY "hr_payroll_select" ON hr_payroll FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_payroll_insert" ON hr_payroll;
CREATE POLICY "hr_payroll_insert" ON hr_payroll FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_payroll_update" ON hr_payroll;
CREATE POLICY "hr_payroll_update" ON hr_payroll FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- ── Payroll Line Items (per employee per month) ───────────────────────────────
CREATE TABLE IF NOT EXISTS hr_payroll_items (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID NOT NULL,
  payroll_id          UUID NOT NULL REFERENCES hr_payroll(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  -- Attendance summary
  total_working_days  INT DEFAULT 0,
  days_present        NUMERIC DEFAULT 0,
  days_absent         NUMERIC DEFAULT 0,
  days_half           NUMERIC DEFAULT 0,
  days_leave          NUMERIC DEFAULT 0,
  shifts_worked       INT DEFAULT 0,
  ot_hours            NUMERIC DEFAULT 0,
  -- Earnings
  basic_earned        NUMERIC DEFAULT 0,
  hra_earned          NUMERIC DEFAULT 0,
  allowances_earned   NUMERIC DEFAULT 0,
  ot_amount           NUMERIC DEFAULT 0,
  gross_pay           NUMERIC DEFAULT 0,
  -- Statutory deductions
  pf_employee         NUMERIC DEFAULT 0,   -- 12% of basic (employee share)
  pf_employer         NUMERIC DEFAULT 0,   -- 12% of basic (employer share)
  esi_employee        NUMERIC DEFAULT 0,   -- 0.75% of gross
  esi_employer        NUMERIC DEFAULT 0,   -- 3.25% of gross
  professional_tax    NUMERIC DEFAULT 0,   -- slab-based
  -- Other deductions
  advance_deduction   NUMERIC DEFAULT 0,
  other_deductions    NUMERIC DEFAULT 0,
  total_deductions    NUMERIC DEFAULT 0,
  -- Net
  net_pay             NUMERIC DEFAULT 0,
  -- Payment
  payment_status      TEXT DEFAULT 'pending',   -- 'pending' | 'paid'
  payment_date        DATE,
  payment_mode        TEXT,                     -- 'bank' | 'cash' | 'upi'
  payment_reference   TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(payroll_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_items_payroll ON hr_payroll_items(payroll_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_items_employee ON hr_payroll_items(employee_id);
ALTER TABLE hr_payroll_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_items_select" ON hr_payroll_items;
CREATE POLICY "hr_payroll_items_select" ON hr_payroll_items FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_payroll_items_insert" ON hr_payroll_items;
CREATE POLICY "hr_payroll_items_insert" ON hr_payroll_items FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_payroll_items_update" ON hr_payroll_items;
CREATE POLICY "hr_payroll_items_update" ON hr_payroll_items FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_payroll_items_delete" ON hr_payroll_items;
CREATE POLICY "hr_payroll_items_delete" ON hr_payroll_items FOR DELETE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
