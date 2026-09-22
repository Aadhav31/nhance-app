import { calculateUsageBill } from '../../src/lib/usageBilling.js'
import { canAccessPage } from '../../src/lib/navigation.js'

const CATALOG = {
  equipment: { table: 'equipment', page: 'fleet', module: 'fleet_management', fields: 'id,equipment_number,name,category,status,current_meter_reading,updated_at', search: ['name', 'equipment_number'], title: r => `${r.equipment_number} · ${r.name}`, extra: r => ({ equipmentId: r.id }) },
  projects: { table: 'projects', page: 'projects', module: 'clients_projects', fields: 'id,project_code,project_name,status,site_name,start_date,expected_end_date', search: ['project_name', 'project_code'], title: r => `${r.project_code || 'Project'} · ${r.project_name}`, extra: r => ({ projectId: r.id }) },
  clients: { table: 'clients', page: 'clients', module: 'clients_projects', fields: 'id,client_code,display_name,business_name,status,payment_terms', search: ['display_name', 'business_name'], title: r => `${r.client_code || 'Client'} · ${r.display_name || r.business_name}`, extra: () => ({}) },
  invoices: { table: 'client_invoices', page: 'sales', module: 'sales', fields: 'id,invoice_number,invoice_date,due_date,client_name,project_name,total_amount,balance_due,status,invoice_type', search: ['invoice_number', 'client_name'], title: r => `${r.invoice_number} · ${r.client_name}`, extra: r => ({ tab: 'invoices', invoiceId: r.id }) },
  job_cards: { table: 'job_cards', page: 'maintenance', module: 'maintenance', fields: 'id,jc_number,equipment_name,jc_type,status,complaint,opened_date,priority', search: ['jc_number', 'equipment_name'], title: r => `${r.jc_number} · ${r.equipment_name}`, extra: () => ({ tab: 'workshop' }) },
  daily_logs: { table: 'daily_operations', page: 'operations', module: 'daily_operations', fields: 'id,ops_date,equipment_name,status,running_hours,fuel_consumed,workflow_status', search: ['equipment_name'], title: r => `${r.ops_date} · ${r.equipment_name}`, extra: r => ({ from: r.ops_date, to: r.ops_date }) },
  contracts: { table: 'hire_contracts', page: 'hire_contracts', module: 'clients_projects', fields: 'id,contract_number,client_name,equipment_name,status,start_date,end_date,billing_basis,rate', search: ['contract_number', 'client_name'], title: r => `${r.contract_number} · ${r.client_name}`, extra: () => ({}) },
}

export function accessibleCatalog(ctx) {
  return Object.fromEntries(Object.entries(CATALOG).filter(([, c]) => canAccessPage(c.page, { role: ctx.role, hasModule: key => ctx.modules.includes(key) })))
}

const asSource = (catalog, row) => ({ id: row.id, label: catalog.title(row), page: catalog.page, extra: catalog.extra(row) })
const fail = error => ({ error })

export async function searchRecords(ctx, { entity, query = '' }) {
  const catalog = accessibleCatalog(ctx)[entity]
  if (!catalog) return fail('This record type is unavailable to your role or company.')
  const term = String(query).trim().slice(0, 70)
  let request = ctx.db.from(catalog.table).select(catalog.fields).eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(12)
  if (term) {
    const escaped = term.replace(/[%,().\\]/g, '').replace(/\s+/g, ' ').trim()
    if (escaped) request = request.or(catalog.search.map(field => `${field}.ilike.%${escaped}%`).join(','))
  }
  const { data, error } = await request
  if (error) return fail('Could not verify these records right now.')
  return { entity, rows: (data || []).map(r => ({ ...r, source: asSource(catalog, r) })), countShown: data?.length || 0, limited: (data?.length || 0) === 12 }
}

