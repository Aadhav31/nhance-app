import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useDisplayMode } from '../../contexts/DisplayModeContext'
import {
  Building2, Plus, Search, Phone, Mail, ChevronRight,
  X, Loader2, CheckCircle, AlertTriangle, Edit2, User,
  BadgeCheck, FileText, MapPin, Shield, Users,
  IndianRupee, Archive, Trash2, Copy, Globe,
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
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), 14000)
  try {
    const res = await fetch(`/api/gstin?gstin=${gstin}`, {
      signal: ctrl.signal, headers: { Accept: 'application/json' }
    })
    if (res.status === 404) return { notFound: true }
    if (res.status === 503) return { unavailable: true }
    if (!res.ok) return { unavailable: true }
    const data = await res.json()
    if (!data?.businessName) return { unavailable: true }
    return {
      businessName:      data.businessName,
      tradeName:         data.tradeName || '',
      gstinStatus:       data.gstinStatus || 'Active',
      registeredAddress: data.address || '',
      city:              data.city || '',
      pincode:           data.pincode || '',
    }
  } catch {
    return { unavailable: true }
  }
}

// ── Lookup constants ──────────────────────────────────────────────────────────
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

const GST_TREATMENT_OPTIONS = [
  'Registered Business - Regular',
  'Registered Business - Composition',
  'Unregistered Business',
  'Consumer',
  'Overseas',
  'Special Economic Zone (SEZ)',
  'Deemed Export',
  'Tax Deductor (TDS)',
  'Tax Collector (TCS)',
]

const CURRENCIES = [
  { code: 'INR', label: 'INR — Indian Rupee (₹)' },
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'JPY', label: 'JPY — Japanese Yen (¥)' },
  { code: 'CNY', label: 'CNY — Chinese Yuan' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'SAR', label: 'SAR — Saudi Riyal' },
]

const COUNTRY_CODES = [
  { code: '+91',  label: '+91  India' },
  { code: '+1',   label: '+1   USA / Canada' },
  { code: '+44',  label: '+44  UK' },
  { code: '+971', label: '+971 UAE' },
  { code: '+65',  label: '+65  Singapore' },
  { code: '+60',  label: '+60  Malaysia' },
  { code: '+61',  label: '+61  Australia' },
  { code: '+49',  label: '+49  Germany' },
  { code: '+33',  label: '+33  France' },
  { code: '+81',  label: '+81  Japan' },
  { code: '+86',  label: '+86  China' },
  { code: '+966', label: '+966 Saudi Arabia' },
  { code: '+880', label: '+880 Bangladesh' },
  { code: '+94',  label: '+94  Sri Lanka' },
  { code: '+92',  label: '+92  Pakistan' },
]

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

// ── Phone Input with country code dropdown ────────────────────────────────────
function PhoneInput({ codeValue, onCodeChange, phoneValue, onPhoneChange, placeholder, required }) {
  return (
    <div className="flex">
      <select
        value={codeValue || '+91'}
        onChange={e => onCodeChange(e.target.value)}
        className="bg-dark-700 border border-r-0 border-dark-600 rounded-l-lg text-xs text-slate-300 px-2 focus:outline-none focus:border-primary-500 shrink-0"
        style={{ minWidth: '72px' }}
      >
        {COUNTRY_CODES.map(c => (
          <option key={c.code} value={c.code}>{c.code}</option>
        ))}
      </select>
      <input
        className={`${inp()} rounded-l-none border-l-0 flex-1`}
        value={phoneValue || ''}
        onChange={e => onPhoneChange(e.target.value.replace(/\D/g, '').slice(0, 15))}
        placeholder={placeholder || 'Phone number'}
        maxLength={15}
        required={required}
      />
    </div>
  )
}

