-- ══════════════════════════════════════════════════════════════════════════
-- BOQ (Bill of Quantities) Module
-- boq_documents → boq_sections → boq_items → ra_bills → ra_bill_items
-- ══════════════════════════════════════════════════════════════════════════

-- ── BOQ Document (header) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boq_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boq_number    TEXT NOT NULL,
  title         TEXT NOT NULL,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name  TEXT,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  -- 'draft' | 'active' | 'completed' | 'cancelled'
  total_value   NUMERIC(14,2) NOT NULL DEFAULT 0,
  valid_from    DATE,
  valid_to      DATE,
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── BOQ Sections (chapters / work packages) ────────────────────────────────
CREATE TABLE IF NOT EXISTS boq_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id      UUID NOT NULL REFERENCES boq_documents(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── BOQ Line Items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boq_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id          UUID NOT NULL REFERENCES boq_documents(id) ON DELETE CASCADE,
  section_id      UUID REFERENCES boq_sections(id) ON DELETE SET NULL,
  item_code       TEXT,
  description     TEXT NOT NULL,
  unit            TEXT DEFAULT 'nos',
  quantity        NUMERIC(14,3) NOT NULL DEFAULT 0,
  rate            NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount          NUMERIC(16,2) NOT NULL DEFAULT 0,  -- qty × rate (maintained by trigger)
  executed_qty    NUMERIC(14,3) NOT NULL DEFAULT 0,  -- cumulative across all RA bills
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: keep amount in sync with qty × rate
CREATE OR REPLACE FUNCTION fn_boq_item_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.amount := COALESCE(NEW.quantity, 0) * COALESCE(NEW.rate, 0);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_boq_item_amount ON boq_items;
CREATE TRIGGER trg_boq_item_amount
BEFORE INSERT OR UPDATE ON boq_items
FOR EACH ROW EXECUTE FUNCTION fn_boq_item_amount();

-- Trigger: keep boq_documents.total_value in sync
CREATE OR REPLACE FUNCTION fn_boq_total_value()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE boq_documents
  SET total_value = (SELECT COALESCE(SUM(amount),0) FROM boq_items WHERE boq_id = COALESCE(NEW.boq_id, OLD.boq_id)),
      updated_at  = NOW()
  WHERE id = COALESCE(NEW.boq_id, OLD.boq_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_boq_total_value ON boq_items;
CREATE TRIGGER trg_boq_total_value
AFTER INSERT OR UPDATE OR DELETE ON boq_items
FOR EACH ROW EXECUTE FUNCTION fn_boq_total_value();

-- ── RA Bills (Running Account Bills) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ra_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boq_id          UUID NOT NULL REFERENCES boq_documents(id) ON DELETE CASCADE,
  ra_number       TEXT NOT NULL,
  bill_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  period_from     DATE,
  period_to       DATE,
  status          TEXT NOT NULL DEFAULT 'draft',
  -- 'draft' | 'submitted' | 'approved' | 'paid'
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  sgst_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  igst_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  retention_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  retention_amt   NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_payable     NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RA Bill Line Items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ra_bill_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ra_bill_id      UUID NOT NULL REFERENCES ra_bills(id) ON DELETE CASCADE,
  boq_item_id     UUID NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  description     TEXT,
  unit            TEXT,
  rate            NUMERIC(14,2) NOT NULL DEFAULT 0,
  previous_qty    NUMERIC(14,3) NOT NULL DEFAULT 0,
  current_qty     NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_qty       NUMERIC(14,3) NOT NULL DEFAULT 0,  -- previous + current
  current_amount  NUMERIC(16,2) NOT NULL DEFAULT 0,  -- current_qty × rate
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Trigger: update boq_items.executed_qty when RA bill items change
CREATE OR REPLACE FUNCTION fn_ra_update_executed_qty()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_boq_item_id UUID;
BEGIN
  v_boq_item_id := COALESCE(NEW.boq_item_id, OLD.boq_item_id);
  UPDATE boq_items
  SET executed_qty = (
    SELECT COALESCE(SUM(rbi.current_qty), 0)
    FROM ra_bill_items rbi
    JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
    WHERE rbi.boq_item_id = v_boq_item_id
      AND rb.status != 'cancelled'
  ),
  updated_at = NOW()
  WHERE id = v_boq_item_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ra_executed_qty ON ra_bill_items;
CREATE TRIGGER trg_ra_executed_qty
AFTER INSERT OR UPDATE OR DELETE ON ra_bill_items
FOR EACH ROW EXECUTE FUNCTION fn_ra_update_executed_qty();

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_boq_company    ON boq_documents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_boq_sections   ON boq_sections(boq_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_boq_items      ON boq_items(boq_id, section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ra_bills       ON ra_bills(company_id, boq_id);
CREATE INDEX IF NOT EXISTS idx_ra_bill_items  ON ra_bill_items(ra_bill_id, boq_item_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE boq_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ra_bills      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ra_bill_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_boq_documents" ON boq_documents FOR ALL
USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "co_boq_sections" ON boq_sections FOR ALL
USING (boq_id IN (SELECT id FROM boq_documents WHERE company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())));

CREATE POLICY "co_boq_items" ON boq_items FOR ALL
USING (boq_id IN (SELECT id FROM boq_documents WHERE company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())));

CREATE POLICY "co_ra_bills" ON ra_bills FOR ALL
USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "co_ra_bill_items" ON ra_bill_items FOR ALL
USING (ra_bill_id IN (SELECT id FROM ra_bills WHERE company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())));

NOTIFY pgrst, 'reload schema';
