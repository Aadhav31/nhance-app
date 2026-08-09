/**
 * auditLog.js
 *
 * Fire-and-forget helper for writing to the immutable audit_logs table.
 *
 * IMPORTANT: logAction() is intentionally non-blocking and non-throwing.
 * It must NEVER break the calling user action if the log write fails.
 * Do not await it in critical paths.
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
 *     actorId:     session?.user?.id,
 *     actorName:   profile?.full_name || session?.user?.email,
 *     actorRole:   profile?.role,
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
 * Write an audit log entry. Returns immediately — logging happens in the background.
 *
 * @param {Object} payload
 * @param {string}  payload.companyId   - company UUID
 * @param {string}  payload.module      - module name ('ra_billing', 'approvals', etc.)
 * @param {string}  payload.action      - action taken ('submitted', 'approved', etc.)
 * @param {string}  [payload.recordId]  - UUID of the affected record
 * @param {string}  [payload.recordRef] - human-readable ref ('RA-2026-001')
 * @param {string}  [payload.description] - plain-English description of the event
 * @param {string}  [payload.actorId]   - auth.uid() of the person acting
 * @param {string}  [payload.actorName] - display name of the actor
 * @param {string}  [payload.actorRole] - role of the actor
 * @param {Object}  [payload.meta]      - any extra context (key-value)
 */
export function logAction({
  companyId,
  module,
  action,
  recordId,
  recordRef,
  description,
  actorId,
  actorName,
  actorRole,
  meta,
}) {
  if (!companyId || !module || !action) return  // silently skip if misconfigured

  supabase
    .from('audit_logs')
    .insert({
      company_id:  companyId,
      module,
      action,
      record_id:   recordId   || null,
      record_ref:  recordRef  || null,
      description: description || null,
      actor_id:    actorId    || null,
      actor_name:  actorName  || null,
      actor_role:  actorRole  || null,
      meta:        meta       || null,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn('[AuditLog] Write failed:', error.message, { module, action, recordRef })
      }
    })
}
