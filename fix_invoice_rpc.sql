-- ─────────────────────────────────────────────────────────────────────────────
-- fix_invoice_rpc.sql
-- DEFINITIVE FIX — resolves "could not choose best candidate function" error
--
-- Root cause: Two overloads of create_invoice_with_items exist in Postgres:
--   1. (p_invoice JSONB, p_items JSONB)   ← original
--   2. (p_invoice JSONB, p_items JSONB[]) ← added by proforma migration (wrong)
-- PostgREST can't pick between them. Fix: drop both, recreate once with JSONB.
--
-- Run ONCE in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Drop ALL overloads (CASCADE removes dependent objects like grants)
DROP FUNCTION IF EXISTS public.create_invoice_with_items(JSONB, JSONB)    CASCADE;
DROP FUNCTION IF EXISTS public.create_invoice_with_items(JSONB, JSONB[])  CASCADE;

-- Step 2: Add columns if not already done by proforma_invoice_migration.sql
ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'tax_invoice';

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS converted_from_id UUID
    REFERENCES client_invoices(id) ON DELETE SET NULL;

UPDATE client_invoices SET invoice_type = 'tax_invoice' WHERE invoice_type IS NULL;

ALTER TABLE client_invoices DROP CONSTRAINT IF EXISTS client_invoices_status_check;
ALTER TABLE client_invoices ADD CONSTRAINT client_invoices_status_check
  CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled','converted'));

-- Step 3: Recreate as single unambiguous function
--   p_items is JSONB (a JSON array), iterated with jsonb_array_elements.
--   PostgREST sends JS arrays as JSON arrays → JSONB. No ambiguity.
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
  p_invoice JSONB,
  p_items   JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id         UUID := (p_invoice->>'id')::UUID;
  v_company_id UUID := (p_invoice->>'company_id')::UUID;
  item         JSONB;
  i            INT := 0;
BEGIN
  -- Insert the invoice header
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
    COALESCE(
      NULLIF(p_invoice->>'taxable_amount', '')::NUMERIC,
      (p_invoice->>'subtotal')::NUMERIC,
      0
    ),
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

  -- Insert line items (p_items is a JSON array)
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
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
      COALESCE((item->>'sort_order')::INT, i),
      NULLIF(item->>'equipment_id', '')::UUID
    );
    i := i + 1;
  END LOOP;
END;
$$;

-- Re-grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(JSONB, JSONB) TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify: should show exactly ONE row
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_invoice_with_items';
