export const PENDING_PLAN_STATUSES = ['planned', 'confirmed']
export const BLOCKED_EQUIPMENT_STATUSES = ['breakdown', 'maintenance', 'disposed']

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function addDateDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

// Return/mobilisation dates are inclusive: a machine is reusable the next day.
export function datesOverlap(startA, endA, startB, endB) {
  return Boolean(startA && startB && startA <= (endB || '9999-12-31') && startB <= (endA || '9999-12-31'))
}

export function deploymentEnd(deployment, today = localDateKey()) {
  if (deployment.status !== 'active') return deployment.withdrawn_date || deployment.deployed_date
  // An overdue machine is not assumed returned just because its forecast passed.
  if (!deployment.expected_return_date || deployment.expected_return_date < today) return null
  return deployment.expected_return_date
}

export function bookingConflicts(equipment, deployments, plans, start, end, excludePlanId = null, today = localDateKey()) {
  if (!equipment || !start || !end || end < start) return []
  const conflicts = []
  if (BLOCKED_EQUIPMENT_STATUSES.includes(equipment.status)) {
    conflicts.push({ type: 'equipment', message: `Machine is ${equipment.status}; update its condition before booking.` })
  }
  const active = deployments.filter(item => item.equipment_id === equipment.id && item.status === 'active')
  if (equipment.current_project_id && active.length === 0) {
    conflicts.push({ type: 'equipment', message: 'Machine is assigned to a project without a deployment record. Resolve its current assignment first.' })
  }
  for (const item of deployments.filter(item => item.equipment_id === equipment.id)) {
    if (datesOverlap(start, end, item.deployed_date, deploymentEnd(item, today))) {
      conflicts.push({ type: 'deployment', item, message: item.status === 'active' ? 'Dates overlap an active deployment. Record its expected return first, or choose another machine.' : 'Dates overlap a recorded deployment. Its return day is reserved too; choose a later date.' })
    }
  }
  for (const item of plans) {
    if (item.id !== excludePlanId && item.equipment_id === equipment.id && PENDING_PLAN_STATUSES.includes(item.status) &&
        datesOverlap(start, end, item.mobilisation_date, item.expected_return_date)) {
      conflicts.push({ type: 'plan', item, message: 'Dates overlap an existing planned/confirmed booking.' })
    }
  }
  return conflicts
}

export function equipmentPlanningState(equipment, deployments, plans, start, end, today = localDateKey()) {
  const current = deployments.find(item => item.equipment_id === equipment.id && item.status === 'active') || null
  const bookings = plans.filter(item => item.equipment_id === equipment.id && PENDING_PLAN_STATUSES.includes(item.status) &&
    datesOverlap(start, end, item.mobilisation_date, item.expected_return_date))
  const onSite = deployments.some(item => item.equipment_id === equipment.id && datesOverlap(start, end, item.deployed_date, deploymentEnd(item, today)))
  const overdue = current?.expected_return_date && current.expected_return_date < today
  const returnDue = current?.expected_return_date && current.expected_return_date <= addDateDays(today, 7)
  let status = 'available'
  if (BLOCKED_EQUIPMENT_STATUSES.includes(equipment.status)) status = 'unavailable'
  else if (onSite || (equipment.current_project_id && !current)) status = returnDue ? 'return_due' : 'deployed'
  else if (bookings.length) status = 'planned'
  return { equipment, current, bookings, status, overdue: Boolean(overdue), returnDue: Boolean(returnDue) }
}

export function agreedRateAmount(rate, basis) {
  const value = basis === 'monthly' ? rate.rate_per_month : basis === 'daily' ? rate.rate_per_day : rate.rate_per_hour
  return Number(value ?? rate.rate ?? 0)
}

export function plannerDayState(row, date, deployments, today = localDateKey()) {
  if (BLOCKED_EQUIPMENT_STATUSES.includes(row.equipment.status)) return { status: 'unavailable', projectId: null }
  const deployment = deployments.find(item => item.equipment_id === row.equipment.id &&
    datesOverlap(date, date, item.deployed_date, deploymentEnd(item, today)))
  if (deployment) return { status: deployment.status === 'active' && row.returnDue ? 'return_due' : 'deployed', projectId: deployment.project_id }
  if (row.equipment.current_project_id && !row.current) return { status: 'deployed', projectId: row.equipment.current_project_id }
  const plan = row.bookings.find(item => datesOverlap(date, date, item.mobilisation_date, item.expected_return_date))
  if (plan) return { status: 'planned', projectId: plan.project_id, plan }
  return { status: 'available', projectId: null }
}
