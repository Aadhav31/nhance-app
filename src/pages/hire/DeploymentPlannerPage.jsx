import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Plus, Search, Truck, AlertTriangle, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/shared/Modal'
import { addDateDays, agreedRateAmount, bookingConflicts, equipmentPlanningState, localDateKey, plannerDayState } from '../../lib/deploymentPlanner'

const EMPTY_DATA = { equipment: [], projects: [], deployments: [], plans: [] }
const INPUT = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'
const STATES = {
  available: { label: 'Available', color: 'text-emerald-400', cell: 'bg-emerald-500/15 border-emerald-500/25' },
  planned: { label: 'Planned / confirmed', color: 'text-blue-400', cell: 'bg-blue-500/30 border-blue-500/40' },
  deployed: { label: 'Deployed', color: 'text-primary-400', cell: 'bg-primary-500/35 border-primary-500/45' },
  return_due: { label: 'Return due', color: 'text-amber-400', cell: 'bg-amber-500/30 border-amber-500/40' },
  unavailable: { label: 'Not ready', color: 'text-red-400', cell: 'bg-red-500/20 border-red-500/30' },
}
const dateLabel = value => value ? format(parseISO(value), 'd MMM yyyy') : 'Not recorded'
const projectName = (projects, id) => projects.find(item => item.id === id)?.project_name || 'Unlinked project'

async function fetchAll(queryFactory) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await queryFactory().range(offset, offset + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

function Field({ label, children, hint }) {
  return <label className="block space-y-1.5"><span className="text-sm text-slate-400">{label}</span>{children}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</label>
}

function usePlannerMutation(companyId, onSuccess) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async action => {
      const { data, error } = await action()
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['deployment-planner', companyId] })
      qc.invalidateQueries({ queryKey: ['equipment', companyId] })
      qc.invalidateQueries({ queryKey: ['active_eq_deployments', companyId] })
      qc.invalidateQueries({ queryKey: ['eq_with_project', companyId] })
      qc.invalidateQueries({ queryKey: ['pm-control-tower', companyId] })
      qc.invalidateQueries({ queryKey: ['planner-conflicts', companyId] })
      onSuccess()
    },
    onError: error => toast.error(error.code === '23P01' ? 'These dates clash with another booking. Choose different dates or a different machine.' : error.message || 'Could not save the deployment.'),
  })
}

