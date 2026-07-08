-- GST-compliant invoice fields migration
-- Run in Supabase SQL Editor before deploying the updated app

-- ── client_invoices: new fields ───────────────────────────────────────────────
ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS work_order_number       TEXT,
  ADD COLUMN IF NOT EXISTS work_order_date         DATE,
  ADD COLUMN IF NOT EXISTS work_done_from          DATE,
  ADD COLUMN IF NOT EXISTS work_done_to            DATE,
  ADD COLUMN IF NOT EXISTS nature_of_supply        TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply         TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply_address TEXT;

-- ── invoice_line_items: new fields ───────────────────────────────────────────
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS item_code    TEXT,
  ADD COLUMN IF NOT EXISTS sac_hsn_code TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate     NUMERIC(5,2);

-- Backfill gst_rate from the parent invoice for existing rows
-- (so old invoices still render correctly in the PDF)
UPDATE invoice_line_items li
SET gst_rate = COALESCE(
  CASE
    WHEN ci.igst_rate > 0 THEN ci.igst_rate
    ELSE ci.cgst_rate + ci.sgst_rate
  END,
  18
)
FROM client_invoices ci
WHERE li.invoice_id = ci.id
  AND li.gst_rate IS NULL;
