import test from 'node:test'
import assert from 'node:assert/strict'
import { addDateDays, agreedRateAmount, datesOverlap, deploymentEnd, bookingConflicts, equipmentPlanningState, plannerDayState } from '../src/lib/deploymentPlanner.js'

const today = '2026-09-18'
const machine = { id: 'eq1', status: 'idle' }
const active = { id: 'dep1', equipment_id: 'eq1', status: 'active', project_id: 'p1', deployed_date: '2026-09-01', expected_return_date: '2026-09-20' }
const plan = { id: 'plan1', equipment_id: 'eq1', status: 'planned', project_id: 'p2', mobilisation_date: '2026-09-21', expected_return_date: '2026-09-30' }

test('date arithmetic crosses month boundaries without timezone drift', () => assert.equal(addDateDays('2026-09-30', 1), '2026-10-01'))
test('same-day return and mobilisation conflict, next day is available', () => {
  assert.equal(datesOverlap('2026-09-18', '2026-09-20', '2026-09-20', '2026-09-22'), true)
  assert.equal(datesOverlap('2026-09-18', '2026-09-20', '2026-09-21', '2026-09-22'), false)
})
test('unknown return blocks future booking', () => assert.equal(bookingConflicts(machine, [{ ...active, expected_return_date: null }], [], '2026-10-01', '2026-10-10', null, today).length, 1))
test('overdue machine remains occupied', () => assert.equal(deploymentEnd({ ...active, expected_return_date: '2026-09-17' }, today), null))
test('planned booking conflicts and edit excludes itself', () => {
  assert.equal(bookingConflicts(machine, [], [plan], '2026-09-22', '2026-09-23', null, today).length, 1)
  assert.equal(bookingConflicts(machine, [], [plan], '2026-09-22', '2026-09-23', 'plan1', today).length, 0)
})
test('cancelled bookings do not block', () => assert.equal(bookingConflicts(machine, [], [{ ...plan, status: 'cancelled' }], plan.mobilisation_date, plan.expected_return_date, null, today).length, 0))
test('future booking can start after known expected return', () => assert.equal(bookingConflicts(machine, [active], [], '2026-09-21', '2026-09-23', null, today).length, 0))
test('breakdown and unresolved legacy assignment block planning', () => {
  assert.equal(bookingConflicts({ ...machine, status: 'breakdown' }, [], [], today, today).length, 1)
  assert.equal(bookingConflicts({ ...machine, current_project_id: 'p1' }, [], [], today, today).length, 1)
})
test('date-selected fleet states separate available, planned and return due', () => {
  assert.equal(equipmentPlanningState(machine, [active], [plan], '2026-10-01', '2026-10-05', today).status, 'available')
  assert.equal(equipmentPlanningState(machine, [active], [plan], '2026-09-21', '2026-09-22', today).status, 'planned')
  assert.equal(equipmentPlanningState(machine, [active], [plan], today, today, today).status, 'return_due')
})
test('board cell opens the correct planned project', () => {
  const row = equipmentPlanningState(machine, [active], [plan], today, '2026-09-30', today)
  assert.equal(plannerDayState(row, '2026-09-22', [active], today).projectId, 'p2')
})

test('historical deployments are not shown as available within their occupied dates', () => {
  const closed = { ...active, status: 'completed', withdrawn_date: '2026-09-15' }
  assert.equal(equipmentPlanningState(machine, [closed], [], '2026-09-10', '2026-09-12', today).status, 'deployed')
  assert.equal(equipmentPlanningState(machine, [closed], [], '2026-09-16', '2026-09-17', today).status, 'available')
  assert.equal(bookingConflicts(machine, [closed], [], '2026-09-15', '2026-09-16', null, today).length, 1)
  assert.equal(bookingConflicts(machine, [closed], [], '2026-09-16', '2026-09-17', null, today).length, 0)
})
test('rate snapshot follows the billing basis and preserves an explicit zero', () => {
  const rate = { rate_per_hour: 1000, rate_per_day: 0, rate_per_month: 260000, rate: 10 }
  assert.equal(agreedRateAmount(rate, 'monthly'), 260000)
  assert.equal(agreedRateAmount(rate, 'daily'), 0)
  assert.equal(agreedRateAmount(rate, 'hourly'), 1000)
})
