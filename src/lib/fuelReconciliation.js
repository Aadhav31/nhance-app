const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const round = (value, precision = 1) => {
  const scale = 10 ** precision
  return Math.round((number(value) + Number.EPSILON) * scale) / scale
}

const dateKey = value => value ? String(value).slice(0, 10) : null

function deploymentForDate(deployments, equipmentId, date) {
  return deployments.find(item =>
    item.equipment_id === equipmentId &&
    item.deployed_date <= date &&
    (!item.withdrawn_date || item.withdrawn_date >= date)
  )
}

function duplicateFillIds(fills) {
  const groups = new Map()
  fills.forEach(fill => {
    const date = dateKey(fill.entry_time || fill.created_at)
    if (!fill.equipment_id || !date) return
    const invoice = String(fill.invoice_number || '').trim().toLowerCase()
    const quantity = round(fill.quantity_liters, 2).toFixed(2)
    const signature = invoice
      ? `${fill.equipment_id}|${date}|invoice:${invoice}`
      : `${fill.equipment_id}|${date}|qty:${quantity}`
    if (!groups.has(signature)) groups.set(signature, [])
    groups.get(signature).push(fill)
  })

  const duplicateIds = new Set()
  groups.forEach(items => {
    if (items.length < 2) return
    items.slice(1).forEach(item => duplicateIds.add(item.id))
  })
  return duplicateIds
}

function weightedAverageRate(fills, replenishments) {
  let cost = 0
  let litres = 0
  ;[...fills, ...replenishments].forEach(item => {
    const quantity = number(item.quantity_liters)
    const total = number(item.total_amount)
    const rate = number(item.rate_per_liter ?? item.rate_per_litre)
    if (quantity <= 0 || (total <= 0 && rate <= 0)) return
    litres += quantity
    cost += total > 0 ? total : quantity * rate
  })
  return litres > 0 ? cost / litres : 0
}

function rowKey(equipmentId, date, projectId) {
  return `${equipmentId}|${date}|${projectId || '__none__'}`
}

