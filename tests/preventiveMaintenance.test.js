import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyPmSchedule,
  filterPmSchedules,
  schedulePayload,
  summarizePmSchedules,
  validateScheduleForm,
} from '../src/lib/preventiveMaintenance.js'

const equipment = { id: 'eq1', name: 'CAT 320', equipment_number: 'EX-002', current_meter_reading: 980 }
const schedule = { id: 'pm1', schedule_name: '1000 hr Service', interval_hours: 250, last_done_meter: 750, next_due_meter: 1000, alert_before_hours: 50 }

test('classifies meter-based PM states and progress', () => {
  assert.equal(classifyPmSchedule(schedule, equipment).state, 'due_soon')
  assert.equal(classifyPmSchedule(schedule, { ...equipment, current_meter_reading: 1005 }).state, 'overdue')
  assert.equal(classifyPmSchedule(schedule, { ...equipment, current_meter_reading: 800 }).state, 'on_track')
  assert.equal(classifyPmSchedule(schedule, equipment).progress, 92)
})

test('an open work order takes precedence over due state', () => {
  const pm = classifyPmSchedule({ ...schedule, openJob: { id: 'jc1' } }, { ...equipment, current_meter_reading: 1005 })
  assert.equal(pm.state, 'work_order')
  assert.equal(pm.openJob.id, 'jc1')
})

test('summary and filter return exact drill-down rows', () => {
  const rows = [
    { schedule_name: 'A', equipment, pm: { state: 'overdue' } },
    { schedule_name: 'B', equipment: { ...equipment, name: 'Blazo' }, pm: { state: 'on_track' } },
  ]
  assert.deepEqual(summarizePmSchedules(rows), { total: 2, overdue: 1, due_soon: 0, work_order: 0, on_track: 1 })
  assert.equal(filterPmSchedules(rows, 'overdue').length, 1)
  assert.equal(filterPmSchedules(rows, 'action_due').length, 1)
  assert.equal(filterPmSchedules([{ ...rows[0], pm: { state: 'work_order' } }], 'action_due').length, 1)
  assert.equal(filterPmSchedules(rows, 'all', 'blazo')[0].schedule_name, 'B')
})

test('schedule payload calculates the next due meter and checklist', () => {
  const form = {
    equipment_id: 'eq1', schedule_name: '250 hr Service', interval_hours: '250',
    alert_before_hours: '40', last_done_meter: '1000', next_due_meter: '',
    last_done_date: '', next_due_date: '', auto_create_job_card: true,
    tasks_text: 'Engine oil\nFuel filter', notes: '',
  }
  assert.equal(validateScheduleForm(form), null)
  const payload = schedulePayload(form, 'company1', equipment)
  assert.equal(payload.next_due_meter, 1250)
  assert.deepEqual(payload.tasks, [
    { task: 'Engine oil', required: true },
    { task: 'Fuel filter', required: true },
  ])
})
