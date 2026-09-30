const EXCLUDED_STATUSES = new Set(['draft', 'cancelled', 'canceled', 'converted', 'void'])
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
const money = value => Math.round((Number(value) || 0) * 100)
const amount = value => value / 100

export function localReportDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toISOString().slice(0, 10) === value ? date.getTime() / 86400000 : null
}

function uniqueIndex(items, values) {
  const index = new Map()
  for (const item of items) {
    for (const value of new Set(values(item).map(normalize).filter(Boolean))) {
      if (!index.has(value)) index.set(value, item)
      else if (index.get(value)?.id !== item.id) index.set(value, null)
    }
  }
  return index
}

/** Invoice snapshots remain usable when a client/project has been renamed or removed. */
export function buildInvoiceReceivables(invoices, clients = [], projects = [], today = localReportDate(), { includeProforma = false } = {}) {
  const clientsByGstin = uniqueIndex(clients, c => [c.gstin])
  const clientsByName = uniqueIndex(clients, c => [c.business_name, c.display_name, c.trade_name, c.contact_name])
  const projectsById = new Map(projects.map(p => [p.id, p]))
  const projectsByName = uniqueIndex(projects, p => [p.project_name])
  // Bridge legacy invoices without GSTIN only when their exact name identifies one GSTIN.
  const invoiceGstins = uniqueIndex(invoices.filter(i => normalize(i.client_gstin)).map(i => ({
    id: normalize(i.client_gstin), name: i.client_name,
  })), i => [i.name])
  const currentDay = dayNumber(today)
  const convertedProformaIds = new Set(invoices.map(i => i.converted_from_id).filter(Boolean))
  return invoices.filter(i => !EXCLUDED_STATUSES.has(normalize(i.status))
    && (normalize(i.invoice_type) !== 'proforma' || (includeProforma && !convertedProformaIds.has(i.id))))
    .map(i => {
      const gstin = normalize(i.client_gstin)
      // The live client_invoices table stores client snapshots, not a client_id column.
      const client = gstin ? clientsByGstin.get(gstin) : clientsByName.get(normalize(i.client_name))
      const legacyGstin = !gstin && invoiceGstins.get(normalize(i.client_name))?.id
      const clientKey = client ? `client:${client.id}` : gstin || legacyGstin ? `gstin:${gstin || legacyGstin}` : `name:${normalize(i.client_name) || i.id}`
      const project = i.project_id ? projectsById.get(i.project_id) : projectsByName.get(normalize(i.project_name))
      const projectKey = i.project_id ? `project:${i.project_id}` : project ? `project:${project.id}` : normalize(i.project_name) ? `project-name:${clientKey}:${normalize(i.project_name)}` : 'unassigned'
      const billedCents = Math.max(0, money(i.total_amount))
      const receivedCents = Math.max(0, money(i.paid_amount))
      const balanceCents = Math.max(0, billedCents - receivedCents)
      const dueDay = dayNumber(i.due_date)
      const daysOverdue = balanceCents > 0 && dueDay !== null && currentDay !== null ? Math.max(0, currentDay - dueDay) : 0
      return {
        id: i.id, invoiceNumber: i.invoice_number || '—', invoiceDate: i.invoice_date || '', dueDate: i.due_date || '',
        isProforma: normalize(i.invoice_type) === 'proforma',
        documentType: normalize(i.invoice_type) === 'proforma' ? 'Proforma' : normalize(i.invoice_type) === 'non_tax' ? 'Non-tax invoice' : 'Tax invoice',
        clientKey, clientName: client?.display_name || client?.business_name || i.client_name || 'Unspecified client',
        gstin: i.client_gstin || client?.gstin || '', projectKey,
        projectName: project?.project_name || i.project_name || 'Unassigned project', projectCode: project?.project_code || '',
        billed: amount(billedCents), received: amount(receivedCents), balance: amount(balanceCents),
        overdue: daysOverdue > 0 ? amount(balanceCents) : 0, daysOverdue,
        status: balanceCents === 0 ? 'Paid' : daysOverdue > 0 ? 'Overdue' : receivedCents > 0 ? 'Partial' : 'Unpaid',
      }
    }).sort((a, b) => b.balance - a.balance || a.invoiceNumber.localeCompare(b.invoiceNumber))
}

export function invoiceReceivablesBasis(includeProforma = false) {
  return includeProforma
    ? 'Issued invoices and unconverted proformas less recorded payments. Drafts, cancelled invoices and converted proformas are excluded.'
    : 'Issued invoices less recorded payments. Drafts, proformas and cancelled invoices are excluded.'
}

