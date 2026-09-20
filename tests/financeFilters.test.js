import test from 'node:test'
import assert from 'node:assert/strict'
import { filterExpenseEntries } from '../src/lib/financeFilters.js'

const entries = [
  { type: 'field', date: '2026-09-01', mode: 'cash', title: 'Diesel', sub1: 'Site A' },
  { type: 'purchase', date: '2026-09-05', mode: 'bank', title: 'Hydraulic hose', ref: 'BILL-1' },
  { type: 'payroll', date: '2026-09-30', mode: 'bank', title: 'September salary', sub1: 'Operator' },
]

test('expense KPI drill-down returns only the selected contributing category', () => {
  assert.deepEqual(filterExpenseEntries(entries, { type: 'purchase' }).map(row => row.title), ['Hydraulic hose'])
})

test('expense filters combine date, payment mode and search exactly', () => {
  const rows = filterExpenseEntries(entries, {
    from: '2026-09-02', to: '2026-09-30', mode: 'bank', search: 'operator',
  })
  assert.deepEqual(rows.map(row => row.type), ['payroll'])
})
