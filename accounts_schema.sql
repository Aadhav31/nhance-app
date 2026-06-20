-- accounts_schema.sql
-- Nhance Integrated Accounts System
-- Run in Supabase SQL Editor (run the whole file at once)
-- NOTE: RLS policies use TO authenticated USING (true) — same pattern as other Nhance tables

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CHART OF ACCOUNTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,

  code          TEXT,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('income','expense','asset','liability','equity')),
  sub_type      TEXT,
  is_default    BOOLEAN DEFAULT false,

  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company read chart_of_accounts"
  ON chart_of_accounts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin manage chart_of_accounts"
  ON chart_of_accounts FOR ALL
  TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ACCOUNT TRANSACTIONS  (master ledger — every rupee in or out)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,

  txn_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  type            TEXT NOT NULL CHECK (type IN ('income','expense')),

  account_id      UUID REFERENCES chart_of_accounts(id),
  description     TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  gst_amount      NUMERIC(12,2) DEFAULT 0,

  payment_mode    TEXT CHECK (payment_mode IN ('cash','bank','upi','cheque','credit')),
  bank_reference  TEXT,

  reference_type  TEXT CHECK (reference_type IN ('invoice','expense','payroll','fuel','manual')),
  reference_id    UUID,

  project_id      UUID,
  equipment_id    UUID REFERENCES equipment(id) ON DELETE SET NULL,

  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acct_txn_company  ON account_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_acct_txn_date     ON account_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_acct_txn_type     ON account_transactions(type);
CREATE INDEX IF NOT EXISTS idx_acct_txn_ref      ON account_transactions(reference_type, reference_id);

ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company read account_transactions"
  ON account_transactions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Accounts manage account_transactions"
  ON account_transactions FOR ALL
  TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CLIENT INVOICES  (Accounts Receivable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,

  invoice_number  TEXT NOT NULL,
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,

  client_name     TEXT NOT NULL,
  client_address  TEXT,
  client_gstin    TEXT,

  project_id      UUID,
  project_name    TEXT,

  subtotal        NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  taxable_amount  NUMERIC(12,2) DEFAULT 0,
  cgst_rate       NUMERIC(5,2) DEFAULT 9,
  sgst_rate       NUMERIC(5,2) DEFAULT 9,
  igst_rate       NUMERIC(5,2) DEFAULT 0,
  cgst_amount     NUMERIC(12,2) DEFAULT 0,
  sgst_amount     NUMERIC(12,2) DEFAULT 0,
  igst_amount     NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) DEFAULT 0,
  paid_amount     NUMERIC(12,2) DEFAULT 0,
  balance_due     NUMERIC(12,2) DEFAULT 0,

  status          TEXT DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled')),

  notes           TEXT,
  terms           TEXT,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company  ON client_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON client_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date     ON client_invoices(invoice_date);

ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company read client_invoices"
  ON client_invoices FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Accounts manage client_invoices"
  ON client_invoices FOR ALL
  TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INVOICE LINE ITEMS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID REFERENCES client_invoices(id) ON DELETE CASCADE,

  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) DEFAULT 1,
  unit          TEXT DEFAULT 'hrs',
  rate          NUMERIC(12,2) NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,

  equipment_id  UUID REFERENCES equipment(id) ON DELETE SET NULL,
  from_date     DATE,
  to_date       DATE,

  sort_order    INT DEFAULT 0
);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company read invoice_line_items"
  ON invoice_line_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Accounts manage invoice_line_items"
  ON invoice_line_items FOR ALL
  TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. INVOICE PAYMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID REFERENCES client_invoices(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,

  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_mode    TEXT CHECK (payment_mode IN ('cash','bank','upi','cheque')),
  bank_reference  TEXT,
  notes           TEXT,

  transaction_id  UUID REFERENCES account_transactions(id) ON DELETE SET NULL,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company read invoice_payments"
  ON invoice_payments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Accounts manage invoice_payments"
  ON invoice_payments FOR ALL
  TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. EXPENSES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,

  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  category        TEXT NOT NULL,
  description     TEXT NOT NULL,
  vendor_name     TEXT,

  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  gst_amount      NUMERIC(12,2) DEFAULT 0,
  vendor_gstin    TEXT,

  payment_mode    TEXT CHECK (payment_mode IN ('cash','bank','upi','cheque')),
  bank_reference  TEXT,

  project_id      UUID,
  equipment_id    UUID REFERENCES equipment(id) ON DELETE SET NULL,

  receipt_url     TEXT,

  transaction_id  UUID REFERENCES account_transactions(id) ON DELETE SET NULL,
  account_id      UUID REFERENCES chart_of_accounts(id),

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company   ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date      ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category  ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_equip     ON expenses(equipment_id);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company read expenses"
  ON expenses FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Accounts manage expenses"
  ON expenses FOR ALL
  TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SEED default chart of accounts
--    After running this SQL, call: SELECT seed_default_accounts('<your-company-id>');
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_default_accounts(p_company_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO chart_of_accounts (company_id, code, name, type, sub_type, is_default) VALUES
    -- Income
    (p_company_id, '4001', 'Equipment Hire Charges',    'income',    'operations',  true),
    (p_company_id, '4002', 'Transport Charges',         'income',    'operations',  true),
    (p_company_id, '4003', 'Service / Labour Income',   'income',    'operations',  true),
    (p_company_id, '4004', 'Fuel Surcharge Billed',     'income',    'operations',  true),
    (p_company_id, '4005', 'Other Income',              'income',    'misc',        true),
    -- Direct Costs
    (p_company_id, '5001', 'Fuel & HSD',                'expense',   'direct',      true),
    (p_company_id, '5002', 'Operator Wages',            'expense',   'direct',      true),
    (p_company_id, '5003', 'Repair & Maintenance',      'expense',   'direct',      true),
    (p_company_id, '5004', 'Tyres & Spare Parts',       'expense',   'direct',      true),
    (p_company_id, '5005', 'Equipment Hire (outward)',  'expense',   'direct',      true),
    -- Admin / Indirect
    (p_company_id, '6001', 'Salaries — Admin/Staff',    'expense',   'admin',       true),
    (p_company_id, '6002', 'Office Rent',               'expense',   'admin',       true),
    (p_company_id, '6003', 'Insurance Premiums',        'expense',   'admin',       true),
    (p_company_id, '6004', 'Vehicle Running (non-equip)','expense',  'admin',       true),
    (p_company_id, '6005', 'Bank Charges & Interest',   'expense',   'finance',     true),
    (p_company_id, '6006', 'Misc / Petty Cash',         'expense',   'misc',        true),
    -- Assets
    (p_company_id, '1001', 'Cash in Hand',              'asset',     'liquid',      true),
    (p_company_id, '1002', 'Bank Account',              'asset',     'liquid',      true),
    (p_company_id, '1003', 'Accounts Receivable',       'asset',     'receivable',  true),
    -- Liabilities
    (p_company_id, '2001', 'Accounts Payable',          'liability', 'payable',     true),
    (p_company_id, '2002', 'GST Payable',               'liability', 'tax',         true),
    (p_company_id, '2003', 'TDS Payable',               'liability', 'tax',         true),
    (p_company_id, '2004', 'Equipment Loans / EMI',     'liability', 'long_term',   true)
  ON CONFLICT DO NOTHING;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── After running, seed your accounts ─────────────────────────────────────────
-- Find your company ID with: SELECT id, name FROM companies;
-- Then run: SELECT seed_default_accounts('<paste-your-company-id-here>');