function BookingForm({ companyId, data, initial, onClose }) {
  const [form, setForm] = useState(() => ({
    equipment_id: initial?.equipment_id || '', project_id: initial?.project_id || '',
    mobilisation_date: initial?.mobilisation_date || localDateKey(),
    expected_return_date: initial?.expected_return_date || addDateDays(initial?.mobilisation_date || localDateKey(), 6),
    status: initial?.status || 'planned', site_name: initial?.site_name || '', notes: initial?.notes || '',
  }))
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const machine = data.equipment.find(item => item.id === form.equipment_id)
  const { data: conflictsData, isFetching, isError } = useQuery({
    queryKey: ['planner-conflicts', companyId, form.equipment_id, form.mobilisation_date, form.expected_return_date],
    enabled: Boolean(form.equipment_id && form.mobilisation_date && form.expected_return_date),
    staleTime: 0,
    queryFn: async () => {
      const [deployments, plans, equipment] = await Promise.all([
        fetchAll(() => supabase.from('equipment_deployments').select('*').eq('company_id', companyId).eq('equipment_id', form.equipment_id).lte('deployed_date', form.expected_return_date).or(`status.eq.active,withdrawn_date.gte.${form.mobilisation_date}`).order('id')),
        fetchAll(() => supabase.from('equipment_deployment_plans').select('*').eq('company_id', companyId).eq('equipment_id', form.equipment_id).in('status', ['planned', 'confirmed']).order('id')),
        supabase.from('equipment').select('id,status,current_project_id').eq('company_id', companyId).eq('id', form.equipment_id).single(),
      ])
      if (equipment.error) throw equipment.error
      return { deployments, plans, equipment: equipment.data }
    },
  })
  const conflicts = bookingConflicts(conflictsData?.equipment || machine, conflictsData?.deployments || [], conflictsData?.plans || [], form.mobilisation_date, form.expected_return_date, initial?.id)
  const save = usePlannerMutation(companyId, () => { toast.success(initial?.id ? 'Booking updated' : 'Deployment planned'); onClose() })
  const invalidDates = form.expected_return_date < form.mobilisation_date
  const handleSubmit = event => {
    event.preventDefault()
    if (invalidDates || conflicts.length || isFetching || isError) return
    const values = { ...form, company_id: companyId, site_name: form.site_name.trim() || null, notes: form.notes.trim() || null }
    save.mutate(() => initial?.id
      ? supabase.from('equipment_deployment_plans').update(values).eq('company_id', companyId).eq('id', initial.id).select('id').single()
      : supabase.from('equipment_deployment_plans').insert(values).select('id').single())
  }
  return (
    <Modal title={initial?.id ? 'Edit deployment booking' : 'Plan a deployment'} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Machine *"><select required className={INPUT} value={form.equipment_id} onChange={event => set('equipment_id', event.target.value)}><option value="">Select machine</option>{data.equipment.filter(item => item.status !== 'disposed').map(item => <option key={item.id} value={item.id}>{item.name} · {item.equipment_number || item.category}</option>)}</select></Field>
          <Field label="Project *"><select required className={INPUT} value={form.project_id} onChange={event => {
            const project = data.projects.find(item => item.id === event.target.value)
            setForm(current => ({ ...current, project_id: event.target.value, site_name: project?.site_name || '' }))
          }}><option value="">Select project</option>{data.projects.filter(item => item.is_active !== false && item.status !== 'completed').map(item => <option key={item.id} value={item.id}>{item.project_name}</option>)}</select></Field>
          <Field label="Mobilisation date *"><input required type="date" className={INPUT} value={form.mobilisation_date} onChange={event => set('mobilisation_date', event.target.value)} /></Field>
          <Field label="Expected return date *" hint="This day is reserved too. The next booking can start the following day."><input required type="date" min={form.mobilisation_date} className={INPUT} value={form.expected_return_date} onChange={event => set('expected_return_date', event.target.value)} /></Field>
          <Field label="Booking status"><select className={INPUT} value={form.status} onChange={event => set('status', event.target.value)}><option value="planned">Planned</option><option value="confirmed">Confirmed</option></select></Field>
          <Field label="Site / location"><input className={INPUT} value={form.site_name} onChange={event => set('site_name', event.target.value)} /></Field>
        </div>
        <Field label="Notes"><textarea className={INPUT} rows={2} value={form.notes} onChange={event => set('notes', event.target.value)} /></Field>
        {isFetching && <p className="text-sm text-slate-400">Checking current bookings…</p>}
        {(isError || invalidDates || conflicts.length > 0) && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{isError ? 'Availability could not be checked. Please retry before saving.' : invalidDates ? 'Return date must be on or after mobilisation.' : conflicts.map(item => item.message).join(' ')}</div>}
        {machine && !isFetching && !isError && !invalidDates && conflicts.length === 0 && <p className="text-sm text-emerald-400">No booking conflict for these dates. Availability is checked again when you save.</p>}
        <p className="text-xs text-slate-500">Planning reserves the machine; it does not start a deployment or billing. Mobilise it when it actually leaves for site.</p>
        <button type="submit" disabled={save.isPending || isFetching || isError || invalidDates || conflicts.length > 0} className="btn-primary w-full justify-center disabled:opacity-40">{save.isPending ? 'Saving…' : 'Save booking'}</button>
      </form>
    </Modal>
  )
}

function MobiliseForm({ companyId, data, plan, onClose }) {
  const machine = data.equipment.find(item => item.id === plan.equipment_id)
  const project = data.projects.find(item => item.id === plan.project_id)
  const [form, setForm] = useState({ date: localDateKey(), rateId: '', basis: 'hourly', rate: '', meter: machine?.current_meter_reading || 0, operator: '', site: plan.site_name || project?.site_name || '', fuelByClient: false })
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const { data: rates = [], isLoading, isError } = useQuery({
    queryKey: ['planner-rates', companyId, plan.project_id],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('project_rate_items').select('*').eq('company_id', companyId).eq('project_id', plan.project_id).order('sort_order')
      if (error) throw error
      return rows || []
    },
  })
  const selectedRate = rates.find(item => item.id === form.rateId)
  const basis = selectedRate?.billing_basis || form.basis
  const amount = selectedRate ? agreedRateAmount(selectedRate, basis) : Number(form.rate)
  const save = usePlannerMutation(companyId, () => { toast.success('Machine mobilised; deployment record created'); onClose() })
  const handleSubmit = event => {
    event.preventDefault()
    const payload = {
      equipment_id: plan.equipment_id, project_id: plan.project_id, client_id: project?.client_id,
      deployed_date: form.date, expected_return_date: plan.expected_return_date, rental_rate: amount,
      rate_unit: basis === 'monthly' ? 'per_month' : basis === 'daily' ? 'per_day' : 'per_hour',
      billing_basis: basis, rate_item_id: selectedRate?.id || null, item_name: selectedRate?.item_name || null,
      rate_per_hour: selectedRate ? selectedRate.rate_per_hour : basis === 'hourly' ? amount : null,
      rate_per_day: selectedRate ? selectedRate.rate_per_day : basis === 'daily' ? amount : null,
      rate_per_month: selectedRate ? selectedRate.rate_per_month : basis === 'monthly' ? amount : null,
      max_hours_per_day: selectedRate?.max_hours_per_day || 8, max_hours_per_month: selectedRate?.max_hours_per_month || 200,
      working_days_per_month: selectedRate?.working_days_per_month || 26, ot_percentage: selectedRate?.ot_percentage || 125,
      hour_meter_at_deployment: Number(form.meter), operator_name: form.operator || null, deployment_location: form.site || null,
      fuel_by_client: form.fuelByClient, notes: plan.notes,
    }
    save.mutate(() => supabase.rpc('planner_deploy_equipment', { p_data: payload, p_plan_id: plan.id }))
  }
  return <Modal title={`Mobilise ${machine?.name || 'machine'}`} onClose={onClose} size="lg"><form onSubmit={handleSubmit} className="space-y-4">
    <p className="text-sm text-slate-400">{project?.project_name} · expected return {dateLabel(plan.expected_return_date)}</p>
    {!project?.client_id && <p role="alert" className="text-sm text-red-400">Link this project to a client before mobilisation. The live deployment table requires a client.</p>}
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Actual mobilisation date *"><input required type="date" max={localDateKey()} className={INPUT} value={form.date} onChange={event => set('date', event.target.value)} /></Field>
      <Field label="Project rate card"><select className={INPUT} value={form.rateId} disabled={isLoading || isError} onChange={event => set('rateId', event.target.value)}><option value="">Enter an agreed rate manually</option>{rates.map(item => <option key={item.id} value={item.id}>{item.item_name} · {item.billing_basis || 'rate'}</option>)}</select></Field>
      {!selectedRate && <><Field label="Billing basis"><select className={INPUT} value={form.basis} onChange={event => set('basis', event.target.value)}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option></select></Field><Field label="Agreed rate (₹) *" hint="Enter 0 explicitly for an internal/no-charge deployment."><input required type="number" min="0" step="0.01" className={INPUT} value={form.rate} onChange={event => set('rate', event.target.value)} /></Field></>}
      <Field label="Hour meter at mobilisation"><input type="number" min="0" step="0.1" className={INPUT} value={form.meter} onChange={event => set('meter', event.target.value)} /></Field>
      <Field label="Operator name"><input className={INPUT} value={form.operator} onChange={event => set('operator', event.target.value)} /></Field>
    </div>
    {selectedRate && <p className="text-sm text-primary-400">Agreed rate: ₹{amount.toLocaleString('en-IN')} · {basis}</p>}
    {isError && <p role="alert" className="text-sm text-red-400">Rate cards could not be loaded. Retry before mobilisation.</p>}
    <Field label="Site / location"><input className={INPUT} value={form.site} onChange={event => set('site', event.target.value)} /></Field>
    <label className="flex gap-2 items-center text-sm text-slate-400"><input type="checkbox" checked={form.fuelByClient} onChange={event => set('fuelByClient', event.target.checked)} />Fuel supplied by client</label>
    <p className="text-xs text-slate-500">Mobilisation creates the active deployment with this rate, updates the machine’s site, and links the booking. A machine still on another site must be returned or transferred first.</p>
    <button disabled={save.isPending || !project?.client_id || isLoading || isError || form.date > plan.expected_return_date} className="btn-primary w-full justify-center disabled:opacity-40">{save.isPending ? 'Mobilising…' : 'Confirm mobilisation'}</button>
  </form></Modal>
}

