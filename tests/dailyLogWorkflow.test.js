import test from 'node:test'
import assert from 'node:assert/strict'
import { dailyLogProgress, toDailyLogPayload, validateDailyLogEntry } from '../src/lib/dailyLogWorkflow.js'

const working = { equipment_id: 'eq1', status: 'working', running_hours: '8', fuel_consumed: '42.5', meter_reading: '1200' }

test('working logs require valid operating hours', () => {
  assert.deepEqual(validateDailyLogEntry({ ...working, running_hours: '' }), ['Running hours are required for working equipment'])
  assert.deepEqual(validateDailyLogEntry({ ...working, running_hours: '25' }), ['Running hours must be between 0 and 24'])
  assert.deepEqual(validateDailyLogEntry(working), [])
})

test('idle logs require a reason but not running hours', () => {
  assert.deepEqual(validateDailyLogEntry({ equipment_id: 'eq1', status: 'idle', running_hours: '' }), ['Idle reason is required'])
  assert.deepEqual(validateDailyLogEntry({ equipment_id: 'eq1', status: 'idle', running_hours: '', idle_reason: 'weather' }), [])
})

test('payload normalizes numeric and optional fields', () => {
  assert.deepEqual(toDailyLogPayload({ ...working, operator_name: '  Kumar  ', notes: '' }, '2026-09-19', 'day'), {
    equipment_id: 'eq1', project_id: null, ops_date: '2026-09-19', shift_type: 'day', status: 'working',
    running_hours: 8, fuel_consumed: 42.5, meter_reading: 1200, operator_name: 'Kumar', activity: null,
    idle_reason: null, notes: null, meter_photo_url: null, logsheet_photo_url: null,
  })
})

test('progress separates missing, draft, submitted and approved machines', () => {
  const summary = dailyLogProgress([
    { existing: null }, { existing: { workflow_status: 'draft' } },
    { existing: { workflow_status: 'submitted' } }, { existing: { workflow_status: 'approved' } },
  ])
  assert.deepEqual(summary, { expected: 4, missing: 1, draft: 1, submitted: 1, approved: 1 })
})
