import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import PagePanel from '../../components/shared/PagePanel'
import { useAuth } from '../../contexts/AuthContext'
import { useDisplayMode } from '../../contexts/DisplayModeContext'
import toast from 'react-hot-toast'
import {
  Plus, X, Search, MapPin, Calendar, FileText, Users,
  Droplet, Building2, Trash2, Edit2, IndianRupee, ExternalLink,
  Cpu, Phone, Mail, FolderOpen, Navigation, UserPlus, RefreshCw, Clock,
  Upload, Download, Eye, File, ShoppingBag, Briefcase, PenLine, LayoutGrid,
  AlertTriangle, CheckCircle2, Paperclip,
} from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────────

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

const BILLING_BASIS_OPTIONS = [
  { value: 'daily',             label: 'Daily' },
  { value: 'monthly',           label: 'Monthly' },
  { value: 'hourly',            label: 'Hourly' },
  { value: 'short_term_hourly', label: 'Short-term' },
]

const fmt     = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const clientLabel = (c) => c?.display_name || c?.business_name || ''

// ── Shared UI ──────────────────────────────────────────────────────────────────

const inp  = (x='') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`
const sel  = (x='') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${x}`
const half  = 'grid grid-cols-2 gap-3'
const third = 'grid grid-cols-3 gap-3'

function Modal({ title, subtitle, onClose, children, footer, wide }) {
  return (
    <PagePanel title={title} subtitle={subtitle} onClose={onClose} footer={footer}>
      {children}
    </PagePanel>
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

// ── GPS Location Picker ────────────────────────────────────────────────────────

function LocationPicker({ lat, lng, onCapture }) {
  const [loading, setLoading] = useState(false)

  const recordLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported by this browser'); return }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        onCapture(
          pos.coords.latitude.toFixed(6),
          pos.coords.longitude.toFixed(6)
        )
        setLoading(false)
        toast.success('Location recorded')
      },
      err => { toast.error('Location error: ' + err.message); setLoading(false) },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={recordLocation} disabled={loading}
          className="flex items-center gap-1.5 text-xs bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-slate-300 hover:text-white hover:border-primary-500 transition-colors disabled:opacity-60">
          <Navigation className="w-3.5 h-3.5"/>
          {loading ? 'Locating…' : lat && lng ? 'Update Location' : 'Record Current Location'}
        </button>
        {lat && lng && (
          <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300">
            <ExternalLink className="w-3 h-3"/> View on Map
          </a>
        )}
      </div>
      {lat && lng
        ? <p className="text-xs text-slate-400 font-mono bg-dark-700/50 rounded px-2 py-1 inline-block">📍 {lat}, {lng}</p>
        : <p className="text-xs text-slate-600 italic">No coordinates recorded — go to site and tap above to pin location</p>
      }
    </div>
  )
}

// ── Rate Card ──────────────────────────────────────────────────────────────────

const emptyItem = () => ({
  _k: Math.random().toString(36).slice(2),
  item_name: '', unit: '', rate: '',
  rate_per_hour: '', rate_per_day: '', rate_per_month: '',
  min_quantity: '', overtime_rate: '', idle_rate: '', milestone_date: '',
  billing_basis: 'daily',
  max_hours_per_day: '8',
  max_hours_per_month: '200',
  working_days_per_month: '26',
  ot_percentage: '125',
  is_short_term: false,
  short_term_fixed_hours: '6',
  rate_inclusive_hsd: false,
  rate_inclusive_gst: false,
  allowance_per_day: '',
})

