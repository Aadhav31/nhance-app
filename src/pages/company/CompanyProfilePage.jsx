/**
 * CompanyProfilePage.jsx
 *
 * Admin-only page with 4 tabs:
 *  1. Profile   — company name, address, GSTIN, logo, bank details
 *  2. Units     — CRUD for company manufacturing / stockyard units
 *  3. Users     — all users with unit assignment + role display
 *  4. Branding  — letterhead color, PDF footer, signature block
 */

import { useState, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, Edit2, Trash2, Save, X, Loader2,
  MapPin, Phone, Mail, Globe, CreditCard, Hash,
  Users, Palette, ChevronDown, CheckCircle2, Camera,
  Factory, Warehouse, Mountain, Package, LayoutGrid,
  ShieldCheck, UserCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'profile',  label: 'Profile',  Icon: Building2 },
  { key: 'units',    label: 'Units',    Icon: Factory   },
  { key: 'users',    label: 'Users',    Icon: Users     },
  { key: 'branding', label: 'Branding', Icon: Palette   },
]

const UNIT_TYPES = [
  { value: 'manufacturing', label: 'Manufacturing Plant', Icon: Factory   },
  { value: 'stockyard',     label: 'Stock Yard',          Icon: Warehouse },
  { value: 'quarry',        label: 'Quarry / Mine',       Icon: Mountain  },
  { value: 'msand_plant',   label: 'M-Sand Plant',        Icon: Factory   },
  { value: 'psand_plant',   label: 'P-Sand Plant',        Icon: Factory   },
  { value: 'office',        label: 'Office',              Icon: Building2 },
  { value: 'other',         label: 'Other',               Icon: Package   },
]

const UNIT_TYPE_COLORS = {
  manufacturing: 'text-blue-400 bg-blue-500/10 border-blue-700/40',
  stockyard:     'text-amber-400 bg-amber-500/10 border-amber-700/40',
  quarry:        'text-orange-400 bg-orange-500/10 border-orange-700/40',
  msand_plant:   'text-cyan-400 bg-cyan-500/10 border-cyan-700/40',
  psand_plant:   'text-indigo-400 bg-indigo-500/10 border-indigo-700/40',
  office:        'text-slate-400 bg-slate-500/10 border-slate-600',
  other:         'text-slate-400 bg-slate-500/10 border-slate-600',
}

