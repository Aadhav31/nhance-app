export const PM_FILTERS = ['all', 'action_due', 'overdue', 'due_soon', 'work_order', 'on_track']

const dayKey = value => {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function classifyPmSchedule(schedule, equipment, now = new Date()) {
  const currentMeter = Number(equipment?.current_meter_reading || 0)
  const nextMeter = schedule?.next_due_meter == null ? null : Number(schedule.next_due_meter)
  const alertHours = Math.max(0, Number(schedule?.alert_before_hours ?? 50))
  const hoursRemaining = nextMeter == null ? null : nextMeter - currentMeter
  const dueDate = dayKey(schedule?.next_due_date)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysRemaining = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000) : null
  const openJob = schedule?.openJob || null

  let state = 'on_track'
  if (openJob) state = 'work_order'
  else if ((hoursRemaining != null && hoursRemaining <= 0) || (daysRemaining != null && daysRemaining < 0)) state = 'overdue'
  else if ((hoursRemaining != null && hoursRemaining <= alertHours) || (daysRemaining != null && daysRemaining <= 14)) state = 'due_soon'

  const interval = Math.max(1, Number(schedule?.interval_hours || 1))
  const hoursSinceService = Math.max(0, currentMeter - Number(schedule?.last_done_meter || 0))
  const progress = Math.min(100, Math.max(0, Math.round((hoursSinceService / interval) * 100)))

  return { state, currentMeter, nextMeter, alertHours, hoursRemaining, daysRemaining, openJob, progress }
}

export function summarizePmSchedules(rows = []) {
  return rows.reduce((summary, row) => {
    summary.total += 1
    summary[row.pm.state] += 1
    return summary
  }, { total: 0, overdue: 0, due_soon: 0, work_order: 0, on_track: 0 })
}

export function filterPmSchedules(rows = [], state = 'all', search = '') {
  const needle = search.trim().toLowerCase()
  return rows.filter(row => {
    if (state === 'action_due' && !['overdue', 'due_soon', 'work_order'].includes(row.pm.state)) return false
    if (!['all', 'action_due'].includes(state) && row.pm.state !== state) return false
    if (!needle) return true
    return [row.schedule_name, row.equipment?.name, row.equipment?.equipment_number]
      .some(value => value?.toLowerCase().includes(needle))
  })
}

export function schedulePayload(form, companyId, equipment) {
  const interval = Number(form.interval_hours)
  const lastMeter = Number(form.last_done_meter || equipment?.current_meter_reading || 0)
  const explicitNext = form.next_due_meter === '' || form.next_due_meter == null
    ? null
    : Number(form.next_due_meter)
  return {
    company_id: companyId,
    equipment_id: form.equipment_id,
    equipment_name: equipment?.name || null,
    schedule_name: form.schedule_name.trim(),
    interval_hours: interval,
    alert_before_hours: Number(form.alert_before_hours || 0),
    last_done_meter: lastMeter,
    last_done_date: form.last_done_date || null,
    next_due_meter: explicitNext ?? lastMeter + interval,
    next_due_date: form.next_due_date || null,
    auto_create_job_card: Boolean(form.auto_create_job_card),
    tasks: String(form.tasks_text || '')
      .split('\n').map(task => task.trim()).filter(Boolean)
      .map(task => ({ task, required: true })),
    notes: form.notes.trim() || null,
    is_active: true,
  }
}

export function validateScheduleForm(form) {
  if (!form.equipment_id) return 'Select equipment'
  if (!form.schedule_name?.trim()) return 'Enter a schedule name'
  if (!(Number(form.interval_hours) > 0)) return 'Service interval must be greater than zero'
  if (Number(form.alert_before_hours) < 0) return 'Alert hours cannot be negative'
  return null
}
