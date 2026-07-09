-- ─────────────────────────────────────────────────────────────────────────────
-- invoice_fix_all.sql  — Run ONCE in Supabase SQL Editor
-- Fixes all column issues causing invoice save/edit errors
-- Safe to run multiple times (all statements use IF NOT EXISTS / OR REPLACE)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. GST supply fields on client_invoices
ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS work_order_number       TEXT,
  ADD COLUMN IF NOT EXISTS work_order_date         DATE,
  ADD COLUMN IF NOT EXISTS work_done_from          DATE,
  ADD COLUMN IF NOT EXISTS work_done_to            DATE,
  ADD COLUMN IF NOT EXISTS nature_of_supply        TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply         TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply_address TEXT;

-- 2. Extra fields on invoice_line_items
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS item_code   TEXT,
  ADD COLUMN IF NOT EXISTS sac_hsn_code TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate    NUMERIC(5,2);

-- 3. Backfill company_id from parent invoice (for existing rows)
UPDATE invoice_line_items li
SET company_id = ci.company_id
FROM client_invoices ci
WHERE li.invoice_id = ci.id
  AND li.company_id IS NULL;

-- 4. Backfill gst_rate from parent invoice (for existing rows)
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

-- 5. RLS: ensure all needed policies exist
-- client_invoices — allow all for authenticated users of same company
DROP POLICY IF EXISTS "invoices_all" ON client_invoices;
CREATE POLICY "invoices_all" ON client_invoices
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- invoice_line_items — allow all for authenticated users of same company
DROP POLICY IF EXISTS "line_items_all" ON invoice_line_items;
CREATE POLICY "line_items_all" ON invoice_line_items
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 7. Verify
SELECT
  'client_invoices' AS tbl,
  column_name
FROM information_schema.columns
WHERE table_name = 'client_invoices'
  AND column_name IN ('work_order_number','work_order_date','work_done_from','work_done_to','nature_of_supply','place_of_supply','place_of_supply_address')
UNION ALL
SELECT
  'invoice_line_items',
  column_name
FROM information_schema.columns
WHERE table_name = 'invoice_line_items'
  AND column_name IN ('company_id','item_code','sac_hsn_code','gst_rate')
ORDER BY tbl, column_name;
