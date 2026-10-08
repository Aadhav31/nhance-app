import { buildInvoiceReceivables, groupInvoiceReceivables, localReportDate } from './invoiceReceivables.js'
import { REPORTS, FILTER_LABELS } from './reportCatalog.js'

const n = value => Number(value) || 0
const round = value => Math.round((value + Number.EPSILON) * 100) / 100
const sum = (rows, key) => round(rows.reduce((total, row) => total + n(row[key]), 0))
const norm = value => String(value ?? '').trim().toLowerCase()
const excluded = value => ['draft', 'cancelled', 'canceled', 'void', 'rejected'].includes(norm(value))
const col = (key, label, type = 'text', total = false) => ({ key, label, type, total })
const eqCols = [col('equipmentNumber', 'Eq. no.'), col('equipmentName', 'Equipment'), col('category', 'Category')]
const projectCol = col('projectName', 'Project')
const financialCols = [col('billed', 'Billed (INR)', 'money', true), col('received', 'Collected (INR)', 'money', true), col('balance', 'Outstanding (INR)', 'money', true), col('overdue', 'Overdue (INR)', 'money', true)]
const moneyCol = (key, label) => col(key, `${label} (INR)`, 'money', true)
const qtyCol = (key, label) => col(key, label, 'number', true)
export const AGEING_BUCKETS = ['Current / not due', '1–30 days', '31–60 days', '61–90 days', '90+ days', 'Due date missing']

export function reportCalendarDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : localReportDate(date)
}
export function reportDateRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return { from: '', to: '' }
  const [year, m] = month.split('-').map(Number)
  return m < 1 || m > 12 ? { from: '', to: '' } : { from: `${month}-01`, to: localReportDate(new Date(year, m, 0)) }
}
function inPeriod(date, filters) {
  return (!filters.from || !!date && date >= filters.from) && (!filters.to || !!date && date <= filters.to)
}
function groups(rows, key) {
  const map = new Map()
  for (const row of rows) {
    const value = row[key] || 'unassigned'
    if (!map.has(value)) map.set(value, [])
    map.get(value).push(row)
  }
  return [...map.entries()]
}
function matches(row, filters, keys) {
  return keys.every(key => !filters[key] || String(row[key] ?? '') === filters[key])
}
function optionsFor(rows, keys) {
  const labels = { equipment: 'equipmentName', project: 'projectName', client: 'clientName', employee: 'employeeName' }
  return Object.fromEntries(keys.map(key => [key, [...new Map(rows.filter(r => r[key] !== undefined && r[key] !== '').map(r => [String(r[key]), { value: String(r[key]), label: String(r[labels[key]] || r[key]) }])).values()].sort((a, b) => a.label.localeCompare(b.label))]))
}
function context(data) {
  const byId = table => new Map((data[table] || []).map(row => [row.id, row]))
  const equipment = byId('equipment'), projects = byId('projects'), shifts = byId('shifts'), employees = byId('hr_employees')
  const dims = row => {
    const shift = shifts.get(row.shift_id)
    const eid = row.equipment_id || shift?.equipment_id
    const date = reportCalendarDate(row.entry_time || row.issue_date || row.incident_time || row.service_date || row.shift_date || row.ops_date || row.transaction_date || row.expense_date || row.bill_date || row.date)
    const deployment = !row.project_id && !shift?.project_id && date ? (data.equipment_deployments || []).filter(d => d.equipment_id === eid && d.deployed_date <= date && (!d.withdrawn_date || d.withdrawn_date >= date)).sort((a, b) => b.deployed_date.localeCompare(a.deployed_date))[0] : null
    const pid = row.project_id || shift?.project_id || deployment?.project_id
    const eq = equipment.get(eid), project = projects.get(pid)
    return { equipment: eid || 'unassigned', equipmentName: eq?.name || row.equipment_name || 'Unassigned equipment', equipmentNumber: eq?.equipment_number || '', category: eq?.category || 'Unspecified', project: pid || 'unassigned', projectName: project?.project_name || row.project_name || 'Unassigned project' }
  }
  const employee = row => {
    const emp = employees.get(row.employee_id)
    return { employee: row.employee_id || 'unassigned', employeeName: emp?.name || 'Unassigned employee', employeeNumber: emp?.employee_number || '', department: emp?.department || 'Unspecified', designation: emp?.designation || '' }
  }
  return { equipment, projects, shifts, employees, dims, employee }
}

