import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildFleetIncidentDetails, localIncidentDate } from '../src/lib/fleetIncidentReport.js'
const now = new Date(2026, 9, 1, 1, 30)
const base = { incident_date: '2026-10-01', description: '', severity: 'medium' }
test('Fleet breakdown and damage require their cause, while notes are optional', () => {
  const details = buildFleetIncidentDetails('breakdown', { ...base, breakdown_cause: ' Hose burst ' }, null, now)
  assert.equal(details.description, 'Hose burst'); assert.equal(details.breakdown_cause, 'Hose burst')
  assert.equal(details.severity, null)
  assert.equal(buildFleetIncidentDetails('damage', { ...base, damage_cause: 'Impact' }, null, now).description, 'Impact')
  assert.throws(() => buildFleetIncidentDetails('breakdown', { ...base, description: 'Notes' }, null, now), /Cause/)
  assert.throws(() => buildFleetIncidentDetails('damage', base, null, now), /damage/)
  assert.throws(() => buildFleetIncidentDetails('other', base, null, now), /Description/)
})
test('Fleet reports use local dates and reject invalid or future dates', () => {
  assert.equal(localIncidentDate(now), '2026-10-01')
  const input = { ...base, description: 'Safety inspection', incident_date: '2026-09-29' }
  const result = buildFleetIncidentDetails('other', input, null, now)
  assert.equal(localIncidentDate(new Date(result.occurred_at)), '2026-09-29')
  for (const date of ['', '2026-02-30', '2026-10-02', 'wrong'])
    assert.throws(() => buildFleetIncidentDetails('other', { ...input, incident_date: date }, null, now), /date/)
})
test('Type changes discard hidden fields and GPS coordinates retain zero', () => {
  const details = buildFleetIncidentDetails('safety_issue', { ...base, description: 'Hazard',
    breakdown_cause: 'Old breakdown', damage_cause: 'Old damage', rectification_needed: 'Old repair',
    what_needs_to_be_done: 'Old work', action_taken: 'Isolated' }, { lat: 0, lng: 0, address: 'Equator' }, now)
  assert.equal(details.breakdown_cause, null); assert.equal(details.damage_cause, null)
  assert.equal(details.rectification_needed, null); assert.equal(details.what_needs_to_be_done, null)
  assert.equal(details.action_taken, 'Isolated'); assert.equal(details.severity, 'medium')
  assert.equal(details.location_lat, 0); assert.equal(details.location_lng, 0)
  assert.throws(() => buildFleetIncidentDetails('safety_issue', { ...base, description: 'Hazard', severity: 'bad' }, null, now), /severity/)
})
test('All supported incident types can produce a standalone report', () => {
  for (const type of ['breakdown', 'unscheduled_maintenance', 'regular_maintenance', 'damage', 'theft', 'safety_issue', 'accident', 'near_miss', 'other']) {
    const details = buildFleetIncidentDetails(type, { ...base, description: 'Report', breakdown_cause: 'Failure', damage_cause: 'Impact' }, null, now)
    assert.equal(details.incident_type, type)
    assert.equal('shift_id' in details, false)
  }
  assert.throws(() => buildFleetIncidentDetails('bad', base, null, now), /type/)
})
