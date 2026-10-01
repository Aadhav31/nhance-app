export const FUEL_DETAIL_STATUSES = new Set(['needs_information', 'returned', 'rejected'])

export function fuelCaptureDetails(capture) {
  return {
    expense_date: capture.expense_date || '',
    equipment_id: capture.equipment_id || capture.equipment?.id || '',
    project_id: capture.project_id || capture.project?.id || '',
    quantity_liters: capture.quantity_liters ?? '',
    rate_per_liter: capture.rate_per_liter ?? '',
    station_name: capture.station_name || capture.source_snapshot?.station_name || '',
    bill_number: capture.bill_number || '',
    meter_reading: capture.meter_reading ?? '',
    fuel_source: capture.fuel_source || 'petrol_pump',
  }
}

export function validateFuelCaptureDetails(details, amount) {
  if (!details.equipment_id) return 'Select the equipment receiving the fuel.'
  if (!details.project_id) return 'Select the project using this fuel.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(details.expense_date) || Number.isNaN(Date.parse(details.expense_date)) || new Date(details.expense_date).toISOString().slice(0, 10) !== details.expense_date) return 'Enter a valid fuel date.'
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return 'The recorded expense amount must be positive.'
  const quantity = Number(details.quantity_liters)
  const rate = Number(details.rate_per_liter)
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Enter the quantity filled in litres.'
  if (!Number.isFinite(rate) || rate <= 0) return 'Enter the unit price per litre.'
  if (!details.station_name?.trim()) return 'Enter the fuel station or supplier name.'
  if (!['petrol_pump', 'vendor_supply', 'company_bowser', 'company_tank'].includes(details.fuel_source)) return 'Select the fuel source.'
  if (details.meter_reading !== '' && (!Number.isFinite(Number(details.meter_reading)) || Number(details.meter_reading) < 0)) return 'Enter a valid meter reading.'
  // Sources store litres and rates to three decimals. Allow their rounding error.
  const tolerance = Math.max(0.02, quantity * 0.0005 + rate * 0.0005)
  if (Math.abs(quantity * rate - Number(amount)) > tolerance + 1e-8) return 'Litres × unit price must match the recorded expense amount. Check the receipt.'
  return null
}

export function canCompleteFuelCapture(capture, role, userId) {
  return FUEL_DETAIL_STATUSES.has(capture.status) && capture.approval_case?.status !== 'in_review'
    && (['admin', 'accounts'].includes(role) || (Boolean(userId) && capture.created_by === userId))
}

export async function completeFuelCapture(db, capture, details, submit = true) {
  const validation = validateFuelCaptureDetails(details, capture.total_amount)
  if (validation) throw new Error(validation)
  const { data, error } = await db.rpc('complete_fuel_expense_capture', {
    p_capture_id: capture.id,
    p_details: { ...details, station_name: details.station_name.trim(), bill_number: details.bill_number.trim() || null },
    p_submit: submit,
  })
  if (error) throw error
  return data
}
