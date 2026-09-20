import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardCheck, Clock3,
  Loader2, PackageCheck, PlayCircle, Plus, Save, Search,
  ShieldCheck, TestTube2, UserRoundCheck, Wrench, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  buildWorkshopMetrics,
  filterWorkshopJobs,
  isWorkshopOverdue,
  workshopActions,
  workshopStage,
} from '../../lib/workshop'

const fieldClass = 'w-full rounded-xl border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500'
const areaClass = `${fieldClass} min-h-20 resize-none`

const STAGE_META = {
  open:             { label: 'Open',           tone: 'text-slate-300',   badge: 'border-slate-600 bg-slate-500/10 text-slate-300', icon: ClipboardCheck },
  assigned:         { label: 'Assigned',       tone: 'text-cyan-400',    badge: 'border-cyan-700/40 bg-cyan-500/10 text-cyan-400', icon: UserRoundCheck },
  awaiting_parts:   { label: 'Awaiting Parts', tone: 'text-amber-400',   badge: 'border-amber-700/40 bg-amber-500/10 text-amber-400', icon: Boxes },
  in_progress:      { label: 'In Progress',    tone: 'text-blue-400',    badge: 'border-blue-700/40 bg-blue-500/10 text-blue-400', icon: PlayCircle },
  testing:          { label: 'Testing',        tone: 'text-purple-400',  badge: 'border-purple-700/40 bg-purple-500/10 text-purple-400', icon: TestTube2 },
  pending_approval: { label: 'Approval',       tone: 'text-orange-400',  badge: 'border-orange-700/40 bg-orange-500/10 text-orange-400', icon: ShieldCheck },
  closed:           { label: 'Closed',         tone: 'text-emerald-400', badge: 'border-emerald-700/40 bg-emerald-500/10 text-emerald-400', icon: CheckCircle2 },
  cancelled:        { label: 'Cancelled',      tone: 'text-red-400',     badge: 'border-red-700/40 bg-red-500/10 text-red-400', icon: X },
}

const TYPE_LABELS = {
  breakdown: 'Breakdown',
  pm_service: 'PM Service',
  unscheduled: 'Unscheduled Repair',
  inspection: 'Inspection',
}

const PRIORITY_TONES = {
  low: 'text-slate-400',
  normal: 'text-blue-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
}

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const displayDateTime = value => value ? format(new Date(value), 'dd MMM yyyy · hh:mm a') : '—'
const outstandingQuantity = part => Math.max(0, Number(part.quantity_requested || part.quantity || 0) - Number(part.quantity_issued || 0))

function StageBadge({ stage }) {
  const meta = STAGE_META[stage] || STAGE_META.open
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>{meta.label}</span>
}

function MetricTile({ active, icon: Icon, label, value, tone, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 bg-dark-800 hover:border-primary-500/50'}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500">{label}</span><Icon className={`h-4 w-4 ${tone}`} /></div>
      <p className={`mt-2 text-xl font-bold ${tone}`}>{value}</p>
    </button>
  )
}

