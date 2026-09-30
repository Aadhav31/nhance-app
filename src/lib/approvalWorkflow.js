import { supabase } from './supabase'

export const DEFAULT_EXPENSE_APPROVAL_THRESHOLD = 2000
export const EXPENSE_APPROVAL_DOCUMENTS = new Set([
  'field_expense',
  'expense',
  'employee_reimbursement',
])

export const APPROVAL_DOCUMENTS = {
  purchase_order: {
    label: 'Purchase Order', shortLabel: 'PO', module: 'purchase', valueKind: 'currency',
    description: 'Site need → Procurement → Accounts → Management',
  },
  work_order: {
    label: 'Vendor Work Order', shortLabel: 'WO', module: 'purchase', valueKind: 'currency',
    description: 'Technical → Commercial → Finance → Management',
  },
  vendor_bill: {
    label: 'Vendor Invoice', shortLabel: 'Bill', module: 'purchase', valueKind: 'currency',
    description: 'Site certification → Commercial match → Accounts → Management',
  },
  vendor_payment: {
    label: 'Vendor Payment', shortLabel: 'Pay', module: 'purchase', valueKind: 'currency',
    description: 'Bill owner → Accounts → Treasury → Management',
  },
  field_expense: {
    label: 'Field Expense', shortLabel: 'Expense', module: 'fieldexpense', valueKind: 'currency',
    description: 'Manager approval or owner verification → staffed checks → Owner sanction',
  },
  expense: {
    label: 'Company Expense', shortLabel: 'Expense', module: 'expenses', valueKind: 'currency',
    description: 'Manager approval or owner verification → staffed checks → Owner sanction',
  },
  employee_reimbursement: {
    label: 'Reimbursement', shortLabel: 'Claim', module: 'reimbursements', valueKind: 'currency',
    description: 'Manager approval → staffed checks → Owner sanction',
  },
  leave_request: {
    label: 'Leave Request', shortLabel: 'Leave', module: 'hr', valueKind: 'duration',
    description: 'Reporting manager → HR → Long-leave sanction',
  },
  equipment_transfer: {
    label: 'Equipment Transfer', shortLabel: 'Equipment', module: 'deployment_planner', valueKind: 'text',
    description: 'Source site → P&M → Destination site',
  },
  stock_transfer: {
    label: 'Tools & Tackles Transfer', shortLabel: 'Stock', module: 'inventory', valueKind: 'quantity',
    description: 'Source store → P&M → Destination store',
  },
  ra_bill: {
    label: 'RA Bill', shortLabel: 'RA', module: 'ra_billing', valueKind: 'currency',
    description: 'Project certification → Accounts → Management',
  },
}

