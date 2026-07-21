-- ─────────────────────────────────────────────────────────────────────────────
-- crusher_invoice_payments
--   Individual payment records per invoice, enabling period-based statements.
--   Previously payments were only accumulated in crusher_invoices.paid_amount
--   with no date trail. This table fixes that.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crusher_invoice_payments (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid        REFERENCES companies(id)         ON DELETE CASCADE NOT NULL,
  invoice_id    uuid        REFERENCES crusher_invoices(id)  ON DELETE CASCADE NOT NULL,
  client_id     uuid        REFERENCES clients(id)           ON DELETE SET NULL,
  client_name   text,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_mode  text        NOT NULL DEFAULT 'cash',
  payment_date  date        NOT NULL DEFAULT CURRENT_DATE,
  notes         text,
  created_at    timestamptz DEFAULT NOW()
);

-- Indexes for statement queries (filter by company + client + date range)
CREATE INDEX IF NOT EXISTS idx_crusher_inv_payments_company_client_date
  ON crusher_invoice_payments (company_id, client_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_crusher_inv_payments_invoice
  ON crusher_invoice_payments (invoice_id);

-- RLS
ALTER TABLE crusher_invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can manage crusher invoice payments"
  ON crusher_invoice_payments;

CREATE POLICY "Company members can manage crusher invoice payments"
  ON crusher_invoice_payments
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );
