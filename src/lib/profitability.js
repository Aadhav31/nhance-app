const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const round = (value, precision = 2) => {
  const scale = 10 ** precision
  return Math.round((number(value) + Number.EPSILON) * scale) / scale
}

export const PROFITABILITY_METRICS = {
  ALL: 'all',
  REVENUE: 'revenue',
  COST: 'cost',
  PROFIT: 'profit',
  LOSS_MAKING: 'loss_making',
  NEEDS_ALLOCATION: 'needs_allocation',
}

export function rowNeedsAllocation(row, dimension = 'project') {
  if (row.evidence_status && row.evidence_status !== 'complete') return true
  return dimension === 'equipment' ? !row.equipment_id : !row.project_id
}

export function buildProfitabilityReport(rows = [], entities = [], dimension = 'project') {
  const idField = dimension === 'equipment' ? 'equipment_id' : 'project_id'
  const entityById = new Map(entities.map(entity => [entity.id, entity]))
  const grouped = new Map()

  const ensureGroup = id => {
    if (!grouped.has(id)) {
      const entity = entityById.get(id) || { id }
      grouped.set(id, {
        id,
        name: dimension === 'equipment'
          ? entity.name || 'Unknown equipment'
          : entity.project_name || 'Unknown project',
        code: dimension === 'equipment'
          ? entity.equipment_number || entity.registration_number || ''
          : entity.project_code || '',
        status: entity.status || '',
        revenue: 0,
        cost: 0,
        profit: 0,
        marginPct: null,
        evidenceCount: 0,
        gapCount: 0,
        sourceTypes: new Set(),
      })
    }
    return grouped.get(id)
  }

  const summary = rows.reduce((totals, row) => {
    const amount = number(row.amount)
    if (row.entry_type === 'revenue') {
      totals.revenue += amount
      totals.cashCollected += number(row.metadata?.cash_collected)
    }
    if (row.entry_type === 'cost') totals.cost += amount
    if (rowNeedsAllocation(row, dimension)) {
      totals.needsAllocationCount += 1
      totals.needsAllocationAmount += amount
    }

    const entityId = row[idField]
    if (!entityId) return totals
    const item = ensureGroup(entityId)
    if (row.entry_type === 'revenue') item.revenue += amount
    if (row.entry_type === 'cost') item.cost += amount
    item.evidenceCount += 1
    item.gapCount += Number(rowNeedsAllocation(row, dimension))
    item.sourceTypes.add(row.source_type)
    return totals
  }, {
    revenue: 0,
    cost: 0,
    cashCollected: 0,
    needsAllocationCount: 0,
    needsAllocationAmount: 0,
  })

  const entityRows = [...grouped.values()].map(item => {
    const revenue = round(item.revenue)
    const cost = round(item.cost)
    const profit = round(revenue - cost)
    return {
      ...item,
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? round((profit / revenue) * 100, 1) : null,
      sourceTypes: [...item.sourceTypes].sort(),
    }
  }).sort((a, b) => a.profit - b.profit || b.revenue - a.revenue || a.name.localeCompare(b.name))

  const revenue = round(summary.revenue)
  const cost = round(summary.cost)
  const profit = round(revenue - cost)
  const allocatedRevenue = round(entityRows.reduce((sum, item) => sum + item.revenue, 0))
  const allocatedCost = round(entityRows.reduce((sum, item) => sum + item.cost, 0))

  return {
    entities: entityRows,
    summary: {
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? round((profit / revenue) * 100, 1) : null,
      cashCollected: round(summary.cashCollected),
      needsAllocationCount: summary.needsAllocationCount,
      needsAllocationAmount: round(summary.needsAllocationAmount),
      lossMakingCount: entityRows.filter(item => item.profit < 0).length,
      profitableCount: entityRows.filter(item => item.profit >= 0).length,
      allocatedRevenue,
      allocatedCost,
      unallocatedRevenue: round(Math.max(0, revenue - allocatedRevenue)),
      unallocatedCost: round(Math.max(0, cost - allocatedCost)),
    },
  }
}

export function filterProfitabilityRows(rows = [], {
  dimension = 'project',
  metric = PROFITABILITY_METRICS.ALL,
  entityId = 'all',
  category = 'all',
  search = '',
  lossEntityIds = [],
} = {}) {
  const idField = dimension === 'equipment' ? 'equipment_id' : 'project_id'
  const lossIds = new Set(lossEntityIds)
  const needle = search.trim().toLowerCase()

  return rows.filter(row => {
    if (entityId !== 'all' && row[idField] !== entityId) return false
    if (category !== 'all' && row.category !== category && row.source_type !== category) return false
    if (metric === PROFITABILITY_METRICS.REVENUE && row.entry_type !== 'revenue') return false
    if (metric === PROFITABILITY_METRICS.COST && row.entry_type !== 'cost') return false
    if (metric === PROFITABILITY_METRICS.NEEDS_ALLOCATION && !rowNeedsAllocation(row, dimension)) return false
    if (metric === PROFITABILITY_METRICS.LOSS_MAKING && !lossIds.has(row[idField])) return false

    if (needle) {
      const haystack = [
        row.reference,
        row.description,
        row.category,
        row.source_type,
        row.project_name,
        row.equipment_name,
        row.equipment_number,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })
}

export function filterProfitabilityEntities(entities = [], metric = PROFITABILITY_METRICS.ALL) {
  if (metric === PROFITABILITY_METRICS.REVENUE) return entities.filter(item => item.revenue > 0)
  if (metric === PROFITABILITY_METRICS.COST) return entities.filter(item => item.cost > 0)
  if (metric === PROFITABILITY_METRICS.LOSS_MAKING) return entities.filter(item => item.profit < 0)
  if (metric === PROFITABILITY_METRICS.NEEDS_ALLOCATION) return entities.filter(item => item.gapCount > 0)
  return entities
}

export function groupProfitabilityTrend(rows = []) {
  const buckets = new Map()
  rows.forEach(row => {
    const month = String(row.entry_date || '').slice(0, 7)
    if (!month) return
    if (!buckets.has(month)) buckets.set(month, { month, revenue: 0, cost: 0, profit: 0 })
    const bucket = buckets.get(month)
    if (row.entry_type === 'revenue') bucket.revenue += number(row.amount)
    if (row.entry_type === 'cost') bucket.cost += number(row.amount)
    bucket.profit = bucket.revenue - bucket.cost
  })
  return [...buckets.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(item => ({
      ...item,
      revenue: round(item.revenue),
      cost: round(item.cost),
      profit: round(item.profit),
    }))
}
