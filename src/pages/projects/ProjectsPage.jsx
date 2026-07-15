import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
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
  shift_start_time: '', shift_end_time: '', shift_grace_mins: '30',
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
  useQuery({
    queryKey: ['rate_items', project?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_rate_items')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order')
      return data || []
    },
    enabled: !!project?.id && !ratesLoaded,
    onSuccess: (d) => {
      setRateItems(d.map(r => ({
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
    },
  })

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
          <p className="text-xs font-medium text-slate-400">Site Supervisor(s)</p>
          {supervisors.map((s, i) => (
            <div key={s._k} className="flex gap-2 items-center">
              <input className={inp('text-xs flex-1')} value={s.name}
                onChange={e => setSupervisors(list => list.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                placeholder="Name"/>
              <input className={inp('text-xs w-36 shrink-0')} value={s.phone}
                onChange={e => setSupervisors(list => list.map((x,j)=>j===i?{...x,phone:e.target.value}:x))}
                placeholder="Mobile"/>
              <button type="button"
                onClick={() => setSupervisors(list => list.filter((_,j)=>j!==i))}
                className="text-slate-500 hover:text-red-400 shrink-0 p-1">
                <Trash2 className="w-3.5 h-3.5"/>
              </button>
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
          <p className="text-xs font-medium text-slate-400">P&M In-charge(s)</p>
          {pnmContacts.map((p, i) => (
            <div key={p._k} className="flex gap-2 items-center">
              <input className={inp('text-xs flex-1')} value={p.name}
                onChange={e => setPnmContacts(list => list.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                placeholder="Name"/>
              <input className={inp('text-xs w-36 shrink-0')} value={p.phone}
                onChange={e => setPnmContacts(list => list.map((x,j)=>j===i?{...x,phone:e.target.value}:x))}
                placeholder="Mobile"/>
              <button type="button"
                onClick={() => setPnmContacts(list => list.filter((_,j)=>j!==i))}
                className="text-slate-500 hover:text-red-400 shrink-0 p-1">
                <Trash2 className="w-3.5 h-3.5"/>
              </button>
            </div>
          ))}
          <button type="button"
            onClick={() => setPnmContacts(list => [...list, mkContact()])}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary-400 transition-colors">
            <UserPlus className="w-3.5 h-3.5"/> Add P&M In-charge
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

function ProjectDetail({ project, companyId, docTotals, onClose, onEdit, onDelete }) {
  const { isAdvanced } = useDisplayMode()

  const { data: equipment = [] } = useQuery({
    queryKey: ['project_equipment', project.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment')
        .select('id, name, category, make, model, status')
        .eq('current_project_id', project.id)
      return data || []
    },
  })

  const { data: rateItems = [] } = useQuery({
    queryKey: ['rate_items_view', project.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_rate_items')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order')
      return data || []
    },
  })

  // Deployment rate cards already linked to this project
  const { data: deployments = [] } = useQuery({
    queryKey: ['project_deployments', project.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_deployments')
        .select('id,deployed_date,withdrawn_date,billing_basis,rate_per_hour,rate_per_day,rate_per_month,rate_unit,item_name,equipment:equipment_id(id,name,equipment_number,category)')
        .eq('project_id', project.id)
        .order('deployed_date', { ascending: false })
      return data || []
    },
  })

  // Formal commencement certificates issued from the Letters module
  const { data: commissionings = [] } = useQuery({
    queryKey: ['project_commissionings', project.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_commissionings')
        .select('id,commissioned_date,withdrawn_date,site_location,client_name,operator_name,ref_number,doc_ref,equipment:equipment_id(id,name,equipment_number,category)')
        .eq('project_id', project.id)
        .order('commissioned_date', { ascending: false })
      return data || []
    },
  })

  const clientName = project.clients?.display_name || project.clients?.business_name
  const mapsHref = project.site_lat && project.site_lng
    ? `https://maps.google.com/?q=${project.site_lat},${project.site_lng}`
    : project.maps_link || null

  // Our team — build from new JSONB arrays with legacy fallback
  const supervisorList = (project.our_supervisors?.length > 0)
    ? project.our_supervisors
    : project.our_supervisor_name ? [{ name: project.our_supervisor_name, phone: project.our_supervisor_phone }] : []
  const pnmList = (project.our_pnm_contacts?.length > 0)
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

  return (
    <Modal title={project.project_name} subtitle={project.project_code} onClose={onClose} wide
      footer={<>
        {onDelete && (
          <button onClick={onDelete}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors shrink-0">
            <Trash2 className="w-3.5 h-3.5"/> Delete
          </button>
        )}
        <button onClick={onClose} className="btn-ghost flex-1">Close</button>
        <button onClick={onEdit} className="btn-primary flex-1 flex items-center justify-center gap-2">
          <Edit2 className="w-3.5 h-3.5"/> Edit Project
        </button>
      </>}
    >
      {/* Badges */}
      <div className="flex flex-wrap gap-2 -mt-2">
        <StatusBadge status={project.status}/>
        {project.nature_of_job && <JobBadge type={project.nature_of_job}/>}
        {project.division && (
          <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full">{project.division}</span>
        )}
        {clientName && (
          <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Building2 className="w-3 h-3"/>{clientName}
          </span>
        )}
      </div>

      {/* Quick stats */}
      <div className={`grid gap-3 ${isAdvanced ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {/* Document value (live) or fallback to static contract_value */}
        <div className="bg-dark-700/50 rounded-lg p-3 text-center">
          <p className="text-[11px] text-slate-500 mb-0.5">
            {docTotals?.total > 0 ? 'Total Doc Value' : 'Contract Value'}
          </p>
          <p className={`text-sm font-semibold ${docTotals?.total > 0 ? 'text-emerald-400' : 'text-slate-100'}`}>
            {fmt(docTotals?.total > 0 ? docTotals.total : project.contract_value)}
          </p>
          {docTotals?.total > 0 && (
            <p className="text-[10px] text-slate-600 mt-0.5">
              {Object.entries(docTotals.byType).map(([k, v]) =>
                `${DOC_TYPES.find(d => d.value === k)?.label?.split('/')[0] || k}: ${fmt(v)}`
              ).join(' · ')}
            </p>
          )}
        </div>
        <div className="bg-dark-700/50 rounded-lg p-3 text-center">
          <p className="text-[11px] text-slate-500 mb-0.5">Equipment on Site</p>
          <p className="text-sm font-semibold text-slate-100">
            {equipment.length} unit{equipment.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isAdvanced && (
          <div className="bg-dark-700/50 rounded-lg p-3 text-center">
            <p className="text-[11px] text-slate-500 mb-0.5">GST Rate</p>
            <p className="text-sm font-semibold text-slate-100">{project.gst_rate ? `${project.gst_rate}%` : '18%'}</p>
          </div>
        )}
      </div>

      {/* Site & Timeline */}
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
              {project.site_lat && project.site_lng && (
                <p className="text-[11px] text-slate-500 font-mono mt-1.5">
                  📍 {project.site_lat}, {project.site_lng}
                </p>
              )}
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 pt-2">
                  <ExternalLink className="w-3 h-3"/> Open in Maps
                </a>
              )}
            </div>
          </div>
          <div>
            <Sec icon={Calendar} label="Timeline"/>
            <div className="mt-2">
              <Row label="Mobilization" value={fmtDate(project.mobilization_date)}/>
              {project.mob_attachment_url && (
                <div className="flex justify-between py-1.5 border-b border-dark-700/50">
                  <span className="text-xs text-slate-500">Mob. Document</span>
                  <button onClick={async () => {
                    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(project.mob_attachment_url, 120)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                    else toast.error('Could not open document')
                  }} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                    <Eye className="w-3 h-3"/> View
                  </button>
                </div>
              )}
              <Row label="Commencement"
                value={[fmtDate(project.start_date), project.start_time ? project.start_time.slice(0,5) : null].filter(Boolean).join(' · ')}/>
              {project.comm_attachment_url && (
                <div className="flex justify-between py-1.5 border-b border-dark-700/50">
                  <span className="text-xs text-slate-500">Comm. Document</span>
                  <button onClick={async () => {
                    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(project.comm_attachment_url, 120)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                    else toast.error('Could not open document')
                  }} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                    <Eye className="w-3 h-3"/> View
                  </button>
                </div>
              )}
              <Row label="Expected End" value={fmtDate(project.expected_end_date)}/>
              <Row label="Actual End"   value={fmtDate(project.actual_end_date)}/>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {(project.city || project.state) && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-slate-500"/>
              {[project.city, project.state].filter(Boolean).join(', ')}
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer"
                  className="text-primary-400 hover:text-primary-300">
                  <ExternalLink className="w-3 h-3"/>
                </a>
              )}
            </div>
          )}
          {project.start_date && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-500"/>
              Started {fmtDate(project.start_date)}{project.expected_end_date ? ` → ${fmtDate(project.expected_end_date)}` : ''}
            </div>
          )}
        </div>
      )}

      {/* Contract — Advanced */}
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

      {/* Rate Card — Advanced */}
      {isAdvanced && rateItems.length > 0 && (
        <div>
          <Sec icon={IndianRupee} label="Rate Card"/>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-dark-700">
                  <th className="text-left py-1.5 font-medium pr-4">
                    {project.nature_of_job === 'hire' ? 'Equipment'
                      : project.nature_of_job === 'rate_contract' ? 'Work Item'
                      : project.nature_of_job === 'lump_sum' ? 'Milestone' : 'Scope'}
                  </th>
                  {project.nature_of_job === 'hire' && <>
                    <th className="text-left py-1.5 font-medium pr-3">Basis</th>
                    <th className="text-right py-1.5 font-medium pr-3">Rate</th>
                    <th className="text-right py-1.5 font-medium pr-3">Max hrs</th>
                    <th className="text-right py-1.5 font-medium">OT %</th>
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
                {rateItems.map(r => {
                  const basis = r.billing_basis || 'daily'
                  const rateVal = basis === 'daily' ? r.rate_per_day
                    : basis === 'monthly' ? r.rate_per_month
                    : r.rate_per_hour
                  return (
                    <tr key={r.id} className="border-b border-dark-700/40">
                      <td className="py-1.5 pr-4 text-slate-200">{r.item_name}</td>
                      {project.nature_of_job === 'hire' && <>
                        <td className="py-1.5 pr-3 text-slate-400 capitalize">{basis.replace('_',' ')}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-300">{rateVal ? fmt(rateVal) : '—'}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-400">{r.max_hours_per_day ? `${r.max_hours_per_day} hrs` : '—'}</td>
                        <td className="py-1.5 text-right text-slate-400">
                          {basis === 'short_term_hourly' ? `Fixed ${r.short_term_fixed_hours||6}h` : r.ot_percentage ? `${r.ot_percentage}%` : '—'}
                        </td>
                      </>}
                      {project.nature_of_job === 'rate_contract' && <>
                        <td className="py-1.5 pr-4 text-slate-400">{r.unit || '—'}</td>
                        <td className="py-1.5 text-right text-slate-300">{r.rate ? fmt(r.rate) : '—'}</td>
                      </>}
                      {project.nature_of_job === 'lump_sum' && <>
                        <td className="py-1.5 pr-4 text-right text-slate-300">{r.rate ? fmt(r.rate) : '—'}</td>
                        <td className="py-1.5 text-right text-slate-400">{fmtDate(r.milestone_date)}</td>
                      </>}
                      {project.nature_of_job === 'amc' && (
                        <td className="py-1.5 text-right text-slate-300">{r.rate ? fmt(r.rate) : '—'}</td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HSD — Advanced */}
      {isAdvanced && project.hsd_supplied_by === 'client' && (
        <div>
          <Sec icon={Droplet} label="HSD Terms (Client-supplied)"/>
          <div className="mt-2 grid grid-cols-2 gap-x-6">
            <div>
              <Row label="Consumption Norm" value={project.hsd_consumption_norm ? `${project.hsd_consumption_norm} L/hr` : null}/>
              <Row label="HSD Rate"         value={project.hsd_rate_per_liter    ? `₹${project.hsd_rate_per_liter}/L`   : null}/>
            </div>
            <div>
              <Row label="Excess Billing"  value={project.hsd_excess_bill_rate  ? `₹${project.hsd_excess_bill_rate}/L` : null}/>
              <Row label="Shortage Credit" value={project.hsd_shortage_credit   ? `₹${project.hsd_shortage_credit}/L`  : null}/>
            </div>
          </div>
        </div>
      )}

      {/* Shift Window */}
      {(project.shift_start_time || project.shift_end_time) && (
        <div>
          <Sec icon={Clock} label="Operator Shift Window"/>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm text-slate-200 font-mono">
              {project.shift_start_time?.slice(0,5) || '—'} → {project.shift_end_time?.slice(0,5) || '—'}
            </span>
            {project.shift_grace_mins && (
              <span className="text-xs text-slate-500">±{project.shift_grace_mins} min grace</span>
            )}
          </div>
        </div>
      )}

      {/* Our Team */}
      {ourTeam.length > 0 && (
        <div>
          <Sec icon={Users} label="Our Team on Site"/>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ourTeam.map(c => <ContactCard key={c.role} {...c}/>)}
          </div>
        </div>
      )}

      {/* Client Team — Advanced */}
      {isAdvanced && clientTeam.length > 0 && (
        <div>
          <Sec icon={Users} label="Client Team"/>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {clientTeam.map(c => <ContactCard key={c.role} {...c}/>)}
          </div>
        </div>
      )}

      {/* Equipment on Site */}
      <div>
        <Sec icon={Cpu} label={`Equipment on Site (${equipment.length})`}/>
        {equipment.length === 0 ? (
          <p className="text-xs text-slate-500 mt-2 italic">No equipment deployed here yet. Deploy from the Fleet module.</p>
        ) : (
          <div className="mt-2 space-y-1">
            {equipment.map(e => (
              <div key={e.id} className="flex items-center justify-between bg-dark-700/50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-slate-200">{e.name}</p>
                  <p className="text-[11px] text-slate-500">{e.category}{(e.make || e.model) ? ` · ${[e.make, e.model].filter(Boolean).join(' ')}` : ''}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                  e.status==='working' ? 'bg-emerald-500/15 text-emerald-300'
                    : e.status==='idle' ? 'bg-yellow-500/15 text-yellow-300'
                    : 'bg-slate-500/15 text-slate-400'
                }`}>
                  {e.status || 'deployed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipment Deployment History */}
      {(deployments.length > 0 || commissionings.length > 0) && (
        <div>
          <Sec icon={Cpu} label={`Deployment History (${deployments.length})`}/>
          <div className="mt-2 space-y-2">

            {/* ── Rate-card deployments (always shown) ── */}
            {deployments.map(d => {
              const isActive = !d.withdrawn_date
              const fmtD = dt => dt ? new Date(dt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : null
              const basis = d.billing_basis || d.rate_unit || ''
              const rate  = basis === 'hourly' ? d.rate_per_hour
                          : basis === 'monthly' ? d.rate_per_month
                          : d.rate_per_day
              const rateLabel = rate ? `₹${Number(rate).toLocaleString('en-IN')}/${basis === 'hourly' ? 'hr' : basis === 'monthly' ? 'mo' : 'day'}` : null

              // Find matching commencement certificate for this equipment
              const cert = commissionings.find(c => c.equipment?.id === d.equipment?.id)

              return (
                <div key={d.id} className="bg-dark-700/50 border border-dark-600 rounded-lg px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100">
                        {d.equipment?.name || d.item_name || '—'}
                        {d.equipment?.equipment_number && (
                          <span className="text-primary-400 font-mono ml-1.5 text-[10px]">{d.equipment.equipment_number}</span>
                        )}
                      </p>
                      {d.equipment?.category && <p className="text-[10px] text-slate-500">{d.equipment.category}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cert && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 rounded-full">
                          Certificate Issued
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'}`}>
                        {isActive ? 'Active' : 'Withdrawn'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {fmtD(d.deployed_date) && (
                      <p className="text-[10px] text-slate-500">Deployed: <span className="text-slate-300">{fmtD(d.deployed_date)}</span></p>
                    )}
                    {fmtD(d.withdrawn_date) && (
                      <p className="text-[10px] text-slate-500">Withdrawn: <span className="text-slate-300">{fmtD(d.withdrawn_date)}</span></p>
                    )}
                    {rateLabel && <p className="text-[10px] text-slate-500">Rate: <span className="text-slate-300">{rateLabel}</span></p>}
                    {cert?.commissioned_date && (
                      <p className="text-[10px] text-slate-500">Commenced: <span className="text-emerald-300">{fmtD(cert.commissioned_date)}</span></p>
                    )}
                    {cert?.operator_name && (
                      <p className="text-[10px] text-slate-500">Operator: <span className="text-slate-300">{cert.operator_name}</span></p>
                    )}
                    {cert?.ref_number && (
                      <p className="text-[10px] text-slate-500">Cert. Ref: <span className="text-primary-400 font-mono">{cert.ref_number}</span></p>
                    )}
                  </div>
                </div>
              )
            })}

            {/* ── Commissionings not matched to a rate card ── */}
            {commissionings.filter(c => !deployments.some(d => d.equipment?.id === c.equipment?.id)).map(c => {
              const fmtD = dt => dt ? new Date(dt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
              return (
                <div key={c.id} className="bg-dark-700/50 border border-emerald-700/30 rounded-lg px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-100">
                        {c.equipment?.name || '—'}
                        {c.equipment?.equipment_number && <span className="text-primary-400 font-mono ml-1.5 text-[10px]">{c.equipment.equipment_number}</span>}
                      </p>
                      {c.equipment?.category && <p className="text-[10px] text-slate-500">{c.equipment.category}</p>}
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 rounded-full shrink-0">Certificate Only</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <p className="text-[10px] text-slate-500">Commenced: <span className="text-emerald-300">{fmtD(c.commissioned_date)}</span></p>
                    {c.operator_name && <p className="text-[10px] text-slate-500">Operator: <span className="text-slate-300">{c.operator_name}</span></p>}
                    {c.ref_number    && <p className="text-[10px] text-slate-500">Cert. Ref: <span className="text-primary-400 font-mono">{c.ref_number}</span></p>}
                  </div>
                </div>
              )
            })}

          </div>
        </div>
      )}

      {isAdvanced && project.notes && (
        <div>
          <Sec icon={FileText} label="Notes"/>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">{project.notes}</p>
        </div>
      )}

      {/* ── Documents ── */}
      <ProjectDocumentsSection project={project} companyId={companyId} />
    </Modal>
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
