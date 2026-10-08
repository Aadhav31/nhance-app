// Daily reports use the date an action happened, never the document's business date.
export const ACTIVITY_TIME_ZONE = 'Asia/Kolkata'
export const ACTIVITY_BASIS = 'All saved database changes across every section, including approvals and deletions, plus recorded application events such as sign-in and sign-out. Unsaved actions and screen views are not recorded. Credential fields are redacted.'
export const ACTIVITY_SECTIONS = ['Fleet', 'Fuel & Reconciliation', 'Operations', 'Field Expenses', 'Equipment Health', 'Inventory & Stores', 'Clients', 'Projects', 'BOQ', 'RA Billing', 'Hire & Deployments', 'Sales & Billing', 'Purchases & Vendors', 'Accounts & Finance', 'Expense Planner', 'HR & Payroll', 'Reimbursements', 'Crusher & Production', 'Approval Centre', 'Notifications', 'Chat', 'Assistant', 'Sticky Notes', 'Reports', 'Administration', 'Authentication', 'Other / System']

const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: ACTIVITY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
export function activityDate(value = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function validActivityDate(value) {
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value || '') && activityDate(`${value}T00:00:00+05:30`) === value
}
export function shiftActivityDate(value, days) {
  if (!validActivityDate(value)) throw new Error('Choose a valid activity date.')
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}
export function activityBounds(date) {
  if (!validActivityDate(date)) throw new Error('Choose a valid activity date.')
  return { start: new Date(`${date}T00:00:00+05:30`).toISOString(), end: new Date(`${shiftActivityDate(date, 1)}T00:00:00+05:30`).toISOString() }
}
export function activityMonthBounds(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('Choose a valid activity month.')
  const [year, number] = month.split('-').map(Number)
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
  return { start: activityBounds(`${month}-01`).start, end: activityBounds(`${next}-01`).start }
}
export function activityMonthDays(month) {
  const { end } = activityMonthBounds(month)
  const last = shiftActivityDate(activityDate(end), -1)
  return Array.from({ length: Number(last.slice(-2)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}
export function activityTimestamp(value) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: ACTIVITY_TIME_ZONE, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value))
}
const title = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
export function activitySection(event) {
  const table = event.source === 'application_event' ? '' : event.table_name || ''
  const match = pattern => pattern.test(table)
  if (match(/^(approval_|asset_transfer_requests)/)) return 'Approval Centre'
  if (match(/^notification/)) return 'Notifications'
  if (match(/^field_expense/)) return 'Field Expenses'
  if (match(/^(fuel_|shift_fuel_)/)) return 'Fuel & Reconciliation'
  if (match(/^(equipment_deployment|equipment_assignments|hire_|inward_hire)/)) return 'Hire & Deployments'
  if (match(/^(equipment|vehicles)/)) return 'Fleet'
  if (match(/^(maintenance|pm_|job_card|breakdown_|lifecycle_)/)) return 'Equipment Health'
  if (match(/^(hr_|attendance|salary_|operator_)/)) return 'HR & Payroll'
  if (match(/^employee_reimbursements/)) return 'Reimbursements'
  if (match(/^(inventory|stock_|stores|item_)/)) return 'Inventory & Stores'
  if (match(/^boq_/)) return 'BOQ'
  if (match(/^ra_bill/)) return 'RA Billing'
  if (match(/^(project|sites$)/)) return 'Projects'
  if (match(/^client_billing_locations$|^clients$/)) return 'Clients'
  if (match(/^(purchase_order|po_|bill|vendor)/)) return 'Purchases & Vendors'
  if (match(/^(invoice|client_invoice|sales_order|so_|quotes|quote_|delivery_challan|dc_|credit_note|cn_)/)) return 'Sales & Billing'
  if (match(/^expense_plans/)) return 'Expense Planner'
  if (match(/^(account_|chart_of_accounts|expenses|fixed_expense|payment_|payments|payroll_postings)/)) return 'Accounts & Finance'
  if (match(/^crusher_/)) return 'Crusher & Production'
  if (match(/^(shifts|shift_|daily_operations|deleted_operations)/)) return 'Operations'
  if (match(/^chat_/)) return 'Chat'
  if (match(/^assistant_/)) return 'Assistant'
  if (match(/^sticky_notes/)) return 'Sticky Notes'
  if (match(/^(companies|company_|user_|subscription_|document_)/)) return 'Administration'
  // Unknown tables and future modules are always included, never discarded.
  return ({ auth: 'Authentication', administration: 'Administration', approvals: 'Approval Centre', equipment: 'Fleet', equipment_health: 'Equipment Health', finance: 'Accounts & Finance', hr: 'HR & Payroll', inventory: 'Inventory & Stores', operations: 'Operations', projects: 'Projects', purchases: 'Purchases & Vendors', purchase: 'Purchases & Vendors', sales: 'Sales & Billing', clients: 'Clients', crusher: 'Crusher & Production', ra_billing: 'RA Billing', field_expense: 'Field Expenses', hire_contract: 'Hire & Deployments', boq: 'BOQ', settings: 'Administration', reports: 'Reports' })[event.module] || 'Other / System'
}
export function activityAction(event) {
  return ({ insert: 'Created', created: 'Created', update: 'Updated', updated: 'Updated', delete: 'Deleted', deleted: 'Deleted', login: 'Signed in', logout: 'Signed out' })[event.action] || title(event.action || event.operation || 'Event')
}
export function activityReference(event) {
  const row = event.new_data || event.old_data || {}
  return [row.invoice_number, row.bill_number, row.po_number, row.jc_number, row.ra_number, row.contract_number, row.equipment_number, row.employee_number, row.project_name, row.business_name, row.name, event.record_ref, event.record_id].find(v => v != null && v !== '') || JSON.stringify(event.record_pk || {})
}
// The ledger redacts top-level credentials. Downloads also redact nested keys.
export function redactActivity(value) {
  if (Array.isArray(value)) return value.map(redactActivity)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /password|secret|token|api[_-]?key|private[_-]?key|authorization|cookie/i.test(key) ? '[REDACTED]' : redactActivity(item)]))
  return value
}
export const activityValue = value => value === undefined ? '[not present]' : JSON.stringify(value)
export function activityFields(event) {
  return [...new Set([...Object.keys(event.old_data || {}), ...Object.keys(event.new_data || {}), ...(event.changed_fields || [])])].sort()
}
export function filterActivity(events, filters = {}) {
  const search = (filters.search || '').trim().toLowerCase()
  return events.filter(event => (!filters.section || activitySection(event) === filters.section)
    && (!filters.actor || (event.actor_id || 'system') === filters.actor)
    && (!filters.action || event.action === filters.action)
    && (!filters.source || event.source === filters.source)
    && (!search || [event.event_no, activitySection(event), activityAction(event), activityReference(event), event.actor_name, event.actor_role, event.table_name, event.description, ...(event.changed_fields || [])].join(' ').toLowerCase().includes(search)))
}
export function activitySectionCounts(events) {
  const counts = Object.fromEntries(ACTIVITY_SECTIONS.map(section => [section, 0]))
  for (const event of events) counts[activitySection(event)]++
  return counts
}