export function buildFuelReconciliation({
  equipment = [], projects = [], deployments = [], operations = [], issues = [], fills = [], replenishments = [],
}) {
  const equipmentById = Object.fromEntries(equipment.map(item => [item.id, item]))
  const projectsById = Object.fromEntries(projects.map(item => [item.id, item]))
  const duplicateIds = duplicateFillIds(fills)
  const globalRate = weightedAverageRate(fills, replenishments)
  const buckets = new Map()

  const projectFor = (equipmentId, date, explicitProjectId = null) => {
    if (explicitProjectId) return explicitProjectId
    const deployment = deploymentForDate(deployments, equipmentId, date)
    return deployment?.project_id || equipmentById[equipmentId]?.current_project_id || null
  }

  const ensureBucket = (equipmentId, date, explicitProjectId = null) => {
    if (!equipmentId || !date) return null
    const projectId = projectFor(equipmentId, date, explicitProjectId)
    const key = rowKey(equipmentId, date, projectId)
    if (!buckets.has(key)) {
      buckets.set(key, {
        key, date, equipmentId, projectId,
        operations: [], issues: [], fills: [],
      })
    }
    return buckets.get(key)
  }

  operations.forEach(operation => {
    if (operation.workflow_status && operation.workflow_status !== 'approved') return
    const bucket = ensureBucket(operation.equipment_id, dateKey(operation.ops_date), operation.project_id)
    if (bucket) bucket.operations.push(operation)
  })
  issues.forEach(issue => {
    const bucket = ensureBucket(issue.equipment_id, dateKey(issue.issue_date))
    if (bucket) bucket.issues.push(issue)
  })
  fills.forEach(fill => {
    const bucket = ensureBucket(fill.equipment_id, dateKey(fill.entry_time || fill.created_at))
    if (bucket) bucket.fills.push(fill)
  })

  const rows = [...buckets.values()].map(bucket => {
    const machine = equipmentById[bucket.equipmentId] || { id: bucket.equipmentId, name: 'Unknown machine' }
    const project = projectsById[bucket.projectId] || null
    const hours = bucket.operations.reduce((sum, item) => sum + number(item.running_hours), 0)
    const consumedLitres = bucket.operations.reduce((sum, item) => sum + number(item.fuel_consumed), 0)
    const issuedLitres = bucket.issues.reduce((sum, item) => sum + number(item.quantity_liters), 0)
    const filledLitres = bucket.fills.reduce((sum, item) => sum + number(item.quantity_liters), 0)
    const suppliedLitres = issuedLitres > 0 ? issuedLitres : filledLitres
    const supplySource = issuedLitres > 0 ? 'issue_register' : filledLitres > 0 ? 'operator_fill' : 'none'
    const benchmarkRate = number(machine.specific_consumption_lph)
    const expectedLitres = hours > 0 && benchmarkRate > 0 ? hours * benchmarkRate : null
    const actualForEfficiency = consumedLitres > 0 ? consumedLitres : suppliedLitres
    const actualRate = hours > 0 && actualForEfficiency > 0 ? actualForEfficiency / hours : null
    const balanceVariance = consumedLitres > 0 && suppliedLitres > 0 ? suppliedLitres - consumedLitres : null
    const benchmarkVariance = expectedLitres !== null && actualForEfficiency > 0
      ? actualForEfficiency - expectedLitres
      : null
    const projectRate = number(project?.hsd_rate_per_liter)
    const rowRate = weightedAverageRate(bucket.fills, []) || projectRate || globalRate
    const unaccountedLitres = balanceVariance === null ? 0 : Math.max(0, balanceVariance)
    const excessLitres = benchmarkVariance === null ? 0 : Math.max(0, benchmarkVariance)
    const costImpact = Math.max(unaccountedLitres, excessLitres) * rowRate
    const duplicateCount = bucket.fills.filter(item => duplicateIds.has(item.id)).length
    const missingMeterCount = [
      ...bucket.issues.filter(item => item.meter_at_issue == null),
      ...bucket.fills.filter(item => item.meter_at_filling == null && item.km_at_filling == null),
    ].length
    const missingRateCount = bucket.fills.filter(item =>
      number(item.rate_per_liter) <= 0 && number(item.total_amount) <= 0
    ).length
    const flags = []
    const balanceTolerance = Math.max(5, suppliedLitres * 0.05)
    const benchmarkTolerance = expectedLitres === null ? 0 : Math.max(5, expectedLitres * 0.1)

    if (suppliedLitres > 0 && consumedLitres <= 0) flags.push('missing_consumption_log')
    if (hours > 0 && actualForEfficiency > 0 && benchmarkRate <= 0) flags.push('missing_benchmark')
    if (duplicateCount > 0) flags.push('duplicate_entry')
    if (missingMeterCount > 0) flags.push('missing_meter')
    if (missingRateCount > 0) flags.push('missing_rate')
    if (issuedLitres > 0 && filledLitres > 0 && Math.abs(issuedLitres - filledLitres) > Math.max(5, issuedLitres * 0.05)) {
      flags.push('issue_fill_mismatch')
    }
    if (balanceVariance !== null && balanceVariance > balanceTolerance) flags.push('unaccounted')
    if (benchmarkVariance !== null && benchmarkVariance > benchmarkTolerance) flags.push('over_standard')
    if (balanceVariance !== null && balanceVariance < -balanceTolerance) flags.push('over_reported')

    const dataGap = flags.some(flag => [
      'missing_consumption_log', 'missing_benchmark', 'duplicate_entry', 'missing_meter', 'missing_rate', 'issue_fill_mismatch',
    ].includes(flag))
    const risk = flags.includes('unaccounted') || flags.includes('over_standard')

    return {
      ...bucket,
      equipment: machine,
      project,
      projectName: project?.project_name || machine.current_site_name || 'No project assigned',
      hours: round(hours),
      consumedLitres: round(consumedLitres),
      issuedLitres: round(issuedLitres),
      filledLitres: round(filledLitres),
      suppliedLitres: round(suppliedLitres),
      supplySource,
      benchmarkRate: benchmarkRate || null,
      expectedLitres: expectedLitres === null ? null : round(expectedLitres),
      actualRate: actualRate === null ? null : round(actualRate, 2),
      actualRateSource: consumedLitres > 0 ? 'consumption' : suppliedLitres > 0 ? 'supply' : null,
      balanceVariance: balanceVariance === null ? null : round(balanceVariance),
      benchmarkVariance: benchmarkVariance === null ? null : round(benchmarkVariance),
      averageRate: rowRate ? round(rowRate, 2) : null,
      costImpact: round(costImpact, 2),
      duplicateCount,
      missingMeterCount,
      missingRateCount,
      flags,
      dataGap,
      risk,
      reconciled: suppliedLitres > 0 && consumedLitres > 0 && !risk && !dataGap,
    }
  }).sort((a, b) => b.date.localeCompare(a.date) || b.costImpact - a.costImpact || a.equipment.name.localeCompare(b.equipment.name))

  const summary = rows.reduce((totals, row) => {
    totals.suppliedLitres += row.suppliedLitres
    totals.consumedLitres += row.consumedLitres
    totals.expectedLitres += row.expectedLitres || 0
    totals.operatingHours += row.hours
    totals.unaccountedLitres += row.flags.includes('unaccounted') ? Math.max(0, row.balanceVariance || 0) : 0
    totals.excessLitres += row.flags.includes('over_standard') ? Math.max(0, row.benchmarkVariance || 0) : 0
    totals.financialExposure += row.costImpact
    totals.dataGapRows += Number(row.dataGap)
    totals.riskRows += Number(row.risk)
    totals.reconciledRows += Number(row.reconciled)
    totals.duplicateEntries += row.duplicateCount
    return totals
  }, {
    suppliedLitres: 0, consumedLitres: 0, expectedLitres: 0, operatingHours: 0,
    unaccountedLitres: 0, excessLitres: 0, financialExposure: 0,
    dataGapRows: 0, riskRows: 0, reconciledRows: 0, duplicateEntries: 0,
  })

  const comparableRows = rows.filter(row => row.suppliedLitres > 0 && row.consumedLitres > 0)
  return {
    rows,
    summary: {
      ...Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, round(value, key === 'financialExposure' ? 2 : 1)])),
      comparableRows: comparableRows.length,
      reconciliationRate: comparableRows.length
        ? Math.round((comparableRows.filter(row => row.reconciled).length / comparableRows.length) * 100)
        : null,
      averageRate: globalRate ? round(globalRate, 2) : null,
    },
  }
}

