import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildInvoiceReceivables, fetchReceivablesRows, filterInvoiceReceivables,
  groupInvoiceReceivables, invoiceReceivablesTable, localReportDate, sumInvoiceReceivables,
} from '../src/lib/invoiceReceivables.js'

const invoice = (id, extra = {}) => ({
  id, invoice_number: id, invoice_date: '2025-01-01', due_date: '2026-09-01', status: 'sent',
  client_name: 'Alpha', client_gstin: 'GST-A', project_id: 'p1', project_name: 'Old project name',
  total_amount: '100.50', paid_amount: '20.25', balance_due: 0, invoice_type: 'tax', ...extra,
})
const clients = [{ id: 'c1', display_name: 'Alpha', business_name: 'Alpha Limited', gstin: 'GST-A' }]
const projects = [{ id: 'p1', project_name: 'Metro', project_code: 'MET' }]
const build = rows => buildInvoiceReceivables(rows, clients, projects, '2026-09-30')

test('uses recorded payments, ignores a stale stored balance, and calculates calendar-day overdue', () => {
  const [r] = build([invoice('I1')])
  assert.equal(r.balance, 80.25)
  assert.equal(r.received, 20.25)
  assert.equal(r.daysOverdue, 29)
  assert.equal(r.overdue, 80.25)
  assert.equal(r.clientKey, 'client:c1')
  assert.equal(r.projectName, 'Metro')
})

test('drafts, cancellations and converted proformas never become receivables', () => {
  const rows = build([
    invoice('draft', { status: 'draft' }), invoice('cancel', { status: 'cancelled' }),
    invoice('pf', { invoice_type: 'proforma' }), invoice('converted', { status: 'converted' }),
    invoice('issued', { invoice_type: 'non_tax' }),
  ])
  assert.deepEqual(rows.map(r => r.id), ['issued'])
})

test('proforma inclusion is optional and excludes converted documents even when their status update failed', () => {
  const source = [
    invoice('tax', { converted_from_id: 'linked', total_amount: 200, paid_amount: 0 }),
    invoice('open', { invoice_type: ' Proforma ', total_amount: 50, paid_amount: 10 }),
    invoice('linked', { invoice_type: 'proforma', status: 'sent' }),
    invoice('converted', { invoice_type: 'proforma', status: 'CONVERTED' }),
    invoice('draft', { invoice_type: 'proforma', status: 'draft' }),
    invoice('cancelled', { invoice_type: 'proforma', status: 'cancelled' }),
    invoice('void', { invoice_type: 'proforma', status: 'void' }),
    invoice('linked-to-draft', { invoice_type: 'proforma' }),
    invoice('draft-tax', { status: 'draft', converted_from_id: 'linked-to-draft' }),
  ]
  assert.deepEqual(build(source).map(r => r.id), ['tax'])
  const rows = buildInvoiceReceivables(source, clients, projects, '2026-09-30', { includeProforma: true })
  assert.deepEqual(rows.map(r => r.id), ['tax', 'open'])
  assert.equal(rows[1].documentType, 'Proforma')
  assert.equal(rows[1].balance, 40)
  assert.equal(sumInvoiceReceivables(rows).balance, 240)
  for (const view of ['client', 'project']) assert.deepEqual(invoiceReceivablesTable(rows, view).totals, sumInvoiceReceivables(rows))
  assert.equal(invoiceReceivablesTable(rows).columns.find(c => c.key === 'documentType').label, 'Type')
})

test('missing and future due dates are not overdue; paid/overpaid invoices do not offset other debt', () => {
  const rows = build([
    invoice('missing', { due_date: null }), invoice('future', { due_date: '2099-01-01' }),
    invoice('today', { due_date: '2026-09-30' }), invoice('paid', { paid_amount: '100.50' }),
    invoice('overpaid', { paid_amount: '120.50' }),
  ])
  assert.equal(sumInvoiceReceivables(rows).balance, 240.75)
  assert.equal(sumInvoiceReceivables(rows).overdue, 0)
  assert.equal(filterInvoiceReceivables(rows).length, 3)
  assert.equal(filterInvoiceReceivables(rows, { status: 'paid' }).length, 2)
})

