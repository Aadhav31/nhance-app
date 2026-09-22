const ACTIVE_PLAN_STATUSES = new Set(['planned', 'confirmed', 'mobilised', 'completed'])

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function dateKeys(startDate, endDate) {
  if (!startDate || !endDate || endDate < startDate) return []
  const dates = []
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) dates.push(date)
  return dates
}

function deploymentCoversDate(deployment, date, today) {
  if (!deployment?.deployed_date || deployment.deployed_date > date || date > today) return false
  const end = deployment.withdrawn_date || (deployment.status === 'active' ? today : deployment.deployed_date)
  return date <= end
}

function planCoversDate(plan, date) {
  return ACTIVE_PLAN_STATUSES.has(plan.status) && plan.mobilisation_date <= date && date <= plan.expected_return_date
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value, precision = 1) {
  const scale = 10 ** precision
  return Math.round(value * scale) / scale
}

export function buildOperationsIntelligence({
  equipment = [], deployments = [], plans = [], operations = [], projects = [],
  startDate, endDate, today = endDate, targetHoursPerDay = 8,
}) {
  const dates = dateKeys(startDate, endDate).filter(date => date <= today)
  const projectsById = Object.fromEntries(projects.map(project => [project.id, project]))
  const deploymentsByEquipment = new Map()
  const plansByEquipment = new Map()
  const operationsByEquipment = new Map()

  deployments.forEach(item => {
    if (!deploymentsByEquipment.has(item.equipment_id)) deploymentsByEquipment.set(item.equipment_id, [])
    deploymentsByEquipment.get(item.equipment_id).push(item)
  })
  plans.forEach(item => {
    if (!plansByEquipment.has(item.equipment_id)) plansByEquipment.set(item.equipment_id, [])
    plansByEquipment.get(item.equipment_id).push(item)
  })
  operations.forEach(item => {
    if (!item.equipment_id) return
    if (!operationsByEquipment.has(item.equipment_id)) operationsByEquipment.set(item.equipment_id, [])
    operationsByEquipment.get(item.equipment_id).push(item)
  })

  const rows = equipment.map(machine => {
    const machineDeployments = deploymentsByEquipment.get(machine.id) || []
    const machinePlans = plansByEquipment.get(machine.id) || []
    const machineOperations = operationsByEquipment.get(machine.id) || []
    const deploymentByDate = new Map()
    const plannedDates = new Set()

    dates.forEach(date => {
      const deployment = machineDeployments.find(item => deploymentCoversDate(item, date, today))
      if (deployment) deploymentByDate.set(date, deployment)
      if (machinePlans.some(item => planCoversDate(item, date))) plannedDates.add(date)
    })

    const logsByDate = new Map()
    machineOperations.forEach(operation => {
      if (!operation.ops_date || operation.ops_date < startDate || operation.ops_date > endDate) return
      if (!logsByDate.has(operation.ops_date)) logsByDate.set(operation.ops_date, [])
      logsByDate.get(operation.ops_date).push(operation)
    })

    const deployedDates = [...deploymentByDate.keys()]
    const loggedDates = [...logsByDate.keys()]
    const loggedDeploymentDates = deployedDates.filter(date => logsByDate.has(date))
    const missingDates = deployedDates.filter(date => !logsByDate.has(date))
    const flatLogs = [...logsByDate.values()].flat()
    const operatingHours = flatLogs.reduce((sum, item) => sum + number(item.running_hours), 0)
    const fuelConsumed = flatLogs.reduce((sum, item) => sum + number(item.fuel_consumed), 0)
    const idleDates = new Set(flatLogs.filter(item => item.status === 'idle').map(item => item.ops_date))
    const breakdownDates = new Set(flatLogs.filter(item => item.status === 'breakdown').map(item => item.ops_date))
    const utilisation = deployedDates.length ? (operatingHours / (deployedDates.length * targetHoursPerDay)) * 100 : 0
    const coverage = deployedDates.length ? (loggedDeploymentDates.length / deployedDates.length) * 100 : 0
    const overdueDeployments = machineDeployments.filter(item =>
      item.status === 'active' && !item.withdrawn_date && item.expected_return_date && item.expected_return_date < today
    )

    const projectIds = new Set()
    deploymentByDate.forEach(item => item.project_id && projectIds.add(item.project_id))
    machinePlans.forEach(item => {
      if (dates.some(date => planCoversDate(item, date)) && item.project_id) projectIds.add(item.project_id)
    })
    flatLogs.forEach(item => item.project_id && projectIds.add(item.project_id))

    const latestDeployment = [...deploymentByDate.values()].sort((a, b) =>
      (b.deployed_date || '').localeCompare(a.deployed_date || '')
    )[0]
    const latestProjectId = latestDeployment?.project_id || flatLogs.find(item => item.project_id)?.project_id || machine.current_project_id || null
    if (latestProjectId) projectIds.add(latestProjectId)
    const project = projectsById[latestProjectId] || null
    const projectNames = [...projectIds].map(id => projectsById[id]?.project_name).filter(Boolean)

    return {
      equipment: machine,
      project,
      projectIds: [...projectIds],
      projectNames,
      plannedDays: plannedDates.size,
      deployedDays: deployedDates.length,
      loggedDays: loggedDates.length,
      loggedDeploymentDays: loggedDeploymentDates.length,
      missingLogDays: missingDates.length,
      missingDates,
      operatingHours: round(operatingHours),
      fuelConsumed: round(fuelConsumed),
      idleDays: idleDates.size,
      breakdownDays: breakdownDates.size,
      utilisation: round(utilisation),
      coverage: round(coverage),
      fuelPerHour: operatingHours ? round(fuelConsumed / operatingHours, 2) : null,
      lowUtilisation: deployedDates.length > 0 && operatingHours / deployedDates.length < targetHoursPerDay / 2,
      overdueReturn: overdueDeployments.length > 0,
      expectedReturnDate: overdueDeployments.sort((a, b) =>
        (a.expected_return_date || '').localeCompare(b.expected_return_date || '')
      )[0]?.expected_return_date || null,
    }
  })

  return rows.sort((a, b) =>
    Number(b.overdueReturn) - Number(a.overdueReturn) ||
    b.missingLogDays - a.missingLogDays ||
    Number(b.lowUtilisation) - Number(a.lowUtilisation) ||
    a.equipment.name.localeCompare(b.equipment.name)
  )
}

