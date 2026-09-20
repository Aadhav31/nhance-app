import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Gauge,
  Loader2, Plus, Search, Settings2, ShieldCheck, Wrench, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  classifyPmSchedule,
  filterPmSchedules,
  schedulePayload,
  summarizePmSchedules,
  validateScheduleForm,
} from '../../lib/preventiveMaintenance'

const fieldClass = 'w-full rounded-xl border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-slate-100 focus:border-primary-500 focus:outline-none'

const STATE_META = {
  overdue: { label: 'Overdue', icon: AlertTriangle, tone: 'text-red-400', box: 'border-red-500/30 bg-red-500/5', bar: 'bg-red-500' },
  due_soon: { label: 'Due soon', icon: CalendarClock, tone: 'text-amber-400', box: 'border-amber-500/30 bg-amber-500/5', bar: 'bg-amber-500' },
  work_order: { label: 'Work order open', icon: Wrench, tone: 'text-blue-400', box: 'border-blue-500/30 bg-blue-500/5', bar: 'bg-blue-500' },
  on_track: { label: 'On track', icon: ShieldCheck, tone: 'text-emerald-400', box: 'border-emerald-500/30 bg-emerald-500/5', bar: 'bg-emerald-500' },
}

const dateLabel = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'

function blankForm(schedule, equipment) {
  const current = Number(equipment?.current_meter_reading || 0)
  return {
    equipment_id: schedule?.equipment_id || equipment?.id || '',
    schedule_name: schedule?.schedule_name || (equipment ? '250 hr Service' : ''),
    interval_hours: String(schedule?.interval_hours ?? 250),
    alert_before_hours: String(schedule?.alert_before_hours ?? 50),
    last_done_meter: String(schedule?.last_done_meter ?? current),
    last_done_date: schedule?.last_done_date || '',
    next_due_meter: String(schedule?.next_due_meter ?? ''),
    next_due_date: schedule?.next_due_date || '',
    auto_create_job_card: schedule?.auto_create_job_card ?? true,
    tasks_text: Array.isArray(schedule?.tasks) ? schedule.tasks.map(item => item.task || item).filter(Boolean).join('\n') : '',
    notes: schedule?.notes || '',
  }
}

