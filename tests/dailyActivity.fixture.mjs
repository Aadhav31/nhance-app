export const companyId = 'test-company'
export const capturedBusinessTables = ["company_units","approval_policy_settings","equipment_commissionings","crusher_customer_advances","crusher_client_rates","item_catalogue_prices","ra_bill_measurements","fixed_expense_payments","equipment_deployment_plans","fixed_expenses","vehicles","crusher_client_sites","user_profiles","companies","company_modules","user_roles","equipment_meter_log","inventory_items","invoice_line_items","shift_work_details","maintenance_records","expenses","maintenance_schedules","lifecycle_tracking","inventory_transactions","invoices","payments","operator_profiles","attendance","salary_records","subscription_invoices","sites","vendors","equipment_documents","shifts","shift_fuel_entries","equipment_utilization_targets","notifications","hr_attendance","job_cards","job_card_parts","approval_requests","fuel_issues","shift_incidents","crusher_invoice_payments","operator_certifications","clients","sticky_notes","deleted_operations_backup","fuel_tanks","fuel_tank_replenishments","project_rate_items","equipment_attachments","hr_employees","hr_salary_structure","projects","equipment","hr_leave_balances","hr_leaves","hr_payroll","hr_payroll_items","hr_bonus","sales_orders","so_line_items","equipment_shift_schedule","account_transactions","client_invoices","pm_schedules","chart_of_accounts","quote_line_items","invoice_payments","quotes","document_verifications","cn_line_items","delivery_challans","dc_line_items","credit_notes","hire_contract_logs","hire_contracts","bills","bill_line_items","payments_received","fuel_expense_captures","po_line_items","vendor_credits","inventory_stock","payments_made","stores","document_sequences","daily_operations","stock_transactions","hr_salary_history","equipment_deployments","inward_hire_contracts","operator_substitutions","crusher_production","crusher_grades","crusher_production_outputs","project_documents","boq_sections","boq_items","ra_bill_items","breakdown_alerts","crusher_invoices","payroll_postings","expense_plans","crusher_loading_points","crusher_invoice_items","notification_receipts","crusher_client_settings","job_card_events","crusher_client_vehicles","job_card_part_issues","equipment_assignments","boq_documents","item_price_catalog","item_catalogue","assistant_threads","assistant_messages","assistant_artifacts","crusher_tokens","field_expenses","payment_vouchers","ra_bills","purchase_orders","client_billing_locations","chat_channels","chat_members","chat_messages","chat_last_read","chat_call_signals","employee_reimbursements","approval_cases","approval_workflows","approval_delegations","vendor_payment_requests","asset_transfer_requests","vendor_work_orders","approval_workflow_steps","approval_tasks","approval_actions"]
export const activityFixture = [
  { id: 'create', event_no: 1, company_id: companyId, created_at: '2026-10-02T18:30:00.000Z', module: 'equipment', table_name: 'fuel_issues', action: 'insert', operation: 'INSERT', source: 'database_trigger', actor_id: 'ravi', actor_name: 'Ravi', actor_role: 'supervisor', record_ref: 'FUEL-001', record_pk: { id: 'fill-1' }, old_data: null, new_data: { id: 'fill-1', quantity_liters: 10, rate_per_liter: 95, vendor_name: 'Station "A", Chennai', invoice_number: 'FUEL-001' }, changed_fields: ['id', 'quantity_liters', 'rate_per_liter', 'vendor_name', 'invoice_number'], description: 'Insert fuel issues', event_hash: 'a'.repeat(64), previous_hash: '0'.repeat(64), transaction_id: 123 },
  { id: 'edit', event_no: 2, company_id: companyId, created_at: '2026-10-03T05:00:00+00:00', module: 'sales', table_name: 'client_invoices', action: 'update', operation: 'UPDATE', source: 'database_trigger', actor_id: 'admin', actor_name: 'Aadhav', actor_role: 'admin', record_ref: 'INV-001', record_pk: { id: 'inv-1' }, old_data: { invoice_number: 'INV-001', total_amount: 1000, status: 'draft', notes: null }, new_data: { invoice_number: 'INV-001', total_amount: 1180, status: 'sent' }, changed_fields: ['total_amount', 'status', 'notes'], description: 'Invoice tax corrected', event_hash: 'b'.repeat(64), previous_hash: 'a'.repeat(64), transaction_id: 124 },
  { id: 'delete', event_no: 3, company_id: companyId, created_at: '2026-10-03T18:29:59.999999+00:00', module: 'hr', table_name: 'hr_attendance', action: 'delete', operation: 'DELETE', source: 'database_trigger', actor_id: 'admin', actor_name: 'Aadhav', actor_role: 'admin', record_ref: 'ATT-001', record_pk: { id: 'att-1' }, old_data: { employee_name: 'Ravi', status: 'present', notes: '=HYPERLINK("url")' }, new_data: null, changed_fields: ['employee_name', 'status', 'notes'], description: 'Wrong attendance removed', event_hash: 'c'.repeat(64), previous_hash: 'b'.repeat(64), transaction_id: 125 },
  { id: 'login', event_no: 4, company_id: companyId, created_at: '2026-10-03T12:00:00Z', module: 'auth', table_name: 'auth', action: 'login', operation: 'CUSTOM', source: 'application_event', actor_id: 'ravi', actor_name: 'Ravi', actor_role: 'supervisor', record_ref: 'Ravi', record_pk: {}, old_data: null, new_data: null, changed_fields: [], description: 'Signed in', meta: { client: { access_token: 'NEVER-EXPORT', nested: [{ api_key: 'ALSO-SECRET', message: 'hello' }] } } },
  { id: 'automatic', event_no: 5, company_id: companyId, created_at: '2026-10-03T14:00:00Z', module: 'operations', table_name: 'future_section_data', action: 'update', operation: 'UPDATE', source: 'database_trigger', actor_id: null, actor_name: null, actor_role: null, record_pk: { a: 1, b: 'x' }, old_data: { amount: 8 }, new_data: { amount: 9 }, changed_fields: ['amount'], description: 'Automatic adjustment' },
  { id: 'next-day', event_no: 6, company_id: companyId, created_at: '2026-10-03T18:30:00.000Z', module: 'approvals', table_name: 'approval_actions', action: 'insert', operation: 'INSERT', source: 'database_trigger', actor_id: 'admin', actor_name: 'Aadhav', old_data: null, new_data: { action: 'approved' }, changed_fields: ['action'], record_ref: 'APP-001', description: 'Approval action' },
  { id: 'before-day', event_no: 7, company_id: companyId, created_at: '2026-10-02T18:29:59.999999+00:00', module: 'operations', table_name: 'daily_operations', action: 'insert', operation: 'INSERT', source: 'database_trigger' },
  { id: 'foreign', event_no: 1, company_id: 'other-company', created_at: '2026-10-03T12:00:00Z', module: 'hr', table_name: 'hr_payroll', action: 'insert', source: 'database_trigger', description: 'FOREIGN COMPANY' },
]