function MachineDetail({ companyId, row, data, canManage, onClose, onDialog, onNavigate }) {
  const [expectedReturn, setExpectedReturn] = useState(row.current?.expected_return_date || '')
  const [actualReturn, setActualReturn] = useState(localDateKey())
  const [confirmReturn, setConfirmReturn] = useState(false)
  const [cancelId, setCancelId] = useState(null)
  const save = usePlannerMutation(companyId, () => { toast.success('Planner updated'); onClose() })
  const plans = data.plans.filter(item => item.equipment_id === row.equipment.id)
  return <Modal title={row.equipment.name} onClose={onClose} size="lg"><div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">{row.equipment.equipment_number} · {row.equipment.category}</p><button type="button" className="btn-ghost text-sm" onClick={() => onNavigate('fleet', { equipmentId: row.equipment.id })}><ExternalLink className="w-4 h-4" />Equipment 360</button></div>
    {row.current ? <section className="rounded-xl border border-dark-600 bg-dark-800 p-4 space-y-3">
      <div className="flex justify-between gap-3"><h3 className="text-sm font-semibold text-slate-200">Currently deployed</h3><button type="button" className="text-primary-400 text-sm" onClick={() => onNavigate('projects', { projectId: row.current.project_id })}>Open project</button></div>
      <p className="text-sm text-slate-400">{projectName(data.projects, row.current.project_id)} · since {dateLabel(row.current.deployed_date)}</p>
      {row.overdue && <p className="text-sm text-amber-400">Expected return has passed. Machine remains deployed until its return is recorded.</p>}
      {canManage ? <>
        <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); save.mutate(() => supabase.from('equipment_deployments').update({ expected_return_date: expectedReturn || null }).eq('company_id', companyId).eq('id', row.current.id).select('id').single()) }}><div className="flex-1 min-w-[180px]"><Field label="Expected return"><input required type="date" min={row.current.deployed_date} className={INPUT} value={expectedReturn} onChange={event => setExpectedReturn(event.target.value)} /></Field></div><button disabled={save.isPending} className="btn-secondary text-sm">Save return date</button></form>
        {!confirmReturn ? <button type="button" className="btn-ghost text-amber-400 text-sm" onClick={() => setConfirmReturn(true)}>Record actual return</button> : <form className="rounded-lg bg-amber-500/10 p-3 space-y-3" onSubmit={event => { event.preventDefault(); save.mutate(() => supabase.rpc('planner_return_equipment', { p_deployment_id: row.current.id, p_return_date: actualReturn })) }}><Field label="Actual return date"><input required type="date" min={row.current.deployed_date} max={localDateKey()} className={INPUT} value={actualReturn} onChange={event => setActualReturn(event.target.value)} /></Field><p className="text-xs text-slate-400">This closes the deployment and clears the machine’s current site assignment. It does not delete history.</p><button disabled={save.isPending} className="btn-primary text-sm">Confirm return</button><button type="button" className="btn-ghost text-sm ml-2" onClick={() => setConfirmReturn(false)}>Keep deployed</button></form>}
      </> : <p className="text-sm text-slate-400">Expected return: {dateLabel(row.current.expected_return_date)}</p>}
    </section> : row.equipment.current_project_id ? <p className="text-sm text-amber-400">This machine has a site assignment without an active deployment record. Open Equipment 360 to resolve it before planning.</p> : <p className={`text-sm ${STATES[row.status].color}`}>{STATES[row.status].label} for the selected dates.</p>}
    <section className="space-y-3"><h3 className="text-sm font-semibold text-slate-200">Upcoming bookings</h3>{plans.length === 0 ? <p className="text-sm text-slate-500">No planned deployments.</p> : plans.map(plan => <div key={plan.id} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2"><div className="flex justify-between gap-3"><p className="text-sm font-semibold text-slate-200">{projectName(data.projects, plan.project_id)}</p><span className="text-xs text-blue-400 capitalize">{plan.status}</span></div><p className="text-sm text-slate-400">{dateLabel(plan.mobilisation_date)} → {dateLabel(plan.expected_return_date)}</p>{plan.site_name && <p className="text-xs text-slate-500">{plan.site_name}</p>}{canManage && <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-ghost text-sm" onClick={() => onDialog({ type: 'plan', initial: plan })}>Edit</button>
      {plan.status === 'planned' && <button type="button" disabled={save.isPending} className="btn-ghost text-sm text-blue-400" onClick={() => save.mutate(() => supabase.from('equipment_deployment_plans').update({ status: 'confirmed' }).eq('company_id', companyId).eq('id', plan.id).select('id').single())}>Confirm booking</button>}
      <button type="button" className="btn-primary text-sm" onClick={() => onDialog({ type: 'mobilise', plan })}>Mobilise</button>
      {cancelId === plan.id ? <><span className="text-xs text-slate-400 self-center">Release this booking?</span><button type="button" disabled={save.isPending} className="btn-ghost text-sm text-red-400" onClick={() => save.mutate(() => supabase.from('equipment_deployment_plans').update({ status: 'cancelled' }).eq('company_id', companyId).eq('id', plan.id).select('id').single())}>Yes, release</button><button type="button" className="btn-ghost text-sm" onClick={() => setCancelId(null)}>Keep</button></> : <button type="button" className="btn-ghost text-sm text-red-400" onClick={() => setCancelId(plan.id)}>Cancel booking</button>}
    </div>}</div>)}</section>
    {canManage && <button type="button" className="btn-primary w-full justify-center" onClick={() => onDialog({ type: 'plan', initial: { equipment_id: row.equipment.id } })}><Plus className="w-4 h-4" />Plan another deployment</button>}
  </div></Modal>
}

