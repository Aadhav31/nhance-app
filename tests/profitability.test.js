import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProfitabilityReport,
  filterProfitabilityEntities,
  filterProfitabilityRows,
  groupProfitabilityTrend,
  PROFITABILITY_METRICS,
} from '../src/lib/profitability.js'

const projects = [
  { id: 'p1', project_name: 'Metro Site', project_code: 'METRO' },
  { id: 'p2', project_name: 'Road Site', project_code: 'ROAD' },
]

const rows = [
  { id: 'r1', entry_date: '2026-08-10', entry_type: 'revenue', source_type: 'invoice', amount: 1000, project_id: 'p1', equipment_id: 'e1', project_name: 'Metro Site', equipment_name: 'CAT 320', allocation_status: 'complete', evidence_status: 'complete', metadata: { cash_collected: 600 } },
  { id: 'c1', entry_date: '2026-08-12', entry_type: 'cost', source_type: 'field_expense', category: 'fuel', amount: 400, project_id: 'p1', equipment_id: 'e1', project_name: 'Metro Site', equipment_name: 'CAT 320', allocation_status: 'complete', evidence_status: 'complete', metadata: {} },
  { id: 'c2', entry_date: '2026-09-01', entry_type: 'cost', source_type: 'bill', category: 'vendor_bill', amount: 700, project_id: 'p2', equipment_id: 'e2', project_name: 'Road Site', equipment_name: 'Blazo', allocation_status: 'complete', evidence_status: 'complete', metadata: {} },
  { id: 'c3', entry_date: '2026-09-03', entry_type: 'cost', source_type: 'expense', category: 'salary', amount: 200, project_id: null, equipment_id: null, allocation_status: 'unallocated', evidence_status: 'complete', metadata: {} },
]

test('builds project profit without allocating company overhead to a project', () => {
  const report = buildProfitabilityReport(rows, projects, 'project')
  assert.deepEqual(report.summary, {
    revenue: 1000,
    cost: 1300,
    profit: -300,
    marginPct: -30,
    cashCollected: 600,
    needsAllocationCount: 1,
    needsAllocationAmount: 200,
    lossMakingCount: 1,
    profitableCount: 1,
    allocatedRevenue: 1000,
    allocatedCost: 1100,
    unallocatedRevenue: 0,
    unallocatedCost: 200,
  })
  assert.equal(report.entities.find(item => item.id === 'p1').profit, 600)
  assert.equal(report.entities.find(item => item.id === 'p2').profit, -700)
})

test('KPI drill-down returns only exact contributing evidence', () => {
  const report = buildProfitabilityReport(rows, projects, 'project')
  const lossIds = report.entities.filter(item => item.profit < 0).map(item => item.id)
  assert.deepEqual(filterProfitabilityRows(rows, { metric: PROFITABILITY_METRICS.REVENUE }).map(row => row.id), ['r1'])
  assert.deepEqual(filterProfitabilityRows(rows, { metric: PROFITABILITY_METRICS.COST }).map(row => row.id), ['c1', 'c2', 'c3'])
  assert.deepEqual(filterProfitabilityRows(rows, { metric: PROFITABILITY_METRICS.LOSS_MAKING, lossEntityIds: lossIds }).map(row => row.id), ['c2'])
  assert.deepEqual(filterProfitabilityRows(rows, { metric: PROFITABILITY_METRICS.NEEDS_ALLOCATION }).map(row => row.id), ['c3'])
  assert.deepEqual(filterProfitabilityEntities(report.entities, PROFITABILITY_METRICS.LOSS_MAKING).map(item => item.id), ['p2'])
})

test('equipment view treats project-only revenue as needing allocation', () => {
  const equipmentRows = [
    { ...rows[0], equipment_id: null, allocation_status: 'project_only' },
    rows[1],
  ]
  const report = buildProfitabilityReport(equipmentRows, [{ id: 'e1', name: 'CAT 320' }], 'equipment')
  assert.equal(report.summary.needsAllocationCount, 1)
  assert.equal(report.summary.unallocatedRevenue, 1000)
  assert.equal(report.entities[0].cost, 400)
})

test('trend groups revenue, cost and profit by month', () => {
  assert.deepEqual(groupProfitabilityTrend(rows), [
    { month: '2026-08', revenue: 1000, cost: 400, profit: 600 },
    { month: '2026-09', revenue: 0, cost: 900, profit: -900 },
  ])
})
