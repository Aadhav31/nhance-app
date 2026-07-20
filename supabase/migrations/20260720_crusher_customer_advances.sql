-- Customer advance / credit ledger for crusher sales
-- Created when: an invoice with recorded payment is voided
-- Used when: advance is applied against a future invoice

CREATE TABLE IF NOT EXISTS crusher_customer_advances (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id               uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id                uuid REFERENCES clients(id) ON DELETE SET NULL,
  client_name              text,                         -- snapshot for walk-ins
  amount                   numeric(12,2) NOT NULL,       -- original credited amount
  remaining                numeric(12,2) NOT NULL,       -- available balance
  source                   text NOT NULL DEFAULT 'advance',
    -- 'advance'        = directly added as advance payment
    -- 'voided_invoice' = credit from a voided invoice
    -- 'overpayment'    = excess payment on an invoice
  reference_invoice_id     uuid REFERENCES crusher_invoices(id) ON DELETE SET NULL,
  reference_invoice_number text,
  notes                    text,
  created_at               timestamptz DEFAULT now()
);

-- Index for fast client lookups
CREATE INDEX IF NOT EXISTS idx_crusher_advances_client
  ON crusher_customer_advances(company_id, client_id);

-- RLS
ALTER TABLE crusher_customer_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage advances"
  ON crusher_customer_advances
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );
