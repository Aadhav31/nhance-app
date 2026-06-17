import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Building2, Plus, Search, Phone, Mail, ChevronRight,
  X, Loader2, CheckCircle, AlertTriangle, Edit2, User,
  BadgeCheck, FileText, MapPin, CreditCard, Shield, Users,
  Briefcase, IndianRupee, Archive
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── GSTIN helpers ─────────────────────────────────────────────────────────────
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

const GSTIN_STATES = {
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','25':'Daman & Diu','26':'Dadra & Nagar Haveli & D&D',
  '27':'Maharashtra','28':'Andhra Pradesh (Old)','29':'Karnataka','30':'Goa',
  '31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry',
  '35':'Andaman & Nicobar','36':'Telangana','37':'Andhra Pradesh','38':'Ladakh',
  '97':'Other Territory','99':'Centre Jurisdiction',
}

const PAN_ENTITY = {
  P:'Individual / Proprietor', C:'Private / Public Ltd Company', H:'Hindu Undivided Family (HUF)',
  F:'Partnership Firm', A:'Association of Persons (AOP)', T:'Trust / NGO',
  B:'Body of Individuals (BOI)', L:'Local Authority', J:'Artificial Juridical Person', G:'Government',
}

function validateGSTIN(g) {
  const upper = (g || '').toUpperCase().trim()
  if (!upper) return { valid: false, error: null }
  if (upper.length !== 15) return { valid: false, error: `Must be 15 characters (you entered ${upper.length})` }
  if (!GSTIN_REGEX.test(upper)) return { valid: false, error: 'Invalid GSTIN format' }
  return {
    valid: true,
    gstin: upper,
    stateCode: upper.slice(0, 2),
    state: GSTIN_STATES[upper.slice(0, 2)] || `State ${upper.slice(0, 2)}`,
    pan: upper.slice(2, 12),
    entityType: PAN_ENTITY[upper.charAt(5)] || 'Entity',
  }
}

async function fetchGSTINDetails(gstin) {
  // Calls Vercel serverless proxy (/api/gstin) to avoid CORS
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(`/api/gstin?gstin=${gstin}`, {
      signal: ctrl.signal, headers: { Accept: 'application/json' }
    })
    if (res.status === 404) {
      // API reached but GSTIN not found in records
      return { notFound: true }
    }
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.businessName) return null
    return {
      businessName:      data.businessName,
      tradeName:         data.tradeName || '',
      gstinStatus:       data.gstinStatus || 'Active',
      registeredAddress: data.address || '',
      city:              data.city || '',
      pincode:           data.pincode || '',
      registrationDate:  data.registrationDate || '',
    }
  } catch {
    return null // network/timeout — user enters manually
  }
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
      <div className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} bg-dark-800 rounded-t-2xl sm:rounded-xl border border-dark-600 flex flex-col max-h-[94vh]`}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-dark-700">
          <div>
            <h2 className="font-semibold text-slate-100 text-base">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100 mt-0.5"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
        {footer && <div className="flex gap-3 p-4 border-t border-dark-700">{footer}</div>}
      </div>
    </div>
  )
}

function Field({ label, required, hint, children }) {
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

const inp = (extra = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${extra}`

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-dark-700">
      <Icon className="w-4 h-4 text-primary-400" />
      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</span>
    </div>
  )
}

// ── GSTIN Verifier Component ──────────────────────────────────────────────────
function GSTINVerifier({ value, onChange, onVerified }) {
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState(null)
  const [apiResult, setApiResult] = useState(null) // null=not tried, true=success, false=failed

  const validation = validateGSTIN(value)

  const handleChange = (v) => {
    onChange(v.toUpperCase())
    setResult(null)
    setApiResult(null)
  }

  const handleVerify = async () => {
    if (!validation.valid) return
    setVerifying(true)
    setApiResult(null)
    try {
      const data = await fetchGSTINDetails(validation.gstin)
      if (data && !data.notFound) {
        setResult(data)
        setApiResult(true)
        onVerified({
          gstin: validation.gstin,
          gstinStatus: data.gstinStatus,
          gstinVerified: true,
          gstinVerifiedAt: new Date().toISOString(),
          businessName: data.businessName,
          tradeName: data.tradeName,
          pan: validation.pan,
          state: validation.state,
          registeredAddress: data.registeredAddress,
          city: data.city,
          pincode: data.pincode,
        })
        toast.success('GSTIN verified — details auto-filled from GST portal')
      } else if (data?.notFound) {
        setApiResult('notfound')
        onVerified({ gstin: validation.gstin, gstinVerified: false, pan: validation.pan, state: validation.state })
        toast.error('GSTIN not found in GST records — check the number is correct and active')
      } else {
        setApiResult(false)
        onVerified({ gstin: validation.gstin, gstinStatus: 'Unverified', gstinVerified: false, pan: validation.pan, state: validation.state })
        toast('Format valid — GST portal unreachable. Fill details manually.', { icon: '⚠️' })
      }
    } finally { setVerifying(false) }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className={inp(`font-mono pr-8 ${
              value && !validation.valid ? 'border-red-500 focus:border-red-500' :
              validation.valid ? 'border-emerald-600 focus:border-emerald-500' : ''
            }`)}
            value={value}
            onChange={e => handleChange(e.target.value)}
            placeholder="e.g. 33AABCU9603R1ZX"
            maxLength={15}
          />
          {validation.valid && (
            <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
          )}
        </div>
        <button
          type="button" onClick={handleVerify}
          disabled={!validation.valid || verifying}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium disabled:opacity-40 transition-colors shrink-0">
          {verifying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</> : <><Shield className="w-3.5 h-3.5" /> Verify</>}
        </button>
      </div>

      {/* Validation feedback */}
      {value && !validation.valid && validation.error && (
        <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {validation.error}</p>
      )}
      {validation.valid && apiResult === null && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Valid GSTIN format</span>
          <span className="text-slate-400">State: <strong className="text-slate-200">{validation.state}</strong></span>
          <span className="text-slate-400">PAN extracted: <strong className="text-slate-200 font-mono">{validation.pan}</strong></span>
          <span className="text-slate-400">Entity: <strong className="text-slate-200">{validation.entityType}</strong></span>
        </div>
      )}
      {apiResult === true && result && (
        <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 text-xs space-y-1">
          <p className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <BadgeCheck className="w-3.5 h-3.5" /> Verified from GST Portal
            <span className="text-emerald-500 font-normal">· Status: {result.gstinStatus}</span>
          </p>
          <p className="text-slate-300">{result.businessName} {result.tradeName && result.tradeName !== result.businessName ? `(${result.tradeName})` : ''}</p>
          {result.registeredAddress && <p className="text-slate-400">{result.registeredAddress}</p>}
        </div>
      )}
      {apiResult === 'notfound' && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> GSTIN not found in GST records — please verify the number is correct and currently active
        </p>
      )}
      {apiResult === false && (
        <p className="text-xs text-yellow-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Could not reach GST portal — please enter business name and address manually
        </p>
      )}
    </div>
  )
}

// ── Add / Edit Client Modal ───────────────────────────────────────────────────
const BUSINESS_TYPES = [
  'Sole Proprietorship', 'Partnership Firm', 'Private Limited Company',
  'Public Limited Company', 'Limited Liability Partnership (LLP)',
  'One Person Company (OPC)', 'Hindu Undivided Family (HUF)',
  'Trust / Society / NGO', 'Government / PSU', 'Other',
]

const PAYMENT_TERMS_OPTIONS = [
  'Advance (100%)', '50% Advance + 50% on Completion',
  'Net 7 Days', 'Net 15 Days', 'Net 30 Days', 'Net 45 Days', 'Net 60 Days',
  'Net 90 Days', 'Monthly', 'As per Purchase Order',
]

const INDIAN_STATES = [
  'Andaman & Nicobar', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra & Nagar Haveli & D&D', 'Daman & Diu',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

function emptyForm() {
  return {
    business_name: '', trade_name: '', business_type: '',
    gstin: '', gstin_status: '', gstin_verified: false, gstin_verified_at: null,
    pan: '', udyam_number: '', cin: '', tan: '',
    registered_address: '', city: '', state: '', pincode: '',
    billing_address: '', billing_city: '', billing_state: '', billing_pincode: '',
    same_as_registered: true,
    contact_name: '', contact_designation: '', contact_phone: '', contact_email: '',
    contact2_name: '', contact2_designation: '', contact2_phone: '', contact2_email: '',
    payment_terms: '', credit_limit: '', notes: '',
  }
}

function AddEditClientModal({ companyId, client, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(client ? {
    business_name: client.business_name || '',
    trade_name: client.trade_name || '',
    business_type: client.business_type || '',
    gstin: client.gstin || '',
    gstin_status: client.gstin_status || '',
    gstin_verified: client.gstin_verified || false,
    gstin_verified_at: client.gstin_verified_at || null,
    pan: client.pan || '',
    udyam_number: client.udyam_number || '',
    cin: client.cin || '',
    tan: client.tan || '',
    registered_address: client.registered_address || '',
    city: client.city || '',
    state: client.state || '',
    pincode: client.pincode || '',
    billing_address: client.billing_address || '',
    billing_city: client.billing_city || '',
    billing_state: client.billing_state || '',
    billing_pincode: client.billing_pincode || '',
    same_as_registered: client.same_as_registered !== false,
    contact_name: client.contact_name || '',
    contact_designation: client.contact_designation || '',
    contact_phone: client.contact_phone || '',
    contact_email: client.contact_email || '',
    contact2_name: client.contact2_name || '',
    contact2_designation: client.contact2_designation || '',
    contact2_phone: client.contact2_phone || '',
    contact2_email: client.contact2_email || '',
    payment_terms: client.payment_terms || '',
    credit_limit: client.credit_limit || '',
    notes: client.notes || '',
  } : emptyForm())
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const isEdit = !!client

  const handleGSTINVerified = (data) => {
    setForm(p => ({
      ...p,
      gstin: data.gstin || p.gstin,
      gstin_status: data.gstinStatus || '',
      gstin_verified: data.gstinVerified || false,
      gstin_verified_at: data.gstinVerifiedAt || null,
      pan: data.pan || p.pan,
      state: data.state || p.state,
      ...(data.businessName  ? { business_name: data.businessName }  : {}),
      ...(data.tradeName     ? { trade_name:    data.tradeName }      : {}),
      ...(data.registeredAddress ? { registered_address: data.registeredAddress } : {}),
      ...(data.city    ? { city: data.city }    : {}),
      ...(data.pincode ? { pincode: data.pincode } : {}),
    }))
  }

  const handleSave = async () => {
    if (!form.business_name.trim()) { toast.error('Business name is required'); return }
    if (!form.contact_phone.trim()) { toast.error('Primary contact phone is required'); return }

    // Validate phone
    const phone = form.contact_phone.replace(/\s/g, '')
    if (phone && !/^[6-9]\d{9}$/.test(phone)) { toast.error('Enter a valid 10-digit mobile number'); return }

    // Validate email if provided
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      toast.error('Enter a valid email address'); return
    }

    setSaving(true)
    try {
      const payload = {
        company_id: companyId,
        business_name: form.business_name.trim(),
        trade_name: form.trade_name || null,
        business_type: form.business_type || null,
        gstin: form.gstin || null,
        gstin_status: form.gstin_status || null,
        gstin_verified: form.gstin_verified,
        gstin_verified_at: form.gstin_verified_at || null,
        pan: form.pan || null,
        udyam_number: form.udyam_number || null,
        cin: form.cin || null,
        tan: form.tan || null,
        registered_address: form.registered_address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        billing_address: form.same_as_registered ? null : (form.billing_address || null),
        billing_city: form.same_as_registered ? null : (form.billing_city || null),
        billing_state: form.same_as_registered ? null : (form.billing_state || null),
        billing_pincode: form.same_as_registered ? null : (form.billing_pincode || null),
        same_as_registered: form.same_as_registered,
        contact_name: form.contact_name || null,
        contact_designation: form.contact_designation || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        contact2_name: form.contact2_name || null,
        contact2_designation: form.contact2_designation || null,
        contact2_phone: form.contact2_phone || null,
        contact2_email: form.contact2_email || null,
        payment_terms: form.payment_terms || null,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        notes: form.notes || null,
      }

      let error
      if (isEdit) {
        ;({ error } = await supabase.from('clients').update(payload).eq('id', client.id))
      } else {
        ;({ error } = await supabase.from('clients').insert(payload))
      }
      if (error) throw error

      toast.success(isEdit ? 'Client updated' : 'Client added')
      qc.invalidateQueries(['clients', companyId])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save client')
    } finally { setSaving(false) }
  }

  return (
    <Modal
      title={isEdit ? `Edit — ${client.business_name}` : 'Add New Client'}
      subtitle={isEdit ? undefined : 'Enter GSTIN first to auto-fill business details'}
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-slate-300 text-sm hover:bg-dark-600 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : isEdit ? 'Save Changes' : 'Add Client'}
          </button>
        </>
      }
    >
      {/* ── Section 1: GST Verification ──────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Shield} label="GST Verification" />
        <Field label="GSTIN (15-digit GST Number)"
          hint="Enter GSTIN and click Verify to auto-fill business name, address and PAN from the GST portal">
          <GSTINVerifier
            value={form.gstin}
            onChange={v => set('gstin', v)}
            onVerified={handleGSTINVerified}
          />
        </Field>
      </div>

      {/* ── Section 2: Business Details ───────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Building2} label="Business Details" />
        <Field label="Legal / Registered Business Name" required>
          <input className={inp()} value={form.business_name}
            onChange={e => set('business_name', e.target.value)}
            placeholder="As per GSTIN / Certificate of Incorporation" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trade Name / Brand Name">
            <input className={inp()} value={form.trade_name}
              onChange={e => set('trade_name', e.target.value)}
              placeholder="If different from legal name" />
          </Field>
          <Field label="Business Type">
            <select className={inp()} value={form.business_type} onChange={e => set('business_type', e.target.value)}>
              <option value="">Select…</option>
              {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* ── Section 3: Government Identifiers ────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={FileText} label="Government Registration Details" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="PAN" hint="Auto-filled from GSTIN">
            <input className={inp('font-mono')} value={form.pan}
              onChange={e => set('pan', e.target.value.toUpperCase())}
              placeholder="AABCU9603R" maxLength={10} />
          </Field>
          <Field label="Udyam / MSME Registration No.">
            <input className={inp('font-mono')} value={form.udyam_number}
              onChange={e => set('udyam_number', e.target.value.toUpperCase())}
              placeholder="UDYAM-XX-00-0000000" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CIN (Company ID — for Pvt/Pub Ltd)">
            <input className={inp('font-mono')} value={form.cin}
              onChange={e => set('cin', e.target.value.toUpperCase())}
              placeholder="U12345KA2018PTC123456" />
          </Field>
          <Field label="TAN (Tax Deduction Account)">
            <input className={inp('font-mono')} value={form.tan}
              onChange={e => set('tan', e.target.value.toUpperCase())}
              placeholder="MUMB12345F" maxLength={10} />
          </Field>
        </div>
      </div>

      {/* ── Section 4: Registered Address ─────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={MapPin} label="Registered Address" />
        <Field label="Address" hint="Auto-filled from GST portal on verification">
          <textarea className={inp()} rows={2} value={form.registered_address}
            onChange={e => set('registered_address', e.target.value)}
            placeholder="Door No., Street, Area, Landmark" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="City">
            <input className={inp()} value={form.city}
              onChange={e => set('city', e.target.value)} placeholder="City" />
          </Field>
          <Field label="State">
            <select className={inp()} value={form.state} onChange={e => set('state', e.target.value)}>
              <option value="">Select…</option>
              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Pincode">
            <input className={inp()} value={form.pincode}
              onChange={e => set('pincode', e.target.value)} placeholder="600001" maxLength={6} />
          </Field>
        </div>

        {/* Billing address toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.same_as_registered}
            onChange={e => set('same_as_registered', e.target.checked)}
            className="w-4 h-4 rounded accent-primary-500" />
          <span className="text-xs text-slate-400">Billing address same as registered address</span>
        </label>

        {!form.same_as_registered && (
          <div className="space-y-3 pl-3 border-l-2 border-dark-600">
            <p className="text-xs text-slate-500">Billing Address</p>
            <Field label="Billing Address">
              <textarea className={inp()} rows={2} value={form.billing_address}
                onChange={e => set('billing_address', e.target.value)}
                placeholder="Door No., Street, Area" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City">
                <input className={inp()} value={form.billing_city} onChange={e => set('billing_city', e.target.value)} />
              </Field>
              <Field label="State">
                <select className={inp()} value={form.billing_state} onChange={e => set('billing_state', e.target.value)}>
                  <option value="">Select…</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Pincode">
                <input className={inp()} value={form.billing_pincode} onChange={e => set('billing_pincode', e.target.value)} maxLength={6} />
              </Field>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 5: Primary Contact ────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={User} label="Primary Contact Person" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name">
            <input className={inp()} value={form.contact_name}
              onChange={e => set('contact_name', e.target.value)} placeholder="Name" />
          </Field>
          <Field label="Designation">
            <input className={inp()} value={form.contact_designation}
              onChange={e => set('contact_designation', e.target.value)}
              placeholder="MD, CEO, Manager…" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile Number" required>
            <div className="flex">
              <span className="flex items-center px-3 bg-dark-600 border border-r-0 border-dark-600 rounded-l-lg text-sm text-slate-400">+91</span>
              <input className={`${inp()} rounded-l-none border-l-0`} value={form.contact_phone}
                onChange={e => set('contact_phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210" maxLength={10} />
            </div>
          </Field>
          <Field label="Email ID">
            <input type="email" className={inp()} value={form.contact_email}
              onChange={e => set('contact_email', e.target.value)}
              placeholder="name@company.com" />
          </Field>
        </div>
      </div>

      {/* ── Section 6: Secondary Contact ─────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Users} label="Secondary Contact Person (Optional)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name">
            <input className={inp()} value={form.contact2_name}
              onChange={e => set('contact2_name', e.target.value)} placeholder="Name" />
          </Field>
          <Field label="Designation">
            <input className={inp()} value={form.contact2_designation}
              onChange={e => set('contact2_designation', e.target.value)}
              placeholder="Site Engineer, GM…" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile Number">
            <div className="flex">
              <span className="flex items-center px-3 bg-dark-600 border border-r-0 border-dark-600 rounded-l-lg text-sm text-slate-400">+91</span>
              <input className={`${inp()} rounded-l-none border-l-0`} value={form.contact2_phone}
                onChange={e => set('contact2_phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210" maxLength={10} />
            </div>
          </Field>
          <Field label="Email ID">
            <input type="email" className={inp()} value={form.contact2_email}
              onChange={e => set('contact2_email', e.target.value)}
              placeholder="name@company.com" />
          </Field>
        </div>
      </div>

      {/* ── Section 7: Business Terms ─────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={IndianRupee} label="Business Terms" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment Terms">
            <select className={inp()} value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)}>
              <option value="">Select…</option>
              {PAYMENT_TERMS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Credit Limit (₹)" hint="Leave blank for no limit">
            <div className="flex">
              <span className="flex items-center px-3 bg-dark-600 border border-r-0 border-dark-600 rounded-l-lg text-sm text-slate-400">₹</span>
              <input type="number" className={`${inp()} rounded-l-none border-l-0`}
                value={form.credit_limit}
                onChange={e => set('credit_limit', e.target.value)}
                placeholder="e.g. 5,00,000" />
            </div>
          </Field>
        </div>
        <Field label="Notes / Remarks">
          <textarea className={inp()} rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any special terms, project notes, or remarks…" />
        </Field>
      </div>
    </Modal>
  )
}

// ── Client Detail Modal ───────────────────────────────────────────────────────
function ClientDetail({ client, companyId, onClose, onEdit }) {
  const qc = useQueryClient()
  const [archiving, setArchiving] = useState(false)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects_for_client_detail', client.id],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, status, start_date')
        .eq('client_id', client.id).order('created_at', { ascending: false })
      return data || []
    },
  })

  const { data: equipmentCount } = useQuery({
    queryKey: ['equipment_count_for_client', client.id],
    queryFn: async () => {
      const { count } = await supabase.from('equipment').select('id', { count: 'exact', head: true })
        .eq('current_client_id', client.id)
      return count || 0
    },
  })

  const handleArchive = async () => {
    setArchiving(true)
    try {
      await supabase.from('clients').update({ is_active: false }).eq('id', client.id)
      toast.success('Client archived')
      qc.invalidateQueries(['clients', companyId])
      onClose()
    } catch { toast.error('Failed to archive') } finally { setArchiving(false) }
  }

  const InfoRow = ({ icon: Icon, label, value }) => value ? (
    <div className="flex items-start gap-2.5 py-2 border-b border-dark-700/50 last:border-0">
      <Icon className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-200 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  ) : null

  return (
    <Modal title={client.business_name} subtitle={client.trade_name || client.business_type || undefined} onClose={onClose} wide
      footer={
        <>
          <button onClick={handleArchive} disabled={archiving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-slate-400 text-sm hover:border-red-500 hover:text-red-400 transition-colors">
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors">
            <Edit2 className="w-3.5 h-3.5" /> Edit Client
          </button>
        </>
      }
    >
      {/* Status + quick stats */}
      <div className="flex flex-wrap gap-2">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
          client.is_active
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30'
            : 'bg-dark-600 text-slate-400 border-dark-500'
        }`}>{client.is_active ? 'Active' : 'Archived'}</span>
        {client.gstin_verified && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-blue-500/10 text-blue-400 border-blue-600/30 flex items-center gap-1">
            <BadgeCheck className="w-3 h-3" /> GST Verified
          </span>
        )}
        {client.business_type && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-dark-700 text-slate-400 border border-dark-600">{client.business_type}</span>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-dark-700 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-slate-100">{projects.length}</p>
          <p className="text-xs text-slate-400">Projects</p>
        </div>
        <div className="bg-dark-700 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-slate-100">{equipmentCount ?? '—'}</p>
          <p className="text-xs text-slate-400">Equipment On Site</p>
        </div>
        <div className="bg-dark-700 rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-slate-100 truncate">{client.payment_terms || '—'}</p>
          <p className="text-xs text-slate-400">Payment Terms</p>
        </div>
      </div>

      {/* Government IDs */}
      {(client.gstin || client.pan || client.udyam_number || client.cin) && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Registration Details</p>
          <div className="bg-dark-700 rounded-xl px-3 divide-y divide-dark-600">
            {client.gstin && (
              <div className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">GSTIN</p>
                  <p className="font-mono text-sm text-slate-200">{client.gstin}</p>
                </div>
                <div className="text-right">
                  {client.gstin_status && <p className="text-xs text-slate-400">{client.gstin_status}</p>}
                  {client.gstin_verified && <p className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5"><BadgeCheck className="w-3 h-3" />Verified</p>}
                </div>
              </div>
            )}
            {client.pan && <div className="py-2.5"><p className="text-[10px] text-slate-500 uppercase">PAN</p><p className="font-mono text-sm text-slate-200">{client.pan}</p></div>}
            {client.udyam_number && <div className="py-2.5"><p className="text-[10px] text-slate-500 uppercase">MSME / Udyam</p><p className="font-mono text-sm text-slate-200">{client.udyam_number}</p></div>}
            {client.cin && <div className="py-2.5"><p className="text-[10px] text-slate-500 uppercase">CIN</p><p className="font-mono text-sm text-slate-200">{client.cin}</p></div>}
            {client.tan && <div className="py-2.5"><p className="text-[10px] text-slate-500 uppercase">TAN</p><p className="font-mono text-sm text-slate-200">{client.tan}</p></div>}
          </div>
        </div>
      )}

      {/* Address */}
      {(client.registered_address || client.city) && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Registered Address</p>
          <div className="bg-dark-700 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <div>
              {client.registered_address && <p className="text-sm text-slate-200">{client.registered_address}</p>}
              <p className="text-sm text-slate-300">
                {[client.city, client.state, client.pincode].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Contacts */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Contact Persons</p>
        <div className="space-y-2">
          {/* Primary */}
          <div className="bg-dark-700 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-300">{client.contact_name || 'Primary Contact'}</p>
              {client.contact_designation && <span className="text-xs text-slate-500">{client.contact_designation}</span>}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {client.contact_phone && (
                <a href={`tel:+91${client.contact_phone}`} className="flex items-center gap-1.5 text-primary-400 hover:text-primary-300">
                  <Phone className="w-3.5 h-3.5" /> +91 {client.contact_phone}
                </a>
              )}
              {client.contact_email && (
                <a href={`mailto:${client.contact_email}`} className="flex items-center gap-1.5 text-primary-400 hover:text-primary-300">
                  <Mail className="w-3.5 h-3.5" /> {client.contact_email}
                </a>
              )}
            </div>
          </div>
          {/* Secondary */}
          {(client.contact2_name || client.contact2_phone) && (
            <div className="bg-dark-700 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-300">{client.contact2_name || 'Secondary Contact'}</p>
                {client.contact2_designation && <span className="text-xs text-slate-500">{client.contact2_designation}</span>}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {client.contact2_phone && (
                  <a href={`tel:+91${client.contact2_phone}`} className="flex items-center gap-1.5 text-primary-400 hover:text-primary-300">
                    <Phone className="w-3.5 h-3.5" /> +91 {client.contact2_phone}
                  </a>
                )}
                {client.contact2_email && (
                  <a href={`mailto:${client.contact2_email}`} className="flex items-center gap-1.5 text-primary-400 hover:text-primary-300">
                    <Mail className="w-3.5 h-3.5" /> {client.contact2_email}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Projects</p>
          <div className="space-y-1.5">
            {projects.map(p => (
              <div key={p.id} className="bg-dark-700 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200 font-medium">{p.name}</p>
                  {p.start_date && <p className="text-xs text-slate-500">Since {p.start_date}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  p.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                  p.status === 'completed' ? 'bg-blue-500/10 text-blue-400' : 'bg-dark-600 text-slate-400'
                }`}>{p.status || 'active'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {client.notes && (
        <div className="bg-dark-700 rounded-xl p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-300 mb-1">Notes</p>
          <p>{client.notes}</p>
        </div>
      )}
    </Modal>
  )
}

