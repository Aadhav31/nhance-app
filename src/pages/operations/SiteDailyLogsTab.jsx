import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle, Camera, Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck,
  Clock, FileCheck2, Gauge, Image, Loader2, MapPin, RefreshCw, RotateCcw,
  Send, Truck, User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { dailyLogProgress, IDLE_REASONS, toDailyLogPayload, validateDailyLogEntry } from '../../lib/dailyLogWorkflow'

const localDate = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const WORKFLOW_META = {
  draft: { label: 'Draft', className: 'text-slate-400 bg-slate-500/10 border-slate-600/40' },
  submitted: { label: 'Awaiting approval', className: 'text-amber-400 bg-amber-500/10 border-amber-700/40' },
  approved: { label: 'Approved', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-700/40' },
  rejected: { label: 'Returned', className: 'text-red-400 bg-red-500/10 border-red-700/40' },
}

const inputClass = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500 disabled:opacity-50'

function useSiteLogs(companyId, opsDate, shiftType) {
  return useQuery({
    queryKey: ['site-daily-logs', companyId, opsDate, shiftType],
    enabled: Boolean(companyId && opsDate),
    staleTime: 15_000,
    queryFn: async () => {
      const responses = await Promise.all([
        supabase.from('equipment')
          .select('id,name,equipment_number,category,status,current_project_id,current_meter_reading')
          .eq('company_id', companyId).neq('status', 'disposed').order('name'),
        supabase.from('equipment_deployments')
          .select('id,equipment_id,project_id,deployed_date,withdrawn_date,status,operator_name,deployment_location')
          .eq('company_id', companyId).lte('deployed_date', opsDate)
          .or(`status.eq.active,withdrawn_date.gte.${opsDate}`),
        supabase.from('projects')
          .select('id,project_name,project_code,site_name,status,is_active')
          .eq('company_id', companyId).order('project_name'),
        supabase.from('daily_operations')
          .select('*').eq('company_id', companyId).eq('ops_date', opsDate).eq('shift_type', shiftType),
      ])
      const labels = ['equipment', 'deployments', 'projects', 'daily logs']
      const failedIndex = responses.findIndex(response => response.error)
      if (failedIndex >= 0) throw new Error(`${labels[failedIndex]} could not be loaded: ${responses[failedIndex].error.message}`)
      return {
        equipment: responses[0].data || [], deployments: responses[1].data || [],
        projects: responses[2].data || [], logs: responses[3].data || [],
      }
    },
  })
}

function useApprovalQueue(companyId, enabled) {
  return useQuery({
    queryKey: ['daily-log-approval-queue', companyId],
    enabled: Boolean(companyId && enabled),
    staleTime: 15_000,
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - 45)
      const { data, error } = await supabase.from('daily_operations')
        .select('*,equipment:equipment_id(id,name,equipment_number,category),project:project_id(id,project_name,site_name)')
        .eq('company_id', companyId).eq('workflow_status', 'submitted')
        .gte('ops_date', since.toISOString().slice(0, 10))
        .order('ops_date', { ascending: true }).order('submitted_at', { ascending: true })
      if (error) throw error
      const submitterIds = [...new Set((data || []).map(item => item.created_by).filter(Boolean))]
      let profiles = []
      if (submitterIds.length) {
        const response = await supabase.from('user_profiles').select('id,full_name').in('id', submitterIds)
        profiles = response.data || []
      }
      const names = Object.fromEntries(profiles.map(item => [item.id, item.full_name]))
      return (data || []).map(item => ({ ...item, submitter_name: names[item.created_by] || 'Site team' }))
    },
  })
}