export function filterOperationsRows(rows, { metric = 'all', projectId = 'all', search = '' } = {}) {
  const term = search.trim().toLowerCase()
  return rows.filter(row => {
    if (projectId !== 'all' && !row.projectIds.includes(projectId)) return false
    if (term) {
      const haystack = [
        row.equipment.name, row.equipment.equipment_number, row.equipment.category,
        ...row.projectNames, row.project?.site_name,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(term)) return false
    }
    if (metric === 'deployed') return row.deployedDays > 0
    if (metric === 'missing_logs') return row.missingLogDays > 0
    if (metric === 'hours') return row.operatingHours > 0
    if (metric === 'fuel') return row.fuelConsumed > 0
    if (metric === 'low_utilisation') return row.lowUtilisation
    if (metric === 'overdue_returns') return row.overdueReturn
    if (metric === 'idle') return row.idleDays > 0
    if (metric === 'logged') return row.loggedDays > 0
    return true
  })
}

export function summariseOperationsRows(rows) {
  const totals = rows.reduce((summary, row) => ({
    plannedDays: summary.plannedDays + row.plannedDays,
    deployedDays: summary.deployedDays + row.deployedDays,
    loggedDeploymentDays: summary.loggedDeploymentDays + row.loggedDeploymentDays,
    missingLogDays: summary.missingLogDays + row.missingLogDays,
    operatingHours: summary.operatingHours + row.operatingHours,
    fuelConsumed: summary.fuelConsumed + row.fuelConsumed,
    lowUtilisationMachines: summary.lowUtilisationMachines + Number(row.lowUtilisation),
    overdueReturns: summary.overdueReturns + Number(row.overdueReturn),
  }), {
    plannedDays: 0, deployedDays: 0, loggedDeploymentDays: 0, missingLogDays: 0,
    operatingHours: 0, fuelConsumed: 0, lowUtilisationMachines: 0, overdueReturns: 0,
  })
  return {
    ...totals,
    operatingHours: round(totals.operatingHours),
    fuelConsumed: round(totals.fuelConsumed),
    logCoverage: totals.deployedDays ? Math.round((totals.loggedDeploymentDays / totals.deployedDays) * 100) : 0,
  }
}
