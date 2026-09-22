import test from 'node:test'
import assert from 'node:assert/strict'
import { filterReimbursements } from '../src/lib/hrFilters.js'

const rows = [
  { status: 'pending', employee_name: 'Arun', category: 'fuel', description: 'Diesel', flags: { bill_ref: 'F-1' } },
  { status: 'approved', employee_name: 'Bala', category: 'travel', description: 'Taxi' },
  { status: 'reimbursed', employee_name: 'Chitra', category: 'food', description: 'Site lunch' },
]

test('reimbursement summary drill-down returns only contributing requests', () => {
  assert.deepEqual(filterReimbursements(rows, { status: 'approved' }).map(row => row.employee_name), ['Bala'])
})

test('reimbursement search spans employee, category, description and bill reference', () => {
  assert.deepEqual(filterReimbursements(rows, { search: 'f-1' }).map(row => row.employee_name), ['Arun'])
})