const ROLE_COLORS = {
  admin:      'text-red-400 bg-red-500/10 border-red-700/40',
  manager:    'text-blue-400 bg-blue-500/10 border-blue-700/40',
  supervisor: 'text-teal-400 bg-teal-500/10 border-teal-700/40',
  accounts:   'text-emerald-400 bg-emerald-500/10 border-emerald-700/40',
  hr:         'text-violet-400 bg-violet-500/10 border-violet-700/40',
  operator:   'text-slate-400 bg-slate-500/10 border-slate-600',
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────
const inp = (extra = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5 text-sm text-slate-100
   focus:outline-none focus:border-primary-500 placeholder-slate-600 ${extra}`

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-slate-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function SectionHead({ label }) {
  return (
    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pt-2">{label}</p>
  )
}

// ── 1. PROFILE TAB ────────────────────────────────────────────────────────────
function ProfileTab({ companyId, company, onSaved }) {
  const [form, setForm] = useState({
    name:         company?.name         || '',
    address:      company?.address      || '',
    gstin:        company?.gstin        || '',
    contact_phone:company?.contact_phone|| '',
    email:        company?.email        || '',
    website:      company?.website      || '',
    bank_name:    company?.bank_name    || '',
    bank_account: company?.bank_account || '',
    bank_ifsc:    company?.bank_ifsc    || '',
    bank_account_name: company?.bank_account_name || '',
  })
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const logoRef = useRef()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const logoPreview = logoFile
    ? URL.createObjectURL(logoFile)
    : company?.logo_url || null

  const save = async () => {
    if (!form.name.trim()) return toast.error('Company name is required')
    setSaving(true)
    try {
      let logo_url = company?.logo_url || null

      // Convert logo to base64 from local File (no network, no CORS)
      if (logoFile) {
        logo_url = await new Promise((resolve) => {
          const objectUrl = URL.createObjectURL(logoFile)
          const img = new Image()
          img.onload = () => {
            const MAX_W = 400, MAX_H = 200
            let w = img.width, h = img.height
            if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W }
            if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H }
            const c = document.createElement('canvas')
            c.width = w; c.height = h
            c.getContext('2d').drawImage(img, 0, 0, w, h)
            URL.revokeObjectURL(objectUrl)
            resolve(c.toDataURL('image/png'))
          }
          img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null) }
          img.src = objectUrl
        })
      }

      const { error } = await supabase.from('companies').update({
        name:              form.name.trim(),
        address:           form.address.trim()       || null,
        gstin:             form.gstin.trim()         || null,
        contact_phone:     form.contact_phone.trim() || null,
        email:             form.email.trim()         || null,
        website:           form.website.trim()       || null,
        bank_name:         form.bank_name.trim()     || null,
        bank_account:      form.bank_account.trim()  || null,
        bank_ifsc:         form.bank_ifsc.trim()     || null,
        bank_account_name: form.bank_account_name.trim() || null,
        logo_url,
      }).eq('id', companyId)

      if (error) throw error
      toast.success('Company profile saved')
      onSaved()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div
          onClick={() => logoRef.current?.click()}
          className="w-20 h-20 rounded-2xl border-2 border-dashed border-dark-600 flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary-500 transition-colors bg-dark-700 shrink-0"
        >
          {logoPreview
            ? <img src={logoPreview} alt="logo" className="w-full h-full object-contain" />
            : <Camera className="w-6 h-6 text-slate-600" />
          }
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">{form.name || 'Company Name'}</p>
          <button onClick={() => logoRef.current?.click()}
            className="text-xs text-primary-400 hover:underline mt-1">
            {logoPreview ? 'Change logo' : 'Upload logo'}
          </button>
          {company?.logo_url && !logoFile && (
            <button onClick={async () => {
              await supabase.from('companies').update({ logo_url: null }).eq('id', companyId)
              toast.success('Logo removed'); onSaved()
            }} className="text-xs text-red-400 hover:underline ml-3">Remove</button>
          )}
        </div>
        <input ref={logoRef} type="file" accept="image/*" className="hidden"
          onChange={e => setLogoFile(e.target.files?.[0] || null)} />
      </div>

      {/* Basic info */}
      <SectionHead label="Company Details" />
      <div className="grid grid-cols-1 gap-3">
        <Field label="Company Name *">
          <input className={inp()} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Enter company name" />
        </Field>
        <Field label="Address">
          <textarea className={inp('resize-none h-16')} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GSTIN">
            <input className={inp('font-mono')} value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
          </Field>
          <Field label="Phone">
            <input className={inp()} value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="+91 98765 43210" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input className={inp()} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="company@email.com" />
          </Field>
          <Field label="Website">
            <input className={inp()} value={form.website} onChange={e => set('website', e.target.value)} placeholder="www.company.com" />
          </Field>
        </div>
      </div>

      {/* Bank */}
      <SectionHead label="Bank Details" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bank Name">
          <input className={inp()} value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="State Bank of India" />
        </Field>
        <Field label="Account Name">
          <input className={inp()} value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} placeholder="Name on account" />
        </Field>
        <Field label="Account Number">
          <input className={inp('font-mono')} value={form.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder="Account number" />
        </Field>
        <Field label="IFSC Code">
          <input className={inp('font-mono')} value={form.bank_ifsc} onChange={e => set('bank_ifsc', e.target.value.toUpperCase())} placeholder="SBIN0001234" />
        </Field>
      </div>

      <button onClick={save} disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Company Profile'}
      </button>
    </div>
  )
}

// ── 2. UNITS TAB ──────────────────────────────────────────────────────────────
const BLANK_UNIT = { unit_name: '', unit_code: '', unit_type: 'manufacturing', location: '' }

function UnitsTab({ companyId }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [form,     setForm]     = useState(BLANK_UNIT)
  const [saving,   setSaving]   = useState(false)

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['company_units', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('company_units').select('*')
        .eq('company_id', companyId).order('sort_order')
      return data || []
    },
    enabled: !!companyId,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openCreate = () => { setEditing(null); setForm(BLANK_UNIT); setShowForm(true) }
  const openEdit   = (u)  => { setEditing(u); setForm({ unit_name: u.unit_name, unit_code: u.unit_code || '', unit_type: u.unit_type, location: u.location || '' }); setShowForm(true) }
  const closeForm  = ()   => { setShowForm(false); setEditing(null); setForm(BLANK_UNIT) }

  const save = async () => {
    if (!form.unit_name.trim()) return toast.error('Unit name is required')
    setSaving(true)
    try {
      const payload = {
        unit_name:  form.unit_name.trim(),
        unit_code:  form.unit_code.trim() || null,
        unit_type:  form.unit_type,
        location:   form.location.trim()  || null,
        sort_order: editing?.sort_order ?? units.length,
      }
      if (editing) {
        const { error } = await supabase.from('company_units').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Unit updated')
      } else {
        const { error } = await supabase.from('company_units').insert({ company_id: companyId, ...payload })
        if (error) throw error
        toast.success('Unit created')
      }
      qc.invalidateQueries(['company_units', companyId])
      closeForm()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (u) => {
    await supabase.from('company_units').update({ is_active: !u.is_active }).eq('id', u.id)
    qc.invalidateQueries(['company_units', companyId])
    toast.success(u.is_active ? 'Unit deactivated' : 'Unit activated')
  }

  const del = async (u) => {
    if (!window.confirm(`Delete unit "${u.unit_name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('company_units').delete().eq('id', u.id)
    if (error) return toast.error(error.message)
    qc.invalidateQueries(['company_units', companyId])
    toast.success('Unit deleted')
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>

  const unitTypeInfo = (t) => UNIT_TYPES.find(x => x.value === t) || UNIT_TYPES[6]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{units.length} unit{units.length !== 1 ? 's' : ''} registered</p>
        <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Unit
        </button>
      </div>

      {units.length === 0 && (
        <div className="text-center py-16 text-slate-600">
          <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-2">No units yet</p>
          <p className="text-xs text-slate-700 max-w-xs mx-auto">Add your manufacturing plants, stock yards, and quarries to enable per-unit data tracking.</p>
          <button onClick={openCreate} className="btn-primary text-sm mt-4 mx-auto">
            <Plus className="w-4 h-4" /> Add First Unit
          </button>
        </div>
      )}

      <div className="space-y-2">
        {units.map((u, idx) => {
          const { label, Icon } = unitTypeInfo(u.unit_type)
          const clr = UNIT_TYPE_COLORS[u.unit_type] || UNIT_TYPE_COLORS.other
          return (
            <div key={u.id} className={`bg-dark-800 border rounded-xl p-4 transition-all ${u.is_active ? 'border-dark-700' : 'border-dark-700 opacity-50'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${clr}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-100">{u.unit_name}</p>
                    {u.unit_code && <span className="text-[10px] font-mono text-primary-400 bg-primary-500/10 border border-primary-700/30 px-1.5 py-0.5 rounded">{u.unit_code}</span>}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${clr}`}>{label}</span>
                    {!u.is_active && <span className="text-[10px] text-slate-600 border border-dark-600 px-1.5 py-0.5 rounded">Inactive</span>}
                  </div>
                  {u.location && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{u.location}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-slate-500 hover:text-primary-400 hover:bg-primary-900/20 transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggleActive(u)} className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'text-slate-500 hover:text-yellow-400' : 'text-slate-600 hover:text-green-400'}`}
                    title={u.is_active ? 'Deactivate' : 'Activate'}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del(u)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
              <p className="text-sm font-bold text-slate-100">{editing ? 'Edit Unit' : 'Add Unit'}</p>
              <button onClick={closeForm} className="text-slate-500 hover:text-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <Field label="Unit Name *">
                <input className={inp()} autoFocus value={form.unit_name} onChange={e => set('unit_name', e.target.value)} placeholder="e.g. Unit 1 — Crusher Plant" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Short Code">
                  <input className={inp('font-mono')} value={form.unit_code} onChange={e => set('unit_code', e.target.value.toUpperCase())} placeholder="U1" maxLength={6} />
                </Field>
                <Field label="Unit Type">
                  <select className={inp()} value={form.unit_type} onChange={e => set('unit_type', e.target.value)}>
                    {UNIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Location / Address">
                <input className={inp()} value={form.location} onChange={e => set('location', e.target.value)} placeholder="Plot No., Area, City" />
              </Field>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={closeForm} className="flex-1 btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 btn-primary flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Unit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 3. USERS TAB ──────────────────────────────────────────────────────────────
function UsersTab({ companyId }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(null) // userId being saved

  const { data: units = [] } = useQuery({
    queryKey: ['company_units', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('company_units').select('id, unit_name, unit_code')
        .eq('company_id', companyId).eq('is_active', true).order('sort_order')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['company_users', companyId],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, phone, unit_id')
          .eq('company_id', companyId).order('full_name'),
        supabase.from('user_roles').select('user_id, role'),
      ])
      const roleMap = Object.fromEntries((roles || []).map(r => [r.user_id, r.role]))
      return (profiles || []).map(p => ({ ...p, role: roleMap[p.id] || 'operator' }))
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => users.filter(u =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
               u.role?.toLowerCase().includes(search.toLowerCase())
  ), [users, search])

  const assignUnit = async (userId, unitId) => {
    setSaving(userId)
    try {
      const { error } = await supabase.from('user_profiles')
        .update({ unit_id: unitId || null }).eq('id', userId)
      if (error) throw error
      qc.invalidateQueries(['company_users', companyId])
      toast.success('Unit assignment updated')
    } catch (e) { toast.error(e.message) }
    finally { setSaving(null) }
  }

  const ALL_UNIT_ROLES = ['admin', 'superadmin', 'accounts', 'hr']

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>

  return (
    <div className="space-y-3">
      {/* Info banner */}
      <div className="bg-primary-500/5 border border-primary-700/30 rounded-xl p-3">
        <p className="text-xs text-primary-300 font-semibold mb-0.5 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Unit Assignment
        </p>
        <p className="text-xs text-slate-400">
          Admin, Accounts and HR roles automatically see all units.
          Assign a unit to restrict Managers, Supervisors and Operators to their unit's data.
          Leave blank for company-wide access.
        </p>
      </div>

      <div className="relative">
        <input className={inp('pl-9')} placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
      </div>

      <div className="space-y-2">
        {filtered.map(u => {
          const isAllAccess = ALL_UNIT_ROLES.includes(u.role)
          const roleClr = ROLE_COLORS[u.role] || ROLE_COLORS.operator
          const assignedUnit = units.find(un => un.id === u.unit_id)
          return (
            <div key={u.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-600/20 flex items-center justify-center text-xs font-bold text-primary-400 shrink-0">
                {u.full_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-100 truncate">{u.full_name || 'Unknown'}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${roleClr}`}>{u.role}</span>
                </div>
              </div>
              <div className="shrink-0">
                {isAllAccess
                  ? <span className="text-[10px] text-slate-500 border border-dark-600 px-2 py-1 rounded-lg">All Units</span>
                  : saving === u.id
                    ? <Loader2 className="w-4 h-4 animate-spin text-primary-400" />
                    : (
                      <select
                        value={u.unit_id || ''}
                        onChange={e => assignUnit(u.id, e.target.value)}
                        className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none focus:border-primary-500 max-w-[160px]"
                      >
                        <option value="">— All Units —</option>
                        {units.map(un => (
                          <option key={un.id} value={un.id}>
                            {un.unit_code ? `[${un.unit_code}] ` : ''}{un.unit_name}
                          </option>
                        ))}
                      </select>
                    )
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 4. BRANDING TAB ───────────────────────────────────────────────────────────
const DEFAULT_COLORS = [
  { hex: '#1a5c2a', label: 'Forest Green (default)' },
  { hex: '#1e40af', label: 'Royal Blue' },
  { hex: '#7c3aed', label: 'Purple' },
  { hex: '#b91c1c', label: 'Deep Red' },
  { hex: '#0f766e', label: 'Teal' },
  { hex: '#92400e', label: 'Brown' },
  { hex: '#1f2937', label: 'Charcoal' },
  { hex: '#0369a1', label: 'Ocean Blue' },
]

function BrandingTab({ companyId, company, onSaved }) {
  const [form, setForm] = useState({
    tagline:          company?.tagline          || '',
    letterhead_color: company?.letterhead_color || '#1a5c2a',
    pdf_footer_text:  company?.pdf_footer_text  || '',
    signature_name:   company?.signature_name   || '',
    signature_title:  company?.signature_title  || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('companies').update({
        tagline:          form.tagline.trim()          || null,
        letterhead_color: form.letterhead_color        || '#1a5c2a',
        pdf_footer_text:  form.pdf_footer_text.trim()  || null,
        signature_name:   form.signature_name.trim()   || null,
        signature_title:  form.signature_title.trim()  || null,
      }).eq('id', companyId)
      if (error) throw error
      toast.success('Branding settings saved')
      onSaved()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <SectionHead label="Letterhead & PDF" />

      <Field label="Company Tagline">
        <input className={inp()} value={form.tagline} onChange={e => set('tagline', e.target.value)}
          placeholder="e.g. Excellence in Construction" />
      </Field>

      <Field label="Letterhead Color">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg border border-dark-600 shrink-0"
              style={{ backgroundColor: form.letterhead_color }} />
            <input className={inp('font-mono flex-1')} value={form.letterhead_color}
              onChange={e => set('letterhead_color', e.target.value)} placeholder="#1a5c2a" maxLength={7} />
          </div>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_COLORS.map(c => (
              <button key={c.hex} onClick={() => set('letterhead_color', c.hex)}
                title={c.label}
                className={`w-7 h-7 rounded-lg border-2 transition-all ${form.letterhead_color === c.hex ? 'border-white scale-110' : 'border-dark-600 hover:border-dark-400'}`}
                style={{ backgroundColor: c.hex }} />
            ))}
          </div>
        </div>
      </Field>

      <Field label="PDF Footer Text">
        <textarea className={inp('resize-none h-14')} value={form.pdf_footer_text}
          onChange={e => set('pdf_footer_text', e.target.value)}
          placeholder="e.g. This is a computer-generated document. For queries contact us at info@company.com" />
      </Field>

      {/* Live preview strip */}
      <div className="rounded-xl overflow-hidden border border-dark-600">
        <div className="py-3 px-4 text-center" style={{ backgroundColor: form.letterhead_color }}>
          <p className="text-white font-bold text-sm">{company?.name || 'Company Name'}</p>
          {form.tagline && <p className="text-white/70 text-[10px] mt-0.5">{form.tagline}</p>}
        </div>
        <div className="bg-dark-800 p-2 text-center">
          <p className="text-[10px] text-slate-500">{form.pdf_footer_text || 'Footer text will appear here'}</p>
        </div>
      </div>

      <SectionHead label="Signature Block" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Authorized Signatory Name">
          <input className={inp()} value={form.signature_name} onChange={e => set('signature_name', e.target.value)}
            placeholder="Full name" />
        </Field>
        <Field label="Designation / Title">
          <input className={inp()} value={form.signature_title} onChange={e => set('signature_title', e.target.value)}
            placeholder="Director / Managing Partner" />
        </Field>
      </div>

      <button onClick={save} disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Branding Settings'}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CompanyProfilePage() {
  const { companyId, company, isAdmin, refreshProfile } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const qc = useQueryClient()

  // Fetch fresh company data (includes new branding columns)
  const { data: companyData, refetch: refetchCompany } = useQuery({
    queryKey: ['company_full', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('*').eq('id', companyId).single()
      return data
    },
    enabled: !!companyId,
    initialData: company,
  })

  const onSaved = () => {
    refetchCompany()
    refreshProfile()
  }

  if (!isAdmin()) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
        <Building2 className="w-12 h-12 opacity-30" />
        <p className="text-sm">Company profile is accessible to admins only.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-dark-700 shrink-0">
        <div className="flex items-center gap-3">
          {companyData?.logo_url
            ? <img src={companyData.logo_url} alt="logo" className="w-10 h-10 rounded-xl object-contain border border-dark-600" />
            : <div className="w-10 h-10 rounded-xl bg-primary-600/20 flex items-center justify-center"><Building2 className="w-5 h-5 text-primary-400" /></div>
          }
          <div>
            <p className="text-base font-black text-slate-100">{companyData?.name || 'Company Profile'}</p>
            <p className="text-xs text-slate-500">Company settings & unit management</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border whitespace-nowrap transition-all ${
                activeTab === t.key
                  ? 'bg-primary-600/20 border-primary-500/50 text-primary-300'
                  : 'bg-dark-800 border-dark-700 text-slate-500 hover:text-slate-300'
              }`}>
              <t.Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === 'profile' && (
          <ProfileTab companyId={companyId} company={companyData} onSaved={onSaved} />
        )}
        {activeTab === 'units' && (
          <UnitsTab companyId={companyId} />
        )}
        {activeTab === 'users' && (
          <UsersTab companyId={companyId} />
        )}
        {activeTab === 'branding' && (
          <BrandingTab companyId={companyId} company={companyData} onSaved={onSaved} />
        )}
      </div>
    </div>
  )
}