export function filterInvoiceReceivables(rows, { client = '', project = '', status = 'outstanding', from = '', to = '', search = '' } = {}) {
  const query = normalize(search)
  return rows.filter(r => (!client || r.clientKey === client) && (!project || r.projectKey === project)
    && (status === 'all' || (status === 'paid' ? r.balance === 0 : status === 'overdue' ? r.overdue > 0 : r.balance > 0))
    && (!from || (r.invoiceDate && r.invoiceDate >= from)) && (!to || (r.invoiceDate && r.invoiceDate <= to))
    && (!query || normalize([r.invoiceNumber, r.clientName, r.gstin, r.projectName, r.projectCode].join(' ')).includes(query)))
}

export function sumInvoiceReceivables(rows) {
  const cents = rows.reduce((sum, r) => {
    for (const key of ['billed', 'received', 'balance', 'overdue']) sum[key] += money(r[key])
    return sum
  }, { billed: 0, received: 0, balance: 0, overdue: 0 })
  return Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, amount(value)]))
}

/** Sales totals include issued invoices and open proformas, using the report's balance rules. */
export function salesInvoiceOverview(invoices) {
  return sumInvoiceReceivables(buildInvoiceReceivables(invoices, [], [], localReportDate(), { includeProforma: true }))
}

export function groupInvoiceReceivables(rows, view) {
  const groups = new Map()
  for (const row of rows) {
    const key = view === 'client' ? row.clientKey : row.projectKey
    if (!groups.has(key)) groups.set(key, { key, clientName: row.clientName, projectName: row.projectName, projectCode: row.projectCode, invoices: [], clientNames: new Set() })
    const group = groups.get(key)
    group.invoices.push(row)
    group.clientNames.add(row.clientName)
  }
  return [...groups.values()].map(g => ({
    ...g, clientName: view === 'project' ? [...g.clientNames].sort().join(', ') : g.clientName,
    count: g.invoices.length, ...sumInvoiceReceivables(g.invoices),
  })).sort((a, b) => b.balance - a.balance || (a.clientName + a.projectName).localeCompare(b.clientName + b.projectName))
}

const financialColumns = [
  { key: 'billed', label: 'Billed (INR)', numeric: true },
  { key: 'received', label: 'Collected (INR)', numeric: true },
  { key: 'balance', label: 'Outstanding (INR)', numeric: true },
  { key: 'overdue', label: 'Overdue (INR)', numeric: true },
]

/** A shared table model keeps screen, PDF and Excel totals identical. */
export function invoiceReceivablesTable(rows, view = 'invoice') {
  const grouped = view === 'invoice' ? rows : groupInvoiceReceivables(rows, view)
  const columns = view === 'invoice' ? [
    { key: 'invoiceNumber', label: 'Invoice' }, { key: 'documentType', label: 'Type' },
    { key: 'clientName', label: 'Client' }, { key: 'projectName', label: 'Project' },
    { key: 'invoiceDate', label: 'Invoice date' }, { key: 'dueDate', label: 'Due date' }, ...financialColumns,
    { key: 'daysOverdue', label: 'Days overdue', count: true }, { key: 'status', label: 'Status' },
  ] : [
    ...(view === 'project' ? [{ key: 'projectName', label: 'Project' }] : []),
    { key: 'clientName', label: view === 'project' ? 'Clients' : 'Client' }, { key: 'count', label: 'Invoices', count: true }, ...financialColumns,
  ]
  return { columns, rows: grouped, totals: sumInvoiceReceivables(rows) }
}

/** Fetch every company row; the Data API may cap each response below the requested page size. */
export async function fetchReceivablesRows(db, table, columns, companyId) {
  if (!companyId) throw new Error('Select a company before loading invoices.')
  const rows = []
  let expected = null
  do {
    const { data, error, count } = await db.from(table).select(columns, { count: 'exact' })
      .eq('company_id', companyId).order('id', { ascending: true }).range(rows.length, rows.length + 499)
    if (error) throw error
    if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('Could not confirm the complete invoice report. Please refresh.')
    if (expected !== null && count !== expected) throw new Error('Billing data changed while loading. Please refresh the report.')
    expected = count
    if (!data.length && rows.length < expected) throw new Error('The invoice report is incomplete. Please refresh.')
    rows.push(...data)
  } while (rows.length < expected)
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('Billing data changed while loading. Please refresh the report.')
  return rows
}
