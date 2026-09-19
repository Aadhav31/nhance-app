import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOperationsIntelligence, filterOperationsRows, summariseOperationsRows,
} from '../src/lib/operationsIntelligence.js'

const input = {
  startDate: '2026-09-15', endDate: '2026-09-18', today: '2026-09-18',
  equipment: [
    { id: 'eq1', name: 'Excavator One', equipment_number: 'EX-01', category: 'Excavator' },
    { id: 'eq2', name: 'Loader Two', equipment_number: 'LD-02', category: 'Loader' },
  ],
  projects: [
    { id: 'p1', project_name: 'Quarry Alpha', site_name: 'North Pit' },
    { id: 'p2', project_name: 'Road Beta', site_name: 'South Yard' },
  ],
  deployments: [
    { id: 'd1', equipment_id: 'eq1', project_id: 'p1', deployed_date: '2026-09-15', status: 'active', expected_return_date: '2026-09-17' },
    { id: 'd2', equipment_id: 'eq2', project_id: 'p2', deployed_date: '2026-09-16', withdrawn_date: '2026-09-17', status: 'withdrawn' },
  ],
  plans: [
    { id: 'plan1', equipment_id: 'eq1', project_id: 'p1', mobilisation_date: '2026-09-15', expected_return_date: '2026-09-18', status: 'mobilised' },
  ],
  operations: [
    { id: 'o1', equipment_id: 'eq1', project_id: 'p1', ops_date: '2026-09-15', status: 'working', running_hours: 6, fuel_consumed: 42 },
    { id: 'o2', equipment_id: 'eq1', project_id: 'p1', ops_date: '2026-09-15', status: 'idle', running_hours: 1, fuel_consumed: 3 },
    { id: 'o3', equipment_id: 'eq1', project_id: 'p1', ops_date: '2026-09-17', status: 'working', running_hours: 4, fuel_consumed: 20 },
    { id: 'o4', equipment_id: 'eq2', project_id: 'p2', ops_date: '2026-09-16', status: 'working', running_hours: 8, fuel_consumed: 30 },
  ],
}

test('aggregates deployed, planned and logged days without double-counting shifts', () => {
  const rows = buildOperationsIntelligence(input)
  const excavator = rows.find(row => row.equipment.id === 'eq1')
  assert.equal(excavator.plannedDays, 4)
  assert.equal(excavator.deployedDays, 4)
  assert.equal(excavator.loggedDeploymentDays, 2)
  assert.equal(excavator.missingLogDays, 2)
  assert.equal(excavator.operatingHours, 11)
  assert.equal(excavator.fuelConsumed, 65)
  assert.equal(excavator.overdueReturn, true)
})

test('a withdrawn deployment stops contributing after its actual return date', () => {
  const loader = buildOperationsIntelligence(input).find(row => row.equipment.id === 'eq2')
  assert.equal(loader.deployedDays, 2)
  assert.equal(loader.missingLogDays, 1)
  assert.equal(loader.coverage, 50)
})

test('every metric drill-down returns only contributing machines', () => {
  const rows = buildOperationsIntelligence(input)
  assert.deepEqual(filterOperationsRows(rows, { metric: 'overdue_returns' }).map(row => row.equipment.id), ['eq1'])
  assert.deepEqual(filterOperationsRows(rows, { metric: 'fuel', projectId: 'p2' }).map(row => row.equipment.id), ['eq2'])
  assert.equal(filterOperationsRows(rows, { metric: 'hours', search: 'North Pit' }).length, 1)
})

test('summary reports exact log coverage across deployed machine-days', () => {
  const summary = summariseOperationsRows(buildOperationsIntelligence(input))
  assert.equal(summary.deployedDays, 6)
  assert.equal(summary.loggedDeploymentDays, 3)
  assert.equal(summary.missingLogDays, 3)
  assert.equal(summary.logCoverage, 50)
})
