-- ═══════════════════════════════════════════════════════════════════
-- STEP 2 — Run AFTER Step 1 has been committed
-- Creates all Sales & Purchase tables.
-- ═══════════════════════════════════════════════════════════════════

-- ── Activate modules for companies that already have Accounts ────────────────
INSERT INTO company_modules (company_id, module_key)
SELECT company_id, 'sales'::module_key
FROM company_modules WHERE module_key = 'accounts'
ON CONFLICT DO NOTHING;

INSERT INTO company_modules (company_id, module_key)
SELECT company_id, 'purchase'::module_key
FROM company_modules WHERE module_key = 'accounts'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- SALES TABLES
-- ═══════════════════════════════════════════════════════════════════

-- Quotes
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
  rate        NUMERIC(12,2) DEFAULT 0,
  amount      NUMERIC(12,2) DEFAULT 0,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotes_company      ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote   ON quote_line_items(quote_id);
ALTER TABLE quotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quotes_all"      ON quotes;
DROP POLICY IF EXISTS "quote_items_all" ON quote_line_items;
CREATE POLICY "quotes_all"      ON quotes           FOR ALL TO authenticated USING (true);
CREATE POLICY "quote_items_all" ON quote_line_items FOR ALL TO authenticated USING (true);

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
  status            TEXT DEFAULT 'confirmed'
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
  rate        NUMERIC(12,2) DEFAULT 0,
  amount      NUMERIC(12,2) DEFAULT 0,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_so_company    ON sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_so_items_so   ON so_line_items(so_id);
ALTER TABLE sales_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE so_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "so_all"       ON sales_orders;
DROP POLICY IF EXISTS "so_items_all" ON so_line_items;
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
  status           TEXT DEFAULT 'dispatched'
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

CREATE INDEX IF NOT EXISTS idx_dc_company  ON delivery_challans(company_id);
ALTER TABLE delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_line_items     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dc_all"       ON delivery_challans;
DROP POLICY IF EXISTS "dc_items_all" ON dc_line_items;
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
  status          TEXT DEFAULT 'issued'
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
  rate        NUMERIC(12,2) DEFAULT 0,
  amount      NUMERIC(12,2) DEFAULT 0,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cn_company  ON credit_notes(company_id);
ALTER TABLE credit_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cn_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cn_all"       ON credit_notes;
DROP POLICY IF EXISTS "cn_items_all" ON cn_line_items;
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
DROP POLICY IF EXISTS "pr_all" ON payments_received;
CREATE POLICY "pr_all" ON payments_received FOR ALL TO authenticated USING (true);

-- Trigger: auto-update invoice paid_amount & status when payment recorded
CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NOT NULL THEN
    UPDATE client_invoices SET
      paid_amount = (SELECT COALESCE(SUM(amount),0) FROM payments_received WHERE invoice_id = v_invoice_id),
      balance_due = total_amount - (SELECT COALESCE(SUM(amount),0) FROM payments_received WHERE invoice_id = v_invoice_id),
      status = CASE
        WHEN total_amount <= (SELECT COALESCE(SUM(amount),0) FROM payments_received WHERE invoice_id = v_invoice_id) THEN 'paid'
        WHEN (SELECT COALESCE(SUM(amount),0) FROM payments_received WHERE invoice_id = v_invoice_id) > 0 THEN 'partial'
        ELSE status
      END
    WHERE id = v_invoice_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_paid ON payments_received;
CREATE TRIGGER trg_invoice_paid
  AFTER INSERT OR UPDATE OR DELETE ON payments_received
  FOR EACH ROW EXECUTE FUNCTION update_invoice_paid_amount();

-- ═══════════════════════════════════════════════════════════════════
-- PURCHASE TABLES
-- ═══════════════════════════════════════════════════════════════════

-- Vendors
-- Column names match PurchasePage.jsx: contact_phone, contact_email, bank_account, bank_ifsc, vendor_code
CREATE TABLE IF NOT EXISTS vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  vendor_name     TEXT NOT NULL,
  vendor_code     TEXT,
  category        TEXT DEFAULT 'general',
  gstin           TEXT,
  contact_name    TEXT,
  contact_phone   TEXT,
  contact_email   TEXT,
  address         TEXT,
  bank_name       TEXT,
  bank_account    TEXT,
  bank_ifsc       TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company ON vendors(company_id);
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendors_all" ON vendors;
CREATE POLICY "vendors_all" ON vendors FOR ALL TO authenticated USING (true);

