// Contract terms are applied only when explicitly recorded. The snapshot returned here
// is saved with the Sales invoice so a reviewer can reconstruct each calculation.
const round = value => Math.round((value + Number.EPSILON) * 100) / 100
const number = value => Number(value) || 0
const sunday = date => new Date(`${date}T12:00:00Z`).getUTCDay() === 0

export function calculateUsageBill({ deployment, contract, operations = [], periodFrom, periodTo, adjustment = null }) {
  if (!deployment || !periodFrom || !periodTo || periodFrom > periodTo) throw new Error('Select a valid billing period')
  const from = [periodFrom, deployment.deployed_date, contract?.start_date].filter(Boolean).sort().at(-1)
  const to = [periodTo, deployment.withdrawn_date, contract?.end_date].filter(Boolean).sort()[0]
  if (from > to) return { lines: [], subtotal: 0, exceptions: ['Deployment and contract do not overlap this period'], operations: [] }

  const rules = contract?.billing_rules || {}
  const excludeSundays = rules.exclude_sundays === true
  const billIdle = rules.bill_idle_days === true
  const deductBreakdown = rules.deduct_breakdown_days === true
  const basis = contract?.billing_basis || deployment.billing_basis
  const rate = contract ? number(contract.rate) : number(basis === 'hourly' ? deployment.rate_per_hour : basis === 'daily' ? deployment.rate_per_day : deployment.rate_per_month)
  const all = operations.filter(op => op.ops_date >= from && op.ops_date <= to && (!contract || !op.hire_contract_id || op.hire_contract_id === contract.id) && (!deployment.project_id || !op.project_id || op.project_id === deployment.project_id))
  const eligible = all.filter(op => !excludeSundays || !sunday(op.ops_date))
  const work = eligible.filter(op => op.status === 'working')
  const days = new Set(work.map(op => op.ops_date))
  const idleDays = new Set(eligible.filter(op => op.status === 'idle').map(op => op.ops_date))
  const breakdownDays = new Set(eligible.filter(op => op.status === 'breakdown').map(op => op.ops_date))
  const hours = round(work.reduce((sum, op) => sum + number(op.running_hours), 0))
  const fuel = round(all.reduce((sum, op) => sum + number(op.fuel_consumed), 0))
  const exceptions = []
  if (!contract) exceptions.push('No matching signed hire contract selected; deployment rates used')
  if (!all.length) exceptions.push('No daily operations recorded in this billing period')
  if (all.some(op => op.workflow_status !== 'approved')) exceptions.push('Some daily logs are not approved')
  if (all.some(op => !op.logsheet_photo_url)) exceptions.push('Some daily logs have no attached logsheet')
  if (all.length !== operations.filter(op => op.ops_date >= periodFrom && op.ops_date <= periodTo).length) exceptions.push('Some logs fall outside this deployment, contract, or project')
  if (basis === 'hourly' && contract?.overtime_rate && !deployment.max_hours_per_day) exceptions.push('Overtime rate set but no daily overtime threshold is configured')

  const lines = []
  const addLine = (description, quantity, unit, unitRate, amount = round(quantity * unitRate)) => {
    if (amount !== 0) lines.push({ description, quantity: round(quantity), unit, rate: round(unitRate), amount: round(amount) })
  }
  if (basis === 'hourly') {
    const threshold = number(deployment.max_hours_per_day)
    const min = number(contract?.minimum_hours_per_day)
    const byDate = new Map()
    work.forEach(op => byDate.set(op.ops_date, (byDate.get(op.ops_date) || 0) + number(op.running_hours)))
    let regularHours = 0, overtimeHours = 0
    for (const h of byDate.values()) {
      const metered = Math.max(h, min)
      if (threshold && contract?.overtime_rate) {
        regularHours += Math.min(metered, threshold)
        overtimeHours += Math.max(0, metered - threshold)
      } else regularHours += metered
    }
    addLine('Hire: regular hours', regularHours, 'hrs', rate)
    addLine('Hire: overtime hours', overtimeHours, 'hrs', number(contract?.overtime_rate))
  } else if (basis === 'daily') {
    addLine('Hire: working days', days.size, 'days', rate)
    addLine('Hire: agreed billable idle days', [...idleDays].filter(date => !days.has(date)).length * Number(billIdle), 'days', rate)
  } else if (basis === 'monthly') {
    const [y, m] = periodFrom.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const dates = Array.from({ length: lastDay }, (_, i) => `${periodFrom.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`)
    const fullEligible = dates.filter(date => !excludeSundays || !sunday(date)).length
    const activeEligible = dates.filter(date => date >= from && date <= to && (!excludeSundays || !sunday(date))).length
    const fraction = activeEligible / fullEligible
    addLine(`Hire: ${activeEligible} of ${fullEligible} eligible calendar days`, fraction, 'month', rate, round(rate * fraction))
    if (deductBreakdown) {
      const monthlyDays = number(rules.working_days_per_month) || number(deployment.working_days_per_month) || 26
      const count = [...breakdownDays].filter(date => !days.has(date)).length
      addLine('Agreed breakdown deduction', count, 'days', -rate / monthlyDays, -round(count * rate / monthlyDays))
    }
  } else exceptions.push('Billing basis must be hourly, daily, or monthly')

  if (adjustment?.description && number(adjustment.amount)) {
    addLine(`Reviewed adjustment: ${adjustment.description.trim()}`, 1, 'nos', number(adjustment.amount))
  }
  const subtotal = round(lines.reduce((sum, line) => sum + line.amount, 0))
  if (!rate) exceptions.push('A billable rate is required')
  if (subtotal <= 0) exceptions.push('Net billable amount must be positive')

  return {
    basis, rate, from, to, hours, fuel, workingDays: days.size,
    idleDays: idleDays.size, breakdownDays: breakdownDays.size,
    lines, subtotal, exceptions,
    rules: { exclude_sundays: excludeSundays, bill_idle_days: billIdle, deduct_breakdown_days: deductBreakdown, working_days_per_month: number(rules.working_days_per_month) || number(deployment.working_days_per_month) || 26 },
    operations: all.map(op => ({ id: op.id, date: op.ops_date, shift: op.shift_type, status: op.status, hours: number(op.running_hours), fuel: number(op.fuel_consumed), workflow: op.workflow_status || 'unreviewed', logsheet: Boolean(op.logsheet_photo_url) })),
  }
}