const PAGE_SIZE = 500
const scoped = (db, companyId, bounds, columns, count = false) => db.from('audit_logs').select(columns, count ? { count: 'exact' } : undefined).eq('company_id', companyId).gte('created_at', bounds.start).lt('created_at', bounds.end)
// Capture a high-water mark once, then walk the immutable company sequence.
// API row caps, concurrent new events and pages beyond 1,000 cannot truncate it.
export async function fetchActivityRange(db, companyId, bounds, { summary = false, signal } = {}) {
  if (!companyId) throw new Error('Select a company to view activity.')
  const withSignal = query => signal ? query.abortSignal(signal) : query
  const head = await withSignal(scoped(db, companyId, bounds, 'event_no', true).order('event_no', { ascending: false }).limit(1))
  if (head.error) throw new Error(`Activity report: ${head.error.message}`)
  const expected = head.count
  if (!Number.isSafeInteger(expected) || expected < 0) throw new Error('Unable to confirm the complete activity count. Please retry.')
  const highWater = head.data?.[0]?.event_no
  if (expected === 0 && !head.data?.length) return { events: [], highWater: null, total: 0, loadedAt: new Date().toISOString() }
  if (!Number.isSafeInteger(highWater) || highWater < 1) throw new Error('Unable to confirm the activity snapshot. Please retry.')
  const events = [], seen = new Set()
  let cursor = 0
  while (events.length < expected) {
    const page = await withSignal(scoped(db, companyId, bounds, summary ? 'id,event_no,created_at,company_id' : '*').gt('event_no', cursor).lte('event_no', highWater).order('event_no', { ascending: true }).limit(PAGE_SIZE))
    if (page.error) throw new Error(`Activity report: ${page.error.message}`)
    if (!page.data?.length) throw new Error('The activity report is incomplete. Refresh and try again; downloads have been blocked.')
    for (const event of page.data) {
      if (!event.id || seen.has(event.id) || !Number.isSafeInteger(event.event_no) || event.event_no <= cursor || event.event_no > highWater || event.company_id !== companyId || !(Date.parse(event.created_at) >= Date.parse(bounds.start) && Date.parse(event.created_at) < Date.parse(bounds.end))) throw new Error('Activity snapshot mismatch. Refresh and try again.')
      seen.add(event.id); cursor = event.event_no; events.push(redactActivity(event))
    }
    if (events.length > expected) throw new Error('Activity count mismatch. Refresh and try again.')
  }
  return { events, highWater, total: expected, loadedAt: new Date().toISOString() }
}
export async function fetchActivityStart(db, companyId, signal) {
  let query = db.from('audit_logs').select('created_at').eq('company_id', companyId).order('created_at', { ascending: true }).limit(1)
  if (signal) query = query.abortSignal(signal)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return result.data?.[0]?.created_at || null
}
