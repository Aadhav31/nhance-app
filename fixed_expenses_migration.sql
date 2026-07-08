-- ============================================================
-- Fixed Expenses System
-- Tables: fixed_expenses (templates) + fixed_expense_payments (monthly instances)
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Templates table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('salary','emi','rent','insurance','interest','admin','misc')),
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_day       INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  payee_name    TEXT,
  employee_id   UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Monthly instances table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_expense_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_expense_id  UUID NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL,
  due_date          DATE NOT NULL,
  period_month      TEXT NOT NULL,          -- 'YYYY-MM'
  amount            NUMERIC(12,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','skipped')),
  paid_date         DATE,
  paid_amount       NUMERIC(12,2),
  payment_mode      TEXT,
  transaction_ref   TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fixed_expense_id, period_month)
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_company    ON fixed_expenses (company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_fep_company_month         ON fixed_expense_payments (company_id, period_month);
CREATE INDEX IF NOT EXISTS idx_fep_status_due            ON fixed_expense_payments (company_id, status, due_date);

-- ── 4. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE fixed_expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_expense_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_expenses_company_isolation"
  ON fixed_expenses FOR ALL
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "fixed_expense_payments_company_isolation"
  ON fixed_expense_payments FOR ALL
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- ── 5. Verify ─────────────────────────────────────────────────────────────────
SELECT 'fixed_expenses'         AS tbl, COUNT(*) FROM fixed_expenses
UNION ALL
SELECT 'fixed_expense_payments' AS tbl, COUNT(*) FROM fixed_expense_payments;
