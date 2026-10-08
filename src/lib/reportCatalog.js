const report = (id, cat, label, desc, filters, sources, options = {}) => ({ id, cat, label, desc, filters: filters.split(',').filter(Boolean), sources: sources.split(',').filter(Boolean), ...options })
const equipment = 'equipment,projects,equipment_deployments'
const fuel = 'shifts,shift_fuel_entries,fuel_issues,fuel_expense_captures'
const invoices = 'client_invoices,clients,projects'
export const REPORTS = [
  report('fleet_status', 'P&M Reports', 'Monthly Fleet Status', 'Fleet status, operating days, targets, fuel and incidents', 'equipment,project,category,status', `${equipment},shifts,daily_operations,equipment_utilization_targets,shift_incidents`, { month: true }),
  report('breakdown_analysis', 'P&M Reports', 'Breakdown Analysis', 'Recorded downtime, repair costs and estimated revenue loss', 'equipment,project,category', `${equipment},shifts,daily_operations,job_cards`),
  report('fuel_vs_benchmark', 'P&M Reports', 'Fuel vs Benchmark', 'Fuel issued, logged consumption and standard litres per hour', 'equipment,project,category,flag', `${equipment},daily_operations,${fuel}`),
  report('equip_utilization', 'Operations', 'Equipment Utilization', 'Working, idle and breakdown hours by equipment', 'equipment,project,category', `${equipment},shifts`),
  report('equip_pl', 'Operations', 'Equipment P&L', 'Estimated rental revenue and recorded equipment costs', 'equipment,project,category', `${equipment},equipment_deployments,${fuel},hr_salary_structure,maintenance_records,inventory_transactions,expenses,bills`),
  report('shift_log', 'Operations', 'Shift Log', 'Shift history with equipment, operator and project', 'equipment,project,status,operator', `${equipment},shifts`),
  report('fuel_report', 'Operations', 'Fuel Report', 'Shift, Fleet and reconciled field expense fuel entries', 'equipment,project,source,fuelSource,vendor,status', `${equipment},${fuel}`, { views: true }),
  report('incident_report', 'Operations', 'Incident Report', 'Shift and directly logged equipment incidents', 'equipment,project,type,severity,status', `${equipment},shifts,shift_incidents`),
  report('attendance', 'HR & Payroll', 'Attendance Report', 'Attendance days and overtime by employee', 'employee,department,status', 'hr_employees,hr_attendance'),
  report('payroll', 'HR & Payroll', 'Payroll Summary', 'Processed payroll earnings, deductions and net pay', 'employee,department,status', 'hr_employees,hr_payroll,hr_payroll_items', { month: true }),
  report('maintenance_cost', 'Maintenance', 'Maintenance Cost', 'Maintenance spend, service details and downtime', 'equipment,project,type,status,technician', `${equipment},maintenance_records`),
  report('revenue', 'Finance', 'Revenue & Collections', 'Issued invoices, recorded collections and current balances', 'client,project,status', invoices, { allDates: true, financial: true }),
  report('invoice_outstanding', 'Finance', 'Outstanding Receivables', 'Invoice, client and project views with PDF and Excel', '', '', { existing: true }),
  report('invoice_aging', 'Finance', 'Invoice Aging', 'Current outstanding balances by days past the due date', 'client,project,bucket,status', invoices, { allDates: true, financial: true }),
  report('expense_report', 'Finance', 'Expense Breakdown', 'Expenses by category, vendor, equipment and project', 'equipment,project,category,vendor,status,paymentMode', `${equipment},expenses`),
  report('project_pl', 'Projects', 'Project Summary', 'Project hours, billed revenue, collections and recorded costs', 'project,client,status', `${equipment},clients,client_invoices,${fuel},hr_salary_structure,maintenance_records,inventory_transactions,expenses,bills`),
  report('client_statement', 'Clients', 'Client Statement', 'Invoice billing and current collection balances by client', 'client,project,status', invoices, { allDates: true, financial: true }),
  report('stock_status', 'Inventory', 'Stock Status', 'Current inventory quantities, valuation and reorder levels', 'category,store,status', 'inventory_stock,inventory_items,stores', { current: true }),
]
export const REPORT_CATEGORIES = [...new Set(REPORTS.map(r => r.cat))]
export const REPORT_SOURCES = {
  equipment: 'id,name,equipment_number,category,status,current_project_id,current_site_name,specific_consumption_lph,internal_rate_per_hour,internal_rate_per_day,fuel_by_client',
  projects: 'id,project_name,project_code,client_id,status',
  clients: 'id,business_name,display_name,trade_name,contact_name,gstin,contact_phone,contact_email',
  shifts: 'id,equipment_id,project_id,operator_id,operator_name,shift_date,shift_type,working_hours,idle_hours,breakdown_hours,status,start_time,end_time',
  shift_fuel_entries: 'id,shift_id,equipment_id,entry_time,created_at,quantity_liters,rate_per_liter,total_amount,fuel_source,vendor_name,invoice_number,filling_location,meter_at_filling',
  fuel_issues: 'id,issue_date,equipment_id,equipment_name,project_id,quantity_liters,rate_per_liter,total_amount,fuel_source,vendor_name,station_name,voucher_number,meter_at_issue,expense_capture_id,approval_status',
  fuel_expense_captures: 'id,source_document_type,source_document_id,bill_number,status,fuel_issue_id',
  daily_operations: 'id,equipment_id,project_id,ops_date,status,running_hours,fuel_consumed,workflow_status',
  equipment_utilization_targets: 'id,equipment_id,year,month,planned_days',
  shift_incidents: 'id,shift_id,equipment_id,incident_time,created_at,incident_type,severity,description,action_taken,resolved,job_card_id',
  job_cards: 'id,equipment_id,project_id,jc_number,jc_type,status,opened_date,closed_date,total_cost,downtime_hours',
  equipment_deployments: 'id,equipment_id,project_id,deployed_date,withdrawn_date,billing_basis,rate_unit,rental_rate,rate_per_hour,rate_per_day,rate_per_month,max_hours_per_day,working_days_per_month,ot_percentage,fuel_by_client',
  hr_employees: 'id,name,employee_number,designation,department,status',
  hr_attendance: 'id,employee_id,attendance_date,status,ot_hours',
  hr_salary_structure: 'id,employee_id,effective_from,basic_salary,hra,special_allowance,other_allowance,daily_rate,day_shift_rate,night_shift_rate,double_shift_rate',
  hr_payroll: 'id,month,year,status',
  hr_payroll_items: 'id,payroll_id,employee_id,gross_pay,total_deductions,net_pay,pf_employee,esi_employee,professional_tax,ot_amount,payment_status',
  maintenance_records: 'id,equipment_id,project_id,service_date,maintenance_type,description,technician_name,total_cost,labour_cost,downtime_hours,status,priority,vendor_id',
  inventory_transactions: 'id,equipment_id,item_id,transaction_date,transaction_type,total_cost',
  expenses: 'id,equipment_id,project_id,expense_date,category,vendor_name,description,amount,tax_amount,total_amount,status,payment_mode,reference_number,field_expense_id',
  bills: 'id,equipment_id,project_id,bill_date,bill_number,total_amount,status,vendor_name',
  client_invoices: 'id,invoice_number,invoice_date,due_date,client_name,client_gstin,project_id,project_name,inv_equipment_id,total_amount,paid_amount,status,invoice_type,converted_from_id',
  inventory_stock: 'id,item_id,store_id,quantity_on_hand,avg_unit_cost',
  inventory_items: 'id,item_name,item_code,category,unit,min_stock_level,current_stock,avg_unit_cost,location',
  stores: 'id,store_name',
}
export const FILTER_LABELS = { equipment: 'Equipment', project: 'Project', client: 'Client', category: 'Category', status: 'Status', operator: 'Operator', source: 'Entry source', fuelSource: 'Fuel supplied by', vendor: 'Vendor / station', type: 'Type', severity: 'Severity', employee: 'Employee', department: 'Department', bucket: 'Ageing bucket', paymentMode: 'Payment mode', store: 'Store', flag: 'Benchmark flag', technician: 'Technician' }