export function fakeActivityDB(records = activityFixture, options = {}) {
  const reads = []
  let pages = 0
  const rows = structuredClone(records)
  return { reads, rows, from(table) {
    let columns = '*', filters = [], count = false, ascending = true, order = 'event_no', limit = Infinity
    const query = {
      select(value, settings) { columns = value; count = settings?.count === 'exact'; return query },
      eq(key, value) { filters.push(['eq', key, value]); return query },
      gte(key, value) { filters.push(['gte', key, value]); return query },
      lt(key, value) { filters.push(['lt', key, value]); return query },
      gt(key, value) { filters.push(['gt', key, value]); return query },
      lte(key, value) { filters.push(['lte', key, value]); return query },
      order(key, settings) { order = key; ascending = settings?.ascending !== false; return query },
      limit(value) { limit = value; return query }, abortSignal() { return query },
      async then(resolve) {
        reads.push({ table, columns, filters, count, ascending, order, limit })
        if (options.fail) return resolve({ error: { message: 'Permission denied' } })
        let found = rows.filter(row => filters.every(([op, key, value]) => {
          const a = key === 'created_at' ? Date.parse(row[key]) : row[key], b = key === 'created_at' ? Date.parse(value) : value
          return op === 'eq' ? a === b : op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b
        })).sort((a, b) => { const x = order === 'created_at' ? Date.parse(a[order]) : a[order], y = order === 'created_at' ? Date.parse(b[order]) : b[order]; return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1) })
        const total = found.length
        if (count && options.append) rows.push(options.append)
        if (!count) {
          pages++
          if (options.empty && pages > 1) found = []
          if (options.duplicate && pages > 1) found[0] = rows[0]
          if (options.foreign) found[0] = { ...found[0], company_id: 'other-company' }
        }
        let data = found.slice(0, Math.min(limit, options.cap || 500))
        if (columns !== '*') data = data.map(row => Object.fromEntries(columns.split(',').map(key => [key, row[key]])))
        return resolve({ data, count: count ? options.missingCount ? null : total : undefined, error: null })
      },
    }
    return query
  } }
}
