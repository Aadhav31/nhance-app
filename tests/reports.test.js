import assert from 'node:assert/strict'
import test from 'node:test'
import { REPORTS, REPORT_SOURCES } from '../src/lib/reportCatalog.js'
import { buildReportModel, estimatedRentalRevenue, reportDateRange } from '../src/lib/reportModels.js'
import { fetchReportRows, loadReportData } from '../src/lib/reportData.js'
import { createReportWorkbook, createReportPDF, reportCSV, csvCell } from '../src/lib/reportExport.js'
import { reportFixture as data, companyId } from './reports.fixture.mjs'

const period = { from: '2026-10-01', to: '2026-10-07', month: '2026-10' }
const model = (id, filters = {}) => buildReportModel(id, data, { ...period, ...filters }, '2026-10-07')

test('all reports use defined company-scoped sources and render populated models', () => {
  for (const report of REPORTS.filter(r => !r.existing)) {
    assert.ok(report.sources.every(source => REPORT_SOURCES[source]), report.id)
    const scoped = Object.fromEntries([...new Set(report.sources)].map(source => [source, data[source]]))
    const result = buildReportModel(report.id, scoped, period, '2026-10-07')
    assert.deepEqual(result.totals, model(report.id).totals, `${report.id}: required sources must be declared`)
    assert.ok(result.columns.length > 0, report.id)
    assert.ok(result.rows.length > 0, report.id)
    assert.ok(result.columns.every(c => c.key && c.label))
  }
})
test('ageing uses due dates and true balances, includes old history, distinguishes missing dates', () => {
  const result = model('invoice_aging', { from: '', to: '' })
  assert.equal(result.totals.balance, 320.25)
  assert.equal(result.totals.overdue, 80.25)
  assert.equal(result.rows.find(r => r.invoiceNumber === 'INV-OLD').bucket, '61–90 days')
  assert.equal(result.rows.find(r => r.invoiceNumber === 'INV-NO-DUE').bucket, 'Due date missing')
  assert.equal(result.rows.find(r => r.invoiceNumber === 'INV-FUTURE').bucket, 'Current / not due')
  assert.equal(model('invoice_aging', { from: '', to: '', bucket: '61–90 days' }).totals.balance, 80.25)
  assert.equal(model('revenue').totals.billed, 240)
  assert.equal(model('revenue', { from: '', to: '', client: 'client:c1' }).totals.balance, 120.25)
  assert.equal(model('revenue', { from: '', to: '', includeProforma: true }).totals.balance, 330.25)
  assert.equal(model('client_statement', { from: '', to: '' }).totals.balance, 320.25)
})
test('fuel includes standalone Fleet fills and reconciled field expenses, preserving invoice/rates', () => {
  const result = model('fuel_report', { status: 'Recorded' })
  assert.equal(result.rows.length, 4)
  assert.equal(result.totals.quantity, 38.5)
  assert.equal(result.totals.amount, 3555)
  assert.equal(result.rows.find(r => r.reference === 'FLEET-DIRECT').projectName, 'Metro')
  assert.equal(result.rows.find(r => r.reference === 'FIELD-INV-1').source, 'Reconciled field expense')
  const summary = model('fuel_report', { status: 'Recorded', equipment: 'e1', view: 'equipment' })
  assert.equal(summary.totals.quantity, 35.5)
  assert.equal(summary.rows[0].rate, 91.69)
  assert.equal(summary.details.length, 3)
  assert.equal(model('fuel_report', { status: 'Recorded', view: 'equipment', search: 'Beta' }).details.length, 1)
  assert.equal(model('fuel_report', { status: 'Pending' }).totals.quantity, 999)
})
test('equipment, project and operator filters apply to underlying shift records', () => {
  const result = model('equip_utilization', { project: 'p1' })
  assert.equal(result.totals.working, 8)
  assert.equal(result.rows[0].utilization, 72.73)
  assert.equal(model('shift_log', { operator: 'Ravi' }).rows.length, 1)
  assert.equal(model('shift_log', { project: 'p2' }).rows.length, 0)
})
test('direct incidents and maintenance reports do not require a linked shift', () => {
  const incidents = model('incident_report', { type: 'breakdown', status: 'Open' })
  assert.equal(incidents.rows[0].description, 'Direct hose incident')
  assert.equal(incidents.rows[0].projectName, 'Metro')
  assert.equal(model('maintenance_cost', { technician: 'Technician A' }).totals.total_cost, 150)
})
test('fleet and benchmark use approved operations without double-counting logged shifts', () => {
  const fleet = model('fleet_status', { project: 'p1' })
  assert.equal(fleet.rows.length, 1, 'Historical project must not be overwritten by current assignment')
  assert.equal(fleet.totals.hours, 8)
  assert.equal(fleet.rows[0].utilization, 5)
  const fuel = model('fuel_vs_benchmark', { flag: 'High consumption' })
  assert.equal(fuel.rows.length, 1)
  assert.equal(fuel.rows[0].variance, 50)
  assert.equal(fuel.rows[0].fuelCost, 3255)
  assert.equal(model('breakdown_analysis').totals.downtime, 2, 'Never infer downtime from running_hours or default 8 hours')
  assert.equal(model('breakdown_analysis').totals.repair, 200)
  const noOps = buildReportModel('fleet_status', { ...data, daily_operations: [] }, period, '2026-10-07')
  assert.equal(noOps.totals.hours, 8)
})
test('attendance and payroll use recorded attendance and processed payroll month', () => {
  const attendance = model('attendance')
  assert.equal(attendance.rows[0].attendance, 75)
  assert.equal(attendance.totals.overtime, 2)
  assert.equal(model('payroll').totals.net_pay, 9000)
  assert.equal(model('payroll', { month: '2026-09' }).totals.net_pay, 4500)
  assert.equal(model('payroll', { month: '2026-08' }).rows.length, 0)
})
test('expenses include tax, stock uses item fallback without double-counting store records', () => {
  assert.equal(model('expense_report', { category: 'repair' }).totals.total, 118)
  const stock = model('stock_status')
  assert.equal(stock.rows.length, 2)
  assert.equal(stock.totals.value, 250)
  assert.equal(stock.totals.quantity, undefined, 'Mixed units must not be totalled')
  assert.equal(model('stock_status', { status: 'Low stock' }).rows[0].item, 'Hydraulic hose')
})
test('P&L selects historical deployment rates and deduplicates linked field expense mirrors', () => {
  assert.equal(model('equip_pl', { equipment: 'e1' }).totals.revenue, 800)
  assert.equal(model('equip_pl', { equipment: 'e1' }).totals.directCost, 118)
  assert.equal(model('equip_pl', { equipment: 'e1' }).totals.totalCost, 3693)
  assert.equal(model('project_pl', { project: 'p1' }).totals.revenue, 40)
  assert.equal(estimatedRentalRevenue([{ shift_date: '2026-10-01', working_hours: 8 }, { shift_date: '2026-10-05', working_hours: 1 }], data.equipment_deployments), 1000)
  assert.deepEqual(reportDateRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' })
})
function fakeDB({ cap = 2, fail = false, duplicate = false, changed = false } = {}) {
  const reads = []
  return { reads, from(table) {
    const filters = []; let columns, start, end
    const q = { select(value, options) { columns = value; assert.equal(options.count, 'exact'); return q }, eq(key, value) { filters.push([key, value]); return q }, order(key) { assert.equal(key, 'id'); return q }, range(a, b) { start = a; end = b; return q }, then(resolve) {
      reads.push({ table, columns, filters, start, end })
      if (fail) return Promise.resolve(resolve({ error: { message: 'Permission denied' } }))
      const rows = [...(data[table] || []), { id: 'foreign', company_id: 'other' }].filter(r => filters.every(([key, value]) => r[key] === value)).sort((a, b) => a.id.localeCompare(b.id))
      const page = rows.slice(start, Math.min(end + 1, start + cap))
      if (duplicate && start) page[0] = rows[0]
      return Promise.resolve(resolve({ data: page, count: rows.length + (changed && start ? 1 : 0), error: null }))
    } }
    return q
  } }
}
test('report fetching reads past API caps, scopes every source and rejects partial/unstable results', async () => {
  const db = fakeDB()
  const rows = await fetchReportRows(db, 'client_invoices', companyId)
  assert.equal(rows.length, 5)
  assert.ok(db.reads.every(r => r.filters.some(([key, value]) => key === 'company_id' && value === companyId)))
  await assert.rejects(fetchReportRows(fakeDB({ fail: true }), 'equipment', companyId), /equipment: Permission denied/)
  await assert.rejects(fetchReportRows(fakeDB({ duplicate: true }), 'client_invoices', companyId), /Data changed/)
  await assert.rejects(fetchReportRows(fakeDB({ changed: true }), 'client_invoices', companyId), /Data changed/)
  await assert.rejects(fetchReportRows(fakeDB(), 'equipment', ''), /Select a company/)
  const loaded = await loadReportData('fuel_report', fakeDB(), companyId)
  assert.equal(loaded.shift_fuel_entries.length, 3)
})
test('CSV safely escapes quotes, commas, newlines and formula-like text', () => {
  assert.equal(csvCell('Station "A", Chennai'), '"Station ""A"", Chennai"')
  assert.equal(csvCell('=HYPERLINK("url")'), '"\'=HYPERLINK(""url"")"')
  assert.equal(csvCell(-12), '"-12"')
  const result = model('expense_report', { category: 'repair' })
  const csv = reportCSV({ model: result, companyName: 'Test', filterDescription: 'Category: repair' })
  assert.ok(csv.includes('"Workshop ""parts"", tax\nline"'))
  assert.ok(csv.includes('"118"'))
})
test('Excel and PDF retain every filtered column, row and total including numeric money cells', async () => {
  const result = model('fuel_report', { status: 'Recorded', equipment: 'e1', view: 'equipment' })
  const report = { model: result, companyName: 'Test', reportDate: '2026-10-07', filterDescription: 'Equipment: Excavator Alpha' }
  const workbook = await createReportWorkbook(report)
  assert.equal(workbook.Sheets.Report.D8.t, 'n')
  assert.equal(workbook.Sheets.Report.D8.v, 35.5)
  assert.equal(workbook.Sheets.Report.F9.v, 3255)
  assert.equal(workbook.Sheets['Fuel entries']['!ref'], 'A1:M4')
  const pdf = await createReportPDF(report)
  assert.ok(pdf.output('arraybuffer').byteLength > 3000)
  assert.ok(pdf.output().includes('Excavator Alpha'))
  assert.ok(pdf.output().includes('3,255.00'))
})