function RateCard({ job, items, onChange }) {
  const set = (i, k, v) => { const n=[...items]; n[i]={...n[i],[k]:v}; onChange(n) }
  const del = (i) => onChange(items.filter((_,x)=>x!==i))
  const add = () => onChange([...items, emptyItem()])

  if (!job) return <p className="text-sm text-slate-500 italic">Select a contract type above to configure rates.</p>

  if (job === 'hire') return (
    <div className="space-y-3">
      {items.map((r, i) => {
        const basis = r.billing_basis || 'daily'
        const otHourlyRate = basis === 'daily' && r.rate_per_day && r.max_hours_per_day
          ? ((Number(r.rate_per_day) / Number(r.max_hours_per_day)) * (Number(r.ot_percentage || 125) / 100)).toFixed(0)
          : null

        return (
          <div key={r._k||r.id} className="bg-dark-700/50 rounded-lg p-3 space-y-3 border border-dark-600">
            {/* Equipment name */}
            <div className="flex items-center justify-between">
              <input className={inp('flex-1 mr-2 text-xs py-1.5')}
                value={r.item_name} onChange={e=>set(i,'item_name',e.target.value)}
                placeholder="Equipment type (e.g. Excavator 20T)"/>
              <button onClick={()=>del(i)} className="text-slate-500 hover:text-red-400 p-1 shrink-0">
                <Trash2 className="w-3.5 h-3.5"/>
              </button>
            </div>

            {/* Billing basis selector */}
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Billing Basis</p>
              <div className="flex gap-1">
                {BILLING_BASIS_OPTIONS.map(b => (
                  <button key={b.value} type="button"
                    onClick={() => set(i, 'billing_basis', b.value)}
                    className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                      basis === b.value
                        ? 'bg-primary-600 border-primary-500 text-white'
                        : 'bg-dark-600 border-dark-500 text-slate-400 hover:text-slate-200'
                    }`}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Daily */}
            {basis === 'daily' && (
              <div className="space-y-2">
                <div className={half}>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Rate/day (₹)</p>
                    <input className={inp('text-xs py-1.5')} value={r.rate_per_day}
                      onChange={e=>set(i,'rate_per_day',e.target.value)} placeholder="0" type="number"/>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Idle rate (₹/day)</p>
                    <input className={inp('text-xs py-1.5')} value={r.idle_rate}
                      onChange={e=>set(i,'idle_rate',e.target.value)} placeholder="0" type="number"/>
                  </div>
                </div>
                <div className={half}>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Max hrs/day before OT</p>
                    <input className={inp('text-xs py-1.5')} value={r.max_hours_per_day}
                      onChange={e=>set(i,'max_hours_per_day',e.target.value)} placeholder="8" type="number"/>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">OT charge (% of pro-rata rate)</p>
                    <input className={inp('text-xs py-1.5')} value={r.ot_percentage}
                      onChange={e=>set(i,'ot_percentage',e.target.value)} placeholder="125" type="number"/>
                  </div>
                </div>
                {otHourlyRate && (
                  <p className="text-[11px] text-slate-500 bg-dark-800 rounded px-2 py-1">
                    OT beyond {r.max_hours_per_day} hrs @ ₹{otHourlyRate}/hr
                    &nbsp;({r.ot_percentage}% of ₹{(Number(r.rate_per_day)/Number(r.max_hours_per_day)).toFixed(0)}/hr pro-rata)
                  </p>
                )}
              </div>
            )}

            {/* Monthly */}
            {basis === 'monthly' && (
              <div className="space-y-2">
                <div className={half}>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Rate/month (₹)</p>
                    <input className={inp('text-xs py-1.5')} value={r.rate_per_month}
                      onChange={e=>set(i,'rate_per_month',e.target.value)} placeholder="0" type="number"/>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Idle rate (₹/month)</p>
                    <input className={inp('text-xs py-1.5')} value={r.idle_rate}
                      onChange={e=>set(i,'idle_rate',e.target.value)} placeholder="0" type="number"/>
                  </div>
                </div>
                <div className={half}>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Working days/month</p>
                    <input className={inp('text-xs py-1.5')} value={r.working_days_per_month}
                      onChange={e=>set(i,'working_days_per_month',e.target.value)} placeholder="26" type="number" min="1" max="31"/>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Max hrs/month before OT</p>
                    <input className={inp('text-xs py-1.5')} value={r.max_hours_per_month}
                      onChange={e=>set(i,'max_hours_per_month',e.target.value)} placeholder="200" type="number"/>
                  </div>
                </div>
                <div className={half}>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">OT charge (% of pro-rata rate)</p>
                    <input className={inp('text-xs py-1.5')} value={r.ot_percentage}
                      onChange={e=>set(i,'ot_percentage',e.target.value)} placeholder="125" type="number"/>
                  </div>
                </div>
                {r.rate_per_month && r.max_hours_per_month && (
                  <p className="text-[11px] text-slate-500 bg-dark-800 rounded px-2 py-1">
                    OT beyond {r.max_hours_per_month} hrs/month charged at {r.ot_percentage || 125}% of pro-rata monthly rate
                  </p>
                )}
              </div>
            )}

            {/* Hourly */}
            {basis === 'hourly' && (
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Rent / hour (₹)</p>
                  <input className={`${inp('text-xs py-1.5')} max-w-xs`} value={r.rate_per_hour}
                    onChange={e=>set(i,'rate_per_hour',e.target.value)} placeholder="0" type="number"/>
                </div>
              </div>
            )}

            {/* Short-term hourly */}
            {basis === 'short_term_hourly' && (
              <div className="space-y-2">
                <div className={half}>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Fixed charge (₹) up to {r.short_term_fixed_hours || 6} hrs
                    </p>
                    <input className={inp('text-xs py-1.5')} value={r.rate_per_hour}
                      onChange={e=>set(i,'rate_per_hour',e.target.value)} placeholder="0" type="number"/>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Fixed hrs threshold</p>
                    <input className={inp('text-xs py-1.5')} value={r.short_term_fixed_hours}
                      onChange={e=>set(i,'short_term_fixed_hours',e.target.value)} placeholder="6" type="number"/>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">
                    Hourly rate beyond {r.short_term_fixed_hours || 6} hrs (₹/hr)
                  </p>
                  <input className={`${inp('text-xs py-1.5')} max-w-xs`} value={r.overtime_rate}
                    onChange={e=>set(i,'overtime_rate',e.target.value)} placeholder="0" type="number"/>
                </div>
                {r.rate_per_hour && (
                  <p className="text-[11px] text-slate-500 bg-dark-800 rounded px-2 py-1">
                    ₹{Number(r.rate_per_hour).toLocaleString('en-IN')} flat for first {r.short_term_fixed_hours || 6} hrs
                    {r.overtime_rate ? ` · ₹${Number(r.overtime_rate).toLocaleString('en-IN')}/hr beyond` : ''}
                  </p>
                )}
              </div>
            )}

            {/* Common: Allowance & Rate Inclusions — all hire types */}
            <div className="border-t border-dark-600 pt-2.5 space-y-2">
              <div>
                <p className="text-xs text-slate-500 mb-1">Allowance per day (₹, if applicable)</p>
                <input className={`${inp('text-xs py-1.5')} max-w-xs`} value={r.allowance_per_day}
                  onChange={e=>set(i,'allowance_per_day',e.target.value)} placeholder="0" type="number"/>
              </div>
              <div className="flex gap-5 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={!!r.rate_inclusive_hsd}
                    onChange={e=>set(i,'rate_inclusive_hsd',e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-primary-500"/>
                  <span className="text-xs text-slate-400">Rate inclusive of HSD</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={!!r.rate_inclusive_gst}
                    onChange={e=>set(i,'rate_inclusive_gst',e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-primary-500"/>
                  <span className="text-xs text-slate-400">Rate inclusive of GST</span>
                </label>
              </div>
            </div>
          </div>
        )
      })}
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300">
        <Plus className="w-3.5 h-3.5"/> Add equipment type
      </button>
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
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300">
        <Plus className="w-3.5 h-3.5"/> Add work item
      </button>
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
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300">
        <Plus className="w-3.5 h-3.5"/> Add milestone
      </button>
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
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300">
        <Plus className="w-3.5 h-3.5"/> Add item
      </button>
    </div>
  )

  return null
}

// ── Add / Edit Modal ───────────────────────────────────────────────────────────

const INIT_FORM = {
  project_name: '', project_code: '', division: '', client_id: '', status: 'tender',
  site_name: '', address: '', city: '', state: '', pincode: '',
  site_lat: '', site_lng: '',
  mobilization_date: '', start_date: '', start_time: '',
  expected_end_date: '', actual_end_date: '',
  mob_attachment_url: '', comm_attachment_url: '',
  nature_of_job: '', contract_value: '', billing_cycle: '', mobilization_advance: '',
  retention_pct: '', gst_rate: '18', payment_terms: '',
  hsd_supplied_by: 'company', hsd_consumption_norm: '', hsd_rate_per_liter: '',
  hsd_excess_bill_rate: '', hsd_shortage_credit: '',
  shift_start_time: '', shift_end_time: '', shift_grace_mins: '30', no_of_shifts: '1',
  our_pm_name: '', our_pm_phone: '', our_pm_email: '',
  our_supervisor_name: '', our_supervisor_phone: '',
  our_pnm_name: '', our_pnm_phone: '',
  client_pm_name: '', client_pm_phone: '', client_pm_email: '',
  client_pnm_name: '', client_pnm_phone: '',
  client_accounts_name: '', client_accounts_phone: '',
  notes: '',
}

function AddEditModal({ project, clients, onClose, onSaved }) {
  const { userProfile } = useAuth()
  const { isAdvanced } = useDisplayMode()
  const companyId = userProfile?.company_id
  const isEdit = !!project

  const [form, setForm] = useState(() => isEdit
    ? {
        ...INIT_FORM, ...project,
        no_of_shifts:     String(project.no_of_shifts || 1),
        client_id:        project.client_id        || '',
        mobilization_date: project.mobilization_date || '',
        start_date:        project.start_date        || '',
        expected_end_date: project.expected_end_date || '',
        actual_end_date:   project.actual_end_date   || '',
        site_lat:  project.site_lat  || '',
        site_lng:  project.site_lng  || '',
        our_pm_name:  project.our_pm_name  || '',
        our_pm_phone: project.our_pm_phone || '',
        our_pm_email: project.our_pm_email || '',
      }
    : { ...INIT_FORM }
  )

  const [rateItems, setRateItems]   = useState([])
  const [ratesLoaded, setRatesLoaded] = useState(false)
  const [saving, setSaving]         = useState(false)
  // Pending file uploads for timeline attachments
  const [mobFile,  setMobFile]  = useState(null)
  const [commFile, setCommFile] = useState(null)

  // Dynamic site supervisors list
  const mkContact = () => ({ _k: Math.random().toString(36).slice(2), name: '', phone: '' })
  const initList = (jsonArr, legacyName, legacyPhone) => {
    if (jsonArr && jsonArr.length > 0)
      return jsonArr.map(c => ({ ...c, _k: Math.random().toString(36).slice(2) }))
    if (legacyName) return [{ _k: '0', name: legacyName, phone: legacyPhone || '' }]
    return []
  }
  const [supervisors, setSupervisors] = useState(() =>
    initList(project?.our_supervisors, project?.our_supervisor_name, project?.our_supervisor_phone)
  )
  const [pnmContacts, setPnmContacts] = useState(() =>
    initList(project?.our_pnm_contacts, project?.our_pnm_name, project?.our_pnm_phone)
  )
  const [managers, setManagers] = useState(() =>
    initList(project?.our_managers, null, null)
  )

  // Optional client contacts
  const [showClientPnM, setShowClientPnM]             = useState(!!project?.client_pnm_name)
  const [showClientAccounts, setShowClientAccounts]   = useState(!!project?.client_accounts_name)

  // Auto project code for new projects
  const { data: nextCode } = useQuery({
    queryKey: ['next_project_code', companyId, new Date().getFullYear()],
    queryFn: async () => {
      const year = new Date().getFullYear()
      const { data } = await supabase
        .from('projects')
        .select('project_code')
        .eq('company_id', companyId)
        .ilike('project_code', `PRJ-${year}-%`)
        .order('project_code', { ascending: false })
        .limit(1)
      if (!data || data.length === 0) return `PRJ-${year}-001`
      const last  = data[0]?.project_code || ''
      const parts = last.split('-')
      const num   = parseInt(parts[2]) || 0
      return `PRJ-${year}-${String(num + 1).padStart(3, '0')}`
    },
    enabled: !isEdit && !!companyId,
  })

  useEffect(() => {
    if (nextCode && !isEdit && !form.project_code) {
      setForm(f => ({ ...f, project_code: nextCode }))
    }
  }, [nextCode])

  // Auto-set mobilization_date when status changes to mobilization
  useEffect(() => {
    if (form.status === 'mobilization' && !form.mobilization_date) {
      setForm(f => ({ ...f, mobilization_date: new Date().toISOString().split('T')[0] }))
    }
  }, [form.status])

  // Load existing rate items when editing
  // TanStack Query v5 removed onSuccess — use data + useEffect instead
  const { data: _fetchedRateItems } = useQuery({
    queryKey: ['rate_items', project?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_rate_items')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order')
      return data || []
    },
    enabled: !!project?.id,
  })

  useEffect(() => {
    if (_fetchedRateItems && !ratesLoaded) {
      setRateItems(_fetchedRateItems.map(r => ({
        ...r,
        _k:                    r.id,
        billing_basis:          r.billing_basis          || 'daily',
        max_hours_per_day:      r.max_hours_per_day      || '8',
        max_hours_per_month:    r.max_hours_per_month    || '200',
        working_days_per_month: r.working_days_per_month || '26',
        ot_percentage:          r.ot_percentage          || '125',
        short_term_fixed_hours: r.short_term_fixed_hours || '6',
        rate_inclusive_hsd:     !!r.rate_inclusive_hsd,
        rate_inclusive_gst:     !!r.rate_inclusive_gst,
        allowance_per_day:      r.allowance_per_day      || '',
      })))
      setRatesLoaded(true)
    }
  }, [_fetchedRateItems, ratesLoaded])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.project_name.trim()) { toast.error('Project name is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id:    userProfile.company_id,
        project_name:  form.project_name.trim(),
        project_code:  form.project_code.trim() || null,
        division:      form.division  || null,
        client_id:     form.client_id || null,
        status:        form.status,
        site_name:     form.site_name || null,
        address:       form.address   || null,
        city:          form.city      || null,
        state:         form.state     || null,
        pincode:       form.pincode   || null,
        site_lat:      form.site_lat  ? Number(form.site_lat)  : null,
        site_lng:      form.site_lng  ? Number(form.site_lng)  : null,
        mobilization_date: form.mobilization_date || null,
        start_date:        form.start_date        || null,
        expected_end_date: form.expected_end_date || null,
        actual_end_date:   form.actual_end_date   || null,
        nature_of_job:     form.nature_of_job     || null,
        contract_value:    form.contract_value    ? Number(form.contract_value)    : null,
        billing_cycle:     form.billing_cycle     || null,
        mobilization_advance: form.mobilization_advance ? Number(form.mobilization_advance) : null,
        retention_pct:     form.retention_pct     ? Number(form.retention_pct)     : null,
        gst_rate:          form.gst_rate          ? Number(form.gst_rate)          : 18,
        payment_terms:     form.payment_terms     || null,
        hsd_supplied_by:       form.hsd_supplied_by,
        hsd_consumption_norm:  form.hsd_consumption_norm  ? Number(form.hsd_consumption_norm)  : null,
        hsd_rate_per_liter:    form.hsd_rate_per_liter    ? Number(form.hsd_rate_per_liter)    : null,
        hsd_excess_bill_rate:  form.hsd_excess_bill_rate  ? Number(form.hsd_excess_bill_rate)  : null,
        hsd_shortage_credit:   form.hsd_shortage_credit   ? Number(form.hsd_shortage_credit)   : null,
        our_pm_name:           form.our_pm_name           || null,
        our_pm_phone:          form.our_pm_phone          || null,
        our_pm_email:          form.our_pm_email          || null,
        our_supervisors:  supervisors.filter(s => s.name.trim()).map(({name, phone}) => ({name, phone})),
        our_pnm_contacts: pnmContacts.filter(p => p.name.trim()).map(({name, phone}) => ({name, phone})),
        our_managers:     managers.filter(m => m.name.trim()).map(({name, phone}) => ({name, phone})),
        // keep legacy columns in sync with first entry for backward compat
        our_supervisor_name:   supervisors[0]?.name  || null,
        our_supervisor_phone:  supervisors[0]?.phone || null,
        our_pnm_name:          pnmContacts[0]?.name  || null,
        our_pnm_phone:         pnmContacts[0]?.phone || null,
        client_pm_name:        form.client_pm_name        || null,
        client_pm_phone:       form.client_pm_phone       || null,
        client_pm_email:       form.client_pm_email       || null,
        client_pnm_name:       form.client_pnm_name       || null,
        client_pnm_phone:      form.client_pnm_phone      || null,
        client_accounts_name:  form.client_accounts_name  || null,
        client_accounts_phone: form.client_accounts_phone || null,
        notes:       form.notes || null,
        shift_start_time: form.shift_start_time || null,
        shift_end_time:   form.shift_end_time   || null,
        shift_grace_mins: form.shift_grace_mins ? Number(form.shift_grace_mins) : 30,
        no_of_shifts:     form.no_of_shifts ? Number(form.no_of_shifts) : 1,
        start_time:          form.start_time          || null,
        mob_attachment_url:  form.mob_attachment_url  || null,
        comm_attachment_url: form.comm_attachment_url || null,
        updated_at:  new Date().toISOString(),
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

      // ── Upload timeline attachments (if new files selected) ────────────────
      const attachUpdates = {}
      if (mobFile) {
        const ext = mobFile.name.split('.').pop()
        const path = `${companyId}/${projectId}/mob_attachment.${ext}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET).upload(path, mobFile, { cacheControl: '3600', upsert: true })
        if (!upErr) attachUpdates.mob_attachment_url = path
        else toast.error('Mobilization file upload failed')
      }
      if (commFile) {
        const ext = commFile.name.split('.').pop()
        const path = `${companyId}/${projectId}/comm_attachment.${ext}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET).upload(path, commFile, { cacheControl: '3600', upsert: true })
        if (!upErr) attachUpdates.comm_attachment_url = path
        else toast.error('Commencement file upload failed')
      }
      if (Object.keys(attachUpdates).length > 0) {
        await supabase.from('projects').update(attachUpdates).eq('id', projectId)
      }

      // Save rate items — replace all
      await supabase.from('project_rate_items').delete().eq('project_id', projectId)
      const validItems = rateItems.filter(r => r.item_name?.trim())
      if (validItems.length > 0) {
        const rows = validItems.map((r, idx) => ({
          company_id:     userProfile.company_id,
          project_id:     projectId,
          item_name:      r.item_name,
          unit:           r.unit           || null,
          rate:           r.rate           ? Number(r.rate)           : null,
          rate_per_hour:  r.rate_per_hour  ? Number(r.rate_per_hour)  : null,
          rate_per_day:   r.rate_per_day   ? Number(r.rate_per_day)   : null,
          rate_per_month: r.rate_per_month ? Number(r.rate_per_month) : null,
          min_quantity:   r.min_quantity   ? Number(r.min_quantity)   : null,
          overtime_rate:  r.overtime_rate  ? Number(r.overtime_rate)  : null,
          idle_rate:      r.idle_rate      ? Number(r.idle_rate)      : null,
          milestone_date: r.milestone_date || null,
          billing_basis:  r.billing_basis  || 'daily',
          max_hours_per_day:       r.max_hours_per_day      ? Number(r.max_hours_per_day)      : null,
          max_hours_per_month:     r.max_hours_per_month    ? Number(r.max_hours_per_month)    : null,
          working_days_per_month:  r.working_days_per_month ? Number(r.working_days_per_month) : 26,
          ot_percentage:           r.ot_percentage          ? Number(r.ot_percentage)          : null,
          is_short_term:           r.billing_basis === 'short_term_hourly',
          short_term_fixed_hours:  r.short_term_fixed_hours ? Number(r.short_term_fixed_hours) : null,
          rate_inclusive_hsd:      !!r.rate_inclusive_hsd,
          rate_inclusive_gst:      !!r.rate_inclusive_gst,
          allowance_per_day:       r.allowance_per_day      ? Number(r.allowance_per_day)      : null,
          sort_order: idx,
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

      {/* ── 1. Project Identity ── */}
      <div className="space-y-3">
        <Sec icon={FolderOpen} label="Project Identity" />
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-primary-400 shrink-0">
            {form.project_code || '—'}
          </span>
          <p className="text-xs text-slate-500">Auto-assigned · sequential per year</p>
        </div>
        <div className={half}>
          <F label="Project Name" required>
            <input className={inp()} value={form.project_name}
              onChange={e=>set('project_name',e.target.value)}
              placeholder="e.g. NH-45 Road Widening"/>
          </F>
          <F label="Status">
            <select className={sel()} value={form.status} onChange={e=>set('status',e.target.value)}>
              {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </F>
        </div>
      </div>

      {/* ── 2. Client & Division ── */}
      <div className="space-y-3">
        <Sec icon={Building2} label="Client & Division" />
        <F label="Client">
          <select className={sel()} value={form.client_id} onChange={e=>set('client_id',e.target.value)}>
            <option value="">Select client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>
            ))}
          </select>
        </F>
        <F label="Client Division / Department"
          hint="Client's department or division managing this project">
          <input className={inp()} value={form.division}
            onChange={e=>set('division',e.target.value)}
            placeholder="e.g. Projects Dept., Infrastructure Division"/>
        </F>
      </div>

      {/* ── 3. Site & Location ── */}
      <div className="space-y-3">
        <Sec icon={MapPin} label="Site & Location" />
        <div className={half}>
          <F label="Site Name">
            <input className={inp()} value={form.site_name}
              onChange={e=>set('site_name',e.target.value)}
              placeholder="Name of project site"/>
          </F>
          <F label="City">
            <input className={inp()} value={form.city}
              onChange={e=>set('city',e.target.value)}
              placeholder="City"/>
          </F>
        </div>
        <div className={half}>
          <F label="State">
            <select className={sel()} value={form.state} onChange={e=>set('state',e.target.value)}>
              <option value="">Select state…</option>
              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </F>
          <F label="Pincode">
            <input className={inp()} value={form.pincode}
              onChange={e=>set('pincode',e.target.value)}
              maxLength={6} placeholder="600001"/>
          </F>
        </div>
        {isAdvanced && (
          <F label="Site Address">
            <textarea className={inp('resize-none')} rows={2} value={form.address}
              onChange={e=>set('address',e.target.value)}
              placeholder="Full site address"/>
          </F>
        )}
        <F label="GPS Coordinates" hint="Visit the site and tap below to pin the exact location">
          <LocationPicker
            lat={form.site_lat}
            lng={form.site_lng}
            onCapture={(lat, lng) => { set('site_lat', lat); set('site_lng', lng) }}
          />
        </F>
      </div>

      {/* ── 4. Our Team on Site ── */}
      <div className="space-y-3">
        <Sec icon={Users} label="Our Team on Site" />

        {/* Project Manager — always */}
        <div>
          <p className="text-xs font-medium text-primary-400 mb-2">Project Manager</p>
          <div className={third}>
            <input className={inp('text-xs')} value={form.our_pm_name}
              onChange={e=>set('our_pm_name',e.target.value)} placeholder="Name"/>
            <input className={inp('text-xs')} value={form.our_pm_phone}
              onChange={e=>set('our_pm_phone',e.target.value)} placeholder="Mobile"/>
            <input className={inp('text-xs')} value={form.our_pm_email}
              onChange={e=>set('our_pm_email',e.target.value)} placeholder="Email"/>
          </div>
        </div>

        {/* Site Supervisors — dynamic list */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Site Supervisor(s) <span className="text-slate-600">— Level 1 alert</span></p>
          {supervisors.map((s, i) => (
            <div key={s._k} className="bg-dark-700/50 rounded-lg p-2 space-y-1.5">
              <div className="flex gap-2 items-center">
                <input className={inp('text-xs flex-1')} value={s.name}
                  onChange={e => setSupervisors(list => list.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                  placeholder="Name"/>
                <input className={inp('text-xs w-32 shrink-0')} value={s.phone || ''}
                  onChange={e => setSupervisors(list => list.map((x,j)=>j===i?{...x,phone:e.target.value}:x))}
                  placeholder="Mobile"/>
                <button type="button"
                  onClick={() => setSupervisors(list => list.filter((_,j)=>j!==i))}
                  className="text-slate-500 hover:text-red-400 shrink-0 p-1">
                  <Trash2 className="w-3.5 h-3.5"/>
                </button>
              </div>
              <input className={inp('text-xs w-full')} value={s.email || ''}
                onChange={e => setSupervisors(list => list.map((x,j)=>j===i?{...x,email:e.target.value}:x))}
                placeholder="Email (for breakdown alerts)" type="email"/>
            </div>
          ))}
          <button type="button"
            onClick={() => setSupervisors(list => [...list, mkContact()])}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary-400 transition-colors">
            <UserPlus className="w-3.5 h-3.5"/> Add Site Supervisor
          </button>
        </div>

        {/* P&M In-charges — dynamic list */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">P&M In-charge(s) <span className="text-slate-600">— Level 2 alert</span></p>
          {pnmContacts.map((p, i) => (
            <div key={p._k} className="bg-dark-700/50 rounded-lg p-2 space-y-1.5">
              <div className="flex gap-2 items-center">
                <input className={inp('text-xs flex-1')} value={p.name}
                  onChange={e => setPnmContacts(list => list.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                  placeholder="Name"/>
                <input className={inp('text-xs w-32 shrink-0')} value={p.phone || ''}
                  onChange={e => setPnmContacts(list => list.map((x,j)=>j===i?{...x,phone:e.target.value}:x))}
                  placeholder="Mobile"/>
                <button type="button"
                  onClick={() => setPnmContacts(list => list.filter((_,j)=>j!==i))}
                  className="text-slate-500 hover:text-red-400 shrink-0 p-1">
                  <Trash2 className="w-3.5 h-3.5"/>
                </button>
              </div>
              <input className={inp('text-xs w-full')} value={p.email || ''}
                onChange={e => setPnmContacts(list => list.map((x,j)=>j===i?{...x,email:e.target.value}:x))}
                placeholder="Email (for breakdown alerts)" type="email"/>
            </div>
          ))}
          <button type="button"
            onClick={() => setPnmContacts(list => [...list, mkContact()])}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary-400 transition-colors">
            <UserPlus className="w-3.5 h-3.5"/> Add P&M In-charge
          </button>
        </div>

        {/* Managers — escalation level 3 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Manager(s) <span className="text-slate-600">— Level 3 alert</span></p>
          {managers.map((m, i) => (
            <div key={m._k} className="bg-dark-700/50 rounded-lg p-2 space-y-1.5">
              <div className="flex gap-2 items-center">
                <input className={inp('text-xs flex-1')} value={m.name}
                  onChange={e => setManagers(list => list.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                  placeholder="Name"/>
                <input className={inp('text-xs w-32 shrink-0')} value={m.phone || ''}
                  onChange={e => setManagers(list => list.map((x,j)=>j===i?{...x,phone:e.target.value}:x))}
                  placeholder="Mobile"/>
                <button type="button"
                  onClick={() => setManagers(list => list.filter((_,j)=>j!==i))}
                  className="text-slate-500 hover:text-red-400 shrink-0 p-1">
                  <Trash2 className="w-3.5 h-3.5"/>
                </button>
              </div>
              <input className={inp('text-xs w-full')} value={m.email || ''}
                onChange={e => setManagers(list => list.map((x,j)=>j===i?{...x,email:e.target.value}:x))}
                placeholder="Email (for breakdown alerts)" type="email"/>
            </div>
          ))}
          <button type="button"
            onClick={() => setManagers(list => [...list, mkContact()])}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary-400 transition-colors">
            <UserPlus className="w-3.5 h-3.5"/> Add Manager
          </button>
        </div>
      </div>

      {/* ── 5. Timeline ── */}
      <div className="space-y-3">
        <Sec icon={Calendar} label="Timeline" />
        <div className={half}>
          {/* Mobilization Date + attachment */}
          <F label="Mobilization Date"
            hint={form.status === 'mobilization' && !project?.mobilization_date
              ? 'Auto-set today when status changed to Mobilization'
              : undefined}>
            <div className="flex items-center gap-2">
              <input className={inp('flex-1')} type="date" value={form.mobilization_date}
                onChange={e=>set('mobilization_date',e.target.value)}/>
              <input type="file" id="mob-file-input" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => { if (e.target.files[0]) setMobFile(e.target.files[0]) }}/>
              <label htmlFor="mob-file-input" title="Attach mobilization document"
                className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border cursor-pointer text-xs font-medium transition-colors
                  ${mobFile || form.mob_attachment_url
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-dark-600 bg-dark-700 text-slate-400 hover:text-slate-200 hover:border-primary-500'}`}>
                <Paperclip className="w-3.5 h-3.5"/>
                {mobFile ? mobFile.name.split('.').pop().toUpperCase() : (form.mob_attachment_url ? '✓' : 'Attach')}
              </label>
            </div>
          </F>

          {/* Commencement Date + time + attachment */}
          <F label="Commencement Date"
            hint="Auto-set from Daily Operations when first equipment shift is recorded">
            <div className="flex items-center gap-2">
              <input className={inp('flex-1')} type="date" value={form.start_date}
                onChange={e=>set('start_date',e.target.value)}/>
              <input className={inp('w-28')} type="time" value={form.start_time}
                title="Commencement hour"
                onChange={e=>set('start_time',e.target.value)}/>
              <input type="file" id="comm-file-input" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => { if (e.target.files[0]) setCommFile(e.target.files[0]) }}/>
              <label htmlFor="comm-file-input" title="Attach commencement document"
                className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border cursor-pointer text-xs font-medium transition-colors
                  ${commFile || form.comm_attachment_url
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-dark-600 bg-dark-700 text-slate-400 hover:text-slate-200 hover:border-primary-500'}`}>
                <Paperclip className="w-3.5 h-3.5"/>
                {commFile ? commFile.name.split('.').pop().toUpperCase() : (form.comm_attachment_url ? '✓' : 'Attach')}
              </label>
            </div>
          </F>
        </div>
        <div className={half}>
          <F label="Expected Completion">
            <input className={inp()} type="date" value={form.expected_end_date}
              onChange={e=>set('expected_end_date',e.target.value)}/>
          </F>
          <F label="Actual Completion">
            <input className={inp()} type="date" value={form.actual_end_date}
              onChange={e=>set('actual_end_date',e.target.value)}/>
          </F>
        </div>
      </div>

      {/* ── 6. Contract Terms ── */}
      <div className="space-y-3">
        <Sec icon={FileText} label="Contract Terms" />
        <div className={half}>
          <F label="Nature of Job" required>
            <select className={sel()} value={form.nature_of_job}
              onChange={e=>{ set('nature_of_job',e.target.value); setRateItems([emptyItem()]) }}>
              <option value="">Select…</option>
              <option value="hire">Hire</option>
              <option value="rate_contract">Rate Contract</option>
              <option value="lump_sum">Lump Sum</option>
              <option value="amc">AMC</option>
            </select>
          </F>
          <F label="Contract Value (₹)">
            <input className={inp()} value={form.contract_value}
              onChange={e=>set('contract_value',e.target.value)} type="number" placeholder="0"/>
          </F>
        </div>
        {isAdvanced && <>
          <div className={half}>
            <F label="Billing Cycle">
              <select className={sel()} value={form.billing_cycle} onChange={e=>set('billing_cycle',e.target.value)}>
                <option value="">Select…</option>
                {['Weekly','Fortnightly','Monthly','Milestone-based','On completion'].map(v=>(
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </F>
            <F label="Payment Terms">
              <select className={sel()} value={form.payment_terms} onChange={e=>set('payment_terms',e.target.value)}>
                <option value="">Select…</option>
                {['15 days','30 days','45 days','60 days','90 days'].map(v=>(
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </F>
          </div>
          <div className={third}>
            <F label="Mob. Advance (₹)">
              <input className={inp()} value={form.mobilization_advance}
                onChange={e=>set('mobilization_advance',e.target.value)} type="number" placeholder="0"/>
            </F>
            <F label="Retention %">
              <input className={inp()} value={form.retention_pct}
                onChange={e=>set('retention_pct',e.target.value)} type="number" placeholder="5"/>
            </F>
            <F label="GST Rate %">
              <select className={sel()} value={form.gst_rate} onChange={e=>set('gst_rate',e.target.value)}>
                {['0','5','12','18','28'].map(v=><option key={v} value={v}>{v}%</option>)}
              </select>
            </F>
          </div>
        </>}
      </div>

      {/* ── 7. Rate Card ── */}
      <div className="space-y-3">
        <Sec icon={IndianRupee} label="Rate Card" />
        <RateCard job={form.nature_of_job} items={rateItems} onChange={setRateItems}/>
      </div>

      {/* ── 8. HSD Terms ── */}
      <div className="space-y-3">
        <Sec icon={Droplet} label="HSD (Diesel) Terms" />
        <div className="flex gap-3">
          {['company','client'].map(v => (
            <button key={v} type="button"
              onClick={() => set('hsd_supplied_by', v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                form.hsd_supplied_by===v
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-slate-200'
              }`}>
              {v === 'company' ? '🏢 Supplied by Us' : '🏗️ Supplied by Client'}
            </button>
          ))}
        </div>

        {form.hsd_supplied_by === 'client' && (
          <div className="space-y-3 pt-1">
            {isAdvanced && (
              <F label="Consumption Norm (L/hr)" hint="Standard norm agreed with client">
                <input className={inp('max-w-xs')} value={form.hsd_consumption_norm}
                  onChange={e=>set('hsd_consumption_norm',e.target.value)} type="number" placeholder="18"/>
              </F>
            )}
            <F label="HSD Rate (₹/L)">
              <div className="flex gap-2">
                <input className={inp('flex-1')} value={form.hsd_rate_per_liter}
                  onChange={e=>set('hsd_rate_per_liter',e.target.value)} type="number" placeholder="95"/>
                <button type="button"
                  onClick={() => {
                    if (!form.state) { toast.error('Select a state first'); return }
                    window.open('https://iocl.com/PetrolDieselPrices', '_blank')
                    toast(`Check diesel price for ${form.state} on IOCL site — then enter it above`, { icon: '⛽' })
                  }}
                  className="flex items-center gap-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-xs text-slate-400 hover:text-primary-400 hover:border-primary-500 transition-colors shrink-0">
                  <RefreshCw className="w-3 h-3"/> Check Rate
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Opens IOCL retail prices page for {form.state || 'selected state'}
              </p>
            </F>
            {isAdvanced && (
              <div className={half}>
                <F label="Excess Billing (₹/L)" hint="Charged for consumption above norm">
                  <input className={inp()} value={form.hsd_excess_bill_rate}
                    onChange={e=>set('hsd_excess_bill_rate',e.target.value)} type="number" placeholder="0"/>
                </F>
                <F label="Shortage Credit (₹/L)" hint="Credit for consumption below norm">
                  <input className={inp()} value={form.hsd_shortage_credit}
                    onChange={e=>set('hsd_shortage_credit',e.target.value)} type="number" placeholder="0"/>
                </F>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 9. Client Team (Advanced) ── */}
      {isAdvanced && (
        <div className="space-y-3">
          <Sec icon={Users} label="Client Team" />

          {/* Client PM — always shown in Advanced */}
          <div>
            <p className="text-xs font-medium text-primary-400 mb-2">Project Manager (Client)</p>
            <div className={third}>
              <input className={inp('text-xs')} value={form.client_pm_name}
                onChange={e=>set('client_pm_name',e.target.value)} placeholder="Name"/>
              <input className={inp('text-xs')} value={form.client_pm_phone}
                onChange={e=>set('client_pm_phone',e.target.value)} placeholder="Mobile"/>
              <input className={inp('text-xs')} value={form.client_pm_email}
                onChange={e=>set('client_pm_email',e.target.value)} placeholder="Email"/>
            </div>
          </div>

          {/* Client P&M — optional */}
          {showClientPnM ? (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">P&M Manager (Client)</p>
              <div className={half}>
                <input className={inp('text-xs')} value={form.client_pnm_name}
                  onChange={e=>set('client_pnm_name',e.target.value)} placeholder="Name"/>
                <input className={inp('text-xs')} value={form.client_pnm_phone}
                  onChange={e=>set('client_pnm_phone',e.target.value)} placeholder="Mobile"/>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowClientPnM(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary-400 transition-colors">
              <UserPlus className="w-3.5 h-3.5"/> Add Client P&M Manager
            </button>
          )}

          {/* Client Accounts — optional */}
          {showClientAccounts ? (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Accounts Manager (Client)</p>
              <div className={half}>
                <input className={inp('text-xs')} value={form.client_accounts_name}
                  onChange={e=>set('client_accounts_name',e.target.value)} placeholder="Name"/>
                <input className={inp('text-xs')} value={form.client_accounts_phone}
                  onChange={e=>set('client_accounts_phone',e.target.value)} placeholder="Mobile"/>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowClientAccounts(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary-400 transition-colors">
              <UserPlus className="w-3.5 h-3.5"/> Add Client Accounts Manager
            </button>
          )}
        </div>
      )}

      {/* ── 9. Operator Shift Window ── */}
      <div className="space-y-3">
        <Sec icon={Clock} label="Operator Shift Window" />
        <p className="text-xs text-slate-500">
          Sets the allowed start/end window for operators on this project.
          The Operator Portal will block shift start outside this window (±grace period).
          Leave blank to allow shifts at any time.
        </p>

        {/* Number of shifts — controls operator slot count per equipment */}
        <F label="Number of Shifts" hint="Sets how many operators can be assigned per equipment on this project.">
          <div className="flex gap-2">
            {[
              { value: '1', label: '1 Shift', sub: 'Single shift per day' },
              { value: '2', label: '2 Shifts', sub: 'Day + Night shifts' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set('no_of_shifts', opt.value)}
                className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors
                  ${form.no_of_shifts === opt.value
                    ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                    : 'border-dark-500 bg-dark-700 text-slate-400 hover:border-dark-400'}`}>
                <span>{opt.label}</span>
                <span className="text-[10px] font-normal opacity-70">{opt.sub}</span>
              </button>
            ))}
          </div>
        </F>

        <div className={half}>
          <F label="Shift Start Time">
            <input type="time" className={inp()} value={form.shift_start_time}
              onChange={e => set('shift_start_time', e.target.value)} />
          </F>
          <F label="Shift End Time">
            <input type="time" className={inp()} value={form.shift_end_time}
              onChange={e => set('shift_end_time', e.target.value)} />
          </F>
        </div>
        <F label="Grace Period (minutes)"
          hint="Operators can start up to this many minutes before/after the window. Default: 30 mins.">
          <input type="number" className={inp()} value={form.shift_grace_mins}
            onChange={e => set('shift_grace_mins', e.target.value)}
            placeholder="30" min="0" max="120" step="5" />
        </F>
        {form.shift_start_time && form.shift_end_time && (
          <div className="flex items-center gap-2 bg-primary-900/20 border border-primary-700/30 rounded-lg px-3 py-2">
            <span className="text-primary-400 text-sm">🕐</span>
            <p className="text-xs text-primary-300">
              Operators can start between{' '}
              <strong>{form.shift_start_time}</strong> and <strong>{form.shift_end_time}</strong>
              {form.shift_grace_mins ? ` (±${form.shift_grace_mins} min grace)` : ''}
              {' · '}<strong>{form.no_of_shifts || 1} shift{form.no_of_shifts === '2' ? 's' : ''}</strong> per day
            </p>
          </div>
        )}
      </div>

      {/* ── 10. Notes (Advanced) ── */}
      {isAdvanced && (
        <div className="space-y-3">
          <Sec icon={FileText} label="Notes / Remarks" />
          <textarea className={inp('resize-none')} rows={3} value={form.notes}
            onChange={e=>set('notes',e.target.value)}
            placeholder="Special terms, scope notes, or project remarks…"/>
        </div>
      )}
    </Modal>
  )
}

// ── Project Detail ─────────────────────────────────────────────────────────────

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

// ── Document Types ─────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { value: 'po',          label: 'Purchase Order',       icon: ShoppingBag,  cls: 'text-blue-400 bg-blue-500/10' },
  { value: 'work_order',  label: 'Work Order / LOA',     icon: Briefcase,    cls: 'text-emerald-400 bg-emerald-500/10' },
  { value: 'contract',    label: 'Contract / Agreement',  icon: PenLine,      cls: 'text-purple-400 bg-purple-500/10' },
  { value: 'drawing',     label: 'Drawing / BOQ',         icon: LayoutGrid,   cls: 'text-amber-400 bg-amber-500/10' },
]
const docTypeMeta = Object.fromEntries(DOC_TYPES.map(d => [d.value, d]))

const BUCKET = 'project-documents'

function fmtBytes(b) {
  if (!b) return ''
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

// ── Upload Document Modal ──────────────────────────────────────────────────────
function UploadDocModal({ projectId, companyId, onClose, onUploaded }) {
  const [form, setForm] = useState({
    doc_type: 'po', doc_name: '', doc_number: '', doc_date: '', amount: '', notes: '',
  })
  const [file, setFile]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const fi  = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`

  async function handleSubmit() {
    if (!form.doc_name.trim()) { setError('Document name is required.'); return }
    if (!file)                  { setError('Please attach a file.');      return }
    setError('')
    setLoading(true)
    try {
      // 1. Upload file to Supabase Storage
      const ext      = file.name.split('.').pop()
      const uuid     = crypto.randomUUID()
      const filePath = `${companyId}/${projectId}/${uuid}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { cacheControl: '3600', upsert: false })
      if (uploadErr) throw uploadErr

      // 2. Insert metadata row
      const { error: dbErr } = await supabase.from('project_documents').insert({
        company_id: companyId,
        project_id: projectId,
        doc_type:   form.doc_type,
        doc_name:   form.doc_name.trim(),
        doc_number: form.doc_number.trim() || null,
        doc_date:   form.doc_date  || null,
        amount:     form.amount    ? Number(form.amount)  : null,
        notes:      form.notes.trim() || null,
        file_path:  filePath,
        file_name:  file.name,
        file_size:  file.size,
        file_type:  file.type,
      })
      if (dbErr) throw dbErr

      toast.success('Document uploaded')
      onUploaded()
      onClose()
    } catch (e) {
      setError(e.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const selectedType = docTypeMeta[form.doc_type]

  return (
    <Modal
      title="Upload Document"
      subtitle="Attach a client document to this project"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-ghost flex-1" disabled={loading}>Cancel</button>
        <button onClick={handleSubmit} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={loading}>
          {loading ? 'Uploading…' : <><Upload className="w-3.5 h-3.5"/> Upload</>}
        </button>
      </>}
    >
      {/* Doc type selector */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Document Type</label>
        <div className="grid grid-cols-2 gap-2">
          {DOC_TYPES.map(dt => {
            const Icon = dt.icon
            const active = form.doc_type === dt.value
            return (
              <button key={dt.value} type="button"
                onClick={() => set('doc_type', dt.value)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  active
                    ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                    : 'border-dark-600 bg-dark-700/50 text-slate-400 hover:border-dark-500'
                }`}
              >
                <span className={`p-1.5 rounded-md ${active ? 'bg-primary-500/15' : dt.cls}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs leading-tight">{dt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Document Name <span className="text-red-400">*</span>
          </label>
          <input className={fi()} value={form.doc_name}
            onChange={e => set('doc_name', e.target.value)}
            placeholder={`e.g. ${selectedType?.label} from client`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Document Number</label>
            <input className={fi()} value={form.doc_number}
              onChange={e => set('doc_number', e.target.value)}
              placeholder="PO-2025-001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Document Date</label>
            <input type="date" className={fi()} value={form.doc_date}
              onChange={e => set('doc_date', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Amount (₹) — optional</label>
          <input type="number" className={fi()} value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="PO value or contract amount" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Notes — optional</label>
          <textarea className={fi('resize-none')} rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any remarks…" />
        </div>
      </div>

      {/* File picker */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">
          Attach File <span className="text-red-400">*</span>
        </label>
        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
          file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-dark-600 hover:border-primary-500/50 bg-dark-700/30'
        }`}>
          <input type="file" className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg,.zip"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <>
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <p className="text-sm text-emerald-300 font-medium text-center">{file.name}</p>
              <p className="text-xs text-slate-500">{fmtBytes(file.size)}</p>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-slate-500" />
              <p className="text-sm text-slate-400">Click to choose file</p>
              <p className="text-xs text-slate-600">PDF, Word, Excel, Images, DWG — max 50 MB</p>
            </>
          )}
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
    </Modal>
  )
}

// ── Edit Document Modal ────────────────────────────────────────────────────────
function EditDocModal({ doc, companyId, projectId, onClose, onSaved }) {
  const [form, setForm] = useState({
    doc_type:   doc.doc_type   || 'po',
    doc_name:   doc.doc_name   || '',
    doc_number: doc.doc_number || '',
    doc_date:   doc.doc_date   || '',
    amount:     doc.amount     ? String(doc.amount) : '',
    notes:      doc.notes      || '',
  })
  const [file, setFile]       = useState(null)   // new replacement file (optional)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const fi  = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`

  async function handleSave() {
    if (!form.doc_name.trim()) { setError('Document name is required.'); return }
    setError('')
    setLoading(true)
    try {
      let filePatch = {}

      if (file) {
        // Delete old file if present
        if (doc.file_path) {
          await supabase.storage.from(BUCKET).remove([doc.file_path])
        }
        // Upload new file
        const ext      = file.name.split('.').pop()
        const uuid     = crypto.randomUUID()
        const filePath = `${companyId}/${projectId}/${uuid}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, file, { cacheControl: '3600', upsert: false })
        if (uploadErr) throw uploadErr
        filePatch = { file_path: filePath, file_name: file.name, file_size: file.size, file_type: file.type }
      }

      const { error: dbErr } = await supabase
        .from('project_documents')
        .update({
          doc_type:   form.doc_type,
          doc_name:   form.doc_name.trim(),
          doc_number: form.doc_number.trim() || null,
          doc_date:   form.doc_date  || null,
          amount:     form.amount    ? Number(form.amount) : null,
          notes:      form.notes.trim() || null,
          ...filePatch,
        })
        .eq('id', doc.id)
      if (dbErr) throw dbErr

      toast.success('Document updated')
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  const selectedType = docTypeMeta[form.doc_type]

  return (
    <Modal
      title="Edit Document"
      subtitle={doc.doc_name}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-ghost flex-1" disabled={loading}>Cancel</button>
        <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={loading}>
          {loading ? 'Saving…' : <><Edit2 className="w-3.5 h-3.5"/> Save Changes</>}
        </button>
      </>}
    >
      {/* Doc type selector */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Document Type</label>
        <div className="grid grid-cols-2 gap-2">
          {DOC_TYPES.map(dt => {
            const Icon = dt.icon
            const active = form.doc_type === dt.value
            return (
              <button key={dt.value} type="button"
                onClick={() => set('doc_type', dt.value)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  active
                    ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                    : 'border-dark-600 bg-dark-700/50 text-slate-400 hover:border-dark-500'
                }`}
              >
                <span className={`p-1.5 rounded-md ${active ? 'bg-primary-500/15' : dt.cls}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs leading-tight">{dt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Document Name <span className="text-red-400">*</span>
          </label>
          <input className={fi()} value={form.doc_name}
            onChange={e => set('doc_name', e.target.value)}
            placeholder={`e.g. ${selectedType?.label} from client`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Document Number</label>
            <input className={fi()} value={form.doc_number}
              onChange={e => set('doc_number', e.target.value)}
              placeholder="PO-2025-001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Document Date</label>
            <input type="date" className={fi()} value={form.doc_date}
              onChange={e => set('doc_date', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Amount (₹) — optional</label>
          <input type="number" className={fi()} value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="PO value or contract amount" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Notes — optional</label>
          <textarea className={fi('resize-none')} rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any remarks…" />
        </div>
      </div>

      {/* Replace file (optional) */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">
          Replace File — optional
        </label>
        {doc.file_name && !file && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-dark-700/50 border border-dark-600">
            <File className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 truncate">{doc.file_name}</p>
              {doc.file_size && <p className="text-[11px] text-slate-500">{fmtBytes(doc.file_size)} — current file</p>}
            </div>
          </div>
        )}
        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors ${
          file ? 'border-amber-500/50 bg-amber-500/5' : 'border-dark-600 hover:border-primary-500/40 bg-dark-700/20'
        }`}>
          <input type="file" className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg,.zip"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-amber-400" />
              <p className="text-sm text-amber-300 font-medium text-center">{file.name}</p>
              <p className="text-xs text-slate-500">{fmtBytes(file.size)} — will replace existing</p>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 text-slate-600" />
              <p className="text-sm text-slate-500">Choose a new file to replace</p>
              <p className="text-xs text-slate-600">Leave blank to keep current file</p>
            </>
          )}
        </label>
        {file && (
          <button onClick={() => setFile(null)} className="mt-1.5 text-xs text-slate-500 hover:text-slate-300 w-full text-center">
            ✕ Cancel replacement — keep current file
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
    </Modal>
  )
}

// ── Documents Section (inside ProjectDetail) ───────────────────────────────────
function ProjectDocumentsSection({ project, companyId }) {
  const qc = useQueryClient()
  const [showUpload, setShowUpload] = useState(false)
  const [editingDoc, setEditingDoc] = useState(null)
  const [deleting,   setDeleting]   = useState(null)
  const [filter,     setFilter]     = useState('all')

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['project_documents', project.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
      return data || []
    },
    staleTime: 30_000,
  })

  const filtered = filter === 'all' ? docs : docs.filter(d => d.doc_type === filter)

  async function downloadDoc(doc) {
    if (!doc.file_path) { toast.error('No file attached'); return }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60)
    if (error) { toast.error('Could not generate download link'); return }
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = doc.file_name || 'document'
    a.click()
  }

  async function deleteDoc(doc) {
    if (!window.confirm(`Delete "${doc.doc_name}"? This cannot be undone.`)) return
    setDeleting(doc.id)
    try {
      if (doc.file_path) {
        await supabase.storage.from(BUCKET).remove([doc.file_path])
      }
      await supabase.from('project_documents').delete().eq('id', doc.id)
      qc.invalidateQueries({ queryKey: ['project_documents', project.id] })
      toast.success('Document deleted')
    } catch (e) {
      toast.error('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const counts = DOC_TYPES.reduce((acc, dt) => {
    acc[dt.value] = docs.filter(d => d.doc_type === dt.value).length
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 pb-2 border-b border-dark-700 flex-1">
          <FolderOpen className="w-4 h-4 text-primary-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Project Documents
          </span>
          {docs.length > 0 && (
            <span className="text-[11px] bg-primary-500/15 text-primary-400 px-2 py-0.5 rounded-full font-medium ml-1">
              {docs.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="ml-3 mb-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors shrink-0"
        >
          <Upload className="w-3.5 h-3.5" /> Upload
        </button>
      </div>

      {/* Filter chips */}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setFilter('all')}
            className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
              filter === 'all' ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({docs.length})
          </button>
          {DOC_TYPES.map(dt => counts[dt.value] > 0 && (
            <button key={dt.value}
              onClick={() => setFilter(dt.value)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                filter === dt.value ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {dt.label} ({counts[dt.value]})
            </button>
          ))}
        </div>
      )}

      {/* Financial summary — only when at least one doc has an amount */}
      {!isLoading && docs.some(d => d.amount) && (
        <div className="mb-4 rounded-xl bg-dark-700/30 border border-dark-700 p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">Financial Summary</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {DOC_TYPES.map(dt => {
              const typeDocs  = docs.filter(d => d.doc_type === dt.value && d.amount)
              const typeTotal = typeDocs.reduce((s, d) => s + Number(d.amount || 0), 0)
              if (!typeTotal) return null
              return (
                <div key={dt.value} className="flex-1 min-w-[110px]">
                  <p className="text-[10px] text-slate-500">{dt.label} ({typeDocs.length})</p>
                  <p className="text-xs font-semibold text-slate-200">
                    ₹{typeTotal.toLocaleString('en-IN')}
                  </p>
                </div>
              )
            })}
          </div>
          {/* Grand total row */}
          <div className="mt-2 pt-2 border-t border-dark-700/60 flex items-center justify-between">
            <p className="text-[10px] text-slate-500">
              Grand Total · {docs.filter(d => d.amount).length} document{docs.filter(d => d.amount).length !== 1 ? 's' : ''}
            </p>
            <p className="text-sm font-bold text-emerald-400">
              ₹{docs.reduce((s, d) => s + Number(d.amount || 0), 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      )}

      {isLoading && (
        <p className="text-xs text-slate-500 text-center py-4">Loading documents…</p>
      )}

      {!isLoading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-600">
          <FolderOpen className="w-8 h-8" />
          <p className="text-sm text-slate-500">No documents yet</p>
          <p className="text-xs">Upload POs, Work Orders, Contracts, or Drawings</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(doc => {
            const meta = docTypeMeta[doc.doc_type] || docTypeMeta.po
            const Icon = meta.icon
            return (
              <div key={doc.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/50 border border-dark-700 hover:border-dark-600 transition-colors"
              >
                {/* Type icon */}
                <div className={`p-2 rounded-lg shrink-0 ${meta.cls}`}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-100 truncate">{doc.doc_name}</p>
                    {doc.doc_number && (
                      <span className="text-[11px] text-primary-400 font-mono">{doc.doc_number}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.cls}`}>
                      {meta.label}
                    </span>
                    {doc.doc_date && (
                      <span className="text-[11px] text-slate-500">
                        {new Date(doc.doc_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                      </span>
                    )}
                    {doc.amount && (
                      <span className="text-[11px] text-emerald-400 font-medium">
                        ₹{Number(doc.amount).toLocaleString('en-IN')}
                      </span>
                    )}
                    {doc.file_name && (
                      <span className="text-[11px] text-slate-600 truncate max-w-[140px]">
                        {doc.file_name} {doc.file_size ? `(${fmtBytes(doc.file_size)})` : ''}
                      </span>
                    )}
                  </div>
                  {doc.notes && (
                    <p className="text-[11px] text-slate-500 mt-0.5 italic truncate">{doc.notes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {doc.file_path && (
                    <button
                      onClick={() => downloadDoc(doc)}
                      title="Download"
                      className="p-2 rounded-lg text-slate-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setEditingDoc(doc)}
                    title="Edit"
                    className="p-2 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteDoc(doc)}
                    disabled={deleting === doc.id}
                    title="Delete"
                    className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showUpload && (
        <UploadDocModal
          projectId={project.id}
          companyId={companyId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => qc.invalidateQueries({ queryKey: ['project_documents', project.id] })}
        />
      )}

      {editingDoc && (
        <EditDocModal
          doc={editingDoc}
          projectId={project.id}
          companyId={companyId}
          onClose={() => setEditingDoc(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['project_documents', project.id] })}
        />
      )}
    </div>
  )
}

// ── Project P&L Tab ────────────────────────────────────────────────────────────
function ProjectPLTab({ project, companyId, projectInvoices, projectPayments, deployments, equipment }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const defFrom  = project.start_date ? project.start_date.slice(0, 10) : `${new Date().getFullYear()}-01-01`
  const [from, setFrom] = useState(defFrom)
  const [to,   setTo]   = useState(todayStr)

  const fmtM = n => `₹${Math.round(n).toLocaleString('en-IN')}`

  // All equipment IDs ever on this project (current + historical deployments)
  const allEqIds = useMemo(() => {
    const ids = new Set([
      ...equipment.map(e => e.id),
      ...deployments.map(d => d.equipment?.id).filter(Boolean),
    ])
    return [...ids]
  }, [equipment, deployments])

  const eqEnabled = allEqIds.length > 0

  // Deployment period map: equipId → [{from, to}]
  // Used to exclude expenses that occurred after equipment was withdrawn from this project
  const deployPeriods = useMemo(() => {
    const map = {}
    // Currently-assigned equipment: deployed from project start to "today" (no withdrawn_date)
    equipment.forEach(e => {
      if (!map[e.id]) map[e.id] = []
      map[e.id].push({ from: project.start_date?.slice(0,10) || '2000-01-01', to: todayStr })
    })
    // Historical deployments: use deployed_date / withdrawn_date
    deployments.forEach(d => {
      const id = d.equipment?.id; if (!id) return
      if (!map[id]) map[id] = []
      map[id].push({
        from: d.deployed_date ? d.deployed_date.slice(0,10) : '2000-01-01',
        to:   d.withdrawn_date ? d.withdrawn_date.slice(0,10) : todayStr,
      })
    })
    return map
  }, [equipment, deployments, project.start_date, todayStr])

  // Returns true if the given date falls within any deployment period for that equipment on this project
  const wasOnProject = useCallback((equipId, date) => {
    if (!date) return true // no date = can't filter, include it
    const periods = deployPeriods[equipId]
    if (!periods) return false
    return periods.some(p => date >= p.from && date <= p.to)
  }, [deployPeriods])

  // 1. Fuel issued to project equipment
  const { data: fuelIssues = [], isLoading: fuelLoad } = useQuery({
    queryKey: ['proj_pl_fuel', project.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('fuel_issues')
        .select('id, issue_date, qty_liters, rate_per_litre, equipment_id')
        .in('equipment_id', allEqIds)
        .gte('issue_date', from).lte('issue_date', to)
      return data || []
    },
    enabled: eqEnabled,
  })

  // 2. Maintenance — closed job cards for project equipment
  const { data: jobCards = [], isLoading: jobLoad } = useQuery({
    queryKey: ['proj_pl_jobs', project.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('job_cards')
        .select('id, jc_type, total_cost, closed_at, equipment_id')
        .in('equipment_id', allEqIds)
        .eq('status', 'closed')
        .gte('closed_at', from).lte('closed_at', to)
      return data || []
    },
    enabled: eqEnabled,
  })

  // 3. Expenses tagged to project equipment only
  //    (field expenses, operator salaries, purchases entered against a specific machine)
  const { data: eqExp = [], isLoading: expLoad } = useQuery({
    queryKey: ['proj_pl_exp', project.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('expenses')
        .select('id, expense_date, category, source, total_amount, equipment_id, vendor_name, description, payment_mode, submitted_by_name')
        .in('equipment_id', allEqIds)
        .eq('company_id', companyId)
        .gte('expense_date', from).lte('expense_date', to)
      return data || []
    },
    enabled: eqEnabled,
  })

  // Equipment names (for fallback matching — older bills stored name but not UUID)
  const allEqNames = useMemo(() => {
    const names = new Set([
      ...equipment.map(e => e.name).filter(Boolean),
      ...deployments.map(d => d.equipment?.name).filter(Boolean),
    ])
    return [...names]
  }, [equipment, deployments])

  // 4. Bills tagged to project equipment — fetch company bills and filter by id OR name
  const { data: rawBills = [], isLoading: billLoad } = useQuery({
    queryKey: ['proj_pl_bills', project.id, companyId, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('bills')
        .select('id, bill_date, total_amount, equipment_id, equipment_name')
        .eq('company_id', companyId)
        .neq('status', 'cancelled')
        .gte('bill_date', from).lte('bill_date', to)
      return data || []
    },
  })

  // Filter client-side: match by equipment_id UUID or equipment_name text
  const eqBills = useMemo(() =>
    rawBills.filter(b =>
      (b.equipment_id && allEqIds.includes(b.equipment_id)) ||
      (b.equipment_name && allEqNames.includes(b.equipment_name))
    ),
    [rawBills, allEqIds, allEqNames]
  )

  const isLoading = fuelLoad || jobLoad || expLoad || billLoad

  const pl = useMemo(() => {
    // Revenue
    const totalRaised    = projectInvoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
    const totalReceived  = projectPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const outstanding    = totalRaised - totalReceived
    const contractVal    = Number(project.contract_value) || 0
    const yetToBill      = Math.max(0, contractVal - totalRaised)

    // Fuel cost — only when equipment was on this project on that date
    const DIESEL_FALLBACK = 95
    const validFuel  = fuelIssues.filter(f => wasOnProject(f.equipment_id, f.issue_date))
    const fuelCost   = validFuel.reduce((s, f) =>
      s + (Number(f.qty_liters || 0) * ((Number(f.rate_per_litre) || 0) || DIESEL_FALLBACK)), 0)
    const fuelLitres = validFuel.reduce((s, f) => s + Number(f.qty_liters || 0), 0)

    // Maintenance — only when equipment was on this project on that date
    const validJobs  = jobCards.filter(j => wasOnProject(j.equipment_id, j.closed_at?.slice(0,10)))
    const maintCost  = validJobs.reduce((s, j) => s + Number(j.total_cost || 0), 0)

    // Equipment-tagged expense breakdown — filter by deployment period
    const validExp   = eqExp.filter(e => wasOnProject(e.equipment_id, e.expense_date))

    const fieldCost = validExp
      .filter(e => e.source === 'field_expense')
      .reduce((s, e) => s + Number(e.total_amount || 0), 0)

    const salaryCost = validExp
      .filter(e => e.source === 'payroll' || e.category === 'salary')
      .reduce((s, e) => s + Number(e.total_amount || 0), 0)

    const purchaseExpCost = validExp
      .filter(e => e.source === 'purchase')
      .reduce((s, e) => s + Number(e.total_amount || 0), 0)

    const otherCost = validExp
      .filter(e =>
        e.source !== 'field_expense' &&
        e.source !== 'payroll' && e.category !== 'salary' &&
        e.source !== 'purchase'
      )
      .reduce((s, e) => s + Number(e.total_amount || 0), 0)

    // Bills — filter by deployment period
    const validBills = eqBills.filter(b => wasOnProject(b.equipment_id, b.bill_date))
    const billsCost  = validBills.reduce((s, b) => s + Number(b.total_amount || 0), 0)

    const totalCost = fuelCost + maintCost + fieldCost + salaryCost + purchaseExpCost + otherCost + billsCost
    const netPL     = totalRaised - totalCost
    const marginPct = totalRaised > 0 ? (netPL / totalRaised) * 100 : null

    return {
      totalRaised, totalReceived, outstanding, contractVal, yetToBill,
      fuelCost, fuelLitres, maintCost, fieldCost, salaryCost,
      purchaseExpCost, otherCost, billsCost,
      totalCost, netPL, marginPct,
    }
  }, [projectInvoices, projectPayments, project.contract_value, fuelIssues, jobCards, eqExp, eqBills, wasOnProject])

  const clrNet  = pl.netPL >= 0 ? 'text-emerald-400' : 'text-red-400'
  const clrMgn  = (pl.marginPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'

  // ── Drilldown modal state ──────────────────────────────────────────────────
  const [drilldown, setDrilldown] = useState(null) // { title, rows: [{date,label,amount,sub}] }

  // Build equipment id→name map for enriching drilldown rows
  const eqNameMap = useMemo(() => {
    const m = {}
    equipment.forEach(e => { m[e.id] = e.name })
    deployments.forEach(d => { if (d.equipment?.id) m[d.equipment.id] = d.equipment.name })
    return m
  }, [equipment, deployments])

  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'

  const openDrilldown = (title, rows) => setDrilldown({ title, rows })

  // validXxx arrays — filtered by deployment period (mirrors pl useMemo)
  const validFuelDD  = fuelIssues.filter(f => wasOnProject(f.equipment_id, f.issue_date))
  const validJobsDD  = jobCards.filter(j => wasOnProject(j.equipment_id, j.closed_at?.slice(0,10)))
  const validExpDD   = eqExp.filter(e => wasOnProject(e.equipment_id, e.expense_date))
  const validBillsDD = eqBills.filter(b => wasOnProject(b.equipment_id, b.bill_date))

  const drilldownConfig = {
    invoiced: () => openDrilldown('Total Invoiced', projectInvoices.map(i => ({
      date: fmtD(i.invoice_date), label: i.invoice_number || 'Invoice', sub: i.client_name || '', amount: Number(i.total_amount)||0,
    }))),
    received: () => openDrilldown('Total Received', projectPayments.map(p => ({
      date: fmtD(p.payment_date), label: p.payment_number || 'Payment', sub: p.payment_mode || '', amount: Number(p.amount)||0,
    }))),
    outstanding: () => openDrilldown('Outstanding Invoices', projectInvoices.filter(i=>i.status!=='paid').map(i => ({
      date: fmtD(i.invoice_date), label: i.invoice_number || 'Invoice', sub: i.status, amount: Math.max(0,(Number(i.total_amount)||0)-(Number(i.paid_amount)||0)),
    }))),
    fuel: () => openDrilldown('Fuel Issues', validFuelDD.map(f => ({
      date: fmtD(f.issue_date), label: `${Number(f.qty_liters||0).toFixed(1)} L`, sub: eqNameMap[f.equipment_id] || '',
      amount: Number(f.qty_liters||0) * (Number(f.rate_per_litre)||95),
    }))),
    maintenance: () => openDrilldown('Maintenance (Job Cards)', validJobsDD.map(j => ({
      date: fmtD(j.closed_at), label: j.jc_type || 'Job Card', sub: eqNameMap[j.equipment_id] || '', amount: Number(j.total_cost)||0,
    }))),
    field: () => openDrilldown('Field Expenses', validExpDD.filter(e=>e.source==='field_expense').map(e => ({
      date: fmtD(e.expense_date), label: e.description || e.category || 'Field Expense', sub: e.vendor_name || eqNameMap[e.equipment_id] || '', amount: Number(e.total_amount)||0,
      extra: [
        { k: 'Category',    v: e.category || '—' },
        { k: 'Vendor',      v: e.vendor_name || '—' },
        { k: 'Description', v: e.description || '—' },
        { k: 'Payment',     v: e.payment_mode || '—' },
        { k: 'Equipment',   v: eqNameMap[e.equipment_id] || '—' },
        { k: 'Submitted by',v: e.submitted_by_name || '—' },
      ],
    }))),
    salary: () => openDrilldown('Salary (Operators)', validExpDD.filter(e=>e.source==='payroll'||e.category==='salary').map(e => ({
      date: fmtD(e.expense_date), label: e.description || 'Operator Salary', sub: eqNameMap[e.equipment_id] || '', amount: Number(e.total_amount)||0,
      extra: [
        { k: 'Vendor',      v: e.vendor_name || '—' },
        { k: 'Description', v: e.description || '—' },
        { k: 'Payment',     v: e.payment_mode || '—' },
        { k: 'Equipment',   v: eqNameMap[e.equipment_id] || '—' },
      ],
    }))),
    purchases: () => openDrilldown('Purchases', validExpDD.filter(e=>e.source==='purchase').map(e => ({
      date: fmtD(e.expense_date), label: e.description || e.category || 'Purchase', sub: e.vendor_name || eqNameMap[e.equipment_id] || '', amount: Number(e.total_amount)||0,
      extra: [
        { k: 'Category',    v: e.category || '—' },
        { k: 'Vendor',      v: e.vendor_name || '—' },
        { k: 'Description', v: e.description || '—' },
        { k: 'Payment',     v: e.payment_mode || '—' },
        { k: 'Equipment',   v: eqNameMap[e.equipment_id] || '—' },
      ],
    }))),
    bills: () => openDrilldown('Bills', validBillsDD.map(b => ({
      date: fmtD(b.bill_date), label: b.bill_number || 'Bill', sub: b.vendor_name || b.equipment_name || eqNameMap[b.equipment_id] || '', amount: Number(b.total_amount)||0,
      extra: [
        { k: 'Vendor',    v: b.vendor_name || '—' },
        { k: 'Equipment', v: b.equipment_name || eqNameMap[b.equipment_id] || '—' },
        { k: 'Status',    v: b.status || '—' },
      ],
    }))),
    other: () => openDrilldown('Other Expenses', validExpDD.filter(e=>e.source!=='field_expense'&&e.source!=='payroll'&&e.category!=='salary'&&e.source!=='purchase').map(e => ({
      date: fmtD(e.expense_date), label: e.description || e.category || e.source || 'Other', sub: e.vendor_name || eqNameMap[e.equipment_id] || '', amount: Number(e.total_amount)||0,
      extra: [
        { k: 'Category',    v: e.category || '—' },
        { k: 'Source',      v: e.source || '—' },
        { k: 'Vendor',      v: e.vendor_name || '—' },
        { k: 'Description', v: e.description || '—' },
        { k: 'Payment',     v: e.payment_mode || '—' },
        { k: 'Equipment',   v: eqNameMap[e.equipment_id] || '—' },
      ],
    }))),
  }

  // Clickable PLRow — shows drilldown arrow when onClick provided
  const PLRow = ({ label, value, sub, highlight, indent, onClick }) => (
    <div
      onClick={onClick}
      className={`flex items-center justify-between py-1.5 border-b border-dark-700/40 last:border-0 ${indent ? 'pl-4' : ''} ${onClick ? 'cursor-pointer hover:bg-dark-700/30 rounded-lg px-2 -mx-2 transition-colors group' : ''}`}
    >
      <span className={`text-xs ${highlight ? 'font-semibold text-slate-200' : 'text-slate-400'} flex items-center gap-1`}>
        {label}
        {onClick && <span className="opacity-0 group-hover:opacity-60 text-primary-400 text-[10px] transition-opacity">↗</span>}
      </span>
      <div className="text-right">
        <span className={`text-xs font-medium ${highlight ? clrNet : onClick ? 'text-primary-300 underline underline-offset-2 decoration-dashed' : 'text-slate-200'}`}>{value}</span>
        {sub && <span className="text-xs text-slate-500 ml-2">{sub}</span>}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Date Range Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-400">Period:</span>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-primary-500" />
          <span className="text-xs text-slate-500">→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-primary-500" />
        </div>
        <span className="text-xs text-slate-500 italic">
          {from === defFrom && to === todayStr ? 'Full project duration (since mobilization)' : 'Custom range'}
        </span>
        {allEqIds.length === 0 && (
          <span className="text-xs text-orange-400 ml-2">No equipment deployed — cost data unavailable</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Loading P&amp;L data…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Revenue Column */}
          <div className="bg-dark-800/40 border border-emerald-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
              <IndianRupee className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-slate-200">Revenue</span>
            </div>
            {pl.contractVal > 0 && <PLRow label="Contract Value"    value={fmtM(pl.contractVal)} />}
            <PLRow label="Total Invoiced"    value={fmtM(pl.totalRaised)}   onClick={projectInvoices.length>0?drilldownConfig.invoiced:undefined} />
            <PLRow label="Total Received"    value={fmtM(pl.totalReceived)} onClick={projectPayments.length>0?drilldownConfig.received:undefined} />
            <PLRow label="Outstanding"       value={fmtM(pl.outstanding)}   onClick={projectInvoices.some(i=>i.status!=='paid')?drilldownConfig.outstanding:undefined} />
            {pl.contractVal > 0 && <PLRow label="Yet to Bill"  value={fmtM(pl.yetToBill)} />}
          </div>

          {/* Cost Column */}
          <div className="bg-dark-800/40 border border-orange-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
              <IndianRupee className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold text-slate-200">Costs</span>
            </div>
            <PLRow label="Fuel"               value={fmtM(pl.fuelCost)}         sub={pl.fuelLitres>0?`${pl.fuelLitres.toFixed(0)}L`:undefined}   onClick={pl.fuelCost>0?drilldownConfig.fuel:undefined} />
            <PLRow label="Maintenance"        value={fmtM(pl.maintCost)}        sub={validJobsDD.length>0?`${validJobsDD.length} JC`:undefined}      onClick={pl.maintCost>0?drilldownConfig.maintenance:undefined} />
            <PLRow label="Field Expenses"     value={fmtM(pl.fieldCost)}                                                                            onClick={pl.fieldCost>0?drilldownConfig.field:undefined} />
            <PLRow label="Salary (Operators)" value={fmtM(pl.salaryCost)}                                                                           onClick={pl.salaryCost>0?drilldownConfig.salary:undefined} />
            <PLRow label="Purchases"          value={fmtM(pl.purchaseExpCost)}                                                                       onClick={pl.purchaseExpCost>0?drilldownConfig.purchases:undefined} />
            <PLRow label="Bills"              value={fmtM(pl.billsCost)}        sub={validBillsDD.length>0?`${validBillsDD.length} bills`:undefined} onClick={pl.billsCost>0?drilldownConfig.bills:undefined} />
            <PLRow label="Other"              value={fmtM(pl.otherCost)}                                                                            onClick={pl.otherCost>0?drilldownConfig.other:undefined} />
            <p className="text-xs text-slate-500 mt-3 pt-2 border-t border-dark-700/40 leading-relaxed">
              Costs shown are for equipment deployed on this project only. Company-wide overheads (EMI, office salary) are excluded.
            </p>
            <div className="mt-3 pt-3 border-t border-dark-700/60">
              <PLRow label="Total Cost"      value={fmtM(pl.totalCost)}    highlight />
            </div>
          </div>

          {/* Net P&L Column */}
          <div className="bg-dark-800/40 border border-primary-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
              <IndianRupee className="w-4 h-4 text-primary-400" />
              <span className="text-sm font-semibold text-slate-200">Net P&amp;L</span>
            </div>
            <PLRow label="Revenue (Invoiced)" value={fmtM(pl.totalRaised)} />
            <PLRow label="Total Cost"         value={fmtM(pl.totalCost)} />
            <div className="mt-4 pt-4 border-t border-dark-700/60 text-center">
              <p className="text-xs text-slate-400 mb-1">Net Profit / Loss</p>
              <p className={`text-2xl font-bold ${clrNet}`}>{fmtM(pl.netPL)}</p>
              {pl.marginPct !== null && (
                <p className={`text-sm mt-1 font-medium ${clrMgn}`}>
                  {pl.marginPct >= 0 ? '+' : ''}{pl.marginPct.toFixed(1)}% margin
                </p>
              )}
            </div>
            {/* Equipment deployed */}
            {allEqIds.length > 0 && (
              <div className="mt-4 pt-3 border-t border-dark-700/40">
                <p className="text-xs text-slate-500">
                  Across <span className="text-slate-300 font-medium">{allEqIds.length}</span> equipment
                  {deployments.length > equipment.length && ` (incl. ${deployments.length - equipment.length} past)`}
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Drilldown Modal ──────────────────────────────────────────────── */}
      {drilldown && (
        <DrilldownDetail drilldown={drilldown} onClose={()=>setDrilldown(null)} fmtM={fmtM} />
      )}
    </div>
  )
}

// Standalone drilldown detail component (used by ProjectDetail above)
function DrilldownDetail({ drilldown, onClose, fmtM }) {
  const [expandedRow, setExpandedRow] = useState(null)
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <div>
            <p className="text-sm font-semibold text-slate-100">{drilldown.title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{drilldown.rows.length} entries · {fmtM(drilldown.rows.reduce((s,r)=>s+r.amount,0))} total</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1 rounded-lg hover:bg-dark-700">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {/* Rows */}
        <div className="overflow-y-auto flex-1">
          {drilldown.rows.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-500 text-sm">No records</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-dark-800 border-b border-dark-700">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Date</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Description</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Equipment / Ref</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {drilldown.rows.map((r, i) => (
                  <>
                    <tr key={i}
                      className={`border-b border-dark-700/40 transition-colors ${r.extra ? 'cursor-pointer hover:bg-dark-700/40 group' : 'hover:bg-dark-700/30'} ${expandedRow === i ? 'bg-dark-700/30' : ''}`}
                      onClick={() => r.extra ? setExpandedRow(expandedRow === i ? null : i) : undefined}>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-2.5 text-slate-200 font-medium capitalize">
                        <span className="flex items-center gap-1">
                          {r.label}
                          {r.extra && <span className={`text-[9px] text-primary-400 transition-transform inline-block ${expandedRow === i ? 'rotate-180' : ''}`}>▾</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-[120px] truncate">{r.sub || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-100 font-mono font-semibold">{fmtM(r.amount)}</td>
                    </tr>
                    {expandedRow === i && r.extra && (
                      <tr key={`${i}-detail`} className="border-b border-dark-700/40 bg-dark-900/60">
                        <td colSpan={4} className="px-5 py-3">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                            {r.extra.filter(({v}) => v && v !== '—').map(({k, v}) => (
                              <div key={k} className="flex gap-2">
                                <span className="text-[10px] text-slate-500 min-w-[72px] shrink-0">{k}</span>
                                <span className="text-[10px] text-slate-300 capitalize">{v}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-dark-800 border-t border-dark-600">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-slate-300">Total</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold text-primary-300 font-mono">{fmtM(drilldown.rows.reduce((s,r)=>s+r.amount,0))}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function ProjectDetail({ project, companyId, docTotals, onClose, onEdit, onDelete }) {
  const { isAdvanced } = useDisplayMode()
  const [detailTab, setDetailTab] = useState('contract')
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [assignEquipId, setAssignEquipId]   = useState('')
  const [assignBusy, setAssignBusy]         = useState(false)
  const qc = useQueryClient()

  const { data: availableEquip = [] } = useQuery({
    queryKey: ['available_equipment', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id,name,category,make,model,equipment_number')
        .eq('company_id', companyId)
        .is('current_project_id', null)
        .order('name')
      return data || []
    },
    enabled: showAssignForm,
  })

  const handleAssign = async () => {
    if (!assignEquipId) return
    setAssignBusy(true)
    const { error } = await supabase.from('equipment')
      .update({ current_project_id: project.id })
      .eq('id', assignEquipId)
    if (error) { toast.error('Failed to assign equipment'); setAssignBusy(false); return }
    qc.invalidateQueries({ queryKey: ['project_equipment', project.id] })
    qc.invalidateQueries({ queryKey: ['available_equipment', companyId] })
    setAssignEquipId('')
    setShowAssignForm(false)
    setAssignBusy(false)
    toast.success('Equipment assigned to project')
  }

  const handleDescope = async (e) => {
    if (!window.confirm(`Descope "${e.name}" from this project? Deployment history will be preserved.`)) return
    // Close the active deployment record (set withdrawn_date = today)
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('equipment_deployments')
      .update({ withdrawn_date: today })
      .eq('equipment_id', e.id)
      .eq('project_id', project.id)
      .is('withdrawn_date', null)
    // Unlink equipment from project
    const { error } = await supabase.from('equipment')
      .update({ current_project_id: null })
      .eq('id', e.id)
    if (error) { toast.error('Failed to descope equipment'); return }
    qc.invalidateQueries({ queryKey: ['project_equipment', project.id] })
    qc.invalidateQueries({ queryKey: ['project_deployments', project.id] })
    qc.invalidateQueries({ queryKey: ['available_equipment', companyId] })
    toast.success(`${e.name} descoped — history preserved`)
  }

  const { data: equipment = [] } = useQuery({
    queryKey: ['project_equipment', project.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id,name,category,make,model,status').eq('current_project_id', project.id)
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
  const { data: deployments = [] } = useQuery({
    queryKey: ['project_deployments', project.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_deployments')
        .select('id,deployed_date,withdrawn_date,billing_basis,rate_per_hour,rate_per_day,rate_per_month,rate_unit,item_name,equipment:equipment_id(id,name,equipment_number,category)')
        .eq('project_id', project.id).order('deployed_date', { ascending: false })
      return data || []
    },
  })
  const { data: commissionings = [] } = useQuery({
    queryKey: ['project_commissionings', project.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_commissionings')
        .select('id,commissioned_date,operator_name,ref_number,equipment:equipment_id(id,name,equipment_number,category)')
        .eq('project_id', project.id).order('commissioned_date', { ascending: false })
      return data || []
    },
  })
  const { data: projectInvoices = [] } = useQuery({
    queryKey: ['project_invoices', project.id],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices')
        .select('id,invoice_number,invoice_date,total_amount,paid_amount,balance_due,status,invoice_type')
        .eq('project_id', project.id).order('invoice_date', { ascending: false })
      return data || []
    },
    enabled: !!project.id,
  })
  const { data: projectPayments = [] } = useQuery({
    queryKey: ['project_payments_rcvd', project.id],
    queryFn: async () => {
      const { data } = await supabase.from('payments_received')
        .select('id,amount,payment_date,payment_method,reference')
        .eq('project_id', project.id).order('payment_date', { ascending: false })
      return data || []
    },
    enabled: !!project.id,
  })

  const totalRaised   = projectInvoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
  const totalReceived = projectPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const balance       = totalRaised - totalReceived
  const contractVal   = Number(project.contract_value) || 0
  const yetToBill     = Math.max(0, contractVal - totalRaised)

  const clientName = project.clients?.display_name || project.clients?.business_name
  const mapsHref = project.site_lat && project.site_lng
    ? `https://maps.google.com/?q=${project.site_lat},${project.site_lng}`
    : project.maps_link || null

  const supervisorList = project.our_supervisors?.length > 0
    ? project.our_supervisors
    : project.our_supervisor_name ? [{ name: project.our_supervisor_name, phone: project.our_supervisor_phone }] : []
  const pnmList = project.our_pnm_contacts?.length > 0
    ? project.our_pnm_contacts
    : project.our_pnm_name ? [{ name: project.our_pnm_name, phone: project.our_pnm_phone }] : []
  const ourTeam = [
    ...(project.our_pm_name ? [{ name: project.our_pm_name, phone: project.our_pm_phone, email: project.our_pm_email, role: 'Our Project Manager' }] : []),
    ...supervisorList.map((s, i) => ({ ...s, role: supervisorList.length > 1 ? `Site Supervisor ${i+1}` : 'Site Supervisor' })),
    ...pnmList.map((p, i) => ({ ...p, role: pnmList.length > 1 ? `P&M In-charge ${i+1}` : 'P&M In-charge' })),
  ]
  const clientTeam = [
    { name: project.client_pm_name,       phone: project.client_pm_phone,       email: project.client_pm_email, role: 'Client PM' },
    { name: project.client_pnm_name,      phone: project.client_pnm_phone,      role: 'Client P&M' },
    { name: project.client_accounts_name, phone: project.client_accounts_phone, role: 'Client Accounts' },
  ].filter(c => c.name)

  const invStatusCls = s => ({ draft:'bg-slate-500/15 text-slate-400', sent:'bg-blue-500/15 text-blue-300', partial:'bg-yellow-500/15 text-yellow-300', paid:'bg-emerald-500/15 text-emerald-300', overdue:'bg-red-500/15 text-red-300' })[s] || 'bg-slate-500/15 text-slate-400'
  const fmtAmt = n => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

  const DTABS = [
    { id: 'contract',  label: 'Contract & Terms' },
    { id: 'contacts',  label: 'Contact Details' },
    { id: 'equipment', label: `Equipment Engaged (${equipment.length})` },
    { id: 'workdocs',  label: 'Work Orders & Docs' },
    { id: 'invoices',  label: `Invoices Raised (${projectInvoices.length})` },
    { id: 'pl',        label: 'Project P&L' },
    { id: 'remarks',   label: 'Remarks' },
  ]

  return (
    <PagePanel
      title={project.project_name}
      subtitle={project.project_code}
      onClose={onClose}
      maxWidth="max-w-none"
      actions={<>
        {onDelete && (
          <button onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5"/> Delete
          </button>
        )}
        <button onClick={onEdit}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white transition-colors">
          <Edit2 className="w-3.5 h-3.5"/> Edit Project
        </button>
      </>}
    >
      <div className="space-y-6 pb-8">

      {/* ══ PROJECT OVERVIEW HEADER ══════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-5">
        {/* Left 2/3 — project meta */}
        <div className="col-span-2 bg-dark-800/50 border border-dark-600/70 rounded-2xl p-6">
          <div className="flex flex-wrap gap-2 mb-5">
            <StatusBadge status={project.status}/>
            {project.nature_of_job && <JobBadge type={project.nature_of_job}/>}
            {project.division && (
              <span className="text-xs bg-dark-700 text-slate-400 px-2.5 py-0.5 rounded-full">{project.division}</span>
            )}
            {clientName && (
              <span className="text-xs bg-dark-700 text-slate-400 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <Building2 className="w-3 h-3"/>{clientName}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-10">
            {project.site_name && <Row label="Site Name" value={project.site_name}/>}
            {(project.city || project.state) && (
              <div className="flex items-center justify-between py-2 border-b border-dark-700/50">
                <span className="text-xs text-slate-500">Location</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-200">{[project.city, project.state].filter(Boolean).join(', ')}</span>
                  {mapsHref && (
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300">
                      <ExternalLink className="w-3 h-3"/>
                    </a>
                  )}
                </div>
              </div>
            )}
            <Row label="Mobilization"  value={fmtDate(project.mobilization_date)}/>
            <Row label="Commencement"  value={[fmtDate(project.start_date), project.start_time?.slice(0,5)].filter(Boolean).join(' · ')}/>
            <Row label="Expected End"  value={fmtDate(project.expected_end_date)}/>
            {project.actual_end_date && <Row label="Actual End" value={fmtDate(project.actual_end_date)}/>}
            <Row label="Contract Value" value={fmt(project.contract_value)}/>
            <Row label="GST Rate"       value={project.gst_rate ? `${project.gst_rate}%` : '18%'}/>
          </div>
        </div>

        {/* Right 1/3 — financial KPIs */}
        <div className="space-y-3">
          {[
            { label: 'Total Invoiced',  value: fmt(totalRaised),   sub: `${projectInvoices.length} invoice${projectInvoices.length !== 1 ? 's' : ''}`, borderCls: 'border-indigo-500/25', bgCls: 'bg-indigo-500/5',  vc: 'text-indigo-300' },
            { label: 'Total Received',  value: fmt(totalReceived),  sub: `${projectPayments.length} payment${projectPayments.length !== 1 ? 's' : ''}`, borderCls: 'border-emerald-500/25', bgCls: 'bg-emerald-500/5', vc: 'text-emerald-300' },
            { label: 'Outstanding',     value: fmt(balance),        sub: 'Balance due',  borderCls: balance > 0 ? 'border-orange-500/25' : 'border-dark-600/60', bgCls: balance > 0 ? 'bg-orange-500/5' : 'bg-dark-800/40', vc: balance > 0 ? 'text-orange-300' : 'text-slate-300' },
          ].map(k => (
            <div key={k.label} className={`border rounded-xl p-4 ${k.borderCls} ${k.bgCls}`}>
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">{k.label}</p>
              <p className={`text-xl font-bold mt-1 ${k.vc}`}>{k.value}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{k.sub}</p>
            </div>
          ))}
          {contractVal > 0 && (
            <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-xl p-4">
              <p className="text-[11px] text-yellow-400/70 uppercase tracking-wide">Yet to Bill</p>
              <p className="text-xl font-bold text-yellow-300 mt-1">{fmt(yetToBill)}</p>
              <p className="text-[10px] text-yellow-400/40 mt-0.5">of {fmt(contractVal)} contract value</p>
            </div>
          )}
        </div>
      </div>

      {/* ══ TAB BAR ══════════════════════════════════════════════════════ */}
      <div className="border-b border-dark-600">
        <div className="flex overflow-x-auto">
          {DTABS.map(t => (
            <button key={t.id} onClick={() => setDetailTab(t.id)}
              className={`px-5 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors
                ${detailTab === t.id
                  ? 'border-primary-400 text-primary-300 bg-primary-500/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CONTRACT & TERMS ══════════════════════════════════════════════ */}
      {detailTab === 'contract' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
              <Sec icon={FileText} label="Billing & Payment"/>
              <div className="mt-4">
                <Row label="Billing Cycle"  value={project.billing_cycle}/>
                <Row label="Payment Terms"  value={project.payment_terms}/>
                <Row label="Mob. Advance"   value={fmt(project.mobilization_advance)}/>
                <Row label="Retention"      value={project.retention_pct ? `${project.retention_pct}%` : null}/>
                <Row label="GST Rate"       value={project.gst_rate ? `${project.gst_rate}%` : '18%'}/>
              </div>
            </div>
            {(project.shift_start_time || project.no_of_shifts) && (
              <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
                <Sec icon={Clock} label="Operator Shift Window"/>
                <div className="mt-4 space-y-3">
                  {(project.shift_start_time || project.shift_end_time) && (
                    <p className="text-sm text-slate-200 font-mono">
                      {project.shift_start_time?.slice(0,5) || '—'} → {project.shift_end_time?.slice(0,5) || '—'}
                      {project.shift_grace_mins && <span className="text-xs text-slate-500 font-sans ml-3">±{project.shift_grace_mins} min grace</span>}
                    </p>
                  )}
                  <div><span className="text-xs text-slate-500">Shifts / day: </span><span className="text-xs font-semibold text-slate-200">{project.no_of_shifts === 2 ? '2 (Day + Night)' : '1 (Single)'}</span></div>
                </div>
              </div>
            )}
          </div>

          {rateItems.length > 0 && (
            <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
              <Sec icon={IndianRupee} label="Rate Card"/>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-dark-700">
                      <th className="text-left py-2 font-medium pr-4">{project.nature_of_job === 'hire' ? 'Equipment' : project.nature_of_job === 'rate_contract' ? 'Work Item' : project.nature_of_job === 'lump_sum' ? 'Milestone' : 'Scope'}</th>
                      {project.nature_of_job === 'hire' && <><th className="text-left py-2 font-medium pr-3">Basis</th><th className="text-right py-2 font-medium pr-3">Rate</th><th className="text-right py-2 font-medium pr-3">Max hrs</th><th className="text-right py-2 font-medium">OT %</th></>}
                      {project.nature_of_job === 'rate_contract' && <><th className="text-left py-2 font-medium pr-4">Unit</th><th className="text-right py-2 font-medium">Rate (₹)</th></>}
                      {project.nature_of_job === 'lump_sum' && <><th className="text-right py-2 font-medium pr-4">Value (₹)</th><th className="text-right py-2 font-medium">Due Date</th></>}
                      {project.nature_of_job === 'amc' && <th className="text-right py-2 font-medium">Monthly (₹)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rateItems.map(r => {
                      const basis = r.billing_basis || 'daily'
                      const rateVal = basis === 'daily' ? r.rate_per_day : basis === 'monthly' ? r.rate_per_month : r.rate_per_hour
                      return (
                        <tr key={r.id} className="border-b border-dark-700/40 hover:bg-dark-700/20">
                          <td className="py-2.5 pr-4 text-slate-200 font-medium">{r.item_name}</td>
                          {project.nature_of_job === 'hire' && <><td className="py-2.5 pr-3 text-slate-400 capitalize">{basis.replace('_',' ')}</td><td className="py-2.5 pr-3 text-right text-slate-300">{rateVal ? fmt(rateVal) : '—'}</td><td className="py-2.5 pr-3 text-right text-slate-400">{r.max_hours_per_day ? `${r.max_hours_per_day}h` : '—'}</td><td className="py-2.5 text-right text-slate-400">{basis === 'short_term_hourly' ? `Fixed ${r.short_term_fixed_hours||6}h` : r.ot_percentage ? `${r.ot_percentage}%` : '—'}</td></>}
                          {project.nature_of_job === 'rate_contract' && <><td className="py-2.5 pr-4 text-slate-400">{r.unit || '—'}</td><td className="py-2.5 text-right text-slate-300">{r.rate ? fmt(r.rate) : '—'}</td></>}
                          {project.nature_of_job === 'lump_sum' && <><td className="py-2.5 pr-4 text-right text-slate-300">{r.rate ? fmt(r.rate) : '—'}</td><td className="py-2.5 text-right text-slate-400">{fmtDate(r.milestone_date)}</td></>}
                          {project.nature_of_job === 'amc' && <td className="py-2.5 text-right text-slate-300">{r.rate ? fmt(r.rate) : '—'}</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {project.hsd_supplied_by === 'client' && (
            <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
              <Sec icon={Droplet} label="HSD Terms (Client-supplied)"/>
              <div className="mt-4 grid grid-cols-2 gap-x-10">
                <Row label="Consumption Norm" value={project.hsd_consumption_norm ? `${project.hsd_consumption_norm} L/hr` : null}/>
                <Row label="HSD Rate"         value={project.hsd_rate_per_liter    ? `₹${project.hsd_rate_per_liter}/L`   : null}/>
                <Row label="Excess Billing"   value={project.hsd_excess_bill_rate  ? `₹${project.hsd_excess_bill_rate}/L` : null}/>
                <Row label="Shortage Credit"  value={project.hsd_shortage_credit   ? `₹${project.hsd_shortage_credit}/L`  : null}/>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ CONTACT DETAILS ═══════════════════════════════════════════════ */}
      {detailTab === 'contacts' && (
        <div className="space-y-5">
          {ourTeam.length > 0 && (
            <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
              <Sec icon={Users} label="Our Team on Site"/>
              <div className="mt-4 grid grid-cols-3 gap-3">{ourTeam.map(c => <ContactCard key={c.role} {...c}/>)}</div>
            </div>
          )}
          {clientTeam.length > 0 && (
            <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
              <Sec icon={Users} label="Client Team"/>
              <div className="mt-4 grid grid-cols-3 gap-3">{clientTeam.map(c => <ContactCard key={c.role} {...c}/>)}</div>
            </div>
          )}
          {ourTeam.length === 0 && clientTeam.length === 0 && (
            <div className="text-center py-20 text-slate-500">No team contacts configured for this project.</div>
          )}
        </div>
      )}

      {/* ══ EQUIPMENT ENGAGED ═════════════════════════════════════════════ */}
      {detailTab === 'equipment' && (
        <div className="space-y-5">
          <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
            {/* Header row */}
            <div className="flex items-center justify-between mb-1">
              <Sec icon={Cpu} label={`Currently on Site (${equipment.length})`}/>
              <button onClick={() => { setShowAssignForm(v => !v); setAssignEquipId('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white transition-colors">
                <UserPlus className="w-3.5 h-3.5"/>
                {showAssignForm ? 'Cancel' : 'Assign Equipment'}
              </button>
            </div>

            {/* Inline assign form */}
            {showAssignForm && (
              <div className="mt-3 flex items-center gap-2 bg-dark-700/50 border border-primary-500/30 rounded-xl px-4 py-3">
                <select value={assignEquipId} onChange={e => setAssignEquipId(e.target.value)}
                  className="flex-1 bg-dark-600 border border-dark-500 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500">
                  <option value="">— Select equipment to assign —</option>
                  {availableEquip.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}{e.equipment_number ? ` (${e.equipment_number})` : ''}{e.category ? ` — ${e.category}` : ''}
                    </option>
                  ))}
                </select>
                <button onClick={handleAssign} disabled={!assignEquipId || assignBusy}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition-colors whitespace-nowrap">
                  {assignBusy ? 'Assigning…' : 'Confirm'}
                </button>
              </div>
            )}

            {/* Equipment cards */}
            {equipment.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4 text-center py-8">No equipment assigned to this project yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {equipment.map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-dark-700/40 rounded-xl px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{e.name}</p>
                      <p className="text-xs text-slate-500">{e.category}{(e.make || e.model) ? ` · ${[e.make,e.model].filter(Boolean).join(' ')}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${e.status==='working'?'bg-emerald-500/15 text-emerald-300':e.status==='idle'?'bg-yellow-500/15 text-yellow-300':'bg-slate-500/15 text-slate-400'}`}>{e.status||'active'}</span>
                      <button onClick={() => handleDescope(e)}
                        title="Descope from project"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 transition-colors">
                        <X className="w-3 h-3"/> Descope
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(deployments.length > 0 || commissionings.length > 0) && (
            <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
              <Sec icon={Cpu} label={`Deployment History (${deployments.length})`}/>
              <div className="mt-4 space-y-3">
                {deployments.map(d => {
                  const isActive = !d.withdrawn_date
                  const fmtD = dt => dt ? new Date(dt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : null
                  const basis = d.billing_basis || d.rate_unit || ''
                  const rate  = basis==='hourly'?d.rate_per_hour:basis==='monthly'?d.rate_per_month:d.rate_per_day
                  const rateLabel = rate ? `₹${Number(rate).toLocaleString('en-IN')}/${basis==='hourly'?'hr':basis==='monthly'?'mo':'day'}` : null
                  const cert = commissionings.find(c => c.equipment?.id === d.equipment?.id)
                  return (
                    <div key={d.id} className="bg-dark-700/40 border border-dark-600 rounded-xl px-4 py-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100">{d.equipment?.name || d.item_name || '—'}{d.equipment?.equipment_number && <span className="text-primary-400 font-mono ml-2 text-xs">{d.equipment.equipment_number}</span>}</p>
                          {d.equipment?.category && <p className="text-xs text-slate-500 mt-0.5">{d.equipment.category}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {cert && <span className="text-[10px] px-2 py-0.5 bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 rounded-full">Certificate Issued</span>}
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${isActive?'bg-emerald-500/15 text-emerald-300':'bg-slate-500/15 text-slate-400'}`}>{isActive?'Active':'Withdrawn'}</span>
                        </div>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-0.5">
                        {fmtD(d.deployed_date) && <p className="text-xs text-slate-500">Deployed: <span className="text-slate-300">{fmtD(d.deployed_date)}</span></p>}
                        {fmtD(d.withdrawn_date) && <p className="text-xs text-slate-500">Withdrawn: <span className="text-slate-300">{fmtD(d.withdrawn_date)}</span></p>}
                        {rateLabel && <p className="text-xs text-slate-500">Rate: <span className="text-slate-300">{rateLabel}</span></p>}
                        {cert?.commissioned_date && <p className="text-xs text-slate-500">Commenced: <span className="text-emerald-300">{fmtD(cert.commissioned_date)}</span></p>}
                        {cert?.operator_name && <p className="text-xs text-slate-500">Operator: <span className="text-slate-300">{cert.operator_name}</span></p>}
                        {cert?.ref_number && <p className="text-xs text-slate-500">Cert. Ref: <span className="text-primary-400 font-mono">{cert.ref_number}</span></p>}
                      </div>
                    </div>
                  )
                })}
                {commissionings.filter(c => !deployments.some(d => d.equipment?.id === c.equipment?.id)).map(c => {
                  const fmtD = dt => dt ? new Date(dt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'
                  return (
                    <div key={c.id} className="bg-dark-700/40 border border-emerald-700/30 rounded-xl px-4 py-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="text-sm font-semibold text-slate-100">{c.equipment?.name||'—'}{c.equipment?.equipment_number&&<span className="text-primary-400 font-mono ml-2 text-xs">{c.equipment.equipment_number}</span>}</p>{c.equipment?.category&&<p className="text-xs text-slate-500 mt-0.5">{c.equipment.category}</p>}</div>
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 rounded-full shrink-0">Certificate Only</span>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-0.5">
                        <p className="text-xs text-slate-500">Commenced: <span className="text-emerald-300">{fmtD(c.commissioned_date)}</span></p>
                        {c.operator_name&&<p className="text-xs text-slate-500">Operator: <span className="text-slate-300">{c.operator_name}</span></p>}
                        {c.ref_number&&<p className="text-xs text-slate-500">Cert. Ref: <span className="text-primary-400 font-mono">{c.ref_number}</span></p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ WORK ORDERS & DOCS ════════════════════════════════════════════ */}
      {detailTab === 'workdocs' && (
        <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-5">
          <ProjectDocumentsSection project={project} companyId={companyId} />
        </div>
      )}

      {/* ══ INVOICES RAISED ═══════════════════════════════════════════════ */}
      {detailTab === 'invoices' && (
        <div className="space-y-3">
          {projectInvoices.length === 0 ? (
            <div className="text-center py-20 text-slate-500">No invoices raised for this project yet.</div>
          ) : (
            projectInvoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between bg-dark-800/40 border border-dark-600/60 rounded-xl px-5 py-4 gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm font-semibold text-primary-400 font-mono">{inv.invoice_number}</p>
                    {inv.invoice_type && <span className="text-[10px] px-2 py-0.5 bg-dark-600 text-slate-400 rounded-full capitalize">{inv.invoice_type.replace('_',' ')}</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{fmtDate(inv.invoice_date)}</p>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right"><p className="text-xs text-slate-500">Invoiced</p><p className="text-sm font-semibold text-slate-100">{fmtAmt(inv.total_amount)}</p></div>
                  <div className="text-right"><p className="text-xs text-slate-500">Paid</p><p className="text-sm font-semibold text-emerald-400">{fmtAmt(inv.paid_amount)}</p></div>
                  <div className="text-right"><p className="text-xs text-slate-500">Balance</p><p className={`text-sm font-semibold ${Number(inv.balance_due)>0?'text-orange-300':'text-slate-400'}`}>{fmtAmt(inv.balance_due)}</p></div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${invStatusCls(inv.status)}`}>{inv.status}</span>
                </div>
              </div>
            ))
          )}
          {projectInvoices.length > 0 && (
            <div className="flex items-center justify-between bg-dark-700/30 border border-dark-600/40 rounded-xl px-5 py-3.5">
              <span className="text-xs font-semibold text-slate-400">Totals</span>
              <div className="flex items-center gap-8">
                <div className="text-right"><p className="text-xs text-slate-500">Total Invoiced</p><p className="text-sm font-bold text-slate-100">{fmt(totalRaised)}</p></div>
                <div className="text-right"><p className="text-xs text-slate-500">Total Received</p><p className="text-sm font-bold text-emerald-400">{fmt(totalReceived)}</p></div>
                <div className="text-right"><p className="text-xs text-slate-500">Outstanding</p><p className={`text-sm font-bold ${balance>0?'text-orange-300':'text-slate-400'}`}>{fmt(balance)}</p></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ PROJECT P&L ═══════════════════════════════════════════════════ */}
      {detailTab === 'pl' && (
        <ProjectPLTab
          project={project}
          companyId={companyId}
          projectInvoices={projectInvoices}
          projectPayments={projectPayments}
          deployments={deployments}
          equipment={equipment}
        />
      )}

      {/* ══ REMARKS ═══════════════════════════════════════════════════════ */}
      {detailTab === 'remarks' && (
        <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-6">
          <Sec icon={FileText} label="Notes & Remarks"/>
          {project.notes ? (
            <p className="text-sm text-slate-300 mt-4 leading-relaxed whitespace-pre-wrap">{project.notes}</p>
          ) : (
            <p className="text-sm text-slate-500 mt-4 italic">No notes added for this project.</p>
          )}
        </div>
      )}

      </div>
    </PagePanel>
  )
}

// ── Project Card ───────────────────────────────────────────────────────────────

function ProjectCard({ project, docTotals, onClick }) {
  const clientName = project.clients?.display_name || project.clients?.business_name
  const mapsHref = project.site_lat && project.site_lng
    ? `https://maps.google.com/?q=${project.site_lat},${project.site_lng}`
    : project.maps_link || null

  return (
    <button onClick={onClick}
      className="w-full text-left bg-dark-800 border border-dark-700 rounded-xl p-4 hover:border-dark-500 transition-all group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-100 text-sm truncate group-hover:text-primary-300 transition-colors">
            {project.project_name}
          </p>
          {project.project_code && (
            <p className="text-[11px] text-primary-500 font-mono mt-0.5">{project.project_code}</p>
          )}
        </div>
        <StatusBadge status={project.status}/>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {project.nature_of_job && <JobBadge type={project.nature_of_job}/>}
        {project.division && (
          <span className="text-[11px] bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full">{project.division}</span>
        )}
      </div>
      <div className="space-y-1 text-xs text-slate-500">
        {clientName && (
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3 shrink-0"/><span className="truncate">{clientName}</span>
          </div>
        )}
        {(project.city || project.state) && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 shrink-0"/>
            <span>{[project.city, project.state].filter(Boolean).join(', ')}</span>
            {mapsHref && (
              <a href={mapsHref} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-primary-500 hover:text-primary-400 ml-0.5">
                <ExternalLink className="w-2.5 h-2.5"/>
              </a>
            )}
          </div>
        )}
        {project.start_date && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 shrink-0"/>
            <span>{fmtDate(project.start_date)}{project.expected_end_date ? ` → ${fmtDate(project.expected_end_date)}` : ''}</span>
          </div>
        )}
        {(docTotals?.total > 0 || project.contract_value) && (
          <div className="flex items-center gap-1.5">
            <IndianRupee className="w-3 h-3 shrink-0 text-emerald-500"/>
            <span className={docTotals?.total > 0 ? 'text-emerald-400 font-medium' : ''}>
              {fmt(docTotals?.total > 0 ? docTotals.total : project.contract_value)}
            </span>
            {docTotals?.total > 0 && (
              <span className="text-[10px] text-slate-600 font-normal">
                ({Object.keys(docTotals.byType).length} type{Object.keys(docTotals.byType).length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { userProfile, role } = useAuth()
  const qc = useQueryClient()
  const isAdmin = ['admin','superadmin','manager'].includes(role)
  const companyId = userProfile?.company_id

  const [search, setSearch]     = useState('')
  const [statusFilter, setStatus] = useState('all')
  const [showAdd, setShowAdd]   = useState(false)
  const [editing, setEditing]   = useState(null)
  const [viewing, setViewing]   = useState(null)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, clients(business_name, display_name)')
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
        .select('id, business_name, display_name')
        .eq('company_id', companyId)
        .order('business_name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  // Fetch all document amounts for this company in one shot → sum per project
  const { data: allDocAmounts = [] } = useQuery({
    queryKey: ['project_doc_amounts', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_documents')
        .select('project_id, doc_type, amount')
        .eq('company_id', companyId)
        .not('amount', 'is', null)
      return data || []
    },
    staleTime: 60_000,
    enabled: !!companyId,
  })

  // { [project_id]: { total: number, byType: { po: number, work_order: number, ... } } }
  const docTotalsByProject = useMemo(() => {
    const map = {}
    allDocAmounts.forEach(d => {
      const amt = Number(d.amount || 0)
      if (!amt) return
      if (!map[d.project_id]) map[d.project_id] = { total: 0, byType: {} }
      map[d.project_id].total += amt
      map[d.project_id].byType[d.doc_type] = (map[d.project_id].byType[d.doc_type] || 0) + amt
    })
    return map
  }, [allDocAmounts])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return projects.filter(p => {
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      const cName = p.clients?.display_name || p.clients?.business_name || ''
      const matchSearch = !q ||
        p.project_name?.toLowerCase().includes(q) ||
        p.project_code?.toLowerCase().includes(q) ||
        cName.toLowerCase().includes(q) ||
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
    qc.invalidateQueries(['next_project_code'])
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

  const handleDelete = async (p) => {
    if (!confirm(`Permanently delete "${p.project_name}"?\n\nThis cannot be undone. All rate items will also be deleted.`)) return
    // Delete rate items first (foreign key constraint)
    await supabase.from('project_rate_items').delete().eq('project_id', p.id)
    const { error } = await supabase.from('projects').delete().eq('id', p.id)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries(['projects'])
    qc.invalidateQueries(['next_project_code'])
    setViewing(null)
    toast.success('Project deleted')
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
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter===k ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 hover:text-slate-200'
              }`}>
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
            <p className="text-slate-400 font-medium">
              {search || statusFilter!=='all' ? 'No projects match' : 'No projects yet'}
            </p>
            <p className="text-slate-500 text-sm mt-1">
              {isAdmin && !search ? 'Click "New Project" to get started' : 'Try adjusting your search'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => <ProjectCard key={p.id} project={p} docTotals={docTotalsByProject[p.id]} onClick={() => setViewing(p)}/>)}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddEditModal
          clients={clients}
          onClose={() => setShowAdd(false)}
          onSaved={onSaved}
        />
      )}
      {editing && (
        <AddEditModal
          project={editing}
          clients={clients}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {viewing && (
        <ProjectDetail
          project={viewing}
          companyId={companyId}
          docTotals={docTotalsByProject[viewing?.id]}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
          onDelete={isAdmin ? () => handleDelete(viewing) : undefined}
        />
      )}
    </div>
  )
}