// Used for the preview and as an operational reference if the database migration
// has not yet been applied. The database remains the source of truth once live.
export const DEFAULT_APPROVAL_BLUEPRINTS = [
  ['purchase_order', [
    ['Project need approval', 'Projects', 'Manager', 'All values'],
    ['Procurement & commercial check', 'Procurement', 'Manager', 'All values'],
    ['Budget availability', 'Accounts', 'Accounts', 'Rs. 5L+'],
    ['Management sanction', 'Management', 'Admin', 'Rs. 50L+'],
  ]],
  ['work_order', [
    ['Technical scope', 'Projects', 'Manager', 'All values'],
    ['Commercial terms', 'Procurement', 'Manager', 'All values'],
    ['Finance commitment', 'Accounts', 'Accounts', 'Rs. 5L+'],
    ['Management sanction', 'Management', 'Admin', 'Rs. 50L+'],
  ]],
  ['vendor_bill', [
    ['Site / quantity certification', 'Projects', 'Manager', 'All values'],
    ['PO / WO commercial match', 'Procurement', 'Manager', 'All values'],
    ['Accounts & tax verification', 'Accounts', 'Accounts', 'All values'],
    ['Management sanction', 'Management', 'Admin', 'Rs. 25L+'],
  ]],
  ['vendor_payment', [
    ['Bill owner release', 'Projects', 'Manager', 'All values'],
    ['Accounts due check', 'Accounts', 'Accounts', 'All values'],
    ['Finance / treasury release', 'Finance', 'Manager', 'Rs. 1L+'],
    ['Management sanction', 'Management', 'Admin', 'Rs. 10L+'],
  ]],
  ['field_expense', [
    ['Manager approval / owner verification', 'Management Control', 'Manager', 'Above Rs. 2,000'],
    ['Accounts verification (when staffed)', 'Accounts', 'Accounts', 'Above Rs. 2,000'],
    ['Owner sanction', 'Management', 'Admin', 'Above Rs. 2,000'],
  ]],
  ['expense', [
    ['Manager approval / owner verification', 'Management Control', 'Manager', 'Above Rs. 2,000'],
    ['Accounts verification (when staffed)', 'Accounts', 'Accounts', 'Above Rs. 2,000'],
    ['Owner sanction', 'Management', 'Admin', 'Above Rs. 2,000'],
  ]],
  ['employee_reimbursement', [
    ['Manager approval', 'Management Control', 'Manager', 'Above Rs. 2,000'],
    ['Accounts verification (when staffed)', 'Accounts', 'Accounts', 'Above Rs. 2,000'],
    ['Owner sanction', 'Management', 'Admin', 'Above Rs. 2,000'],
  ]],
  ['leave_request', [
    ['Reporting manager & coverage', 'Projects', 'Manager', 'All leave'],
    ['HR balance & policy', 'HR', 'Manager', 'All leave'],
    ['Long leave sanction', 'Management', 'Admin', '15+ days'],
  ]],
  ['equipment_transfer', [
    ['Source site release', 'Projects', 'Manager', 'All transfers'],
    ['P&M clearance', 'P&M', 'Manager', 'All transfers'],
    ['Destination site acceptance', 'Projects', 'Manager', 'All transfers'],
  ]],
  ['stock_transfer', [
    ['Source store release', 'Stores', 'Supervisor', 'All transfers'],
    ['Project / P&M clearance', 'P&M', 'Manager', 'All transfers'],
    ['Destination store acceptance', 'Stores', 'Supervisor', 'All transfers'],
  ]],
  ['ra_bill', [
    ['Project certification', 'Projects', 'Manager', 'All values'],
    ['Accounts & tax check', 'Accounts', 'Accounts', 'All values'],
    ['Management sanction', 'Management', 'Admin', 'Rs. 1Cr+'],
  ]],
].map(([documentType, steps]) => ({
  documentType,
  name: APPROVAL_DOCUMENTS[documentType].label,
  description: APPROVAL_DOCUMENTS[documentType].description,
  steps: steps.map(([name, department, role, threshold], index) => ({
    id: `${documentType}-${index + 1}`,
    step_order: index + 1,
    name,
    department,
    required_role: role.toLowerCase(),
    threshold,
    sla_hours: documentType === 'vendor_payment' ? 16 : 24,
  })),
}))

const isMissingWorkflowEngine = error => {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return text.includes('submit_approval_case') || text.includes('approval_task_inbox') ||
    text.includes('approval_cases') || text.includes('schema cache') || text.includes('does not exist')
}

const isMissingExpenseRefinement = error => {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return text.includes('submit_expense_approval_case') ||
    (text.includes('schema cache') && text.includes('expense_approval'))
}

const LEGACY_ROUTING = {
  purchase_order: ['purchase_bill', 'manager'],
  vendor_bill: ['purchase_bill', 'manager'],
  field_expense: ['field_expense', 'manager'],
  expense: ['field_expense', 'manager'],
  employee_reimbursement: ['field_expense', 'manager'],
  leave_request: ['leave_request', 'manager'],
  equipment_transfer: ['equipment_transfer', 'manager'],
  stock_transfer: ['stock_transfer', 'manager'],
  ra_bill: ['ra_bill', 'manager'],
  work_order: ['work_order', 'manager'],
  vendor_payment: ['vendor_payment', 'accounts'],
}

/**
 * Submit a source record into the enterprise workflow engine.
 *
 * During preview deployments the production database may still be on the legacy
 * schema. In that one case only, a legacy request is created so existing work is
 * not lost. Every other error is surfaced to the caller.
 */