export function filterFuelReconciliationRows(rows, {
  metric = 'all', equipmentId = 'all', projectId = 'all', search = '',
} = {}) {
  const needle = search.trim().toLowerCase()
  return rows.filter(row => {
    if (equipmentId !== 'all' && row.equipmentId !== equipmentId) return false
    if (projectId !== 'all' && row.projectId !== projectId) return false
    if (needle) {
      const haystack = [
        row.equipment.name, row.equipment.equipment_number, row.equipment.registration_number,
        row.equipment.category, row.projectName, row.date,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    if (metric === 'supply') return row.suppliedLitres > 0
    if (metric === 'unaccounted') return row.flags.includes('unaccounted')
    if (metric === 'over_standard') return row.flags.includes('over_standard')
    if (metric === 'cost_impact') return row.costImpact > 0
    if (metric === 'data_gaps') return row.dataGap
    if (metric === 'duplicates') return row.duplicateCount > 0
    if (metric === 'reconciled') return row.reconciled
    return true
  })
}

export function groupFuelRowsByDate(rows) {
  const byDate = new Map()
  rows.forEach(row => {
    if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date, supplied: 0, consumed: 0, expected: 0 })
    const item = byDate.get(row.date)
    item.supplied += row.suppliedLitres
    item.consumed += row.consumedLitres
    item.expected += row.expectedLitres || 0
  })
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => ({ ...item, supplied: round(item.supplied), consumed: round(item.consumed), expected: round(item.expected) }))
}