test('client and project totals reconcile to invoice totals across projects and clients', () => {
  const rows = build([
    invoice('a'), invoice('b', { project_id: 'p2', project_name: 'Road', paid_amount: '0' }),
    invoice('c', { client_name: 'Beta', client_gstin: 'GST-B', total_amount: '50', paid_amount: '10' }),
  ])
  const total = sumInvoiceReceivables(rows)
  for (const view of ['client', 'project']) {
    assert.deepEqual(sumInvoiceReceivables(groupInvoiceReceivables(rows, view)), total)
    assert.deepEqual(invoiceReceivablesTable(rows, view).totals, total)
  }
  assert.equal(groupInvoiceReceivables(rows, 'client').length, 2)
  assert.equal(groupInvoiceReceivables(rows, 'project').length, 2)
  assert.equal(groupInvoiceReceivables(rows, 'project').find(r => r.key === 'project:p1').clientName, 'Alpha, Beta')
})

test('legacy snapshots and unassigned projects remain reportable without nonexistent client_id', () => {
  const rows = build([invoice('legacy', { client_name: 'Former Client', client_gstin: '', project_id: null, project_name: null })])
  assert.equal(rows[0].clientName, 'Former Client')
  assert.equal(rows[0].projectName, 'Unassigned project')
  assert.equal(rows[0].balance, 80.25)
})

test('a shared contact name cannot merge distinct clients with different GSTINs', () => {
  const rows = buildInvoiceReceivables([
    invoice('a', { client_name: 'Same name', client_gstin: 'GST-X' }),
    invoice('b', { client_name: 'Same name', client_gstin: 'GST-Y' }),
    invoice('c', { client_name: 'Same name', client_gstin: '' }),
  ], [], [], '2026-09-30')
  assert.equal(groupInvoiceReceivables(rows, 'client').length, 3)
})

test('client/project/status/search/date filters operate on the same invoices used for exports', () => {
  const rows = build([invoice('old'), invoice('new', { invoice_date: '2026-09-20', due_date: '2099-01-01' })])
  assert.equal(filterInvoiceReceivables(rows).length, 2) // No month default hides historical debt.
  assert.deepEqual(filterInvoiceReceivables(rows, { client: 'client:c1', project: 'project:p1', status: 'all', from: '2026-09-01', to: '2026-09-30', search: 'MET' }).map(r => r.id), ['new'])
  assert.deepEqual(filterInvoiceReceivables(rows, { status: 'overdue' }).map(r => r.id), ['old'])
})

test('currency sums retain paise without floating-point drift', () => {
  const rows = build([invoice('a', { total_amount: '0.10', paid_amount: 0 }), invoice('b', { total_amount: '0.20', paid_amount: 0 })])
  assert.equal(sumInvoiceReceivables(rows).balance, 0.30)
})

test('pagination reads beyond API caps and scopes every page to the selected company', async () => {
  const calls = []
  const source = Array.from({ length: 1201 }, (_, id) => ({ id: String(id) }))
  const db = { from: table => ({ select: (columns, options) => ({ eq: (column, value) => ({ order: () => ({ range: async (from, to) => {
    calls.push({ table, columns, options, column, value, from, to })
    return { data: source.slice(from, from + 200), count: source.length, error: null }
  } }) }) }) }) }
  assert.equal((await fetchReceivablesRows(db, 'client_invoices', 'id', 'company-a')).length, 1201)
  assert.equal(calls.length, 7)
  assert.ok(calls.every(c => c.column === 'company_id' && c.value === 'company-a'))
})

test('query errors and incomplete responses fail visibly instead of showing understated totals', async () => {
  const db = response => ({ from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async () => response }) }) }) }) })
  await assert.rejects(fetchReceivablesRows(db({ error: new Error('Permission denied') }), 'client_invoices', 'id', 'c'), /Permission denied/)
  await assert.rejects(fetchReceivablesRows(db({ data: [], count: 1 }), 'client_invoices', 'id', 'c'), /incomplete/)
  await assert.rejects(fetchReceivablesRows(db({ data: [] }), 'client_invoices', 'id', 'c'), /complete invoice report/)
  assert.match(localReportDate(new Date(2026, 8, 30, 23, 59)), /^2026-09-30$/)
})