-- Bills (purchase invoices from vendors)
-- bill_ref matches PurchasePage.jsx; status includes 'pending'
CREATE TABLE IF NOT EXISTS bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  bill_number     TEXT NOT NULL,
  bill_ref        TEXT,              -- vendor's own invoice reference
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
  status          TEXT DEFAULT 'pending'
    CHECK (status IN ('draft','pending','partial','paid','overdue','cancelled')),
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
  rate        NUMERIC(12,2) DEFAULT 0,
  amount      NUMERIC(12,2) DEFAULT 0,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bills_company    ON bills(company_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill  ON bill_line_items(bill_id);
ALTER TABLE bills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bills_all"      ON bills;
DROP POLICY IF EXISTS "bill_items_all" ON bill_line_items;
CREATE POLICY "bills_all"      ON bills           FOR ALL TO authenticated USING (true);
CREATE POLICY "bill_items_all" ON bill_line_items FOR ALL TO authenticated USING (true);

-- Purchase Orders
-- Has delivery_address + full tax fields to match PurchasePage.jsx
-- status includes 'confirmed' (app default)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  po_number         TEXT NOT NULL,
  po_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  vendor_id         UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name       TEXT NOT NULL,
  delivery_address  TEXT,
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
  status            TEXT DEFAULT 'confirmed'
    CHECK (status IN ('draft','confirmed','sent','partially_received','received','cancelled')),
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
  rate         NUMERIC(12,2) DEFAULT 0,
  amount       NUMERIC(12,2) DEFAULT 0,
  received_qty NUMERIC(10,2) DEFAULT 0,
  sort_order   INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_po_company   ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po  ON po_line_items(po_id);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "po_all"       ON purchase_orders;
DROP POLICY IF EXISTS "po_items_all" ON po_line_items;
CREATE POLICY "po_all"       ON purchase_orders FOR ALL TO authenticated USING (true);
CREATE POLICY "po_items_all" ON po_line_items   FOR ALL TO authenticated USING (true);

-- Vendor Credits
-- cn_date (not vc_date) + status 'issued' to match PurchasePage.jsx
CREATE TABLE IF NOT EXISTS vendor_credits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  vc_number     TEXT NOT NULL,
  cn_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  bill_id       UUID REFERENCES bills(id) ON DELETE SET NULL,
  vendor_id     UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name   TEXT NOT NULL,
  reason        TEXT,
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT DEFAULT 'issued'
    CHECK (status IN ('draft','issued','applied')),
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_company ON vendor_credits(company_id);
ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vc_all" ON vendor_credits;
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
DROP POLICY IF EXISTS "pm_all" ON payments_made;
CREATE POLICY "pm_all" ON payments_made FOR ALL TO authenticated USING (true);

-- Trigger: auto-update bill paid_amount & status when payment made
CREATE OR REPLACE FUNCTION update_bill_paid_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_bill_id UUID;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  IF v_bill_id IS NOT NULL THEN
    UPDATE bills SET
      paid_amount = (SELECT COALESCE(SUM(amount),0) FROM payments_made WHERE bill_id = v_bill_id),
      balance_due = total_amount - (SELECT COALESCE(SUM(amount),0) FROM payments_made WHERE bill_id = v_bill_id),
      status = CASE
        WHEN total_amount <= (SELECT COALESCE(SUM(amount),0) FROM payments_made WHERE bill_id = v_bill_id) THEN 'paid'
        WHEN (SELECT COALESCE(SUM(amount),0) FROM payments_made WHERE bill_id = v_bill_id) > 0 THEN 'partial'
        ELSE status
      END
    WHERE id = v_bill_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_paid ON payments_made;
CREATE TRIGGER trg_bill_paid
  AFTER INSERT OR UPDATE OR DELETE ON payments_made
  FOR EACH ROW EXECUTE FUNCTION update_bill_paid_amount();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
