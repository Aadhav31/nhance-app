import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useDisplayMode } from '../../contexts/DisplayModeContext'
import {
  Building2, Plus, Search, Phone, Mail, ChevronRight,
  X, Loader2, CheckCircle, AlertTriangle, Edit2, User,
  BadgeCheck, FileText, MapPin, Shield, Users,
  IndianRupee, Archive, Trash2, Copy, Globe, AlertCircle,
  UserCheck, Briefcase,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── GSTIN helpers ─────────────────────────────────────────────────────────────
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_REGEX   = /^[A-Z]{5}[0-9]{4}[A-Z]$/

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
  P:'Individual / Proprietor', C:'Private / Public Ltd Company',
  H:'Hindu Undivided Family (HUF)', F:'Partnership Firm',
  A:'Association of Persons (AOP)', T:'Trust / NGO',
  B:'Body of Individuals (BOI)', L:'Local Authority',
  J:'Artificial Juridical Person', G:'Government',
}

function validateGSTIN(g) {
  const upper = (g || '').toUpperCase().trim()
  if (!upper) return { valid: false, error: null }
  if (upper.length !== 15) return { valid: false, error: `Must be 15 characters (you entered ${upper.length})` }
  if (!GSTIN_REGEX.test(upper)) return { valid: false, error: 'Invalid GSTIN format' }
  return {
    valid: true, gstin: upper,
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
      businessName: data.businessName, tradeName: data.tradeName || '',
      gstinStatus: data.gstinStatus || 'Active',
      registeredAddress: data.address || '',
      city: data.city || '', pincode: data.pincode || '',
    }
  } catch { return { unavailable: true } }
}

// ── Lookup constants ──────────────────────────────────────────────────────────
// Contact person salutations — used for both business contact and individual
const SALUTATIONS_CONTACT    = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Er.']
const SALUTATIONS_INDIVIDUAL = SALUTATIONS_CONTACT  // alias for clarity

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

// These treatments require a GSTIN for verification
const GSTIN_TREATMENTS = new Set([
  'Registered Business - Regular',
  'Registered Business - Composition',
  'Special Economic Zone (SEZ)',
  'Deemed Export',
  'Tax Deductor (TDS)',
  'Tax Collector (TCS)',
])

const BUSINESS_TYPES = [
  'Sole Proprietorship', 'Partnership Firm', 'Private Limited Company',
  'Public Limited Company', 'Limited Liability Partnership (LLP)',
  'One Person Company (OPC)', 'Hindu Undivided Family (HUF)',
  'Trust / Society / NGO', 'Government / PSU', 'Other',
]

const PAYMENT_TERMS_OPTIONS = [
  'Advance (100%)', '50% Advance + 50% on Completion',
  'Net 7 Days', 'Net 15 Days', 'Net 30 Days', 'Net 45 Days',
  'Net 60 Days', 'Net 90 Days', 'Monthly', 'As per Purchase Order',
]