export function PlannerBoard({ rows, deployments, projects, from, to, onSelect }) {
  const days = []
  for (let day = from; day <= to; day = addDateDays(day, 1)) days.push(day)
  return <div className="overflow-auto rounded-xl border border-dark-700"><table className="w-full border-collapse text-sm"><thead><tr><th className="sticky left-0 z-10 bg-dark-800 p-3 text-left min-w-[220px] text-slate-300">Machine / current site</th>{days.map(day => <th key={day} className={`bg-dark-800 p-2 min-w-[40px] text-center font-normal ${day === localDateKey() ? 'text-primary-400' : 'text-slate-500'}`}><span className="block text-xs">{format(parseISO(day), 'EEE')}</span>{format(parseISO(day), 'd')}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.equipment.id} className="border-t border-dark-700"><th className="sticky left-0 z-10 bg-dark-800 text-left p-3 font-normal"><button type="button" className="w-full text-left hover:text-primary-400" onClick={() => onSelect(row.equipment.id)}><span className="block font-semibold text-slate-200 text-sm">{row.equipment.name}</span><span className="block text-xs text-slate-500 mt-1">{row.equipment.equipment_number || row.equipment.category}</span>{row.current && <span className="block text-xs text-primary-400 mt-1 max-w-[210px] truncate">{projectName(projects, row.current.project_id)}</span>}</button></th>{days.map(day => {
    const cell = plannerDayState(row, day, deployments)
    const label = `${row.equipment.name}, ${dateLabel(day)}, ${STATES[cell.status].label}${cell.projectId ? `, ${projectName(projects, cell.projectId)}` : ''}`
    return <td key={day} className="p-1 text-center bg-dark-900"><button type="button" aria-label={label} title={label} onClick={() => onSelect(row.equipment.id)} className={`w-full h-10 rounded-md border hover:ring-2 hover:ring-primary-400/50 ${STATES[cell.status].cell} ${day === localDateKey() ? 'ring-1 ring-primary-500' : ''}`}><span className="sr-only">{STATES[cell.status].label}</span>{cell.status === 'planned' && <span className="text-xs text-blue-300">P</span>}{cell.status === 'return_due' && <span className="text-xs text-amber-300">R</span>}</button></td>
  })}</tr>)}</tbody></table></div>
}