function CreateJobModal({ companyId, data, prefill, onClose, onCreated }) {
  const defaultEquipment = prefill?.equipment_id || ''
  const defaultEquipmentRow = data.equipment.find(item => item.id === defaultEquipment)
  const [form, setForm] = useState({
    equipment_id: defaultEquipment,
    jc_type: prefill?.jc_type || 'breakdown',
    complaint: prefill?.complaint || '',
    priority: prefill?.priority || 'high',
    project_id: prefill?.project_id || defaultEquipmentRow?.current_project_id || '',
    technician_id: '',
    sla_hours: prefill?.priority === 'critical' ? '4' : '24',
  })
  const [saving, setSaving] = useState(false)
  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const changeEquipment = value => {
    const equipment = data.equipment.find(item => item.id === value)
    setForm(current => ({ ...current, equipment_id: value, project_id: equipment?.current_project_id || current.project_id }))
  }

  const submit = async event => {
    event.preventDefault()
    if (!form.equipment_id || !form.complaint.trim()) {
      toast.error('Select equipment and enter the reported problem')
      return
    }
    setSaving(true)
    try {
      const slaHours = Number(form.sla_hours || 0)
      const slaDueAt = slaHours > 0 ? new Date(Date.now() + slaHours * 3_600_000).toISOString() : null
      const equipment = data.equipment.find(item => item.id === form.equipment_id)
      const { data: jobId, error } = await supabase.rpc('create_workshop_job', {
        p_equipment_id: form.equipment_id,
        p_jc_type: form.jc_type,
        p_complaint: form.complaint.trim(),
        p_priority: form.priority,
        p_project_id: form.project_id || null,
        p_technician_id: form.technician_id || null,
        p_sla_due_at: slaDueAt,
        p_breakdown_alert_id: prefill?.breakdown_alert_id || null,
        p_incident_id: prefill?.incident_id || null,
        p_meter_at_open: equipment?.current_meter_reading ?? null,
        p_pm_schedule_id: null,
      })
      if (error) throw error
      toast.success('Workshop job card created')
      onCreated(jobId)
    } catch (error) {
      toast.error(error.message || 'Could not create job card')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form onSubmit={submit} className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden border-dark-600 bg-dark-900 shadow-2xl sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between border-b border-dark-700 bg-dark-800 px-5 py-4">
          <div><h2 className="font-bold text-slate-100">New workshop job card</h2><p className="mt-0.5 text-xs text-slate-500">Create one controlled repair workflow</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-dark-700 hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block text-xs text-slate-400">Equipment *
            <select value={form.equipment_id} onChange={event => changeEquipment(event.target.value)} className={`${fieldClass} mt-1`}>
              <option value="">Select equipment…</option>
              {data.equipment.map(item => <option key={item.id} value={item.id}>{item.equipment_number} · {item.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">Job type
              <select value={form.jc_type} onChange={event => setField('jc_type', event.target.value)} className={`${fieldClass} mt-1`}>
                {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-400">Priority
              <select value={form.priority} onChange={event => setField('priority', event.target.value)} className={`${fieldClass} mt-1`}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </label>
          </div>
          <label className="block text-xs text-slate-400">Complaint / reported problem *
            <textarea value={form.complaint} onChange={event => setField('complaint', event.target.value)} className={`${areaClass} mt-1`} placeholder="What failed, where and under what operating condition?" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">Project
              <select value={form.project_id} onChange={event => setField('project_id', event.target.value)} className={`${fieldClass} mt-1`}>
                <option value="">No project</option>
                {data.projects.map(item => <option key={item.id} value={item.id}>{item.project_code ? `${item.project_code} · ` : ''}{item.project_name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-400">Assign technician
              <select value={form.technician_id} onChange={event => setField('technician_id', event.target.value)} className={`${fieldClass} mt-1`}>
                <option value="">Unassigned</option>
                {data.staff.map(item => <option key={item.id} value={item.id}>{item.full_name}{item.designation ? ` · ${item.designation}` : ''}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs text-slate-400">Response / repair SLA (hours)
            <input type="number" min="0" step="1" value={form.sla_hours} onChange={event => setField('sla_hours', event.target.value)} className={`${fieldClass} mt-1`} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-dark-700 p-4">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create job card</button>
        </div>
      </form>
    </div>
  )
}

function PartIssueRow({ part, stores, stocks, onIssue, issuing }) {
  const outstanding = outstandingQuantity(part)
  const availableStores = stocks.filter(stock => stock.item_id === part.inventory_item_id && Number(stock.quantity_on_hand || 0) > 0)
  const [storeId, setStoreId] = useState(part.store_id || availableStores[0]?.store_id || stores[0]?.id || '')
  const [quantity, setQuantity] = useState(outstanding ? String(outstanding) : '0')
  const selectedStock = stocks.find(stock => stock.item_id === part.inventory_item_id && stock.store_id === storeId)

  return (
    <div className="rounded-xl border border-dark-700 bg-dark-800/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-slate-200">{part.part_name}</p><p className="text-[11px] text-slate-500">Requested {Number(part.quantity_requested || 0)} · Issued {Number(part.quantity_issued || 0)}</p></div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${part.issue_status === 'issued' || part.issue_status === 'manual' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{String(part.issue_status || 'manual').replaceAll('_', ' ')}</span>
      </div>
      {part.inventory_item_id && outstanding > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_90px_auto]">
          <select value={storeId} onChange={event => setStoreId(event.target.value)} className={fieldClass}>
            <option value="">Select store…</option>
            {stores.map(store => {
              const stock = stocks.find(row => row.item_id === part.inventory_item_id && row.store_id === store.id)
              return <option key={store.id} value={store.id}>{store.store_name} · {Number(stock?.quantity_on_hand || 0)} available</option>
            })}
          </select>
          <input type="number" min="0.001" max={outstanding} step="0.001" value={quantity} onChange={event => setQuantity(event.target.value)} className={fieldClass} />
          <button type="button" disabled={issuing || !storeId || Number(quantity) <= 0 || Number(quantity) > Number(selectedStock?.quantity_on_hand || 0)} onClick={() => onIssue(part.id, storeId, Number(quantity))} className="btn-primary justify-center text-xs disabled:opacity-40">{issuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}Issue</button>
        </div>
      ) : null}
      {part.inventory_item_id && outstanding > 0 && availableStores.length === 0 ? <p className="mt-2 text-[11px] text-amber-400">No store stock is available. Receive stock before issuing this part.</p> : null}
      {Number(part.total_cost || 0) > 0 ? <p className="mt-2 text-right text-xs text-slate-400">Issued cost <span className="font-semibold text-slate-200">{money(part.total_cost)}</span></p> : null}
    </div>
  )
}

function JobDetailPanel({ job, companyId, data, role, onClose, onChanged }) {
  const [saving, setSaving] = useState(false)
  const [transitioning, setTransitioning] = useState('')
  const [issuingPart, setIssuingPart] = useState('')
  const [partForm, setPartForm] = useState({ inventory_item_id: '', part_name: '', part_number: '', quantity: '1', unit_cost: '' })
  const [form, setForm] = useState({})
  const canApprove = ['manager', 'admin', 'superadmin'].includes(role)
  const canManage = ['supervisor', 'manager', 'admin', 'superadmin'].includes(role)

  useEffect(() => {
    setForm({
      technician_id: job.technician_id || '', priority: job.priority || 'normal', diagnosis: job.diagnosis || '',
      failure_code: job.failure_code || '', failed_component: job.failed_component || '', root_cause: job.root_cause || '',
      corrective_action: job.corrective_action || '', work_done: job.work_done || '', labor_hours: job.labor_hours ?? '',
      labor_cost: job.labor_cost ?? '', external_cost: job.external_cost ?? '', downtime_hours: job.downtime_hours ?? '',
      meter_at_close: job.meter_at_close ?? '', test_result: job.test_result || 'pending',
      completion_checklist: job.completion_checklist || {}, supervisor_notes: job.supervisor_notes || '',
    })
  }, [job])

  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setCheck = key => setForm(current => ({ ...current, completion_checklist: { ...current.completion_checklist, [key]: !current.completion_checklist?.[key] } }))

  const saveDetails = async ({ silent = false } = {}) => {
    if (!canManage) return true
    setSaving(true)
    try {
      const technician = data.staff.find(item => item.id === form.technician_id)
      const { error } = await supabase.from('job_cards').update({
        technician_id: form.technician_id || null,
        technician_name: technician?.full_name || null,
        priority: form.priority,
        diagnosis: form.diagnosis.trim() || null,
        failure_code: form.failure_code.trim() || null,
        failed_component: form.failed_component.trim() || null,
        root_cause: form.root_cause.trim() || null,
        corrective_action: form.corrective_action.trim() || null,
        work_done: form.work_done.trim() || null,
        labor_hours: form.labor_hours === '' ? null : Number(form.labor_hours),
        labor_cost: form.labor_cost === '' ? 0 : Number(form.labor_cost),
        external_cost: form.external_cost === '' ? 0 : Number(form.external_cost),
        downtime_hours: form.downtime_hours === '' ? 0 : Number(form.downtime_hours),
        meter_at_close: form.meter_at_close === '' ? null : Number(form.meter_at_close),
        test_result: form.test_result,
        completion_checklist: form.completion_checklist,
        supervisor_notes: form.supervisor_notes.trim() || null,
      }).eq('id', job.id).eq('company_id', companyId)
      if (error) throw error
      if (!silent) toast.success('Job card details saved')
      await onChanged()
      return true
    } catch (error) {
      toast.error(error.message || 'Could not save job card')
      return false
    } finally {
      setSaving(false)
    }
  }

  const transition = async action => {
    if (action.stage === 'assigned' && !form.technician_id) {
      toast.error('Select and save a technician before assigning the job')
      return
    }
    const saved = await saveDetails({ silent: true })
    if (!saved) return
    setTransitioning(action.stage)
    try {
      const { error } = await supabase.rpc('transition_workshop_job', {
        p_job_card_id: job.id,
        p_stage: action.stage,
        p_note: form.supervisor_notes.trim() || null,
        p_meter_at_close: form.meter_at_close === '' ? null : Number(form.meter_at_close),
        p_test_result: form.test_result,
      })
      if (error) throw error
      toast.success(action.stage === 'closed' ? 'Job approved and equipment released' : `Moved to ${STAGE_META[action.stage]?.label || action.stage}`)
      await onChanged()
      if (action.stage === 'closed') onClose()
    } catch (error) {
      toast.error(error.message || 'Could not update workflow stage')
    } finally {
      setTransitioning('')
    }
  }

  const selectInventoryItem = itemId => {
    const item = data.items.find(row => row.id === itemId)
    setPartForm(current => ({
      ...current,
      inventory_item_id: itemId,
      part_name: item?.item_name || '',
      part_number: item?.item_code || '',
      unit_cost: item?.avg_unit_cost ? String(item.avg_unit_cost) : '',
    }))
  }

  const addPart = async () => {
    if (!partForm.part_name.trim() || Number(partForm.quantity) <= 0) {
      toast.error('Enter a part and requested quantity')
      return
    }
    try {
      const linked = !!partForm.inventory_item_id
      const requested = Number(partForm.quantity)
      const { error } = await supabase.from('job_card_parts').insert({
        company_id: companyId,
        job_card_id: job.id,
        inventory_item_id: partForm.inventory_item_id || null,
        part_name: partForm.part_name.trim(),
        part_number: partForm.part_number.trim() || null,
        quantity_requested: requested,
        quantity: linked ? 0 : requested,
        quantity_issued: linked ? 0 : requested,
        unit_cost: partForm.unit_cost === '' ? null : Number(partForm.unit_cost),
        issue_status: linked ? 'requested' : 'manual',
      })
      if (error) throw error
      setPartForm({ inventory_item_id: '', part_name: '', part_number: '', quantity: '1', unit_cost: '' })
      toast.success(linked ? 'Part requested from inventory' : 'Manual part cost added')
      await onChanged()
    } catch (error) {
      toast.error(error.message || 'Could not add part')
    }
  }

  const issuePart = async (partId, storeId, quantity) => {
    setIssuingPart(partId)
    try {
      const { error } = await supabase.rpc('issue_workshop_part', {
        p_job_card_part_id: partId,
        p_store_id: storeId,
        p_quantity: quantity,
      })
      if (error) throw error
      toast.success('Part issued and stock reduced')
      await onChanged()
    } catch (error) {
      toast.error(error.message || 'Could not issue part')
    } finally {
      setIssuingPart('')
    }
  }

  const stage = workshopStage(job)
  const meta = STAGE_META[stage] || STAGE_META.open
  const parts = [...(job.job_card_parts || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const events = [...(job.job_card_events || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const actions = workshopActions(job, canApprove)
  const releaseReady = form.test_result === 'passed'
    && !!form.diagnosis?.trim()
    && !!form.work_done?.trim()
    && !!form.completion_checklist?.guards_fitted
    && !!form.completion_checklist?.leaks_checked
    && !!form.completion_checklist?.trial_completed
    && (!job.pm_schedule_id || form.meter_at_close !== '')

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-3xl flex-col border-l border-dark-600 bg-dark-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-dark-700 bg-dark-800 px-5 py-4">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold text-primary-400">{job.jc_number}</span><StageBadge stage={stage} /><span className={`text-xs font-semibold capitalize ${PRIORITY_TONES[job.priority]}`}>{job.priority}</span></div><h2 className="mt-1 truncate text-lg font-bold text-slate-100">{job.equipment?.equipment_number} · {job.equipment_name || job.equipment?.name}</h2><p className="mt-1 text-xs text-slate-500">{TYPE_LABELS[job.jc_type]} · Opened {displayDateTime(job.opened_at || job.created_at)}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-dark-700 hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {isWorkshopOverdue(job) ? <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300"><AlertTriangle className="h-4 w-4" />SLA breached · due {displayDateTime(job.sla_due_at)}</div> : null}

          <section className="rounded-2xl border border-dark-700 bg-dark-800/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Complaint</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{job.complaint || 'No complaint recorded'}</p>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3"><div><span className="text-slate-500">Project</span><p className="mt-0.5 text-slate-300">{job.project?.project_name || '—'}</p></div><div><span className="text-slate-500">Meter at open</span><p className="mt-0.5 text-slate-300">{job.meter_at_open != null ? `${Number(job.meter_at_open).toLocaleString('en-IN')} hrs` : '—'}</p></div><div><span className="text-slate-500">SLA due</span><p className="mt-0.5 text-slate-300">{displayDateTime(job.sla_due_at)}</p></div></div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-200">Assignment &amp; diagnosis</h3><meta.icon className={`h-4 w-4 ${meta.tone}`} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-400">Technician<select disabled={!canManage} value={form.technician_id || ''} onChange={event => setField('technician_id', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`}><option value="">Unassigned</option>{data.staff.map(item => <option key={item.id} value={item.id}>{item.full_name}{item.designation ? ` · ${item.designation}` : ''}</option>)}</select></label>
              <label className="text-xs text-slate-400">Priority<select disabled={!canManage} value={form.priority || 'normal'} onChange={event => setField('priority', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            </div>
            <label className="block text-xs text-slate-400">Diagnosis<textarea disabled={!canManage} value={form.diagnosis || ''} onChange={event => setField('diagnosis', event.target.value)} className={`${areaClass} mt-1 disabled:opacity-60`} /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Failure code<input disabled={!canManage} value={form.failure_code || ''} onChange={event => setField('failure_code', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`} placeholder="e.g. HYD-LEAK" /></label><label className="text-xs text-slate-400">Failed component<input disabled={!canManage} value={form.failed_component || ''} onChange={event => setField('failed_component', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`} placeholder="Pump, hose, engine…" /></label></div>
            <label className="block text-xs text-slate-400">Root cause<textarea disabled={!canManage} value={form.root_cause || ''} onChange={event => setField('root_cause', event.target.value)} className={`${areaClass} mt-1 disabled:opacity-60`} /></label>
            <label className="block text-xs text-slate-400">Corrective action<textarea disabled={!canManage} value={form.corrective_action || ''} onChange={event => setField('corrective_action', event.target.value)} className={`${areaClass} mt-1 disabled:opacity-60`} /></label>
            <label className="block text-xs text-slate-400">Work completed<textarea disabled={!canManage} value={form.work_done || ''} onChange={event => setField('work_done', event.target.value)} className={`${areaClass} mt-1 disabled:opacity-60`} /></label>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-200">Parts reservation &amp; issue</h3><span className="text-xs text-slate-500">{parts.length} line{parts.length === 1 ? '' : 's'} · {money(job.parts_cost)}</span></div>
            {parts.map(part => <PartIssueRow key={part.id} part={part} stores={data.stores} stocks={data.stocks} onIssue={issuePart} issuing={issuingPart === part.id} />)}
            {canManage && stage !== 'closed' ? <div className="rounded-xl border border-dashed border-dark-600 p-3"><div className="grid gap-2 sm:grid-cols-2"><select value={partForm.inventory_item_id} onChange={event => selectInventoryItem(event.target.value)} className={fieldClass}><option value="">Manual / non-stock part</option>{data.items.map(item => <option key={item.id} value={item.id}>{item.item_code} · {item.item_name}</option>)}</select><input value={partForm.part_name} onChange={event => setPartForm(current => ({ ...current, part_name: event.target.value }))} className={fieldClass} placeholder="Part name" /></div><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_100px_120px_auto]"><input value={partForm.part_number} onChange={event => setPartForm(current => ({ ...current, part_number: event.target.value }))} className={fieldClass} placeholder="Part number" /><input type="number" min="0.001" step="0.001" value={partForm.quantity} onChange={event => setPartForm(current => ({ ...current, quantity: event.target.value }))} className={fieldClass} placeholder="Qty" /><input type="number" min="0" step="0.01" value={partForm.unit_cost} onChange={event => setPartForm(current => ({ ...current, unit_cost: event.target.value }))} className={fieldClass} placeholder="Unit cost" /><button type="button" onClick={addPart} className="btn-secondary justify-center text-xs"><Plus className="h-3.5 w-3.5" />Add</button></div></div> : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-200">Labour, cost &amp; downtime</h3><span className="text-sm font-bold text-emerald-400">{money(job.total_cost)}</span></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="text-xs text-slate-400">Labour hours<input disabled={!canManage} type="number" min="0" step="0.1" value={form.labor_hours ?? ''} onChange={event => setField('labor_hours', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`} /></label><label className="text-xs text-slate-400">Labour cost<input disabled={!canManage} type="number" min="0" step="0.01" value={form.labor_cost ?? ''} onChange={event => setField('labor_cost', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`} /></label><label className="text-xs text-slate-400">External cost<input disabled={!canManage} type="number" min="0" step="0.01" value={form.external_cost ?? ''} onChange={event => setField('external_cost', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`} /></label><label className="text-xs text-slate-400">Downtime hours<input disabled={!canManage} type="number" min="0" step="0.1" value={form.downtime_hours ?? ''} onChange={event => setField('downtime_hours', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`} /></label></div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200">Testing &amp; release approval</h3>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Test result<select disabled={!canManage} value={form.test_result || 'pending'} onChange={event => setField('test_result', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`}><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option></select></label><label className="text-xs text-slate-400">Meter at release {job.pm_schedule_id ? '*' : ''}<input disabled={!canManage} type="number" min="0" step="0.1" value={form.meter_at_close ?? ''} onChange={event => setField('meter_at_close', event.target.value)} className={`${fieldClass} mt-1 disabled:opacity-60`} /></label></div>
            <div className="grid gap-2 sm:grid-cols-2">{[['guards_fitted','Safety guards fitted'],['leaks_checked','Leak check completed'],['trial_completed','Trial run completed'],['site_released','Site release confirmed']].map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-xl border border-dark-700 bg-dark-800 p-3 text-xs text-slate-300"><input disabled={!canManage} type="checkbox" checked={!!form.completion_checklist?.[key]} onChange={() => setCheck(key)} className="accent-primary-500" />{label}</label>)}</div>
            <label className="block text-xs text-slate-400">Supervisor notes<textarea disabled={!canManage} value={form.supervisor_notes || ''} onChange={event => setField('supervisor_notes', event.target.value)} className={`${areaClass} mt-1 disabled:opacity-60`} /></label>
          </section>

          <section><h3 className="mb-3 text-sm font-bold text-slate-200">Audit trail</h3>{events.length ? <div className="space-y-2">{events.slice(0, 12).map(event => <div key={event.id} className="flex gap-3 rounded-xl border border-dark-700 bg-dark-800/60 p-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-500" /><div className="min-w-0"><p className="text-xs font-semibold capitalize text-slate-300">{String(event.event_type).replaceAll('_', ' ')}</p><p className="mt-0.5 text-[11px] text-slate-500">{event.actor_name || 'System'} · {displayDateTime(event.created_at)}</p>{event.notes ? <p className="mt-1 text-xs text-slate-400">{event.notes}</p> : null}</div></div>)}</div> : <p className="text-xs text-slate-500">No workflow events recorded yet.</p>}</section>
        </div>

        {canManage && stage !== 'closed' && stage !== 'cancelled' ? <div className="border-t border-dark-700 bg-dark-800 p-4"><div className="flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => saveDetails()} disabled={saving} className="btn-secondary disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save details</button>{actions.map(action => <button key={action.stage} type="button" onClick={() => transition(action)} disabled={!!transitioning || (action.stage === 'closed' && !releaseReady)} className={`justify-center disabled:opacity-50 ${action.stage === 'closed' ? 'btn-primary bg-emerald-600 hover:bg-emerald-500' : 'btn-primary'}`}>{transitioning === action.stage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{action.label}</button>)}</div>{stage === 'pending_approval' && !canApprove ? <p className="mt-2 text-right text-[11px] text-amber-400">A manager or admin must approve equipment release.</p> : null}{stage === 'pending_approval' && canApprove && !releaseReady ? <p className="mt-2 text-right text-[11px] text-amber-400">Complete diagnosis, work done, passed test and all release checks before approval.</p> : null}</div> : null}
      </div>
    </div>
  )
}

export default function WorkshopBoardTab({ companyId, role, initialStatus = 'active', onFilterChange }) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState(initialStatus || 'active')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createPrefill, setCreatePrefill] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const canManage = ['supervisor', 'manager', 'admin', 'superadmin'].includes(role)

  useEffect(() => {
    setFilter(initialStatus || 'active')
  }, [initialStatus])

  const selectFilter = value => {
    setFilter(value)
    onFilterChange?.(value)
  }

  const query = useQuery({
    queryKey: ['workshop-board', companyId],
    enabled: !!companyId,
    staleTime: 15_000,
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from('job_cards').select('*, equipment:equipment_id(id,name,equipment_number,category,status,current_meter_reading), project:project_id(id,project_name,project_code), job_card_parts(*), job_card_events(*)').eq('company_id', companyId).order('opened_at', { ascending: false }).limit(300),
        supabase.from('breakdown_alerts').select('id,equipment_id,equipment_name,project_id,incident_id,breakdown_cause,reported_at,reported_by_name,acknowledged_at').eq('company_id', companyId).is('resolved_at', null).order('reported_at', { ascending: false }),
        supabase.from('equipment').select('id,name,equipment_number,category,status,current_meter_reading,current_project_id').eq('company_id', companyId).neq('status', 'disposed').order('name'),
        supabase.from('projects').select('id,project_name,project_code').eq('company_id', companyId).order('project_name'),
        supabase.from('user_profiles').select('id,full_name,designation,is_active').eq('company_id', companyId).eq('is_active', true).order('full_name'),
        supabase.from('inventory_items').select('id,item_code,item_name,unit,avg_unit_cost,is_active').eq('company_id', companyId).eq('is_active', true).order('item_name'),
        supabase.from('stores').select('id,store_name,store_code,is_active').eq('company_id', companyId).eq('is_active', true).order('store_name'),
        supabase.from('inventory_stock').select('id,item_id,store_id,quantity_on_hand,avg_unit_cost').eq('company_id', companyId),
      ])
      const error = results.find(result => result.error)?.error
      if (error) throw error
      return {
        jobs: results[0].data || [], alerts: results[1].data || [], equipment: results[2].data || [], projects: results[3].data || [],
        staff: results[4].data || [], items: results[5].data || [], stores: results[6].data || [], stocks: results[7].data || [],
      }
    },
  })

  const data = query.data || { jobs: [], alerts: [], equipment: [], projects: [], staff: [], items: [], stores: [], stocks: [] }
  const metrics = useMemo(() => buildWorkshopMetrics(data.jobs), [data.jobs])
  const linkedAlerts = useMemo(() => new Set(data.jobs.map(job => job.breakdown_alert_id).filter(Boolean)), [data.jobs])
  const unconvertedAlerts = data.alerts.filter(alert => !linkedAlerts.has(alert.id))
  const selectedJob = data.jobs.find(job => job.id === selectedId) || null

  const rows = useMemo(() => {
    const stageRows = filterWorkshopJobs(data.jobs, filter)
    const needle = search.trim().toLowerCase()
    return stageRows.filter(job => {
      if (typeFilter !== 'all' && job.jc_type !== typeFilter) return false
      if (!needle) return true
      return [job.jc_number, job.equipment_name, job.equipment?.equipment_number, job.complaint, job.technician_name, job.project?.project_name]
        .some(value => String(value || '').toLowerCase().includes(needle))
    }).sort((a, b) => Number(isWorkshopOverdue(b)) - Number(isWorkshopOverdue(a)) || String(b.updated_at).localeCompare(String(a.updated_at)))
  }, [data.jobs, filter, search, typeFilter])

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['workshop-board', companyId] })
    await qc.invalidateQueries({ queryKey: ['pm-control-tower', companyId] })
  }

  const startCreate = prefill => {
    setCreatePrefill(prefill || null)
    setShowCreate(true)
  }

  const finishCreate = async jobId => {
    setShowCreate(false)
    setCreatePrefill(null)
    await refresh()
    setSelectedId(jobId)
  }

  if (query.isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary-400" /></div>
  if (query.isError) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">Workshop data could not be loaded: {query.error?.message}</div>

  const filterLabel = filter === 'active' ? 'All active jobs' : filter === 'overdue' ? 'SLA overdue' : STAGE_META[filter]?.label || 'All jobs'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-100">Workshop execution board</h2><p className="mt-1 text-xs text-slate-500">Complaint → diagnosis → parts → repair → testing → release</p></div>{canManage ? <button type="button" onClick={() => startCreate(null)} className="btn-primary"><Plus className="h-4 w-4" />New job card</button> : null}</div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-9">
        <MetricTile active={filter === 'active'} icon={Wrench} label="All Active" value={metrics.active} tone="text-primary-400" onClick={() => selectFilter('active')} />
        <MetricTile active={filter === 'open'} icon={ClipboardCheck} label="Open" value={metrics.open} tone="text-slate-300" onClick={() => selectFilter('open')} />
        <MetricTile active={filter === 'assigned'} icon={UserRoundCheck} label="Assigned" value={metrics.assigned} tone="text-cyan-400" onClick={() => selectFilter('assigned')} />
        <MetricTile active={filter === 'awaiting_parts'} icon={Boxes} label="Parts" value={metrics.awaiting_parts} tone="text-amber-400" onClick={() => selectFilter('awaiting_parts')} />
        <MetricTile active={filter === 'in_progress'} icon={PlayCircle} label="In Progress" value={metrics.in_progress} tone="text-blue-400" onClick={() => selectFilter('in_progress')} />
        <MetricTile active={filter === 'testing'} icon={TestTube2} label="Testing" value={metrics.testing} tone="text-purple-400" onClick={() => selectFilter('testing')} />
        <MetricTile active={filter === 'pending_approval'} icon={ShieldCheck} label="Approval" value={metrics.pending_approval} tone="text-orange-400" onClick={() => selectFilter('pending_approval')} />
        <MetricTile active={filter === 'overdue'} icon={AlertTriangle} label="Overdue" value={metrics.overdue} tone="text-red-400" onClick={() => selectFilter('overdue')} />
        <MetricTile active={filter === 'closed'} icon={CheckCircle2} label="Closed" value={metrics.closed} tone="text-emerald-400" onClick={() => selectFilter('closed')} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><p className="text-[11px] text-slate-500">Active cost exposure</p><p className="mt-1 text-lg font-bold text-emerald-400">{money(metrics.activeCost)}</p></div><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><p className="text-[11px] text-slate-500">Recorded active downtime</p><p className="mt-1 text-lg font-bold text-orange-400">{metrics.activeDowntime.toFixed(1)} hrs</p></div><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><p className="text-[11px] text-slate-500">MTTR from closed jobs</p><p className="mt-1 text-lg font-bold text-primary-400">{metrics.mttr.toFixed(1)} hrs</p></div></div>

      {unconvertedAlerts.length > 0 ? <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-400" /><h3 className="text-sm font-bold text-red-300">{unconvertedAlerts.length} breakdown alert{unconvertedAlerts.length === 1 ? '' : 's'} awaiting a job card</h3></div><div className="mt-3 grid gap-2 lg:grid-cols-2">{unconvertedAlerts.map(alert => <div key={alert.id} className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-dark-800/70 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-200">{alert.equipment_name}</p><p className="truncate text-xs text-slate-500">{alert.breakdown_cause || 'Breakdown reported'} · {formatDistanceToNow(new Date(alert.reported_at), { addSuffix: true })}</p></div>{canManage ? <button type="button" onClick={() => startCreate({ equipment_id: alert.equipment_id, jc_type: 'breakdown', complaint: alert.breakdown_cause || 'Breakdown reported', priority: 'critical', project_id: alert.project_id, breakdown_alert_id: alert.id, incident_id: alert.incident_id })} className="btn-primary shrink-0 text-xs">Create job card</button> : null}</div>)}</div></section> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dark-700 bg-dark-800 p-3"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} className={`${fieldClass} pl-9`} placeholder="Search job, machine, complaint, technician…" /></div><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="rounded-xl border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-slate-200 outline-none"><option value="all">All job types</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>

      <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-200">{filterLabel}</p><p className="text-xs text-slate-500">{rows.length} matching job card{rows.length === 1 ? '' : 's'} — tile filter applied exactly</p></div>{filter !== 'active' ? <button type="button" onClick={() => selectFilter('active')} className="text-xs text-primary-400 hover:text-primary-300">Clear filter</button> : null}</div>

      {rows.length === 0 ? <div className="rounded-2xl border border-dark-700 bg-dark-800 py-16 text-center"><Wrench className="mx-auto h-10 w-10 text-slate-700" /><p className="mt-3 text-sm font-semibold text-slate-400">No job cards match {filterLabel.toLowerCase()}</p><p className="mt-1 text-xs text-slate-600">Choose another workflow tile or create a new job card.</p></div> : <div className="grid gap-3 xl:grid-cols-2">{rows.map(job => {
        const stage = workshopStage(job)
        const overdue = isWorkshopOverdue(job)
        const issued = (job.job_card_parts || []).filter(part => ['issued','manual'].includes(part.issue_status)).length
        const requested = (job.job_card_parts || []).filter(part => !['issued','manual'].includes(part.issue_status)).length
        return <button key={job.id} type="button" onClick={() => setSelectedId(job.id)} className={`rounded-2xl border bg-dark-800 p-4 text-left transition-colors hover:border-primary-500/60 ${overdue ? 'border-red-500/40' : 'border-dark-700'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-primary-400">{job.jc_number}</span><StageBadge stage={stage} /><span className={`text-[10px] font-semibold capitalize ${PRIORITY_TONES[job.priority]}`}>{job.priority}</span>{overdue ? <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">SLA overdue</span> : null}</div><h3 className="mt-2 truncate text-sm font-bold text-slate-100">{job.equipment?.equipment_number} · {job.equipment_name || job.equipment?.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{job.complaint || 'No complaint recorded'}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" /></div><div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4"><div><span className="text-slate-600">Technician</span><p className="mt-0.5 truncate text-slate-300">{job.technician_name || 'Unassigned'}</p></div><div><span className="text-slate-600">Project</span><p className="mt-0.5 truncate text-slate-300">{job.project?.project_name || '—'}</p></div><div><span className="text-slate-600">Parts</span><p className="mt-0.5 text-slate-300">{issued} issued{requested ? ` · ${requested} waiting` : ''}</p></div><div><span className="text-slate-600">Cost / downtime</span><p className="mt-0.5 text-slate-300">{money(job.total_cost)} · {Number(job.downtime_hours || 0).toFixed(1)}h</p></div></div><div className="mt-3 flex items-center justify-between border-t border-dark-700 pt-3 text-[11px]"><span className="text-slate-500">{TYPE_LABELS[job.jc_type]} · {formatDistanceToNow(new Date(job.opened_at || job.created_at), { addSuffix: true })}</span>{job.sla_due_at ? <span className={overdue ? 'text-red-400' : 'text-slate-500'}><Clock3 className="mr-1 inline h-3 w-3" />{displayDateTime(job.sla_due_at)}</span> : null}</div></button>
      })}</div>}

      {showCreate ? <CreateJobModal companyId={companyId} data={data} prefill={createPrefill} onClose={() => { setShowCreate(false); setCreatePrefill(null) }} onCreated={finishCreate} /> : null}
      {selectedJob ? <JobDetailPanel job={selectedJob} companyId={companyId} data={data} role={role} onClose={() => setSelectedId(null)} onChanged={refresh} /> : null}
    </div>
  )
}
