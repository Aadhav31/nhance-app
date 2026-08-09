/**
 * ApprovalCenterPage.jsx
 *
 * Central hub for managing all approval requests and acknowledgments.
 *
 * BLOCKING APPROVALS (is_blocking = true):
 *   Reviewer must Approve or Reject. The source record's status is updated accordingly.
 *
 * ACKNOWLEDGMENTS (is_blocking = false):
 *   Non-blocking. Reviewer just marks as seen — work continues uninterrupted.
 *
 * Role visibility:
 *   admin    → sees all pending (manager + accounts + admin roles)
 *   manager  → sees items routed to 'manager'
 *   accounts → sees items routed to 'accounts'
 *   others   → empty (no pending actions for them here)
 *
 * Source record updates (on approve/reject):
 *   ra_bill       → ra_bills.status: approved | draft
 *   field_expense → field_expenses.status: approved | draft
 *   hire_contract → (acknowledgment only — no status change)
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, XCircle, Clock, Eye, BellOff,
  ChevronDown, ChevronUp, RotateCcw, FileText,
  Receipt, ShoppingCart, FileSignature, AlertCircle,
  CheckCheck, Filter, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtDateTime, fmtCurrency } from '../../lib/utils'
import { logAction } from '../../lib/auditLog'

// ── Module display config ──────────────────────────────────────────────────────
const MODULE_META = {
  ra_bill:       { label: 'RA Billing',      Icon: Receipt,       colorClass: 'text-blue-400',   bgClass: 'bg-blue-500/10',   borderClass: 'border-blue-500/30'   },
  purchase_bill: { label: 'Purchase',         Icon: ShoppingCart,  colorClass: 'text-orange-400', bgClass: 'bg-orange-500/10', borderClass: 'border-orange-500/30' },
  field_expense: { label: 'Field Expense',    Icon: FileText,      colorClass: 'text-yellow-400', bgClass: 'bg-yellow-500/10', borderClass: 'border-yellow-500/30' },
  hire_contract: { label: 'Hire Contract',    Icon: FileSignature, colorClass: 'text-purple-400', bgClass: 'bg-purple-500/10', borderClass: 'border-purple-500/30' },
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status, isBlocking }) {
  if (status === 'pending') {
    return isBlocking
      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30"><Clock className="w-3 h-3" /> Pending</span>
      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30"><Eye className="w-3 h-3" /> For Info</span>
  }
  if (status === 'approved')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><CheckCircle className="w-3 h-3" /> Approved</span>
  if (status === 'acknowledged')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30"><CheckCheck className="w-3 h-3" /> Noted</span>
  if (status === 'rejected')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30"><XCircle className="w-3 h-3" /> Rejected</span>
  return null
}

// ── Relative time helper ───────────────────────────────────────────────────────
function timeAgo(isoStr) {
  if (!isoStr) return ''
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000)
  if (diff < 60)  return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Update source record status ────────────────────────────────────────────────
async function applyToSourceRecord(module, recordId, action) {
  try {
    if (module === 'ra_bill') {
      const newStatus = action === 'approved' ? 'approved' : 'draft'
      await supabase.from('ra_bills').update({ status: newStatus }).eq('id', recordId)
    } else if (module === 'field_expense') {
      const newStatus = action === 'approved' ? 'approved' : 'draft'
      await supabase.from('field_expenses').update({ status: newStatus }).eq('id', recordId)
    } else if (module === 'purchase_bill') {
      const newStatus = action === 'approved' ? 'approved' : 'draft'
      await supabase.from('purchase_bills').update({ status: newStatus }).eq('id', recordId)
    }
    // hire_contract is acknowledgment only — no status change needed
  } catch (_) {
    // Source record update failure is non-critical — approval is already recorded
  }
}

// ── Single approval card ───────────────────────────────────────────────────────
function ApprovalCard({ item, onAction, acting }) {
  const [comment,   setComment]   = useState('')
  const [showInput, setShowInput] = useState(false)
  const [pendingAct, setPendingAct] = useState(null) // 'approved' | 'rejected'

  const meta = MODULE_META[item.module] || { label: item.module, Icon: AlertCircle, colorClass: 'text-slate-400', bgClass: 'bg-slate-500/10', borderClass: 'border-slate-500/30' }
  const { Icon } = meta

  const handleConfirm = () => {
    onAction(item, pendingAct, comment.trim())
    setShowInput(false)
    setComment('')
    setPendingAct(null)
  }

  const initiateAction = (act) => {
    setPendingAct(act)
    setShowInput(true)
  }

  const cancel = () => {
    setShowInput(false)
    setComment('')
    setPendingAct(null)
  }

  return (
    <div className={`rounded-xl border ${meta.borderClass} ${meta.bgClass} p-4 space-y-3 transition-opacity ${acting ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bgClass} border ${meta.borderClass} flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${meta.colorClass}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${meta.colorClass}`}>{meta.label}</p>
            <p className="text-sm font-bold truncate" style={{ color: 'rgb(var(--t1))' }}>
              {item.record_ref || item.record_id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <StatusBadge status={item.status} isBlocking={item.is_blocking} />
          <span className="text-xs" style={{ color: 'rgb(var(--t3))' }}>{timeAgo(item.created_at)}</span>
        </div>
      </div>

      {/* Description + amount */}
      <div>
        {item.description && (
          <p className="text-sm" style={{ color: 'rgb(var(--t2))' }}>{item.description}</p>
        )}
        {item.amount > 0 && (
          <p className="text-base font-bold mt-0.5" style={{ color: 'rgb(var(--t1))' }}>
            {fmtCurrency(item.amount)}
          </p>
        )}
        {item.requested_by_name && (
          <p className="text-xs mt-1" style={{ color: 'rgb(var(--t3))' }}>
            By {item.requested_by_name} · {fmtDate(item.created_at)}
          </p>
        )}
      </div>

      {/* Action area (pending only) */}
      {item.status === 'pending' && (
        <>
          {/* Comment input — shown after user initiates an action */}
          {showInput && (
            <div className="space-y-2">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                placeholder={pendingAct === 'rejected' ? 'Reason for rejection (recommended)…' : 'Note (optional)…'}
                className="w-full px-3 py-2 rounded-lg border border-dark-600 bg-dark-800 text-sm resize-none focus:outline-none focus:border-primary-500"
                style={{ color: 'rgb(var(--t1))' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={cancel}
                  className="flex-1 px-3 py-2 rounded-lg border border-dark-600 text-sm font-medium hover:bg-dark-700 transition-colors"
                  style={{ color: 'rgb(var(--t2))' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                    pendingAct === 'approved' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {pendingAct === 'approved' ? '✓ Confirm Approve' : '✗ Confirm Reject'}
                </button>
              </div>
            </div>
          )}

          {/* Blocking: Approve + Reject */}
          {!showInput && item.is_blocking && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => initiateAction('rejected')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
              <button
                onClick={() => initiateAction('approved')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
            </div>
          )}

          {/* Non-blocking: Acknowledge */}
          {!showInput && !item.is_blocking && (
            <div className="flex justify-end pt-1">
              <button
                onClick={() => onAction(item, 'acknowledged', '')}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-400 text-sm font-semibold hover:bg-sky-500/20 transition-colors"
              >
                <CheckCheck className="w-4 h-4" /> Mark as Noted
              </button>
            </div>
          )}
        </>
      )}

      {/* Review outcome (for history items) */}
      {item.status !== 'pending' && (item.review_comments || item.reviewed_by_name) && (
        <div className="pt-1 border-t border-dark-700 space-y-0.5">
          {item.reviewed_by_name && (
            <p className="text-xs" style={{ color: 'rgb(var(--t3))' }}>
              {item.status === 'approved' ? 'Approved' : item.status === 'acknowledged' ? 'Noted' : 'Rejected'} by {item.reviewed_by_name} · {fmtDate(item.review_date)}
            </p>
          )}
          {item.review_comments && (
            <p className="text-xs italic" style={{ color: 'rgb(var(--t2))' }}>"{item.review_comments}"</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Section with collapse ──────────────────────────────────────────────────────
function Section({ title, count, children, defaultOpen = true, accent }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2 px-1 group"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: 'rgb(var(--t1))' }}>{title}</span>
          {count > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${accent || 'bg-amber-500/20 text-amber-400'}`}>
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="space-y-3 mt-2">{children}</div>}
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────
function Empty({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <BellOff className="w-8 h-8 text-slate-600" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ApprovalCenterPage() {
  const { companyId, profile } = useAuth()
  const queryClient = useQueryClient()
  const userRole    = profile?.role || 'manager'
  const userName    = profile?.full_name || profile?.email || 'You'

  const [moduleFilter, setModuleFilter] = useState('all')
  const [actingIds,    setActingIds]    = useState(new Set())

  // Which required_roles can this user action?
  const visibleRoles = useMemo(() => {
    if (userRole === 'admin')    return ['manager', 'accounts', 'admin']
    if (userRole === 'manager')  return ['manager']
    if (userRole === 'accounts') return ['accounts']
    return []
  }, [userRole])

  // ── Fetch pending ──────────────────────────────────────────────────────────
  const { data: pendingAll = [], isLoading: loadingPending, refetch } = useQuery({
    queryKey: ['approval_pending', companyId, ...visibleRoles],
    queryFn: async () => {
      if (visibleRoles.length === 0) return []
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .in('required_role', visibleRoles)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId && visibleRoles.length > 0,
    refetchInterval: 30_000, // poll every 30s for fresh data
  })

  // ── Fetch history (last 60 days) ───────────────────────────────────────────
  const { data: historyAll = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['approval_history', companyId, ...visibleRoles],
    queryFn: async () => {
      if (visibleRoles.length === 0) return []
      const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('company_id', companyId)
        .in('status', ['approved', 'rejected', 'acknowledged'])
        .in('required_role', visibleRoles)
        .gte('review_date', since)
        .order('review_date', { ascending: false })
        .limit(50)
      if (error) throw error
      return data || []
    },
    enabled: !!companyId && visibleRoles.length > 0,
  })

  // ── Apply module filter ────────────────────────────────────────────────────
  const pending = moduleFilter === 'all' ? pendingAll : pendingAll.filter(x => x.module === moduleFilter)
  const history = moduleFilter === 'all' ? historyAll : historyAll.filter(x => x.module === moduleFilter)

  const pendingBlocking = pending.filter(x => x.is_blocking)
  const pendingAcks     = pending.filter(x => !x.is_blocking)

  // ── Handle approve / reject / acknowledge ──────────────────────────────────
  const handleAction = async (item, action, comments) => {
    setActingIds(s => new Set([...s, item.id]))
    try {
      // 1. Update approval_requests
      const { error } = await supabase
        .from('approval_requests')
        .update({
          status:           action,
          reviewed_by_name: userName,
          review_date:      new Date().toISOString(),
          review_comments:  comments || null,
        })
        .eq('id', item.id)
      if (error) throw error

      // 2. Update source record
      if (item.is_blocking) {
        await applyToSourceRecord(item.module, item.record_id, action)
      }

      // 3. Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['approval_pending'] })
      queryClient.invalidateQueries({ queryKey: ['approval_history'] })
      queryClient.invalidateQueries({ queryKey: ['ra_bills'] })
      queryClient.invalidateQueries({ queryKey: ['field_expenses'] })
      queryClient.invalidateQueries({ queryKey: ['ra_bills_outstanding_dash'] })
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] })

      // 4. Audit log
      const moduleLabel = { ra_bill: 'RA Billing', field_expense: 'Field Expense', hire_contract: 'Hire Contract', purchase_bill: 'Purchase' }
      const actionLabel = { approved: 'approved', rejected: 'rejected', acknowledged: 'acknowledged' }
      logAction({
        companyId,
        module:      'approvals',
        action:      action,
        recordId:    item.record_id,
        recordRef:   item.record_ref,
        description: `${moduleLabel[item.module] || item.module} ${item.record_ref || ''} — ${actionLabel[action] || action}${comments ? `: "${comments}"` : ''}`,
        actorId:     profile?.id,
        actorName:   userName,
        actorRole:   userRole,
      })
    } catch (err) {
      alert('Action failed: ' + err.message)
    } finally {
      setActingIds(s => { const n = new Set(s); n.delete(item.id); return n })
    }
  }

  // ── Module filter options ──────────────────────────────────────────────────
  const moduleCounts = useMemo(() => {
    const counts = {}
    pendingAll.forEach(x => { counts[x.module] = (counts[x.module] || 0) + 1 })
    return counts
  }, [pendingAll])

  const filterOptions = [
    { key: 'all', label: 'All', count: pendingAll.length },
    ...Object.keys(MODULE_META).filter(k => (moduleCounts[k] || historyAll.some(h => h.module === k))).map(k => ({
      key: k, label: MODULE_META[k].label, count: moduleCounts[k] || 0,
    }))
  ]

  const isLoading = loadingPending || loadingHistory

  // ── No-access state ────────────────────────────────────────────────────────
  if (visibleRoles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <BellOff className="w-12 h-12 text-slate-600" />
        <p className="text-base font-semibold text-slate-300">No approvals for your role</p>
        <p className="text-sm text-slate-500">Approval actions are available to managers, accounts staff, and admins.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'rgb(var(--t1))' }}>Approval Centre</h2>
            <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--t3))' }}>
              {pendingBlocking.length > 0
                ? `${pendingBlocking.length} item${pendingBlocking.length > 1 ? 's' : ''} waiting for your action`
                : 'All caught up — no pending approvals'}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            title="Refresh"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-dark-700 transition-colors"
            style={{ color: 'rgb(var(--t3))' }}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Module filter chips */}
        {filterOptions.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {filterOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setModuleFilter(opt.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  moduleFilter === opt.key
                    ? 'bg-primary-600 text-white border-primary-500'
                    : 'border-dark-600 hover:border-dark-500'
                }`}
                style={moduleFilter !== opt.key ? { color: 'rgb(var(--t2))' } : undefined}
              >
                {opt.label}
                {opt.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${moduleFilter === opt.key ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
                    {opt.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && (
          <>
            {/* Pending approvals (blocking) */}
            {pendingBlocking.length > 0 && (
              <Section title="Needs Your Approval" count={pendingBlocking.length} accent="bg-amber-500/20 text-amber-400">
                {pendingBlocking.map(item => (
                  <ApprovalCard
                    key={item.id}
                    item={item}
                    onAction={handleAction}
                    acting={actingIds.has(item.id)}
                  />
                ))}
              </Section>
            )}

            {/* Pending acknowledgments (non-blocking) */}
            {pendingAcks.length > 0 && (
              <Section title="For Your Attention" count={pendingAcks.length} accent="bg-sky-500/20 text-sky-400" defaultOpen={pendingBlocking.length === 0}>
                {pendingAcks.map(item => (
                  <ApprovalCard
                    key={item.id}
                    item={item}
                    onAction={handleAction}
                    acting={actingIds.has(item.id)}
                  />
                ))}
              </Section>
            )}

            {/* Empty pending state */}
            {pendingBlocking.length === 0 && pendingAcks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-base font-semibold" style={{ color: 'rgb(var(--t1))' }}>All caught up!</p>
                <p className="text-sm" style={{ color: 'rgb(var(--t3))' }}>No pending approvals or acknowledgments for your role.</p>
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <Section title="Recent History" count={history.length} accent="bg-slate-500/20 text-slate-400" defaultOpen={false}>
                {history.map(item => (
                  <ApprovalCard
                    key={item.id}
                    item={item}
                    onAction={handleAction}
                    acting={false}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
