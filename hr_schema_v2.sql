-- hr_schema_v2.sql
-- Labour Law Compliance additions to hr_employees
-- Run in Supabase SQL Editor

-- ── New compliance columns on hr_employees ────────────────────────────────────
ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS bocw_number         TEXT,          -- Building & Other Construction Workers Act reg. no.
  ADD COLUMN IF NOT EXISTS min_wage_category   TEXT DEFAULT 'unskilled',
    -- 'unskilled' | 'semi_skilled' | 'skilled' | 'highly_skilled' | 'supervisory'
  ADD COLUMN IF NOT EXISTS bonus_applicable    BOOLEAN DEFAULT false,   -- Payment of Bonus Act, 1965
  ADD COLUMN IF NOT EXISTS gratuity_applicable BOOLEAN DEFAULT true;    -- Payment of Gratuity Act, 1972

-- ── Bonus tracking table ──────────────────────────────────────────────────────
-- Payment of Bonus Act: min 8.33%, max 20% on basic+DA ≤ ₹7,000 (if gross ≤ ₹21,000)
CREATE TABLE IF NOT EXISTS hr_bonus (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID NOT NULL,
  employee_id     UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  financial_year  TEXT NOT NULL,           -- e.g. '2025-26'
  bonus_type      TEXT DEFAULT 'annual',   -- 'annual' | 'festival'
  bonus_amount    NUMERIC NOT NULL DEFAULT 0,
  paid_date       DATE,
  status          TEXT DEFAULT 'pending',  -- 'pending' | 'paid'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_bonus_employee ON hr_bonus(employee_id);
ALTER TABLE hr_bonus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_bonus_select" ON hr_bonus;
CREATE POLICY "hr_bonus_select" ON hr_bonus FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_bonus_insert" ON hr_bonus;
CREATE POLICY "hr_bonus_insert" ON hr_bonus FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_bonus_update" ON hr_bonus;
CREATE POLICY "hr_bonus_update" ON hr_bonus FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "hr_bonus_delete" ON hr_bonus;
CREATE POLICY "hr_bonus_delete" ON hr_bonus FOR DELETE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';

-- ── Labour Law Reference (for your records) ───────────────────────────────────
--
-- 1. CHILD LABOUR ACT + BOCW ACT
--    Min. age: 18 years for construction / hazardous work (enforced in UI)
--
-- 2. EPF & MP ACT, 1952
--    Employee: 12% of basic → EPF
--    Employer: 3.67% of basic → EPF + 8.33% of basic → EPS (capped at ₹1,250/month)
--    Applicable when establishment has ≥ 20 employees
--
-- 3. ESI ACT, 1948
--    Employee: 0.75% of gross wages
--    Employer: 3.25% of gross wages
--    Applicable when gross ≤ ₹21,000/month (≥ 10 employees)
--
-- 4. PAYMENT OF BONUS ACT, 1965
--    Applicable when gross ≤ ₹21,000/month (≥ 20 employees)
--    Min bonus: 8.33% | Max: 20% (calculated on wage base ≤ ₹7,000)
--    Paid within 8 months of financial year close
--
-- 5. PAYMENT OF GRATUITY ACT, 1972
--    Eligible after 5 years continuous service
--    Formula: (Basic + DA) × 15/26 × completed years
--    Maximum: ₹20,00,000
--
-- 6. PROFESSIONAL TAX (Tamil Nadu slabs — verify current rates)
--    ≤ ₹21,000 → Nil | ≤ ₹30,000 → ₹135 | ≤ ₹45,000 → ₹315
--    ≤ ₹60,000 → ₹690 | ≤ ₹75,000 → ₹1,025 | > ₹75,000 → ₹1,250
--
-- NOTE: Always verify current rates with your CA / Labour Department.
--       Minimum wages vary by state and are revised periodically.