export default function DeploymentPlannerPage({ onNavigate, initialStatus = 'all' }) {
  const { companyId, role } = useAuth()
  const canManage = ['admin', 'manager'].includes(role)
  const [from, setFrom] = useState(localDateKey)
  const [to, setTo] = useState(() => initialStatus === 'available' ? localDateKey() : addDateDays(localDateKey(), 13))
  const [status, setStatus] = useState(initialStatus)
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('all')
  const [category, setCategory] = useState('all')
  const [view, setView] = useState('timeline')
  const [dialog, setDialog] = useState(null)
  useEffect(() => {
    setStatus(initialStatus === 'all' || STATES[initialStatus] ? initialStatus : 'all')
  }, [initialStatus])
  const validDates = Boolean(from && to && to >= from && to <= addDateDays(from, 30))
  const query = useQuery({
    queryKey: ['deployment-planner', companyId, from, to], enabled: Boolean(companyId && validDates),
    staleTime: 15_000, refetchInterval: 30_000,
    queryFn: async () => {
      const [equipment, projects, deployments, plans] = await Promise.all([
        fetchAll(() => supabase.from('equipment').select('id,name,equipment_number,category,status,current_project_id,current_client_id,current_site_name,current_meter_reading').eq('company_id', companyId).neq('status', 'disposed').order('name').order('id')),
        fetchAll(() => supabase.from('projects').select('id,project_name,project_code,client_id,site_name,status,is_active').eq('company_id', companyId).order('project_name').order('id')),
        fetchAll(() => supabase.from('equipment_deployments').select('*').eq('company_id', companyId).lte('deployed_date', to).or(`status.eq.active,withdrawn_date.gte.${from}`).order('deployed_date', { ascending: false }).order('id')),
        fetchAll(() => supabase.from('equipment_deployment_plans').select('*').eq('company_id', companyId).in('status', ['planned', 'confirmed']).order('mobilisation_date').order('id')),
      ])
      return { equipment, projects, deployments, plans }
    },
  })
  const data = query.data || EMPTY_DATA
  const rows = useMemo(() => data.equipment.map(item => equipmentPlanningState(item, data.deployments, data.plans, from, to)), [data, from, to])
  const matchesStatus = (row, value) => value === 'all' || (value === 'planned' ? row.bookings.length > 0 : value === 'return_due' ? row.returnDue : value === 'deployed' ? ['deployed', 'return_due'].includes(row.status) : row.status === value)
  const filtered = rows.filter(row => matchesStatus(row, status) &&
    (category === 'all' || row.equipment.category === category) &&
    (projectId === 'all' || row.current?.project_id === projectId || row.bookings.some(item => item.project_id === projectId)) &&
    (!search.trim() || `${row.equipment.name} ${row.equipment.equipment_number || ''} ${row.equipment.category || ''} ${row.equipment.current_site_name || ''}`.toLowerCase().includes(search.trim().toLowerCase())))
  const selectedRow = dialog?.type === 'machine' ? rows.find(row => row.equipment.id === dialog.equipmentId) : null
  const moveRange = days => { if (!validDates) return; setFrom(current => addDateDays(current, days)); setTo(current => addDateDays(current, days)) }
  const selectStatus = value => {
    setStatus(value)
    onNavigate?.('deployment_planner', { plannerStatus: value }, { replace: true })
  }
  const toggleStatus = value => selectStatus(status === value ? 'all' : value)
  const clearFilters = () => {
    selectStatus('all')
    setProjectId('all')
    setCategory('all')
    setSearch('')
  }

  return <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
    <div className="flex flex-wrap gap-3 justify-between items-start"><div><h1 className="text-xl font-bold text-slate-100">Deployment Planner</h1><p className="text-sm text-slate-400 mt-1">Reserve machines, plan site movements, and track returns.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost text-sm" onClick={() => onNavigate('availability')}>Daily availability</button><button type="button" className="btn-ghost text-sm" onClick={() => onNavigate('active_deployments')}>Active deployments</button>{canManage && <button type="button" className="btn-primary text-sm" disabled={!query.data || query.isError} onClick={() => setDialog({ type: 'plan' })}><Plus className="w-4 h-4" />Plan deployment</button>}</div></div>
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Object.entries(STATES).map(([key, state]) => <button type="button" key={key} onClick={() => toggleStatus(key)} aria-pressed={status === key} className={`card text-left p-3 ${status === key ? 'ring-1 ring-primary-500' : ''}`}><p className="text-sm text-slate-400">{state.label}</p><p className={`text-2xl font-bold mt-1 ${state.color}`}>{query.isLoading ? '—' : rows.filter(row => matchesStatus(row, key)).length}</p><p className="text-xs text-slate-500 mt-1">{key === 'return_due' ? 'Next 7 days / overdue' : 'Within selected dates'}</p></button>)}</div>
    <section className="card p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-end"><div className="flex gap-2 items-center"><button type="button" aria-label="Previous 14 days" className="btn-ghost p-2" onClick={() => moveRange(-14)}><ChevronLeft className="w-4 h-4" /></button><CalendarDays className="w-4 h-4 text-primary-400" /><button type="button" className="btn-ghost text-sm" onClick={() => { setFrom(localDateKey()); setTo(addDateDays(localDateKey(), 13)) }}>Today</button><button type="button" aria-label="Next 14 days" className="btn-ghost p-2" onClick={() => moveRange(14)}><ChevronRight className="w-4 h-4" /></button></div><Field label="From"><input type="date" className={INPUT} value={from} onChange={event => { setFrom(event.target.value); if (event.target.value) setTo(addDateDays(event.target.value, 13)) }} /></Field><Field label="To"><input type="date" min={from} max={from ? addDateDays(from, 30) : undefined} className={INPUT} value={to} onChange={event => setTo(event.target.value)} /></Field><div className="flex-1" /><div className="flex gap-1"><button type="button" aria-label="Timeline view" aria-pressed={view === 'timeline'} className={view === 'timeline' ? 'btn-primary p-2' : 'btn-ghost p-2'} onClick={() => setView('timeline')}><LayoutGrid className="w-4 h-4" /></button><button type="button" aria-label="List view" aria-pressed={view === 'list'} className={view === 'list' ? 'btn-primary p-2' : 'btn-ghost p-2'} onClick={() => setView('list')}><List className="w-4 h-4" /></button></div></div>
      {!validDates && <p role="alert" className="text-sm text-red-400">Choose a date range of 1–31 days.</p>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3"><label className="relative"><span className="sr-only">Search equipment or site</span><Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" /><input className={`${INPUT} pl-9`} placeholder="Search machine, number, site…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filter project" className={INPUT} value={projectId} onChange={event => setProjectId(event.target.value)}><option value="all">All projects / sites</option>{data.projects.map(item => <option key={item.id} value={item.id}>{item.project_name}{item.site_name ? ` · ${item.site_name}` : ''}</option>)}</select><select aria-label="Filter category" className={INPUT} value={category} onChange={event => setCategory(event.target.value)}><option value="all">All equipment types</option>{[...new Set(data.equipment.map(item => item.category).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filter planning status" className={INPUT} value={status} onChange={event => selectStatus(event.target.value)}><option value="all">All planning statuses</option>{Object.entries(STATES).map(([key, state]) => <option key={key} value={key}>{state.label}</option>)}</select></div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">{Object.entries(STATES).map(([key, state]) => <span key={key} className="flex items-center gap-1.5 text-xs text-slate-400"><span className={`w-3 h-3 border rounded-sm ${state.cell}`} />{state.label}</span>)}</div>
    </section>
    {query.isError ? <div role="alert" className="card p-5 text-sm text-red-400 flex gap-3 items-center"><AlertTriangle className="w-5 h-5" /><div>Planner data could not be loaded. {query.error?.message}<button type="button" className="block text-primary-400 mt-2" onClick={() => query.refetch()}>Retry</button></div></div> : query.isLoading ? <div className="card p-8 text-sm text-slate-400">Loading deployment schedule…</div> : validDates && <>
      <div className="flex flex-wrap gap-3 justify-between items-center"><p className="text-sm text-slate-400">Showing {filtered.length} of {rows.length} machines · {dateLabel(from)} – {dateLabel(to)}</p>{(status !== 'all' || projectId !== 'all' || category !== 'all' || search) && <button type="button" className="text-sm text-primary-400" onClick={clearFilters}>Clear filters</button>}</div>
      {filtered.length === 0 ? <div className="card p-10 text-center text-sm text-slate-500"><Truck className="w-8 h-8 mx-auto mb-3" />No machines match these dates and filters.</div> : view === 'timeline' ? <PlannerBoard rows={filtered} deployments={data.deployments} projects={data.projects} from={from} to={to} onSelect={equipmentId => setDialog({ type: 'machine', equipmentId })} /> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{filtered.map(row => <button type="button" key={row.equipment.id} onClick={() => setDialog({ type: 'machine', equipmentId: row.equipment.id })} className="card p-4 text-left hover:border-primary-500/40"><div className="flex justify-between gap-3"><h3 className="font-semibold text-sm text-slate-200">{row.equipment.name}</h3><span className={`text-xs ${STATES[row.status].color}`}>{STATES[row.status].label}</span></div><p className="text-xs text-slate-500 mt-1">{row.equipment.equipment_number} · {row.equipment.category}</p>{row.current && <p className="text-sm text-primary-400 mt-3">{projectName(data.projects, row.current.project_id)}<span className="block text-xs text-slate-500 mt-1">Expected return: {dateLabel(row.current.expected_return_date)}{row.overdue ? ' · overdue' : ''}</span></p>}{row.bookings.map(plan => <p key={plan.id} className="text-sm text-blue-400 mt-3">{projectName(data.projects, plan.project_id)}<span className="block text-xs text-slate-500 mt-1">{dateLabel(plan.mobilisation_date)} → {dateLabel(plan.expected_return_date)}</span></p>)}</button>)}</div>}
      <p className="text-xs text-slate-500">Future availability uses expected return dates. Overdue or undated deployments stay occupied until returned. Mobilisation always rechecks the machine’s actual site assignment.</p>
    </>}
    {dialog?.type === 'plan' && <BookingForm companyId={companyId} data={data} initial={dialog.initial} onClose={() => setDialog(null)} />}
    {dialog?.type === 'mobilise' && <MobiliseForm companyId={companyId} data={data} plan={dialog.plan} onClose={() => setDialog(null)} />}
    {selectedRow && <MachineDetail key={selectedRow.equipment.id} companyId={companyId} row={selectedRow} data={data} canManage={canManage} onClose={() => setDialog(null)} onDialog={setDialog} onNavigate={onNavigate} />}
  </div>
}
