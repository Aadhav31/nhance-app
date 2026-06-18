import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useDisplayMode } from '../../contexts/DisplayModeContext'
import toast from 'react-hot-toast'
import {
  Plus, X, Search, MapPin, Calendar, FileText, Wrench, Users,
  Droplet, Building2, Trash2, Edit2, IndianRupee, ExternalLink,
  Cpu, Phone, Mail, FolderOpen,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  tender:       { label: 'Tender',       cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  mobilization: { label: 'Mobilization', cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  active:       { label: 'Active',       cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  on_hold:      { label: 'On Hold',      cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  completed:    { label: 'Completed',    cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  closed:       { label: 'Closed',       cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
}

const JOB_CONFIG = {
  hire:          { label: 'Hire',          cls: 'bg-blue-500/15 text-blue-300' },
  rate_contract: { label: 'Rate Contract', cls: 'bg-teal-500/15 text-teal-300' },
  lump_sum:      { label: 'Lump Sum',      cls: 'bg-purple-500/15 text-purple-300' },
  amc:           { label: 'AMC',           cls: 'bg-amber-500/15 text-amber-300' },
}

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal','Andaman & Nicobar Islands',
  'Chandigarh','Delhi','Jammu & Kashmir','Ladakh','Puducherry',
]

const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'

// ── Shared UI ─────────────────────────────────────────────────────────────────

const inp  = (x='') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`
const sel  = (x='') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${x}`
const half  = 'grid grid-cols-2 gap-3'
const third = 'grid grid-cols-3 gap-3'

function Modal({ title, subtitle, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
      <div className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} bg-dark-800 rounded-t-2xl sm:rounded-xl border border-dark-600 flex flex-col max-h-[94vh]`}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-dark-700">
          <div>
            <h2 className="font-semibold text-slate-100 text-base">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">{children}</div>
        {footer && <div className="flex gap-3 p-4 border-t border-dark-700">{footer}</div>}
      </div>
    </div>
  )
}

function Sec({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-dark-700">
      <Icon className="w-4 h-4 text-primary-400" />
      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</span>
    </div>
  )
}

function F({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.tender
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>{c.label}</span>
}

function JobBadge({ type }) {
  const c = JOB_CONFIG[type]; if (!c) return null
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>{c.label}</span>
}

// ── Rate Card ─────────────────────────────────────────────────────────────────

const emptyItem = () => ({ _k: Math.random().toString(36).slice(2), item_name:'', unit:'', rate:'', rate_per_hour:'', rate_per_day:'', rate_per_month:'', min_quantity:'', overtime_rate:'', idle_rate:'', milestone_date:'' })

function RateCard({ job, items, onChange }) {
  const set = (i, k, v) => { const n=[...items]; n[i]={...n[i],[k]:v}; onChange(n) }
  const del = (i) => onChange(items.filter((_,x)=>x!==i))
  const add = () => onChange([...items, emptyItem()])

  if (!job) return <p className="text-sm text-slate-500 italic">Select a contract type above to configure rates.</p>

  if (job === 'hire') return (
    <div className="space-y-3">
      {items.map((r, i) => (
        <div key={r._k||r.id} className="bg-dark-700/50 rounded-lg p-3 space-y-2 border border-dark-600">
          <div className="flex items-center justify-between">
            <input className={inp('flex-1 mr-2 text-xs py-1.5')} value={r.item_name} onChange={e=>set(i,'item_name',e.target.value)} placeholder="Equipment type (e.g. Excavator 20T)" />
            <button onClick={()=>del(i)} className="text-slate-500 hover:text-red-400 p-1 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
          </div>
          <div className={third}>
            <div><p className="text-xs text-slate-500 mb-1">Rate/hr (₹)</p><input className={inp('text-xs py-1.5')} value={r.rate_per_hour} onChange={e=>set(i,'rate_per_hour',e.target.value)} placeholder="0" type="number"/></div>
            <div><p className="text-xs text-slate-500 mb-1">Rate/day (₹)</p><input className={inp('text-xs py-1.5')} value={r.rate_per_day} onChange={e=>set(i,'rate_per_day',e.target.value)} placeholder="0" type="number"/></div>
            <div><p className="text-xs text-slate-500 mb-1">Rate/month (₹)</p><input className={inp('text-xs py-1.5')} value={r.rate_per_month} onChange={e=>set(i,'rate_per_month',e.target.value)} placeholder="0" type="number"/></div>
          </div>
          <div className={third}>
            <div><p className="text-xs text-slate-500 mb-1">Min hrs/day</p><input className={inp('text-xs py-1.5')} value={r.min_quantity} onChange={e=>set(i,'min_quantity',e.target.value)} placeholder="8" type="number"/></div>
            <div><p className="text-xs text-slate-500 mb-1">Idle rate (₹/hr)</p><input className={inp('text-xs py-1.5')} value={r.idle_rate} onChange={e=>set(i,'idle_rate',e.target.value)} placeholder="0" type="number"/></div>
            <div><p className="text-xs text-slate-500 mb-1">OT rate (₹/hr)</p><input className={inp('text-xs py-1.5')} value={r.overtime_rate} onChange={e=>set(i,'overtime_rate',e.target.value)} placeholder="0" type="number"/></div>
          </div>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"><Plus className="w-3.5 h-3.5"/> Add equipment type</button>
    </div>
  )

  if (job === 'rate_contract') return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_100px_120px_28px] gap-2 text-xs text-slate-500 px-1">
        <span>Work Item / Description</span><span>Unit</span><span>Rate (₹/unit)</span><span/>
      </div>
      {items.map((r,i) => (
        <div key={r._k||r.id} className="grid grid-cols-[1fr_100px_120px_28px] gap-2 items-center">
          <input className={inp('text-xs py-1.5')} value={r.item_name} onChange={e=>set(i,'item_name',e.target.value)} placeholder="e.g. Earth excavation"/>
          <input className={inp('text-xs py-1.5')} value={r.unit} onChange={e=>set(i,'unit',e.target.value)} placeholder="cum / MT"/>
          <input className={inp('text-xs py-1.5')} value={r.rate} onChange={e=>set(i,'rate',e.target.value)} placeholder="0" type="number"/>
          <button onClick={()=>del(i)} className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"><Plus className="w-3.5 h-3.5"/> Add work item</button>
    </div>
  )

  if (job === 'lump_sum') return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_140px_130px_28px] gap-2 text-xs text-slate-500 px-1">
        <span>Milestone</span><span>Value (₹)</span><span>Due Date</span><span/>
      </div>
      {items.map((r,i) => (
        <div key={r._k||r.id} className="grid grid-cols-[1fr_140px_130px_28px] gap-2 items-center">
          <input className={inp('text-xs py-1.5')} value={r.item_name} onChange={e=>set(i,'item_name',e.target.value)} placeholder="e.g. Mobilization advance"/>
          <input className={inp('text-xs py-1.5')} value={r.rate} onChange={e=>set(i,'rate',e.target.value)} placeholder="0" type="number"/>
          <input className={inp('text-xs py-1.5')} value={r.milestone_date} onChange={e=>set(i,'milestone_date',e.target.value)} type="date"/>
          <button onClick={()=>del(i)} className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"><Plus className="w-3.5 h-3.5"/> Add milestone</button>
    </div>
  )

  if (job === 'amc') return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_140px_100px_28px] gap-2 text-xs text-slate-500 px-1">
        <span>Equipment / Scope</span><span>Monthly Rate (₹)</span><span>Unit</span><span/>
      </div>
      {items.map((r,i) => (
        <div key={r._k||r.id} className="grid grid-cols-[1fr_140px_100px_28px] gap-2 items-center">
          <input className={inp('text-xs py-1.5')} value={r.item_name} onChange={e=>set(i,'item_name',e.target.value)} placeholder="Equipment or service scope"/>
          <input className={inp('text-xs py-1.5')} value={r.rate} onChange={e=>set(i,'rate',e.target.value)} placeholder="0" type="number"/>
          <input className={inp('text-xs py-1.5')} value={r.unit} onChange={e=>set(i,'unit',e.target.value)} placeholder="month"/>
          <button onClick={()=>del(i)} className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"><Plus className="w-3.5 h-3.5"/> Add item</button>
    </div>
  )

  return null
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

const INIT_FORM = {
  project_name:'', project_code:'', division:'', client_id:'', status:'tender',
  site_name:'', address:'', city:'', state:'', pincode:'', maps_link:'',
  mobilization_date:'', start_date:'', expected_end_date:'', actual_end_date:'',
  nature_of_job:'', contract_value:'', billing_cycle:'', mobilization_advance:'',
  retention_pct:'', gst_rate:'18', payment_terms:'',
  hsd_supplied_by:'company', hsd_consumption_norm:'', hsd_rate_per_liter:'',
  hsd_excess_bill_rate:'', hsd_shortage_credit:'',
  client_pm_name:'', client_pm_phone:'', client_pm_email:'',
  client_pnm_name:'', client_pnm_phone:'',
  client_accounts_name:'', client_accounts_phone:'',
  our_supervisor_name:'', our_supervisor_phone:'',
  our_pnm_name:'', our_pnm_phone:'',
  notes:'',
}

function AddEditModal({ project, clients, projectCount, onClose, onSaved }) {
  const { userProfile } = useAuth()
  const isEdit = !!project

  const genCode = () => `PRJ-${new Date().getFullYear()}-${String(projectCount + 1).padStart(3,'0')}`

  const [form, setForm] = useState(() => isEdit
    ? { ...INIT_FORM, ...project, client_id: project.client_id || '', mobilization_date: project.mobilization_date||'', start_date: project.start_date||'', expected_end_date: project.expected_end_date||'', actual_end_date: project.actual_end_date||'' }
    : { ...INIT_FORM, project_code: genCode() }
  )
  const [rateItems, setRateItems] = useState([])
  const [ratesLoaded, setRatesLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const { isAdvanced } = useDisplayMode()

  // Load existing rate items when editing
  useQuery({
    queryKey: ['rate_items', project?.id],
    queryFn: async () => {
      if (!project?.id) return []
      const { data } = await supabase.from('project_rate_items').select('*').eq('project_id', project.id).order('sort_order')
      return data || []
    },
    enabled: !!project?.id && !ratesLoaded,
    onSuccess: (d) => { setRateItems(d.map(r => ({ ...r, _k: r.id }))); setRatesLoaded(true) },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.project_name.trim()) { toast.error('Project name is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id: userProfile.company_id,
        project_name: form.project_name.trim(),
        project_code: form.project_code.trim() || null,
        division:     form.division || null,
        client_id:    form.client_id || null,
        status:       form.status,
        site_name:    form.site_name || null,
        address:      form.address || null,
        city:         form.city || null,
        state:        form.state || null,
        pincode:      form.pincode || null,
        maps_link:    form.maps_link || null,
        mobilization_date: form.mobilization_date || null,
        start_date:        form.start_date || null,
        expected_end_date: form.expected_end_date || null,
        actual_end_date:   form.actual_end_date || null,
        nature_of_job:     form.nature_of_job || null,
        contract_value:    form.contract_value ? Number(form.contract_value) : null,
        billing_cycle:     form.billing_cycle || null,
        mobilization_advance: form.mobilization_advance ? Number(form.mobilization_advance) : null,
        retention_pct:     form.retention_pct ? Number(form.retention_pct) : null,
        gst_rate:          form.gst_rate ? Number(form.gst_rate) : 18,
        payment_terms:     form.payment_terms || null,
        hsd_supplied_by:   form.hsd_supplied_by,
        hsd_consumption_norm:  form.hsd_consumption_norm  ? Number(form.hsd_consumption_norm)  : null,
        hsd_rate_per_liter:    form.hsd_rate_per_liter    ? Number(form.hsd_rate_per_liter)    : null,
        hsd_excess_bill_rate:  form.hsd_excess_bill_rate  ? Number(form.hsd_excess_bill_rate)  : null,
        hsd_shortage_credit:   form.hsd_shortage_credit   ? Number(form.hsd_shortage_credit)   : null,
        client_pm_name:        form.client_pm_name        || null,
        client_pm_phone:       form.client_pm_phone       || null,
        client_pm_email:       form.client_pm_email       || null,
        client_pnm_name:       form.client_pnm_name       || null,
        client_pnm_phone:      form.client_pnm_phone      || null,
        client_accounts_name:  form.client_accounts_name  || null,
        client_accounts_phone: form.client_accounts_phone || null,
        our_supervisor_name:   form.our_supervisor_name   || null,
        our_supervisor_phone:  form.our_supervisor_phone  || null,
        our_pnm_name:          form.our_pnm_name          || null,
        our_pnm_phone:         form.our_pnm_phone         || null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      }

      let projectId
      if (isEdit) {
        const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
        if (error) throw error
        projectId = project.id
      } else {
        const { data, error } = await supabase.from('projects').insert(payload).select().single()
        if (error) throw error
        projectId = data.id
      }

      // Save rate items — replace all
      await supabase.from('project_rate_items').delete().eq('project_id', projectId)
      const validItems = rateItems.filter(r => r.item_name?.trim())
      if (validItems.length > 0) {
        const rows = validItems.map((r, idx) => ({
          company_id:    userProfile.company_id,
          project_id:    projectId,
          item_name:     r.item_name,
          unit:          r.unit          || null,
          rate:          r.rate          ? Number(r.rate)          : null,
          rate_per_hour: r.rate_per_hour ? Number(r.rate_per_hour) : null,
          rate_per_day:  r.rate_per_day  ? Number(r.rate_per_day)  : null,
          rate_per_month:r.rate_per_month? Number(r.rate_per_month): null,
          min_quantity:  r.min_quantity  ? Number(r.min_quantity)  : null,
          overtime_rate: r.overtime_rate ? Number(r.overtime_rate) : null,
          idle_rate:     r.idle_rate     ? Number(r.idle_rate)     : null,
          milestone_date:r.milestone_date|| null,
          sort_order:    idx,
        }))
        const { error } = await supabase.from('project_rate_items').insert(rows)
        if (error) throw error
      }

      toast.success(isEdit ? 'Project updated' : 'Project created')
      onSaved()
    } catch(e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit — ${project.project_name}` : 'New Project'}
      subtitle={isEdit ? project.project_code : 'Fill in the details below'}
      onClose={onClose}
      wide
      footer={<>
        <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
        </button>
      </>}
    >
      {/* 1 — Identity */}
      <div className="space-y-3">
        <Sec icon={FolderOpen} label="Project Identity" />
        <div className={half}>
          <F label="Project Name" required>
            <input className={inp()} value={form.project_name} onChange={e=>set('project_name',e.target.value)} placeholder="e.g. NH-45 Road Widening"/>
          </F>
          <F label="Project Code">
            <input className={inp('font-mono')} value={form.project_code} onChange={e=>set('project_code',e.target.value)} placeholder="PRJ-2026-001"/>
          </F>
        </div>
        <div className={half}>
          <F label="Client">
            <select className={sel()} value={form.client_id} onChange={e=>set('client_id',e.target.value)}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
            </select>
          </F>
          <F label="Status">
            <select className={sel()} value={form.status} onChange={e=>set('status',e.target.value)}>
              {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </F>
        </div>
        {isAdvanced && (
          <F label="Division / Business Unit">
            <input className={inp()} value={form.division} onChange={e=>set('division',e.target.value)} placeholder="e.g. Infrastructure, Mining…"/>
          </F>
        )}
      </div>

      {/* 2 — Site & Location */}
      <div className="space-y-3">
        <Sec icon={MapPin} label="Site & Location" />
        <div className={isAdvanced ? half : 'grid grid-cols-1'}>
          <F label="City"><input className={inp()} value={form.city} onChange={e=>set('city',e.target.value)} placeholder="City"/></F>
          {isAdvanced && <F label="Site Name"><input className={inp()} value={form.site_name} onChange={e=>set('site_name',e.target.value)} placeholder="Name of project site"/></F>}
        </div>
        {isAdvanced && <>
          <F label="Address">
            <textarea className={inp('resize-none')} rows={2} value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Full site address"/>
          </F>
          <div className={half}>
            <F label="State">
              <select className={sel()} value={form.state} onChange={e=>set('state',e.target.value)}>
                <option value="">Select state…</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </F>
            <F label="Pincode"><input className={inp()} value={form.pincode} onChange={e=>set('pincode',e.target.value)} maxLength={6} placeholder="600001"/></F>
          </div>
          <F label="Google Maps Link" hint="Paste a Google Maps URL for quick navigation to site">
            <input className={inp()} value={form.maps_link} onChange={e=>set('maps_link',e.target.value)} placeholder="https://maps.google.com/…"/>
          </F>
        </>}
      </div>

      {/* 3 — Timeline */}
      <div className="space-y-3">
        <Sec icon={Calendar} label="Timeline" />
        <F label="Work Commencement Date">
          <input className={inp('max-w-xs')} type="date" value={form.start_date} onChange={e=>set('start_date',e.target.value)}/>
        </F>
        {isAdvanced && <>
          <div className={half}>
            <F label="Mobilization Date"><input className={inp()} type="date" value={form.mobilization_date} onChange={e=>set('mobilization_date',e.target.value)}/></F>
            <F label="Expected Completion"><input className={inp()} type="date" value={form.expected_end_date} onChange={e=>set('expected_end_date',e.target.value)}/></F>
          </div>
          <F label="Actual Completion">
            <input className={inp('max-w-xs')} type="date" value={form.actual_end_date} onChange={e=>set('actual_end_date',e.target.value)}/>
          </F>
        </>}
      </div>

      {/* 4 — Contract Terms */}
      <div className="space-y-3">
        <Sec icon={FileText} label="Contract Terms" />
        <div className={half}>
          <F label="Nature of Job" required>
            <select className={sel()} value={form.nature_of_job} onChange={e=>{ set('nature_of_job',e.target.value); setRateItems([emptyItem()]) }}>
              <option value="">Select…</option>
              <option value="hire">Hire</option>
              <option value="rate_contract">Rate Contract</option>
              <option value="lump_sum">Lump Sum</option>
              <option value="amc">AMC</option>
            </select>
          </F>
          <F label="Contract Value (₹)">
            <input className={inp()} value={form.contract_value} onChange={e=>set('contract_value',e.target.value)} type="number" placeholder="0"/>
          </F>
        </div>
        {isAdvanced && <>
          <div className={half}>
            <F label="Billing Cycle">
              <select className={sel()} value={form.billing_cycle} onChange={e=>set('billing_cycle',e.target.value)}>
                <option value="">Select…</option>
                {['Weekly','Fortnightly','Monthly','Milestone-based','On completion'].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </F>
            <F label="Payment Terms">
              <select className={sel()} value={form.payment_terms} onChange={e=>set('payment_terms',e.target.value)}>
                <option value="">Select…</option>
                {['15 days','30 days','45 days','60 days','90 days'].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </F>
          </div>
          <div className={third}>
            <F label="Mobilization Advance (₹)">
              <input className={inp()} value={form.mobilization_advance} onChange={e=>set('mobilization_advance',e.target.value)} type="number" placeholder="0"/>
            </F>
            <F label="Retention %">
              <input className={inp()} value={form.retention_pct} onChange={e=>set('retention_pct',e.target.value)} type="number" placeholder="5"/>
            </F>
            <F label="GST Rate %">
              <select className={sel()} value={form.gst_rate} onChange={e=>set('gst_rate',e.target.value)}>
                {['0','5','12','18','28'].map(v=><option key={v} value={v}>{v}%</option>)}
              </select>
            </F>
          </div>
        </>}
      </div>

      {/* 5 — Rate Card (Advanced) */}
      {isAdvanced && <div className="space-y-3">
        <Sec icon={IndianRupee} label="Rate Card" />
        <RateCard job={form.nature_of_job} items={rateItems} onChange={setRateItems}/>
      </div>}

      {/* 6 — HSD Terms (Advanced) */}
      {isAdvanced && <div className="space-y-3">
        <Sec icon={Droplet} label="HSD (Diesel) Terms" />
        <div className="flex gap-3">
          {['company','client'].map(v => (
            <button key={v} type="button"
              onClick={() => set('hsd_supplied_by', v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.hsd_supplied_by===v ? 'bg-primary-600 border-primary-500 text-white' : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-slate-200'}`}>
              {v === 'company' ? '🏢 Supplied by Us' : '🏗️ Supplied by Client'}
            </button>
          ))}
        </div>
        {form.hsd_supplied_by === 'client' && (
          <div className="space-y-3 pt-1">
            <div className={half}>
              <F label="Consumption Norm (L/hr)" hint="Standard norm agreed with client">
                <input className={inp()} value={form.hsd_consumption_norm} onChange={e=>set('hsd_consumption_norm',e.target.value)} type="number" placeholder="18"/>
              </F>
              <F label="HSD Rate (₹/L)">
                <input className={inp()} value={form.hsd_rate_per_liter} onChange={e=>set('hsd_rate_per_liter',e.target.value)} type="number" placeholder="95"/>
              </F>
            </div>
            <div className={half}>
              <F label="Excess Consumption Billing (₹/L)" hint="Rate charged to client for consumption above norm">
                <input className={inp()} value={form.hsd_excess_bill_rate} onChange={e=>set('hsd_excess_bill_rate',e.target.value)} type="number" placeholder="0"/>
              </F>
              <F label="Shortage Credit (₹/L)" hint="Credit given to client for consumption below norm">
                <input className={inp()} value={form.hsd_shortage_credit} onChange={e=>set('hsd_shortage_credit',e.target.value)} type="number" placeholder="0"/>
              </F>
            </div>
          </div>
        )}
      </div>}

      {/* 7 — Key Contacts (Advanced) */}
      {isAdvanced && <div className="space-y-3">
        <Sec icon={Users} label="Key Contacts" />
        <p className="text-xs text-slate-500 -mt-1">Client-side team</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">Project Manager</p>
            <input className={inp('text-xs')} value={form.client_pm_name} onChange={e=>set('client_pm_name',e.target.value)} placeholder="Name"/>
            <input className={inp('text-xs')} value={form.client_pm_phone} onChange={e=>set('client_pm_phone',e.target.value)} placeholder="Mobile"/>
            <input className={inp('text-xs')} value={form.client_pm_email} onChange={e=>set('client_pm_email',e.target.value)} placeholder="Email"/>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">P&M Manager</p>
            <input className={inp('text-xs')} value={form.client_pnm_name} onChange={e=>set('client_pnm_name',e.target.value)} placeholder="Name"/>
            <input className={inp('text-xs')} value={form.client_pnm_phone} onChange={e=>set('client_pnm_phone',e.target.value)} placeholder="Mobile"/>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">Accounts Manager</p>
            <input className={inp('text-xs')} value={form.client_accounts_name} onChange={e=>set('client_accounts_name',e.target.value)} placeholder="Name"/>
            <input className={inp('text-xs')} value={form.client_accounts_phone} onChange={e=>set('client_accounts_phone',e.target.value)} placeholder="Mobile"/>
          </div>
        </div>
        <p className="text-xs text-slate-500">Our team on site</p>
        <div className={half}>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">Site Supervisor</p>
            <input className={inp('text-xs')} value={form.our_supervisor_name} onChange={e=>set('our_supervisor_name',e.target.value)} placeholder="Name"/>
            <input className={inp('text-xs')} value={form.our_supervisor_phone} onChange={e=>set('our_supervisor_phone',e.target.value)} placeholder="Mobile"/>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">P&M In-charge</p>
            <input className={inp('text-xs')} value={form.our_pnm_name} onChange={e=>set('our_pnm_name',e.target.value)} placeholder="Name"/>
            <input className={inp('text-xs')} value={form.our_pnm_phone} onChange={e=>set('our_pnm_phone',e.target.value)} placeholder="Mobile"/>
          </div>
        </div>
      </div>}

      {/* 8 — Notes (Advanced) */}
      {isAdvanced && <div className="space-y-3">
        <Sec icon={FileText} label="Notes / Remarks" />
        <textarea className={inp('resize-none')} rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Special terms, scope notes, or project remarks…"/>
      </div>}
    </Modal>
  )
}

// ── Project Detail ────────────────────────────────────────────────────────────

function Row({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between py-1.5 border-b border-dark-700/50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-slate-200 text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function ContactCard({ name, phone, email, role }) {
  if (!name) return null
  return (
    <div className="bg-dark-700/50 rounded-lg p-3 space-y-1">
      <p className="text-xs font-medium text-slate-200">{name}</p>
      <p className="text-[11px] text-primary-400">{role}</p>
      {phone && <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"><Phone className="w-3 h-3"/> {phone}</a>}
      {email && <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"><Mail className="w-3 h-3"/> {email}</a>}
    </div>
  )
}

function ProjectDetail({ project, onClose, onEdit }) {
  const { isAdvanced } = useDisplayMode()
  const { data: equipment = [] } = useQuery({
    queryKey: ['project_equipment', project.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment')
        .select('id, equipment_id, equipment_type, make_model, status')
        .eq('current_project_id', project.id)
        .eq('is_active', true)
      return data || []
    },
  })

  const { data: rateItems = [] } = useQuery({
    queryKey: ['rate_items_view', project.id],
    queryFn: async () => {
      const { data } = await supabase.from('project_rate_items').select('*').eq('project_id', project.id).order('sort_order')
      return data || []
    },
  })

  const clientName = project.clients?.business_name

  return (
    <Modal title={project.project_name} subtitle={project.project_code} onClose={onClose} wide
      footer={<>
        <button onClick={onClose} className="btn-ghost flex-1">Close</button>
        <button onClick={onEdit} className="btn-primary flex-1 flex items-center justify-center gap-2"><Edit2 className="w-3.5 h-3.5"/> Edit Project</button>
      </>}
    >
      {/* Badges */}
      <div className="flex flex-wrap gap-2 -mt-2">
        <StatusBadge status={project.status}/>
        {project.nature_of_job && <JobBadge type={project.nature_of_job}/>}
        {isAdvanced && project.division && <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full">{project.division}</span>}
        {clientName && <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1"><Building2 className="w-3 h-3"/>{clientName}</span>}
      </div>

      {/* Quick stats — Basic: Contract Value + Equipment; Advanced adds GST */}
      <div className={`grid gap-3 ${isAdvanced ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {[
          { label: 'Contract Value',    value: fmt(project.contract_value) },
          { label: 'Equipment on Site', value: `${equipment.length} unit${equipment.length !== 1 ? 's' : ''}` },
          ...(isAdvanced ? [{ label: 'GST Rate', value: project.gst_rate ? `${project.gst_rate}%` : '18%' }] : []),
        ].map(s => (
          <div key={s.label} className="bg-dark-700/50 rounded-lg p-3 text-center">
            <p className="text-[11px] text-slate-500 mb-0.5">{s.label}</p>
            <p className="text-sm font-semibold text-slate-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Site — Basic: city only; Advanced: full block */}
      {isAdvanced ? (
        <div className={half}>
          <div>
            <Sec icon={MapPin} label="Site & Location"/>
            <div className="mt-2">
              <Row label="Site Name" value={project.site_name}/>
              <Row label="Address"   value={project.address}/>
              <Row label="City"      value={project.city}/>
              <Row label="State"     value={project.state}/>
              <Row label="Pincode"   value={project.pincode}/>
              {project.maps_link && (
                <a href={project.maps_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 pt-2">
                  <ExternalLink className="w-3 h-3"/> Open in Maps
                </a>
              )}
            </div>
          </div>
          <div>
            <Sec icon={Calendar} label="Timeline"/>
            <div className="mt-2">
              <Row label="Mobilization"  value={fmtDate(project.mobilization_date)}/>
              <Row label="Start Date"    value={fmtDate(project.start_date)}/>
              <Row label="Expected End"  value={fmtDate(project.expected_end_date)}/>
              <Row label="Actual End"    value={fmtDate(project.actual_end_date)}/>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {project.city && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-slate-500"/> {project.city}{project.state ? `, ${project.state}` : ''}
            </div>
          )}
          {project.start_date && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-500"/> Started {fmtDate(project.start_date)}
            </div>
          )}
        </div>
      )}

      {/* Contract — Advanced only */}
      {isAdvanced && (
        <div>
          <Sec icon={FileText} label="Contract Terms"/>
          <div className="mt-2 grid grid-cols-2 gap-x-6">
            <div>
              <Row label="Billing Cycle" value={project.billing_cycle}/>
              <Row label="Payment Terms" value={project.payment_terms}/>
              <Row label="Mob. Advance"  value={fmt(project.mobilization_advance)}/>
            </div>
            <div>
              <Row label="Retention" value={project.retention_pct ? `${project.retention_pct}%` : null}/>
              <Row label="GST Rate"  value={project.gst_rate ? `${project.gst_rate}%` : null}/>
            </div>
          </div>
        </div>
      )}

      {/* Rate Card — Advanced only */}
      {isAdvanced && rateItems.length > 0 && (
        <div>
          <Sec icon={IndianRupee} label="Rate Card"/>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-dark-700">
                  <th className="text-left py-1.5 font-medium pr-4">
                    {project.nature_of_job === 'hire' ? 'Equipment' : project.nature_of_job === 'rate_contract' ? 'Work Item' : project.nature_of_job === 'lump_sum' ? 'Milestone' : 'Scope'}
                  </th>
                  {project.nature_of_job === 'hire' && <>
                    <th className="text-right py-1.5 font-medium pr-3">₹/hr</th>
                    <th className="text-right py-1.5 font-medium pr-3">₹/day</th>
                    <th className="text-right py-1.5 font-medium pr-3">₹/month</th>
                    <th className="text-right py-1.5 font-medium">Min hrs</th>
                  </>}
                  {project.nature_of_job === 'rate_contract' && <>
                    <th className="text-left py-1.5 font-medium pr-4">Unit</th>
                    <th className="text-right py-1.5 font-medium">Rate (₹)</th>
                  </>}
                  {project.nature_of_job === 'lump_sum' && <>
                    <th className="text-right py-1.5 font-medium pr-4">Value (₹)</th>
                    <th className="text-right py-1.5 font-medium">Due Date</th>
                  </>}
                  {project.nature_of_job === 'amc' && (
                    <th className="text-right py-1.5 font-medium">Monthly (₹)</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rateItems.map(r => (
                  <tr key={r.id} className="border-b border-dark-700/40">
                    <td className="py-1.5 pr-4 text-slate-200">{r.item_name}</td>
                    {project.nature_of_job === 'hire' && <>
                      <td className="py-1.5 pr-3 text-right text-slate-300">{r.rate_per_hour ? `₹${Number(r.rate_per_hour).toLocaleString('en-IN')}` : '—'}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-300">{r.rate_per_day  ? `₹${Number(r.rate_per_day).toLocaleString('en-IN')}`  : '—'}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-300">{r.rate_per_month? `₹${Number(r.rate_per_month).toLocaleString('en-IN')}`: '—'}</td>
                      <td className="py-1.5 text-right text-slate-300">{r.min_quantity || '—'}</td>
                    </>}
                    {project.nature_of_job === 'rate_contract' && <>
                      <td className="py-1.5 pr-4 text-slate-400">{r.unit || '—'}</td>
                      <td className="py-1.5 text-right text-slate-300">{r.rate ? `₹${Number(r.rate).toLocaleString('en-IN')}` : '—'}</td>
                    </>}
                    {project.nature_of_job === 'lump_sum' && <>
                      <td className="py-1.5 pr-4 text-right text-slate-300">{r.rate ? `₹${Number(r.rate).toLocaleString('en-IN')}` : '—'}</td>
                      <td className="py-1.5 text-right text-slate-400">{fmtDate(r.milestone_date)}</td>
                    </>}
                    {project.nature_of_job === 'amc' && (
                      <td className="py-1.5 text-right text-slate-300">{r.rate ? `₹${Number(r.rate).toLocaleString('en-IN')}` : '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HSD — Advanced only */}
      {isAdvanced && project.hsd_supplied_by === 'client' && (
        <div>
          <Sec icon={Droplet} label="HSD Terms (Client-supplied)"/>
          <div className="mt-2 grid grid-cols-2 gap-x-6">
            <div>
              <Row label="Consumption Norm"  value={project.hsd_consumption_norm ? `${project.hsd_consumption_norm} L/hr` : null}/>
              <Row label="HSD Rate"          value={project.hsd_rate_per_liter    ? `₹${project.hsd_rate_per_liter}/L`   : null}/>
            </div>
            <div>
              <Row label="Excess Billing"   value={project.hsd_excess_bill_rate  ? `₹${project.hsd_excess_bill_rate}/L` : null}/>
              <Row label="Shortage Credit"  value={project.hsd_shortage_credit   ? `₹${project.hsd_shortage_credit}/L`  : null}/>
            </div>
          </div>
        </div>
      )}

      {/* Contacts — Advanced only */}
      {isAdvanced && (
        <div>
          <Sec icon={Users} label="Key Contacts"/>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ContactCard name={project.client_pm_name}       phone={project.client_pm_phone}       email={project.client_pm_email} role="Client PM"/>
            <ContactCard name={project.client_pnm_name}      phone={project.client_pnm_phone}       role="Client P&M"/>
            <ContactCard name={project.client_accounts_name} phone={project.client_accounts_phone}  role="Client Accounts"/>
            <ContactCard name={project.our_supervisor_name}  phone={project.our_supervisor_phone}   role="Our Supervisor"/>
            <ContactCard name={project.our_pnm_name}         phone={project.our_pnm_phone}          role="Our P&M In-charge"/>
          </div>
        </div>
      )}

      {/* Equipment on Site — always shown */}
      <div>
        <Sec icon={Cpu} label={`Equipment on Site (${equipment.length})`}/>
        {equipment.length === 0 ? (
          <p className="text-xs text-slate-500 mt-2 italic">No equipment deployed here yet. Deploy from the Fleet module.</p>
        ) : (
          <div className="mt-2 space-y-1">
            {equipment.map(e => (
              <div key={e.id} className="flex items-center justify-between bg-dark-700/50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-slate-200">{e.equipment_id}</p>
                  <p className="text-[11px] text-slate-500">{e.equipment_type}{e.make_model ? ` · ${e.make_model}` : ''}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${e.status==='working' ? 'bg-emerald-500/15 text-emerald-300' : e.status==='idle' ? 'bg-yellow-500/15 text-yellow-300' : 'bg-slate-500/15 text-slate-400'}`}>
                  {e.status || 'deployed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdvanced && project.notes && (
        <div>
          <Sec icon={FileText} label="Notes"/>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">{project.notes}</p>
        </div>
      )}
    </Modal>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-dark-800 border border-dark-700 rounded-xl p-4 hover:border-dark-500 transition-all group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-100 text-sm truncate group-hover:text-primary-300 transition-colors">{project.project_name}</p>
          {project.project_code && <p className="text-[11px] text-slate-500 font-mono mt-0.5">{project.project_code}</p>}
        </div>
        <StatusBadge status={project.status}/>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {project.nature_of_job && <JobBadge type={project.nature_of_job}/>}
        {project.division && <span className="text-[11px] bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full">{project.division}</span>}
      </div>
      <div className="space-y-1 text-xs text-slate-500">
        {project.clients?.business_name && (
          <div className="flex items-center gap-1.5"><Building2 className="w-3 h-3 shrink-0"/><span className="truncate">{project.clients.business_name}</span></div>
        )}
        {(project.city || project.state) && (
          <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 shrink-0"/><span>{[project.city, project.state].filter(Boolean).join(', ')}</span></div>
        )}
        {project.start_date && (
          <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3 shrink-0"/><span>{fmtDate(project.start_date)}{project.expected_end_date ? ` → ${fmtDate(project.expected_end_date)}` : ''}</span></div>
        )}
        {project.contract_value && (
          <div className="flex items-center gap-1.5"><IndianRupee className="w-3 h-3 shrink-0"/><span>{fmt(project.contract_value)}</span></div>
        )}
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { userProfile, role } = useAuth()
  const qc = useQueryClient()
  const isAdmin = ['admin','superadmin','manager'].includes(role)

  const companyId = userProfile?.company_id

  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('all')
  const [showAdd, setShowAdd]     = useState(false)
  const [editing, setEditing]     = useState(null)
  const [viewing, setViewing]     = useState(null)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, clients(business_name)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients_dropdown', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, business_name')
        .eq('company_id', companyId)
        .order('business_name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return projects.filter(p => {
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      const matchSearch = !q ||
        p.project_name?.toLowerCase().includes(q) ||
        p.project_code?.toLowerCase().includes(q) ||
        p.clients?.business_name?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.division?.toLowerCase().includes(q)
      return matchStatus && matchSearch
    })
  }, [projects, search, statusFilter])

  const statusCounts = useMemo(() =>
    projects.reduce((acc, p) => { acc[p.status] = (acc[p.status]||0)+1; return acc }, {}),
  [projects])

  const onSaved = () => {
    qc.invalidateQueries(['projects'])
    setShowAdd(false)
    setEditing(null)
  }

  const handleArchive = async (p) => {
    if (!confirm(`Archive "${p.project_name}"? It won't be deleted.`)) return
    const { error } = await supabase.from('projects').update({ is_active: false }).eq('id', p.id)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries(['projects'])
    setViewing(null)
    toast.success('Project archived')
  }

  return (
    <div className="h-full flex flex-col bg-dark-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700 bg-dark-800 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Projects</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {projects.length} project{projects.length!==1?'s':''} · {projects.filter(p=>p.status==='active').length} active
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4"/> New Project
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-dark-700 bg-dark-800 flex-shrink-0 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/>
          <input
            className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by name, code, client, city…"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[['all','All'], ...Object.entries(STATUS_CONFIG).map(([k,v])=>[k,v.label])].map(([k,label]) => (
            <button key={k} onClick={() => setStatus(k)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${statusFilter===k ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 hover:text-slate-200'}`}>
              {label}{k !== 'all' && statusCounts[k] ? ` (${statusCounts[k]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center">
            <FolderOpen className="w-10 h-10 text-slate-600 mb-3"/>
            <p className="text-slate-400 font-medium">{search || statusFilter!=='all' ? 'No projects match' : 'No projects yet'}</p>
            <p className="text-slate-500 text-sm mt-1">{isAdmin && !search ? 'Click "New Project" to get started' : 'Try adjusting your search'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => <ProjectCard key={p.id} project={p} onClick={() => setViewing(p)}/>)}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddEditModal
          clients={clients}
          projectCount={projects.length}
          onClose={() => setShowAdd(false)}
          onSaved={onSaved}
        />
      )}
      {editing && (
        <AddEditModal
          project={editing}
          clients={clients}
          projectCount={projects.length}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {viewing && (
        <ProjectDetail
          project={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
        />
      )}
    </div>
  )
}