// ── Client Card ───────────────────────────────────────────────────────────────
function ClientCard({ client, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-left bg-dark-800 border border-dark-700 hover:border-dark-500 rounded-xl p-4 transition-all active:scale-[0.98]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-semibold text-slate-100 text-sm truncate">{client.business_name}</p>
            {client.gstin_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
          </div>
          {client.trade_name && client.trade_name !== client.business_name && (
            <p className="text-xs text-slate-500 truncate">{client.trade_name}</p>
          )}
          {client.business_type && (
            <p className="text-xs text-slate-600 mt-0.5">{client.business_type}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 mt-1" />
      </div>

      {(client.city || client.state) && (
        <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
          <MapPin className="w-3 h-3" />
          <span>{[client.city, client.state].filter(Boolean).join(', ')}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {client.contact_phone && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Phone className="w-3 h-3" /> {client.contact_phone}
            </span>
          )}
          {client.gstin && (
            <span className="text-xs font-mono text-slate-600">{client.gstin.slice(0, 8)}…</span>
          )}
        </div>
        {client.payment_terms && (
          <span className="text-xs text-slate-500">{client.payment_terms.split(' ')[0] === 'Advance' ? 'Advance' : client.payment_terms.replace('As per Purchase Order', 'PO-based')}</span>
        )}
      </div>
    </button>
  )
}

// ── Main Clients Page ─────────────────────────────────────────────────────────
export default function ClientsPage() {
  const { companyId } = useAuth()
  const [showAdd, setShowAdd]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing]   = useState(null)
  const [search, setSearch]     = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients')
        .select('*').eq('company_id', companyId)
        .order('business_name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      c.business_name?.toLowerCase().includes(q) ||
      c.trade_name?.toLowerCase().includes(q) ||
      c.gstin?.toLowerCase().includes(q) ||
      c.contact_phone?.includes(q) ||
      c.contact_name?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q)
    const matchStatus = showArchived ? !c.is_active : c.is_active !== false
    return matchSearch && matchStatus
  })

  const activeCount   = clients.filter(c => c.is_active !== false).length
  const archivedCount = clients.filter(c => c.is_active === false).length
  const verifiedCount = clients.filter(c => c.gstin_verified).length

  return (
    <div className="relative flex flex-col h-full bg-dark-900">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-slate-100">Clients</h1>
            <p className="text-xs text-slate-500">
              {activeCount} active{verifiedCount > 0 ? ` · ${verifiedCount} GST verified` : ''}
              {archivedCount > 0 ? ` · ${archivedCount} archived` : ''}
            </p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="w-full bg-dark-700 border border-dark-600 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
            placeholder="Search by name, GSTIN, phone, city…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Tabs */}
        {archivedCount > 0 && (
          <div className="flex gap-1 mt-2">
            <button onClick={() => setShowArchived(false)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${!showArchived ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              Active ({activeCount})
            </button>
            <button onClick={() => setShowArchived(true)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${showArchived ? 'bg-dark-700 text-slate-200' : 'text-slate-400 hover:text-slate-200'}`}>
              Archived ({archivedCount})
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-slate-600" />
            </div>
            <div>
              <p className="text-slate-300 font-semibold">
                {clients.length === 0 ? 'No clients yet' : 'No clients match your search'}
              </p>
              <p className="text-slate-500 text-sm mt-1">
                {clients.length === 0 ? 'Add your first client to get started' : 'Try a different search term'}
              </p>
            </div>
            {clients.length === 0 && (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add First Client
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(c => (
              <ClientCard key={c.id} client={c} onClick={() => setSelected(c)} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddEditClientModal companyId={companyId} onClose={() => setShowAdd(false)} />
      )}
      {selected && !editing && (
        <ClientDetail
          client={selected} companyId={companyId}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null) }}
        />
      )}
      {editing && (
        <AddEditClientModal
          companyId={companyId} client={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