export function fuelReportEntries(data) {
  const ctx = context(data)
  const captures = new Map((data.fuel_expense_captures || []).map(c => [c.id, c]))
  return [
    ...(data.shift_fuel_entries || []).map(f => ({ ...f, id: `shift:${f.id}`, ...ctx.dims({ ...f, entry_time: f.entry_time || f.created_at }), date: reportCalendarDate(f.entry_time || f.created_at) || ctx.shifts.get(f.shift_id)?.shift_date || '', source: 'Shift / Fleet fill', reference: f.invoice_number || '', station: f.filling_location || '', meter: f.meter_at_filling, status: 'Recorded' })),
    ...(data.fuel_issues || []).map(f => ({ ...f, id: `issue:${f.id}`, ...ctx.dims(f), date: f.issue_date || '', source: f.expense_capture_id ? 'Reconciled field expense' : 'Fuel issue', reference: captures.get(f.expense_capture_id)?.bill_number || f.voucher_number || '', station: f.station_name || '', meter: f.meter_at_issue, status: norm(f.approval_status) === 'pending' ? 'Pending' : ['rejected', 'cancelled'].includes(norm(f.approval_status)) ? 'Rejected' : 'Recorded' })),
  ].map(f => ({ ...f, vendor: f.vendor_name || f.station || 'Unspecified', fuelSource: f.fuel_source || 'Unspecified', quantity: n(f.quantity_liters), rate: f.rate_per_liter == null ? null : n(f.rate_per_liter), amount: round(f.total_amount == null ? n(f.quantity_liters) * n(f.rate_per_liter) : n(f.total_amount)) }))
}

function invoiceRows(data, filters, today) {
  return buildInvoiceReceivables(data.client_invoices || [], data.clients || [], data.projects || [], today, { includeProforma: !!filters.includeProforma }).map(row => ({
    ...row, client: row.clientKey, project: row.projectKey, date: row.invoiceDate,
    bucket: !row.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate) || Number.isNaN(Date.parse(row.dueDate)) || new Date(row.dueDate).toISOString().slice(0, 10) !== row.dueDate ? AGEING_BUCKETS[5] : row.daysOverdue <= 0 ? AGEING_BUCKETS[0] : row.daysOverdue <= 30 ? AGEING_BUCKETS[1] : row.daysOverdue <= 60 ? AGEING_BUCKETS[2] : row.daysOverdue <= 90 ? AGEING_BUCKETS[3] : AGEING_BUCKETS[4],
  }))
}

/** Preserve shift-proportional daily/monthly rental estimates, using the deployment active on each date. */
export function estimatedRentalRevenue(shifts, deployments) {
  let revenue = 0
  for (const [, dayShifts] of groups(shifts, 'shift_date')) {
    const date = dayShifts[0].shift_date
    const deployment = deployments.filter(d => d.deployed_date <= date && (!d.withdrawn_date || d.withdrawn_date >= date)).sort((a, b) => b.deployed_date.localeCompare(a.deployed_date))[0]
    if (!deployment) continue
    const hours = sum(dayShifts, 'working_hours')
    const basis = deployment.billing_basis || (deployment.rate_unit === 'per_hour' ? 'hourly' : deployment.rate_unit === 'per_month' ? 'monthly' : 'daily')
    if (['hourly', 'short_term_hourly'].includes(basis)) revenue += hours * (n(deployment.rate_per_hour) || n(deployment.rental_rate))
    else {
      const maxHours = n(deployment.max_hours_per_day) || 8
      const maxShifts = Math.max(1, Math.round(maxHours / 8))
      const rate = basis === 'monthly' ? (n(deployment.rate_per_month) || n(deployment.rental_rate)) / (n(deployment.working_days_per_month) || 26) : n(deployment.rate_per_day) || n(deployment.rental_rate)
      revenue += Math.min(dayShifts.length, maxShifts) / maxShifts * rate
      if (basis === 'daily') revenue += Math.max(0, hours - maxHours) * rate / maxHours * (n(deployment.ot_percentage) || 125) / 100
    }
  }
  return round(revenue)
}
function operatorCosts(shifts, salaries) {
  return shifts.filter(s => s.operator_id).map(s => {
    const sal = salaries.filter(r => r.employee_id === s.operator_id && (!r.effective_from || r.effective_from <= s.shift_date)).sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0]
    const gross = ['basic_salary', 'hra', 'special_allowance', 'other_allowance'].reduce((v, key) => v + n(sal?.[key]), 0)
    const shiftRate = s.shift_type === 'night' ? sal?.night_shift_rate : s.shift_type === 'double' ? sal?.double_shift_rate : sal?.day_shift_rate
    return { ...s, operatorCost: round(n(shiftRate) || n(sal?.daily_rate) || gross / 26) }
  })
}

