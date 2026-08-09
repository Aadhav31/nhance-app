-- ══════════════════════════════════════════════════════════════════════════
-- RA Billing Full-Scale Enhancement
-- Adds payment tracking, certified amount editing, retention UI support
-- ══════════════════════════════════════════════════════════════════════════

-- ── ra_bills: payment recording columns ──────────────────────────────────
ALTER TABLE ra_bills
  ADD COLUMN IF NOT EXISTS payment_date    DATE,
  ADD COLUMN IF NOT EXISTS payment_ref     TEXT,
  ADD COLUMN IF NOT EXISTS payment_mode    TEXT,
  -- 'neft' | 'rtgs' | 'cheque' | 'cash' | 'upi'
  ADD COLUMN IF NOT EXISTS payment_amount  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS remarks         TEXT;

-- ── boq_documents: mob advance UI tracking ───────────────────────────────
-- (mob_advance_paid and mob_advance_recovered may already exist from
--  20260808_boq_fullscale.sql — using IF NOT EXISTS to be safe)
ALTER TABLE boq_documents
  ADD COLUMN IF NOT EXISTS mob_advance_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mob_advance_recovered NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ── ra_bill_measurements: ensure RLS policy exists ───────────────────────
ALTER TABLE ra_bill_measurements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ra_bill_measurements'
      AND policyname = 'co_ra_measurements'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "co_ra_measurements" ON ra_bill_measurements FOR ALL
      USING (
        ra_bill_item_id IN (
          SELECT rbi.id FROM ra_bill_items rbi
          JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
          WHERE rb.company_id IN (
            SELECT company_id FROM user_profiles WHERE id = auth.uid()
          )
        )
      )
    $pol$;
  END IF;
END
$$;

-- ── View: ra_bill_summary — convenient aggregated view ───────────────────
CREATE OR REPLACE VIEW ra_bill_summary AS
SELECT
  rb.id,
  rb.company_id,
  rb.boq_id,
  rb.ra_number,
  rb.bill_date,
  rb.period_from,
  rb.period_to,
  rb.status,
  rb.subtotal,
  rb.cgst_rate, rb.sgst_rate, rb.igst_rate,
  rb.cgst_amount, rb.sgst_amount, rb.igst_amount,
  rb.total_amount,
  rb.retention_pct, rb.retention_amt,
  rb.mob_advance_recovery,
  rb.income_tax_pct, rb.income_tax_amt,
  rb.labour_cess_pct, rb.labour_cess_amt,
  rb.sd_amount,
  rb.other_deductions, rb.other_deductions_note,
  rb.net_payable,
  rb.certified_amount,
  rb.previous_certified,
  rb.payment_date,
  rb.payment_ref,
  rb.payment_mode,
  rb.payment_amount,
  rb.remarks,
  rb.created_by,
  rb.created_at,
  COUNT(rbi.id)           AS line_count,
  SUM(rbi.current_amount) AS line_total
FROM ra_bills rb
LEFT JOIN ra_bill_items rbi ON rbi.ra_bill_id = rb.id
GROUP BY rb.id;

NOTIFY pgrst, 'reload schema';
