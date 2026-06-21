-- sales_purchase_schema.sql
-- Nhance Sales & Purchase modules
-- Run in Supabase SQL Editor AFTER accounts_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Extend module_key enum ───────────────────────────────────────────
ALTER TYPE module_key ADD VALUE IF NOT EXISTS 'sales';
ALTER TYPE module_key ADD VALUE IF NOT EXISTS 'purchase';

-- ── Step 2: Auto-activate Sales & Purchase for companies with Accounts active ─
INSERT INTO company_modules (company_id, module_key)
SELECT company_id, 'sales'::module_key
FROM company_modules WHERE module_key = 'accounts'
ON CONFLICT DO NOTHING;

INSERT INTO company_modules (company_id, module_key)
SELECT company_id, 'purchase'::module_key
FROM company_modules WHERE module_key = 'accounts'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SALES TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Quotes / Quotations
CREATE TABLE IF NOT EXISTS quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  quote_number    TEXT NOT NULL,
  quote_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until     DATE,
  client_name     TEXT NOT NULL,
  client_address  TEXT,
  client_gstin    TEXT,
  project_name    TEXT,
  subtotal        NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  taxable_amount  NUMERIC(12,2) DEFAULT 0,
  cgst_rate       NUMERIC(5,2)  DEFAULT 9,
  sgst_rate       NUMERIC(5,2)  DEFAULT 9,
  igst_rate       NUMERIC(5,2)  DEFAULT 0,
  cgst_amount     NUMERIC(12,2) DEFAULT 0,
  sgst_amount     NUMERIC(12,2) DEFAULT 0,
  igst_amount     NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) DEFAULT 0,
  status          TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  notes           TEXT,
  terms           TEXT DEFAULT 'Quote valid for 30 days.',
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(10,2) DEFAULT 1,
  unit        TEXT DEFAULT 'hrs',
  rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotes_company ON quotes(company_id);
ALTER TABLE quotes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_all"       ON quotes           FOR ALL TO authenticated USING (true);
CREATE POLICY "quote_items_all"  ON quote_line_items FOR ALL TO authenticated USING (true);

-- Sales Orders
CREATE TABLE IF NOT EXISTS sales_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  so_number         TEXT NOT NULL,
  so_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  quote_id          UUID REFERENCES quotes(id) ON DELETE SET NULL,
  client_name       TEXT NOT NULL,
  client_address    TEXT,
  client_gstin      TEXT,
  project_name      TEXT,
  subtotal          NUMERIC(12,2) DEFAULT 0,
  discount_amount   NUMERIC(12,2) DEFAULT 0,
  taxable_amount    NUMERIC(12,2) DEFAULT 0,
  cgst_rate         NUMERIC(5,2)  DEFAULT 9,
  sgst_rate         NUMERIC(5,2)  DEFAULT 9,
  igst_rate         NUMERIC(5,2)  DEFAULT 0,
  cgst_amount       NUMERIC(12,2) DEFAULT 0,
  sgst_amount       NUMERIC(12,2) DEFAULT 0,
  igst_amount       NUMERIC(12,2) DEFAULT 0,
  total_amount      NUMERIC(12,2) DEFAULT 0,
  status            TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','partially_fulfilled','fulfilled','cancelled')),
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS so_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_id       UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(10,2) DEFAULT 1,
  unit        TEXT DEFAULT 'hrs',
  rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_company ON sales_orders(company_id);
ALTER TABLE sales_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE so_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "so_all"       ON sales_orders  FOR ALL TO authenticated USING (true);
CREATE POLICY "so_items_all" ON so_line_items FOR ALL TO authenticated USING (true);

-- Delivery Challans
CREATE TABLE IF NOT EXISTS delivery_challans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  dc_number        TEXT NOT NULL,
  dc_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  so_id            UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
  invoice_id       UUID REFERENCES client_invoices(id) ON DELETE SET NULL,
  client_name      TEXT NOT NULL,
  delivery_address TEXT,
  vehicle_number   TEXT,
  driver_name      TEXT,
  status           TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','dispatched','delivered','returned')),
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dc_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id       UUID REFERENCES delivery_challans(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(10,2) DEFAULT 1,
  unit        TEXT DEFAULT 'nos',
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dc_company ON delivery_challans(company_id);
ALTER TABLE delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_line_items     ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dc_all"       ON delivery_challans FOR ALL TO authenticated USING (true);
CREATE POLICY "dc_items_all" ON dc_line_items     FOR ALL TO authenticated USING (true);

-- Credit Notes
CREATE TABLE IF NOT EXISTS credit_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  cn_number       TEXT NOT NULL,
  cn_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_id      UUID REFERENCES client_invoices(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  reason          TEXT,
  subtotal        NUMERIC(12,2) DEFAULT 0,
  cgst_rate       NUMERIC(5,2)  DEFAULT 9,
  sgst_rate       NUMERIC(5,2)  DEFAULT 9,
  igst_rate       NUMERIC(5,2)  DEFAULT 0,
  cgst_amount     NUMERIC(12,2) DEFAULT 0,
  sgst_amount     NUMERIC(12,2) DEFAULT 0,
  igst_amount     NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) DEFAULT 0,
  status          TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','issued','applied')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cn_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cn_id       UUID REFERENCES credit_notes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(10,2) DEFAULT 1,
  unit        TEXT DEFAULT 'hrs',
  rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cn_company ON credit_notes(company_id);
ALTER TABLE credit_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cn_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cn_all"       ON credit_notes  FOR ALL TO authenticated USING (true);
CREATE POLICY "cn_items_all" ON cn_line_items FOR ALL TO authenticated USING (true);

-- Payments Received (from clients)
CREATE TABLE IF NOT EXISTS payments_received (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  payment_number  TEXT NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_id      UUID REFERENCES client_invoices(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_mode    TEXT CHECK (payment_mode IN ('cash','bank','upi','cheque','neft','rtgs')),
  bank_reference  TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_company ON payments_received(company_id);
ALTER TABLE payments_received ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_all" ON payments_received FOR ALL TO authenticated USING (true);

-- Auto-update invoice paid_amount when payment received
CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE client_invoices SET
    paid_amount = (SELECT COALESCE(SUM(amount),0) FROM payments_received WHERE invoice_id = NEW.invoice_id),
    balance_due = total_amount - (SELECT COALESCE(SUM(amount),0) FROM payments_received WHERE invoice_id = NEW.invoice_id),
    status = CASE
      WHEN total_amount <= (SELECT COALESCE(SUM(amount),0) FROM payments_received WHERE invoice_id = NEW.invoice_id) THEN 'paid'
      WHEN (SELECT COALESCE(SUM(amount),0) FROM payments_received WHERE invoice_id = NEW.invoice_id) > 0 THEN 'partial'
      ELSE status
    END
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_paid ON payments_received;
CREATE TRIGGER trg_invoice_paid
  AFTER INSERT OR UPDATE OR DELETE ON payments_received
  FOR EACH ROW EXECUTE FUNCTION update_invoice_paid_amount();

-- ─────────────────────────────────────────────────────────────────────────────
-- PURCHASE TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  vendor_name     TEXT NOT NULL,
  gstin           TEXT,
  category        TEXT, -- fuel, repairs, materials, labour, services, other
  contact_name    TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  bank_name       TEXT,
  account_number  TEXT,
  ifsc            TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company ON vendors(company_id);
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_all" ON vendors FOR ALL TO authenticated USING (true);

-- Bills (Purchase Invoices from vendors)
CREATE TABLE IF NOT EXISTS bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  bill_number     TEXT NOT NULL,
  vendor_bill_no  TEXT,       -- supplier's own invoice number
  bill_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name     TEXT NOT NULL,
  subtotal        NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  taxable_amount  NUMERIC(12,2) DEFAULT 0,
  cgst_rate       NUMERIC(5,2)  DEFAULT 9,
  sgst_rate       NUMERIC(5,2)  DEFAULT 9,
  igst_rate       NUMERIC(5,2)  DEFAULT 0,
  cgst_amount     NUMERIC(12,2) DEFAULT 0,
  sgst_amount     NUMERIC(12,2) DEFAULT 0,
  igst_amount     NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) DEFAULT 0,
  paid_amount     NUMERIC(12,2) DEFAULT 0,
  balance_due     NUMERIC(12,2) DEFAULT 0,
  status          TEXT DEFAULT 'received'
    CHECK (status IN ('draft','received','partial','paid','overdue','cancelled')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bill_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     UUID REFERENCES bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(10,2) DEFAULT 1,
  unit        TEXT DEFAULT 'nos',
  rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bills_company ON bills(company_id);
ALTER TABLE bills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bills_all"       ON bills           FOR ALL TO authenticated USING (true);
CREATE POLICY "bill_items_all"  ON bill_line_items FOR ALL TO authenticated USING (true);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  po_number         TEXT NOT NULL,
  po_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  vendor_id         UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name       TEXT NOT NULL,
  subtotal          NUMERIC(12,2) DEFAULT 0,
  total_amount      NUMERIC(12,2) DEFAULT 0,
  status            TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','sent','partially_received','received','cancelled')),
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS po_line_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id        UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  quantity     NUMERIC(10,2) DEFAULT 1,
  unit         TEXT DEFAULT 'nos',
  rate         NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_qty NUMERIC(10,2) DEFAULT 0,
  sort_order   INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_po_company ON purchase_orders(company_id);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_all"       ON purchase_orders FOR ALL TO authenticated USING (true);
CREATE POLICY "po_items_all" ON po_line_items   FOR ALL TO authenticated USING (true);

-- Vendor Credits
CREATE TABLE IF NOT EXISTS vendor_credits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  vc_number     TEXT NOT NULL,
  vc_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  bill_id       UUID REFERENCES bills(id) ON DELETE SET NULL,
  vendor_id     UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name   TEXT NOT NULL,
  reason        TEXT,
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT DEFAULT 'received'
    CHECK (status IN ('draft','received','applied')),
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_company ON vendor_credits(company_id);
ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vc_all" ON vendor_credits FOR ALL TO authenticated USING (true);

-- Payments Made (to vendors)
CREATE TABLE IF NOT EXISTS payments_made (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  payment_number  TEXT NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  bill_id         UUID REFERENCES bills(id) ON DELETE SET NULL,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name     TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_mode    TEXT CHECK (payment_mode IN ('cash','bank','upi','cheque','neft','rtgs')),
  bank_reference  TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_company ON payments_made(company_id);
ALTER TABLE payments_made ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm_all" ON payments_made FOR ALL TO authenticated USING (true);

-- Auto-update bill paid_amount when payment made
CREATE OR REPLACE FUNCTION update_bill_paid_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bill_id IS NOT NULL THEN
    UPDATE bills SET
      paid_amount = (SELECT COALESCE(SUM(amount),0) FROM payments_made WHERE bill_id = NEW.bill_id),
      balance_due = total_amount - (SELECT COALESCE(SUM(amount),0) FROM payments_made WHERE bill_id = NEW.bill_id),
      status = CASE
        WHEN total_amount <= (SELECT COALESCE(SUM(amount),0) FROM payments_made WHERE bill_id = NEW.bill_id) THEN 'paid'
        WHEN (SELECT COALESCE(SUM(amount),0) FROM payments_made WHERE bill_id = NEW.bill_id) > 0 THEN 'partial'
        ELSE status
      END
    WHERE id = NEW.bill_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_paid ON payments_made;
CREATE TRIGGER trg_bill_paid
  AFTER INSERT OR UPDATE OR DELETE ON payments_made
  FOR EACH ROW EXECUTE FUNCTION update_bill_paid_amount();

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO USE
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Run this entire file in Supabase SQL Editor
-- 2. SALES module key activates for all companies with Accounts enabled
-- 3. PURCHASE module key activates for all companies with Accounts enabled
-- 4. Deploy the updated app — Sales and Purchase appear in the sidebar
-- ─────────────────────────────────────────────────────────────────────────────