export async function verifyInvoice(ctx, { invoiceNumber }) {
  const catalog = accessibleCatalog(ctx).invoices
  if (!catalog) return fail('Sales invoices are unavailable to your role or company.')
  const number = String(invoiceNumber || '').trim().slice(0, 100)
  if (!number) return fail('Provide an invoice number to verify.')
  const { data: rows, error } = await ctx.db.from('client_invoices').select('id,invoice_number,invoice_date,due_date,client_name,project_name,subtotal,discount_amount,taxable_amount,cgst_amount,sgst_amount,igst_amount,total_amount,paid_amount,balance_due,status,invoice_type,billing_deployment_id,billing_snapshot,billing_period_from,billing_period_to').eq('company_id', ctx.companyId).eq('invoice_number', number).limit(2)
  if (error) return fail('Could not verify this invoice right now.')
  if (!rows?.length) return { found: false, invoiceNumber: number }
  const invoice = rows[0]
  const { data: lines, error: linesError } = await ctx.db.from('invoice_line_items').select('id,description,quantity,rate,amount').eq('company_id', ctx.companyId).eq('invoice_id', invoice.id).limit(101)
  if (linesError || lines?.length === 101) return fail('Invoice items could not be checked completely; open Sales to review it.')
  const concerns = []
  if (!invoice.client_name) concerns.push('Client name is missing')
  if (!invoice.invoice_date) concerns.push('Invoice date is missing')
  if (!Number.isFinite(Number(invoice.total_amount)) || Number(invoice.total_amount) <= 0) concerns.push('Amount is missing or nonpositive')
  if (invoice.due_date && invoice.invoice_date && invoice.due_date < invoice.invoice_date) concerns.push('Due date precedes invoice date')
  if (Number(invoice.balance_due) > Number(invoice.total_amount)) concerns.push('Balance exceeds invoice total')
  if (!lines?.length) concerns.push('No invoice line items are recorded')
  if ((lines || []).some(line => !line.description || !Number.isFinite(Number(line.amount)) || Math.abs(Number(line.quantity) * Number(line.rate) - Number(line.amount)) > 0.02)) concerns.push('One or more line item amounts or descriptions need review')
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
  if (lines?.length && Math.abs(round(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0)) - Number(invoice.subtotal || 0)) > 0.02) concerns.push('Line item sum differs from invoice subtotal')
  if (Math.abs(round(Number(invoice.subtotal || 0) - Number(invoice.discount_amount || 0)) - Number(invoice.taxable_amount || 0)) > 0.02) concerns.push('Taxable amount differs from subtotal less discount')
  if (Math.abs(round(Number(invoice.taxable_amount || 0) + Number(invoice.cgst_amount || 0) + Number(invoice.sgst_amount || 0) + Number(invoice.igst_amount || 0)) - Number(invoice.total_amount || 0)) > 0.02) concerns.push('Invoice total differs from taxable amount plus tax')
  if (Math.abs(round(Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0))) - Number(invoice.balance_due || 0)) > 0.02) concerns.push('Balance differs from total less payments')
  if (invoice.billing_deployment_id && !invoice.billing_snapshot) concerns.push('Usage billing calculation snapshot is missing')
  const { billing_snapshot: snapshot, ...fields } = invoice
  return { found: true, invoice: fields, lineItemCount: lines?.length || 0, hasBillingSnapshot: Boolean(snapshot), concerns, verdict: concerns.length ? 'Needs review' : 'Arithmetic and basic fields verified; tax classification, approvals and legal compliance require human review', source: asSource(catalog, invoice) }
}

