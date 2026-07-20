-- ─────────────────────────────────────────────────────────────────────────────
-- Crusher Loading Tokens
-- Issued BEFORE material is loaded. After loading, converted to an invoice.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crusher_tokens (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_number   TEXT        NOT NULL,
  token_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  token_time     TIME        NOT NULL DEFAULT CURRENT_TIME,

  -- Customer (registered or walk-in)
  client_id      UUID        REFERENCES clients(id) ON DELETE SET NULL,
  customer_name  TEXT,

  -- Vehicle (registered or typed)
  vehicle_id     UUID        REFERENCES crusher_client_vehicles(id) ON DELETE SET NULL,
  vehicle_number TEXT,

  -- Stock yard / loading location
  stock_yard     TEXT,

  -- Material
  grade_id       UUID        REFERENCES crusher_grades(id) ON DELETE SET NULL,
  material_name  TEXT,
  quantity       NUMERIC(14,3),
  unit           TEXT        NOT NULL DEFAULT 'tonnes'
                             CHECK (unit IN ('tonnes','cum','units','bags','trips')),

  notes          TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','loaded','invoiced','cancelled')),

  -- Linked invoice once created
  invoice_id     UUID        REFERENCES crusher_invoices(id) ON DELETE SET NULL,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, token_number)
);

CREATE INDEX IF NOT EXISTS idx_crusher_tokens_date
  ON crusher_tokens(company_id, token_date DESC);

ALTER TABLE crusher_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_crusher_tokens" ON crusher_tokens;
CREATE POLICY "company_crusher_tokens" ON crusher_tokens
  FOR ALL USING (
    company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
  );
