import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateUsageBill } from '../src/lib/usageBilling.js'

const dep = { deployed_date: '2026-09-01', billing_basis: 'daily', rate_per_day: 1000, working_days_per_month: 26 }
const op = (date, status, hours = 0, extras = {}) => ({ id: `${date}-${status}`, ops_date: date, shift_type: 'day', status, running_hours: hours, workflow_status: 'approved', logsheet_photo_url: 'present', ...extras })
const bill = (deployment, contract, operations, adjustment) => calculateUsageBill({ deployment, contract, operations, adjustment, periodFrom: '2026-09-01', periodTo: '2026-09-30' })

test('daily charges unique working dates; idle billed only under explicit contract clause', () => {
  const rows = [op('2026-09-01', 'working', 4), op('2026-09-01', 'working', 3, { id: 'night' }), op('2026-09-02', 'idle')]
  assert.equal(bill(dep, null, rows).subtotal, 1000)
  const contract = { id: 'c1', billing_basis: 'daily', rate: 1200, billing_rules: { bill_idle_days: true } }
  assert.equal(bill(dep, contract, rows).subtotal, 2400)
})

test('Sunday clause excludes work and full-month base remains the contracted monthly amount', () => {
  const contract = { id: 'c1', billing_basis: 'monthly', rate: 26000, billing_rules: { exclude_sundays: true, deduct_breakdown_days: true, working_days_per_month: 26 } }
  const result = bill(dep, contract, [op('2026-09-06', 'working', 8), op('2026-09-07', 'breakdown')])
  assert.equal(result.subtotal, 25000)
  assert.equal(result.workingDays, 0)
  assert.equal(result.lines[1].amount, -1000)
})

test('partial deployment is prorated and logs outside deployment never count', () => {
  const result = bill({ ...dep, deployed_date: '2026-09-16', billing_basis: 'monthly', rate_per_month: 30000 }, null,
    [op('2026-09-15', 'working', 8), op('2026-09-17', 'working', 6)])
  assert.equal(result.subtotal, 15000)
  assert.equal(result.hours, 6)
  assert.equal(result.operations.length, 1)
  assert.ok(result.exceptions.some(text => text.includes('outside')))
})

test('minimum hours, overtime, and reviewed deduction form traceable line items', () => {
  const contract = { id: 'c1', billing_basis: 'hourly', rate: 200, minimum_hours_per_day: 8, overtime_rate: 250, billing_rules: {} }
  const result = bill({ ...dep, max_hours_per_day: 8 }, contract,
    [op('2026-09-01', 'working', 5), op('2026-09-02', 'working', 10)], { description: 'contract credit', amount: -100 })
  assert.equal(result.subtotal, 16 * 200 + 2 * 250 - 100)
  assert.equal(result.lines.at(-1).amount, -100)
})

test('unapproved or missing-proof records are explicit review exceptions', () => {
  const result = bill(dep, null, [op('2026-09-01', 'working', 8, { workflow_status: 'submitted', logsheet_photo_url: null })])
  assert.ok(result.exceptions.some(text => text.includes('not approved')))
  assert.ok(result.exceptions.some(text => text.includes('no attached logsheet')))
})