function ScheduleModal({ schedule, equipment: initialEquipment, equipmentList, companyId, onClose, onSaved }) {
  const [form, setForm] = useState(() => blankForm(schedule, initialEquipment))
  const [saving, setSaving] = useState(false)
  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const selectEquipment = equipmentId => {
    const equipment = equipmentList.find(item => item.id === equipmentId)
    const meter = Number(equipment?.current_meter_reading || 0)
    setForm(current => ({
      ...current,
      equipment_id: equipmentId,
      schedule_name: current.schedule_name || '250 hr Service',
      last_done_meter: String(meter),
      next_due_meter: String(meter + Number(current.interval_hours || 250)),
    }))
  }

  const save = async () => {
    const problem = validateScheduleForm(form)
    if (problem) { toast.error(problem); return }
    setSaving(true)
    try {
      const equipment = equipmentList.find(item => item.id === form.equipment_id)
      const payload = schedulePayload(form, companyId, equipment)
      const request = schedule
        ? supabase.from('pm_schedules').update(payload).eq('id', schedule.id)
        : supabase.from('pm_schedules').insert(payload)
      const { error } = await request
      if (error) throw error
      toast.success(schedule ? 'PM schedule updated' : 'PM schedule created')
      onSaved()
    } catch (error) {
      toast.error(error.message || 'Could not save PM schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-xl flex-col border-t border-dark-600 bg-dark-900 shadow-2xl sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between border-b border-dark-700 px-4 py-3">
          <div><p className="font-bold text-slate-100">{schedule ? 'Edit PM Schedule' : 'New PM Schedule'}</p><p className="text-xs text-slate-500">Operating-hour based preventive service</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-dark-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block text-xs text-slate-400">Equipment *<select value={form.equipment_id} onChange={event => selectEquipment(event.target.value)} className={`${fieldClass} mt-1`} disabled={Boolean(schedule)}><option value="">Select equipment…</option>{equipmentList.map(item => <option key={item.id} value={item.id}>{item.equipment_number} · {item.name}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">Schedule name *<input value={form.schedule_name} onChange={event => setField('schedule_name', event.target.value)} className={`${fieldClass} mt-1`} placeholder="250 hr Service" /></label>
            <label className="text-xs text-slate-400">Service interval (hours) *<input type="number" min="1" value={form.interval_hours} onChange={event => setField('interval_hours', event.target.value)} className={`${fieldClass} mt-1`} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-400">Last service meter<input type="number" min="0" step="0.1" value={form.last_done_meter} onChange={event => setField('last_done_meter', event.target.value)} className={`${fieldClass} mt-1`} /></label>
            <label className="text-xs text-slate-400">Next due meter<input type="number" min="0" step="0.1" value={form.next_due_meter} onChange={event => setField('next_due_meter', event.target.value)} className={`${fieldClass} mt-1`} placeholder="Auto-calculated" /></label>
            <label className="text-xs text-slate-400">Alert before (hours)<input type="number" min="0" step="1" value={form.alert_before_hours} onChange={event => setField('alert_before_hours', event.target.value)} className={`${fieldClass} mt-1`} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">Last service date<input type="date" value={form.last_done_date} onChange={event => setField('last_done_date', event.target.value)} className={`${fieldClass} mt-1`} /></label>
            <label className="text-xs text-slate-400">Calendar due date (optional)<input type="date" value={form.next_due_date} onChange={event => setField('next_due_date', event.target.value)} className={`${fieldClass} mt-1`} /></label>
          </div>
          <label className="block text-xs text-slate-400">Service checklist — one task per line<textarea value={form.tasks_text} onChange={event => setField('tasks_text', event.target.value)} className={`${fieldClass} mt-1 min-h-24 resize-none`} placeholder={'Change engine oil\nReplace oil filter\nInspect hydraulic hoses'} /></label>
          <label className="block text-xs text-slate-400">Notes<textarea value={form.notes} onChange={event => setField('notes', event.target.value)} className={`${fieldClass} mt-1 min-h-16 resize-none`} /></label>
          <label className="flex items-start gap-2 rounded-xl border border-dark-700 bg-dark-800 p-3 text-xs text-slate-300"><input type="checkbox" checked={form.auto_create_job_card} onChange={event => setField('auto_create_job_card', event.target.checked)} className="mt-0.5 accent-primary-500" /><span><strong>Automatically create a PM work order</strong><span className="mt-0.5 block text-slate-500">Triggered when an approved Site Log meter enters the alert window.</span></span></label>
        </div>
        <div className="flex gap-2 border-t border-dark-700 p-4"><button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button><button type="button" onClick={save} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{saving ? 'Saving…' : 'Save schedule'}</button></div>
      </div>
    </div>
  )
}

function CompleteModal({ row, onClose, onCompleted }) {
  const [meter, setMeter] = useState(String(row.pm.currentMeter))
  const [workDone, setWorkDone] = useState(row.schedule_name)
  const [technician, setTechnician] = useState('')
  const [saving, setSaving] = useState(false)

  const complete = async () => {
    if (!(Number(meter) >= Number(row.last_done_meter || 0))) { toast.error('Enter a valid completion meter'); return }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('complete_pm_job', {
        p_job_card_id: row.pm.openJob.id,
        p_meter: Number(meter),
        p_work_done: workDone.trim() || null,
        p_technician_name: technician.trim() || null,
      })
      if (error) throw error
      toast.success(`Service completed · next due at ${(Number(meter) + Number(row.interval_hours)).toLocaleString('en-IN')} hrs`)
      onCompleted()
    } catch (error) {
      toast.error(error.message || 'Could not complete PM service')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md border-t border-dark-600 bg-dark-900 p-4 sm:rounded-2xl sm:border">
        <div className="flex items-start justify-between"><div><p className="font-bold text-slate-100">Complete PM service</p><p className="text-xs text-slate-500">{row.equipment.equipment_number} · {row.schedule_name}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-dark-700"><X className="h-4 w-4" /></button></div>
        <div className="mt-4 space-y-3"><label className="block text-xs text-slate-400">Completion meter *<input type="number" min="0" step="0.1" value={meter} onChange={event => setMeter(event.target.value)} className={`${fieldClass} mt-1`} /></label><label className="block text-xs text-slate-400">Work completed<textarea value={workDone} onChange={event => setWorkDone(event.target.value)} className={`${fieldClass} mt-1 min-h-20 resize-none`} /></label><label className="block text-xs text-slate-400">Technician / vendor<input value={technician} onChange={event => setTechnician(event.target.value)} className={`${fieldClass} mt-1`} /></label></div>
        <div className="mt-4 flex gap-2"><button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button><button type="button" onClick={complete} disabled={saving} className="btn-primary flex-1 justify-center bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}Complete service</button></div>
      </div>
    </div>
  )
}

export default function PreventiveMaintenanceTab({ companyId, role, initialState = 'all' }) {
  const qc = useQueryClient()
  const canManage = ['supervisor', 'manager', 'admin', 'superadmin'].includes(role)
  const [stateFilter, setStateFilter] = useState(initialState || 'all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [completing, setCompleting] = useState(null)
  const [opening, setOpening] = useState(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pm-planner', companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async () => {
      const [equipmentResult, schedulesResult, jobsResult] = await Promise.all([
        supabase.from('equipment').select('id,name,equipment_number,current_meter_reading,meter_type,status,current_project_id').eq('company_id', companyId).neq('status', 'disposed').order('name'),
        supabase.from('pm_schedules').select('*').eq('company_id', companyId).eq('is_active', true).order('next_due_meter'),
        supabase.from('job_cards').select('id,jc_number,pm_schedule_id,status,opened_date,meter_at_open,complaint').eq('company_id', companyId).eq('jc_type', 'pm_service').in('status', ['open', 'in_progress']),
      ])
      const failure = equipmentResult.error || schedulesResult.error || jobsResult.error
      if (failure) throw failure
      const equipment = equipmentResult.data || []
      const equipmentById = Object.fromEntries(equipment.map(item => [item.id, item]))
      const jobBySchedule = Object.fromEntries((jobsResult.data || []).filter(item => item.pm_schedule_id).map(item => [item.pm_schedule_id, item]))
      const schedules = (schedulesResult.data || []).map(schedule => {
        const machine = equipmentById[schedule.equipment_id] || { id: schedule.equipment_id, name: schedule.equipment_name || 'Unknown equipment', current_meter_reading: 0 }
        const enriched = { ...schedule, equipment: machine, openJob: jobBySchedule[schedule.id] || null }
        return { ...enriched, pm: classifyPmSchedule(enriched, machine) }
      })
      return { equipment, schedules }
    },
  })

  const schedules = data?.schedules || []
  const summary = useMemo(() => summarizePmSchedules(schedules), [schedules])
  const filtered = useMemo(() => filterPmSchedules(schedules, stateFilter, search), [schedules, stateFilter, search])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pm-planner', companyId] })
    qc.invalidateQueries({ queryKey: ['maintenance_records', companyId] })
    qc.invalidateQueries({ queryKey: ['pm-control-tower', companyId] })
  }

  const openWorkOrder = async row => {
    setOpening(row.id)
    try {
      const { error } = await supabase.rpc('open_pm_job', { p_schedule_id: row.id })
      if (error) throw error
      toast.success('PM work order opened')
      refresh()
    } catch (error) {
      toast.error(error.message || 'Could not open PM work order')
    } finally {
      setOpening(null)
    }
  }

  const tiles = [
    { key: 'all', label: 'All schedules', value: summary.total, icon: Gauge, tone: 'text-primary-400' },
    { key: 'action_due', label: 'Action due', value: summary.overdue + summary.due_soon + summary.work_order, icon: CalendarClock, tone: 'text-orange-400' },
    { key: 'overdue', label: 'Overdue', value: summary.overdue, icon: AlertTriangle, tone: 'text-red-400' },
    { key: 'due_soon', label: 'Due soon', value: summary.due_soon, icon: CalendarClock, tone: 'text-amber-400' },
    { key: 'work_order', label: 'Work orders', value: summary.work_order, icon: Wrench, tone: 'text-blue-400' },
    { key: 'on_track', label: 'On track', value: summary.on_track, icon: ShieldCheck, tone: 'text-emerald-400' },
  ]

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary-400" /></div>
  if (isError) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">PM planner could not be loaded. <button type="button" onClick={() => refetch()} className="ml-2 underline">Retry</button></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-100">Preventive Maintenance Planner</h2><p className="text-xs text-slate-500">Approved Site Log meters drive service alerts and work orders automatically.</p></div>{canManage ? <button type="button" onClick={() => setShowCreate(true)} className="btn-primary text-sm"><Plus className="h-4 w-4" />New schedule</button> : null}</div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{tiles.map(tile => <button key={tile.key} type="button" onClick={() => setStateFilter(tile.key)} className={`rounded-xl border p-3 text-left transition-colors ${stateFilter === tile.key ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700 bg-dark-800 hover:border-dark-600'}`}><div className="flex items-center justify-between"><tile.icon className={`h-4 w-4 ${tile.tone}`} /><span className="text-[10px] text-slate-500">View filtered</span></div><p className={`mt-2 text-xl font-bold ${tile.tone}`}>{tile.value}</p><p className="text-[10px] text-slate-500">{tile.label}</p></button>)}</div>

      <div className="flex items-center gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search machine or schedule…" className={`${fieldClass} pl-9`} /></div><button type="button" onClick={() => refetch()} className="btn-secondary text-sm">Refresh</button></div>

      {filtered.length === 0 ? <div className="card py-16 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-emerald-500/40" /><p className="mt-3 text-sm font-semibold text-slate-300">No schedules in this filter</p><p className="mt-1 text-xs text-slate-500">Select another status tile or create a PM schedule.</p></div> : <div className="grid gap-3 lg:grid-cols-2">{filtered.map(row => {
        const meta = STATE_META[row.pm.state]
        const StateIcon = meta.icon
        const unit = row.equipment.meter_type === 'kilometers' ? 'km' : 'hrs'
        return <article key={row.id} className={`rounded-xl border p-4 ${meta.box}`}>
          <div className="flex items-start gap-3"><div className={`rounded-lg bg-dark-900/50 p-2 ${meta.tone}`}><StateIcon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold text-slate-100">{row.equipment.equipment_number} · {row.equipment.name}</p><span className={`rounded-full border border-current/20 px-2 py-0.5 text-[10px] ${meta.tone}`}>{meta.label}</span></div><p className="mt-0.5 text-xs text-slate-400">{row.schedule_name} · every {Number(row.interval_hours).toLocaleString('en-IN')} {unit}</p></div>{canManage ? <button type="button" onClick={() => setEditing(row)} className="rounded-lg p-2 text-slate-500 hover:bg-dark-700 hover:text-slate-300" aria-label={`Edit ${row.schedule_name}`}><Settings2 className="h-4 w-4" /></button> : null}</div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-dark-900/40 p-2"><p className="text-[10px] text-slate-500">Current</p><p className="text-sm font-bold text-slate-200">{row.pm.currentMeter.toLocaleString('en-IN')}</p></div><div className="rounded-lg bg-dark-900/40 p-2"><p className="text-[10px] text-slate-500">Next due</p><p className={`text-sm font-bold ${meta.tone}`}>{row.pm.nextMeter == null ? '—' : row.pm.nextMeter.toLocaleString('en-IN')}</p></div><div className="rounded-lg bg-dark-900/40 p-2"><p className="text-[10px] text-slate-500">Remaining</p><p className={`text-sm font-bold ${meta.tone}`}>{row.pm.hoursRemaining == null ? '—' : `${Math.round(row.pm.hoursRemaining).toLocaleString('en-IN')} ${unit}`}</p></div></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-dark-900/70"><div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${row.pm.progress}%` }} /></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>Last service: {row.last_done_meter == null ? 'Not recorded' : `${Number(row.last_done_meter).toLocaleString('en-IN')} ${unit}`}{row.last_done_date ? ` · ${dateLabel(row.last_done_date)}` : ''}</span>{row.next_due_date ? <span>Calendar due: {dateLabel(row.next_due_date)}</span> : null}</div>
          {row.notes ? <p className="mt-2 rounded-lg bg-dark-900/30 px-2.5 py-2 text-[11px] text-slate-500">{row.notes}</p> : null}
          {canManage ? <div className="mt-3 flex justify-end">{row.pm.openJob ? <button type="button" onClick={() => setCompleting(row)} className="btn-primary bg-emerald-600 text-xs hover:bg-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" />Complete {row.pm.openJob.jc_number}</button> : <button type="button" onClick={() => openWorkOrder(row)} disabled={opening === row.id} className="btn-secondary text-xs disabled:opacity-50">{opening === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}Open PM work order</button>}</div> : null}
        </article>
      })}</div>}

      {(showCreate || editing) ? <ScheduleModal schedule={editing} equipment={editing?.equipment} equipmentList={data?.equipment || []} companyId={companyId} onClose={() => { setShowCreate(false); setEditing(null) }} onSaved={() => { setShowCreate(false); setEditing(null); refresh() }} /> : null}
      {completing ? <CompleteModal row={completing} onClose={() => setCompleting(null)} onCompleted={() => { setCompleting(null); refresh() }} /> : null}
    </div>
  )
}
