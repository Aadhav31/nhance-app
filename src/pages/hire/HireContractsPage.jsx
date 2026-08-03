import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Plus, X, Search, FileText, Truck, Building2, Calendar,
  IndianRupee, ChevronRight, Edit2, CheckCircle, AlertTriangle,
  Clock, Pause, XCircle, FileSignature, MapPin, Loader2,
  MoreVertical, ArrowRight, ClipboardList, Save, RefreshCw,
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────
const today     = () => new Date().toISOString().split('T')[0]
const fmt       = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'
const fmtDate   = (d) => d ? format(new Date(d), 'd MMM yyyy') : '—'
const inp       = (x='') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`
const sel       = (x='') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${x}`
const labelCls  = 'text-xs text-slate-400 mb-1 block'
const halfGrid  = 'grid grid-cols-2 gap-3'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  draft:       { label: 'Draft',       color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',    icon: FileText },
  active:      { label: 'Active',      color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle },
  on_hold:     { label: 'On Hold',     color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',    icon: Pause },
  completed:   { label: 'Completed',   color: 'bg-blue-500/15 text-blue-300 border-blue-500/30',       icon: CheckCircle },
  terminated:  { label: 'Terminated',  color: 'bg-red-500/15 text-red-300 border-red-500/30',          icon: XCircle },
}

const BILLING_BASIS = {
  hourly:   { label: 'Hourly',    unit: '/hr' },
  daily:    { label: 'Daily',     unit: '/day' },
  monthly:  { label: 'Monthly',   unit: '/month' },
  lump_sum: { label: 'Lump Sum',  unit: '' },
}

// ── Auto-generate contract number ─────────────────────────────────────────────
async function nextContractNumber(supabase, companyId) {
  const year = new Date().getFullYear()
  const { count } = await supabase.from('hire_contracts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
  const seq = String((count || 0) + 1).padStart(3, '0')
  return `HC-${year}${seq}`
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.draft
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 shrink-0">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-dark-700 flex gap-3 justify-end shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

// ── ContractForm ──────────────────────────────────────────────────────────────
function ContractForm({ initial = {}, onSave, onClose, equipment, clients }) {
  const { companyId, session } = useAuth()
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({
    client_id:             initial.client_id || '',
    client_name:           initial.client_name || '',
    equipment_id:          initial.equipment_id || '',
    equipment_name:        initial.equipment_name || '',
    equipment_number:      initial.equipment_number || '',
    project_id:            initial.project_id || '',
    site_location:         initial.site_location || '',
    start_date:            initial.start_date || today(),
    end_date:              initial.end_date || '',
    billing_basis:         initial.billing_basis || 'daily',
    rate:                  initial.rate != null ? String(initial.rate) : '',
    minimum_hours_per_day: initial.minimum_hours_per_day != null ? String(initial.minimum_hours_per_day) : '',
    overtime_rate:         initial.overtime_rate != null ? String(initial.overtime_rate) : '',
    mobilization_charge:   initial.mobilization_charge != null ? String(initial.mobilization_charge) : '0',
    demobilization_charge: initial.demobilization_charge != null ? String(initial.demobilization_charge) : '0',
    security_deposit:      initial.security_deposit != null ? String(initial.security_deposit) : '0',
    gst_applicable:        initial.gst_applicable !== false,
    gst_rate:              initial.gst_rate != null ? String(initial.gst_rate) : '18',
    terms_conditions:      initial.terms_conditions || '',
    notes:                 initial.notes || '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const onEquipmentChange = (eqId) => {
    const eq = equipment.find(e => e.id === eqId)
    set('equipment_id', eqId)
    set('equipment_name', eq?.name || '')
    set('equipment_number', eq?.equipment_number || '')
  }

  const onClientChange = (cId) => {
    const cl = clients.find(c => c.id === cId)
    set('client_id', cId)
    set('client_name', cl?.display_name || cl?.business_name || '')
  }

  const handleSave = async () => {
    if (!f.equipment_id) return toast.error('Select equipment')
    if (!f.client_id)    return toast.error('Select client')
    if (!f.rate)         return toast.error('Enter rate')
    if (!f.start_date)   return toast.error('Enter start date')
    setSaving(true)
    try {
      const isNew = !initial.id
      const contractNumber = isNew
        ? await nextContractNumber(supabase, companyId)
        : initial.contract_number

      const payload = {
        company_id:            companyId,
        contract_number:       contractNumber,
        client_id:             f.client_id || null,
        client_name:           f.client_name || null,
        equipment_id:          f.equipment_id || null,
        equipment_name:        f.equipment_name || null,
        equipment_number:      f.equipment_number || null,
        site_location:         f.site_location || null,
        start_date:            f.start_date,
        end_date:              f.end_date || null,
        billing_basis:         f.billing_basis,
        rate:                  parseFloat(f.rate) || 0,
        minimum_hours_per_day: f.minimum_hours_per_day ? parseFloat(f.minimum_hours_per_day) : null,
        overtime_rate:         f.overtime_rate ? parseFloat(f.overtime_rate) : null,
        mobilization_charge:   parseFloat(f.mobilization_charge) || 0,
        demobilization_charge: parseFloat(f.demobilization_charge) || 0,
        security_deposit:      parseFloat(f.security_deposit) || 0,
        gst_applicable:        f.gst_applicable,
        gst_rate:              parseFloat(f.gst_rate) || 18,
        terms_conditions:      f.terms_conditions || null,
        notes:                 f.notes || null,
        created_by:            session?.user?.id,
      }

      let contractId
      if (isNew) {
        const { data, error } = await supabase.from('hire_contracts').insert(payload).select('id').single()
        if (error) throw error
        contractId = data.id
        // Log creation
        await supabase.from('hire_contract_logs').insert({
          contract_id: contractId, company_id: companyId,
          event_type: 'created', note: `Contract ${contractNumber} created`,
          created_by: session?.user?.id,
        })
        toast.success(`${contractNumber} created`)
      } else {
        const { error } = await supabase.from('hire_contracts').update(payload).eq('id', initial.id)
        if (error) throw error
        contractId = initial.id
        toast.success('Contract updated')
      }
      onSave?.(contractId)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={initial.id ? `Edit ${initial.contract_number}` : 'New Hire Contract'}
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            {saving ? 'Saving…' : (initial.id ? 'Update Contract' : 'Create Contract')}
          </button>
        </>
      }
    >
      {/* Equipment */}
      <div>
        <label className={labelCls}>Equipment <span className="text-red-400">*</span></label>
        <select className={sel()} value={f.equipment_id} onChange={e => onEquipmentChange(e.target.value)}>
          <option value="">
            {equipment.length === 0 ? '— No equipment found. Add via Fleet page —' : '— Select equipment —'}
          </option>
          {equipment.map(eq => (
            <option key={eq.id} value={eq.id}>
              {eq.name} {eq.equipment_number ? `· ${eq.equipment_number}` : ''}
              {eq.status && eq.status !== 'active' ? ` (${eq.status})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Client */}
      <div>
        <label className={labelCls}>Client <span className="text-red-400">*</span></label>
        <select className={sel()} value={f.client_id} onChange={e => onClientChange(e.target.value)}>
          <option value="">
            {clients.length === 0 ? '— No clients found. Add via Clients page —' : '— Select client —'}
          </option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.business_name || c.display_name || '(unnamed)'}</option>
          ))}
        </select>
      </div>

      {/* Site & Dates */}
      <div>
        <label className={labelCls}>Site / Location</label>
        <input className={inp()} placeholder="Project site name or address"
          value={f.site_location} onChange={e => set('site_location', e.target.value)}/>
      </div>
      <div className={halfGrid}>
        <div>
          <label className={labelCls}>Start Date <span className="text-red-400">*</span></label>
          <input type="date" className={inp()} value={f.start_date} onChange={e => set('start_date', e.target.value)}/>
        </div>
        <div>
          <label className={labelCls}>End Date <span className="text-slate-500">(optional)</span></label>
          <input type="date" className={inp()} value={f.end_date} onChange={e => set('end_date', e.target.value)}/>
        </div>
      </div>

      {/* Billing */}
      <div className="bg-dark-700/50 border border-dark-600 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Billing Terms</p>
        <div className={halfGrid}>
          <div>
            <label className={labelCls}>Billing Basis <span className="text-red-400">*</span></label>
            <select className={sel()} value={f.billing_basis} onChange={e => set('billing_basis', e.target.value)}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="lump_sum">Lump Sum</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Rate (₹) {BILLING_BASIS[f.billing_basis]?.unit && <span className="text-slate-500">{BILLING_BASIS[f.billing_basis].unit}</span>}</label>
            <input type="number" className={inp()} placeholder="0" min="0"
              value={f.rate} onChange={e => set('rate', e.target.value)}/>
          </div>
        </div>
        {f.billing_basis === 'hourly' && (
          <div className={halfGrid}>
            <div>
              <label className={labelCls}>Min Hours / Day</label>
              <input type="number" className={inp()} placeholder="8" min="0" step="0.5"
                value={f.minimum_hours_per_day} onChange={e => set('minimum_hours_per_day', e.target.value)}/>
            </div>
            <div>
              <label className={labelCls}>OT Rate (₹/hr)</label>
              <input type="number" className={inp()} placeholder="0" min="0"
                value={f.overtime_rate} onChange={e => set('overtime_rate', e.target.value)}/>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Mobilization (₹)</label>
            <input type="number" className={inp()} placeholder="0" min="0"
              value={f.mobilization_charge} onChange={e => set('mobilization_charge', e.target.value)}/>
          </div>
          <div>
            <label className={labelCls}>Demobilization (₹)</label>
            <input type="number" className={inp()} placeholder="0" min="0"
              value={f.demobilization_charge} onChange={e => set('demobilization_charge', e.target.value)}/>
          </div>
          <div>
            <label className={labelCls}>Security Deposit (₹)</label>
            <input type="number" className={inp()} placeholder="0" min="0"
              value={f.security_deposit} onChange={e => set('security_deposit', e.target.value)}/>
          </div>
        </div>
        <div className={halfGrid}>
          <div className="flex items-center gap-3 pt-1">
            <input type="checkbox" id="gst_applicable" checked={f.gst_applicable}
              onChange={e => set('gst_applicable', e.target.checked)}
              className="w-4 h-4 accent-primary-500"/>
            <label htmlFor="gst_applicable" className="text-sm text-slate-300">GST Applicable</label>
          </div>
          {f.gst_applicable && (
            <div>
              <label className={labelCls}>GST Rate (%)</label>
              <input type="number" className={inp()} placeholder="18" min="0" max="28"
                value={f.gst_rate} onChange={e => set('gst_rate', e.target.value)}/>
            </div>
          )}
        </div>
      </div>

      {/* Terms */}
      <div>
        <label className={labelCls}>Terms & Conditions</label>
        <textarea className={inp('resize-none h-24')} placeholder="Payment terms, working hours, fuel responsibility, breakdown clause…"
          value={f.terms_conditions} onChange={e => set('terms_conditions', e.target.value)}/>
      </div>
      <div>
        <label className={labelCls}>Internal Notes</label>
        <textarea className={inp('resize-none h-16')} placeholder="Any internal notes…"
          value={f.notes} onChange={e => set('notes', e.target.value)}/>
      </div>
    </Modal>
  )
}

// ── ContractDetailPanel ───────────────────────────────────────────────────────
function ContractDetailPanel({ contract, onClose, onEdit, onStatusChange }) {
  const { companyId, session } = useAuth()
  const qc = useQueryClient()
  const [actionSaving, setActionSaving] = useState(null)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')

  const { data: logs = [] } = useQuery({
    queryKey: ['hire_contract_logs', contract.id],
    queryFn: async () => {
      const { data } = await supabase.from('hire_contract_logs')
        .select('*').eq('contract_id', contract.id)
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  const changeStatus = async (newStatus, eventType, note) => {
    setActionSaving(newStatus)
    try {
      await supabase.from('hire_contracts').update({ status: newStatus }).eq('id', contract.id)
      await supabase.from('hire_contract_logs').insert({
        contract_id: contract.id, company_id: companyId,
        event_type: eventType, note: note || null,
        created_by: session?.user?.id,
      })
      qc.invalidateQueries({ queryKey: ['hire_contracts'] })
      qc.invalidateQueries({ queryKey: ['hire_contract_logs', contract.id] })
      onStatusChange?.(newStatus)
      toast.success(`Contract ${newStatus}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionSaving(null)
    }
  }

  const billing = BILLING_BASIS[contract.billing_basis] || {}
  const duration = contract.end_date
    ? differenceInDays(new Date(contract.end_date), new Date(contract.start_date)) + 1
    : null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="relative z-10 w-full max-w-lg bg-dark-800 border-l border-dark-700 h-full overflow-y-auto flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-700 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-primary-400 font-bold">{contract.contract_number}</span>
              <StatusBadge status={contract.status}/>
            </div>
            <p className="text-base font-bold text-slate-100">{contract.equipment_name}</p>
            <p className="text-xs text-slate-400">{contract.equipment_number}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 mt-1"><X className="w-5 h-5"/></button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">

          {/* Key info */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCard icon={Building2} label="Client" value={contract.client_name || '—'}/>
            <InfoCard icon={MapPin} label="Site" value={contract.site_location || '—'}/>
            <InfoCard icon={Calendar} label="Period"
              value={`${fmtDate(contract.start_date)} → ${contract.end_date ? fmtDate(contract.end_date) : 'Open-ended'}`}/>
            {duration && <InfoCard icon={Clock} label="Duration" value={`${duration} days`}/>}
          </div>

          {/* Billing details */}
          <div className="bg-dark-700/50 border border-dark-600 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Billing</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              <span className="text-slate-400">Basis</span>
              <span className="text-slate-100 font-medium">{billing.label || contract.billing_basis}</span>
              <span className="text-slate-400">Rate</span>
              <span className="text-emerald-400 font-bold">{fmt(contract.rate)}{billing.unit}</span>
              {contract.minimum_hours_per_day && <>
                <span className="text-slate-400">Min Hrs/Day</span>
                <span className="text-slate-100">{contract.minimum_hours_per_day} hrs</span>
              </>}
              {contract.overtime_rate && <>
                <span className="text-slate-400">OT Rate</span>
                <span className="text-slate-100">{fmt(contract.overtime_rate)}/hr</span>
              </>}
              {contract.mobilization_charge > 0 && <>
                <span className="text-slate-400">Mobilization</span>
                <span className="text-slate-100">{fmt(contract.mobilization_charge)}</span>
              </>}
              {contract.demobilization_charge > 0 && <>
                <span className="text-slate-400">Demobilization</span>
                <span className="text-slate-100">{fmt(contract.demobilization_charge)}</span>
              </>}
              {contract.security_deposit > 0 && <>
                <span className="text-slate-400">Security Deposit</span>
                <span className="text-slate-100">{fmt(contract.security_deposit)}</span>
              </>}
              <span className="text-slate-400">GST</span>
              <span className="text-slate-100">
                {contract.gst_applicable ? `${contract.gst_rate}%` : 'Not applicable'}
              </span>
            </div>
          </div>

          {/* Terms */}
          {contract.terms_conditions && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Terms & Conditions</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{contract.terms_conditions}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</p>
            <div className="flex flex-wrap gap-2">
              {contract.status === 'draft' && (
                <ActionBtn color="emerald" icon={CheckCircle} label="Activate Contract"
                  loading={actionSaving === 'active'}
                  onClick={() => changeStatus('active', 'activated', 'Contract activated')}/>
              )}
              {contract.status === 'active' && (
                <>
                  <ActionBtn color="amber" icon={Pause} label="Put On Hold"
                    loading={actionSaving === 'on_hold'}
                    onClick={() => changeStatus('on_hold', 'on_hold', 'Contract put on hold')}/>
                  <ActionBtn color="blue" icon={CheckCircle} label="Mark Completed"
                    loading={actionSaving === 'completed'}
                    onClick={() => changeStatus('completed', 'completed', 'Contract completed')}/>
                  <ActionBtn color="red" icon={XCircle} label="Terminate"
                    loading={actionSaving === 'terminated'}
                    onClick={() => changeStatus('terminated', 'terminated', 'Contract terminated')}/>
                </>
              )}
              {contract.status === 'on_hold' && (
                <ActionBtn color="emerald" icon={CheckCircle} label="Resume"
                  loading={actionSaving === 'active'}
                  onClick={() => changeStatus('active', 'activated', 'Contract resumed')}/>
              )}
              <ActionBtn color="slate" icon={Edit2} label="Edit Contract" onClick={() => onEdit?.(contract)}/>
            </div>
          </div>

          {/* Add note */}
          <div>
            {!showNote ? (
              <button onClick={() => setShowNote(true)}
                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5"/> Add note to timeline
              </button>
            ) : (
              <div className="space-y-2">
                <textarea className={`${inp()} resize-none h-20 text-xs`}
                  placeholder="Note…" value={note} onChange={e => setNote(e.target.value)}/>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    if (!note.trim()) return
                    await supabase.from('hire_contract_logs').insert({
                      contract_id: contract.id, company_id: companyId,
                      event_type: 'note', note: note.trim(),
                      created_by: session?.user?.id,
                    })
                    qc.invalidateQueries({ queryKey: ['hire_contract_logs', contract.id] })
                    setNote(''); setShowNote(false)
                    toast.success('Note added')
                  }} className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs rounded-lg transition-colors">
                    Save Note
                  </button>
                  <button onClick={() => { setShowNote(false); setNote('') }}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          {logs.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Timeline</p>
              <div className="space-y-3">
                {logs.map(log => (
                  <div key={log.id} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-1.5 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 capitalize">{log.event_type.replace(/_/g, ' ')}</p>
                      {log.note && <p className="text-xs text-slate-400 mt-0.5">{log.note}</p>}
                      <p className="text-xs text-slate-600 mt-0.5">
                        {format(new Date(log.created_at), 'd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-dark-700/50 border border-dark-600 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-slate-400"/>
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-sm text-slate-100 font-medium truncate">{value}</p>
    </div>
  )
}

function ActionBtn({ color, icon: Icon, label, onClick, loading }) {
  const colors = {
    emerald: 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-600/30',
    amber:   'bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border-amber-600/30',
    blue:    'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-600/30',
    red:     'bg-red-600/20 hover:bg-red-600/30 text-red-300 border-red-600/30',
    slate:   'bg-dark-700 hover:bg-dark-600 text-slate-300 border-dark-600',
  }
  return (
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${colors[color]}`}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Icon className="w-3.5 h-3.5"/>}
      {label}
    </button>
  )
}

// ── ContractCard ──────────────────────────────────────────────────────────────
function ContractCard({ contract, onClick }) {
  const billing = BILLING_BASIS[contract.billing_basis] || {}
  const daysLeft = contract.end_date
    ? differenceInDays(new Date(contract.end_date), new Date())
    : null

  return (
    <div onClick={() => onClick(contract)}
      className="bg-dark-800 border border-dark-700 hover:border-primary-500/50 rounded-xl p-4 cursor-pointer transition-all group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-primary-400 font-bold">{contract.contract_number}</span>
            <StatusBadge status={contract.status}/>
          </div>
          <p className="text-sm font-semibold text-slate-100 truncate">{contract.equipment_name}</p>
          <p className="text-xs text-slate-500">{contract.equipment_number}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-emerald-400">{fmt(contract.rate)}</p>
          <p className="text-xs text-slate-500">{billing.unit || billing.label}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
        {contract.client_name && (
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3"/>{contract.client_name}
          </span>
        )}
        {contract.site_location && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3"/>{contract.site_location}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3"/>{fmtDate(contract.start_date)}
          {contract.end_date ? ` → ${fmtDate(contract.end_date)}` : ' (open)'}
        </span>
        {daysLeft !== null && contract.status === 'active' && (
          <span className={`font-medium ${daysLeft <= 7 ? 'text-amber-400' : daysLeft <= 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Ends today' : `${Math.abs(daysLeft)}d overdue`}
          </span>
        )}
      </div>

      <div className="flex justify-end mt-2">
        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-primary-400 transition-colors"/>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const STATUS_TABS = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'draft',      label: 'Draft' },
  { key: 'on_hold',    label: 'On Hold' },
  { key: 'completed',  label: 'Completed' },
  { key: 'terminated', label: 'Terminated' },
]

export default function HireContractsPage() {
  const { companyId } = useAuth()
  const qc = useQueryClient()
  const [statusTab, setStatusTab]     = useState('all')
  const [search,    setSearch]        = useState('')
  const [showForm,  setShowForm]      = useState(false)
  const [editContract, setEditContract] = useState(null)
  const [detail,    setDetail]        = useState(null)

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['hire_contracts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('hire_contracts')
        .select('*').eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment_hire_list', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment')
        .select('id, name, equipment_number, equipment_type, status')
        .eq('company_id', companyId)
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients_hire_list', companyId],
    queryFn: async () => {
      // order by created_at — display_name is null for business clients and
      // ordering by a fully-null column causes silent PostgREST failures
      const { data, error } = await supabase.from('clients')
        .select('id, display_name, business_name')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = contracts
    if (statusTab !== 'all') list = list.filter(c => c.status === statusTab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.contract_number?.toLowerCase().includes(q) ||
        c.equipment_name?.toLowerCase().includes(q) ||
        c.client_name?.toLowerCase().includes(q) ||
        c.site_location?.toLowerCase().includes(q)
      )
    }
    return list
  }, [contracts, statusTab, search])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    active:    contracts.filter(c => c.status === 'active').length,
    draft:     contracts.filter(c => c.status === 'draft').length,
    ending:    contracts.filter(c => c.status === 'active' && c.end_date &&
                 differenceInDays(new Date(c.end_date), new Date()) <= 7 &&
                 differenceInDays(new Date(c.end_date), new Date()) >= 0).length,
    overdue:   contracts.filter(c => c.status === 'active' && c.end_date &&
                 differenceInDays(new Date(c.end_date), new Date()) < 0).length,
  }), [contracts])

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ['hire_contracts'] })
    setShowForm(false)
    setEditContract(null)
    if (detail) {
      setDetail(prev => contracts.find(c => c.id === prev?.id) || prev)
    }
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">

      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-700 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-600/20 flex items-center justify-center">
              <FileSignature className="w-5 h-5 text-primary-400"/>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">Hire Contracts</h1>
              <p className="text-xs text-slate-400">{contracts.length} contracts total</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4"/> New Contract
          </button>
        </div>

        {/* Stats row */}
        {contracts.length > 0 && (
          <div className="flex gap-3 mb-4 flex-wrap">
            <StatChip label="Active" value={stats.active} color="emerald"/>
            <StatChip label="Draft" value={stats.draft} color="slate"/>
            {stats.ending > 0 && <StatChip label="Ending soon" value={stats.ending} color="amber"/>}
            {stats.overdue > 0 && <StatChip label="Overdue" value={stats.overdue} color="red"/>}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"/>
          <input className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
            placeholder="Search by equipment, client, site, contract number…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Status tabs */}
      <div className="px-6 border-b border-dark-700 shrink-0">
        <div className="flex gap-0 overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? contracts.length
              : contracts.filter(c => c.status === tab.key).length
            return (
              <button key={tab.key}
                onClick={() => setStatusTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  statusTab === tab.key
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}>
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    statusTab === tab.key ? 'bg-primary-500/20 text-primary-300' : 'bg-dark-700 text-slate-500'
                  }`}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contract list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-slate-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin"/>Loading contracts…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <FileSignature className="w-10 h-10 text-slate-600 mb-3"/>
            <p className="text-slate-400 font-medium">
              {contracts.length === 0 ? 'No hire contracts yet' : 'No contracts match your filter'}
            </p>
            {contracts.length === 0 && (
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Create your first hire contract to start tracking equipment rentals
              </p>
            )}
            {contracts.length === 0 && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors">
                <Plus className="w-4 h-4"/> New Contract
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <ContractCard key={c.id} contract={c} onClick={setDetail}/>
            ))}
          </div>
        )}
      </div>

      {/* New / Edit form */}
      {(showForm || editContract) && (
        <ContractForm
          initial={editContract || {}}
          equipment={equipment}
          clients={clients}
          onClose={() => { setShowForm(false); setEditContract(null) }}
          onSave={handleSaved}
        />
      )}

      {/* Detail panel */}
      {detail && (
        <ContractDetailPanel
          contract={contracts.find(c => c.id === detail.id) || detail}
          onClose={() => setDetail(null)}
          onEdit={(c) => { setEditContract(c); setDetail(null) }}
          onStatusChange={() => qc.invalidateQueries({ queryKey: ['hire_contracts'] })}
        />
      )}
    </div>
  )
}

function StatChip({ label, value, color }) {
  const colors = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    slate:   'bg-dark-700 text-slate-300 border-dark-600',
    amber:   'bg-amber-500/10 text-amber-300 border-amber-500/20',
    red:     'bg-red-500/10 text-red-300 border-red-500/20',
  }
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${colors[color]}`}>
      <span className="font-bold">{value}</span> {label}
    </div>
  )
}