const INDIAN_STATES = [
  'Andaman & Nicobar','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar',
  'Chandigarh','Chhattisgarh','Dadra & Nagar Haveli & D&D','Daman & Diu',
  'Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir',
  'Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha',
  'Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
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
      <div className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} bg-dark-800 rounded-t-2xl sm:rounded-xl border border-dark-600 flex flex-col max-h-[94vh]`}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-dark-700">
          <div>
            <h2 className="font-semibold text-slate-100 text-base">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100 mt-0.5">
            <X className="w-5 h-5" />
          </button>
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

function PhoneInput({ codeValue, onCodeChange, phoneValue, onPhoneChange, placeholder }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-dark-600 focus-within:border-primary-500 bg-dark-700">
      <select
        value={codeValue || '+91'}
        onChange={e => onCodeChange(e.target.value)}
        className="bg-dark-700 text-sm text-slate-300 pl-2 pr-1 py-2.5 focus:outline-none shrink-0 border-r border-dark-600"
        style={{ width: '78px' }}
      >
        {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
      </select>
      <input
        className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-100 focus:outline-none placeholder-slate-500 min-w-0"
        value={phoneValue || ''}
        onChange={e => onPhoneChange(e.target.value.replace(/\D/g, '').slice(0, 15))}
        placeholder={placeholder || 'Phone number'}
        maxLength={15}
      />
    </div>
  )
}

// ── Duplicate warning banner ───────────────────────────────────────────────────
function DupWarning({ info }) {
  if (!info) return null
  return (
    <div className="flex items-start gap-2.5 bg-red-900/25 border border-red-700/50 rounded-lg p-3 text-xs">
      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-red-300 font-semibold">
          {info.field} already registered — client profile exists
        </p>
        <p className="text-slate-400 mt-0.5">
          <span className="font-medium text-slate-200">{info.name}</span>
          {info.num ? ` · ${info.num}` : ''}
          {info.archived ? ' (archived)' : ' (active)'}
        </p>
        <p className="text-slate-500 mt-1">Remove the existing profile or use a different {info.field} to proceed.</p>
      </div>
    </div>
  )
}

// ── GSTIN Verifier ────────────────────────────────────────────────────────────
function GSTINVerifier({ value, onChange, onVerified, onDuplicateFound, companyId, existingClientId }) {
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState(null)
  const [apiResult, setApiResult] = useState(null)
  const [dupInfo, setDupInfo] = useState(null)
  const validation = validateGSTIN(value)

  const handleChange = (v) => {
    onChange(v.toUpperCase())
    setResult(null); setApiResult(null)
    if (dupInfo) { setDupInfo(null); onDuplicateFound?.(false) }
  }

  const handleVerify = async () => {
    if (!validation.valid) return
    setVerifying(true); setApiResult(null); setDupInfo(null); onDuplicateFound?.(false)
    try {
      // ── 1. Duplicate check first (case-insensitive) ────────────────────────
      if (companyId) {
        const { data: matches } = await supabase
          .from('clients')
          .select('id, business_name, display_name, client_number, is_active')
          .eq('company_id', companyId)
          .ilike('gstin', validation.gstin)   // ilike = case-insensitive match
        const others = (matches || []).filter(c => c.id !== existingClientId)
        if (others.length > 0) {
          const dup = others[0]
          const info = {
            name: dup.display_name || dup.business_name || 'Unknown',
            num: dup.client_number,
            archived: dup.is_active === false,
          }
          setDupInfo(info)
          onDuplicateFound?.(true)
          setVerifying(false)
          return
        }
      }

      // ── 2. No duplicate — proceed with GST portal lookup ─────────────────────
      const data = await fetchGSTINDetails(validation.gstin)
      if (data?.businessName) {
        setResult(data); setApiResult('success')
        onVerified({
          gstin: validation.gstin, gstinStatus: data.gstinStatus,
          gstinVerified: true, gstinVerifiedAt: new Date().toISOString(),
          businessName: data.businessName, tradeName: data.tradeName,
          pan: validation.pan, state: validation.state,
          registeredAddress: data.registeredAddress,
          city: data.city, pincode: data.pincode,
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
              dupInfo ? 'border-red-500 focus:border-red-500' :
              validation.valid ? 'border-emerald-600 focus:border-emerald-500' : ''
            }`)}
            value={value} onChange={e => handleChange(e.target.value)}
            placeholder="e.g. 33AABCU9603R1ZX" maxLength={15}
          />
          {validation.valid && !dupInfo && <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />}
          {dupInfo && <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />}
        </div>
        <button type="button" onClick={handleVerify}
          disabled={!validation.valid || verifying}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium disabled:opacity-40 transition-colors shrink-0">
          {verifying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</> : <><Shield className="w-3.5 h-3.5" /> Verify</>}
        </button>
      </div>

      {/* Duplicate found during verify — shown right here, not elsewhere */}
      {dupInfo && (
        <div className="flex items-start gap-2.5 bg-red-900/25 border border-red-600/50 rounded-lg p-3 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-semibold">This GSTIN is already registered in your account</p>
            <p className="text-slate-300 mt-0.5 font-medium">
              {dupInfo.name}{dupInfo.num ? ` · ${dupInfo.num}` : ''}
              <span className={`ml-1.5 text-xs font-normal ${dupInfo.archived ? 'text-slate-500' : 'text-emerald-400'}`}>
                ({dupInfo.archived ? 'archived' : 'active'})
              </span>
            </p>
            <p className="text-slate-500 mt-1">Edit the existing client instead of adding a new one.</p>
          </div>
        </div>
      )}

      {value && !validation.valid && validation.error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {validation.error}
        </p>
      )}

      {validation.valid && apiResult === null && !dupInfo && (
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
            <BadgeCheck className="w-3.5 h-3.5" /> Verified from GST Portal · {result.gstinStatus}
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
          <p className="text-slate-400 mt-1">Double-check the number. Recently registered GSTINs may take a few days to appear.</p>
        </div>
      )}

      {apiResult === 'unavailable' && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 text-xs">
          <p className="text-yellow-400 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" /> GST portal auto-fill unavailable
          </p>
          <p className="text-slate-400 mt-1">
            GSTIN format is valid — state, PAN and entity type extracted. Enter business name and address manually.
          </p>
          <div className="flex flex-wrap gap-x-4 mt-1.5 text-xs text-slate-400">
            <span>State: <strong className="text-slate-200">{validation.state}</strong></span>
            <span>PAN: <strong className="text-slate-200 font-mono">{validation.pan}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteConfirmModal({ client, companyId, onClose, onDeleted }) {
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState('')

  const handleDelete = async () => {
    if (confirm !== client.business_name && confirm !== (client.display_name || '')) {
      toast.error('Name does not match'); return
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

  const nameToType = client.display_name || client.business_name || ''

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
        <p className="text-xs text-slate-400">Type <strong className="text-slate-200">{nameToType}</strong> to confirm.</p>
        <input
          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-red-500"
          value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={nameToType}
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-slate-300 text-sm hover:bg-dark-600">Cancel</button>
          <button onClick={handleDelete}
            disabled={deleting || (confirm !== nameToType)}
            className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2">
            {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</> : <><Trash2 className="w-4 h-4" /> Delete</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Empty form ────────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    // Type & identity
    client_type: 'business',
    salutation: 'Mr.',
    first_name: '', last_name: '', display_name: '',
    // Client number (auto-generated)
    client_number: '',
    // GST info
    gst_treatment: '', tax_preference: 'tax_payer', currency: 'INR',
    // GSTIN
    gstin: '', gstin_status: '', gstin_verified: false, gstin_verified_at: null,
    // Business details
    business_name: '', trade_name: '', business_type: '',
    // Other IDs
    pan: '', udyam_number: '', cin: '', tan: '',
    // Billing address
    registered_address: '', city: '', state: '', pincode: '',
    // Shipping address
    shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '',
    shipping_same_as_billing: true,
    // Primary contact
    contact_country_code: '+91',
    contact_name: '', contact_designation: '', contact_phone: '', contact_email: '',
    // Secondary contact
    contact2_country_code: '+91',
    contact2_name: '', contact2_designation: '', contact2_phone: '', contact2_email: '',
    // Terms
    payment_terms: '', credit_limit: '', notes: '',
  }
}

// ── Display Name Field with suggestions ──────────────────────────────────────
function DisplayNameField({ value, onChange, salutation, firstName, lastName, businessName, clientType }) {
  const [open, setOpen] = useState(false)

  // Build suggestion list from the current name fields
  const suggestions = []
  const f = (firstName || '').trim()
  const l = (lastName || '').trim()
  const s = (salutation || '').trim()
  const b = (businessName || '').trim()

  if (f && l) {
    if (s) suggestions.push(`${s} ${f} ${l}`)   // Mr. John Smith
    suggestions.push(`${f} ${l}`)                // John Smith
  }
  if (f) {
    if (s && !suggestions.some(x => x === `${s} ${f}`)) suggestions.push(`${s} ${f}`) // Mr. John
    if (!suggestions.some(x => x === f)) suggestions.push(f)                           // John
  }
  if (b && clientType === 'business') {
    if (!suggestions.includes(b)) suggestions.push(b)                                  // ABC Pvt Ltd
  }

  const handleSelect = (v) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div className="relative">
      <Field label="Display Name" hint="Name shown on invoices & documents">
        <div className="relative">
          <input
            className={inp('pr-8')}
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="How this client appears in documents"
          />
          {suggestions.length > 0 && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : 'rotate-0'}`} />
            </button>
          )}
        </div>
        {open && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-dark-700 border border-dark-500 rounded-lg shadow-xl overflow-hidden">
            <p className="text-[10px] text-slate-500 px-3 pt-2 pb-1 uppercase tracking-wider">Suggestions</p>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={() => handleSelect(s)}
                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-dark-600 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </Field>
    </div>
  )
}

// ── Add / Edit Client Modal ───────────────────────────────────────────────────
function AddEditClientModal({ companyId, client, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!client
  const { isAdvanced } = useDisplayMode()

  const [form, setForm] = useState(isEdit ? {
    client_type: client.client_type || 'business',
    salutation: client.salutation || 'Mr.',
    first_name: client.first_name || '',
    last_name: client.last_name || '',
    display_name: client.display_name || '',
    client_number: client.client_number || '',
    gst_treatment: client.gst_treatment || '',
    tax_preference: client.tax_preference || 'tax_payer',
    currency: client.currency || 'INR',
    gstin: client.gstin || '',
    gstin_status: client.gstin_status || '',
    gstin_verified: client.gstin_verified || false,
    gstin_verified_at: client.gstin_verified_at || null,
    business_name: client.business_name || '',
    trade_name: client.trade_name || '',
    business_type: client.business_type || '',
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
  // gstinDup: duplicate found during GSTIN verify (blocks save)
  const [gstinDup, setGstinDup] = useState(false)
  // panDup: duplicate found for PAN field
  const [panDupInfo, setPanDupInfo] = useState(null)
  const [checkingPan, setCheckingPan] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Derived flags
  const needsGSTIN = GSTIN_TREATMENTS.has(form.gst_treatment)
  const needsPAN   = form.gst_treatment === 'Unregistered Business'
  const noTaxID    = form.gst_treatment === 'Consumer' || form.gst_treatment === 'Overseas'

  // Contact person salutations — always person titles regardless of client type
  const salutations = SALUTATIONS_CONTACT

  // Switch client type — reset relevant fields, keep salutation (always a person title)
  const switchType = (type) => {
    setForm(p => ({
      ...p,
      client_type: type,
      salutation: p.salutation && SALUTATIONS_CONTACT.includes(p.salutation) ? p.salutation : 'Mr.',
      gstin: '', gstin_status: '', gstin_verified: false, gstin_verified_at: null,
      gst_treatment: '',
    }))
    setGstinDup(false); setPanDupInfo(null)
  }

  // Auto-generate client number
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

  // Auto-build display_name for individuals
  useEffect(() => {
    if (form.client_type === 'individual') {
      const auto = [form.salutation, form.first_name, form.last_name].filter(Boolean).join(' ')
      if (auto) setForm(p => ({ ...p, display_name: auto }))
    }
  }, [form.salutation, form.first_name, form.last_name, form.client_type])

  // PAN duplicate check — runs when PAN field reaches valid format
  useEffect(() => {
    if (!needsPAN) { setPanDupInfo(null); return }
    const pan = (form.pan || '').toUpperCase().trim()
    if (pan.length !== 10 || !PAN_REGEX.test(pan)) { setPanDupInfo(null); return }
    let cancelled = false
    setCheckingPan(true)
    supabase
      .from('clients')
      .select('id, business_name, display_name, client_number, is_active')
      .eq('company_id', companyId)
      .ilike('pan', pan)   // case-insensitive match
      .then(({ data }) => {
        if (cancelled) return
        const others = (data || []).filter(c => c.id !== client?.id)
        if (others.length > 0) {
          const dup = others[0]
          setPanDupInfo({
            name: dup.display_name || dup.business_name || 'Unknown',
            num: dup.client_number,
            archived: dup.is_active === false,
          })
        } else { setPanDupInfo(null) }
        setCheckingPan(false)
      })
    return () => { cancelled = true }
  }, [form.pan, needsPAN, companyId, client?.id])

  // When GST treatment changes, clear identification fields
  const handleTreatmentChange = (treatment) => {
    setGstinDup(false); setPanDupInfo(null)
    setForm(p => ({
      ...p,
      gst_treatment: treatment,
      ...(!GSTIN_TREATMENTS.has(treatment) ? { gstin: '', gstin_status: '', gstin_verified: false, gstin_verified_at: null } : {}),
      ...(treatment !== 'Unregistered Business' ? { pan: '' } : {}),
    }))
  }

  const handleGSTINVerified = (data) => {
    setForm(p => ({
      ...p,
      gstin: data.gstin || p.gstin,
      gstin_status: data.gstinStatus || '',
      gstin_verified: data.gstinVerified || false,
      gstin_verified_at: data.gstinVerifiedAt || null,
      pan: data.pan || p.pan,
      state: data.state || p.state,
      contact_country_code: '+91',
      ...(data.businessName      ? { business_name:      data.businessName }      : {}),
      ...(data.tradeName         ? { trade_name:         data.tradeName }          : {}),
      ...(data.registeredAddress ? { registered_address: data.registeredAddress } : {}),
      ...(data.city              ? { city:               data.city }              : {}),
      ...(data.pincode           ? { pincode:            data.pincode }           : {}),
    }))
  }

  const copyBillingToShipping = () => {
    setForm(p => ({
      ...p,
      shipping_address: p.registered_address,
      shipping_city: p.city,
      shipping_state: p.state,
      shipping_pincode: p.pincode,
      shipping_same_as_billing: true,
    }))
  }

  const handleSave = async () => {
    if (!form.first_name.trim() && !form.display_name.trim()) {
      toast.error('Enter at least a first name or display name'); return
    }
    if (!form.contact_phone.trim()) {
      toast.error('Primary contact phone is required'); return
    }

    // Phone validation
    const phone = form.contact_phone.replace(/\s/g, '')
    if (form.contact_country_code === '+91' && phone && !/^[6-9]\d{9}$/.test(phone)) {
      toast.error('Enter a valid 10-digit Indian mobile number'); return
    }
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      toast.error('Enter a valid email address'); return
    }

    setSaving(true)
    try {
      // ── Final duplicate check (catches edge cases not caught inline) ────────
      const gstin = form.gstin?.trim()
      const pan   = form.pan?.trim()
      if (gstin || pan) {
        let q = supabase
          .from('clients')
          .select('id, business_name, display_name, client_number')
          .eq('company_id', companyId)

        if (gstin && pan) q = q.or(`gstin.eq.${gstin},pan.eq.${pan}`)
        else if (gstin)   q = q.eq('gstin', gstin)
        else              q = q.eq('pan', pan)

        const { data: matches } = await q
        const others = (matches || []).filter(c => c.id !== client?.id)
        if (others.length > 0) {
          const dup = others[0]
          toast.error(
            `Client already exists: ${dup.display_name || dup.business_name}${dup.client_number ? ` (${dup.client_number})` : ''}`,
            { duration: 6000 }
          )
          setSaving(false)
          return
        }
      }

      // Build display_name
      const displayName = form.display_name ||
        (form.client_type === 'individual'
          ? [form.salutation, form.first_name, form.last_name].filter(Boolean).join(' ')
          : form.business_name || [form.first_name, form.last_name].filter(Boolean).join(' '))

      // contact_name for backward compat
      const contactName = [form.first_name, form.last_name].filter(Boolean).join(' ') || form.contact_name || null

      const payload = {
        company_id:      companyId,
        client_type:     form.client_type,
        salutation:      form.salutation || null,
        first_name:      form.first_name || null,
        last_name:       form.last_name || null,
        display_name:    displayName || null,
        client_number:   form.client_number || null,
        gst_treatment:   form.gst_treatment || null,
        tax_preference:  form.tax_preference || 'tax_payer',
        currency:        form.currency || 'INR',
        gstin:           gstin || null,
        gstin_status:    form.gstin_status || null,
        gstin_verified:  form.gstin_verified,
        gstin_verified_at: form.gstin_verified_at || null,
        business_name:   form.business_name || displayName || null,
        trade_name:      form.trade_name || null,
        business_type:   form.business_type || null,
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
        contact_name:          contactName,
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
      title={isEdit ? `Edit — ${client.display_name || client.business_name}` : 'Add New Client'}
      subtitle={isEdit ? undefined : 'Fill in the details step by step'}
      onClose={onClose} wide
      footer={
        <>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-slate-300 text-sm hover:bg-dark-600">Cancel</button>
          <button onClick={handleSave} disabled={saving || gstinDup || !!panDupInfo}
            className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : isEdit ? 'Save Changes' : 'Add Client'}
          </button>
        </>
      }
    >

      {/* ── Step 1: Client Type ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={UserCheck} label="Client Type" />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Client ID:</span>
          <span className="font-mono font-semibold text-primary-400 bg-primary-900/20 px-2 py-0.5 rounded border border-primary-800/30">
            {form.client_number || 'Auto-generating…'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button"
            onClick={() => switchType('business')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
              form.client_type === 'business'
                ? 'border-primary-500 bg-primary-900/20'
                : 'border-dark-600 hover:border-dark-500'
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
              form.client_type === 'business' ? 'border-primary-400' : 'border-dark-400'
            }`}>
              {form.client_type === 'business' && <div className="w-2 h-2 rounded-full bg-primary-400" />}
            </div>
            <div className="text-left">
              <p className={`text-sm font-semibold ${form.client_type === 'business' ? 'text-primary-300' : 'text-slate-300'}`}>Business</p>
              <p className="text-xs text-slate-500">Company / Firm / LLP</p>
            </div>
          </button>
          <button type="button"
            onClick={() => switchType('individual')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
              form.client_type === 'individual'
                ? 'border-primary-500 bg-primary-900/20'
                : 'border-dark-600 hover:border-dark-500'
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
              form.client_type === 'individual' ? 'border-primary-400' : 'border-dark-400'
            }`}>
              {form.client_type === 'individual' && <div className="w-2 h-2 rounded-full bg-primary-400" />}
            </div>
            <div className="text-left">
              <p className={`text-sm font-semibold ${form.client_type === 'individual' ? 'text-primary-300' : 'text-slate-300'}`}>Individual</p>
              <p className="text-xs text-slate-500">Person / Proprietor</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Step 2: GST Treatment ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={IndianRupee} label="GST Treatment" />
        <Field label="GST Treatment" required hint="This determines what identification is needed next">
          <select className={inp()} value={form.gst_treatment} onChange={e => handleTreatmentChange(e.target.value)}>
            <option value="">Select GST Treatment…</option>
            {GST_TREATMENT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>

      {/* ── Step 3: GST / PAN Identification (conditional) ────────────────── */}
      {form.gst_treatment && !noTaxID && (
        <div className="space-y-3">
          <SectionHeader
            icon={needsGSTIN ? Shield : FileText}
            label={needsGSTIN ? 'GST Number' : 'PAN Number'}
          />

          {needsGSTIN && (
            <Field label="GSTIN (15-digit)" hint="Click Verify — duplicate check + auto-fill run together">
              <GSTINVerifier
                value={form.gstin}
                onChange={v => { set('gstin', v); setGstinDup(false) }}
                onVerified={handleGSTINVerified}
                onDuplicateFound={setGstinDup}
                companyId={companyId}
                existingClientId={client?.id}
              />
            </Field>
          )}

          {needsPAN && (
            <div className="space-y-3">
              <Field label="PAN Number" hint="10-character Permanent Account Number">
                <div className="relative">
                  <input
                    className={inp(`font-mono pr-8 ${
                      form.pan && form.pan.length === 10 && !PAN_REGEX.test(form.pan.toUpperCase())
                        ? 'border-red-500'
                        : panDupInfo
                        ? 'border-red-500'
                        : form.pan && form.pan.length === 10 && PAN_REGEX.test(form.pan.toUpperCase())
                        ? 'border-emerald-600' : ''
                    }`)}
                    value={form.pan}
                    onChange={e => set('pan', e.target.value.toUpperCase().slice(0, 10))}
                    placeholder="AABCU9603R"
                    maxLength={10}
                  />
                  {checkingPan && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
                  {!checkingPan && panDupInfo && <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />}
                  {!checkingPan && !panDupInfo && form.pan && form.pan.length === 10 && PAN_REGEX.test(form.pan) && (
                    <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  )}
                </div>
                {form.pan && form.pan.length === 10 && !PAN_REGEX.test(form.pan) && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Invalid PAN format
                  </p>
                )}
                {!panDupInfo && !checkingPan && form.pan && form.pan.length === 10 && PAN_REGEX.test(form.pan) && (
                  <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Valid PAN · Entity: {PAN_ENTITY[form.pan.charAt(4)] || 'Entity'}
                  </p>
                )}
              </Field>

              {/* PAN duplicate warning */}
              {panDupInfo && (
                <div className="flex items-start gap-2.5 bg-red-900/25 border border-red-600/50 rounded-lg p-3 text-xs">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-semibold">This PAN is already registered in your account</p>
                    <p className="text-slate-300 mt-0.5 font-medium">
                      {panDupInfo.name}{panDupInfo.num ? ` · ${panDupInfo.num}` : ''}
                      <span className={`ml-1.5 text-xs font-normal ${panDupInfo.archived ? 'text-slate-500' : 'text-emerald-400'}`}>
                        ({panDupInfo.archived ? 'archived' : 'active'})
                      </span>
                    </p>
                    <p className="text-slate-500 mt-1">Edit the existing client instead of adding a new one.</p>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-500 bg-dark-700 rounded-lg p-2.5">
                ℹ️ Unregistered businesses don't have GSTIN — all details must be entered manually below.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Consumer / Overseas — no ID banner */}
      {noTaxID && (
        <div className="flex items-center gap-2.5 bg-dark-700 border border-dark-600 rounded-lg p-3 text-xs text-slate-400">
          <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
          No tax identification required for <strong className="text-slate-300">{form.gst_treatment}</strong> clients. Enter details manually.
        </div>
      )}

      {/* ── Step 4: Business / Legal Name ─────────────────────────────────── */}
      {(form.gst_treatment || isEdit) && (
        <div className="space-y-3">
          <SectionHeader icon={Building2} label={form.client_type === 'individual' ? 'Business / Trade Details' : 'Business Details'} />

          {form.client_type === 'business' && (
            <Field label="Legal / Registered Business Name" required hint="As per GSTIN or Certificate of Incorporation">
              <input className={inp()} value={form.business_name}
                onChange={e => set('business_name', e.target.value)}
                placeholder="Legal business name" />
            </Field>
          )}

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

          {isAdvanced && !needsGSTIN && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Udyam / MSME No.">
                <input className={inp('font-mono')} value={form.udyam_number}
                  onChange={e => set('udyam_number', e.target.value.toUpperCase())}
                  placeholder="UDYAM-XX-00-0000000" />
              </Field>
              <Field label="CIN (if applicable)">
                <input className={inp('font-mono')} value={form.cin}
                  onChange={e => set('cin', e.target.value.toUpperCase())}
                  placeholder="U12345KA2018PTC123456" />
              </Field>
            </div>
          )}

          {isAdvanced && needsGSTIN && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="PAN" hint="Auto-filled from GSTIN">
                <input className={inp('font-mono')} value={form.pan}
                  onChange={e => set('pan', e.target.value.toUpperCase())}
                  placeholder="AABCU9603R" maxLength={10} />
              </Field>
              <Field label="Udyam / MSME No.">
                <input className={inp('font-mono')} value={form.udyam_number}
                  onChange={e => set('udyam_number', e.target.value.toUpperCase())}
                  placeholder="UDYAM-XX-00-0000000" />
              </Field>
              <Field label="CIN">
                <input className={inp('font-mono')} value={form.cin}
                  onChange={e => set('cin', e.target.value.toUpperCase())}
                  placeholder="U12345KA2018PTC123456" />
              </Field>
              <Field label="TAN">
                <input className={inp('font-mono')} value={form.tan}
                  onChange={e => set('tan', e.target.value.toUpperCase())}
                  placeholder="MUMB12345F" maxLength={10} />
              </Field>
            </div>
          )}
        </div>
      )}

      {/* ── Step 5: Primary Contact Person ────────────────────────────────── */}
      {(form.gst_treatment || isEdit) && (
        <div className="space-y-3">
          <SectionHeader icon={User} label="Primary Contact Person" />

          {/* Salutation + First + Last Name */}
          <div className="flex gap-2">
            <div style={{ width: '100px' }} className="shrink-0">
              <Field label="Salutation">
                <select className={inp()} value={form.salutation} onChange={e => set('salutation', e.target.value)}>
                  {salutations.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex-1">
              <Field label="First Name" required>
                <input className={inp()} value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  placeholder={form.client_type === 'business' ? 'Contact person first name' : 'First name'} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Last Name">
                <input className={inp()} value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  placeholder="Last name" />
              </Field>
            </div>
          </div>

          {/* Display Name + Mobile */}
          <div className="grid grid-cols-2 gap-3">
            <DisplayNameField
              value={form.display_name}
              onChange={v => set('display_name', v)}
              salutation={form.salutation}
              firstName={form.first_name}
              lastName={form.last_name}
              businessName={form.business_name}
              clientType={form.client_type}
            />
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
      )}

      {/* ── Step 6: Address ────────────────────────────────────────────────── */}
      {(form.gst_treatment || isEdit) && (
        <div className="space-y-3">
          <SectionHeader icon={MapPin} label={isAdvanced ? 'Address' : 'Location'} />

          {!isAdvanced && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <input className={inp()} value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" />
              </Field>
              <Field label="State">
                <select className={inp()} value={form.state} onChange={e => set('state', e.target.value)}>
                  <option value="">Select…</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          )}

          {isAdvanced && (
            <div className="grid grid-cols-2 gap-5">
              {/* Billing */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 inline-block" /> Billing Address
                </p>
                <Field label="Address" hint="Auto-filled from GST portal on verification">
                  <textarea className={inp()} rows={2} value={form.registered_address}
                    onChange={e => set('registered_address', e.target.value)}
                    placeholder="Door No., Street, Area, Landmark" />
                </Field>
                <Field label="City">
                  <input className={inp()} value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="State">
                    <select className={inp()} value={form.state} onChange={e => set('state', e.target.value)}>
                      <option value="">Select…</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Pincode">
                    <input className={inp()} value={form.pincode} onChange={e => set('pincode', e.target.value)} placeholder="600001" maxLength={6} />
                  </Field>
                </div>
              </div>
              {/* Shipping */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" /> Shipping Address
                  </p>
                  <button type="button" onClick={copyBillingToShipping}
                    className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
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
      )}

      {/* ── Step 7: Secondary Contact (Advanced) ──────────────────────────── */}
      {isAdvanced && (form.gst_treatment || isEdit) && (
        <div className="space-y-3">
          <SectionHeader icon={Users} label="Secondary Contact Person (Optional)" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full Name">
              <input className={inp()} value={form.contact2_name}
                onChange={e => set('contact2_name', e.target.value)} placeholder="Name" />
            </Field>
            <Field label="Designation">
              <input className={inp()} value={form.contact2_designation}
                onChange={e => set('contact2_designation', e.target.value)} placeholder="Site Engineer, GM…" />
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
                onChange={e => set('contact2_email', e.target.value)} placeholder="name@company.com" />
            </Field>
          </div>
        </div>
      )}

      {/* ── Step 8: Business Terms + Tax Preference + Currency ─────────────── */}
      {(form.gst_treatment || isEdit) && (
        <div className="space-y-3">
          <SectionHeader icon={Briefcase} label="Business Terms" />

          {/* Tax Preference + Currency — always visible */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax Preference">
              <div className="flex rounded-lg overflow-hidden border border-dark-600 h-[42px]">
                <button type="button" onClick={() => set('tax_preference', 'tax_payer')}
                  className={`flex-1 text-xs font-medium transition-all ${form.tax_preference === 'tax_payer' ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 hover:text-slate-200'}`}>
                  Tax Payer
                </button>
                <button type="button" onClick={() => set('tax_preference', 'non_tax_payer')}
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

          {/* Advanced: Payment Terms, Credit Limit, Notes */}
          {isAdvanced && (
            <>
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
                      value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)}
                      placeholder="500000" />
                  </div>
                </Field>
              </div>
              <Field label="Notes / Remarks">
                <textarea className={inp()} rows={2} value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Special terms, project notes, remarks…" />
              </Field>
            </>
          )}
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

  const fmtPhone = (code, phone) => phone ? `${code || '+91'} ${phone}` : null
  const hasShipping = !client.shipping_same_as_billing && (client.shipping_city || client.shipping_address)

  const title = client.display_name || client.business_name ||
    [client.salutation, client.first_name, client.last_name].filter(Boolean).join(' ') ||
    client.contact_name || 'Client'

  return (
    <>
      <Modal title={title} subtitle={client.gst_treatment || client.business_type || undefined} onClose={onClose} wide
        footer={
          <>
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-red-400 text-sm hover:border-red-600 hover:bg-red-900/20">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button onClick={handleArchive} disabled={archiving}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-slate-400 text-sm hover:text-slate-200">
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
            <button onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium">
              <Edit2 className="w-3.5 h-3.5" /> Edit Client
            </button>
          </>
        }
      >
        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {client.client_number && (
            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-dark-700 text-primary-400 border border-primary-800/40">
              {client.client_number}
            </span>
          )}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            client.is_active !== false
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30'
              : 'bg-dark-600 text-slate-400 border-dark-500'
          }`}>{client.is_active !== false ? 'Active' : 'Archived'}</span>
          {client.client_type && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-dark-700 text-slate-400 border border-dark-600 flex items-center gap-1">
              {client.client_type === 'individual' ? <User className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
              {client.client_type === 'individual' ? 'Individual' : 'Business'}
            </span>
          )}
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
            <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-900/20 text-yellow-400 border border-yellow-700/30">Non-Tax Payer</span>
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

        {/* Registration IDs — Advanced */}
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
        {(client.city || client.registered_address) && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {isAdvanced ? 'Address' : 'Location'}
            </p>
            {isAdvanced ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-dark-700 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Billing</p>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      {client.registered_address && <p className="text-xs text-slate-200">{client.registered_address}</p>}
                      <p className="text-xs text-slate-300">{[client.city, client.state, client.pincode].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-dark-700 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Shipping {!hasShipping && <span className="font-normal text-slate-600">(same as billing)</span>}
                  </p>
                  {hasShipping ? (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                      <div>
                        {client.shipping_address && <p className="text-xs text-slate-200">{client.shipping_address}</p>}
                        <p className="text-xs text-slate-300">{[client.shipping_city, client.shipping_state, client.shipping_pincode].filter(Boolean).join(', ')}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">{[client.city, client.state, client.pincode].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-dark-700 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-300">{[client.city, client.state].filter(Boolean).join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {/* Contacts */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Contact Persons</p>
          <div className="space-y-2">
            <div className="bg-dark-700 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-300">
                  {[client.salutation, client.first_name, client.last_name].filter(Boolean).join(' ') || client.contact_name || 'Primary Contact'}
                </p>
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

      {showDelete && (
        <DeleteConfirmModal client={client} companyId={companyId} onClose={() => setShowDelete(false)} onDeleted={onClose} />
      )}
    </>
  )
}

// ── Client Card ───────────────────────────────────────────────────────────────
function clientTitle(c) {
  return c.display_name || c.business_name ||
    [c.salutation, c.first_name, c.last_name].filter(Boolean).join(' ') ||
    c.contact_name || 'Unknown Client'
}

function ClientCard({ client, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-left bg-dark-800 border border-dark-700 hover:border-dark-500 rounded-xl p-4 transition-all active:scale-[0.98]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-semibold text-slate-100 text-sm truncate">{clientTitle(client)}</p>
            {client.gstin_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
          </div>
          {client.client_number && (
            <p className="text-[11px] font-mono text-primary-500">{client.client_number}</p>
          )}
          {client.gst_treatment && (
            <p className="text-xs text-slate-600 mt-0.5 truncate">{client.gst_treatment}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-1">
          {client.client_type === 'individual'
            ? <User className="w-3.5 h-3.5 text-slate-600" />
            : <Building2 className="w-3.5 h-3.5 text-slate-600" />}
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </div>
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
        .select('*').eq('company_id', companyId).order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const name = clientTitle(c).toLowerCase()
    const matchSearch = !q || name.includes(q) ||
      c.gstin?.toLowerCase().includes(q) ||
      c.client_number?.toLowerCase().includes(q) ||
      c.contact_phone?.includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.pan?.toLowerCase().includes(q)
    const matchStatus = showArchived ? c.is_active === false : c.is_active !== false
    return matchSearch && matchStatus
  })

  const activeCount   = clients.filter(c => c.is_active !== false).length
  const archivedCount = clients.filter(c => c.is_active === false).length
  const verifiedCount = clients.filter(c => c.gstin_verified).length

  return (
    <div className="relative flex flex-col h-full bg-dark-900">
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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="w-full bg-dark-700 border border-dark-600 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
            placeholder="Search by name, GSTIN, CLI-ID, phone, city…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium">
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

      {showAdd && <AddEditClientModal companyId={companyId} onClose={() => setShowAdd(false)} />}
      {selected && !editing && (
        <ClientDetail client={selected} companyId={companyId}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null) }} />
      )}
      {editing && (
        <AddEditClientModal companyId={companyId} client={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
