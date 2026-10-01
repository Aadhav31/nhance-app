import test from 'node:test'
import assert from 'node:assert/strict'
import { fuelCaptureDetails, validateFuelCaptureDetails, canCompleteFuelCapture, completeFuelCapture } from '../src/lib/fuelCaptureCompletion.js'

const details = { expense_date: '2026-09-30', equipment_id: 'eq', project_id: 'project', quantity_liters: '20', rate_per_liter: '100', station_name: ' Demo Fuel Station ', bill_number: 'F-100', meter_reading: '0', fuel_source: 'petrol_pump' }

test('fuel completion preserves a separate station and zero meter reading', () => {
  const form = fuelCaptureDetails({ expense_date: details.expense_date, equipment: { id: 'eq' }, meter_reading: 0, vendor_name: 'Operator', source_snapshot: { station_name: 'Pump' } })
  assert.equal(form.station_name, 'Pump')
  assert.equal(form.meter_reading, 0)
  assert.equal(fuelCaptureDetails({ vendor_name: 'Operator' }).station_name, '')
})

test('fuel completion requires receipt math and real date, rejects invalid quantities', () => {
  assert.equal(validateFuelCaptureDetails(details, 2000), null)
  for (const [key, value] of [['project_id', ''], ['equipment_id', ''], ['station_name', '  '], ['quantity_liters', 'Infinity'], ['rate_per_liter', '-1'], ['expense_date', '2026-02-30'], ['meter_reading', '-0.1'], ['fuel_source', 'unknown']]) {
    assert.ok(validateFuelCaptureDetails({ ...details, [key]: value }, 2000), `${key} should be rejected`)
  }
  assert.match(validateFuelCaptureDetails({ ...details, quantity_liters: '10' }, 2000), /match/)
  assert.ok(validateFuelCaptureDetails(details, 'NaN'))
  assert.equal(validateFuelCaptureDetails({ ...details, quantity_liters: '20.123', rate_per_liter: '99.389' }, 2000), null)
})

test('only eligible actors see completion, with active and approved evidence protected', () => {
  const capture = { status: 'needs_information', created_by: 'creator' }
  assert.equal(canCompleteFuelCapture(capture, 'admin', 'someone'), true)
  assert.equal(canCompleteFuelCapture(capture, 'accounts', 'someone'), true)
  assert.equal(canCompleteFuelCapture(capture, 'operator', 'creator'), true)
  assert.equal(canCompleteFuelCapture(capture, 'manager', 'someone'), false)
  assert.equal(canCompleteFuelCapture({ status: 'needs_information' }, 'operator', undefined), false)
  assert.equal(canCompleteFuelCapture({ ...capture, approval_case: { status: 'in_review' } }, 'admin', 'creator'), false)
  for (const status of ['approved', 'pending_review', 'cancelled']) assert.equal(canCompleteFuelCapture({ ...capture, status }, 'admin', 'creator'), false)
})

test('completion uses one atomic RPC; validation and backend failures stay visible', async () => {
  const calls = []
  const db = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { status: 'in_review' }, error: null } } }
  assert.deepEqual(await completeFuelCapture(db, { id: 'capture', total_amount: 2000 }, details), { status: 'in_review' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'complete_fuel_expense_capture')
  assert.equal(calls[0].args.p_details.station_name, 'Demo Fuel Station')
  assert.equal(calls[0].args.p_submit, true)
  await completeFuelCapture(db, { id: 'capture', total_amount: 2000 }, { ...details, bill_number: '' }, false)
  assert.equal(calls[1].args.p_details.bill_number, null)
  assert.equal(calls[1].args.p_submit, false)
  await assert.rejects(completeFuelCapture(db, { id: 'capture', total_amount: 2000 }, { ...details, quantity_liters: 1 }), /match/)
  assert.equal(calls.length, 2)
  await assert.rejects(completeFuelCapture({ rpc: async () => ({ error: new Error('No independent reviewer') }) }, { total_amount: 2000 }, details), /independent reviewer/)
})