// ── GSTIN Verifier Component ──────────────────────────────────────────────────
function GSTINVerifier({ value, onChange, onVerified }) {
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState(null)
  const [apiResult, setApiResult] = useState(null)

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
      if (data?.businessName) {
        setResult(data)
        setApiResult('success')
        onVerified({
          gstin:             validation.gstin,
          gstinStatus:       data.gstinStatus,
          gstinVerified:     true,
          gstinVerifiedAt:   new Date().toISOString(),
          businessName:      data.businessName,
          tradeName:         data.tradeName,
          pan:               validation.pan,
          state:             validation.state,
          registeredAddress: data.registeredAddress,
          city:              data.city,
          pincode:           data.pincode,
        })
        toast.success('GSTIN verified — details auto-filled from GST portal')
      } else if (data?.notFound) {
        setApiResult('notfound')
        onVerified({ gstin: validation.gstin, gstinVerified: false, pan: validation.pan, state: validation.state })
        toast.error('GSTIN not registered in GST portal')
      } else {
        setApiResult('unavailable')
        onVerified({ gstin: validation.gstin, gstinStatus: 'Unverified', gstinVerified: false, pan: validation.pan, state: validation.state })
        toast('GST portal unavailable — enter business details manually', { icon: '⚠️' })
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
          {verifying
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</>
            : <><Shield className="w-3.5 h-3.5" /> Verify</>}
        </button>
      </div>

      {value && !validation.valid && validation.error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {validation.error}
        </p>
      )}

      {validation.valid && apiResult === null && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Valid format
          </span>
          <span className="text-slate-400">State: <strong className="text-slate-200">{validation.state}</strong></span>
          <span className="text-slate-400">PAN: <strong className="text-slate-200 font-mono">{validation.pan}</strong></span>
          <span className="text-slate-400">Entity: <strong className="text-slate-200">{validation.entityType}</strong></span>
        </div>
      )}

      {apiResult === 'success' && result && (
        <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 text-xs space-y-1">
          <p className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <BadgeCheck className="w-3.5 h-3.5" /> Verified from GST Portal
            <span className="text-emerald-500 font-normal">· {result.gstinStatus}</span>
          </p>
          <p className="text-slate-300">
            {result.businessName}
            {result.tradeName && result.tradeName !== result.businessName ? ` (${result.tradeName})` : ''}
          </p>
          {result.registeredAddress && <p className="text-slate-400">{result.registeredAddress}</p>}
        </div>
      )}

      {apiResult === 'notfound' && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-xs">
          <p className="text-red-400 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" /> GSTIN not found in GST portal
          </p>
          <p className="text-slate-400 mt-1">Double-check the number. If recently registered, the portal may take a few days to update.</p>
        </div>
      )}

      {apiResult === 'unavailable' && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 text-xs">
          <p className="text-yellow-400 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" /> GST portal auto-fill unavailable
          </p>
          <p className="text-slate-400 mt-1">
            GSTIN format is valid — state, PAN and entity type extracted above. Enter business name and address manually below.
          </p>
          <div className="flex flex-wrap gap-x-4 mt-1.5 text-xs text-slate-400">
            <span>State: <strong className="text-slate-200">{validation.state}</strong></span>
            <span>PAN: <strong className="text-slate-200 font-mono">{validation.pan}</strong></span>
            <span>Entity: <strong className="text-slate-200">{validation.entityType}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteConfirmModal({ client, companyId, onClose, onDeleted }) {
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState('')

  const handleDelete = async () => {
    if (confirm !== client.business_name) {
      toast.error('Business name does not match')
      return
    }
    setDeleting(true)
    try {
      const { error } = await supabase.from('clients').delete().eq('id', client.id)
      if (error) throw error
      toast.success('Client permanently deleted')
      qc.invalidateQueries(['clients', companyId])
      onDeleted()
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-sm bg-dark-800 rounded-xl border border-red-800/60 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Delete Client Permanently</h3>
            <p className="text-xs text-slate-500">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Type <strong className="text-slate-200">{client.business_name}</strong> to confirm.
        </p>
        <input
          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-red-500"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder={client.business_name}
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-slate-300 text-sm hover:bg-dark-600 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || confirm !== client.business_name}
            className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
            {deleting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
              : <><Trash2 className="w-4 h-4" /> Delete</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Form default ──────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    client_number: '',
    business_name: '', trade_name: '', business_type: '',
    gst_treatment: '', tax_preference: 'tax_payer', currency: 'INR',
    gstin: '', gstin_status: '', gstin_verified: false, gstin_verified_at: null,
    pan: '', udyam_number: '', cin: '', tan: '',
    // Billing address
    registered_address: '', city: '', state: '', pincode: '',
    // Shipping address
    shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '',
    shipping_same_as_billing: true,
    // Contacts
    contact_country_code: '+91',
    contact_name: '', contact_designation: '', contact_phone: '', contact_email: '',
    contact2_country_code: '+91',
    contact2_name: '', contact2_designation: '', contact2_phone: '', contact2_email: '',
    // Terms
    payment_terms: '', credit_limit: '', notes: '',
  }
}

// ── Add / Edit Client Modal ───────────────────────────────────────────────────
function AddEditClientModal({ companyId, client, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!client
  const { isAdvanced } = useDisplayMode()

  const [form, setForm] = useState(isEdit ? {
    client_number: client.client_number || '',
    business_name: client.business_name || '',
    trade_name: client.trade_name || '',
    business_type: client.business_type || '',
    gst_treatment: client.gst_treatment || '',
    tax_preference: client.tax_preference || 'tax_payer',
    currency: client.currency || 'INR',
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
    shipping_address: client.shipping_address || '',
    shipping_city: client.shipping_city || '',
    shipping_state: client.shipping_state || '',
    shipping_pincode: client.shipping_pincode || '',
    shipping_same_as_billing: client.shipping_same_as_billing !== false,
    contact_country_code: client.contact_country_code || '+91',
    contact_name: client.contact_name || '',
    contact_designation: client.contact_designation || '',
    contact_phone: client.contact_phone || '',
    contact_email: client.contact_email || '',
    contact2_country_code: client.contact2_country_code || '+91',
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

  // Auto-generate client number for new clients
  useQuery({
    queryKey: ['client_count_for_number', companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
      const num = count || 0
      setForm(p => ({ ...p, client_number: p.client_number || `CLI-${String(num + 1).padStart(4, '0')}` }))
      return num
    },
    enabled: !isEdit && !!companyId,
  })

  // After GSTIN verification, auto-fill form and set country code to +91 (Indian GSTIN)
  const handleGSTINVerified = (data) => {
    setForm(p => ({
      ...p,
      gstin: data.gstin || p.gstin,
      gstin_status: data.gstinStatus || '',
      gstin_verified: data.gstinVerified || false,
      gstin_verified_at: data.gstinVerifiedAt || null,
      pan: data.pan || p.pan,
      state: data.state || p.state,
      contact_country_code: '+91',  // GSTIN implies Indian entity
      ...(data.businessName       ? { business_name:       data.businessName }       : {}),
      ...(data.tradeName          ? { trade_name:          data.tradeName }           : {}),
      ...(data.registeredAddress  ? { registered_address:  data.registeredAddress }  : {}),
      ...(data.city               ? { city:                data.city }               : {}),
      ...(data.pincode            ? { pincode:             data.pincode }             : {}),
    }))
  }

  // Copy billing → shipping
  const copiBillingToShipping = () => {
    setForm(p => ({
      ...p,
      shipping_address:  p.registered_address,
      shipping_city:     p.city,
      shipping_state:    p.state,
      shipping_pincode:  p.pincode,
      shipping_same_as_billing: true,
    }))
  }

  const handleSave = async () => {
    if (!form.business_name.trim()) { toast.error('Business name is required'); return }
    if (!form.contact_phone.trim()) { toast.error('Primary contact phone is required'); return }

    // Phone validation — strict for +91, lenient for others
    const phone = form.contact_phone.replace(/\s/g, '')
    if (form.contact_country_code === '+91' && phone && !/^[6-9]\d{9}$/.test(phone)) {
      toast.error('Enter a valid 10-digit Indian mobile number'); return
    } else if (form.contact_country_code !== '+91' && phone && phone.length < 5) {
      toast.error('Enter a valid phone number'); return
    }

    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      toast.error('Enter a valid email address'); return
    }

    setSaving(true)
    try {
      // ── Duplicate check on GSTIN or PAN ───────────────────────────────────
      const gstin = form.gstin?.trim()
      const pan   = form.pan?.trim()
      if (gstin || pan) {
        let q = supabase
          .from('clients')
          .select('id, business_name, client_number')
          .eq('company_id', companyId)
          .neq('is_active', false)

        if (gstin && pan) q = q.or(`gstin.eq.${gstin},pan.eq.${pan}`)
        else if (gstin)   q = q.eq('gstin', gstin)
        else              q = q.eq('pan', pan)

        const { data: matches } = await q
        const others = (matches || []).filter(c => c.id !== client?.id)
        if (others.length > 0) {
          const dup = others[0]
          toast.error(`Client already exists: ${dup.business_name}${dup.client_number ? ` (${dup.client_number})` : ''}`, { duration: 5000 })
          setSaving(false)
          return
        }
      }

      const payload = {
        company_id:      companyId,
        client_number:   form.client_number || null,
        business_name:   form.business_name.trim(),
        trade_name:      form.trade_name || null,
        business_type:   form.business_type || null,
        gst_treatment:   form.gst_treatment || null,
        tax_preference:  form.tax_preference || 'tax_payer',
        currency:        form.currency || 'INR',
        gstin:           gstin || null,
        gstin_status:    form.gstin_status || null,
        gstin_verified:  form.gstin_verified,
        gstin_verified_at: form.gstin_verified_at || null,
        pan:             pan || null,
        udyam_number:    form.udyam_number || null,
        cin:             form.cin || null,
        tan:             form.tan || null,
        registered_address: form.registered_address || null,
        city:            form.city || null,
        state:           form.state || null,
        pincode:         form.pincode || null,
        shipping_address:  form.shipping_same_as_billing ? null : (form.shipping_address || null),
        shipping_city:     form.shipping_same_as_billing ? null : (form.shipping_city || null),
        shipping_state:    form.shipping_same_as_billing ? null : (form.shipping_state || null),
        shipping_pincode:  form.shipping_same_as_billing ? null : (form.shipping_pincode || null),
        shipping_same_as_billing: form.shipping_same_as_billing,
        contact_country_code:  form.contact_country_code || '+91',
        contact_name:          form.contact_name || null,
        contact_designation:   form.contact_designation || null,
        contact_phone:         form.contact_phone || null,
        contact_email:         form.contact_email || null,
        contact2_country_code: form.contact2_country_code || '+91',
        contact2_name:         form.contact2_name || null,
        contact2_designation:  form.contact2_designation || null,
        contact2_phone:        form.contact2_phone || null,
        contact2_email:        form.contact2_email || null,
        payment_terms:   form.payment_terms || null,
        credit_limit:    form.credit_limit ? Number(form.credit_limit) : null,
        notes:           form.notes || null,
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
      {/* ── Section 1: GST Verification ───────────────────────────────────── */}
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

        {/* Client number — read-only badge */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Client ID:</span>
          <span className="font-mono font-semibold text-primary-400 bg-primary-900/20 px-2 py-0.5 rounded border border-primary-800/30">
            {form.client_number || 'Auto-generating…'}
          </span>
          <span className="text-slate-600">(auto-assigned, series)</span>
        </div>

        <Field label="Legal / Registered Business Name" required>
          <input className={inp()} value={form.business_name}
            onChange={e => set('business_name', e.target.value)}
            placeholder="As per GSTIN / Certificate of Incorporation" />
        </Field>

        {isAdvanced && (
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
        )}

        {/* GST Treatment */}
        <Field label="GST Treatment">
          <select className={inp()} value={form.gst_treatment} onChange={e => set('gst_treatment', e.target.value)}>
            <option value="">Select GST Treatment…</option>
            {GST_TREATMENT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>

        {/* Tax Preference + Currency side by side */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tax Preference">
            <div className="flex rounded-lg overflow-hidden border border-dark-600 h-[42px]">
              <button type="button"
                onClick={() => set('tax_preference', 'tax_payer')}
                className={`flex-1 text-xs font-medium transition-all ${form.tax_preference === 'tax_payer' ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 hover:text-slate-200'}`}>
                Tax Payer
              </button>
              <button type="button"
                onClick={() => set('tax_preference', 'non_tax_payer')}
                className={`flex-1 text-xs font-medium transition-all border-l border-dark-600 ${form.tax_preference === 'non_tax_payer' ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 hover:text-slate-200'}`}>
                Non-Tax Payer
              </button>
            </div>
          </Field>
          <Field label="Currency">
            <select className={inp()} value={form.currency} onChange={e => set('currency', e.target.value)}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* ── Section 3: Government Registration (Advanced) ─────────────────── */}
      {isAdvanced && (
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
            <Field label="CIN (Company Identification No.)">
              <input className={inp('font-mono')} value={form.cin}
                onChange={e => set('cin', e.target.value.toUpperCase())}
                placeholder="U12345KA2018PTC123456" />
            </Field>
            <Field label="TAN (Tax Deduction Account No.)">
              <input className={inp('font-mono')} value={form.tan}
                onChange={e => set('tan', e.target.value.toUpperCase())}
                placeholder="MUMB12345F" maxLength={10} />
            </Field>
          </div>
        </div>
      )}

      {/* ── Section 4: Address ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={MapPin} label={isAdvanced ? 'Address' : 'Location'} />

        {/* Basic — just city + state */}
        {!isAdvanced && (
          <div className="grid grid-cols-2 gap-3">
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
          </div>
        )}

        {/* Advanced — two-column Billing | Shipping */}
        {isAdvanced && (
          <div className="grid grid-cols-2 gap-5">
            {/* Billing Address */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 inline-block" />
                Billing Address
              </p>
              <Field label="Address" hint="Auto-filled from GST portal">
                <textarea className={inp()} rows={2} value={form.registered_address}
                  onChange={e => set('registered_address', e.target.value)}
                  placeholder="Door No., Street, Area, Landmark" />
              </Field>
              <Field label="City">
                <input className={inp()} value={form.city}
                  onChange={e => set('city', e.target.value)} placeholder="City" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="State">
                  <select className={inp()} value={form.state} onChange={e => set('state', e.target.value)}>
                    <option value="">Select…</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Pincode">
                  <input className={inp()} value={form.pincode}
                    onChange={e => set('pincode', e.target.value)}
                    placeholder="600001" maxLength={6} />
                </Field>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
                  Shipping Address
                </p>
                <button
                  type="button"
                  onClick={copiBillingToShipping}
                  className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                  <Copy className="w-3 h-3" /> Same as Billing
                </button>
              </div>
              <Field label="Address">
                <textarea className={inp()} rows={2} value={form.shipping_address}
                  onChange={e => { set('shipping_address', e.target.value); set('shipping_same_as_billing', false) }}
                  placeholder="Door No., Street, Area, Landmark" />
              </Field>
              <Field label="City">
                <input className={inp()} value={form.shipping_city}
                  onChange={e => { set('shipping_city', e.target.value); set('shipping_same_as_billing', false) }}
                  placeholder="City" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="State">
                  <select className={inp()} value={form.shipping_state}
                    onChange={e => { set('shipping_state', e.target.value); set('shipping_same_as_billing', false) }}>
                    <option value="">Select…</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Pincode">
                  <input className={inp()} value={form.shipping_pincode}
                    onChange={e => { set('shipping_pincode', e.target.value); set('shipping_same_as_billing', false) }}
                    placeholder="600001" maxLength={6} />
                </Field>
              </div>
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
          <Field label="Mobile Number" required>
            <PhoneInput
              codeValue={form.contact_country_code}
              onCodeChange={v => set('contact_country_code', v)}
              phoneValue={form.contact_phone}
              onPhoneChange={v => set('contact_phone', v)}
              placeholder="98765 43210"
            />
          </Field>
        </div>
        {isAdvanced && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Designation">
              <input className={inp()} value={form.contact_designation}
                onChange={e => set('contact_designation', e.target.value)}
                placeholder="MD, CEO, Manager…" />
            </Field>
            <Field label="Email ID">
              <input type="email" className={inp()} value={form.contact_email}
                onChange={e => set('contact_email', e.target.value)}
                placeholder="name@company.com" />
            </Field>
          </div>
        )}
      </div>

      {/* ── Section 6: Secondary Contact (Advanced) ──────────────────────── */}
      {isAdvanced && (
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
              <PhoneInput
                codeValue={form.contact2_country_code}
                onCodeChange={v => set('contact2_country_code', v)}
                phoneValue={form.contact2_phone}
                onPhoneChange={v => set('contact2_phone', v)}
                placeholder="98765 43210"
              />
            </Field>
            <Field label="Email ID">
              <input type="email" className={inp()} value={form.contact2_email}
                onChange={e => set('contact2_email', e.target.value)}
                placeholder="name@company.com" />
            </Field>
          </div>
        </div>
      )}

      {/* ── Section 7: Business Terms (Advanced) ─────────────────────────── */}
      {isAdvanced && (
        <div className="space-y-3">
          <SectionHeader icon={IndianRupee} label="Business Terms" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment Terms">
              <select className={inp()} value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)}>
                <option value="">Select…</option>
                {PAYMENT_TERMS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Credit Limit" hint="Leave blank for no limit">
              <div className="flex">
                <span className="flex items-center px-3 bg-dark-600 border border-r-0 border-dark-600 rounded-l-lg text-sm text-slate-400">
                  {form.currency === 'INR' ? '₹' : form.currency}
                </span>
                <input type="number" className={`${inp()} rounded-l-none border-l-0`}
                  value={form.credit_limit}
                  onChange={e => set('credit_limit', e.target.value)}
                  placeholder="e.g. 500000" />
              </div>
            </Field>
          </div>
          <Field label="Notes / Remarks">
            <textarea className={inp()} rows={2} value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Any special terms, project notes, or remarks…" />
          </Field>
        </div>
      )}
    </Modal>
  )
}

// ── Client Detail Modal ───────────────────────────────────────────────────────
function ClientDetail({ client, companyId, onClose, onEdit }) {
  const qc = useQueryClient()
  const { isAdvanced } = useDisplayMode()
  const [archiving, setArchiving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

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

  // Render the contact phone with its country code
  const fmtPhone = (code, phone) => {
    if (!phone) return null
    const c = (code && code !== '+91') ? code : '+91'
    return `${c} ${phone}`
  }

  const hasShipping = !client.shipping_same_as_billing && (
    client.shipping_address || client.shipping_city || client.shipping_state
  )

  return (
    <>
      <Modal title={client.business_name} subtitle={client.trade_name || client.business_type || undefined} onClose={onClose} wide
        footer={
          <>
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-red-400 text-sm hover:border-red-600 hover:bg-red-900/20 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button onClick={handleArchive} disabled={archiving}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-slate-400 text-sm hover:border-slate-500 hover:text-slate-200 transition-colors">
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
            <button onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors">
              <Edit2 className="w-3.5 h-3.5" /> Edit Client
            </button>
          </>
        }
      >
        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          {client.client_number && (
            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-dark-700 text-primary-400 border border-primary-800/40">
              {client.client_number}
            </span>
          )}
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
          {client.gst_treatment && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-dark-700 text-slate-400 border border-dark-600">
              {client.gst_treatment}
            </span>
          )}
          {client.tax_preference === 'non_tax_payer' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-900/20 text-yellow-400 border border-yellow-700/30">
              Non-Tax Payer
            </span>
          )}
          {client.currency && client.currency !== 'INR' && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-dark-700 text-slate-400 border border-dark-600 flex items-center gap-1">
              <Globe className="w-3 h-3" /> {client.currency}
            </span>
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

        {/* Government IDs — Advanced only */}
        {isAdvanced && (client.gstin || client.pan || client.udyam_number || client.cin || client.tan) && (
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
        {(client.registered_address || client.city || client.state) && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {isAdvanced ? 'Address' : 'Location'}
            </p>
            {isAdvanced ? (
              <div className="grid grid-cols-2 gap-3">
                {/* Billing */}
                <div className="bg-dark-700 rounded-xl px-3 py-2.5 space-y-0.5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Billing</p>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      {client.registered_address && <p className="text-xs text-slate-200">{client.registered_address}</p>}
                      <p className="text-xs text-slate-300">
                        {[client.city, client.state, client.pincode].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Shipping */}
                <div className="bg-dark-700 rounded-xl px-3 py-2.5 space-y-0.5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Shipping {client.shipping_same_as_billing !== false && !hasShipping && <span className="text-slate-600 font-normal">(same as billing)</span>}
                  </p>
                  {hasShipping ? (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                      <div>
                        {client.shipping_address && <p className="text-xs text-slate-200">{client.shipping_address}</p>}
                        <p className="text-xs text-slate-300">
                          {[client.shipping_city, client.shipping_state, client.shipping_pincode].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      {[client.city, client.state, client.pincode].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-dark-700 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-300">
                  {[client.city, client.state].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
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
                {isAdvanced && client.contact_designation && (
                  <span className="text-xs text-slate-500">{client.contact_designation}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {client.contact_phone && (
                  <a href={`tel:${fmtPhone(client.contact_country_code, client.contact_phone)}`}
                    className="flex items-center gap-1.5 text-primary-400 hover:text-primary-300">
                    <Phone className="w-3.5 h-3.5" /> {fmtPhone(client.contact_country_code, client.contact_phone)}
                  </a>
                )}
                {isAdvanced && client.contact_email && (
                  <a href={`mailto:${client.contact_email}`} className="flex items-center gap-1.5 text-primary-400 hover:text-primary-300">
                    <Mail className="w-3.5 h-3.5" /> {client.contact_email}
                  </a>
                )}
              </div>
            </div>
            {/* Secondary — Advanced only */}
            {isAdvanced && (client.contact2_name || client.contact2_phone) && (
              <div className="bg-dark-700 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-300">{client.contact2_name || 'Secondary Contact'}</p>
                  {client.contact2_designation && <span className="text-xs text-slate-500">{client.contact2_designation}</span>}
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {client.contact2_phone && (
                    <a href={`tel:${fmtPhone(client.contact2_country_code, client.contact2_phone)}`}
                      className="flex items-center gap-1.5 text-primary-400 hover:text-primary-300">
                      <Phone className="w-3.5 h-3.5" /> {fmtPhone(client.contact2_country_code, client.contact2_phone)}
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

        {isAdvanced && client.notes && (
          <div className="bg-dark-700 rounded-xl p-3 text-xs text-slate-400">
            <p className="font-semibold text-slate-300 mb-1">Notes</p>
            <p>{client.notes}</p>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      {showDelete && (
        <DeleteConfirmModal
          client={client}
          companyId={companyId}
          onClose={() => setShowDelete(false)}
          onDeleted={onClose}
        />
      )}
    </>
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
          {client.client_number && (
            <p className="text-[11px] font-mono text-primary-500">{client.client_number}</p>
          )}
          {client.trade_name && client.trade_name !== client.business_name && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{client.trade_name}</p>
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
              <Phone className="w-3 h-3" />
              {client.contact_country_code && client.contact_country_code !== '+91'
                ? `${client.contact_country_code} ${client.contact_phone}`
                : client.contact_phone}
            </span>
          )}
          {client.gst_treatment && (
            <span className="text-xs text-slate-600">{client.gst_treatment.split(' ').slice(0, 2).join(' ')}</span>
          )}
        </div>
        {client.currency && client.currency !== 'INR' && (
          <span className="text-xs font-medium text-slate-500">{client.currency}</span>
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
      c.client_number?.toLowerCase().includes(q) ||
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
            placeholder="Search by name, GSTIN, CLT-ID, phone, city…"
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
