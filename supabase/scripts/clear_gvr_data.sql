-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- GVR M Sand — Clear All Operational Data
-- Keeps: companies, company_modules, company_units, user_profiles, user_roles
--        (i.e., login credentials and company setup stay intact)
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query → paste this → Run
--
-- ⚠️  THIS CANNOT BE UNDONE. Take a Supabase backup first if needed.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
  cid UUID;
BEGIN
  -- Resolve company
  SELECT id INTO cid FROM companies WHERE name ILIKE '%GVR%' LIMIT 1;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Company not found — check the ILIKE pattern matches your company name';
  END IF;
  RAISE NOTICE 'Found company ID: %', cid;

  -- Disable FK checks for this session (avoids ordering issues)
  SET LOCAL session_replication_role = 'replica';

  -- ── Helper: each block catches "table does not exist" and continues ─────────

  -- SECTION 1: Accounting & Finance
  BEGIN DELETE FROM account_transactions   WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM payment_vouchers       WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM payments_made          WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM payments_received      WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM vendor_credits         WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM invoice_payments       WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM bill_line_items        WHERE bill_id    IN (SELECT id FROM bills    WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM bills                  WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM expenses               WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM field_expenses         WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM fixed_expense_payments WHERE fixed_expense_id IN (SELECT id FROM fixed_expenses WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM fixed_expenses         WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM expense_plans          WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 2: Purchase
  BEGIN DELETE FROM po_line_items    WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM purchase_orders  WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 3: Sales / CRM
  BEGIN DELETE FROM quote_line_items WHERE quote_id IN (SELECT id FROM quotes           WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM so_line_items    WHERE so_id    IN (SELECT id FROM sales_orders     WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM dc_line_items    WHERE dc_id    IN (SELECT id FROM delivery_challans WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM cn_line_items    WHERE cn_id    IN (SELECT id FROM credit_notes     WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices     WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM quotes           WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM sales_orders     WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM delivery_challans WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM credit_notes     WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM invoices         WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM client_invoices  WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 4: Crusher Sales
  BEGIN DELETE FROM crusher_invoice_items    WHERE invoice_id IN (SELECT id FROM crusher_invoices WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM crusher_invoice_payments WHERE invoice_id IN (SELECT id FROM crusher_invoices WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM crusher_invoices         WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM crusher_tokens           WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM crusher_customer_advances WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 5: Production
  BEGIN DELETE FROM crusher_production_outputs WHERE production_id IN (SELECT id FROM crusher_production WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM crusher_production         WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 6: Daily Operations & Equipment
  BEGIN DELETE FROM equipment_assignments    WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM daily_operations         WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM deleted_operations_backup WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM equipment_commissionings WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM equipment_deployments    WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM equipment_documents      WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM equipment_attachments    WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM equipment_shift_schedule WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 7: Maintenance
  BEGIN DELETE FROM maintenance_records  WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM maintenance_schedules WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 8: Shifts
  BEGIN DELETE FROM shift_fuel_entries WHERE shift_id IN (SELECT id FROM shifts WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM shift_incidents    WHERE shift_id IN (SELECT id FROM shifts WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM shifts             WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 9: Inventory & Stock
  BEGIN DELETE FROM inventory_transactions WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM inventory_stock        WHERE item_id IN (SELECT id FROM inventory_items WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM stock_transactions     WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 10: HR & Payroll
  BEGIN DELETE FROM hr_attendance        WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM hr_leaves            WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM leave_requests       WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM operator_substitutions WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM hr_payroll_items     WHERE payroll_id IN (SELECT id FROM hr_payroll WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM hr_payroll           WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM hr_salary_history    WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM payroll_postings     WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM salary_records       WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- SECTION 11: Projects & Documents
  BEGIN DELETE FROM project_documents    WHERE project_id IN (SELECT id FROM projects WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM project_rate_items   WHERE project_id IN (SELECT id FROM projects WHERE company_id = cid); EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM projects             WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM document_verifications WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM notifications        WHERE company_id = cid; EXCEPTION WHEN undefined_table THEN NULL; END;

  RAISE NOTICE '✅ Done — all operational data cleared. Login & setup preserved.';
END;
$$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SECTION B — Optional: Clear master/reference data too
-- (equipment list, HR employee roster, vendors, clients, crusher grades, etc.)
-- Only run this if you want a completely blank slate.
-- Comment out the DO $$ block above first, then uncomment and run this block.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/*
DO $$
DECLARE
  cid UUID;
BEGIN
  SELECT id INTO cid FROM companies WHERE name ILIKE '%GVR%' LIMIT 1;
  SET LOCAL session_replication_role = 'replica';

  -- Crusher master data
  DELETE FROM crusher_client_rates    WHERE client_id IN (SELECT id FROM crusher_client_settings WHERE company_id = cid);
  DELETE FROM crusher_client_sites    WHERE client_id IN (SELECT id FROM crusher_client_settings WHERE company_id = cid);
  DELETE FROM crusher_client_settings WHERE company_id = cid;
  DELETE FROM crusher_client_vehicles WHERE company_id = cid;
  DELETE FROM crusher_grades          WHERE company_id = cid;
  DELETE FROM crusher_loading_points  WHERE company_id = cid;

  -- HR master data
  DELETE FROM hr_salary_structure     WHERE company_id = cid;
  DELETE FROM hr_employees            WHERE company_id = cid;

  -- Core master data
  DELETE FROM inventory_items         WHERE company_id = cid;
  DELETE FROM stores                  WHERE company_id = cid;
  DELETE FROM clients                 WHERE company_id = cid;
  DELETE FROM equipment               WHERE company_id = cid;
  DELETE FROM vendors                 WHERE company_id = cid;

  RAISE NOTICE '✅ Master data also cleared.';
END;
$$;
*/
