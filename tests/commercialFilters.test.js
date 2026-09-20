import test from 'node:test'
import assert from 'node:assert/strict'
import { filterHireContracts, filterRABills } from '../src/lib/commercialFilters.js'

test('hire contract derived filters return only ending or overdue active contracts', () => {
  const contracts = [
    { id: 'ending', status: 'active', end_date: '2026-09-24' },
    { id: 'overdue', status: 'active', end_date: '2026-09-19' },
    { id: 'later', status: 'active', end_date: '2026-10-10' },
    { id: 'draft', status: 'draft', end_date: '2026-09-22' },
  ]
  assert.deepEqual(filterHireContracts(contracts, { status: 'ending', today: '2026-09-20' }).map(row => row.id), ['ending'])
  assert.deepEqual(filterHireContracts(contracts, { status: 'overdue', today: '2026-09-20' }).map(row => row.id), ['overdue'])
})

test('RA KPI filters return only the rows contributing to each tile', () => {
  const rows = [
    { id: 'draft', status: 'draft', boq_id: 'a' },
    { id: 'submitted', status: 'submitted', boq_id: 'a' },
    { id: 'approved', status: 'approved', boq_id: 'b' },
    { id: 'paid', status: 'paid', boq_id: 'b' },
  ]
  assert.deepEqual(filterRABills(rows, { metric: 'billed' }).map(row => row.id), ['submitted', 'approved', 'paid'])
  assert.deepEqual(filterRABills(rows, { metric: 'outstanding' }).map(row => row.id), ['submitted', 'approved'])
  assert.deepEqual(filterRABills(rows, { metric: 'approved' }).map(row => row.id), ['approved'])
  assert.deepEqual(filterRABills(rows, { metric: 'paid' }).map(row => row.id), ['paid'])
})
