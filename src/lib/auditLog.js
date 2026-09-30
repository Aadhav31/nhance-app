/**
 * auditLog.js
 *
 * Fire-and-forget helper for recording explicit business events in the
 * database-owned audit ledger.
 *
 * Row creates, edits and deletes are captured automatically by database
 * triggers. Use this helper only for semantic events that are not themselves
 * a row mutation (submitted, exported, acknowledged, login, and so on).
 *
 * Usage:
 *   import { logAction } from '../../lib/auditLog'
 *
 *   logAction({
 *     companyId,
 *     module:      'ra_billing',
 *     action:      'submitted',
 *     recordId:    ra.id,
 *     recordRef:   ra.ra_number,
 *     description: `RA Bill ${ra.ra_number} submitted for manager approval`,
 *   })
 *
 * Standard action values:
 *   created | updated | submitted | approved | rejected
 *   paid | deleted | acknowledged | recalled | activated | terminated
 *
 * Standard module values:
 *   ra_billing | approvals | hire_contract | purchase
 *   field_expense | boq | inventory | settings | auth
 */

import { supabase } from './supabase'

/**
 * Record a semantic event through a validated RPC. Actor name and role are
 * deliberately ignored here: the database derives them from auth.uid(), so a
 * browser cannot impersonate another user in the audit trail.
 *
 * @param {Object} payload
 * @param {string}  payload.companyId   - company UUID
 * @param {string}  payload.module      - module name ('ra_billing', 'approvals', etc.)
 * @param {string}  payload.action      - action taken ('submitted', 'approved', etc.)
 * @param {string}  [payload.recordId]  - UUID of the affected record
 * @param {string}  [payload.recordRef] - human-readable ref ('RA-2026-001')
 * @param {string}  [payload.description] - plain-English description of the event
 * @param {Object}  [payload.meta]      - any extra context (key-value)
 */
export function logAction({
  companyId,
  module,
  action,
  recordId,
  recordRef,
  description,
  meta,
}) {
  if (!companyId || !module || !action) return Promise.resolve(null)

  return supabase
    .rpc('record_audit_event', {
      p_company_id: companyId,
      p_module: module,
      p_action: action,
      p_record_id: recordId || null,
      p_record_ref: recordRef || null,
      p_description: description || null,
      p_meta: meta || null,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn('[AuditLog] Write failed:', error.message, { module, action, recordRef })
      }
      return error || null
    })
    .catch(error => {
      if (import.meta.env.DEV) {
        console.warn('[AuditLog] Request failed:', error.message, { module, action, recordRef })
      }
      return error
    })
}
