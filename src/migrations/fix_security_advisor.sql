-- ============================================================
-- Nhance — Fix Supabase Security Advisor Issues
-- Run this entire script in: Supabase → SQL Editor → Run
-- ============================================================


-- ============================================================
-- SECTION 1 (CRITICAL): Enable RLS on hr_salary_history
-- ============================================================

ALTER TABLE public.hr_salary_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage salary history rows
-- (matches the existing pattern used by other HR/payroll tables)
CREATE POLICY "salary_history_authenticated"
  ON public.hr_salary_history
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- SECTION 2 (CRITICAL): Enable RLS on operator_substitutions
-- ============================================================

ALTER TABLE public.operator_substitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operator_substitutions_authenticated"
  ON public.operator_substitutions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- SECTION 3 (CRITICAL): Fix company_razorpay_status Security Definer View
-- Sets the view to use the calling user's permissions (security_invoker)
-- instead of the view owner's permissions.
-- ============================================================

ALTER VIEW public.company_razorpay_status SET (security_invoker = true);


-- ============================================================
-- SECTION 4 (HIGH): Revoke anon EXECUTE on SECURITY DEFINER functions
-- Unauthenticated visitors should never call these functions.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.auth_company_id()                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.auth_role()                                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_company_id()                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_equipment()                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_doc_seq(uuid, text)                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_company_cascade(uuid)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_employee_password(uuid, text)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_employee_email(uuid, text)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_invoice_with_items(jsonb, jsonb)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_auto_create_payment_voucher()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_auto_voucher_from_expenses()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_field_expense_accounts()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_sync_field_expense_to_accounts()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_update_field_expense_sync()             FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_update_inventory_stock()                FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_update_price_catalog()                  FROM anon;


-- ============================================================
-- SECTION 5 (WARN): Fix mutable search_path on all flagged functions
-- Prevents search_path injection attacks. Safe to run — does not
-- change what the functions do, only makes their schema lookup explicit.
-- ============================================================

ALTER FUNCTION public.set_updated_at()                             SET search_path = public;
ALTER FUNCTION public.seed_default_accounts()                      SET search_path = public;
ALTER FUNCTION public.update_invoice_paid_amount()                 SET search_path = public;
ALTER FUNCTION public.update_bill_paid_amount()                    SET search_path = public;
ALTER FUNCTION public.next_doc_seq(uuid, text)                     SET search_path = public;
ALTER FUNCTION public.delete_company_cascade(uuid)                 SET search_path = public;
ALTER FUNCTION public.reset_employee_password(uuid, text)          SET search_path = public;
ALTER FUNCTION public.reset_employee_email(uuid, text)             SET search_path = public;
ALTER FUNCTION public.set_grade_rate_revised_at()                  SET search_path = public;
ALTER FUNCTION public._set_daily_ops_updated_at()                  SET search_path = public;
ALTER FUNCTION public._set_eq_assign_updated_at()                  SET search_path = public;
ALTER FUNCTION public._set_company_units_updated_at()              SET search_path = public;
ALTER FUNCTION public.update_vehicles_updated_at()                 SET search_path = public;
ALTER FUNCTION public.update_hire_contracts_updated_at()           SET search_path = public;
ALTER FUNCTION public._set_fuel_issues_updated_at()                SET search_path = public;
ALTER FUNCTION public._set_fuel_tanks_updated_at()                 SET search_path = public;
ALTER FUNCTION public._deduct_fuel_tank_on_issue()                 SET search_path = public;
ALTER FUNCTION public._restore_fuel_tank_on_delete()               SET search_path = public;
ALTER FUNCTION public._add_fuel_tank_on_replenish()                SET search_path = public;
ALTER FUNCTION public._set_pm_schedules_updated_at()               SET search_path = public;
ALTER FUNCTION public._set_job_cards_updated_at()                  SET search_path = public;
ALTER FUNCTION public._generate_jc_number()                        SET search_path = public;
ALTER FUNCTION public._update_jc_total_cost()                      SET search_path = public;
ALTER FUNCTION public._sync_jc_parts_cost()                        SET search_path = public;
ALTER FUNCTION public._set_inward_hire_updated_at()                SET search_path = public;
ALTER FUNCTION public._generate_ihc_ref()                          SET search_path = public;
ALTER FUNCTION public.update_utilization_targets_updated_at()      SET search_path = public;
ALTER FUNCTION public.update_operator_certifications_updated_at()  SET search_path = public;
ALTER FUNCTION public.fn_update_price_catalog()                    SET search_path = public;
ALTER FUNCTION public.fn_boq_item_amount()                         SET search_path = public;
ALTER FUNCTION public.fn_boq_total_value()                         SET search_path = public;
ALTER FUNCTION public.fn_ra_update_executed_qty()                  SET search_path = public;
ALTER FUNCTION public.fn_audit_logs_immutable()                    SET search_path = public;
ALTER FUNCTION public.fn_auto_create_payment_voucher()             SET search_path = public;
ALTER FUNCTION public.fn_auto_voucher_from_expenses()              SET search_path = public;
ALTER FUNCTION public.fn_cleanup_field_expense_accounts()          SET search_path = public;
ALTER FUNCTION public.fn_sync_field_expense_to_accounts()          SET search_path = public;
ALTER FUNCTION public.fn_update_field_expense_sync()               SET search_path = public;
ALTER FUNCTION public.fn_update_inventory_stock()                  SET search_path = public;
ALTER FUNCTION public.auth_company_id()                            SET search_path = public;
ALTER FUNCTION public.auth_role()                                  SET search_path = public;
ALTER FUNCTION public.get_my_company_id()                          SET search_path = public;
ALTER FUNCTION public.get_my_equipment()                           SET search_path = public;
ALTER FUNCTION public.create_invoice_with_items(jsonb, jsonb)      SET search_path = public;


-- ============================================================
-- REMAINING WARNINGS (lower priority — no action needed now)
-- ============================================================
-- • RLS Policy Always True (e.g. bills, invoices, expenses, etc.)
--   These warn because USING(true) allows any authenticated user
--   to read/write ANY company's data. Fixing these requires adding
--   company_id scoping to every policy — a bigger refactor.
--   Recommended follow-up: replace `USING (true)` with
--   `USING (company_id = auth_company_id())` on sensitive tables.
--
-- • Public Bucket Allows Listing (chat-attachments, nhance-photos, etc.)
--   Not critical — files are already public. To prevent directory
--   listing, you can add a more restrictive SELECT policy that
--   requires knowing the exact file path.
--
-- • Leaked Password Protection Disabled
--   Enable in: Supabase → Auth → Providers → Email →
--   "Enable Leaked Password Protection"
-- ============================================================
