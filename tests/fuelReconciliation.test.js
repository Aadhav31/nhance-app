import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFuelReconciliation,
  filterFuelReconciliationRows,
  groupFuelRowsByDate,
} from '../src/lib/fuelReconciliation.js'

const base = {
  equipment: [
    { id: 'eq1', name: 'CAT 320', equipment_number: 'EX-001', specific_consumption_lph: 7, current_project_id: 'p1' },
    { id: 'eq2', name: 'Blazo', equipment_number: 'TI-001', specific_consumption_lph: null, current_project_id: 'p2' },
  ],
  projects: [
    { id: 'p1', project_name: 'Metro Site', hsd_rate_per_liter: 90 },
    { id: 'p2', project_name: 'Road Site', hsd_rate_per_liter: 92 },
  ],
  deployments: [
    { equipment_id: 'eq1', project_id: 'p1', deployed_date: '2026-09-01', withdrawn_date: null },
    { equipment_id: 'eq2', project_id: 'p2', deployed_date: '2026-09-01', withdrawn_date: null },
  ],
  replenishments: [],
}

test('reconciles issue, consumption and benchmark for each machine-day', () => {
  const report = buildFuelReconciliation({
    ...base,
    issues: [{ id: 'i1', equipment_id: 'eq1', issue_date: '2026-09-18', quantity_liters: 100, meter_at_issue: 1200 }],
    fills: [{ id: 'f1', equipment_id: 'eq1', entry_time: '2026-09-18T08:00:00Z', quantity_liters: 100, rate_per_liter: 90, meter_at_filling: 1200 }],
    operations: [{ id: 'o1', equipment_id: 'eq1', project_id: 'p1', ops_date: '2026-09-18', running_hours: 10, fuel_consumed: 80, workflow_status: 'approved' }],
  })
  const row = report.rows[0]
  assert.equal(row.suppliedLitres, 100)
  assert.equal(row.expectedLitres, 70)
  assert.equal(row.balanceVariance, 20)
  assert.equal(row.benchmarkVariance, 10)
  assert.equal(row.costImpact, 1800)
  assert.ok(row.flags.includes('unaccounted'))
  assert.ok(row.flags.includes('over_standard'))
})

test('falls back to operator fills and flags missing consumption and duplicate entries', () => {
  const report = buildFuelReconciliation({
    ...base,
    issues: [], operations: [],
    fills: [
      { id: 'f1', equipment_id: 'eq2', entry_time: '2026-09-17T08:00:00Z', quantity_liters: 50, rate_per_liter: 92 },
      { id: 'f2', equipment_id: 'eq2', entry_time: '2026-09-17T09:00:00Z', quantity_liters: 50, rate_per_liter: 92 },
    ],
  })
  const row = report.rows[0]
  assert.equal(row.suppliedLitres, 100)
  assert.equal(row.duplicateCount, 1)
  assert.ok(row.flags.includes('missing_consumption_log'))
  assert.ok(row.flags.includes('duplicate_entry'))
  assert.equal(report.summary.dataGapRows, 1)
})

test('draft site logs do not affect the reconciliation', () => {
  const report = buildFuelReconciliation({
    ...base, issues: [], fills: [],
    operations: [
      { id: 'draft', equipment_id: 'eq1', project_id: 'p1', ops_date: '2026-09-18', running_hours: 9, fuel_consumed: 70, workflow_status: 'draft' },
      { id: 'approved', equipment_id: 'eq1', project_id: 'p1', ops_date: '2026-09-18', running_hours: 4, fuel_consumed: 28, workflow_status: 'approved' },
    ],
  })
  assert.equal(report.rows[0].hours, 4)
  assert.equal(report.rows[0].consumedLitres, 28)
})

test('KPI drill-down filters return only the exact contributing rows', () => {
  const report = buildFuelReconciliation({
    ...base,
    issues: [
      { id: 'i1', equipment_id: 'eq1', issue_date: '2026-09-18', quantity_liters: 100, meter_at_issue: 1200 },
      { id: 'i2', equipment_id: 'eq2', issue_date: '2026-09-18', quantity_liters: 40, meter_at_issue: 800 },
    ],
    fills: [],
    operations: [
      { id: 'o1', equipment_id: 'eq1', project_id: 'p1', ops_date: '2026-09-18', running_hours: 10, fuel_consumed: 70, workflow_status: 'approved' },
      { id: 'o2', equipment_id: 'eq2', project_id: 'p2', ops_date: '2026-09-18', running_hours: 5, fuel_consumed: 40, workflow_status: 'approved' },
    ],
  })
  assert.deepEqual(filterFuelReconciliationRows(report.rows, { metric: 'unaccounted' }).map(row => row.equipmentId), ['eq1'])
  assert.deepEqual(filterFuelReconciliationRows(report.rows, { metric: 'data_gaps' }).map(row => row.equipmentId), ['eq2'])
  assert.equal(filterFuelReconciliationRows(report.rows, { metric: 'supply', projectId: 'p1' }).length, 1)
  assert.deepEqual(groupFuelRowsByDate(report.rows), [{ date: '2026-09-18', supplied: 140, consumed: 110, expected: 70 }])
})
