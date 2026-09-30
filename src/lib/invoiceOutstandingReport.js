const POSTED_RECEIVABLE_STATUSES = new Set(['sent', 'partial', 'overdue'])

const number = value => Number(value) || 0

function dateOnlyUtc(value) {
  if (!value) return null
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return Date.UTC(year, month - 1, day)
}

function ageingFor(dueDate, asOfDate) {
  const due = dateOnlyUtc(dueDate)
  const asOf = dateOnlyUtc(asOfDate)
  if (!due || !asOf || due >= asOf) {
    return { daysOverdue: 0, ageingBucket: 'not_due', ageingLabel: 'Not due' }
  }

  const daysOverdue = Math.floor((asOf - due) / 86_400_000)
  if (daysOverdue <= 30) return { daysOverdue, ageingBucket: '1_30', ageingLabel: '1–30 days' }
  if (daysOverdue <= 60) return { daysOverdue, ageingBucket: '31_60', ageingLabel: '31–60 days' }
  if (daysOverdue <= 90) return { daysOverdue, ageingBucket: '61_90', ageingLabel: '61–90 days' }
  return { daysOverdue, ageingBucket: '90_plus', ageingLabel: '90+ days' }
}

export function buildOutstandingInvoiceRows(invoices = [], asOfDate = new Date().toISOString().slice(0, 10)) {
  return invoices
    .filter(invoice => invoice.invoice_type !== 'proforma')
    .filter(invoice => POSTED_RECEIVABLE_STATUSES.has(invoice.status))
    .map(invoice => {
      const totalAmount = number(invoice.total_amount)
      const paidAmount = Math.max(0, number(invoice.paid_amount))
      const outstanding = Math.max(0, totalAmount - paidAmount)
      return {
        ...invoice,
        clientName: invoice.client_name?.trim() || 'Unknown client',
        projectName: invoice.project_name?.trim() || 'Unassigned / General',
        totalAmount,
        paidAmount,
        outstanding,
        ...ageingFor(invoice.due_date, asOfDate),
      }
    })
    .filter(invoice => invoice.outstanding > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstanding - a.outstanding)
}

export function summarizeOutstandingInvoices(rows = []) {
  return rows.reduce((summary, row) => {
    summary.invoices += 1
    summary.billed += row.totalAmount
    summary.paid += row.paidAmount
    summary.outstanding += row.outstanding
    if (row.daysOverdue > 0) summary.overdue += row.outstanding
    else summary.notDue += row.outstanding
    summary.clients.add(row.client_id || row.clientName.toLowerCase())
    summary.projects.add(row.project_id || row.projectName.toLowerCase())
    return summary
  }, {
    invoices: 0,
    billed: 0,
    paid: 0,
    outstanding: 0,
    overdue: 0,
    notDue: 0,
    clients: new Set(),
    projects: new Set(),
  })
}

export function groupOutstandingInvoices(rows = [], dimension = 'client') {
  const isProject = dimension === 'project'
  const groups = new Map()

  rows.forEach(row => {
    const id = isProject ? row.project_id : row.client_id
    const name = isProject ? row.projectName : row.clientName
    const key = id || `name:${name.toLowerCase()}`
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name,
        invoiceCount: 0,
        billed: 0,
        paid: 0,
        notDue: 0,
        overdue: 0,
        outstanding: 0,
        oldestDueDate: null,
        maxDaysOverdue: 0,
        invoiceIds: [],
      })
    }
    const group = groups.get(key)
    group.invoiceCount += 1
    group.billed += row.totalAmount
    group.paid += row.paidAmount
    group.outstanding += row.outstanding
    group.invoiceIds.push(row.id)
    if (row.daysOverdue > 0) group.overdue += row.outstanding
    else group.notDue += row.outstanding
    group.maxDaysOverdue = Math.max(group.maxDaysOverdue, row.daysOverdue)
    if (row.due_date && (!group.oldestDueDate || row.due_date < group.oldestDueDate)) {
      group.oldestDueDate = row.due_date
    }
  })

  return [...groups.values()].sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name))
}

export function filterOutstandingInvoices(rows = [], filters = {}) {
  const query = String(filters.search || '').trim().toLowerCase()
  return rows.filter(row => {
    if (query && ![row.invoice_number, row.clientName, row.projectName]
      .some(value => String(value || '').toLowerCase().includes(query))) return false
    if (filters.client && row.clientName !== filters.client) return false
    if (filters.project && row.projectName !== filters.project) return false
    if (filters.ageing && filters.ageing !== 'all' && row.ageingBucket !== filters.ageing) return false
    return true
  })
}