async function uploadLogPhoto(file, companyId, equipmentId, opsDate, kind) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image file')
  if (file.size > 8 * 1024 * 1024) throw new Error('Photo must be below 8 MB')
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${companyId}/daily-logs/${opsDate}/${equipmentId}_${kind}_${Date.now()}.${extension}`
  const { error } = await supabase.storage.from('nhance-photos').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return supabase.storage.from('nhance-photos').getPublicUrl(path).data.publicUrl
}

function PhotoField({ label, value, disabled, uploading, onFile }) {
  const inputRef = useRef(null)
  return (
    <div>
      <p className="text-[10px] text-slate-500 mb-1">{label}</p>
      <button type="button" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}
        className={`w-full rounded-lg border px-2.5 py-2 text-xs flex items-center justify-center gap-1.5 ${value ? 'border-emerald-700/40 bg-emerald-500/10 text-emerald-400' : 'border-dark-600 bg-dark-700 text-slate-400'} disabled:opacity-50`}>
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : value ? <Check className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
        {uploading ? 'Uploading…' : value ? 'Attached' : 'Add photo'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = '' }} />
    </div>
  )
}

function LogCard({ row, form, selected, onSelect, onChange, onPhoto, photoBusy, focus }) {
  const [expanded, setExpanded] = useState(Boolean(focus || !row.existing))
  const workflow = row.existing?.workflow_status || 'draft'
  const locked = ['submitted', 'approved'].includes(workflow)
  const errors = validateDailyLogEntry(form)
  const meta = WORKFLOW_META[workflow]
  return (
    <article className={`rounded-xl border bg-dark-800 transition-colors ${selected ? 'border-primary-500/60' : 'border-dark-700'} ${focus ? 'ring-1 ring-primary-500/40' : ''}`}>
      <div className="p-3 flex items-start gap-2.5">
        <input type="checkbox" checked={selected} disabled={locked} onChange={event => onSelect(event.target.checked)} className="mt-1 accent-primary-500" />
        <button type="button" onClick={() => setExpanded(value => !value)} className="flex-1 min-w-0 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-100 truncate">{row.equipment.name} <span className="text-xs text-primary-500">{row.equipment.equipment_number}</span></p><p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> <span className="truncate">{row.project?.project_name || 'Project not assigned'}{row.project?.site_name ? ` · ${row.project.site_name}` : ''}</span></p></div>
            <div className="flex items-center gap-1.5 shrink-0"><span className={`px-2 py-0.5 rounded-full border text-[10px] ${meta.className}`}>{meta.label}</span>{expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}</div>
          </div>
          {!expanded && <p className="text-[11px] text-slate-500 mt-1">{form.status} · {form.running_hours || 0} hrs · {form.fuel_consumed || 0} L</p>}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-dark-700 p-3 space-y-3">
          {row.existing?.workflow_status === 'rejected' && <div className="rounded-lg border border-red-700/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"><span className="font-semibold">Returned:</span> {row.existing.review_note || 'Please correct and resubmit.'}</div>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-[10px] text-slate-500">Status<select disabled={locked} value={form.status} onChange={event => onChange('status', event.target.value)} className={`${inputClass} mt-1 capitalize`}><option value="working">Working</option><option value="idle">Idle</option><option value="breakdown">Breakdown</option><option value="maintenance">Maintenance</option></select></label>
            <label className="text-[10px] text-slate-500">Running hours<input disabled={locked} type="number" min="0" max="24" step="0.1" value={form.running_hours} onChange={event => onChange('running_hours', event.target.value)} className={`${inputClass} mt-1`} placeholder="0.0" /></label>
            <label className="text-[10px] text-slate-500">Fuel consumed<input disabled={locked} type="number" min="0" step="0.1" value={form.fuel_consumed} onChange={event => onChange('fuel_consumed', event.target.value)} className={`${inputClass} mt-1`} placeholder="Litres" /></label>
            <label className="text-[10px] text-slate-500">Meter reading<input disabled={locked} type="number" min="0" step="0.1" value={form.meter_reading} onChange={event => onChange('meter_reading', event.target.value)} className={`${inputClass} mt-1`} placeholder="Hour meter / km" /></label>
          </div>
          {form.status === 'idle' && <label className="text-[10px] text-slate-500 block">Idle reason<select disabled={locked} value={form.idle_reason} onChange={event => onChange('idle_reason', event.target.value)} className={`${inputClass} mt-1`}><option value="">Select the reason…</option>{IDLE_REASONS.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label>}
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="text-[10px] text-slate-500">Operator<input disabled={locked} value={form.operator_name} onChange={event => onChange('operator_name', event.target.value)} className={`${inputClass} mt-1`} placeholder="Operator name" /></label>
            <label className="text-[10px] text-slate-500">Work performed<input disabled={locked} value={form.activity} onChange={event => onChange('activity', event.target.value)} className={`${inputClass} mt-1`} placeholder="Excavation, loading, transport…" /></label>
          </div>
          <label className="text-[10px] text-slate-500 block">Remarks<textarea disabled={locked} rows={2} value={form.notes} onChange={event => onChange('notes', event.target.value)} className={`${inputClass} mt-1 resize-none`} placeholder="Site conditions, stoppages or handover notes" /></label>
          <div className="grid grid-cols-2 gap-2"><PhotoField label="Meter photo" value={form.meter_photo_url} disabled={locked} uploading={photoBusy === 'meter'} onFile={file => onPhoto('meter', file)} /><PhotoField label="Log-sheet photo" value={form.logsheet_photo_url} disabled={locked} uploading={photoBusy === 'logsheet'} onFile={file => onPhoto('logsheet', file)} /></div>
          {selected && errors.length > 0 && <p className="text-[11px] text-red-400 flex items-start gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{errors.join(' · ')}</p>}
          {locked && <p className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{workflow === 'approved' ? 'Approved logs are locked.' : 'Submitted logs are locked until reviewed.'}</p>}
        </div>
      )}
    </article>
  )
}

function ApprovalCard({ item, busy, onReview }) {
  const [note, setNote] = useState('')
  const [returning, setReturning] = useState(false)
  return (
    <article className="card p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-100">{item.equipment?.name || item.equipment_name} <span className="text-xs text-primary-500">{item.equipment?.equipment_number}</span></p><p className="text-xs text-slate-500 mt-1">{item.project?.project_name || 'Unassigned'}{item.project?.site_name ? ` · ${item.project.site_name}` : ''}</p></div><span className="badge bg-amber-500/10 text-amber-400 border-amber-700/40">Awaiting approval</span></div>
      <div className="grid grid-cols-4 gap-2 text-center"><div className="rounded-lg bg-dark-700 p-2"><p className="text-[10px] text-slate-500">Date</p><p className="text-xs font-semibold text-slate-200">{item.ops_date}</p></div><div className="rounded-lg bg-dark-700 p-2"><p className="text-[10px] text-slate-500">Status</p><p className="text-xs font-semibold text-slate-200 capitalize">{item.status}</p></div><div className="rounded-lg bg-dark-700 p-2"><p className="text-[10px] text-slate-500">Hours</p><p className="text-xs font-semibold text-primary-400">{Number(item.running_hours || 0).toFixed(1)}</p></div><div className="rounded-lg bg-dark-700 p-2"><p className="text-[10px] text-slate-500">Fuel</p><p className="text-xs font-semibold text-amber-400">{Number(item.fuel_consumed || 0).toFixed(0)} L</p></div></div>
      <div className="text-xs text-slate-500"><p><User className="w-3 h-3 inline mr-1" />{item.submitter_name} · {item.shift_type} shift</p>{item.activity && <p className="mt-1 text-slate-400">{item.activity}</p>}{item.notes && <p className="mt-1">{item.notes}</p>}</div>
      {(item.meter_photo_url || item.logsheet_photo_url) && <div className="flex gap-2">{item.meter_photo_url && <a href={item.meter_photo_url} target="_blank" rel="noreferrer" className="text-xs text-primary-400 flex items-center gap-1"><Gauge className="w-3 h-3" /> Meter photo</a>}{item.logsheet_photo_url && <a href={item.logsheet_photo_url} target="_blank" rel="noreferrer" className="text-xs text-primary-400 flex items-center gap-1"><Image className="w-3 h-3" /> Log sheet</a>}</div>}
      {returning && <textarea value={note} onChange={event => setNote(event.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Reason for returning this log…" />}
      <div className="flex gap-2">{returning ? <><button disabled={busy || !note.trim()} onClick={() => onReview('rejected', note)} className="btn-primary bg-red-600 hover:bg-red-500 flex-1 justify-center text-xs disabled:opacity-50">Confirm return</button><button onClick={() => setReturning(false)} className="btn-secondary text-xs">Cancel</button></> : <><button disabled={busy} onClick={() => onReview('approved', null)} className="btn-primary bg-emerald-600 hover:bg-emerald-500 flex-1 justify-center text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button><button disabled={busy} onClick={() => setReturning(true)} className="btn-secondary text-red-400 text-xs"><RotateCcw className="w-3.5 h-3.5" /> Return</button></>}</div>
    </article>
  )
}

export default function SiteDailyLogsTab({ companyId, initialEquipmentId }) {
  const { role } = useAuth()
  const canReview = ['admin', 'manager', 'superadmin'].includes(role)
  const [mode, setMode] = useState('capture')
  const [opsDate, setOpsDate] = useState(localDate())
  const [shiftType, setShiftType] = useState('general')
  const [projectId, setProjectId] = useState('all')
  const [forms, setForms] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [photoBusy, setPhotoBusy] = useState({})
  const [saving, setSaving] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(null)
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useSiteLogs(companyId, opsDate, shiftType)
  const approvals = useApprovalQueue(companyId, canReview)

  const rows = useMemo(() => {
    if (!data) return []
    const equipmentById = Object.fromEntries(data.equipment.map(item => [item.id, item]))
    const projectById = Object.fromEntries(data.projects.map(item => [item.id, item]))
    const logByEquipment = Object.fromEntries(data.logs.map(item => [item.equipment_id, item]))
    const deployments = new Map()
    data.deployments.forEach(item => { if (!deployments.has(item.equipment_id)) deployments.set(item.equipment_id, item) })
    return [...deployments.entries()].flatMap(([equipmentId, deployment]) => {
      const equipment = equipmentById[equipmentId]
      if (!equipment) return []
      const project = projectById[deployment.project_id] || null
      return [{ equipment, deployment, project, existing: logByEquipment[equipmentId] || null }]
    }).sort((a, b) => (a.project?.project_name || '').localeCompare(b.project?.project_name || '') || a.equipment.name.localeCompare(b.equipment.name))
  }, [data])

  useEffect(() => {
    if (!rows.length) { setForms({}); setSelected(new Set()); return }
    const nextForms = {}
    const nextSelected = new Set()
    rows.forEach(row => {
      const log = row.existing
      nextForms[row.equipment.id] = {
        equipment_id: row.equipment.id,
        project_id: log?.project_id || row.deployment.project_id || '',
        status: log?.status || 'working',
        running_hours: log?.running_hours ?? '',
        fuel_consumed: log?.fuel_consumed ?? '',
        meter_reading: log?.meter_reading ?? '',
        operator_name: log?.operator_name || row.deployment.operator_name || '',
        activity: log?.activity || '', idle_reason: log?.idle_reason || '', notes: log?.notes || '',
        meter_photo_url: log?.meter_photo_url || '', logsheet_photo_url: log?.logsheet_photo_url || '',
      }
      if (!log || ['draft', 'rejected'].includes(log.workflow_status)) nextSelected.add(row.equipment.id)
    })
    setForms(nextForms)
    setSelected(nextSelected)
  }, [rows])

  const visibleRows = useMemo(() => rows.filter(row => (projectId === 'all' || row.project?.id === projectId) && (!initialEquipmentId || row.equipment.id === initialEquipmentId)), [rows, projectId, initialEquipmentId])
  const progress = useMemo(() => dailyLogProgress(visibleRows), [visibleRows])
  const selectedRows = visibleRows.filter(row => selected.has(row.equipment.id))

  const updateForm = (equipmentId, field, value) => setForms(current => ({ ...current, [equipmentId]: { ...current[equipmentId], [field]: value } }))
  const toggleAll = checked => setSelected(current => {
    const next = new Set(current)
    visibleRows.forEach(row => { if (!['submitted', 'approved'].includes(row.existing?.workflow_status)) checked ? next.add(row.equipment.id) : next.delete(row.equipment.id) })
    return next
  })

  const uploadPhoto = async (row, kind, file) => {
    const key = `${row.equipment.id}:${kind}`
    setPhotoBusy(current => ({ ...current, [row.equipment.id]: kind }))
    try {
      const url = await uploadLogPhoto(file, companyId, row.equipment.id, opsDate, kind)
      updateForm(row.equipment.id, kind === 'meter' ? 'meter_photo_url' : 'logsheet_photo_url', url)
      toast.success(`${kind === 'meter' ? 'Meter' : 'Log-sheet'} photo attached`)
    } catch (uploadError) { toast.error(uploadError.message) } finally {
      setPhotoBusy(current => { const next = { ...current }; delete next[row.equipment.id]; return next })
    }
  }

  const saveEntries = async submit => {
    if (!selectedRows.length) return toast.error('Select at least one machine')
    const invalid = selectedRows.map(row => ({ row, errors: validateDailyLogEntry(forms[row.equipment.id]) })).find(item => item.errors.length)
    if (invalid) return toast.error(`${invalid.row.equipment.name}: ${invalid.errors[0]}`)
    setSaving(true)
    try {
      const entries = selectedRows.map(row => toDailyLogPayload(forms[row.equipment.id], opsDate, shiftType))
      const { data: result, error: saveError } = await supabase.rpc('save_daily_log_batch', { p_entries: entries, p_submit: submit })
      if (saveError) throw saveError
      toast.success(submit ? `${result.saved} daily logs submitted` : `${result.saved} drafts saved`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['site-daily-logs', companyId] }),
        qc.invalidateQueries({ queryKey: ['daily-log-approval-queue', companyId] }),
        qc.invalidateQueries({ queryKey: ['operations-intelligence', companyId] }),
        qc.invalidateQueries({ queryKey: ['pm-control-tower', companyId] }),
      ])
      refetch()
    } catch (saveError) { toast.error(saveError.message) } finally { setSaving(false) }
  }

  const review = async (ids, action, note = null) => {
    setReviewBusy(ids.join(','))
    try {
      const { data: result, error: reviewError } = await supabase.rpc('review_daily_logs', { p_ids: ids, p_action: action, p_note: note })
      if (reviewError) throw reviewError
      toast.success(action === 'approved' ? `${result.reviewed} log${result.reviewed === 1 ? '' : 's'} approved` : 'Log returned for correction')
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['daily-log-approval-queue', companyId] }),
        qc.invalidateQueries({ queryKey: ['site-daily-logs', companyId] }),
      ])
      approvals.refetch()
    } catch (reviewError) { toast.error(reviewError.message) } finally { setReviewBusy(null) }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-3 pb-28 space-y-4">
      <section className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-3.5 flex items-start gap-3"><ClipboardCheck className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" /><div><p className="text-sm font-semibold text-slate-200">Site Daily Log &amp; Compliance</p><p className="text-xs text-slate-500 mt-0.5">Complete every deployed machine, submit once, and track manager approval.</p></div></section>

      {canReview && <div className="flex gap-2 border-b border-dark-700"><button onClick={() => setMode('capture')} className={`px-3 py-2 text-xs border-b-2 ${mode === 'capture' ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500'}`}>Capture logs</button><button onClick={() => setMode('approvals')} className={`px-3 py-2 text-xs border-b-2 flex items-center gap-1.5 ${mode === 'approvals' ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500'}`}>Approvals {approvals.data?.length > 0 && <span className="rounded-full bg-amber-500/20 text-amber-400 px-1.5">{approvals.data.length}</span>}</button></div>}

      {mode === 'approvals' && canReview ? (
        <>
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-200">Pending daily logs</p><p className="text-xs text-slate-500">Oldest submissions appear first.</p></div>{approvals.data?.length > 0 && <button disabled={Boolean(reviewBusy)} onClick={() => review(approvals.data.map(item => item.id), 'approved')} className="btn-primary bg-emerald-600 hover:bg-emerald-500 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Approve all</button>}</div>
          {approvals.isLoading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div> : approvals.isError ? <div className="card p-5 text-sm text-red-400">{approvals.error?.message}</div> : approvals.data?.length ? <div className="grid lg:grid-cols-2 gap-3">{approvals.data.map(item => <ApprovalCard key={item.id} item={item} busy={reviewBusy === item.id} onReview={(action, note) => review([item.id], action, note)} />)}</div> : <div className="card py-14 text-center"><FileCheck2 className="w-10 h-10 text-emerald-500/40 mx-auto" /><p className="text-sm font-semibold text-slate-300 mt-3">Approval queue is clear</p><p className="text-xs text-slate-500 mt-1">Submitted site logs will appear here.</p></div>}
        </>
      ) : (
        <>
          <section className="card p-3.5 space-y-3"><div className="flex flex-wrap items-end gap-2"><label className="text-[10px] text-slate-500">Log date<input type="date" value={opsDate} max={localDate()} onChange={event => setOpsDate(event.target.value)} className={`${inputClass} mt-1`} /></label><label className="text-[10px] text-slate-500">Shift<select value={shiftType} onChange={event => setShiftType(event.target.value)} className={`${inputClass} mt-1`}><option value="general">General</option><option value="day">Day</option><option value="night">Night</option></select></label><label className="text-[10px] text-slate-500 min-w-[200px] flex-1">Project / site<select value={projectId} onChange={event => setProjectId(event.target.value)} className={`${inputClass} mt-1`}><option value="all">All deployed projects</option>{data?.projects.map(project => <option key={project.id} value={project.id}>{project.project_name}{project.site_name ? ` · ${project.site_name}` : ''}</option>)}</select></label><button onClick={() => refetch()} className="btn-secondary text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button></div></section>

          <section className="grid grid-cols-2 sm:grid-cols-5 gap-2"><div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><Truck className="w-4 h-4 text-primary-400" /><p className="text-xl font-bold text-slate-100 mt-2">{progress.expected}</p><p className="text-[10px] text-slate-500">Expected</p></div><div className="rounded-xl border border-orange-700/30 bg-orange-500/5 p-3"><AlertCircle className="w-4 h-4 text-orange-400" /><p className="text-xl font-bold text-orange-400 mt-2">{progress.missing}</p><p className="text-[10px] text-slate-500">Missing</p></div><div className="rounded-xl border border-slate-700 bg-slate-500/5 p-3"><Clock className="w-4 h-4 text-slate-400" /><p className="text-xl font-bold text-slate-300 mt-2">{progress.draft}</p><p className="text-[10px] text-slate-500">Draft / returned</p></div><div className="rounded-xl border border-amber-700/30 bg-amber-500/5 p-3"><Send className="w-4 h-4 text-amber-400" /><p className="text-xl font-bold text-amber-400 mt-2">{progress.submitted}</p><p className="text-[10px] text-slate-500">Submitted</p></div><div className="rounded-xl border border-emerald-700/30 bg-emerald-500/5 p-3"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><p className="text-xl font-bold text-emerald-400 mt-2">{progress.approved}</p><p className="text-[10px] text-slate-500">Approved</p></div></section>

          <div className="flex items-center justify-between gap-3"><label className="text-xs text-slate-400 flex items-center gap-2"><input type="checkbox" checked={visibleRows.length > 0 && selectedRows.length === visibleRows.filter(row => !['submitted', 'approved'].includes(row.existing?.workflow_status)).length} onChange={event => toggleAll(event.target.checked)} className="accent-primary-500" /> Select editable machines</label><p className="text-xs text-slate-500">{selectedRows.length} selected</p></div>

          {isLoading ? <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div> : isError ? <div className="card p-5 text-sm text-red-400">{error?.message}</div> : visibleRows.length ? <div className="grid xl:grid-cols-2 gap-3">{visibleRows.map(row => forms[row.equipment.id] ? <LogCard key={row.equipment.id} row={row} form={forms[row.equipment.id]} selected={selected.has(row.equipment.id)} focus={row.equipment.id === initialEquipmentId} onSelect={checked => setSelected(current => { const next = new Set(current); checked ? next.add(row.equipment.id) : next.delete(row.equipment.id); return next })} onChange={(field, value) => updateForm(row.equipment.id, field, value)} onPhoto={(kind, file) => uploadPhoto(row, kind, file)} photoBusy={photoBusy[row.equipment.id]} /> : null)}</div> : <div className="card py-14 text-center"><MapPin className="w-10 h-10 text-slate-600 mx-auto" /><p className="text-sm font-semibold text-slate-300 mt-3">No deployed machines match this date</p><p className="text-xs text-slate-500 mt-1">Check the date or deployment records.</p></div>}

          {visibleRows.length > 0 && <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-30 border-t border-dark-700 bg-dark-900/95 backdrop-blur px-4 py-3"><div className="max-w-7xl mx-auto flex gap-2 justify-end"><button disabled={saving || selectedRows.length === 0} onClick={() => saveEntries(false)} className="btn-secondary text-sm disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />} Save drafts</button><button disabled={saving || selectedRows.length === 0} onClick={() => saveEntries(true)} className="btn-primary text-sm disabled:opacity-50"><Send className="w-4 h-4" /> Submit {selectedRows.length} log{selectedRows.length === 1 ? '' : 's'}</button></div></div>}
        </>
      )}
    </div>
  )
}