export function buildReportModel(reportId, data = {}, filters = {}, today = localReportDate()) {
  const report = REPORTS.find(r => r.id === reportId)
  if (!report || report.existing) throw new Error('Unknown report.')
  const ctx = context(data)
  const period = report.month ? { ...filters, ...reportDateRange(filters.month) } : filters
  let rows = [], columns = [], optionRows = [], notes = '', details = []
  const pick = (records, keys = report.filters) => records.filter(r => inPeriod(r.date, period) && matches(r, filters, keys))
  const enrich = (records, dateKey) => records.map(r => ({ ...r, ...ctx.dims(r), date: reportCalendarDate(r[dateKey]) }))
  const shifts = enrich(data.shifts || [], 'shift_date')
  const fuels = fuelReportEntries(data)
  const finance = report.financial || reportId === 'project_pl'
  const invoices = finance ? invoiceRows(data, filters, today) : []

  if (['revenue', 'invoice_aging', 'client_statement'].includes(reportId)) {
    const eligible = reportId === 'invoice_aging' ? invoices.filter(r => r.balance > 0) : invoices
    optionRows = eligible
    const selected = pick(eligible)
    columns = [col('invoiceNumber', 'Invoice'), col('documentType', 'Document type'), col('clientName', 'Client'), projectCol, col('invoiceDate', 'Invoice date'), col('dueDate', 'Due date'), ...financialCols, col('daysOverdue', 'Days overdue', 'number'), col('status', 'Status')]
    rows = selected
    if (reportId === 'invoice_aging') columns.push(col('bucket', 'Ageing bucket'))
    if (reportId === 'client_statement') {
      rows = groupInvoiceReceivables(selected, 'client').map(r => ({ ...r, id: r.key, details: r.invoices }))
      columns = [col('clientName', 'Client'), qtyCol('count', 'Invoices'), ...financialCols]
    }
    notes = `Current balances as of ${today}; date filters use invoice dates. ${filters.includeProforma ? 'Includes unconverted proformas.' : 'Proformas are excluded.'} Drafts, cancelled and converted documents are excluded. Recorded collections are cumulative payments against the selected invoices, not cash receipts during the date range.`
  } else if (reportId === 'fuel_report') {
    optionRows = fuels
    rows = pick(fuels).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    columns = [col('date', 'Fuel date'), ...eqCols, projectCol, col('source', 'Entry source'), col('fuelSource', 'Supplied by'), col('vendor', 'Vendor'), col('station', 'Station / location'), col('reference', 'Invoice / voucher'), qtyCol('quantity', 'Litres'), col('rate', 'Unit price (INR/L)', 'money'), moneyCol('amount', 'Amount'), col('meter', 'Meter', 'number'), col('status', 'Status')]
    details = rows
    if (filters.view === 'equipment') {
      rows = groups(rows, 'equipment').map(([id, records]) => ({ ...records[0], id, quantity: sum(records, 'quantity'), amount: sum(records, 'amount'), rate: sum(records, 'quantity') > 0 ? round(sum(records, 'amount') / sum(records, 'quantity')) : null, count: records.length, details: records }))
      columns = [...eqCols, qtyCol('quantity', 'Litres'), col('rate', 'Weighted rate (INR/L)', 'money'), moneyCol('amount', 'Amount'), qtyCol('count', 'Entries')]
    }
    notes = 'Fuel filled/issued is separate from logged fuel consumption. Includes shift/Fleet fills and fuel issues, including reconciled field expenses. Pending reconciliation expenses remain in Fuel Reconciliation. Use Entry source to review each register.'
  } else if (reportId === 'shift_log') {
    optionRows = shifts.map(r => ({ ...r, operator: r.operator_name || 'Unspecified' }))
    rows = pick(optionRows).sort((a, b) => b.date.localeCompare(a.date))
    columns = [col('date', 'Shift date'), ...eqCols, projectCol, col('operator', 'Operator'), col('shift_type', 'Shift'), qtyCol('working_hours', 'Working hours'), qtyCol('idle_hours', 'Idle hours'), qtyCol('breakdown_hours', 'Breakdown hours'), col('status', 'Status')]
  } else if (reportId === 'equip_utilization') {
    optionRows = shifts
    rows = groups(pick(shifts), 'equipment').map(([id, records]) => {
      const working = sum(records, 'working_hours'), idle = sum(records, 'idle_hours'), breakdown = sum(records, 'breakdown_hours'), hours = working + idle + breakdown
      return { ...records[0], id, working, idle, breakdown, utilization: hours > 0 ? round(working / hours * 100) : null, details: records }
    })
    columns = [...eqCols, qtyCol('working', 'Working hours'), qtyCol('idle', 'Idle hours'), qtyCol('breakdown', 'Breakdown hours'), col('utilization', 'Utilization (%)', 'percent')]
    notes = 'Utilization = working hours / (working + idle + breakdown hours) from logged shifts.'
  } else if (reportId === 'incident_report') {
    optionRows = enrich((data.shift_incidents || []).map(r => ({ ...r, incident_time: r.incident_time || r.created_at })), 'incident_time').map(r => ({ ...r, type: r.incident_type || 'Unspecified', status: r.resolved ? 'Resolved' : 'Open' }))
    rows = pick(optionRows).sort((a, b) => b.date.localeCompare(a.date))
    columns = [col('date', 'Incident date'), ...eqCols, projectCol, col('type', 'Type'), col('severity', 'Severity'), col('description', 'Description'), col('action_taken', 'Action taken'), col('status', 'Status')]
    notes = 'Includes direct equipment incidents without a shift. Project attribution uses the linked shift or a deployment active on the incident date.'
  } else if (reportId === 'maintenance_cost') {
    optionRows = enrich(data.maintenance_records || [], 'service_date').map(r => ({ ...r, type: r.maintenance_type || 'Unspecified', technician: r.technician_name || 'Unspecified' }))
    rows = pick(optionRows).sort((a, b) => b.date.localeCompare(a.date))
    columns = [col('date', 'Service date'), ...eqCols, projectCol, col('type', 'Type'), col('description', 'Description'), col('technician', 'Technician'), col('priority', 'Priority'), moneyCol('total_cost', 'Cost'), moneyCol('labour_cost', 'Labour'), qtyCol('downtime_hours', 'Downtime hours'), col('status', 'Status')]
    notes = 'Labour is part of total maintenance cost; it is not added again.'
  } else if (reportId === 'expense_report') {
    optionRows = (data.expenses || []).map(r => ({ ...r, ...ctx.dims(r), date: r.expense_date, category: r.category })).map(r => ({ ...r, category: r.category || 'Unspecified', vendor: r.vendor_name || 'Unspecified', paymentMode: r.payment_mode || 'Unspecified', total: r.total_amount == null ? round(n(r.amount) + n(r.tax_amount)) : n(r.total_amount) }))
    rows = pick(optionRows).sort((a, b) => b.date.localeCompare(a.date))
    columns = [col('date', 'Expense date'), col('category', 'Category'), col('vendor', 'Vendor'), col('description', 'Description'), col('equipmentName', 'Equipment'), projectCol, moneyCol('amount', 'Base amount'), moneyCol('tax_amount', 'Tax'), moneyCol('total', 'Total'), col('paymentMode', 'Payment mode'), col('reference_number', 'Reference'), col('status', 'Status')]
  } else if (reportId === 'attendance') {
    optionRows = (data.hr_attendance || []).map(r => ({ ...r, ...ctx.employee(r), date: r.attendance_date }))
    rows = groups(pick(optionRows), 'employee').map(([id, records]) => {
      const count = status => records.filter(r => norm(r.status) === status).length
      const present = count('present'), half = count('half_day'), absent = count('absent'), leave = count('leave'), holidays = count('holiday') + count('week_off')
      const recorded = present + half + absent + leave
      return { ...records[0], id, present, half, absent, leave, holidays, overtime: sum(records, 'ot_hours'), attendance: recorded > 0 ? round((present + half / 2) / recorded * 100) : null, details: records }
    })
    columns = [col('employeeNumber', 'Employee no.'), col('employeeName', 'Employee'), col('department', 'Department'), qtyCol('present', 'Present'), qtyCol('half', 'Half day'), qtyCol('absent', 'Absent'), qtyCol('leave', 'Leave'), qtyCol('holidays', 'Holiday / week off'), qtyCol('overtime', 'OT hours'), col('attendance', 'Attendance (%)', 'percent')]
    notes = 'Attendance percentage uses recorded present, half-day, absent and leave days; unrecorded days and holidays are excluded.'
  } else if (reportId === 'payroll') {
    const payrolls = new Map((data.hr_payroll || []).map(p => [p.id, p]))
    optionRows = (data.hr_payroll_items || []).map(r => { const p = payrolls.get(r.payroll_id); return { ...r, ...ctx.employee(r), month: p ? `${p.year}-${String(p.month).padStart(2, '0')}` : '', status: r.payment_status || 'Unpaid', payrollStatus: p?.status || 'Unspecified' } })
    rows = optionRows.filter(r => r.month === filters.month && matches(r, filters, report.filters))
    columns = [col('month', 'Payroll month'), col('employeeNumber', 'Employee no.'), col('employeeName', 'Employee'), col('department', 'Department'), moneyCol('gross_pay', 'Gross'), moneyCol('ot_amount', 'Overtime'), moneyCol('pf_employee', 'PF'), moneyCol('esi_employee', 'ESI'), moneyCol('professional_tax', 'PT'), moneyCol('total_deductions', 'Deductions'), moneyCol('net_pay', 'Net pay'), col('payrollStatus', 'Payroll status'), col('status', 'Payment status')]
    notes = 'Actual processed payroll items for the selected month. Overtime is included in gross; PF, ESI and PT are included in deductions. Process payroll in HR to create report entries.'
  } else if (reportId === 'stock_status') {
    const items = new Map((data.inventory_items || []).map(r => [r.id, r])), stores = new Map((data.stores || []).map(r => [r.id, r]))
    const stockedItems = new Set((data.inventory_stock || []).map(r => r.item_id))
    const stock = [...(data.inventory_stock || []), ...(data.inventory_items || []).filter(item => !stockedItems.has(item.id)).map(item => ({ id: `item:${item.id}`, item_id: item.id, store_id: null, quantity_on_hand: item.current_stock, avg_unit_cost: item.avg_unit_cost }))]
    optionRows = stock.map(r => { const item = items.get(r.item_id); return { ...r, item: item?.item_name || 'Unspecified item', code: item?.item_code || '', category: item?.category || 'Unspecified', store: stores.get(r.store_id)?.store_name || 'Unallocated / item stock', unit: item?.unit || '', quantity: n(r.quantity_on_hand), min: n(item?.min_stock_level), cost: n(r.avg_unit_cost), value: round(n(r.quantity_on_hand) * n(r.avg_unit_cost)), status: n(r.quantity_on_hand) <= n(item?.min_stock_level) ? 'Low stock' : 'OK' } })
    rows = optionRows.filter(r => matches(r, filters, report.filters))
    columns = [col('item', 'Item'), col('code', 'Item code'), col('category', 'Category'), col('store', 'Store'), col('quantity', 'Quantity', 'number'), col('unit', 'Unit'), col('min', 'Reorder level', 'number'), col('cost', 'Average cost (INR)', 'money'), moneyCol('value', 'Stock value'), col('status', 'Status')]
    notes = 'Current stock snapshot. Items without store stock records use their recorded item-level stock. Quantities with different units are not totalled.'
  } else if (['fleet_status', 'fuel_vs_benchmark', 'breakdown_analysis'].includes(reportId)) {
    const approvedOps = enrich(data.daily_operations || [], 'ops_date').filter(r => !r.workflow_status || r.workflow_status === 'approved')
    const opsDates = new Set(approvedOps.map(r => `${r.equipment}:${r.date}`))
    const shiftFallback = shifts.filter(r => !opsDates.has(`${r.equipment}:${r.date}`)).map(r => ({ ...r, running_hours: r.working_hours, fuel_consumed: 0, status: n(r.breakdown_hours) > 0 && n(r.working_hours) === 0 ? 'breakdown' : n(r.working_hours) > 0 ? 'working' : 'idle' }))
    const operations = [...approvedOps, ...shiftFallback]
    const jobs = enrich(data.job_cards || [], 'closed_date').filter(r => !excluded(r.status))
    optionRows = [...operations, ...shifts, ...fuels, ...jobs, ...(data.equipment || []).map(eq => ({ ...ctx.dims({ equipment_id: eq.id, project_id: eq.current_project_id }), status: eq.status }))]
    const records = pick(operations, ['equipment', 'project', 'category'])
    const issued = pick(fuels.filter(r => r.status === 'Recorded'), ['equipment', 'project', 'category'])
    const selectedShifts = pick(shifts, ['equipment', 'project', 'category'])
    const selectedJobs = pick(jobs, ['equipment', 'project', 'category'])
    const incidents = pick(enrich(data.shift_incidents || [], 'incident_time'), ['equipment', 'project', 'category'])
    let ids = reportId === 'fleet_status' && !filters.project ? new Set((data.equipment || []).map(eq => eq.id)) : new Set([...records, ...issued, ...selectedShifts, ...selectedJobs].map(r => r.equipment))
    rows = [...ids].map(id => {
      const eq = ctx.equipment.get(id), ops = records.filter(r => r.equipment === id), fs = issued.filter(r => r.equipment === id), js = selectedJobs.filter(r => r.equipment === id), ss = selectedShifts.filter(r => r.equipment === id)
      const base = { id, ...ctx.dims({ equipment_id: id, project_id: eq?.current_project_id }), status: eq?.status || 'Unspecified' }
      const hours = sum(ops, 'running_hours'), consumed = sum(ops, 'fuel_consumed'), litres = sum(fs, 'quantity')
      const actual = hours > 0 && consumed > 0 ? round(consumed / hours) : null, standard = n(eq?.specific_consumption_lph) || null
      const variance = actual !== null && standard ? round((actual - standard) / standard * 100) : null
      const breakdownDays = new Set([...ops.filter(o => o.status === 'breakdown').map(o => o.date), ...ss.filter(s => n(s.breakdown_hours) > 0).map(s => s.date)]).size
      // Daily running_hours are not downtime. Use explicitly recorded shift/job-card downtime.
      const downtime = ss.length ? sum(ss, 'breakdown_hours') : sum(js, 'downtime_hours')
      const workedDays = new Set(ops.filter(o => ['working', 'idle'].includes(o.status)).map(o => o.date)).size
      const [year, month] = (filters.month || today.slice(0, 7)).split('-').map(Number)
      const target = (data.equipment_utilization_targets || []).find(t => t.equipment_id === id && n(t.year) === year && n(t.month) === month)
      const planned = target ? n(target.planned_days) : null
      const repair = sum(js, 'total_cost'), lost = n(eq?.internal_rate_per_hour) > 0 ? round(downtime * n(eq.internal_rate_per_hour)) : round(breakdownDays * n(eq?.internal_rate_per_day))
      return { ...base, hours, consumed, litres, fuelCost: sum(fs, 'amount'), actual, standard, variance, flag: variance == null ? 'No benchmark' : variance > 20 ? 'High consumption' : 'Within benchmark', workedDays, planned, utilization: planned > 0 ? round(workedDays / planned * 100) : null, breakdownDays, downtime, repair, lost, impact: round(repair + lost), repeat: breakdownDays >= 3 ? 'Yes' : 'No', incidents: incidents.filter(i => i.equipment === id).length }
    })
    optionRows = [...optionRows.map(({ status: _status, ...row }) => row), ...rows]
    rows = rows.filter(r => matches(r, filters, report.filters.filter(key => key !== 'project')))
    if (reportId === 'fleet_status') {
      columns = [...eqCols, projectCol, col('status', 'Current status'), qtyCol('workedDays', 'Logged operating days'), col('planned', 'Planned days', 'number'), col('utilization', 'Target utilization (%)', 'percent'), qtyCol('breakdownDays', 'Breakdown days'), qtyCol('hours', 'Running hours'), qtyCol('consumed', 'Consumed (L)'), col('actual', 'Actual L/hr', 'number'), col('standard', 'Standard L/hr', 'number'), col('variance', 'Variance (%)', 'percent'), qtyCol('incidents', 'Incidents')]
      notes = 'Operating totals prefer approved daily Operations logs and use shift hours when no daily log exists for that machine/date. Fuel consumption uses daily Operations logs. Current status/site are current equipment data. Targets must exist to calculate target utilization.'
    } else if (reportId === 'fuel_vs_benchmark') {
      columns = [...eqCols, qtyCol('hours', 'Running hours'), qtyCol('litres', 'Filled / issued (L)'), qtyCol('consumed', 'Logged consumption (L)'), col('actual', 'Actual L/hr', 'number'), col('standard', 'Standard L/hr', 'number'), col('variance', 'Variance (%)', 'percent'), moneyCol('fuelCost', 'Recorded fuel cost'), col('flag', 'Benchmark flag')]
      notes = 'Hours prefer approved daily Operations logs, with shift hours as a fallback. Consumption comes from daily Operations logs; fuel cost is recorded fills/issues, not consumption multiplied by a fixed diesel price. Filled fuel and consumed fuel are separate measures. High consumption means more than 20% above the configured benchmark.'
    } else {
      rows = rows.filter(r => r.breakdownDays > 0 || r.repair > 0 || r.downtime > 0)
      columns = [...eqCols, qtyCol('breakdownDays', 'Breakdown days'), qtyCol('downtime', 'Recorded downtime (h)'), moneyCol('repair', 'Repair cost'), moneyCol('lost', 'Estimated revenue loss'), moneyCol('impact', 'Estimated impact'), col('repeat', 'Repeat (3+ days)')]
      notes = 'Downtime uses recorded shift breakdown hours, or job-card downtime when no shifts exist. Running hours are not downtime. Repair costs use job-card close dates; estimated loss uses configured internal equipment rates.'
    }
  } else if (['equip_pl', 'project_pl'].includes(reportId)) {
    const isProject = reportId === 'project_pl'
    const key = isProject ? 'project' : 'equipment'
    const costs = [
      ...fuels.filter(f => f.status === 'Recorded' && !['client', 'client_supplied'].includes(norm(f.fuelSource)) && !ctx.equipment.get(f.equipment)?.fuel_by_client).map(f => ({ ...f, costType: 'fuelCost', cost: f.amount })),
      ...enrich(data.maintenance_records || [], 'service_date').filter(r => !excluded(r.status)).map(r => ({ ...r, costType: 'maintenanceCost', cost: n(r.total_cost) })),
      ...enrich(data.expenses || [], 'expense_date').filter(r => !excluded(r.status)).map(r => ({ ...r, costType: 'directCost', cost: r.total_amount == null ? n(r.amount) + n(r.tax_amount) : n(r.total_amount) })),
      ...enrich(data.bills || [], 'bill_date').filter(r => !excluded(r.status)).map(r => ({ ...r, costType: 'billCost', cost: n(r.total_amount) })),
      ...enrich(data.inventory_transactions || [], 'transaction_date').filter(r => ['issue', 'out'].includes(norm(r.transaction_type))).map(r => ({ ...r, costType: 'sparesCost', cost: n(r.total_cost) })),
      ...operatorCosts(shifts, data.hr_salary_structure || []).map(r => ({ ...r, costType: 'operatorCost', cost: r.operatorCost })),
    ]
    // Reconciled expense captures point to the original expense/bill; count that fuel expenditure once.
    const fuelCaptureIds = new Set(fuels.filter(f => f.status === 'Recorded').map(f => f.expense_capture_id).filter(Boolean))
    const capturedExpenses = new Set((data.fuel_expense_captures || []).filter(c => fuelCaptureIds.has(c.id) && c.source_document_type === 'expense').map(c => c.source_document_id))
    const capturedFieldExpenses = new Set((data.fuel_expense_captures || []).filter(c => fuelCaptureIds.has(c.id) && c.source_document_type === 'field_expense').map(c => c.source_document_id))
    const capturedBills = new Set((data.fuel_expense_captures || []).filter(c => fuelCaptureIds.has(c.id) && c.source_document_type === 'bill').map(c => c.source_document_id))
    const uniqueCosts = costs.filter(c => !(c.costType === 'directCost' && (capturedExpenses.has(c.id) || capturedFieldExpenses.has(c.field_expense_id))) && !(c.costType === 'billCost' && capturedBills.has(c.id)))
    const rawInvoices = new Map((data.client_invoices || []).map(i => [i.id, i]))
    const invs = invoices.map(i => { const raw = rawInvoices.get(i.id); return { ...i, ...ctx.dims({ equipment_id: raw?.inv_equipment_id, project_id: raw?.project_id || (i.projectKey.startsWith('project:') ? i.projectKey.slice(8) : null), project_name: raw?.project_name }), client: i.clientKey } })
    const clients = new Map((data.clients || []).map(c => [c.id, c]))
    const masters = isProject ? (data.projects || []).map(p => ({ id: p.id, project: p.id, projectName: p.project_name, status: p.status, client: `client:${p.client_id}`, clientName: clients.get(p.client_id)?.display_name || clients.get(p.client_id)?.business_name || 'Unspecified client' })) : (data.equipment || []).map(eq => ({ id: eq.id, ...ctx.dims({ equipment_id: eq.id }), status: eq.status }))
    optionRows = [...masters, ...uniqueCosts, ...shifts]
    rows = masters.filter(m => matches(m, filters, isProject ? ['project', 'client', 'status'] : ['equipment', 'category'])).map(m => {
      const scope = records => records.filter(r => r[key] === m.id && inPeriod(r.date, period) && (!filters.project || isProject || r.project === filters.project))
      const ss = scope(shifts), cs = scope(uniqueCosts), ii = scope(invs)
      const costByType = Object.fromEntries(['fuelCost', 'operatorCost', 'maintenanceCost', 'sparesCost', 'directCost', 'billCost'].map(type => [type, round(cs.filter(c => c.costType === type).reduce((t, c) => t + c.cost, 0))]))
      const totalCost = round(Object.values(costByType).reduce((a, b) => a + b, 0))
      const deployments = (data.equipment_deployments || []).filter(d => d.equipment_id === m.id && (!filters.project || d.project_id === filters.project))
      const revenue = isProject ? sum(ii, 'billed') : estimatedRentalRevenue(ss, deployments)
      const collected = sum(ii, 'received'), balance = sum(ii, 'balance')
      return { ...m, hours: sum(ss, 'working_hours'), ...costByType, revenue, collected, balance, totalCost, net: round((isProject ? collected : revenue) - totalCost), details: cs.map(c => ({ ...c, costType: c.costType.replace(/Cost$/, ''), cost: c.cost })) }
    })
    columns = [...(isProject ? [projectCol, col('clientName', 'Client'), col('status', 'Project status')] : eqCols), qtyCol('hours', 'Working hours'), moneyCol('revenue', isProject ? 'Billed' : 'Estimated rental revenue'), ...(isProject ? [moneyCol('collected', 'Collected'), moneyCol('balance', 'Outstanding')] : []), ...['fuelCost', 'operatorCost', 'maintenanceCost', 'sparesCost', 'directCost', 'billCost'].map(k => moneyCol(k, ({ fuelCost: 'Fuel', operatorCost: 'Estimated operator', maintenanceCost: 'Maintenance', sparesCost: 'Spares', directCost: 'Direct expenses', billCost: 'Vendor bills' })[k])), moneyCol('totalCost', 'Recorded / estimated costs'), moneyCol('net', isProject ? 'Collections less costs' : 'Estimated net')]
    notes = `${isProject ? 'Billing is limited to invoice dates in the selected period; collections are cumulative against those invoices.' : 'Rental revenue is estimated from logged shifts and the deployment active on each date.'} Operator cost uses the salary structure effective on each shift date. Fuel excludes client-supplied entries. Linked reconciled fuel expenses/bills are counted once; other costs are separate module records and may overlap when recorded more than once.`
  }
  const query = norm(filters.search)
  rows = rows.filter(row => !query || columns.some(c => norm(row[c.key]).includes(query)))
  if (reportId === 'fuel_report') details = filters.view === 'equipment' ? rows.flatMap(row => row.details) : rows
  const totals = Object.fromEntries(columns.filter(c => c.total).map(c => [c.key, sum(rows, c.key)]))
  const summaryKeys = { equip_pl: ['revenue', 'totalCost', 'net'], project_pl: ['revenue', 'collected', 'balance', 'net'], payroll: ['gross_pay', 'total_deductions', 'net_pay'], maintenance_cost: ['total_cost', 'downtime_hours'], fuel_report: ['quantity', 'amount', 'count'], expense_report: ['total'], breakdown_analysis: ['breakdownDays', 'downtime', 'repair', 'lost'] }[reportId] || columns.filter(c => c.total).slice(0, 4).map(c => c.key)
  const stats = summaryKeys.map(key => columns.find(c => c.key === key && c.total)).filter(Boolean).map(c => ({ label: c.label, value: totals[c.key], type: c.type }))
  return { reportId, title: report.label, columns, rows, totals, notes, details, stats, options: optionsFor([...optionRows, ...rows], report.filters), buckets: reportId === 'invoice_aging' ? AGEING_BUCKETS.map(bucket => ({ label: bucket, value: sum(rows.filter(r => r.bucket === bucket), 'balance') })) : [] }
}

export function reportFilterDescription(report, filters, options, today) {
  const period = report.month ? `Month: ${filters.month}` : report.current ? 'Current snapshot' : `Dates: ${filters.from || 'all dates'} to ${filters.to || 'latest'}`
  return [period, `Generated: ${today}`, ...report.filters.filter(key => filters[key]).map(key => `${FILTER_LABELS[key]}: ${options[key]?.find(o => o.value === filters[key])?.label || filters[key]}`), filters.search && `Search: ${filters.search}`, report.views && `View: ${filters.view === 'equipment' ? 'Equipment summary' : 'Entries'}`, report.financial && (filters.includeProforma ? 'Includes unconverted proformas' : 'Excludes proformas')].filter(Boolean).join(' | ')
}
