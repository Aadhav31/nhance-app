-- Fix RLS policies for client_invoices and invoice_line_items
-- Run in Supabase SQL Editor if invoice creation is failing

-- 1. Check what policies exist
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('client_invoices', 'invoice_line_items')
ORDER BY tablename, cmd;

-- 2. If INSERT policy is missing or wrong, recreate it:
-- (Run only the lines relevant to your setup)

-- Allow authenticated users to insert invoices for their company
DROP POLICY IF EXISTS "company_insert_invoices" ON client_invoices;
CREATE POLICY "company_insert_invoices" ON client_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Allow SELECT on own company invoices
DROP POLICY IF EXISTS "company_select_invoices" ON client_invoices;
CREATE POLICY "company_select_invoices" ON client_invoices
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Allow INSERT on invoice_line_items
DROP POLICY IF EXISTS "company_insert_line_items" ON invoice_line_items;
CREATE POLICY "company_insert_line_items" ON invoice_line_items
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Allow SELECT on invoice_line_items
DROP POLICY IF EXISTS "company_select_line_items" ON invoice_line_items;
CREATE POLICY "company_select_line_items" ON invoice_line_items
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );
