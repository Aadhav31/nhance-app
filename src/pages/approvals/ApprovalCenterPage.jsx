import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertTriangle, ArrowRight, Building2, CalendarClock, Check, CheckCircle2,
  ChevronRight, Clock3, FileCheck2, Filter, History, Layers3, Loader2,
  RefreshCw, RotateCcw, Search, Send, ShieldCheck, UserCheck, X, XCircle,
  Settings2, Save,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fmtCurrency, fmtDate, fmtDateTime } from '../../lib/utils'
import {
  actOnApprovalTask, approvalDocumentMeta, cancelApprovalCase, DEFAULT_APPROVAL_BLUEPRINTS,
  DEFAULT_EXPENSE_APPROVAL_THRESHOLD, EXPENSE_APPROVAL_DOCUMENTS,
  isWorkflowEngineUnavailable, overrideExpenseApprovalCase,
} from '../../lib/approvalWorkflow'

const STATUS_META = {
  in_review: { label: 'In review', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300', Icon: Clock3 },
  pending: { label: 'Waiting', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300', Icon: Clock3 },
  approved: { label: 'Approved', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'border-red-500/30 bg-red-500/10 text-red-300', Icon: XCircle },
  returned: { label: 'Returned', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-300', Icon: RotateCcw },
  cancelled: { label: 'Cancelled', cls: 'border-slate-500/30 bg-slate-500/10 text-slate-400', Icon: X },
  blocked: { label: 'Upcoming', cls: 'border-slate-600 bg-slate-700/30 text-slate-500', Icon: Clock3 },
}

const ROLE_LABELS = { supervisor: 'Supervisor', manager: 'Manager', accounts: 'Accounts', admin: 'Admin' }
const DECISION_META = {
  approval: { action: 'Approve', done: 'Approved', note: 'Decision note (optional)' },
  verification: { action: 'Verify', done: 'Verified', note: 'Verification note (optional)' },
  sanction: { action: 'Sanction', done: 'Sanctioned', note: 'Sanction note (optional)' },
  compliance: { action: 'Clear', done: 'Cleared', note: 'Compliance note (optional)' },
}

const decisionMeta = type => DECISION_META[type] || DECISION_META.approval

function StatusPill({ status, decisionType }) {
  const meta = STATUS_META[status] || STATUS_META.pending
  const Icon = meta.Icon
  const label = status === 'approved' ? decisionMeta(decisionType).done : meta.label
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}><Icon className="h-3 w-3" />{label}</span>
}

function displayValue(item) {
  const kind = approvalDocumentMeta(item.document_type).valueKind
  if (kind === 'currency') return fmtCurrency(item.amount || 0)
  if (kind === 'duration') return `${Number(item.amount || 0)} day${Number(item.amount) === 1 ? '' : 's'}`
  if (kind === 'quantity') return `${Number(item.amount || 0)} ${item.metric_label || 'units'}`
  return item.metric_label && item.metric_label !== 'Amount' ? item.metric_label : null
}

function dueState(dueAt) {
  if (!dueAt) return null
  const hours = (new Date(dueAt).getTime() - Date.now()) / 3600000
  if (hours < 0) return { label: `${Math.max(1, Math.ceil(Math.abs(hours)))}h overdue`, cls: 'text-red-400' }
  if (hours <= 4) return { label: `${Math.max(1, Math.ceil(hours))}h left`, cls: 'text-amber-400' }
  return { label: `Due ${fmtDateTime(dueAt)}`, cls: 'text-slate-500' }
}

function Kpi({ Icon, label, value, note, tone = 'primary' }) {
  const tones = {
    primary: 'border-primary-500/20 bg-primary-500/5 text-primary-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    red: 'border-red-500/20 bg-red-500/5 text-red-400',
    green: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  }
  return <div className={`rounded-xl border p-3.5 ${tones[tone]}`}><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><Icon className="h-4 w-4" /></div><p className="mt-2 text-2xl font-black text-slate-100">{value}</p><p className="mt-0.5 text-[11px] text-slate-500">{note}</p></div>
}

function ApprovalRow({ item, selected, onSelect, actionable }) {
  const meta = approvalDocumentMeta(item.document_type)
  const due = dueState(item.due_at)
  const value = displayValue(item)
  return (
    <button type="button" onClick={() => onSelect(item)} className={`w-full rounded-xl border p-4 text-left transition-colors ${selected ? 'border-primary-500/60 bg-primary-500/10' : 'border-dark-700 bg-dark-800 hover:border-dark-600'}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md border border-dark-600 bg-dark-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-400">{meta.shortLabel}</span><span className="truncate text-xs font-mono text-slate-500">{item.document_ref || String(item.document_id || '').slice(0, 8)}</span>{item.legacy ? <span className="text-[10px] text-slate-600">Legacy queue</span> : null}</div><p className="mt-2 truncate text-sm font-bold text-slate-100">{item.title}</p><p className="mt-1 text-xs text-slate-500">From {item.submitted_by_name || 'Team member'} · {fmtDate(item.submitted_at)}</p></div><div className="flex items-center gap-2">{!actionable ? <StatusPill status={item.status} /> : null}<ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" /></div></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dark-700 pt-3"><div className="flex items-center gap-2 text-xs"><span className="font-semibold text-slate-300">{item.step_name || item.workflow_name || `For ${ROLE_LABELS[item.required_role] || item.required_role || 'review'}`}</span>{item.department ? <span className="text-slate-600">· {item.department}</span> : null}</div><div className="flex items-center gap-3">{due ? <span className={`text-[11px] font-semibold ${due.cls}`}>{due.label}</span> : null}{value ? <span className="text-sm font-black text-slate-100">{value}</span> : null}</div></div>
    </button>
  )
}

function EmptyState({ tab }) {
  const copy = {
    inbox: ['Approval queue is clear', 'New items appear here only when your role or delegation can act.'],
    mine: ['No submitted requests', 'Requests submitted from Purchase, HR, Expenses and Transfers will appear here.'],
    history: ['No approval history yet', 'Completed decisions will build a permanent audit trail.'],
  }[tab] || ['Nothing to show', 'Try a different filter.']
  return <div className="flex flex-col items-center py-16 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10"><FileCheck2 className="h-7 w-7 text-emerald-500" /></div><p className="mt-4 text-sm font-bold text-slate-200">{copy[0]}</p><p className="mt-1 max-w-sm text-xs text-slate-500">{copy[1]}</p></div>
}

function StepTimeline({ tasks = [], actions = [] }) {
  const actionByTask = new Map(actions.filter(a => a.task_id).map(a => [a.task_id, a]))
  return <div className="space-y-0">{tasks.slice().sort((a, b) => a.step_order - b.step_order).map((step, index) => {
    const active = step.status === 'pending'
    const done = step.status === 'approved'
    const action = actionByTask.get(step.id)
    return <div key={step.id} className="relative flex gap-3 pb-5 last:pb-0">{index < tasks.length - 1 ? <div className={`absolute left-[13px] top-7 h-[calc(100%-16px)] w-px ${done ? 'bg-emerald-500/40' : 'bg-dark-600'}`} /> : null}<div className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${done ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : active ? 'border-amber-500/50 bg-amber-500/15 text-amber-400' : step.status === 'rejected' ? 'border-red-500/40 bg-red-500/15 text-red-400' : 'border-dark-600 bg-dark-800 text-slate-600'}`}>{done ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{step.step_order}</span>}</div><div className="min-w-0 flex-1 pt-0.5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-slate-200">{step.step_name}</p><StatusPill status={step.status} decisionType={step.decision_type} /></div><p className="mt-1 text-[11px] text-slate-500">{step.department || 'Company'} · {ROLE_LABELS[step.required_role] || step.required_role}</p>{step.acted_by_name ? <p className="mt-1 text-[11px] text-slate-400">{step.acted_by_name} · {fmtDateTime(step.acted_at)}</p> : null}{(step.comments || action?.comments) ? <p className="mt-1 rounded-lg bg-dark-800 px-2.5 py-2 text-[11px] text-slate-400">{step.comments || action.comments}</p> : null}</div></div>
  })}</div>
}

function DetailPanel({
  item, caseDetail, loading, onClose, onAct, acting, onNavigate,
  readOnly = false, canCancel = false, onCancel, cancelling = false,
  canOverride = false, onOverride, overriding = false,
}) {
  const [decision, setDecision] = useState(null)
  const [comments, setComments] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [showingOverride, setShowingOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const meta = approvalDocumentMeta(item.document_type)
  const value = displayValue(item)
  const needsReason = decision === 'rejected' || decision === 'returned'
  const currentTask = caseDetail?.tasks?.find(task => task.status === 'pending')
  const decisionCopy = decisionMeta(item.decision_type || currentTask?.decision_type)
  const submit = () => {
    if (needsReason && !comments.trim()) return toast.error('Enter a clear reason so the requester can act on it')
    onAct(item, decision, comments.trim()).then(() => { setDecision(null); setComments('') }).catch(() => {})
  }
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
    <aside className="flex h-full w-full max-w-xl flex-col border-l border-dark-700 bg-dark-900 shadow-2xl" onClick={e => e.stopPropagation()}>
      <header className="flex items-start justify-between gap-3 border-b border-dark-700 px-5 py-4">
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-400">{meta.label}</p><h3 className="mt-1 truncate text-lg font-black text-slate-100">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.document_ref || String(item.document_id || '').slice(0, 8)}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-dark-700 hover:text-white" aria-label="Close approval details"><X className="h-5 w-5" /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><p className="text-[10px] uppercase text-slate-600">Submitted by</p><p className="mt-1 text-sm font-semibold text-slate-200">{item.submitted_by_name || 'Team member'}</p><p className="text-[11px] text-slate-500">{fmtDateTime(item.submitted_at)}</p></div><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><p className="text-[10px] uppercase text-slate-600">{item.metric_label || 'Value'}</p><p className="mt-1 text-sm font-black text-slate-100">{value || 'Not specified'}</p><p className="text-[11px] text-slate-500">{item.workflow_name || meta.description}</p></div></div>
        {item.snapshot && Object.keys(item.snapshot).length > 0 ? <section className="mt-5"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Verified context</h4><div className="mt-2 grid grid-cols-2 gap-2">{Object.entries(item.snapshot).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').slice(0, 10).map(([key, snapshotValue]) => <div key={key} className="rounded-lg bg-dark-800 px-3 py-2"><p className="text-[10px] capitalize text-slate-600">{key.replaceAll('_', ' ')}</p><p className="mt-0.5 truncate text-xs font-medium text-slate-300">{String(snapshotValue)}</p></div>)}</div></section> : null}
        <section className="mt-6"><div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Approval chain</h4>{item.department ? <span className="text-[11px] text-slate-600">Current: {item.department}</span> : null}</div>{loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary-400" /></div> : item.legacy ? <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">This request was created before chained workflows. Complete it here; all new submissions use the department-by-department chain.</div> : <StepTimeline tasks={caseDetail?.tasks || []} actions={caseDetail?.actions || []} />}</section>
      </div>
      <footer className="border-t border-dark-700 bg-dark-900 p-4">
        {readOnly ? (
          showingOverride ? <div className="space-y-3"><div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"><p className="text-xs font-bold text-amber-300">Emergency owner override</p><p className="mt-1 text-[11px] text-amber-200/70">This bypasses independent verification. Your reason and the skipped steps remain in the audit history.</p></div><textarea autoFocus rows={3} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} className="w-full resize-none rounded-xl border border-dark-600 bg-dark-800 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500" placeholder="Why must this expense proceed without independent verification?" /><div className="flex gap-2"><button type="button" onClick={() => { setShowingOverride(false); setOverrideReason('') }} className="btn-ghost flex-1">Cancel</button><button type="button" disabled={overriding || !overrideReason.trim()} onClick={() => onOverride(item, overrideReason.trim())} className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50">{overriding ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Record override & approve'}</button></div></div>
          : withdrawing ? <div className="space-y-3"><label className="block text-xs font-semibold text-slate-300">Why are you withdrawing this request? *</label><textarea autoFocus rows={3} value={withdrawalReason} onChange={e => setWithdrawalReason(e.target.value)} className="w-full resize-none rounded-xl border border-dark-600 bg-dark-800 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-primary-500" placeholder="Record a reason for the audit trail…" /><div className="flex gap-2"><button type="button" onClick={() => { setWithdrawing(false); setWithdrawalReason('') }} className="btn-ghost flex-1">Keep request</button><button type="button" disabled={cancelling || !withdrawalReason.trim()} onClick={() => onCancel(item, withdrawalReason.trim())} className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50">{cancelling ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Withdraw request'}</button></div></div>
          : (canCancel || canOverride) ? <div className="space-y-2"><div className="rounded-lg border border-dark-700 bg-dark-800 px-3 py-2 text-center text-xs text-slate-500">This request is moving through the approval chain.</div>{canOverride ? <button type="button" onClick={() => setShowingOverride(true)} className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20">Emergency owner override</button> : null}{canCancel ? <button type="button" onClick={() => setWithdrawing(true)} className="w-full rounded-lg border border-red-500/20 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10">Withdraw open request</button> : null}</div>
          : <div className="rounded-lg border border-dark-700 bg-dark-800 px-3 py-2 text-center text-xs text-slate-500">This view is read-only. Only the current eligible approver can act.</div>
        ) : decision ? (
          <div className="space-y-3"><label className="block text-xs font-semibold text-slate-300">{decision === 'approved' ? decisionCopy.note : decision === 'returned' ? 'What must the requester correct?' : 'Reason for rejection'}{needsReason ? ' *' : ''}</label><textarea autoFocus rows={3} value={comments} onChange={e => setComments(e.target.value)} className="w-full resize-none rounded-xl border border-dark-600 bg-dark-800 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-primary-500" placeholder={decision === 'approved' ? 'Add conditions or confirmation…' : 'Be specific so the requester knows what to do next…'} /><div className="flex gap-2"><button type="button" onClick={() => { setDecision(null); setComments('') }} className="btn-ghost flex-1">Cancel</button><button type="button" disabled={acting || (needsReason && !comments.trim())} onClick={submit} className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${decision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-500' : decision === 'returned' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-red-600 hover:bg-red-500'}`}>{acting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : decision === 'approved' ? `Confirm ${decisionCopy.action.toLowerCase()}` : `Confirm ${decision}`}</button></div></div>
        ) : <div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => setDecision('rejected')} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20"><XCircle className="mx-auto mb-1 h-4 w-4" />Reject</button><button type="button" onClick={() => setDecision('returned')} className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-400 hover:bg-sky-500/20"><RotateCcw className="mx-auto mb-1 h-4 w-4" />Return</button><button type="button" onClick={() => setDecision('approved')} className="rounded-lg border border-emerald-500/30 bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"><CheckCircle2 className="mx-auto mb-1 h-4 w-4" />{decisionCopy.action}</button></div>}
        {onNavigate && meta.module !== 'approval_center' ? <button type="button" onClick={() => onNavigate(meta.module)} className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-primary-400 hover:text-primary-300">Open source workspace <ArrowRight className="h-3.5 w-3.5" /></button> : null}
      </footer>
    </aside>
  </div>
}

function WorkflowStepRow({ step, index, editable, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    name: step.name || '', department: step.department || '', required_role: step.required_role || 'manager',
    decision_type: step.decision_type || 'approval', sla_hours: step.sla_hours || 24,
    min_amount: step.min_amount ?? '', enforce_department: Boolean(step.enforce_department),
  }))
  const save = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('approval_workflow_steps').update({
        name: form.name.trim(), department: form.department.trim() || null,
        required_role: form.required_role, decision_type: form.decision_type,
        sla_hours: Number(form.sla_hours) || 24,
        min_amount: form.min_amount === '' ? null : Number(form.min_amount),
        enforce_department: form.enforce_department,
      }).eq('id', step.id)
      if (error) throw error
      toast.success('Approval step updated')
      setEditing(false); onSaved()
    } catch (error) { toast.error(error.message || 'Unable to update step') } finally { setSaving(false) }
  }
  if (editing) return <div className="rounded-lg border border-primary-500/30 bg-dark-900 p-3"><div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] text-slate-500">Step name<input className="mt-1 w-full rounded border border-dark-600 bg-dark-800 px-2 py-1.5 text-xs text-slate-200" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label><label className="text-[10px] text-slate-500">Department<input className="mt-1 w-full rounded border border-dark-600 bg-dark-800 px-2 py-1.5 text-xs text-slate-200" value={form.department} onChange={event => setForm(current => ({ ...current, department: event.target.value }))} /></label><label className="text-[10px] text-slate-500">Approver role<select className="mt-1 w-full rounded border border-dark-600 bg-dark-800 px-2 py-1.5 text-xs text-slate-200" value={form.required_role} onChange={event => setForm(current => ({ ...current, required_role: event.target.value }))}>{['supervisor','manager','accounts','admin'].map(value => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}</select></label><label className="text-[10px] text-slate-500">Decision wording<select className="mt-1 w-full rounded border border-dark-600 bg-dark-800 px-2 py-1.5 text-xs text-slate-200" value={form.decision_type} onChange={event => setForm(current => ({ ...current, decision_type: event.target.value }))}>{Object.entries(DECISION_META).map(([value, copy]) => <option key={value} value={value}>{copy.action}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-500">SLA hours<input type="number" min="1" className="mt-1 w-full rounded border border-dark-600 bg-dark-800 px-2 py-1.5 text-xs text-slate-200" value={form.sla_hours} onChange={event => setForm(current => ({ ...current, sla_hours: event.target.value }))} /></label><label className="text-[10px] text-slate-500">Min value<input type="number" min="0" className="mt-1 w-full rounded border border-dark-600 bg-dark-800 px-2 py-1.5 text-xs text-slate-200" value={form.min_amount} onChange={event => setForm(current => ({ ...current, min_amount: event.target.value }))} placeholder="All" /></label></div></div><label className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><input type="checkbox" checked={form.enforce_department} onChange={event => setForm(current => ({ ...current, enforce_department: event.target.checked }))} />Require the approver profile to match this department</label><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="btn-ghost text-xs">Cancel</button><button type="button" onClick={save} disabled={saving || !form.name.trim()} className="btn-primary text-xs">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save step</button></div></div>
  return <div className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-900/50 px-3 py-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-dark-700 text-[10px] font-bold text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-300">{step.name}</p><p className="text-[10px] text-slate-600">{step.department || 'Company'} · {ROLE_LABELS[step.required_role] || step.required_role} · {decisionMeta(step.decision_type).action}{step.enforce_department ? ' · Department enforced' : ''}</p></div><div className="text-right"><p className="text-[10px] font-semibold text-slate-500">{step.threshold || (step.min_amount ? `${fmtCurrency(step.min_amount)}+` : 'All')}</p><p className="text-[10px] text-slate-600">{step.sla_hours || 24}h SLA</p></div>{editable ? <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-slate-600 hover:bg-dark-700 hover:text-primary-400" aria-label={`Configure ${step.name}`}><Settings2 className="h-3.5 w-3.5" /></button> : null}</div>
}

function ExpensePolicyCard({ companyId, profile, isAdmin, engineReady }) {
  const qc = useQueryClient()
  const [threshold, setThreshold] = useState(String(DEFAULT_EXPENSE_APPROVAL_THRESHOLD))
  const [overrideEnabled, setOverrideEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const policy = useQuery({
    queryKey: ['approval_policy_settings', companyId],
    enabled: Boolean(companyId && engineReady),
    queryFn: async () => {
      const { data, error } = await supabase.from('approval_policy_settings').select('*').eq('company_id', companyId).maybeSingle()
      if (error) throw error
      return data
    },
  })
  useEffect(() => {
    if (!policy.data) return
    setThreshold(String(policy.data.expense_approval_threshold ?? DEFAULT_EXPENSE_APPROVAL_THRESHOLD))
    setOverrideEnabled(policy.data.owner_override_enabled !== false)
  }, [policy.data])
  const save = async () => {
    const amount = Number(threshold)
    if (!Number.isFinite(amount) || amount < 0) return toast.error('Enter a valid expense threshold')
    setSaving(true)
    try {
      const { error } = await supabase.from('approval_policy_settings').upsert({
        company_id: companyId,
        expense_approval_threshold: amount,
        owner_override_enabled: overrideEnabled,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id' })
      if (error) throw error
      toast.success('Expense approval policy updated')
      qc.invalidateQueries({ queryKey: ['approval_policy_settings'] })
    } catch (error) { toast.error(error.message || 'Unable to update expense policy') } finally { setSaving(false) }
  }
  return <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-400">Mandatory expense control</p><h3 className="mt-1 text-sm font-bold text-slate-100">Every ad-hoc expense above {fmtCurrency(Number(threshold) || 0)} enters approval</h3><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Employee → Manager → staffed Accounts → Owner. Manager → staffed Accounts → Owner. Owner → Manager verification → staffed Accounts. Owner submission records authorisation; the manager verifies it and never “approves the owner”.</p></div><ShieldCheck className="h-5 w-5 text-amber-400" /></div>{isAdmin && engineReady ? <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-amber-500/15 pt-3"><label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Compulsory above<input type="number" min="0" step="100" value={threshold} onChange={event => setThreshold(event.target.value)} className="mt-1 block w-40 rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-sm text-slate-100" /></label><label className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-xs text-slate-400"><input type="checkbox" checked={overrideEnabled} onChange={event => setOverrideEnabled(event.target.checked)} />Reason-required owner emergency override</label><button type="button" onClick={save} disabled={saving} className="btn-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save policy</button></div> : null}</div>
}

function WorkflowCatalogue({ workflows, engineReady, isAdmin, onSaved }) {
  const cards = workflows.length ? workflows.map(w => ({ id: w.id, documentType: w.document_type, name: w.name, description: w.description, isActive: w.is_active, steps: (w.steps || []).slice().sort((a, b) => a.step_order - b.step_order) })) : DEFAULT_APPROVAL_BLUEPRINTS.map(w => ({ ...w, id: w.documentType, isActive: true }))
  return <div className="space-y-4"><div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-400" /><div><p className="text-sm font-bold text-slate-200">Company approval policy</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Every step unlocks only after the previous staffed control role acts. Requesters cannot approve their own submissions. Owner expenses use manager verification wording; rejections, returns and overrides always retain their reason.</p>{!engineReady ? <p className="mt-2 text-xs font-semibold text-amber-400">Preview policy shown. It becomes enforceable when the database migration is published.</p> : null}</div></div></div><div className="grid gap-3 lg:grid-cols-2">{cards.map(workflow => {
    const meta = approvalDocumentMeta(workflow.documentType)
    return <div key={workflow.id} className="rounded-xl border border-dark-700 bg-dark-800 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded-md bg-primary-500/10 px-2 py-1 text-[10px] font-bold uppercase text-primary-400">{meta.shortLabel}</span><h3 className="text-sm font-bold text-slate-100">{workflow.name}</h3></div><p className="mt-2 text-xs text-slate-500">{workflow.description || meta.description}</p></div><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${workflow.isActive ? 'bg-emerald-500' : 'bg-slate-600'}`} /></div><div className="mt-4 space-y-2">{workflow.steps.map((step, index) => <WorkflowStepRow key={step.id || `${workflow.id}-${index}`} step={step} index={index} editable={Boolean(isAdmin && engineReady && step.id)} onSaved={onSaved} />)}</div>{isAdmin ? <p className="mt-3 text-[10px] text-slate-600">Use the control on each step to set department enforcement, role, value threshold and SLA.</p> : null}</div>
  })}</div></div>
}

function DelegationPanel({ companyId, profile, engineReady }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const tomorrow = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 16)
  const nextWeek = new Date(Date.now() + 8 * 24 * 3600000).toISOString().slice(0, 16)
  const [form, setForm] = useState({ delegate_id: '', document_type: '', starts_at: tomorrow, ends_at: nextWeek, reason: '' })
  const { data: people = [] } = useQuery({
    queryKey: ['approval_delegate_people', companyId], enabled: Boolean(companyId && engineReady),
    queryFn: async () => { const { data, error } = await supabase.from('user_profiles').select('id,full_name,department,designation').eq('company_id', companyId).eq('is_active', true).neq('id', profile?.id).order('full_name'); if (error) throw error; return data || [] },
  })
  const { data: delegations = [], isLoading } = useQuery({
    queryKey: ['approval_delegations', companyId], enabled: Boolean(companyId && engineReady),
    queryFn: async () => { const { data, error } = await supabase.from('approval_delegations').select('*').eq('company_id', companyId).order('starts_at', { ascending: false }); if (error) throw error; return data || [] },
  })
  const peopleById = new Map(people.map(person => [person.id, person]))
  const save = async () => {
    if (!form.delegate_id) return toast.error('Select a delegate')
    if (!form.starts_at || !form.ends_at || new Date(form.starts_at) >= new Date(form.ends_at)) return toast.error('Enter a valid delegation period')
    setSaving(true)
    try {
      const { error } = await supabase.from('approval_delegations').insert({ company_id: companyId, delegator_id: profile.id, delegate_id: form.delegate_id, document_type: form.document_type || null, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(), reason: form.reason.trim() || null, created_by: profile.id })
      if (error) throw error
      toast.success('Approval delegation created')
      setForm({ delegate_id: '', document_type: '', starts_at: tomorrow, ends_at: nextWeek, reason: '' })
      qc.invalidateQueries({ queryKey: ['approval_delegations'] })
    } catch (error) { toast.error(error.message || 'Unable to create delegation') } finally { setSaving(false) }
  }
  const disable = async delegation => {
    const { error } = await supabase.from('approval_delegations').update({ is_active: false }).eq('id', delegation.id)
    if (error) return toast.error(error.message)
    toast.success('Delegation ended'); qc.invalidateQueries({ queryKey: ['approval_delegations'] })
  }
  if (!engineReady) return <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300">Delegation becomes available when the approval migration is published.</div>
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]"><div className="rounded-xl border border-dark-700 bg-dark-800 p-4"><h3 className="text-sm font-bold text-slate-100">Delegate my approvals</h3><p className="mt-1 text-xs text-slate-500">The delegate receives only eligible tasks during this period. Your own authority is not permanently transferred.</p><div className="mt-4 space-y-3"><label className="block text-xs text-slate-400">Delegate<select value={form.delegate_id} onChange={event => setForm(current => ({ ...current, delegate_id: event.target.value }))} className="mt-1 w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-xs text-slate-200"><option value="">-- Select employee --</option>{people.map(person => <option key={person.id} value={person.id}>{person.full_name}{person.department ? ` · ${person.department}` : ''}</option>)}</select></label><label className="block text-xs text-slate-400">Process<select value={form.document_type} onChange={event => setForm(current => ({ ...current, document_type: event.target.value }))} className="mt-1 w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-xs text-slate-200"><option value="">All approval processes</option>{Object.entries(DEFAULT_APPROVAL_BLUEPRINTS.reduce((all, workflow) => ({ ...all, [workflow.documentType]: workflow.name }), {})).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-400">From<input type="datetime-local" value={form.starts_at} onChange={event => setForm(current => ({ ...current, starts_at: event.target.value }))} className="mt-1 w-full rounded-lg border border-dark-600 bg-dark-900 px-2 py-2 text-xs text-slate-200" /></label><label className="text-xs text-slate-400">Until<input type="datetime-local" value={form.ends_at} onChange={event => setForm(current => ({ ...current, ends_at: event.target.value }))} className="mt-1 w-full rounded-lg border border-dark-600 bg-dark-900 px-2 py-2 text-xs text-slate-200" /></label></div><label className="block text-xs text-slate-400">Reason<input value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} placeholder="Leave, travel, site duty…" className="mt-1 w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-xs text-slate-200" /></label><button type="button" onClick={save} disabled={saving} className="btn-primary w-full justify-center">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}Create delegation</button></div></div><div className="rounded-xl border border-dark-700 bg-dark-800 p-4"><h3 className="text-sm font-bold text-slate-100">Active & recent delegations</h3>{isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary-400" /></div> : delegations.length ? <div className="mt-3 space-y-2">{delegations.map(item => { const delegate = peopleById.get(item.delegate_id); const active = item.is_active && new Date(item.ends_at) > new Date(); return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-dark-700 bg-dark-900/50 p-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-xs font-bold text-slate-200">{delegate?.full_name || 'Assigned delegate'}</p><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>{active ? 'Active' : 'Ended'}</span></div><p className="mt-1 text-[11px] text-slate-500">{item.document_type ? approvalDocumentMeta(item.document_type).label : 'All processes'} · {fmtDateTime(item.starts_at)} → {fmtDateTime(item.ends_at)}</p>{item.reason ? <p className="mt-1 text-[11px] text-slate-600">{item.reason}</p> : null}</div>{active && item.delegator_id === profile.id ? <button type="button" onClick={() => disable(item)} className="rounded-lg border border-red-500/20 px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10">End</button> : null}</div> })}</div> : <div className="py-12 text-center text-xs text-slate-600">No delegations created.</div>}</div></div>
}

function legacyToItem(row) {
  const map = { purchase_bill: 'vendor_bill', field_expense: 'field_expense', hire_contract: 'work_order', ra_bill: 'ra_bill' }
  return { legacy: true, task_id: row.id, case_id: row.id, document_type: map[row.module] || row.module, document_id: row.record_id, document_ref: row.record_ref, title: row.description || row.record_ref || 'Approval request', amount: row.amount, metric_label: 'Amount', submitted_by: row.requested_by, submitted_by_name: row.requested_by_name, submitted_at: row.created_at, required_role: row.required_role, status: row.status, due_at: null }
}

export default function ApprovalCenterPage({ onNavigate }) {
  const { companyId, userProfile: profile, role } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('inbox')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [acting, setActing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const visibleLegacyRoles = role === 'admin' ? ['manager', 'accounts', 'admin'] : [role]

  const queue = useQuery({ queryKey: ['approval_inbox', companyId, role], enabled: Boolean(companyId), refetchInterval: 30_000, queryFn: async () => {
    const { data, error } = await supabase.from('approval_task_inbox').select('*').order('due_at', { ascending: true })
    if (!error) {
      const { data: legacy } = await supabase.from('approval_requests').select('*').eq('company_id', companyId).eq('status', 'pending').in('required_role', visibleLegacyRoles).order('created_at')
      return { engineReady: true, items: [...(data || []), ...(legacy || []).map(legacyToItem)] }
    }
    if (!isWorkflowEngineUnavailable(error)) throw error
    const { data: legacy, error: legacyError } = await supabase.from('approval_requests').select('*').eq('company_id', companyId).eq('status', 'pending').in('required_role', visibleLegacyRoles).order('created_at')
    if (legacyError) throw legacyError
    return { engineReady: false, items: (legacy || []).map(legacyToItem) }
  } })

  const engineReady = queue.data?.engineReady !== false
  const cases = useQuery({ queryKey: ['approval_cases', companyId, engineReady], enabled: Boolean(companyId && queue.data?.engineReady), queryFn: async () => { const { data, error } = await supabase.from('approval_cases').select('*, workflow:approval_workflows(name), tasks:approval_tasks(*)').eq('company_id', companyId).order('submitted_at', { ascending: false }).limit(150); if (error) throw error; return data || [] } })
  const legacyHistory = useQuery({ queryKey: ['approval_legacy_history', companyId, engineReady], enabled: Boolean(companyId && queue.data && !engineReady), queryFn: async () => { const { data, error } = await supabase.from('approval_requests').select('*').eq('company_id', companyId).neq('status', 'pending').order('review_date', { ascending: false }).limit(100); if (error) throw error; return (data || []).map(legacyToItem) } })
  const workflows = useQuery({ queryKey: ['approval_workflows', companyId, engineReady], enabled: Boolean(companyId && queue.data?.engineReady), queryFn: async () => { const { data, error } = await supabase.from('approval_workflows').select('*, steps:approval_workflow_steps(*)').eq('company_id', companyId).order('name'); if (error) throw error; return data || [] } })
  const detail = useQuery({ queryKey: ['approval_case_detail', selected?.case_id], enabled: Boolean(selected?.case_id && !selected?.legacy && engineReady), queryFn: async () => { const [{ data: caseRow, error: caseError }, { data: actions, error: actionError }] = await Promise.all([supabase.from('approval_cases').select('*, tasks:approval_tasks(*)').eq('id', selected.case_id).single(), supabase.from('approval_actions').select('*').eq('case_id', selected.case_id).order('created_at')]); if (caseError) throw caseError; if (actionError) throw actionError; return { ...caseRow, actions: actions || [] } } })

  const inbox = queue.data?.items || []
  const caseRows = cases.data || []
  const mine = engineReady ? caseRows.filter(c => c.submitted_by === profile?.id).map(c => ({ ...c, case_id: c.id, workflow_name: c.workflow?.name })) : []
  const history = engineReady ? caseRows.filter(c => c.status !== 'in_review').map(c => ({ ...c, case_id: c.id, workflow_name: c.workflow?.name })) : (legacyHistory.data || [])
  const source = tab === 'inbox' ? inbox : tab === 'mine' ? mine : history
  const filtered = useMemo(() => source.filter(item => { const text = `${item.title || ''} ${item.document_ref || ''} ${item.submitted_by_name || ''}`.toLowerCase(); return (typeFilter === 'all' || item.document_type === typeFilter) && (!search || text.includes(search.toLowerCase())) }), [source, search, typeFilter])
  const types = [...new Set(source.map(i => i.document_type).filter(Boolean))]
  const overdue = inbox.filter(i => i.due_at && new Date(i.due_at) < new Date()).length
  const approvedMonth = caseRows.filter(c => c.status === 'approved' && c.completed_at && new Date(c.completed_at).getMonth() === new Date().getMonth()).length
  const refresh = () => { qc.invalidateQueries({ queryKey: ['approval_inbox'] }); qc.invalidateQueries({ queryKey: ['approval_cases'] }); qc.invalidateQueries({ queryKey: ['approval_legacy_history'] }); qc.invalidateQueries({ queryKey: ['approval_workflows'] }) }
  const legacyAction = async (item, action, comments) => { if ((action === 'rejected' || action === 'returned') && !comments) throw new Error('A reason is required'); const status = action === 'returned' ? 'rejected' : action; const { error } = await supabase.from('approval_requests').update({ status, reviewed_by: profile?.id, reviewed_by_name: profile?.full_name || 'Reviewer', review_date: new Date().toISOString(), review_comments: comments || null }).eq('id', item.task_id).eq('status', 'pending'); if (error) throw error }
  const act = async (item, action, comments) => { setActing(true); try { if (item.legacy) await legacyAction(item, action, comments); else await actOnApprovalTask(item.task_id, action, comments); const copy = decisionMeta(item.decision_type); toast.success(action === 'approved' ? `${copy.done} and moved to the next step` : action === 'returned' ? 'Returned to the requester' : 'Request rejected'); setSelected(null); refresh() } catch (error) { toast.error(error.message || 'Approval action failed'); throw error } finally { setActing(false) } }
  const cancelCase = async (item, reason) => { setCancelling(true); try { await cancelApprovalCase(item.case_id, reason); toast.success('Request withdrawn and returned to an editable state'); setSelected(null); refresh() } catch (error) { toast.error(error.message || 'Unable to withdraw request') } finally { setCancelling(false) } }
  const overrideCase = async (item, reason) => { setOverriding(true); try { await overrideExpenseApprovalCase(item.case_id, reason); toast.success('Owner override recorded and expense approved'); setSelected(null); refresh() } catch (error) { toast.error(error.message || 'Unable to record owner override') } finally { setOverriding(false) } }
  const tabs = [['inbox', 'My approvals', inbox.length, UserCheck], ['mine', 'Submitted by me', mine.filter(c => c.status === 'in_review').length, Send], ['history', 'History', history.length, History], ['workflows', 'Workflow policy', null, Layers3], ['delegations', 'Delegations', null, UserCheck]]

  return <div className="h-full overflow-y-auto"><div className="mx-auto max-w-7xl space-y-5 px-4 py-5 lg:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-400" /><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-400">Governance & Control</p></div><h1 className="mt-1 text-2xl font-black text-slate-100">Approval Centre</h1><p className="mt-1 text-sm text-slate-500">Department-by-department decisions with maker-checker control and a complete audit trail.</p></div><button type="button" onClick={refresh} className="btn-secondary"><RefreshCw className={`h-4 w-4 ${queue.isFetching ? 'animate-spin' : ''}`} />Refresh</button></div>
    {!engineReady ? <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /><div><p className="text-xs font-bold text-amber-300">Enterprise workflow preview</p><p className="mt-1 text-xs text-amber-200/70">The new interface is running safely against the legacy queue. Sequential enforcement activates only when the reviewed database migration is published.</p></div></div> : null}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi Icon={UserCheck} label="Waiting on me" value={inbox.length} note="Only actionable steps" tone={inbox.length ? 'amber' : 'green'} /><Kpi Icon={CalendarClock} label="Over SLA" value={overdue} note="Escalation attention" tone={overdue ? 'red' : 'green'} /><Kpi Icon={Send} label="My open requests" value={mine.filter(c => c.status === 'in_review').length} note="Across every department" /><Kpi Icon={CheckCircle2} label="Approved this month" value={approvedMonth} note="Completed approval chains" tone="green" /></div>
    <div className="rounded-xl border border-dark-700 bg-dark-800/60"><div className="flex gap-1 overflow-x-auto border-b border-dark-700 px-3 pt-2">{tabs.map(([key, label, count, Icon]) => <button type="button" key={key} onClick={() => { setTab(key); setSelected(null); setTypeFilter('all') }} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition-colors ${tab === key ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><Icon className="h-3.5 w-3.5" />{label}{count ? <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">{count}</span> : null}</button>)}</div>
      {tab === 'workflows' ? <div className="space-y-4 p-4"><ExpensePolicyCard companyId={companyId} profile={profile} isAdmin={role === 'admin'} engineReady={engineReady} /><WorkflowCatalogue workflows={workflows.data || []} engineReady={engineReady} isAdmin={role === 'admin'} onSaved={() => qc.invalidateQueries({ queryKey: ['approval_workflows'] })} /></div> : tab === 'delegations' ? <div className="p-4"><DelegationPanel companyId={companyId} profile={profile} engineReady={engineReady} /></div> : <><div className="flex flex-wrap gap-2 border-b border-dark-700 p-3"><label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-600" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reference, requester or description…" className="w-full rounded-lg border border-dark-600 bg-dark-900 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none focus:border-primary-500" /></label><div className="relative"><Filter className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-600" /><select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="rounded-lg border border-dark-600 bg-dark-900 py-2 pl-8 pr-8 text-xs text-slate-300 outline-none focus:border-primary-500"><option value="all">All processes</option>{types.map(type => <option key={type} value={type}>{approvalDocumentMeta(type).label}</option>)}</select></div></div><div className="p-3">{(queue.isLoading || cases.isLoading) && !source.length ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary-400" /></div> : filtered.length ? <div className="grid gap-3 lg:grid-cols-2">{filtered.map(item => <ApprovalRow key={item.task_id || item.id} item={item} selected={selected?.task_id === item.task_id} onSelect={setSelected} actionable={tab === 'inbox'} />)}</div> : <EmptyState tab={tab} />}</div></>}
    </div>
    <div className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><p className="text-xs font-bold text-slate-300">Maker-checker enforced</p></div><p className="mt-1 text-[11px] text-slate-600">The requester cannot approve their own document.</p></div><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-sky-400" /><p className="text-xs font-bold text-slate-300">Project & department routing</p></div><p className="mt-1 text-[11px] text-slate-600">Policies can vary by project, unit, value and named approver.</p></div><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-violet-400" /><p className="text-xs font-bold text-slate-300">Immutable decision history</p></div><p className="mt-1 text-[11px] text-slate-600">Who acted, when, why and what unlocked next are retained.</p></div></div>
  </div>{selected ? <DetailPanel item={selected} caseDetail={detail.data} loading={detail.isLoading} onClose={() => setSelected(null)} onAct={act} acting={acting} onNavigate={onNavigate} readOnly={tab !== 'inbox'} canCancel={Boolean(engineReady && tab === 'mine' && selected.status === 'in_review' && selected.submitted_by === profile?.id)} onCancel={cancelCase} cancelling={cancelling} canOverride={Boolean(engineReady && tab === 'mine' && role === 'admin' && selected.status === 'in_review' && selected.submitted_by === profile?.id && EXPENSE_APPROVAL_DOCUMENTS.has(selected.document_type) && !selected.snapshot?.mandatory_fuel_review)} onOverride={overrideCase} overriding={overriding} /> : null}</div>
}