export async function verifyUsageBilling(ctx, { deploymentId, month }) {
  if (!canAccessPage('usage_billing', { role: ctx.role, hasModule: key => ctx.modules.includes(key) })) return fail('Usage billing is unavailable to your role or company.')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') || !/^[0-9a-f-]{36}$/i.test(deploymentId || '')) return fail('Provide a deployment ID and month in YYYY-MM format.')
  const from = `${month}-01`, to = `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`
  const { data: deployment, error: depError } = await ctx.db.from('equipment_deployments').select('id,equipment_id,client_id,project_id,deployed_date,withdrawn_date,billing_basis,rate_per_hour,rate_per_day,rate_per_month,max_hours_per_day,working_days_per_month').eq('company_id', ctx.companyId).eq('id', deploymentId).maybeSingle()
  if (depError || !deployment) return fail('Deployment not found in your company.')
  const [{ data: contracts, error: contractError }, { data: operations, error: opsError }, { data: invoices, error: invError }] = await Promise.all([
    ctx.db.from('hire_contracts').select('id,contract_number,status,equipment_id,client_id,project_id,start_date,end_date,billing_basis,rate,minimum_hours_per_day,overtime_rate,gst_applicable,gst_rate,billing_rules').eq('company_id', ctx.companyId).eq('equipment_id', deployment.equipment_id).eq('client_id', deployment.client_id).lte('start_date', to).in('status', ['active', 'completed']).limit(100),
    ctx.db.from('daily_operations').select('id,ops_date,shift_type,status,running_hours,fuel_consumed,workflow_status,logsheet_photo_url,hire_contract_id,project_id').eq('company_id', ctx.companyId).eq('equipment_id', deployment.equipment_id).gte('ops_date', from).lte('ops_date', to).limit(500),
    ctx.db.from('client_invoices').select('id,invoice_number,status').eq('company_id', ctx.companyId).eq('billing_deployment_id', deploymentId).eq('billing_period_from', from).eq('billing_period_to', to).neq('status', 'cancelled').limit(2),
  ])
  if (contractError || opsError || invError) return fail('Billing data could not be checked right now.')
  if ((operations || []).length === 500 || (contracts || []).length === 100) return fail('Too many records for a safe check; review this period in Usage Billing.')
  const candidates = (contracts || []).filter(c => (!c.project_id || c.project_id === deployment.project_id) && (!c.end_date || c.end_date >= from))
  if (candidates.length > 1) return { verdict: 'Multiple applicable contracts: select one in Usage Billing before calculating', contractNumbers: candidates.map(c => c.contract_number), source: { id: deploymentId, label: 'Usage Billing', page: 'usage_billing', extra: {} } }
  const bill = calculateUsageBill({ deployment, contract: candidates[0] || null, operations: operations || [], periodFrom: from, periodTo: to })
  return { deploymentId, month, contract: candidates[0]?.contract_number || null, existingInvoice: invoices?.[0] || null, basis: bill.basis, subtotal: bill.subtotal, hours: bill.hours, lines: bill.lines, exceptions: bill.exceptions, source: { id: deploymentId, label: 'Review in Usage Billing', page: 'usage_billing', extra: { deploymentId, month } }, verdict: invoices?.length ? 'Already invoiced' : bill.exceptions.length ? 'Needs review' : 'Estimate ready for human review; no invoice has been created' }
}

export function workflowHelp(ctx, { page }) {
  const entries = {
    control_tower: 'Use the fleet status tiles to inspect matching machines. Check Attention required for open job cards, upcoming service, idle assets and expiring documents.',
    fleet: 'Open an equipment record to review its documents, service, deployment and meter history. Use the status filter to find specific assets.',
    maintenance: 'Equipment Health holds job cards and preventive maintenance. Review the machine, complaint, priority and status before changing a job card.',
    operations: 'Record the correct equipment, date, shift, hours, fuel and logsheet; a reviewer then approves the daily entry.',
    usage_billing: 'Select a deployment and billing month, choose its applicable hire contract, check logs and exceptions, then review and generate the invoice. The invoice appears in Sales.',
    sales: 'Sales → Invoices is the source for invoice entry, review and PDF export. Verify client details, line items, tax and dates before issuing.',
    dashboard: 'Use dashboard cards to open their underlying modules, then inspect individual records before acting.',
  }
  if (!canAccessPage(page, { role: ctx.role, hasModule: key => ctx.modules.includes(key) })) return fail('You do not have access to that page.')
  return { page, guidance: entries[page] || `Open ${page.replaceAll('_', ' ')} and review the relevant record before saving changes.`, source: { label: 'Open page', page, extra: {} } }
}
