import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOutstandingInvoiceRows,
  filterOutstandingInvoices,
  groupOutstandingInvoices,
  summarizeOutstandingInvoices,
} from '../src/lib/invoiceOutstandingReport.js'

const invoices = [
  { id: '1', invoice_number: 'INV-1', invoice_date: '2026-08-01', due_date: '2026-08-31', client_id: 'c1', client_name: 'Alpha', project_id: 'p1', project_name: 'Metro', total_amount: 100000, paid_amount: 25000, balance_due: 1, status: 'partial', invoice_type: 'tax' },
  { id: '2', invoice_number: 'INV-2', invoice_date: '2026-09-01', due_date: '2026-10-15', client_id: 'c1', client_name: 'Alpha', project_id: 'p2', project_name: 'Bridge', total_amount: 50000, paid_amount: 0, status: 'sent', invoice_type: 'tax' },
  { id: '3', invoice_number: 'INV-3', invoice_date: '2026-07-01', due_date: '2026-07-31', client_id: 'c2', client_name: 'Beta', project_id: 'p1', project_name: 'Metro', total_amount: 20000, paid_amount: 20000, status: 'paid', invoice_type: 'tax' },
  { id: '4', invoice_number: 'PF-1', invoice_date: '2026-09-01', due_date: '2026-09-10', client_name: 'Beta', total_amount: 90000, paid_amount: 0, status: 'sent', invoice_type: 'proforma' },
  { id: '5', invoice_number: 'INV-DRAFT', invoice_date: '2026-09-01', client_name: 'Gamma', total_amount: 70000, paid_amount: 0, status: 'draft', invoice_type: 'tax' },
]

test('outstanding rows include only issued receivables and recalculate the balance', () => {
  const rows = buildOutstandingInvoiceRows(invoices, '2026-09-30')
  assert.deepEqual(rows.map(row => row.id), ['1', '2'])
  assert.equal(rows[0].outstanding, 75000)
  assert.equal(rows[0].daysOverdue, 30)
  assert.equal(rows[0].ageingBucket, '1_30')
  assert.equal(rows[1].ageingBucket, 'not_due')
})

test('summary separates overdue and not-due receivables', () => {
  const summary = summarizeOutstandingInvoices(buildOutstandingInvoiceRows(invoices, '2026-09-30'))
  assert.equal(summary.invoices, 2)
  assert.equal(summary.outstanding, 125000)
  assert.equal(summary.overdue, 75000)
  assert.equal(summary.notDue, 50000)
  assert.equal(summary.clients.size, 1)
  assert.equal(summary.projects.size, 2)
})

test('client and project groups retain invoice counts and exact totals', () => {
  const rows = buildOutstandingInvoiceRows(invoices, '2026-09-30')
  const clients = groupOutstandingInvoices(rows, 'client')
  const projects = groupOutstandingInvoices(rows, 'project')
  assert.equal(clients[0].name, 'Alpha')
  assert.equal(clients[0].invoiceCount, 2)
  assert.equal(clients[0].outstanding, 125000)
  assert.deepEqual(projects.map(project => project.outstanding), [75000, 50000])
})

test('search and ageing filters return only matching invoices', () => {
  const rows = buildOutstandingInvoiceRows(invoices, '2026-09-30')
  assert.deepEqual(filterOutstandingInvoices(rows, { search: 'bridge' }).map(row => row.id), ['2'])
  assert.deepEqual(filterOutstandingInvoices(rows, { ageing: '1_30' }).map(row => row.id), ['1'])
  assert.deepEqual(filterOutstandingInvoices(rows, { client: 'Alpha', project: 'Metro' }).map(row => row.id), ['1'])
})
