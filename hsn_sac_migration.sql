-- ============================================================
-- HSN / SAC Code Migration
-- Add hsn_sac column to all line item tables
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE invoice_line_items     ADD COLUMN IF NOT EXISTS hsn_sac TEXT;
ALTER TABLE quote_line_items       ADD COLUMN IF NOT EXISTS hsn_sac TEXT;
ALTER TABLE so_line_items          ADD COLUMN IF NOT EXISTS hsn_sac TEXT;
ALTER TABLE cn_line_items          ADD COLUMN IF NOT EXISTS hsn_sac TEXT;
ALTER TABLE bill_line_items        ADD COLUMN IF NOT EXISTS hsn_sac TEXT;
ALTER TABLE po_line_items          ADD COLUMN IF NOT EXISTS hsn_sac TEXT;

-- Optional: add indexes for future reporting by HSN/SAC code
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_hsn  ON invoice_line_items(hsn_sac);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_hsn     ON bill_line_items(hsn_sac);
