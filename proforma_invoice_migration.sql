-- ─────────────────────────────────────────────────────────────────────────────
-- proforma_invoice_migration.sql
-- Adds Proforma Invoice support to client_invoices
-- Run ONCE in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add invoice_type column (proforma | tax_invoice)
ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'tax_invoice';

-- 2. Add conversion tracking — which proforma was this tax invoice converted from?
ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS converted_from_id UUID REFERENCES client_invoices(id) ON DELETE SET NULL;

-- 3. Backfill invoice_type for all existing records
UPDATE client_invoices SET invoice_type = 'tax_invoice' WHERE invoice_type IS NULL;

-- 4. Update status CHECK constraint to include 'converted'
ALTER TABLE client_invoices DROP CONSTRAINT IF EXISTS client_invoices_status_check;
ALTER TABLE client_invoices ADD CONSTRAINT client_invoices_status_check
  CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled','converted'));

-- 5. Recreate create_invoice_with_items RPC to handle invoice_type + converted_from_id
CREATE OR REPLACE FUNCTION create_invoice_with_items(p_invoice JSONB, p_items JSONB[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id         UUID := (p_invoice->>'id')::UUID;
  v_company_id UUID := (p_invoice->>'company_id')::UUID;
  item         JSONB;
BEGIN
  INSERT INTO client_invoices (
    id, company_id, invoice_number, invoice_date, due_date,
    client_name, client_address, client_gstin,
    project_name, work_order_number, work_order_date,
    work_done_from, work_done_to, nature_of_supply,
    place_of_supply, place_of_supply_address,
    subtotal, discount_amount, taxable_amount,
    cgst_rate, sgst_rate, igst_rate,
    cgst_amount, sgst_amount, igst_amount,
    total_amount, status, notes, terms, created_by,
    invoice_type, converted_from_id
  ) VALUES (
    v_id,
    v_company_id,
    p_invoice->>'invoice_number',
    (p_invoice->>'invoice_date')::DATE,
    NULLIF(p_invoice->>'due_date', '')::DATE,
    p_invoice->>'client_name',
    NULLIF(p_invoice->>'client_address', ''),
    NULLIF(p_invoice->>'client_gstin', ''),
    NULLIF(p_invoice->>'project_name', ''),
    NULLIF(p_invoice->>'work_order_number', ''),
    NULLIF(p_invoice->>'work_order_date', '')::DATE,
    NULLIF(p_invoice->>'work_done_from', '')::DATE,
    NULLIF(p_invoice->>'work_done_to', '')::DATE,
    NULLIF(p_invoice->>'nature_of_supply', ''),
    NULLIF(p_invoice->>'place_of_supply', ''),
    NULLIF(p_invoice->>'place_of_supply_address', ''),
    COALESCE((p_invoice->>'subtotal')::NUMERIC, 0),
    COALESCE((p_invoice->>'discount_amount')::NUMERIC, 0),
    COALESCE((p_invoice->>'taxable_amount')::NUMERIC, (p_invoice->>'subtotal')::NUMERIC, 0),
    COALESCE((p_invoice->>'cgst_rate')::NUMERIC, 0),
    COALESCE((p_invoice->>'sgst_rate')::NUMERIC, 0),
    COALESCE((p_invoice->>'igst_rate')::NUMERIC, 0),
    COALESCE((p_invoice->>'cgst_amount')::NUMERIC, 0),
    COALESCE((p_invoice->>'sgst_amount')::NUMERIC, 0),
    COALESCE((p_invoice->>'igst_amount')::NUMERIC, 0),
    COALESCE((p_invoice->>'total_amount')::NUMERIC, 0),
    COALESCE(NULLIF(p_invoice->>'status', ''), 'draft'),
    NULLIF(p_invoice->>'notes', ''),
    NULLIF(p_invoice->>'terms', ''),
    NULLIF(p_invoice->>'created_by', '')::UUID,
    COALESCE(NULLIF(p_invoice->>'invoice_type', ''), 'tax_invoice'),
    NULLIF(p_invoice->>'converted_from_id', '')::UUID
  );

  FOREACH item IN ARRAY p_items LOOP
    INSERT INTO invoice_line_items (
      invoice_id, company_id,
      description, item_code, sac_hsn_code, gst_rate,
      quantity, unit, rate, amount, sort_order, equipment_id
    ) VALUES (
      v_id,
      v_company_id,
      item->>'description',
      NULLIF(item->>'item_code', ''),
      NULLIF(item->>'sac_hsn_code', ''),
      NULLIF(item->>'gst_rate', '')::NUMERIC,
      COALESCE((item->>'quantity')::NUMERIC, 1),
      COALESCE(NULLIF(item->>'unit', ''), 'nos'),
      COALESCE((item->>'rate')::NUMERIC, 0),
      COALESCE((item->>'amount')::NUMERIC, 0),
      COALESCE((item->>'sort_order')::INT, 0),
      NULLIF(item->>'equipment_id', '')::UUID
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'client_invoices'
  AND column_name IN ('invoice_type', 'converted_from_id')
ORDER BY column_name;
