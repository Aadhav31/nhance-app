-- ============================================================
-- Nhance — Security Fix Part 2: Remaining search_path fixes
-- (Part 1 succeeded up through set_updated_at; seed_default_accounts
--  does not exist so it was skipped — run this to finish Section 5)
-- ============================================================

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
