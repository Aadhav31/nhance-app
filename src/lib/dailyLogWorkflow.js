export const DAILY_LOG_STATUSES = ['working', 'idle', 'breakdown', 'maintenance']
export const IDLE_REASONS = [
  { value: 'no_work_available', label: 'No work available' },
  { value: 'operator_absent', label: 'Operator absent' },
  { value: 'waiting_for_material', label: 'Waiting for material' },
  { value: 'minor_repair', label: 'Minor repair / adjustment' },
  { value: 'weather', label: 'Weather / site conditions' },
  { value: 'other', label: 'Other' },
]

const numberOrNull = value => value === '' || value == null ? null : Number(value)

export function validateDailyLogEntry(entry) {
  const errors = []
  if (!entry?.equipment_id) errors.push('Equipment is required')
  if (!DAILY_LOG_STATUSES.includes(entry?.status)) errors.push('Select a valid status')
  const hours = numberOrNull(entry?.running_hours)
  const fuel = numberOrNull(entry?.fuel_consumed)
  const meter = numberOrNull(entry?.meter_reading)
  if (entry?.status === 'working' && hours == null) errors.push('Running hours are required for working equipment')
  if (hours != null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) errors.push('Running hours must be between 0 and 24')
  if (fuel != null && (!Number.isFinite(fuel) || fuel < 0)) errors.push('Fuel cannot be negative')
  if (meter != null && (!Number.isFinite(meter) || meter < 0)) errors.push('Meter cannot be negative')
  if (entry?.status === 'idle' && !entry?.idle_reason) errors.push('Idle reason is required')
  return errors
}

export function toDailyLogPayload(entry, opsDate, shiftType) {
  return {
    equipment_id: entry.equipment_id,
    project_id: entry.project_id || null,
    ops_date: opsDate,
    shift_type: shiftType,
    status: entry.status,
    running_hours: numberOrNull(entry.running_hours),
    fuel_consumed: numberOrNull(entry.fuel_consumed),
    meter_reading: numberOrNull(entry.meter_reading),
    operator_name: entry.operator_name?.trim() || null,
    activity: entry.activity?.trim() || null,
    idle_reason: entry.status === 'idle' ? entry.idle_reason || null : null,
    notes: entry.notes?.trim() || null,
    meter_photo_url: entry.meter_photo_url || null,
    logsheet_photo_url: entry.logsheet_photo_url || null,
  }
}

export function dailyLogProgress(rows) {
  return rows.reduce((summary, row) => {
    const workflow = row.existing?.workflow_status
    summary.expected += 1
    if (!row.existing) summary.missing += 1
    if (workflow === 'draft' || workflow === 'rejected') summary.draft += 1
    if (workflow === 'submitted') summary.submitted += 1
    if (workflow === 'approved') summary.approved += 1
    return summary
  }, { expected: 0, missing: 0, draft: 0, submitted: 0, approved: 0 })
}