export async function submitApprovalCase({
  companyId,
  documentType,
  documentId,
  documentRef,
  title,
  amount = 0,
  projectId = null,
  unitId = null,
  vendorId = null,
  metricLabel = 'Amount',
  snapshot = {},
  requesterId,
  requesterName,
  fuelReview = false,
}) {
  if (fuelReview && ['field_expense', 'expense'].includes(documentType)) {
    const { data: fuelResult, error: fuelError } = await supabase.rpc('submit_fuel_expense_approval_case', {
      p_document_type: documentType,
      p_document_id: documentId,
      p_document_ref: documentRef || null,
      p_title: title,
      p_snapshot: snapshot,
    })
    if (fuelError) throw fuelError
    return {
      caseId: fuelResult?.case_id,
      engine: 'enterprise',
      approvalRequired: true,
      status: fuelResult?.status || 'in_review',
      route: fuelResult?.route,
      mandatoryFuelReview: true,
    }
  }

  if (EXPENSE_APPROVAL_DOCUMENTS.has(documentType)) {
    const { data: expenseResult, error: expenseError } = await supabase.rpc('submit_expense_approval_case', {
      p_document_type: documentType,
      p_document_id: documentId,
      p_document_ref: documentRef || null,
      p_title: title,
      p_metric_label: metricLabel,
      p_snapshot: snapshot,
    })
    if (!expenseError) {
      return {
        caseId: expenseResult?.case_id,
        engine: 'enterprise',
        approvalRequired: Boolean(expenseResult?.approval_required),
        status: expenseResult?.status,
        route: expenseResult?.route,
        threshold: Number(expenseResult?.threshold ?? DEFAULT_EXPENSE_APPROVAL_THRESHOLD),
      }
    }
    if (!isMissingExpenseRefinement(expenseError)) throw expenseError
  }

  const { data, error } = await supabase.rpc('submit_approval_case', {
    p_document_type: documentType,
    p_document_id: documentId,
    p_document_ref: documentRef || null,
    p_title: title,
    p_amount: Number(amount) || 0,
    p_project_id: projectId || null,
    p_unit_id: unitId || null,
    p_vendor_id: vendorId || null,
    p_metric_label: metricLabel,
    p_snapshot: snapshot,
  })
  if (!error) return { caseId: data, engine: 'enterprise', approvalRequired: true, status: 'in_review' }
  if (!isMissingWorkflowEngine(error)) throw error

  const [module, requiredRole] = LEGACY_ROUTING[documentType] || [documentType, 'manager']
  const { data: legacy, error: legacyError } = await supabase
    .from('approval_requests')
    .insert({
      company_id: companyId,
      module,
      record_id: documentId,
      record_ref: documentRef || null,
      description: title,
      amount: Number(amount) || null,
      requested_by: requesterId || null,
      requested_by_name: requesterName || null,
      required_role: requiredRole,
      is_blocking: true,
      status: 'pending',
    })
    .select('id')
    .single()
  if (legacyError) throw legacyError
  return { caseId: legacy?.id, engine: 'legacy', approvalRequired: true, status: 'in_review' }
}

export async function actOnApprovalTask(taskId, action, comments = '') {
  const { data, error } = await supabase.rpc('act_on_approval_task', {
    p_task_id: taskId,
    p_action: action,
    p_comments: comments || null,
  })
  if (error) throw error
  return data
}

export async function cancelApprovalCase(caseId, reason) {
  const { data, error } = await supabase.rpc('cancel_approval_case', {
    p_case_id: caseId,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function overrideExpenseApprovalCase(caseId, reason) {
  const { data, error } = await supabase.rpc('override_expense_approval_case', {
    p_case_id: caseId,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export function approvalDocumentMeta(documentType) {
  return APPROVAL_DOCUMENTS[documentType] || {
    label: documentType?.replaceAll('_', ' ') || 'Approval',
    shortLabel: 'Item', module: 'approval_center', valueKind: 'currency', description: '',
  }
}

export function isWorkflowEngineUnavailable(error) {
  return isMissingWorkflowEngine(error)
}
