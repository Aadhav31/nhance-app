import { useState, useEffect, useRef, useMemo } from 'react'
import { downloadTransferCertificate } from '../../lib/transferCertificatePDF'
import { VendorPicker } from '../../components/shared/EntityPicker'
import PagePanel from '../../components/shared/PagePanel'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { nextEquipmentNumber } from '../../utils/docNumbers'
import {
  EQUIPMENT_TYPES, EQUIPMENT_CATEGORIES, getMeterType, getPrefix, getSubCategories, getAttachments,
  getEquipmentTypes,
  STATUS_COLORS, INCIDENT_SEVERITY
} from '../../lib/equipmentTypes'
import {
  Truck, Plus, Fuel, AlertTriangle, X, Loader2, CheckCircle,
  Gauge, User, Mic, MicOff, MapPin, Camera, Building2, Users,
  Save, Trash2, Edit2, FileText, Wrench, Shield, Phone, Mail,
  ChevronRight, AlertCircle, Clock, Activity, LayoutGrid, List,
  Upload, Download, Eye, FolderOpen, Bell,
  Search, History, BookOpen, PackageOpen, Tag, ArrowLeftRight, Pencil, CalendarDays, IndianRupee
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, differenceInDays } from 'date-fns'

// ── Document types ────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { value: 'purchase_invoice', label: 'Purchase Invoice',          hasExpiry: false, renewable: false, icon: '🧾', referenceLabel: 'Invoice / Serial No.' },
  { value: 'rc_book',          label: 'RC Book',                   hasExpiry: true,  renewable: false, icon: '📋', referenceLabel: 'Registration No.' },
  { value: 'insurance',        label: 'Insurance Policy',          hasExpiry: true,  renewable: true,  icon: '🛡️', referenceLabel: 'Policy No.' },
  { value: 'fitness',          label: 'Fitness Certificate (FC)',  hasExpiry: true,  renewable: true,  icon: '✅', referenceLabel: 'Certificate No.' },
  { value: 'puc',              label: 'PUC / Pollution Certificate',hasExpiry: true, renewable: true,  icon: '💨', referenceLabel: 'Certificate No.' },
  { value: 'permit',           label: 'Route / Operating Permit',  hasExpiry: true,  renewable: true,  icon: '📄', referenceLabel: 'Permit No.' },
  { value: 'other',            label: 'Other Document',            hasExpiry: false, renewable: false, icon: '📎', referenceLabel: 'Reference No.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }

async function addTimestampToImage(file, locationText = null) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const now = new Date()
      const stamp = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        + '  ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      const dateFontSize = Math.max(16, Math.round(img.width / 26))
      const locFontSize  = Math.max(13, Math.round(img.width / 36))
      const pad  = 14
      const barH = locationText ? dateFontSize + locFontSize + pad * 3 : dateFontSize + pad * 2
      ctx.fillStyle = 'rgba(0,0,0,0.70)'
      ctx.fillRect(0, img.height - barH, img.width, barH)
      ctx.font = `bold ${dateFontSize}px monospace`
      ctx.fillStyle = '#FFD700'
      ctx.fillText(stamp, pad, img.height - barH + pad + dateFontSize)
      if (locationText) {
        ctx.font = `${locFontSize}px monospace`
        ctx.fillStyle = '#FFFFFF'
        let loc = '📍 ' + locationText
        while (ctx.measureText(loc).width > img.width - pad * 2 && loc.length > 15) loc = loc.slice(0, -4) + '…'
        ctx.fillText(loc, pad, img.height - pad)
      }
      canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob) }, 'image/jpeg', 0.88)
    }
    img.src = url
  })
}

async function uploadPhoto(blob, companyId, label) {
  const path = `${companyId}/${label}_${Date.now()}.jpg`
  const { error } = await supabase.storage.from('nhance-photos').upload(path, blob, {
    contentType: 'image/jpeg', upsert: false,
  })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('nhance-photos').getPublicUrl(path)
  return publicUrl
}

// ── Camera Button ─────────────────────────────────────────────────────────────
function CameraButton({ companyId, label, photoUrl, onCapture, location }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const blob = await addTimestampToImage(file, location?.address || null)
      const url  = await uploadPhoto(blob, companyId, label)
      onCapture(url); toast.success('Photo saved with timestamp')
    } catch { toast.error('Failed to save photo — check Storage bucket')
    } finally { setUploading(false); e.target.value = '' }
  }
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all
          ${photoUrl ? 'border-emerald-600 bg-emerald-900/20 text-emerald-400'
            : 'border-dark-500 bg-dark-700 text-slate-400 hover:border-primary-500 hover:text-primary-400'}`}>
        {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading…</>
          : <><Camera className="w-3.5 h-3.5" />{photoUrl ? '✓ Photo taken' : 'Take Photo'}</>}
      </button>
      {photoUrl && <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-400 underline">View</a>}
    </div>
  )
}

// ── GPS Hook ──────────────────────────────────────────────────────────────────
function useGPS() {
  const [location, setLocation] = useState(null)
  const [loading, setLoading]   = useState(false)
  const capture = () => {
    if (!navigator.geolocation) { toast.error('GPS not supported'); return }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, { headers: { 'Accept-Language': 'en' } })
          const data = await res.json()
          setLocation({ lat: latitude, lng: longitude, address: data.display_name })
        } catch { setLocation({ lat: latitude, lng: longitude, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` }) }
        setLoading(false)
      },
      () => { toast.error('Could not get location — check GPS permission'); setLoading(false) },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }
  useEffect(() => { capture() }, [])
  return { location, loading, capture }
}

// ── Speech hook + VoiceTextarea ───────────────────────────────────────────────
function useSpeechToText(onResult) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const toggle = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { toast.error('Voice input not supported in this browser'); return }
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const rec = new SR(); rec.lang = 'en-IN'; rec.continuous = false; rec.interimResults = false
    rec.onresult = (e) => onResult(e.results[0][0].transcript)
    rec.onerror = () => setListening(false); rec.onend = () => setListening(false)
    rec.start(); recRef.current = rec; setListening(true)
  }
  return { listening, toggle }
}
function VoiceTextarea({ value, onChange, placeholder, rows = 2 }) {
  const { listening, toggle } = useSpeechToText((text) => onChange(value ? value + ' ' + text : text))
  return (
    <div className="relative">
      <textarea className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 pr-10 text-sm text-slate-100 focus:outline-none focus:border-primary-500 resize-none"
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
      <button type="button" onClick={toggle} title={listening ? 'Stop' : 'Speak'}
        className={`absolute right-2 top-2 p-1.5 rounded-lg transition-all ${listening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-500 hover:text-slate-200 hover:bg-dark-600'}`}>
        {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function GPSField({ location, loading }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <MapPin className={`w-3.5 h-3.5 shrink-0 ${location ? 'text-emerald-400' : 'text-slate-500'}`} />
      {loading ? <span className="text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Getting location…</span>
        : location ? <span className="text-slate-400 truncate">{location.address}</span>
        : <span className="text-slate-500">Location unavailable — check GPS permission</span>}
    </div>
  )
}

function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <PagePanel title={title} onClose={onClose} footer={footer} maxWidth={wide ? 'max-w-none' : 'max-w-4xl'}>
      {children}
    </PagePanel>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inp = (extra = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${extra}`

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Icon className="w-3.5 h-3.5 text-primary-400 shrink-0" />
      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-dark-600" />
    </div>
  )
}

// ── Document Expiry Badge ─────────────────────────────────────────────────────
function ExpiryRow({ label, date }) {
  if (!date) return null
  const days = differenceInDays(new Date(date), new Date())
  const color = days < 0   ? 'text-red-400 border-red-500/30 bg-red-500/10'
    : days < 30  ? 'text-orange-400 border-orange-500/30 bg-orange-500/10'
    : days < 60  ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
    :              'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
  const daysLabel = days < 0 ? `Expired ${Math.abs(days)}d ago`
    : days === 0 ? 'Expires today!'
    : `${days}d left`
  return (
    <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${color}`}>
      <span>{label}</span>
      <span className="font-medium tabular-nums">
        {format(new Date(date), 'dd MMM yyyy')} · {daysLabel}
      </span>
    </div>
  )
}

function hasAnyExpiry(_eq) { return false }   // legacy – expiry now tracked in equipment_documents
function hasExpiryAlert(_eq) { return false } // legacy – alerts come from docAlerts query

// ── Equipment Form Modal (shared Add + Edit) ──────────────────────────────────
const OWNERSHIP_TYPES = [
  { value: 'own',             label: 'Company-Owned' },
  { value: 'hired',           label: 'Hired-In' },
  { value: 'client_supplied', label: 'Client-Supplied' },
]

function EquipmentFormModal({ companyId, initialValues, onClose, onSaved }) {
  const qc      = useQueryClient()
  const isEdit  = !!initialValues?.id
  const { industryType } = useAuth()
  const activeTypes = getEquipmentTypes(industryType)
  const blankForm = {
    equipment_number: '', name: '', category: '', sub_category: '', make: '', model: '',
    year_of_manufacture: '', registration_number: '', chassis_number: '',
    capacity: '', fuel_type: 'diesel', meter_type: 'hours',
    current_meter_reading: '0', status: 'active', notes: '',
    specific_consumption_lph: '',
    // Ownership
    ownership_type: 'own', owner_name: '', owner_contact: '',
    hire_start_date: '', hire_end_date: '',
    // Service
    last_service_date: '', last_service_meter: '', service_interval_hrs: '250',
    next_service_date: '', next_service_meter: '',
    // Internal cost allocation
    internal_rate_basis: 'hourly', internal_rate_per_hour: '', internal_rate_per_day: '', internal_rate_per_month: '',
  }
  const [form, setForm]     = useState(() => ({ ...blankForm, ...initialValues }))
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Vendor list for Hired-In / Client-Supplied owner picker
  const { data: vendorList = [] } = useQuery({
    queryKey: ['vendors-fleet', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors')
        .select('id, name, contact_phone, contact_email')
        .eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })
  // '_vendorId' tracks selected vendor in form state (not persisted — drives owner_name/contact)
  const [selectedVendorId, setSelectedVendorId] = useState(() => {
    if (!initialValues?.owner_name) return ''
    const match = vendorList.find(v => v.name === initialValues.owner_name)
    return match?.id || '__manual__'
  })
  const handleVendorPick = (vendorId) => {
    setSelectedVendorId(vendorId)
    if (vendorId && vendorId !== '__manual__') {
      const v = vendorList.find(v => v.id === vendorId)
      if (v) {
        set('owner_name', v.name)
        set('owner_contact', v.contact_phone || v.contact_email || '')
      }
    } else if (vendorId === '__manual__') {
      set('owner_name', '')
      set('owner_contact', '')
    }
  }

  const handleCategoryChange = (cat) => {
    const prefix    = getPrefix(cat, activeTypes)
    const subCats   = getSubCategories(cat, activeTypes)
    const curNum    = form.equipment_number
    const oldPrefix = getPrefix(form.category, activeTypes)
    const shouldUpdateNum = !curNum || curNum === `${oldPrefix}-` || curNum.startsWith(`${oldPrefix}-`)
    set('category',     cat)
    set('sub_category', subCats.length > 0 ? subCats[0] : '')
    set('meter_type',   getMeterType(cat, activeTypes))
    // Just set the prefix placeholder — actual number generated on save
    if (shouldUpdateNum) set('equipment_number', `${prefix}-`)
  }

  const handleSave = async () => {
    if (!form.name.trim())     { toast.error('Equipment name is required'); return }
    if (!form.category.trim()) { toast.error('Category is required'); return }
    setSaving(true)
    try {
      const prefix = getPrefix(form.category, activeTypes)
      const rawNum = form.equipment_number.trim()
      const equipment_number = (!isEdit && (!rawNum || rawNum === `${prefix}-`))
        ? await nextEquipmentNumber(companyId, prefix).catch(() => `${prefix}-${Date.now()}`)
        : rawNum || `${prefix}-`
      const payload = {
        company_id:            companyId,
        equipment_number:      equipment_number,
        name:                  form.name,
        category:              form.category,
        sub_category:          form.sub_category || null,
        make:                  form.make       || null,
        model:                 form.model      || null,
        year_of_manufacture:   form.year_of_manufacture ? Number(form.year_of_manufacture) : null,
        registration_number:   form.registration_number || null,
        chassis_number:        form.chassis_number      || null,
        capacity:              form.capacity   || null,
        fuel_type:             form.fuel_type,
        meter_type:            form.meter_type,
        current_meter_reading: Number(form.current_meter_reading) || 0,
        status:                form.status,
        notes:                 form.notes      || null,
        specific_consumption_lph: form.specific_consumption_lph ? Number(form.specific_consumption_lph) : null,
        // Ownership
        ownership_type:   form.ownership_type,
        owner_name:       form.ownership_type !== 'own' ? (form.owner_name || null) : null,
        owner_contact:    form.ownership_type !== 'own' ? (form.owner_contact || null) : null,
        hire_start_date:  form.ownership_type === 'hired' ? (form.hire_start_date || null) : null,
        hire_end_date:    form.ownership_type === 'hired' ? (form.hire_end_date   || null) : null,
        // Service
        last_service_date:    form.last_service_date    || null,
        last_service_meter:   form.last_service_meter   ? Number(form.last_service_meter)   : null,
        service_interval_hrs: form.service_interval_hrs ? Number(form.service_interval_hrs) : 250,
        next_service_date:    form.next_service_date    || null,
        next_service_meter:   form.next_service_meter   ? Number(form.next_service_meter)   : null,
        // Internal cost allocation rates
        internal_rate_basis:      form.internal_rate_basis || 'hourly',
        internal_rate_per_hour:   form.internal_rate_per_hour   ? Number(form.internal_rate_per_hour)   : null,
        internal_rate_per_day:    form.internal_rate_per_day    ? Number(form.internal_rate_per_day)    : null,
        internal_rate_per_month:  form.internal_rate_per_month  ? Number(form.internal_rate_per_month)  : null,
      }

      let error
      if (isEdit) {
        ;({ error } = await supabase.from('equipment').update(payload).eq('id', initialValues.id))
      } else {
        ;({ error } = await supabase.from('equipment').insert(payload))
      }
      if (error) throw error
      toast.success(isEdit ? 'Equipment updated' : 'Equipment added')
      qc.invalidateQueries(['equipment', companyId])
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save equipment')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? `Edit — ${initialValues.name}` : 'Add Equipment'} onClose={onClose} wide footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : (isEdit ? 'Save Changes' : 'Add Equipment')}
        </button>
      </>
    }>
      {/* ── Basic Info ── */}
      <SectionHeader icon={Truck} label="Equipment Details" />

      {/* Step 1 — Type first */}
      <Field label="Equipment Type" required>
        <select className={inp()} value={form.category} onChange={e => handleCategoryChange(e.target.value)}>
          <option value="">Select equipment type…</option>
          {activeTypes.map(e => <option key={e.type} value={e.type}>{e.type}</option>)}
        </select>
      </Field>
      {form.category && getSubCategories(form.category, activeTypes).length > 0 && (
        <Field label="Classification / Sub-category">
          <select className={inp()} value={form.sub_category} onChange={e => set('sub_category', e.target.value)}>
            {getSubCategories(form.category, activeTypes).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      )}

      {/* Step 2 — Auto-prefixed number + status */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Equipment No." required>
          <input className={inp()} value={form.equipment_number}
            onChange={e => set('equipment_number', e.target.value)}
            placeholder={form.category ? `${getPrefix(form.category, activeTypes)}-001` : 'Select type first…'} />
        </Field>
        <Field label="Status">
          <select className={inp()} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="maintenance">Maintenance</option>
            <option value="breakdown">Breakdown</option>
            <option value="disposed">Disposed</option>
          </select>
        </Field>
      </div>

      {/* Step 3 — Name */}
      <Field label="Equipment Name" required>
        <input className={inp()} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Tata Hitachi ZAxis 220 LC" />
      </Field>

      {/* Step 4 — Make, Model, Year, Reg */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make / Brand">
          <input className={inp()} value={form.make} onChange={e => set('make', e.target.value)} placeholder="Tata, JCB, Volvo…" />
        </Field>
        <Field label="Model">
          <input className={inp()} value={form.model} onChange={e => set('model', e.target.value)} placeholder="EX200, 3DX…" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Year of Manufacture">
          <input type="number" className={inp()} value={form.year_of_manufacture} onChange={e => set('year_of_manufacture', e.target.value)} placeholder="2022" />
        </Field>
        <Field label="Reg. / Vehicle No.">
          <input className={inp()} value={form.registration_number} onChange={e => set('registration_number', e.target.value)} placeholder="TN 01 AB 1234" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Meter Type">
          <select className={inp()} value={form.meter_type} onChange={e => set('meter_type', e.target.value)}>
            <option value="hours">Hours (Hr Meter)</option>
            <option value="kilometers">Kilometers (KM)</option>
            <option value="both">Both (Hrs + KM)</option>
          </select>
        </Field>
        <Field label="Current Reading">
          <input type="number" className={inp()} value={form.current_meter_reading} onChange={e => set('current_meter_reading', e.target.value)} placeholder="0" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fuel Type">
          <select className={inp()} value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)}>
            <option value="diesel">Diesel</option>
            <option value="petrol">Petrol</option>
            <option value="electric">Electric</option>
            <option value="cng">CNG</option>
          </select>
        </Field>
        <Field label="Capacity">
          <input className={inp()} value={form.capacity} onChange={e => set('capacity', e.target.value)} placeholder="20T, 1.2m³…" />
        </Field>
      </div>
      <Field label="Specific Fuel Consumption (L/hr)" hint="Standard expected consumption — used for P&L fuel over-consumption alerts">
        <input type="number" className={inp()} value={form.specific_consumption_lph || ''} onChange={e => set('specific_consumption_lph', e.target.value)}
          placeholder="e.g. 12.5" step="0.1" min="0" />
      </Field>
      <Field label="Notes">
        <VoiceTextarea value={form.notes} onChange={v => set('notes', v)} placeholder="Any additional details…" />
      </Field>

      {/* ── Ownership ── */}
      <SectionHeader icon={Building2} label="Ownership" />
      <Field label="Ownership Type">
        <div className="grid grid-cols-3 gap-2">
          {OWNERSHIP_TYPES.map(o => (
            <button key={o.value} type="button" onClick={() => set('ownership_type', o.value)}
              className={`px-2 py-2 rounded-lg border text-xs font-medium transition-all text-center
                ${form.ownership_type === o.value ? 'border-primary-500 bg-primary-500/10 text-primary-300' : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </Field>
      {form.ownership_type !== 'own' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={form.ownership_type === 'hired' ? 'Owner / Vendor' : 'Client / Company'}>
              {/* Vendor picker — pulls from Purchase → Vendors */}
              <select
                className={inp()}
                value={selectedVendorId}
                onChange={e => handleVendorPick(e.target.value)}
              >
                <option value="">-- Select from vendors --</option>
                {vendorList.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
                <option value="__manual__">✏ Enter manually…</option>
              </select>
              {selectedVendorId === '__manual__' && (
                <input
                  className={inp() + ' mt-1.5'}
                  value={form.owner_name}
                  onChange={e => set('owner_name', e.target.value)}
                  placeholder="Type name manually"
                />
              )}
            </Field>
            <Field label="Contact (Phone / Email)">
              <input className={inp()} value={form.owner_contact} onChange={e => set('owner_contact', e.target.value)} placeholder="Auto-filled or type" />
            </Field>
          </div>
          {form.ownership_type === 'hired' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hire Start Date">
                <input type="date" className={inp()} value={form.hire_start_date} onChange={e => set('hire_start_date', e.target.value)} />
              </Field>
              <Field label="Hire End Date">
                <input type="date" className={inp()} value={form.hire_end_date} onChange={e => set('hire_end_date', e.target.value)} />
              </Field>
            </div>
          )}
        </>
      )}

      {/* ── Documents — added after creation ── */}
      <SectionHeader icon={FileText} label="Equipment / Vehicle Documents" />
      <div className="flex items-start gap-2.5 bg-dark-700/60 border border-dark-600 rounded-xl px-3 py-3">
        <FileText className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          Documents (Invoice, RC, Insurance, FC, PUC, Permit) can be uploaded from the equipment detail page after saving.
          Each document supports a reference number, issued date, expiry date and file upload.
        </p>
      </div>

      {/* ── Service Schedule ── */}
      <SectionHeader icon={Wrench} label="Service Schedule" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Last Service Date">
          <input type="date" className={inp()} value={form.last_service_date} onChange={e => set('last_service_date', e.target.value)} />
        </Field>
        <Field label="Last Service Meter (hrs)">
          <input type="number" className={inp()} value={form.last_service_meter} onChange={e => set('last_service_meter', e.target.value)} placeholder="e.g. 4250" step="0.1" />
        </Field>
      </div>
      <Field label="Service Interval (hrs between services)">
        <input type="number" className={inp()} value={form.service_interval_hrs} onChange={e => set('service_interval_hrs', e.target.value)} placeholder="250" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next Service Due Date">
          <input type="date" className={inp()} value={form.next_service_date} onChange={e => set('next_service_date', e.target.value)} />
        </Field>
        <Field label="Next Service Due Meter (hrs)">
          <input type="number" className={inp()} value={form.next_service_meter} onChange={e => set('next_service_meter', e.target.value)} placeholder="e.g. 4500" step="0.1" />
        </Field>
      </div>

      {/* ── Internal Cost Allocation ── */}
      <SectionHeader icon={IndianRupee} label="Internal Hire Rate (P&M Cross-Charge)" />
      <div className="flex items-start gap-2.5 bg-dark-700/60 border border-dark-600 rounded-xl px-3 py-3 mb-1">
        <IndianRupee className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          Used for internal cost allocation — how much P&M charges each project per hour/day/month for using this machine.
          This is separate from client billing rates.
        </p>
      </div>
      <Field label="Rate Basis">
        <div className="grid grid-cols-3 gap-2">
          {[{ value: 'hourly', label: 'Per Hour' }, { value: 'daily', label: 'Per Day' }, { value: 'monthly', label: 'Per Month' }].map(o => (
            <button key={o.value} type="button" onClick={() => set('internal_rate_basis', o.value)}
              className={`px-2 py-2 rounded-lg border text-xs font-medium transition-all text-center
                ${form.internal_rate_basis === o.value ? 'border-primary-500 bg-primary-500/10 text-primary-300' : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </Field>
      {form.internal_rate_basis === 'hourly' && (
        <Field label="Internal Rate (₹/hour)">
          <input type="number" className={inp()} value={form.internal_rate_per_hour} onChange={e => set('internal_rate_per_hour', e.target.value)} placeholder="e.g. 850" min="0" />
        </Field>
      )}
      {form.internal_rate_basis === 'daily' && (
        <Field label="Internal Rate (₹/day)">
          <input type="number" className={inp()} value={form.internal_rate_per_day} onChange={e => set('internal_rate_per_day', e.target.value)} placeholder="e.g. 6000" min="0" />
        </Field>
      )}
      {form.internal_rate_basis === 'monthly' && (
        <Field label="Internal Rate (₹/month)">
          <input type="number" className={inp()} value={form.internal_rate_per_month} onChange={e => set('internal_rate_per_month', e.target.value)} placeholder="e.g. 120000" min="0" />
        </Field>
      )}
    </Modal>
  )
}

// ── Document Upload Modal ─────────────────────────────────────────────────────
async function uploadDocFile(file, companyId, equipmentId, docType) {
  const ext  = file.name.split('.').pop()
  const path = `${companyId}/equipment-docs/${equipmentId}/${docType}_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('nhance-photos').upload(path, file, { upsert: false })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('nhance-photos').getPublicUrl(path)
  return publicUrl
}

function DocumentUploadModal({ equipment, companyId, onClose, editDoc = null }) {
  const qc      = useQueryClient()
  const fileRef = useRef(null)
  const isEdit  = !!editDoc
  const [form, setForm] = useState({
    doc_type:         editDoc?.doc_type        || '',
    doc_name:         editDoc?.doc_name        || '',
    reference_number: editDoc?.reference_number|| '',
    issued_date:      editDoc?.issued_date     || '',
    expiry_date:      editDoc?.expiry_date     || '',
    notes:            editDoc?.notes           || '',
  })
  const [file, setFile]     = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const docMeta = DOC_TYPES.find(d => d.value === form.doc_type)

  const handleSave = async () => {
    if (!form.doc_type) { toast.error('Select document type'); return }
    if (!isEdit && !file) { toast.error('Select a file to upload'); return }
    if (form.doc_type === 'other' && !form.doc_name.trim()) { toast.error('Enter a name for this document'); return }
    setSaving(true)
    try {
      let fileUrl   = editDoc?.file_url  || null
      let fileName  = editDoc?.file_name || null
      let fileSizeKb= editDoc?.file_size_kb || null
      if (file) {
        fileUrl    = await uploadDocFile(file, companyId, equipment.id, form.doc_type)
        fileName   = file.name
        fileSizeKb = Math.round(file.size / 1024)
      }
      const payload = {
        company_id:       companyId,
        equipment_id:     equipment.id,
        doc_type:         form.doc_type,
        doc_name:         form.doc_name || docMeta?.label || form.doc_type,
        reference_number: form.reference_number || null,
        file_url:         fileUrl,
        file_name:        fileName,
        file_size_kb:     fileSizeKb,
        issued_date:      form.issued_date || null,
        expiry_date:      form.expiry_date || null,
        notes:            form.notes       || null,
      }
      let error
      if (isEdit) {
        ;({ error } = await supabase.from('equipment_documents').update(payload).eq('id', editDoc.id))
      } else {
        ;({ error } = await supabase.from('equipment_documents').insert(payload))
      }
      if (error) throw error
      toast.success(isEdit ? 'Document updated' : 'Document uploaded')
      qc.invalidateQueries(['equipment_docs', equipment.id])
      onClose()
    } catch (err) { toast.error(err.message || 'Upload failed')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? `Edit — ${docMeta?.label || 'Document'}` : 'Upload Document'} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving || (!isEdit && !file)} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />{isEdit ? 'Saving…' : 'Uploading…'}</>
            : isEdit ? <><Save className="w-4 h-4" />Save Changes</> : <><Upload className="w-4 h-4" />Upload</>}
        </button>
      </>
    }>
      <Field label="Document Type" required>
        <select className={inp()} value={form.doc_type} onChange={e => set('doc_type', e.target.value)} disabled={isEdit}>
          <option value="">Select type…</option>
          {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.icon} {d.label}</option>)}
        </select>
      </Field>
      {form.doc_type === 'other' && (
        <Field label="Document Name" required>
          <input className={inp()} value={form.doc_name} onChange={e => set('doc_name', e.target.value)} placeholder="e.g. Load test certificate, Warranty card…" />
        </Field>
      )}

      {/* Reference number — label changes per doc type */}
      {form.doc_type && (
        <Field label={docMeta?.referenceLabel || 'Reference No.'}>
          <input className={inp()} value={form.reference_number} onChange={e => set('reference_number', e.target.value)}
            placeholder={`Enter ${docMeta?.referenceLabel || 'reference number'}…`} />
        </Field>
      )}

      {/* File picker */}
      <div>
        <p className="text-xs font-medium text-slate-400 mb-1.5">
          File {!isEdit && <span className="text-red-400">*</span>}
          {isEdit && <span className="text-slate-500 font-normal"> (leave blank to keep existing)</span>}
        </p>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm transition-colors
            ${file ? 'border-emerald-600 bg-emerald-900/20 text-emerald-400' : 'border-dark-500 bg-dark-700 text-slate-400 hover:border-primary-500 hover:text-primary-300'}`}>
          {file
            ? <><CheckCircle className="w-4 h-4" />{file.name} ({Math.round(file.size / 1024)} KB)</>
            : editDoc?.file_name
              ? <><FolderOpen className="w-4 h-4" />Current: {editDoc.file_name} — click to replace</>
              : <><FolderOpen className="w-4 h-4" />Choose PDF / Image / Word doc</>}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Issued Date">
          <input type="date" className={inp()} value={form.issued_date} onChange={e => set('issued_date', e.target.value)} />
        </Field>
        {docMeta?.hasExpiry !== false && (
          <Field label="Expiry Date">
            <input type="date" className={inp()} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="Notes">
        <input className={inp()} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional notes…" />
      </Field>
    </Modal>
  )
}

// ── Documents Section (shown inside EquipmentDetail) ──────────────────────────
function DocumentsSection({ equipment, companyId, isAdmin }) {
  const qc = useQueryClient()
  const [showUpload, setShowUpload] = useState(false)
  const [editDoc,    setEditDoc]    = useState(null)

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['equipment_docs', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_documents')
        .select('*').eq('equipment_id', equipment.id).order('doc_type').order('uploaded_at', { ascending: false })
      return data || []
    },
  })

  const handleDelete = async (docId, fileUrl) => {
    if (!confirm('Delete this document? This cannot be undone.')) return
    const { error } = await supabase.from('equipment_documents').delete().eq('id', docId)
    if (error) { toast.error('Failed to delete'); return }
    toast.success('Document deleted')
    qc.invalidateQueries(['equipment_docs', equipment.id])
  }

  const docsByType = DOC_TYPES.map(dt => ({
    ...dt,
    items: docs.filter(d => d.doc_type === dt.value),
  })).filter(dt => dt.items.length > 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-primary-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Documents</span>
          <div className="flex-1 h-px bg-dark-600 w-8" />
        </div>
        {isAdmin && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-700 border border-dark-600 hover:border-primary-500 text-xs text-slate-300 transition-colors">
            <Upload className="w-3 h-3" /> Add
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center py-4 gap-2 bg-dark-700/50 rounded-xl border border-dashed border-dark-600">
          <FolderOpen className="w-8 h-8 text-slate-600" />
          <p className="text-xs text-slate-500">No documents uploaded yet</p>
          {isAdmin && <button onClick={() => setShowUpload(true)} className="text-xs text-primary-400 underline">Upload first document</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {docsByType.map(dt => (
            <div key={dt.value}>
              <p className="text-xs text-slate-500 mb-1.5">{dt.icon} {dt.label}</p>
              <div className="space-y-1.5">
                {dt.items.map(doc => {
                  const days     = doc.expiry_date ? differenceInDays(new Date(doc.expiry_date), new Date()) : null
                  const expColor = days === null ? '' : days < 0 ? 'text-red-400' : days < 30 ? 'text-orange-400' : 'text-emerald-400'
                  return (
                    <div key={doc.id} className="flex items-start gap-2 bg-dark-700 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-200 truncate">{doc.doc_name || dt.label}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {doc.reference_number && (
                            <span className="text-xs text-primary-500 font-mono">{doc.reference_number}</span>
                          )}
                          {doc.expiry_date && (
                            <span className={`text-xs font-medium ${expColor}`}>
                              {days < 0 ? '⚠ Expired' : `Exp: ${format(new Date(doc.expiry_date), 'dd MMM yyyy')}`}
                              {days !== null && days >= 0 && ` (${days}d)`}
                            </span>
                          )}
                          {doc.issued_date && (
                            <span className="text-xs text-slate-500">Issued: {format(new Date(doc.issued_date), 'dd MMM yyyy')}</span>
                          )}
                          {doc.notes && <span className="text-xs text-slate-500 italic truncate max-w-[100px]">{doc.notes}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-dark-600 transition-colors" title="View / Download">
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                        {isAdmin && dt.renewable && (
                          <button onClick={() => setEditDoc(doc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-primary-400 hover:bg-dark-600 transition-colors" title="Renew / Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDelete(doc.id, doc.file_url)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-dark-600 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {isAdmin && (
            <button onClick={() => setShowUpload(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-dark-600 text-xs text-slate-500 hover:border-primary-500 hover:text-primary-400 transition-colors">
              <Upload className="w-3 h-3" /> Upload another document
            </button>
          )}
        </div>
      )}

      {showUpload && <DocumentUploadModal equipment={equipment} companyId={companyId} onClose={() => setShowUpload(false)} />}
      {editDoc    && <DocumentUploadModal equipment={equipment} companyId={companyId} editDoc={editDoc} onClose={() => setEditDoc(null)} />}
    </div>
  )
}

// ── Attachments Section ───────────────────────────────────────────────────────
function AttachmentsSection({ equipment, companyId, isAdmin }) {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [showAdd,   setShowAdd]   = useState(false)
  const [editItem,  setEditItem]  = useState(null)
  const { industryType } = useAuth()
  const availableAttachments = getAttachments(equipment.category || '', getEquipmentTypes(industryType))

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['equipment_attachments', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_attachments')
        .select('*').eq('equipment_id', equipment.id).order('attachment_name')
      return data || []
    },
  })

  const handleDelete = async (id) => {
    if (!confirm('Remove this attachment?')) return
    const { error } = await supabase.from('equipment_attachments').delete().eq('id', id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Attachment removed')
    qc.invalidateQueries(['equipment_attachments', equipment.id])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-primary-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Attachments</span>
          <div className="h-px bg-dark-600 w-8" />
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-700 border border-dark-600 hover:border-primary-500 text-xs text-slate-300 transition-colors">
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
      ) : attachments.length === 0 ? (
        <div className="flex flex-col items-center py-4 gap-2 bg-dark-700/50 rounded-xl border border-dashed border-dark-600">
          <Wrench className="w-7 h-7 text-slate-600" />
          <p className="text-xs text-slate-500">No attachments added</p>
          {isAdmin && availableAttachments.length > 0 && (
            <button onClick={() => setShowAdd(true)} className="text-xs text-primary-400 underline">Add first attachment</button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div key={att.id} className="flex items-start gap-2 bg-dark-700 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200">{att.attachment_name}</p>
                <div className="flex flex-wrap gap-2 mt-0.5">
                  {att.make  && <span className="text-xs text-slate-500">{att.make}</span>}
                  {att.model && <span className="text-xs text-slate-500">{att.model}</span>}
                  {att.serial_number  && <span className="text-xs text-primary-500 font-mono">S/N: {att.serial_number}</span>}
                  {att.invoice_number && <span className="text-xs text-primary-500 font-mono">Inv: {att.invoice_number}</span>}
                  {att.purchase_date  && <span className="text-xs text-slate-500">Purchased: {format(new Date(att.purchase_date), 'dd MMM yyyy')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {att.invoice_url && (
                  <a href={att.invoice_url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-dark-600 transition-colors" title="View Invoice">
                    <Eye className="w-3.5 h-3.5" />
                  </a>
                )}
                {isAdmin && (
                  <>
                    <button onClick={() => setEditItem(att)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-primary-400 hover:bg-dark-600 transition-colors" title="Edit">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(att.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-dark-600 transition-colors" title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {isAdmin && (
            <button onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-dark-600 text-xs text-slate-500 hover:border-primary-500 hover:text-primary-400 transition-colors">
              <Plus className="w-3 h-3" /> Add attachment
            </button>
          )}
        </div>
      )}

      {(showAdd || editItem) && (
        <AttachmentFormModal
          equipment={equipment}
          companyId={companyId}
          initialValues={editItem}
          availableAttachments={availableAttachments}
          onClose={() => { setShowAdd(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}

// ── Attachment Form Modal ─────────────────────────────────────────────────────
function AttachmentFormModal({ equipment, companyId, initialValues, availableAttachments, onClose }) {
  const qc     = useQueryClient()
  const isEdit = !!initialValues?.id
  const fileRef = useRef(null)
  const [form, setForm] = useState({
    attachment_name: initialValues?.attachment_name || '',
    make:            initialValues?.make            || '',
    model:           initialValues?.model           || '',
    serial_number:   initialValues?.serial_number   || '',
    purchase_date:   initialValues?.purchase_date   || '',
    invoice_number:  initialValues?.invoice_number  || '',
    notes:           initialValues?.notes           || '',
    invoice_url:     initialValues?.invoice_url     || '',
  })
  const [file,    setFile]   = useState(null)
  const [saving, setSaving]  = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.attachment_name.trim()) { toast.error('Select or enter attachment name'); return }
    setSaving(true)
    try {
      let invoiceUrl = form.invoice_url || null
      if (file) {
        const ext  = file.name.split('.').pop()
        const path = `${companyId}/attachments/${equipment.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('nhance-photos').upload(path, file, { upsert: false })
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('nhance-photos').getPublicUrl(path)
        invoiceUrl = publicUrl
      }
      const payload = {
        company_id:      companyId,
        equipment_id:    equipment.id,
        attachment_name: form.attachment_name,
        make:            form.make           || null,
        model:           form.model          || null,
        serial_number:   form.serial_number  || null,
        purchase_date:   form.purchase_date  || null,
        invoice_number:  form.invoice_number || null,
        invoice_url:     invoiceUrl,
        notes:           form.notes          || null,
      }
      let error
      if (isEdit) {
        ;({ error } = await supabase.from('equipment_attachments').update(payload).eq('id', initialValues.id))
      } else {
        ;({ error } = await supabase.from('equipment_attachments').insert(payload))
      }
      if (error) throw error
      toast.success(isEdit ? 'Attachment updated' : 'Attachment added')
      qc.invalidateQueries(['equipment_attachments', equipment.id])
      onClose()
    } catch (err) { toast.error(err.message || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? 'Edit Attachment' : 'Add Attachment'} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Save className="w-4 h-4" />{isEdit ? 'Save' : 'Add'}</>}
        </button>
      </>
    }>
      <Field label="Attachment Name" required>
        {availableAttachments.length > 0 ? (
          <select className={inp()} value={form.attachment_name} onChange={e => set('attachment_name', e.target.value)}>
            <option value="">Select attachment…</option>
            {availableAttachments.map(a => <option key={a} value={a}>{a}</option>)}
            <option value="__custom__">Other (type below)</option>
          </select>
        ) : (
          <input className={inp()} value={form.attachment_name} onChange={e => set('attachment_name', e.target.value)} placeholder="e.g. Hydraulic Breaker" />
        )}
        {form.attachment_name === '__custom__' && (
          <input className={`${inp()} mt-2`} placeholder="Enter attachment name…"
            onChange={e => set('attachment_name', e.target.value === '' ? '__custom__' : e.target.value)} />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make / Brand">
          <input className={inp()} value={form.make} onChange={e => set('make', e.target.value)} placeholder="Sandvik, Atlas Copco…" />
        </Field>
        <Field label="Model">
          <input className={inp()} value={form.model} onChange={e => set('model', e.target.value)} placeholder="Model number" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Serial No.">
          <input className={inp()} value={form.serial_number} onChange={e => set('serial_number', e.target.value)} placeholder="S/N" />
        </Field>
        <Field label="Purchase Date">
          <input type="date" className={inp()} value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} />
        </Field>
      </div>
      <Field label="Invoice No.">
        <input className={inp()} value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="Purchase invoice number" />
      </Field>

      {/* Invoice file upload */}
      <div>
        <p className="text-xs font-medium text-slate-400 mb-1.5">
          Invoice / Document
          {form.invoice_url && <span className="text-slate-500 font-normal"> (already uploaded)</span>}
        </p>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm transition-colors
            ${file ? 'border-emerald-600 bg-emerald-900/20 text-emerald-400' : 'border-dark-500 bg-dark-700 text-slate-400 hover:border-primary-500 hover:text-primary-300'}`}>
          {file
            ? <><CheckCircle className="w-4 h-4" />{file.name}</>
            : form.invoice_url
              ? <><FolderOpen className="w-4 h-4" />Replace existing invoice</>
              : <><FolderOpen className="w-4 h-4" />Attach invoice / document (optional)</>}
        </button>
      </div>

      <Field label="Notes">
        <input className={inp()} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Condition, warranty, etc." />
      </Field>
    </Modal>
  )
}

// ── Fuel Modal ────────────────────────────────────────────────────────────────
function FuelModal({ equipment, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading } = useGPS()
  const todayDate = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    entry_date: todayDate,
    quantity_liters: '', rate_per_liter: '',
    meter_at_filling: String(equipment.current_meter_reading || ''), km_at_filling: '',
    delivered_by_name: '', vendor_name: '', invoice_number: '', notes: '',
  })
  const [fuelPhotoUrl, setFuelPhotoUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const mt = equipment.meter_type

  const handleSave = async () => {
    if (!form.quantity_liters) { toast.error('Quantity is required'); return }
    setSaving(true)
    try {
      const qty  = Number(form.quantity_liters)
      const rate = form.rate_per_liter ? Number(form.rate_per_liter) : null
      // Build created_at from selected date + current wall-clock time
      const now = new Date()
      const entryTs = new Date(
        `${form.entry_date}T${now.toTimeString().slice(0, 8)}`
      ).toISOString()
      const { error } = await supabase.from('shift_fuel_entries').insert({
        company_id:       companyId,
        equipment_id:     equipment.id,
        quantity_liters:  qty,
        rate_per_liter:   rate,
        total_amount:     rate ? qty * rate : null,
        meter_at_filling: form.meter_at_filling ? Number(form.meter_at_filling) : null,
        km_at_filling:    form.km_at_filling    ? Number(form.km_at_filling)    : null,
        delivered_by_name: form.delivered_by_name || null,
        vendor_name:      form.vendor_name       || null,
        invoice_number:   form.invoice_number    || null,
        filling_location: location?.address      || null,
        location_lat:     location?.lat          || null,
        location_lng:     location?.lng          || null,
        location_address: location?.address      || null,
        fuel_photo_url:   fuelPhotoUrl           || null,
        notes:            form.notes             || null,
        created_at:       entryTs,
      })
      if (error) throw error
      toast.success(`${qty}L fuel logged`)
      qc.invalidateQueries(['fuel', equipment.id])
      qc.invalidateQueries(['all_fuel', companyId])
      qc.invalidateQueries(['equipment_fuel_stats', equipment.id])
      onClose()
    } catch (err) { toast.error(err.message || 'Failed to log fuel')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Fuel Entry — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Log Fuel'}
        </button>
      </>
    }>
      <Field label="Entry Date">
        <input type="date" className={inp()} value={form.entry_date} max={todayDate}
          onChange={e => set('entry_date', e.target.value)} />
        {form.entry_date !== todayDate && (
          <p className="text-xs text-amber-500 mt-1">⚠ Backdated entry — {new Date(form.entry_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</p>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity (Litres)" required>
          <input type="number" className={inp()} value={form.quantity_liters} onChange={e => set('quantity_liters', e.target.value)} placeholder="e.g. 150" step="0.1" />
        </Field>
        <Field label="Rate per Litre (₹)">
          <input type="number" className={inp()} value={form.rate_per_liter} onChange={e => set('rate_per_liter', e.target.value)} placeholder="e.g. 95.50" step="0.01" />
        </Field>
      </div>
      {form.quantity_liters && form.rate_per_liter && (
        <div className="bg-primary-900/30 border border-primary-700/30 rounded-lg px-3 py-2 text-sm">
          Total: <span className="font-bold text-primary-300">₹{(Number(form.quantity_liters) * Number(form.rate_per_liter)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-slate-400 mb-1">Fuel Delivery Photo</p>
        <p className="text-xs text-slate-500 mb-1">Capture meter / delivery slip / invoice as proof</p>
        <CameraButton companyId={companyId} label="fuel" photoUrl={fuelPhotoUrl} onCapture={setFuelPhotoUrl} location={location} />
      </div>
      {(mt === 'hours' || mt === 'both') && (
        <Field label="Hour Meter at Filling (hrs)">
          <input type="number" className={inp()} value={form.meter_at_filling} onChange={e => set('meter_at_filling', e.target.value)} step="0.1" />
        </Field>
      )}
      {(mt === 'kilometers' || mt === 'both') && (
        <Field label="Odometer at Filling (km)">
          <input type="number" className={inp()} value={form.km_at_filling} onChange={e => set('km_at_filling', e.target.value)} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Filled / Delivered By">
          <input className={inp()} value={form.delivered_by_name} onChange={e => set('delivered_by_name', e.target.value)} placeholder="Person name" />
        </Field>
        <Field label="Vendor / Fuel Station">
          <VendorPicker companyId={companyId} value={form.vendor_name} onChange={n => set('vendor_name', n)} onSelect={v => set('vendor_name', v.name)} placeholder="Supplier name" className={inp()} />
        </Field>
      </div>
      <Field label="Invoice No.">
        <input className={inp()} value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="INV-001" />
      </Field>
      <GPSField location={location} loading={gpsLoading} />
      <Field label="Notes">
        <VoiceTextarea value={form.notes} onChange={v => set('notes', v)} placeholder="Any remarks…" />
      </Field>
    </Modal>
  )
}

// ── Incident Modal ────────────────────────────────────────────────────────────
const INCIDENT_OPTIONS = [
  { value: 'breakdown',               label: 'Breakdown',              icon: '🔴', desc: 'Equipment stopped — cannot operate' },
  { value: 'unscheduled_maintenance', label: 'Unscheduled Maintenance', icon: '🔧', desc: 'Unexpected repair needed' },
  { value: 'regular_maintenance',     label: 'Regular Maintenance',    icon: '⚙️', desc: 'Scheduled service / oil change etc.' },
  { value: 'damage',                  label: 'Damage / Broken',        icon: '💥', desc: 'Physical damage to equipment' },
  { value: 'theft',                   label: 'Theft',                  icon: '🚨', desc: 'Equipment or parts stolen' },
  { value: 'safety_issue',            label: 'Safety Issue',           icon: '⚠️', desc: 'Hazard that needs attention' },
  { value: 'accident',                label: 'Accident',               icon: '🚧', desc: 'Collision or mishap occurred' },
  { value: 'near_miss',               label: 'Near Miss',              icon: '😰', desc: 'Almost had an accident' },
  { value: 'other',                   label: 'Others',                 icon: '📋', desc: 'Any other issue' },
]

function IncidentModal({ equipment, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading } = useGPS()
  const todayDate = new Date().toISOString().split('T')[0]
  const [incidentType, setIncidentType] = useState('')
  const [form, setForm] = useState({
    incident_date: todayDate,
    description: '', action_taken: '', breakdown_cause: '',
    rectification_needed: '', damage_cause: '', what_needs_to_be_done: '', severity: 'medium',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!incidentType)            { toast.error('Select incident type'); return }
    if (!form.description.trim()) { toast.error('Description is required'); return }
    setSaving(true)
    try {
      const now = new Date()
      const entryTs = new Date(
        `${form.incident_date}T${now.toTimeString().slice(0, 8)}`
      ).toISOString()
      const { error } = await supabase.from('shift_incidents').insert({
        company_id:     companyId,
        equipment_id:   equipment.id,
        incident_type:  incidentType,
        severity: ['safety_issue', 'accident', 'near_miss'].includes(incidentType) ? form.severity : null,
        description:    form.description,
        action_taken:   form.action_taken        || null,
        breakdown_cause: form.breakdown_cause    || null,
        rectification_needed: form.rectification_needed || null,
        damage_cause:   form.damage_cause        || null,
        what_needs_to_be_done: form.what_needs_to_be_done || null,
        notify_assigned: ['damage', 'safety_issue', 'theft', 'accident'].includes(incidentType),
        location_lat:   location?.lat || null,
        location_lng:   location?.lng || null,
        location_address: location?.address || null,
        resolved: false,
        created_at:     entryTs,
      })
      if (error) throw error
      if (incidentType === 'breakdown') {
        await supabase.from('equipment').update({ status: 'breakdown' }).eq('id', equipment.id)
      } else if (['regular_maintenance', 'unscheduled_maintenance'].includes(incidentType)) {
        await supabase.from('equipment').update({ status: 'maintenance' }).eq('id', equipment.id)
      }
      if (['damage', 'safety_issue', 'theft', 'accident', 'breakdown'].includes(incidentType)) {
        await supabase.from('notifications').insert({
          company_id: companyId,
          type:  `incident_${incidentType}`,
          title: `${INCIDENT_OPTIONS.find(i => i.value === incidentType)?.label} — ${equipment.name}`,
          body:  form.description,
          metadata: { equipment_id: equipment.id, equipment_name: equipment.name, incident_type: incidentType }
        })
      }
      toast.success('Incident reported')
      qc.invalidateQueries(['incidents', equipment.id])
      qc.invalidateQueries(['all_incidents', companyId])
      qc.invalidateQueries(['equipment', companyId])
      onClose()
    } catch (err) { toast.error(err.message || 'Failed to report incident')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Report Incident — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving || !incidentType} className="flex-1 btn-danger">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Reporting…</> : 'Report Incident'}
        </button>
      </>
    }>
      <Field label="Incident Date">
        <input type="date" className={inp()} value={form.incident_date} max={todayDate}
          onChange={e => set('incident_date', e.target.value)} />
        {form.incident_date !== todayDate && (
          <p className="text-xs text-amber-500 mt-1">⚠ Backdated entry — {new Date(form.incident_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</p>
        )}
      </Field>
      <Field label="Incident Type" required>
        <select className={inp()} value={incidentType} onChange={e => setIncidentType(e.target.value)}>
          <option value="">Select what happened…</option>
          {INCIDENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
        </select>
        {incidentType && <p className="text-xs text-slate-500 mt-1">{INCIDENT_OPTIONS.find(o => o.value === incidentType)?.desc}</p>}
      </Field>

      {incidentType === 'breakdown' && (
        <>
          <Field label="Cause of breakdown" required>
            <VoiceTextarea value={form.breakdown_cause} onChange={v => set('breakdown_cause', v)} placeholder="What failed — e.g. hydraulic hose burst, engine overheating…" rows={3} />
          </Field>
          <Field label="What needs to be done to fix it">
            <VoiceTextarea value={form.rectification_needed} onChange={v => set('rectification_needed', v)} placeholder="Repair / replacement needed?" rows={2} />
          </Field>
          <Field label="Additional Notes">
            <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Any other details…" rows={2} />
          </Field>
          <GPSField location={location} loading={gpsLoading} />
        </>
      )}
      {(incidentType === 'unscheduled_maintenance' || incidentType === 'regular_maintenance') && (
        <>
          <Field label="Description" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="What issue / what service is being done?" rows={3} />
          </Field>
          <Field label="Action Taken">
            <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)} placeholder="What was done?" rows={2} />
          </Field>
        </>
      )}
      {incidentType === 'damage' && (
        <>
          <Field label="How did the damage happen?" required>
            <VoiceTextarea value={form.damage_cause} onChange={v => set('damage_cause', v)} placeholder="e.g. lorry hit the equipment, rope snapped…" rows={3} />
          </Field>
          <Field label="Describe the damage">
            <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Which part? How severe?" rows={2} />
          </Field>
          <Field label="What needs to be done?">
            <VoiceTextarea value={form.what_needs_to_be_done} onChange={v => set('what_needs_to_be_done', v)} placeholder="Repair needed?" rows={2} />
          </Field>
          <GPSField location={location} loading={gpsLoading} />
          <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-2.5 text-xs text-orange-300">⚠ Admin will be notified automatically</div>
        </>
      )}
      {incidentType === 'theft' && (
        <>
          <Field label="What was stolen?" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Describe what was stolen…" rows={3} />
          </Field>
          <GPSField location={location} loading={gpsLoading} />
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2.5 text-xs text-red-300">🚨 Admin will be notified immediately</div>
        </>
      )}
      {(incidentType === 'safety_issue' || incidentType === 'accident') && (
        <>
          <Field label="Severity">
            <div className="grid grid-cols-4 gap-2">
              {INCIDENT_SEVERITY.map(s => (
                <button key={s.value} type="button" onClick={() => set('severity', s.value)}
                  className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-all
                    ${form.severity === s.value ? 'border-primary-500 bg-primary-500/10 text-primary-300' : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={incidentType === 'accident' ? 'What happened?' : 'What is the safety issue?'} required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Describe clearly…" rows={3} />
          </Field>
          <Field label="Immediate action taken">
            <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)} placeholder="What was done right after?" rows={2} />
          </Field>
          <GPSField location={location} loading={gpsLoading} />
        </>
      )}
      {incidentType === 'near_miss' && (
        <>
          <Field label="What almost happened?" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Describe what could have gone wrong…" rows={3} />
          </Field>
          <Field label="Action to prevent recurrence">
            <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)} placeholder="What was done to prevent this?" rows={2} />
          </Field>
        </>
      )}
      {incidentType === 'other' && (
        <Field label="Description" required>
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Describe the issue…" rows={4} />
        </Field>
      )}
    </Modal>
  )
}

// ── Equipment P&L Tab (inline, single-machine) ────────────────────────────────
const DIESEL_LPL = 95 // ₹/litre fallback rate

function EquipmentPLTab({ equipment, companyId }) {
  const today = new Date()
  const defFrom = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
  const defTo   = today.toISOString().slice(0,10)
  const [from, setFrom] = useState(defFrom)
  const [to,   setTo]   = useState(defTo)

  const fmtM = n => `₹${Math.round(n).toLocaleString('en-IN')}`

  // 1. Daily operations — hours + fuel consumed
  const { data: ops = [], isLoading: opsLoad } = useQuery({
    queryKey: ['eq_pl_ops', equipment.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('daily_operations')
        .select('ops_date, running_hours, fuel_consumed, status')
        .eq('equipment_id', equipment.id)
        .gte('ops_date', from).lte('ops_date', to)
      return data || []
    },
  })

  // 2. Fuel issues — what was actually issued (litres)
  const { data: fuelIssues = [] } = useQuery({
    queryKey: ['eq_pl_fuel', equipment.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('fuel_issues')
        .select('id, issue_date, qty_liters, rate_per_litre, issued_by, notes')
        .eq('equipment_id', equipment.id)
        .gte('issue_date', from).lte('issue_date', to)
        .order('issue_date', { ascending: false })
      return data || []
    },
  })

  // 3. Deployment (most recent overlapping) — for revenue
  const { data: deployment } = useQuery({
    queryKey: ['eq_pl_depl', equipment.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_deployments')
        .select('billing_basis, rate_per_hour, rate_per_day, rate_per_month, rate_unit, rental_rate, max_hours_per_day, fuel_by_client, project:project_id(name)')
        .eq('equipment_id', equipment.id)
        .lte('deployed_date', to)
        .or(`withdrawn_date.is.null,withdrawn_date.gte.${from}`)
        .order('deployed_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  // 4. Job cards (maintenance) closed in period
  const { data: jobCards = [] } = useQuery({
    queryKey: ['eq_pl_jobs', equipment.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('job_cards')
        .select('id, jc_number, jc_type, description, total_cost, opened_at, closed_at, status')
        .eq('equipment_id', equipment.id)
        .eq('status', 'closed')
        .gte('closed_at', from).lte('closed_at', to)
        .order('closed_at', { ascending: false })
      return data || []
    },
  })

  // 5. Expenses + bills tagged to this equipment
  const { data: taggedExp = [] } = useQuery({
    queryKey: ['eq_pl_exp', equipment.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('expenses')
        .select('id, expense_date, category, description, total_amount, vendor_name, payment_mode')
        .eq('equipment_id', equipment.id)
        .eq('company_id', companyId)
        .gte('expense_date', from).lte('expense_date', to)
        .order('expense_date', { ascending: false })
      return data || []
    },
  })

  const { data: taggedBills = [] } = useQuery({
    queryKey: ['eq_pl_bills', equipment.id, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('bills')
        .select('id, bill_number, bill_date, vendor_name, description, total_amount, status')
        .eq('equipment_id', equipment.id)
        .eq('company_id', companyId)
        .neq('status', 'cancelled')
        .gte('bill_date', from).lte('bill_date', to)
        .order('bill_date', { ascending: false })
      return data || []
    },
  })

  const pl = useMemo(() => {
    const workedOps    = ops.filter(o => o.status !== 'breakdown')
    const totalHrs     = workedOps.reduce((s, o) => s + Number(o.running_hours || 0), 0)
    const workedDays   = new Set(workedOps.map(o => o.ops_date)).size
    const fuelConsumed = workedOps.reduce((s, o) => s + Number(o.fuel_consumed || 0), 0)
    const brkDays      = new Set(ops.filter(o => o.status === 'breakdown').map(o => o.ops_date)).size

    // Fuel cost: use issued qty × rate (or fallback DIESEL_LPL)
    const fuelIssuedL = fuelIssues.reduce((s, f) => s + Number(f.qty_liters || 0), 0)
    const fuelCostRaw = fuelIssues.reduce((s, f) => s + (Number(f.qty_liters || 0) * (Number(f.rate_per_litre || 0) || DIESEL_LPL)), 0)
    const fuelCost    = fuelCostRaw

    // Maintenance cost
    const maintCost = jobCards.reduce((s, j) => s + Number(j.total_cost || 0), 0)

    // Other expenses
    const otherCost = taggedExp.reduce((s, e) => s + Number(e.total_amount || 0), 0)
    const billCost  = taggedBills.reduce((s, b) => s + Number(b.total_amount || 0), 0)

    const totalExp = fuelCost + maintCost + otherCost + billCost

    // Revenue from deployment rate + daily_operations
    let revenue = 0
    let rateLabel = null
    if (deployment) {
      const basis = deployment.billing_basis || deployment.rate_unit || 'hourly'
      if ((basis === 'hourly' || basis === 'short_term_hourly') && (deployment.rate_per_hour || deployment.rental_rate)) {
        const rate = Number(deployment.rate_per_hour || deployment.rental_rate)
        revenue = rate * totalHrs
        rateLabel = `₹${rate.toLocaleString('en-IN')}/hr × ${totalHrs.toFixed(1)} hrs`
      } else if (basis === 'daily' && deployment.rate_per_day) {
        const rate = Number(deployment.rate_per_day)
        revenue = rate * workedDays
        rateLabel = `₹${rate.toLocaleString('en-IN')}/day × ${workedDays} days`
      } else if (basis === 'monthly' && deployment.rate_per_month) {
        // pro-rate: (workedDays / 26) × monthly rate
        const rate = Number(deployment.rate_per_month)
        revenue = (workedDays / 26) * rate
        rateLabel = `₹${rate.toLocaleString('en-IN')}/mo (pro-rated ${workedDays} days)`
      }
    }

    const netPL = revenue - totalExp

    // Fuel alert
    const stdLph = equipment.specific_consumption_lph ? Number(equipment.specific_consumption_lph) : null
    let fuelAlert = null
    if (stdLph && totalHrs > 0 && fuelConsumed > 0) {
      const expected  = stdLph * totalHrs
      const excessPct = ((fuelConsumed - expected) / expected) * 100
      if (excessPct > 10) fuelAlert = { actual: fuelConsumed, expected: Math.round(expected), excessPct: Math.round(excessPct) }
    }

    return { totalHrs: Math.round(totalHrs*10)/10, workedDays, brkDays, fuelIssuedL: Math.round(fuelIssuedL), fuelConsumed: Math.round(fuelConsumed), fuelCost: Math.round(fuelCost), maintCost: Math.round(maintCost), otherCost: Math.round(otherCost), billCost: Math.round(billCost), totalExp: Math.round(totalExp), revenue: Math.round(revenue), netPL: Math.round(netPL), rateLabel, fuelAlert }
  }, [ops, fuelIssues, deployment, jobCards, taggedExp, taggedBills, equipment])

  const [drilldown, setDrilldown] = useState(null) // 'fuel' | 'maintenance' | 'expenses' | 'bills'
  const toggleDrill = key => setDrilldown(d => d === key ? null : key)

  const inp = 'bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-primary-500'

  return (
    <div className="space-y-4 pt-1">
      {/* Date range picker */}
      <div className="flex items-center gap-3 flex-wrap bg-dark-800/60 border border-dark-700 rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">From</span>
          <input type="date" className={inp} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">To</span>
          <input type="date" className={inp} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        {/* Quick selectors */}
        {[
          { l: 'This Month', f: defFrom, t: defTo },
          { l: 'Last Month', f: (() => { const d=new Date(today.getFullYear(), today.getMonth()-1,1); return d.toISOString().slice(0,10) })(), t: (() => { const d=new Date(today.getFullYear(), today.getMonth(),0); return d.toISOString().slice(0,10) })() },
          { l: 'This Year',  f: `${today.getFullYear()}-01-01`, t: defTo },
        ].map(({ l, f, t }) => (
          <button key={l} onClick={() => { setFrom(f); setTo(t) }}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${from===f&&to===t?'bg-primary-600 border-primary-500 text-white':'border-dark-600 text-slate-500 hover:text-slate-300'}`}>
            {l}
          </button>
        ))}
        {opsLoad && <span className="text-[10px] text-slate-500 ml-auto">Loading…</span>}
      </div>

      {/* Fuel alert */}
      {pl.fuelAlert && (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-300">Over-consumption alert</p>
            <p className="text-[11px] text-amber-400 mt-0.5">
              Consumed {pl.fuelAlert.actual} L vs standard {pl.fuelAlert.expected} L — <b>+{pl.fuelAlert.excessPct}% over benchmark</b>. Check for idling or leaks.
            </p>
          </div>
        </div>
      )}

      {/* Revenue source info */}
      {deployment && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-dark-800/40 rounded-lg px-3 py-1.5">
          <span className="text-primary-400">⚡</span>
          <span>Revenue: {deployment.project?.name || 'Active deployment'}</span>
          {pl.rateLabel && <span className="ml-1 text-slate-600">· {pl.rateLabel}</span>}
        </div>
      )}
      {!deployment && (
        <div className="text-[11px] text-slate-500 bg-dark-800/40 rounded-lg px-3 py-1.5">
          No active deployment rate card — revenue shown as ₹0. Add a rate card in the Deployment tab.
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 mb-0.5">Revenue</p>
          <p className="text-lg font-bold text-green-400">{fmtM(pl.revenue)}</p>
        </div>
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 mb-0.5">Total Expenses</p>
          <p className="text-lg font-bold text-red-400">{fmtM(pl.totalExp)}</p>
        </div>
        <div className={`rounded-xl p-3 text-center border ${pl.netPL >= 0 ? 'bg-green-500/10 border-green-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
          <p className="text-[10px] text-slate-500 mb-0.5">Net P&L</p>
          <p className={`text-lg font-bold ${pl.netPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtM(pl.netPL)}</p>
        </div>
      </div>

      {/* Ops summary row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { l: 'Hours Worked', v: `${pl.totalHrs} hrs` },
          { l: 'Working Days', v: `${pl.workedDays}d` },
          { l: 'Breakdown Days', v: `${pl.brkDays}d`, red: pl.brkDays > 0 },
          { l: 'Fuel Issued', v: `${pl.fuelIssuedL} L` },
        ].map(({ l, v, red }) => (
          <div key={l} className="bg-dark-800/60 border border-dark-700/60 rounded-xl p-2.5 text-center">
            <p className="text-[9px] text-slate-500 mb-0.5">{l}</p>
            <p className={`text-sm font-bold ${red ? 'text-red-400' : 'text-slate-300'}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Expense breakdown */}
      <div className="bg-dark-800/60 border border-dark-700 rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-dark-700/60">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Expense Breakdown</p>
        </div>

        {/* ── Fuel Cost ── */}
        <div className="border-b border-dark-700/40">
          <button onClick={() => toggleDrill('fuel')}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-dark-700/30 transition-colors text-left">
            <div className="flex items-center gap-2">
              <ChevronRight className={`w-3 h-3 text-slate-500 transition-transform ${drilldown === 'fuel' ? 'rotate-90' : ''}`} />
              <div>
                <p className="text-xs text-slate-300">Fuel Cost</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{pl.fuelIssuedL > 0 ? `${pl.fuelIssuedL} L issued` : 'no issues logged'}</p>
              </div>
            </div>
            <span className={`text-sm font-semibold ${pl.fuelCost > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{fmtM(pl.fuelCost)}</span>
          </button>
          {drilldown === 'fuel' && (
            <div className="border-t border-dark-700/40 bg-dark-900/40 px-3 py-2">
              {fuelIssues.length === 0 ? (
                <p className="text-[11px] text-slate-600 py-1">No fuel issues in this period.</p>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-dark-700/40">
                      <th className="text-left pb-1.5 font-medium">Date</th>
                      <th className="text-right pb-1.5 font-medium">Qty (L)</th>
                      <th className="text-right pb-1.5 font-medium">Rate</th>
                      <th className="text-right pb-1.5 font-medium">Amount</th>
                      <th className="text-left pb-1.5 font-medium pl-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelIssues.map(f => {
                      const rate = Number(f.rate_per_litre || 0) || DIESEL_LPL
                      const amt  = Number(f.qty_liters || 0) * rate
                      return (
                        <tr key={f.id} className="border-b border-dark-700/20 last:border-b-0">
                          <td className="py-1.5 text-slate-400">{f.issue_date}</td>
                          <td className="py-1.5 text-right text-slate-300">{Number(f.qty_liters || 0).toFixed(1)}</td>
                          <td className="py-1.5 text-right text-slate-500">₹{rate}/L</td>
                          <td className="py-1.5 text-right text-amber-400 font-medium">{fmtM(amt)}</td>
                          <td className="py-1.5 pl-3 text-slate-600">{f.notes || f.issued_by || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── Maintenance ── */}
        <div className="border-b border-dark-700/40">
          <button onClick={() => toggleDrill('maintenance')}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-dark-700/30 transition-colors text-left">
            <div className="flex items-center gap-2">
              <ChevronRight className={`w-3 h-3 text-slate-500 transition-transform ${drilldown === 'maintenance' ? 'rotate-90' : ''}`} />
              <div>
                <p className="text-xs text-slate-300">Maintenance</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{jobCards.length} job card{jobCards.length !== 1 ? 's' : ''} closed</p>
              </div>
            </div>
            <span className={`text-sm font-semibold ${pl.maintCost > 0 ? 'text-orange-400' : 'text-slate-600'}`}>{fmtM(pl.maintCost)}</span>
          </button>
          {drilldown === 'maintenance' && (
            <div className="border-t border-dark-700/40 bg-dark-900/40 px-3 py-2">
              {jobCards.length === 0 ? (
                <p className="text-[11px] text-slate-600 py-1">No closed job cards in this period.</p>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-dark-700/40">
                      <th className="text-left pb-1.5 font-medium">JC #</th>
                      <th className="text-left pb-1.5 font-medium">Type</th>
                      <th className="text-left pb-1.5 font-medium">Description</th>
                      <th className="text-right pb-1.5 font-medium">Closed</th>
                      <th className="text-right pb-1.5 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobCards.map(j => (
                      <tr key={j.id} className="border-b border-dark-700/20 last:border-b-0">
                        <td className="py-1.5 text-primary-400 font-medium">{j.jc_number || '—'}</td>
                        <td className="py-1.5 text-slate-400 capitalize">{j.jc_type || '—'}</td>
                        <td className="py-1.5 text-slate-500 max-w-[140px] truncate">{j.description || '—'}</td>
                        <td className="py-1.5 text-right text-slate-400">{j.closed_at ? j.closed_at.slice(0,10) : '—'}</td>
                        <td className="py-1.5 text-right text-orange-400 font-medium">{fmtM(Number(j.total_cost || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── Other Expenses ── */}
        <div className="border-b border-dark-700/40">
          <button onClick={() => toggleDrill('expenses')}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-dark-700/30 transition-colors text-left">
            <div className="flex items-center gap-2">
              <ChevronRight className={`w-3 h-3 text-slate-500 transition-transform ${drilldown === 'expenses' ? 'rotate-90' : ''}`} />
              <div>
                <p className="text-xs text-slate-300">Other Expenses</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{taggedExp.length} expense record{taggedExp.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <span className={`text-sm font-semibold ${pl.otherCost > 0 ? 'text-slate-300' : 'text-slate-600'}`}>{fmtM(pl.otherCost)}</span>
          </button>
          {drilldown === 'expenses' && (
            <div className="border-t border-dark-700/40 bg-dark-900/40 px-3 py-2">
              {taggedExp.length === 0 ? (
                <p className="text-[11px] text-slate-600 py-1">No expenses tagged to this machine in this period.</p>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-dark-700/40">
                      <th className="text-left pb-1.5 font-medium">Date</th>
                      <th className="text-left pb-1.5 font-medium">Category</th>
                      <th className="text-left pb-1.5 font-medium">Description</th>
                      <th className="text-left pb-1.5 font-medium">Vendor</th>
                      <th className="text-right pb-1.5 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taggedExp.map(e => (
                      <tr key={e.id} className="border-b border-dark-700/20 last:border-b-0">
                        <td className="py-1.5 text-slate-400">{e.expense_date}</td>
                        <td className="py-1.5 text-slate-400 capitalize">{e.category || '—'}</td>
                        <td className="py-1.5 text-slate-500 max-w-[120px] truncate">{e.description || '—'}</td>
                        <td className="py-1.5 text-slate-500 max-w-[100px] truncate">{e.vendor_name || '—'}</td>
                        <td className="py-1.5 text-right text-slate-300 font-medium">{fmtM(Number(e.total_amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── Vendor Bills ── */}
        <div>
          <button onClick={() => toggleDrill('bills')}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-dark-700/30 transition-colors text-left">
            <div className="flex items-center gap-2">
              <ChevronRight className={`w-3 h-3 text-slate-500 transition-transform ${drilldown === 'bills' ? 'rotate-90' : ''}`} />
              <div>
                <p className="text-xs text-slate-300">Vendor Bills</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{taggedBills.length} bill{taggedBills.length !== 1 ? 's' : ''} tagged</p>
              </div>
            </div>
            <span className={`text-sm font-semibold ${pl.billCost > 0 ? 'text-slate-300' : 'text-slate-600'}`}>{fmtM(pl.billCost)}</span>
          </button>
          {drilldown === 'bills' && (
            <div className="border-t border-dark-700/40 bg-dark-900/40 px-3 py-2">
              {taggedBills.length === 0 ? (
                <p className="text-[11px] text-slate-600 py-1">No bills tagged to this machine in this period.</p>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-dark-700/40">
                      <th className="text-left pb-1.5 font-medium">Bill #</th>
                      <th className="text-left pb-1.5 font-medium">Date</th>
                      <th className="text-left pb-1.5 font-medium">Vendor</th>
                      <th className="text-left pb-1.5 font-medium">Description</th>
                      <th className="text-left pb-1.5 font-medium">Status</th>
                      <th className="text-right pb-1.5 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taggedBills.map(b => (
                      <tr key={b.id} className="border-b border-dark-700/20 last:border-b-0">
                        <td className="py-1.5 text-primary-400 font-medium">{b.bill_number || '—'}</td>
                        <td className="py-1.5 text-slate-400">{b.bill_date}</td>
                        <td className="py-1.5 text-slate-500 max-w-[100px] truncate">{b.vendor_name || '—'}</td>
                        <td className="py-1.5 text-slate-500 max-w-[120px] truncate">{b.description || '—'}</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            b.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                            b.status === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>{b.status}</span>
                        </td>
                        <td className="py-1.5 text-right text-slate-300 font-medium">{fmtM(Number(b.total_amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-3 py-2.5 bg-dark-900/40 border-t border-dark-700/60">
          <span className="text-xs font-semibold text-slate-300">Total Expenses</span>
          <span className="text-sm font-bold text-red-400">{fmtM(pl.totalExp)}</span>
        </div>
      </div>

      {pl.totalHrs === 0 && pl.totalExp === 0 && (
        <div className="text-center py-8 text-slate-500 text-xs">
          No operations or expenses recorded for this period.
        </div>
      )}
    </div>
  )
}

// ── Equipment Detail ──────────────────────────────────────────────────────────
function EquipmentDetail({ equipment: equipmentProp, companyId, onClose, onNavigate }) {
  const [modal,         setModal]         = useState(null)
  const [showEdit,      setShowEdit]      = useState(false)
  const [equipment,     setEquipment]     = useState(equipmentProp)
  const [detailTab,     setDetailTab]     = useState('deployment')
  const [remarksText,   setRemarksText]   = useState(equipmentProp.notes || '')
  const [savingRemarks, setSavingRemarks] = useState(false)
  const qc   = useQueryClient()
  const { role } = useAuth()
  const isAdmin  = ['admin', 'superadmin', 'manager'].includes(role)

  // Always fetch fresh equipment data on mount — parent snapshot may be stale
  // (e.g. background refetch hadn't completed when user reopened the modal)
  useEffect(() => {
    supabase.from('equipment').select('*').eq('id', equipmentProp.id).single()
      .then(({ data }) => { if (data) setEquipment(data) })
  }, [equipmentProp.id]) // eslint-disable-line

  // Refresh equipment when edit completes
  const refreshEquipment = async () => {
    const { data } = await supabase.from('equipment').select('*').eq('id', equipment.id).single()
    if (data) setEquipment(data)
  }

  // Delete equipment
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('equipment').delete().eq('id', equipment.id)
    if (error) { toast.error('Delete failed: ' + error.message); setDeleting(false); return }
    qc.invalidateQueries(['equipment', companyId])
    toast.success(`${equipment.name} deleted`)
    onClose()
  }

  // ── Admin deploy state ───────────────────────────────────────────────────────
  const [deployClientId,   setDeployClientId]   = useState(equipmentProp.current_client_id  || '')
  const [deployProjectId,  setDeployProjectId]  = useState(equipmentProp.current_project_id || '')
  const [deploySiteName,   setDeploySiteName]   = useState(equipmentProp.current_site_name  || '')
  const [deployRateItemId, setDeployRateItemId] = useState('')
  const [deployFuelByClient, setDeployFuelByClient] = useState(equipmentProp.fuel_by_client || false)
  const [deployFormSynced, setDeployFormSynced] = useState(false)

  // Deployment record fields
  const [deployHourMeter,        setDeployHourMeter]        = useState(equipmentProp.current_meter_reading || '')
  const [deployOperatorName,     setDeployOperatorName]     = useState('')
  const [deploySiteIncharge,     setDeploySiteIncharge]     = useState('')
  const [deployWorkOrderRef,     setDeployWorkOrderRef]     = useState('')
  const [deployMachinePhotoUrl,  setDeployMachinePhotoUrl]  = useState('')
  const [deployMeterPhotoUrl,    setDeployMeterPhotoUrl]    = useState('')
  const { location: deployGpsLoc, loading: deployGpsLoading } = useGPS()

  // Re-sync deploy form when fresh equipment data arrives (on mount fetch above)
  useEffect(() => {
    if (deployFormSynced) return   // don't overwrite user changes after initial sync
    if (!equipment.current_project_id && !equipment.current_client_id) return
    setDeployClientId(equipment.current_client_id  || '')
    setDeployProjectId(equipment.current_project_id || '')
    setDeploySiteName(equipment.current_site_name  || '')
    setDeployFuelByClient(equipment.fuel_by_client || false)
    setDeployFormSynced(true)
  }, [equipment, deployFormSynced]) // eslint-disable-line
  const [deploySaving,     setDeploySaving]     = useState(false)
  // TC capture state — shown when a transfer between projects is detected
  const [showTCModal,      setShowTCModal]      = useState(false)
  const [tcPending,        setTcPending]        = useState(null)   // { fromProject, toProject, fromDepId }
  const [newOperator,      setNewOperator]      = useState('')
  const [newShiftType,     setNewShiftType]     = useState('day')
  const [operatorSaving,   setOperatorSaving]   = useState(false)

  // ── Shift Schedule state ─────────────────────────────────────────────────────
  const SHIFT_DEFAULTS = [
    { label: 'Day',   start: '06:00', end: '18:00' },
    { label: 'Night', start: '18:00', end: '06:00' },
    { label: 'Mid',   start: '14:00', end: '22:00' },
  ]
  const [shiftCount,     setShiftCount]     = useState(1)
  const [shiftRows,      setShiftRows]      = useState(SHIFT_DEFAULTS)   // [{label,start,end}]
  const [alertEnabled,   setAlertEnabled]   = useState(true)
  const [graceMinutes,   setGraceMinutes]   = useState(30)
  const [scheduleSaving, setScheduleSaving] = useState(false)

  // ── Maintenance module state ──────────────────────────────────────────────────
  const [maintSubTab, setMaintSubTab] = useState('job_cards')
  const [jcFilter,    setJcFilter]    = useState('all')
  const [jcModal,     setJcModal]     = useState(null)  // null | {} (new) | job_card (edit)
  const [pmModal,     setPmModal]     = useState(null)  // null | {} (new) | pm_schedule (edit)

  // ── Utilization calendar state ────────────────────────────────────────────────
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [calSelectedDay, setCalSelectedDay] = useState(null) // 'YYYY-MM-DD' or null

  const setShiftRow = (i, key, val) =>
    setShiftRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ['equipment_assignments', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_assignments')
        .select('id, employee_id, employee_name, employee_number, shift_type, status')
        .eq('equipment_id', equipment.id).order('employee_name')
      return data || []
    },
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, business_name, display_name').eq('company_id', companyId).order('business_name')
      return data || []
    },
    enabled: isAdmin,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects_for_deploy', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('projects')
        .select('id, project_name, project_code, client_id').eq('company_id', companyId).order('project_name')
      return data || []
    },
    enabled: isAdmin,
  })

  // Rate card items for the selected deploy project
  // Certifications for the operator selected in the assign form
  const { data: selectedOpCerts = [] } = useQuery({
    queryKey: ['operator_certs_by_emp', companyId, newOperator],
    queryFn: async () => {
      if (!newOperator) return []
      const { data } = await supabase.from('operator_certifications')
        .select('equipment_category, expiry_date')
        .eq('employee_id', newOperator)
      return data || []
    },
    enabled: !!newOperator,
  })

  const certWarning = (() => {
    if (!newOperator || !equipment.category) return null
    const today = new Date().toISOString().slice(0, 10)
    // Look for cert matching equipment category (case-insensitive partial match)
    const match = selectedOpCerts.find(c =>
      equipment.category.toLowerCase().includes(c.equipment_category.toLowerCase()) ||
      c.equipment_category.toLowerCase().includes(equipment.category.toLowerCase().split(/[\s/]+/)[0])
    )
    if (!match) return { level: 'warn', msg: `No certification on record for ${equipment.category}` }
    if (match.expiry_date && match.expiry_date < today) return { level: 'error', msg: `${match.equipment_category} cert expired on ${match.expiry_date}` }
    const warn = new Date(); warn.setDate(warn.getDate() + 30)
    if (match.expiry_date && match.expiry_date <= warn.toISOString().slice(0, 10)) return { level: 'warn', msg: `Cert expiring soon: ${match.expiry_date}` }
    return { level: 'ok', msg: `Certified for ${match.equipment_category}` }
  })()

  const { data: rateItems = [] } = useQuery({
    queryKey: ['rate_items', deployProjectId],
    queryFn: async () => {
      const { data } = await supabase.from('project_rate_items').select('*').eq('project_id', deployProjectId)
      return data || []
    },
    enabled: !!deployProjectId,
  })

  // Active deployment record — pre-populate rate item on open
  const { data: activeDeployment } = useQuery({
    queryKey: ['active_deployment', equipmentProp.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_deployments')
        .select('rate_item_id, hour_meter_at_deployment, operator_name, site_incharge, work_order_ref, machine_photo_url, hour_meter_photo_url, fuel_by_client, deployed_date')
        .eq('equipment_id', equipmentProp.id).eq('status', 'active').maybeSingle()
      return data
    },
  })

  // Fetch project's no_of_shifts to drive operator slot count
  const { data: projectNoOfShifts = 1 } = useQuery({
    queryKey: ['project_no_of_shifts', equipmentProp.current_project_id],
    queryFn: async () => {
      const { data } = await supabase.from('projects')
        .select('no_of_shifts')
        .eq('id', equipmentProp.current_project_id)
        .single()
      return data?.no_of_shifts || 1
    },
    enabled: !!equipmentProp.current_project_id,
    staleTime: 60_000,
  })
  useEffect(() => {
    if (activeDeployment?.rate_item_id && !deployRateItemId) {
      setDeployRateItemId(activeDeployment.rate_item_id)
    }
  }, [activeDeployment]) // eslint-disable-line

  // HR employees eligible to operate equipment (linked from HR module)
  const { data: hrOperators = [] } = useQuery({
    queryKey: ['hr_operators', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id, name, designation, employee_number, user_id')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .in('designation', [
          'Operator/Driver', 'Site Supervisor', 'P&M Manager', 'Labour', 'Helper',
        ])
        .order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Project details for currently deployed project (contacts, PM)
  const { data: deployedProject } = useQuery({
    queryKey: ['project_detail', equipment.current_project_id],
    queryFn: async () => {
      const { data } = await supabase.from('projects')
        .select('project_name, project_code, our_pm_name, our_pm_phone, our_pm_email, our_supervisors, our_pnm_contacts')
        .eq('id', equipment.current_project_id).single()
      return data
    },
    enabled: !!equipment.current_project_id,
  })

  // Shift schedule for this equipment
  const { data: shiftSchedule } = useQuery({
    queryKey: ['shift_schedule', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_shift_schedule')
        .select('*').eq('equipment_id', equipment.id).maybeSingle()
      return data
    },
  })

  // Populate state when schedule loads
  useEffect(() => {
    if (shiftSchedule) {
      setShiftCount(shiftSchedule.shift_count || 1)
      setAlertEnabled(shiftSchedule.alert_enabled ?? true)
      setGraceMinutes(shiftSchedule.grace_minutes ?? 30)
      setShiftRows([
        { label: shiftSchedule.shift1_label || 'Day',   start: shiftSchedule.shift1_start?.slice(0,5) || '06:00', end: shiftSchedule.shift1_end?.slice(0,5) || '18:00' },
        { label: shiftSchedule.shift2_label || 'Night', start: shiftSchedule.shift2_start?.slice(0,5) || '18:00', end: shiftSchedule.shift2_end?.slice(0,5) || '06:00' },
        { label: shiftSchedule.shift3_label || 'Mid',   start: shiftSchedule.shift3_start?.slice(0,5) || '14:00', end: shiftSchedule.shift3_end?.slice(0,5) || '22:00' },
      ])
    }
  }, [shiftSchedule])

  const handleSaveSchedule = async () => {
    setScheduleSaving(true)
    try {
      const payload = {
        equipment_id: equipment.id, company_id: companyId,
        shift_count: shiftCount,
        shift1_label: shiftRows[0].label, shift1_start: shiftRows[0].start, shift1_end: shiftRows[0].end,
        shift2_label: shiftCount >= 2 ? shiftRows[1].label : null,
        shift2_start: shiftCount >= 2 ? shiftRows[1].start : null,
        shift2_end:   shiftCount >= 2 ? shiftRows[1].end   : null,
        shift3_label: shiftCount >= 3 ? shiftRows[2].label : null,
        shift3_start: shiftCount >= 3 ? shiftRows[2].start : null,
        shift3_end:   shiftCount >= 3 ? shiftRows[2].end   : null,
        alert_enabled: alertEnabled, grace_minutes: Number(graceMinutes),
        updated_at: new Date().toISOString(),
      }
      const { error } = shiftSchedule
        ? await supabase.from('equipment_shift_schedule').update(payload).eq('equipment_id', equipment.id)
        : await supabase.from('equipment_shift_schedule').insert(payload)
      if (error) throw error
      qc.invalidateQueries(['shift_schedule', equipment.id])
      qc.invalidateQueries(['all_shift_schedules', companyId])
      toast.success('Shift schedule saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save schedule')
    } finally { setScheduleSaving(false) }
  }

  // Equipment stats (lifetime hours + shifts)
  const { data: stats } = useQuery({
    queryKey: ['equipment_stats', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shifts').select('working_hours').eq('equipment_id', equipment.id).eq('status', 'closed')
      const totalHours  = data?.reduce((s, r) => s + Number(r.working_hours || 0), 0) || 0
      return { totalHours: totalHours.toFixed(1), totalShifts: data?.length || 0 }
    },
  })

  // Operator shift log — last 20 shifts on this machine
  const { data: shiftLog = [] } = useQuery({
    queryKey: ['equipment_shift_log', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('id, shift_date, shift_type, operator_name, working_hours, idle_hours, status')
        .eq('equipment_id', equipment.id)
        .order('shift_date', { ascending: false })
        .limit(20)
      return data || []
    },
    staleTime: 60_000,
  })

  // Fuel stats
  const { data: fuelStats } = useQuery({
    queryKey: ['equipment_fuel_stats', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shift_fuel_entries').select('quantity_liters, total_amount').eq('equipment_id', equipment.id)
      return {
        totalLitres: (data?.reduce((s, r) => s + Number(r.quantity_liters || 0), 0) || 0).toFixed(0),
        totalAmount: data?.reduce((s, r) => s + Number(r.total_amount || 0), 0) || 0,
      }
    },
  })

  // Today's activity count — used to distinguish Active vs Idle within a shift window
  const todayStr = new Date().toISOString().split('T')[0]
  const { data: todayActivityCount = 0 } = useQuery({
    queryKey: ['today_activity', equipment.id, todayStr],
    queryFn: async () => {
      const { count } = await supabase
        .from('shift_fuel_entries')
        .select('id', { count: 'exact', head: true })
        .eq('equipment_id', equipment.id)
        .gte('created_at', todayStr + 'T00:00:00')
      return count || 0
    },
    enabled: !!equipment.current_project_id,
    staleTime: 60_000,
  })

  // Derived availability status
  const availStatus = (() => {
    if (equipment.status === 'breakdown')
      return { label: 'Breakdown',   dot: 'bg-red-400',    secondary: null }
    if (equipment.status === 'maintenance')
      return { label: 'Maintenance', dot: 'bg-orange-400', secondary: null }
    if (!equipment.current_project_id)
      return { label: 'Available',   dot: 'bg-emerald-400', secondary: null }

    if (shiftSchedule) {
      const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
      // handles same-day and overnight windows
      const inWin = (s, e, n) => e > s ? (n >= s && n < e) : (n >= s || n < e)
      const now     = new Date()
      const nowMins = now.getHours() * 60 + now.getMinutes()
      const grace   = graceMinutes || 30
      const active  = shiftRows.slice(0, shiftCount)

      for (const s of active) {
        const sm = toMins(s.start), em = toMins(s.end)
        if (inWin(sm, em, nowMins)) {
          let sinceStart = nowMins - sm
          if (sinceStart < 0) sinceStart += 1440
          if (sinceStart < grace) break // still within grace — not yet committed
          if (todayActivityCount > 0)
            return { label: 'Active', dot: 'bg-emerald-400 animate-pulse', secondary: 'Engaged', secondaryDot: 'bg-blue-400' }
          else
            return { label: 'Idle',   dot: 'bg-yellow-400', secondary: 'Engaged', secondaryDot: 'bg-blue-400' }
        }
      }
    }

    return { label: 'Engaged', dot: 'bg-blue-400', secondary: null }
  })()

  const { data: openIncidents = [] } = useQuery({
    queryKey: ['incidents', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shift_incidents').select('*')
        .eq('equipment_id', equipment.id).eq('resolved', false).order('created_at', { ascending: false })
      return data || []
    },
  })

  // Maintenance records from the dedicated maintenance_records table
  const { data: maintRecords = [], refetch: refetchMaint } = useQuery({
    queryKey: ['maint_records', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('maintenance_records')
        .select('*, projects(project_name, project_code)')
        .eq('equipment_id', equipment.id)
        .order('service_date', { ascending: false })
      return data || []
    },
  })

  const { data: pmSchedules = [], refetch: refetchPM } = useQuery({
    queryKey: ['pm_schedules', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('pm_schedules')
        .select('*')
        .eq('equipment_id', equipment.id)
        .eq('is_active', true)
        .order('interval_hours')
      return data || []
    },
    enabled: detailTab === 'maintenance',
  })

  const { data: jobCards = [], refetch: refetchJC } = useQuery({
    queryKey: ['job_cards', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('job_cards')
        .select('*, job_card_parts(*)')
        .eq('equipment_id', equipment.id)
        .order('opened_date', { ascending: false })
      return data || []
    },
    enabled: detailTab === 'maintenance',
  })

  const { data: recentFuel = [] } = useQuery({
    queryKey: ['fuel', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shift_fuel_entries').select('*')
        .eq('equipment_id', equipment.id).order('created_at', { ascending: false }).limit(5)
      return data || []
    },
  })

  // ── Utilization calendar queries ──────────────────────────────────────────────
  const _calY  = calMonth.getFullYear()
  const _calM  = calMonth.getMonth()
  // planned working days target for this machine/month
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput,   setTargetInput]   = useState('')
  const [savingTarget,  setSavingTarget]  = useState(false)
  const { data: utilizationTarget, refetch: refetchTarget } = useQuery({
    queryKey: ['utilization_target', equipment.id, _calY, _calM + 1],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_utilization_targets')
        .select('id, planned_days')
        .eq('equipment_id', equipment.id)
        .eq('year', _calY)
        .eq('month', _calM + 1)
        .maybeSingle()
      return data
    },
    enabled: detailTab === 'shift_schedule',
  })
  const saveTarget = async () => {
    const days = parseInt(targetInput, 10)
    if (isNaN(days) || days < 0 || days > 31) { toast.error('Enter a valid number (0–31)'); return }
    setSavingTarget(true)
    try {
      const { error } = await supabase.from('equipment_utilization_targets')
        .upsert({ equipment_id: equipment.id, company_id: companyId, year: _calY, month: _calM + 1, planned_days: days }, { onConflict: 'equipment_id,year,month' })
      if (error) throw error
      await refetchTarget()
      setEditingTarget(false)
      toast.success('Target saved')
    } catch (err) { toast.error(err.message)
    } finally { setSavingTarget(false) }
  }
  const calMonthStart = `${_calY}-${String(_calM + 1).padStart(2, '0')}-01`
  const calMonthEnd   = (() => {
    const d = new Date(_calY, _calM + 1, 0)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const { data: monthlyOps = [] } = useQuery({
    queryKey: ['monthly_ops', equipment.id, calMonthStart],
    queryFn: async () => {
      const { data } = await supabase.from('daily_operations')
        .select('ops_date,status,running_hours,fuel_consumed')
        .eq('equipment_id', equipment.id)
        .gte('ops_date', calMonthStart)
        .lte('ops_date', calMonthEnd)
      return data || []
    },
    enabled: detailTab === 'shift_schedule',
  })

  const { data: monthlyFuel = [] } = useQuery({
    queryKey: ['monthly_fuel', equipment.id, calMonthStart],
    queryFn: async () => {
      const { data } = await supabase.from('shift_fuel_entries')
        .select('entry_time,quantity_liters')
        .eq('equipment_id', equipment.id)
        .gte('entry_time', calMonthStart + 'T00:00:00')
        .lte('entry_time', calMonthEnd + 'T23:59:59')
      return data || []
    },
    enabled: detailTab === 'shift_schedule',
  })

  // Insurance doc — same queryKey as DocumentsSection so React Query deduplicates
  const { data: allEquipDocs = [] } = useQuery({
    queryKey: ['equipment_docs', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_documents')
        .select('*').eq('equipment_id', equipment.id).order('doc_type')
      return data || []
    },
  })
  const insuranceDoc = allEquipDocs.find(d => d.doc_type === 'insurance')

  // Matched rate items (fuzzy match equipment category to item names)
  const matchedRates = rateItems.filter(r => {
    const itemName = (r.item_name || '').toLowerCase()
    const catWords = equipment.category.toLowerCase().split(/[\s\/()]+/).filter(w => w.length > 3)
    return catWords.some(w => itemName.includes(w))
  })

  // Service progress
  const serviceHrsRemaining = (() => {
    if (!equipment.next_service_meter || !equipment.current_meter_reading) return null
    return Number(equipment.next_service_meter) - Number(equipment.current_meter_reading)
  })()

  const st = STATUS_COLORS[equipment.status] || STATUS_COLORS.active
  const mt = equipment.meter_type

  // ── Admin actions ────────────────────────────────────────────────────────────

  // Phase 1: Detect transfer. If machine is already on a project → show TC capture modal first.
  const handleDeploy = async () => {
    if (!deployProjectId) { toast.error('Select a project to deploy'); return }
    setDeploySaving(true)
    try {
      const { data: existingDep } = await supabase.from('equipment_deployments')
        .select('id, project_id, projects:project_id(project_name)')
        .eq('equipment_id', equipment.id).eq('status', 'active').maybeSingle()
      const fromProjectName = existingDep?.projects?.project_name || null
      const toProjectName   = projects.find(p => p.id === deployProjectId)?.project_name || deployProjectId

      if (fromProjectName) {
        // Transfer detected — pause and show TC capture modal
        setTcPending({ fromProject: fromProjectName, toProject: toProjectName, fromDepId: existingDep.id })
        setShowTCModal(true)
        setDeploySaving(false)
        return
      }
      // Fresh deployment — proceed directly
      await completeDeploy(null, null, null)
    } catch (err) { toast.error(err.message || 'Failed to check deployment')
    } finally { setDeploySaving(false) }
  }

  // Phase 2: Do all DB work, optionally with TC details captured from modal.
  // tcDetails = { fuelLevel, condition, conditionNotes, fromIncharge, fromDesig, toIncharge, toDesig, authorizedBy, meterReading }
  const completeDeploy = async (tcDetails, fromProjectName, fromDepId) => {
    setDeploySaving(true)
    try {
      const selectedRate  = rateItems.find(r => r.id === deployRateItemId) || null
      const effectiveRate = selectedRate || (matchedRates.length === 1 ? matchedRates[0] : null)
      const toProjectName = projects.find(p => p.id === deployProjectId)?.project_name || deployProjectId
      const today         = new Date().toISOString().slice(0, 10)

      // Update equipment current deployment fields
      const { error } = await supabase.from('equipment').update({
        current_client_id:  deployClientId  || null,
        current_project_id: deployProjectId || null,
        current_site_name:  deploySiteName  || null,
        fuel_by_client:     deployFuelByClient,
      }).eq('id', equipment.id)
      if (error) throw error

      // Close active deployment — stamp TC snapshot if it was a transfer
      if (fromDepId) {
        await supabase.from('equipment_deployments')
          .update({
            status:          'withdrawn',
            withdrawn_date:  today,
            tc_from_project: fromProjectName,
            tc_to_project:   toProjectName,
            tc_generated_at: tcDetails ? new Date().toISOString() : null,
          })
          .eq('id', fromDepId)
      } else {
        await supabase.from('equipment_deployments')
          .update({ status: 'withdrawn', withdrawn_date: today })
          .eq('equipment_id', equipment.id).eq('status', 'active')
      }

      // Insert new deployment record
      const legacyRate = effectiveRate
        ? (Number(effectiveRate.rate_per_hour) || Number(effectiveRate.rate_per_day) || Number(effectiveRate.rate_per_month) || 0)
        : 0
      const legacyUnit = effectiveRate?.billing_basis === 'hourly' ? 'per_hour'
        : effectiveRate?.billing_basis === 'monthly' ? 'per_month' : 'per_day'

      await supabase.from('equipment_deployments').insert({
        company_id:          companyId,
        equipment_id:        equipment.id,
        project_id:          deployProjectId,
        client_id:           deployClientId || null,
        deployed_date:       today,
        status:              'active',
        rental_rate:         legacyRate,
        rate_unit:           legacyUnit,
        rate_item_id:        effectiveRate?.id             || null,
        item_name:           effectiveRate?.item_name      || null,
        billing_basis:       effectiveRate?.billing_basis  || null,
        rate_per_hour:       effectiveRate?.rate_per_hour  || null,
        rate_per_day:        effectiveRate?.rate_per_day   || null,
        rate_per_month:      effectiveRate?.rate_per_month || null,
        max_hours_per_day:      effectiveRate?.max_hours_per_day      || 8,
        max_hours_per_month:    effectiveRate?.max_hours_per_month    || 200,
        working_days_per_month: effectiveRate?.working_days_per_month || 26,
        ot_percentage:          effectiveRate?.ot_percentage          || 125,
        fuel_by_client:      deployFuelByClient,
        hour_meter_at_deployment: deployHourMeter !== '' ? Number(deployHourMeter) : null,
        operator_name:        deployOperatorName    || null,
        site_incharge:        deploySiteIncharge    || null,
        work_order_ref:       deployWorkOrderRef    || null,
        machine_photo_url:    deployMachinePhotoUrl || null,
        hour_meter_photo_url: deployMeterPhotoUrl   || null,
        deployment_location:  deployGpsLoc?.address || null,
      })

      setEquipment(e => ({ ...e, current_client_id: deployClientId, current_project_id: deployProjectId, current_site_name: deploySiteName, fuel_by_client: deployFuelByClient }))
      qc.invalidateQueries(['equipment', companyId])
      qc.invalidateQueries(['project_detail', deployProjectId])
      setShowTCModal(false)
      setTcPending(null)

      if (tcDetails && fromProjectName) {
        // Generate TC PDF immediately with the captured details
        const meterForTC = tcDetails.meterReading || deployHourMeter || equipment.current_meter_reading || ''
        const tcData = {
          tcNumber:       `TC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
          tcDate:         today,
          equipmentName:  `${equipment.name}${equipment.equipment_number ? ` (${equipment.equipment_number})` : ''}`,
          equipmentType:  equipment.category || equipment.equipment_type || '',
          registrationNo: equipment.registration_number || '',
          meterReading:   meterForTC,
          meterUnit:      equipment.meter_type === 'km' ? 'km' : 'hrs',
          fromProject:    fromProjectName,
          toProject:      toProjectName,
          fuelLevel:      tcDetails.fuelLevel      || '',
          condition:      tcDetails.condition      || 'Good',
          conditionNotes: tcDetails.conditionNotes || '',
          fromIncharge:   tcDetails.fromIncharge   || '',
          fromDesig:      tcDetails.fromDesig      || '',
          toIncharge:     tcDetails.toIncharge     || '',
          toDesig:        tcDetails.toDesig        || '',
          authorizedBy:   tcDetails.authorizedBy   || userProfile?.full_name || '',
        }
        await downloadTransferCertificate(company, tcData)
        toast.success(`TC generated — ${fromProjectName} → ${toProjectName}`)
      } else {
        toast.success('Equipment deployed successfully')
      }
    } catch (err) { toast.error(err.message || 'Failed to deploy')
    } finally { setDeploySaving(false) }
  }

  const handleAddOperator = async () => {
    if (!newOperator) { toast.error('Select an operator'); return }
    const selectedEmp = hrOperators.find(e => e.id === newOperator)
    if (!selectedEmp) return
    setOperatorSaving(true)
    try {
      const { error } = await supabase.from('equipment_assignments').insert({
        company_id: companyId,
        equipment_id: equipment.id,
        equipment_name: equipment.name,
        employee_id: selectedEmp.id,
        employee_name: selectedEmp.name,
        employee_number: selectedEmp.employee_number || null,
        shift_type: newShiftType === 'double' ? 'general' : newShiftType,
        assignment_role: 'primary_operator',
        status: 'assigned',
      })
      if (error) throw error

      setNewOperator(''); setNewShiftType('day'); refetchAssignments()
      qc.invalidateQueries(['equipment_assignments', equipment.id])
      toast.success(`${selectedEmp.name} assigned — ${newShiftType} shift`)
    } catch (err) { toast.error(err.message || 'Failed to assign operator')
    } finally { setOperatorSaving(false) }
  }

  const handleRemoveOperator = async (assignmentId, name) => {
    await supabase.from('equipment_assignments').delete().eq('id', assignmentId)
    refetchAssignments()
    toast.success(`${name} removed`)
  }

  const ownerTypeLabel = { own: 'Company-Owned', hired: 'Hired-In', client_supplied: 'Client-Supplied' }[equipment.ownership_type] || 'Company-Owned'

  // Build project contact list for currently deployed project
  const projectContacts = (() => {
    if (!deployedProject) return []
    const contacts = []
    if (deployedProject.our_pm_name) contacts.push({ name: deployedProject.our_pm_name, phone: deployedProject.our_pm_phone, email: deployedProject.our_pm_email, role: 'Our Project Manager' })
    const supList = deployedProject.our_supervisors?.length > 0 ? deployedProject.our_supervisors : []
    supList.forEach((s, i) => contacts.push({ name: s.name, phone: s.phone, role: supList.length > 1 ? `Site Supervisor ${i + 1}` : 'Site Supervisor' }))
    const pnmList = deployedProject.our_pnm_contacts?.length > 0 ? deployedProject.our_pnm_contacts : []
    pnmList.forEach((p, i) => contacts.push({ name: p.name, phone: p.phone, role: pnmList.length > 1 ? `P&M In-charge ${i + 1}` : 'P&M In-charge' }))
    return contacts.filter(c => c.name)
  })()

  return (
    <>
      <Modal title={`${equipment.name}${equipment.equipment_number ? ` · ${equipment.equipment_number}` : ''}`} onClose={onClose} wide>

        {/* ══ TOP: Two-column summary panel ══════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">

          {/* LEFT — Equipment Details */}
          <div className="bg-dark-700 rounded-xl p-4 space-y-4">
            {/* Status row + admin actions */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1.5">
                  {[equipment.make, equipment.model, equipment.year_of_manufacture].filter(Boolean).join(' · ')}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
                  <span className="text-xs text-slate-400">{equipment.category}</span>
                  {equipment.registration_number && (
                    <span className="text-xs text-primary-500 font-mono bg-dark-800 px-2 py-0.5 rounded">{equipment.registration_number}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    equipment.ownership_type === 'hired'           ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                    : equipment.ownership_type === 'client_supplied' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                    : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                  }`}>{ownerTypeLabel}</span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setShowEdit(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-500 bg-dark-600 hover:border-primary-500 text-xs text-slate-300 transition-colors">
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  {!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-500 bg-dark-600 hover:border-red-500 hover:text-red-400 text-xs text-slate-300 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      <p className="text-xs text-red-400 text-right">Deletes all shifts, fuel &amp; docs</p>
                      <div className="flex items-center gap-1.5">
                        <button onClick={handleDelete} disabled={deleting}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs text-white font-medium transition-colors">
                          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete
                        </button>
                        <button onClick={() => setConfirmDelete(false)}
                          className="px-2.5 py-1.5 rounded-lg border border-dark-500 bg-dark-700 text-xs text-slate-300 hover:text-slate-100 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Hour Meter — spans full width */}
              <div className="col-span-2 sm:col-span-3 bg-dark-800 rounded-xl p-3.5 flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">
                    {mt === 'kilometers' ? 'Odometer' : 'Hour Meter'}
                    <span className="text-slate-600 ml-2">· updates after every shift</span>
                  </p>
                  <p className="text-3xl font-bold text-primary-300">
                    {Number(equipment.current_meter_reading || 0).toFixed(1)}
                    <span className="text-base font-normal text-slate-400 ml-1">{mt === 'kilometers' ? 'km' : 'hrs'}</span>
                  </p>
                </div>
                {stats && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Total worked</p>
                    <p className="text-sm font-semibold text-slate-200">{stats.totalHours} hrs</p>
                    <p className="text-xs text-slate-500">{stats.totalShifts} shifts</p>
                  </div>
                )}
              </div>

              {/* Active Project */}
              <div className="bg-dark-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Active Project</p>
                {equipment.current_project_id ? (
                  <div>
                    <p className="text-xs font-semibold text-emerald-300 leading-tight">
                      {deployedProject?.project_name || equipment.current_site_name || 'Deployed'}
                    </p>
                    {deployedProject?.project_code && (
                      <p className="text-[10px] text-emerald-500 mt-0.5">{deployedProject.project_code}</p>
                    )}
                    {equipment.current_site_name && (
                      <p className="text-[10px] text-slate-500 mt-0.5">📍 {equipment.current_site_name}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">Not deployed</p>
                )}
              </div>

              {/* Insurance */}
              <div className="bg-dark-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Insurance</p>
                {insuranceDoc ? (
                  <div>
                    {insuranceDoc.reference_number && (
                      <p className="text-xs text-primary-400 font-mono truncate">{insuranceDoc.reference_number}</p>
                    )}
                    {insuranceDoc.expiry_date && (() => {
                      const days = differenceInDays(new Date(insuranceDoc.expiry_date), new Date())
                      return (
                        <p className={`text-xs font-medium mt-0.5 ${days < 0 ? 'text-red-400' : days < 30 ? 'text-orange-400' : 'text-emerald-400'}`}>
                          {days < 0 ? '⚠ Expired' : `Exp: ${format(new Date(insuranceDoc.expiry_date), 'dd MMM yyyy')}`}
                        </p>
                      )
                    })()}
                    {!insuranceDoc.reference_number && !insuranceDoc.expiry_date && (
                      <p className="text-xs text-slate-300">Policy uploaded</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No policy</p>
                )}
              </div>

              {/* Next Service */}
              <div className="bg-dark-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Next Service</p>
                {serviceHrsRemaining !== null ? (
                  <div>
                    <p className={`text-sm font-bold ${serviceHrsRemaining < 50 ? 'text-orange-400' : 'text-emerald-400'}`}>
                      {serviceHrsRemaining > 0 ? `${serviceHrsRemaining.toFixed(0)} hrs` : 'Overdue'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {serviceHrsRemaining < 0 ? `by ${Math.abs(serviceHrsRemaining).toFixed(0)} hrs` : 'remaining'}
                    </p>
                  </div>
                ) : equipment.next_service_date ? (
                  <p className="text-xs text-slate-300">{format(new Date(equipment.next_service_date), 'dd MMM yyyy')}</p>
                ) : (
                  <p className="text-xs text-slate-500 italic">Not set</p>
                )}
              </div>
            </div>

            {/* Physical Attachments */}
            <AttachmentsSection equipment={equipment} companyId={companyId} isAdmin={isAdmin} />
          </div>

          {/* RIGHT — Stacked: Site Operations + Equipment Availability */}
          <div className="flex flex-col gap-3">

            {/* Site Operations */}
            <div className="bg-dark-700 rounded-xl p-3 flex-1">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Site Operations</p>
              <div className="space-y-2">
                <button onClick={() => setModal('fuel')}
                  className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-xl bg-dark-800 border border-dark-600 hover:border-yellow-500 text-slate-200 text-xs font-medium transition-colors">
                  <Fuel className="w-4 h-4 text-yellow-400 shrink-0" /> Log Fuel
                </button>
                <button onClick={() => setModal('incident')}
                  className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-xl bg-dark-800 border border-dark-600 hover:border-orange-500 text-slate-200 text-xs font-medium transition-colors">
                  <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" /> Report Incident
                </button>
              </div>

              {openIncidents.length > 0 && (
                <div className="mt-3 pt-3 border-t border-dark-600">
                  <p className="text-xs text-red-400 font-semibold">⚠ {openIncidents.length} Open Incident{openIncidents.length > 1 ? 's' : ''}</p>
                  {openIncidents.slice(0, 2).map(i => (
                    <p key={i.id} className="text-[10px] text-slate-400 mt-1 truncate">
                      · {INCIDENT_OPTIONS.find(t => t.value === i.incident_type)?.label || i.incident_type}
                    </p>
                  ))}
                </div>
              )}

              {assignments.length > 0 && (
                <div className="mt-3 pt-3 border-t border-dark-600">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Assigned Operators</p>
                  <div className="space-y-1.5">
                    {assignments.map(a => {
                      const shiftEmoji = { day: '☀️', night: '🌙', general: '🔄' }[a.shift_type] || '☀️'
                      return (
                        <div key={a.id} className="flex items-center gap-1.5 text-xs text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="truncate flex-1">{a.employee_name}</span>
                          <span className="shrink-0 text-[10px]">{shiftEmoji}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Equipment Availability */}
            <div className="bg-dark-700 rounded-xl p-3 flex-1">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Equipment Availability</p>

              {/* Status row — Engaged first, then Active/Idle alongside */}
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                {availStatus.secondary ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${availStatus.secondaryDot}`} />
                      <span className="text-sm font-semibold text-slate-100">{availStatus.secondary}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${availStatus.dot}`} />
                      <span className="text-sm font-semibold text-slate-100">{availStatus.label}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${availStatus.dot}`} />
                    <span className="text-sm font-semibold text-slate-100">{availStatus.label}</span>
                  </div>
                )}
              </div>

              {equipment.current_project_id ? (
                <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-2.5 py-2 mt-2">
                  <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-0.5">On Deployment</p>
                  <p className="text-xs text-emerald-300 font-medium leading-tight truncate">
                    {deployedProject?.project_name || equipment.current_site_name || 'Active Project'}
                  </p>
                </div>
              ) : (
                <div className="bg-dark-800 rounded-lg px-2.5 py-2 mt-2">
                  <p className="text-xs text-slate-400">Available for deployment</p>
                </div>
              )}

              {fuelStats && Number(fuelStats.totalLitres) > 0 && (
                <div className="mt-3 pt-3 border-t border-dark-600">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fuel Consumed</p>
                  <p className="text-sm font-bold text-yellow-400">{fuelStats.totalLitres} L</p>
                  {fuelStats.totalAmount > 0 && (
                    <p className="text-xs text-slate-400">₹{Number(fuelStats.totalAmount).toLocaleString('en-IN')}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ Tab Bar ═══════════════════════════════════════════════════════════ */}
        <div className="flex border-b border-dark-600 overflow-x-auto -mb-1">
          {[
            { id: 'deployment',     label: 'Deployment'     },
            { id: 'maintenance',    label: 'Maintenance'    },
            { id: 'operator_log',   label: 'Log'            },
            { id: 'shift_schedule', label: 'Utilization' },
            { id: 'pl',             label: 'Equipment P&L'  },
            { id: 'remarks',        label: 'Remarks'        },
          ].map(t => (
            <button key={t.id} onClick={() => setDetailTab(t.id)}
              className={`shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                detailTab === t.id
                  ? 'border-primary-500 text-primary-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ Tab Content ═══════════════════════════════════════════════════════ */}

        {/* ── DEPLOYMENT TAB ── */}
        {detailTab === 'deployment' && (
          <div className="space-y-4 pt-1">
            {/* Current deployment summary — all roles */}
            {equipment.current_project_id && (
              <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <Activity className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-300">
                      {deployedProject?.project_name || equipment.current_site_name || 'Deployed Project'}
                      {deployedProject?.project_code && (
                        <span className="text-xs text-emerald-500 ml-2">{deployedProject.project_code}</span>
                      )}
                    </p>
                    {equipment.current_site_name && (
                      <p className="text-xs text-slate-400 mt-0.5">📍 {equipment.current_site_name}</p>
                    )}
                  </div>
                </div>
                {projectContacts.length > 0 && (
                  <div className="border-t border-emerald-700/20 pt-2 space-y-1.5">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Project Contacts</p>
                    {projectContacts.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-200 font-medium">{c.name}</span>
                          <span className="text-slate-500 ml-2">· {c.role}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400">
                          {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                          {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Deployment record (read-only) ── */}
            {activeDeployment && (
              <div className="border border-dark-600 rounded-xl overflow-hidden">
                <div className="bg-dark-700 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Deployment Record</span>
                  </div>
                  {activeDeployment.deployed_date && (
                    <span className="text-[10px] text-slate-500">{format(new Date(activeDeployment.deployed_date), 'dd MMM yyyy')}</span>
                  )}
                </div>
                <div className="divide-y divide-dark-600">
                  {activeDeployment.hour_meter_at_deployment != null && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Hour Meter at Deployment</span>
                      <span className="text-xs font-semibold text-slate-200">{activeDeployment.hour_meter_at_deployment} hrs</span>
                    </div>
                  )}
                  {activeDeployment.operator_name && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Operator at Deployment</span>
                      <span className="text-xs font-semibold text-slate-200">{activeDeployment.operator_name}</span>
                    </div>
                  )}
                  {activeDeployment.site_incharge && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Site In-charge</span>
                      <span className="text-xs font-semibold text-slate-200">{activeDeployment.site_incharge}</span>
                    </div>
                  )}
                  {activeDeployment.work_order_ref && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Work Order / PO Ref</span>
                      <span className="text-xs font-mono text-primary-300">{activeDeployment.work_order_ref}</span>
                    </div>
                  )}
                  {activeDeployment.fuel_by_client && (
                    <div className="px-4 py-2.5">
                      <span className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded px-2 py-1">
                        ⛽ Fuel supplied by client — excluded from P&L
                      </span>
                    </div>
                  )}
                  {activeDeployment.machine_photo_url && (
                    <div className="px-4 py-2.5">
                      <p className="text-[10px] text-slate-500 mb-1.5">Machine Photo</p>
                      <img src={activeDeployment.machine_photo_url} alt="Machine at deployment"
                        className="w-full max-w-xs rounded-lg border border-dark-500 object-cover" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Assigned Operators ── */}
            {(() => {
              // slots driven by project's no_of_shifts setting
              // if any assignment is 'double', that single operator covers all shifts → cap at 1
              const hasDouble = assignments.some(a => a.shift_type === 'general')
              const maxSlots = hasDouble ? 1 : (projectNoOfShifts || 1)
              const slotsUsed = assignments.length
              const slotsLeft = maxSlots - slotsUsed
              // which shift types are already taken
              const takenShifts = new Set(assignments.map(a => a.shift_type))
              // smart default for next slot
              const nextShift = takenShifts.has('day') ? 'night' : 'day'
              void nextShift // used for future UX hints

              return (
                <div className="border border-dark-600 rounded-xl overflow-hidden">
                  <div className="bg-dark-700 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Assigned Operators</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {slotsUsed}/{maxSlots} slot{maxSlots > 1 ? 's' : ''} filled
                    </span>
                  </div>

                  {/* existing assignments */}
                  {assignments.length === 0 ? (
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-slate-500">No operators assigned yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-dark-600">
                      {assignments.map(a => {
                        const shiftLabel = { day: '☀️ Day', night: '🌙 Night', general: '🔄 General' }[a.shift_type] || '☀️ Day'
                        return (
                          <div key={a.id} className="px-4 py-2.5 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-medium text-slate-200">{a.employee_name}</span>
                              {a.employee_number && <span className="text-[10px] text-slate-500 ml-1.5">{a.employee_number}</span>}
                              <span className="text-[10px] text-slate-500 ml-2">{shiftLabel}</span>
                            </div>
                            <button onClick={() => handleRemoveOperator(a.id, a.employee_name)}
                              className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* inline assign form — shown when slots available */}
                  {slotsLeft > 0 && (() => {
                    const assignedIds = new Set(assignments.map(a => a.employee_id))
                    const available = hrOperators.filter(e => !assignedIds.has(e.id))
                    return (
                      <div className="border-t border-dark-600 p-3 space-y-2 bg-dark-750">
                        {hrOperators.length === 0 ? (
                          <p className="text-[10px] text-amber-400/80">
                            No operators in HR. Add employees with Operator/Driver designation first.
                          </p>
                        ) : (
                          <>
                            <select
                              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
                              value={newOperator}
                              onChange={e => setNewOperator(e.target.value)}>
                              <option value="">Select operator…</option>
                              {available.map(e => (
                                <option key={e.id} value={e.id}>
                                  {e.name}{e.user_id ? ' 📱' : ''}
                                </option>
                              ))}
                            </select>
                            {certWarning && (
                              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium
                                ${certWarning.level === 'ok'    ? 'bg-green-500/10 text-green-400 border border-green-500/20' : ''}
                                ${certWarning.level === 'warn'  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : ''}
                                ${certWarning.level === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/25' : ''}
                              `}>
                                {certWarning.level === 'ok'    && <CheckCircle className="w-3 h-3 shrink-0" />}
                                {certWarning.level === 'warn'  && <AlertTriangle className="w-3 h-3 shrink-0" />}
                                {certWarning.level === 'error' && <AlertTriangle className="w-3 h-3 shrink-0" />}
                                {certWarning.msg}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <select
                                className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
                                value={newShiftType}
                                onChange={e => setNewShiftType(e.target.value)}>
                                <option value="day">☀️ Day Shift</option>
                                <option value="night">🌙 Night Shift</option>
                                <option value="general">🔄 General Shift</option>
                              </select>
                              <button
                                onClick={handleAddOperator}
                                disabled={operatorSaving || !newOperator}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium disabled:opacity-40 transition-colors shrink-0">
                                {operatorSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                Assign
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}

            {/* ── Deploy / Transfer form (admin only) ── */}
            {isAdmin && (
              <div className={`rounded-xl border overflow-hidden ${equipment.current_project_id ? 'border-amber-700/40 bg-amber-500/5' : 'border-dark-600 bg-dark-800/40'}`}>
                <div className="px-4 py-2.5 border-b border-dark-700/60 flex items-center gap-2">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {equipment.current_project_id ? 'Transfer to Another Project' : 'Deploy to Project'}
                  </span>
                  {equipment.current_project_id && (
                    <span className="text-[10px] text-amber-500 ml-auto">TC will be generated on transfer</span>
                  )}
                </div>
                <div className="p-3 space-y-2.5">
                  {/* Client */}
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Client</label>
                    <select
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500 appearance-none"
                      value={deployClientId}
                      onChange={e => { setDeployClientId(e.target.value); setDeployProjectId('') }}>
                      <option value="">— No client —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.display_name}</option>)}
                    </select>
                  </div>
                  {/* Project */}
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Project <span className="text-red-400">*</span></label>
                    <select
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500 appearance-none"
                      value={deployProjectId}
                      onChange={e => setDeployProjectId(e.target.value)}>
                      <option value="">— Select project —</option>
                      {projects
                        .filter(p => !deployClientId || p.client_id === deployClientId)
                        .map(p => <option key={p.id} value={p.id}>{p.project_name}{p.project_code ? ` · ${p.project_code}` : ''}</option>)}
                    </select>
                  </div>
                  {/* Rate card (if items exist) */}
                  {rateItems.length > 0 && (
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Rate Card Item</label>
                      <select
                        className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500 appearance-none"
                        value={deployRateItemId}
                        onChange={e => setDeployRateItemId(e.target.value)}>
                        <option value="">— Auto-select / none —</option>
                        {rateItems.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.item_name} · {r.billing_basis} · ₹{Number(r.rate_per_hour || r.rate_per_day || r.rate_per_month || 0).toLocaleString('en-IN')}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {/* Fuel by client toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={deployFuelByClient}
                      onChange={e => setDeployFuelByClient(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-amber-500" />
                    <span className="text-xs text-slate-400">Fuel supplied by client</span>
                  </label>
                  {/* Deploy button */}
                  <button
                    onClick={handleDeploy}
                    disabled={deploySaving || !deployProjectId}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 ${
                      equipment.current_project_id
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-primary-600 hover:bg-primary-500 text-white'
                    }`}>
                    {deploySaving
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : equipment.current_project_id
                        ? <ArrowLeftRight className="w-3.5 h-3.5" />
                        : <Activity className="w-3.5 h-3.5" />}
                    {deploySaving ? 'Processing…' : equipment.current_project_id ? 'Transfer Equipment' : 'Deploy Equipment'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MAINTENANCE TAB ── */}
        {detailTab === 'maintenance' && (
          <div className="space-y-3 pt-1">

            {/* Sub-tab bar */}
            <div className="flex gap-0 border-b border-dark-600">
              {[
                { id: 'job_cards',    label: 'Job Cards'    },
                { id: 'pm_schedules', label: 'PM Schedules' },
                { id: 'history',      label: 'History'      },
              ].map(t => {
                const badge = t.id === 'job_cards' ? jobCards.filter(jc => jc.status !== 'closed').length : 0
                return (
                  <button key={t.id} onClick={() => setMaintSubTab(t.id)}
                    className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      maintSubTab === t.id
                        ? 'border-primary-500 text-primary-300'
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}>
                    {t.label}
                    {badge > 0 && (
                      <span className="ml-1.5 bg-primary-500/20 text-primary-400 text-[10px] px-1.5 py-0.5 rounded-full">
                        {badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* ════ JOB CARDS ════ */}
            {maintSubTab === 'job_cards' && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex gap-1 flex-wrap">
                    {['all', 'open', 'in_progress', 'closed'].map(s => (
                      <button key={s} onClick={() => setJcFilter(s)}
                        className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-colors ${
                          jcFilter === s
                            ? 'bg-primary-600 text-white'
                            : 'bg-dark-700 text-slate-400 hover:text-slate-200'
                        }`}>
                        {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                        {s !== 'all' && (
                          <span className="ml-1 opacity-60">({jobCards.filter(j => j.status === s).length})</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {isAdmin && (
                    <button onClick={() => setJcModal({})}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-lg transition-colors">
                      <Plus className="w-3.5 h-3.5" /> New Job Card
                    </button>
                  )}
                </div>

                {(() => {
                  const filtered = jcFilter === 'all' ? jobCards : jobCards.filter(j => j.status === jcFilter)
                  if (filtered.length === 0) return (
                    <div className="text-center py-10">
                      <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">{jcFilter === 'all' ? 'No job cards yet' : `No ${jcFilter.replace('_',' ')} job cards`}</p>
                    </div>
                  )
                  return (
                    <div className="space-y-2">
                      {filtered.map(jc => {
                        const SC = {
                          open:        { label: 'Open',        cls: 'bg-amber-500/15 text-amber-400'     },
                          in_progress: { label: 'In Progress', cls: 'bg-blue-500/15 text-blue-400'       },
                          closed:      { label: 'Closed',      cls: 'bg-emerald-500/15 text-emerald-400' },
                        }[jc.status] || { label: jc.status, cls: 'bg-slate-700 text-slate-400' }
                        const TC = {
                          pm_service:  { label: 'PM Service',  dot: 'bg-blue-400'   },
                          breakdown:   { label: 'Breakdown',   dot: 'bg-red-400'    },
                          unscheduled: { label: 'Unscheduled', dot: 'bg-orange-400' },
                          inspection:  { label: 'Inspection',  dot: 'bg-teal-400'   },
                        }[jc.jc_type] || { label: jc.jc_type, dot: 'bg-slate-400' }
                        const parts = jc.job_card_parts || []
                        return (
                          <div key={jc.id} className="border border-dark-600 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono text-primary-400 font-semibold">{jc.jc_number}</span>
                                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <span className={`w-1.5 h-1.5 rounded-full ${TC.dot}`} />
                                    {TC.label}
                                  </span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SC.cls}`}>{SC.label}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-slate-500">{format(new Date(jc.opened_date), 'dd MMM yyyy')}</span>
                                  {isAdmin && (
                                    <button onClick={() => setJcModal(jc)} className="text-slate-500 hover:text-primary-400 transition-colors">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {jc.complaint && <p className="text-xs text-slate-300 leading-relaxed">{jc.complaint}</p>}
                              {jc.diagnosis && <p className="text-xs text-slate-400 italic">{jc.diagnosis}</p>}
                              <div className="flex gap-4 text-xs flex-wrap">
                                {jc.technician_name && <span className="text-slate-500">🔧 {jc.technician_name}{jc.done_by ? ` (${jc.done_by})` : ''}</span>}
                                {jc.total_cost > 0 && <span className="text-slate-400">Total <span className="text-primary-400 font-semibold">₹{Number(jc.total_cost).toLocaleString('en-IN')}</span></span>}
                                {jc.downtime_hours > 0 && <span className="text-slate-400">Downtime <span className="text-orange-400 font-medium">{jc.downtime_hours}h</span></span>}
                              </div>
                              {parts.length > 0 && (
                                <div className="bg-dark-700/50 rounded-lg p-2 space-y-1">
                                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Parts Used ({parts.length})</p>
                                  {parts.map(p => (
                                    <div key={p.id} className="flex justify-between text-[11px]">
                                      <span className="text-slate-300">{p.part_name}{p.part_number ? ` · ${p.part_number}` : ''}</span>
                                      <span className="text-slate-500">×{p.quantity}{p.total_cost > 0 ? ` · ₹${Number(p.total_cost).toLocaleString('en-IN')}` : ''}</span>
                                    </div>
                                  ))}
                                  {jc.parts_cost > 0 && (
                                    <div className="flex justify-between text-[11px] pt-1 border-t border-dark-600 font-medium">
                                      <span className="text-slate-400">Parts total</span>
                                      <span className="text-slate-200">₹{Number(jc.parts_cost).toLocaleString('en-IN')}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {jcModal !== null && (
                  <JobCardModal
                    equipment={equipment}
                    companyId={companyId}
                    initialValues={jcModal}
                    onClose={() => setJcModal(null)}
                    onSaved={() => { refetchJC(); setJcModal(null) }}
                  />
                )}
              </div>
            )}

            {/* ════ PM SCHEDULES ════ */}
            {maintSubTab === 'pm_schedules' && (
              <div className="space-y-3 pt-1">
                <div className="flex justify-end">
                  {isAdmin && (
                    <button onClick={() => setPmModal({})}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-lg transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add PM Schedule
                    </button>
                  )}
                </div>

                {pmSchedules.length === 0 ? (
                  <div className="text-center py-10">
                    <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No PM schedules defined</p>
                    <p className="text-xs text-slate-600 mt-1">Add intervals like 250hr or 500hr service with task checklists</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pmSchedules.map(pm => {
                      const meter     = Number(equipment.current_meter_reading || 0)
                      const due       = Number(pm.next_due_meter || 0)
                      const remaining = pm.next_due_meter ? due - meter : null
                      const overdue   = remaining !== null && remaining <= 0
                      const nearDue   = remaining !== null && remaining > 0 && remaining <= 50
                      const tasks     = Array.isArray(pm.tasks) ? pm.tasks : []
                      return (
                        <div key={pm.id} className={`border rounded-xl overflow-hidden ${overdue ? 'border-red-600/50' : nearDue ? 'border-orange-500/50' : 'border-dark-600'}`}>
                          <div className={`px-4 py-2.5 flex items-center justify-between ${overdue ? 'bg-red-900/20' : nearDue ? 'bg-orange-900/15' : 'bg-dark-700'}`}>
                            <div className="flex items-center gap-2">
                              <Wrench className={`w-4 h-4 ${overdue ? 'text-red-400' : nearDue ? 'text-orange-400' : 'text-slate-400'}`} />
                              <span className="text-xs font-semibold text-slate-200">{pm.schedule_name}</span>
                              <span className="text-[10px] text-slate-500">Every {pm.interval_hours}hrs</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {overdue  && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">Overdue {Math.abs(remaining).toFixed(0)}hrs</span>}
                              {nearDue  && <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">Due in {remaining.toFixed(0)}hrs</span>}
                              {isAdmin && (
                                <button onClick={() => setPmModal(pm)} className="text-slate-500 hover:text-primary-400 transition-colors">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="px-4 py-3 space-y-2 text-xs">
                            <div className="flex gap-6 flex-wrap">
                              {pm.last_done_meter != null && (
                                <div>
                                  <p className="text-slate-500">Last done at</p>
                                  <p className="text-slate-200 font-medium">
                                    {pm.last_done_meter} hrs
                                    {pm.last_done_date ? ` · ${format(new Date(pm.last_done_date), 'dd MMM yyyy')}` : ''}
                                  </p>
                                </div>
                              )}
                              {pm.next_due_meter != null && (
                                <div>
                                  <p className="text-slate-500">Next due at</p>
                                  <p className={`font-medium ${overdue ? 'text-red-400' : nearDue ? 'text-orange-400' : 'text-emerald-400'}`}>
                                    {pm.next_due_meter} hrs
                                    {remaining !== null && ` (${overdue ? `overdue ${Math.abs(remaining).toFixed(0)}hrs` : `${remaining.toFixed(0)}hrs away`})`}
                                  </p>
                                </div>
                              )}
                            </div>
                            {tasks.length > 0 && (
                              <div className="space-y-1 pt-2 border-t border-dark-600">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Checklist ({tasks.length})</p>
                                {tasks.map((t, i) => (
                                  <div key={i} className="flex items-start gap-2">
                                    <span className="text-slate-600 mt-0.5 shrink-0">□</span>
                                    <span className="text-slate-300">{typeof t === 'string' ? t : t.task}</span>
                                    {t.required && <span className="text-[9px] bg-red-500/10 text-red-400 px-1 rounded shrink-0">req</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            {isAdmin && (overdue || nearDue) && (
                              <button
                                onClick={() => { setMaintSubTab('job_cards'); setJcModal({ jc_type: 'pm_service', pm_schedule_id: pm.id }) }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600/80 hover:bg-primary-600 text-white text-[11px] font-medium rounded-lg transition-colors"
                              >
                                <Plus className="w-3 h-3" /> Raise Job Card for this PM
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {pmModal !== null && (
                  <PMScheduleModal
                    equipment={equipment}
                    companyId={companyId}
                    initialValues={pmModal}
                    onClose={() => setPmModal(null)}
                    onSaved={() => { refetchPM(); setPmModal(null) }}
                  />
                )}
              </div>
            )}

            {/* ════ HISTORY ════ */}
            {maintSubTab === 'history' && (
              <div className="space-y-4 pt-1">
                <div className="border border-dark-600 rounded-xl overflow-hidden">
                  <div className="bg-dark-700 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Maintenance Records</span>
                    </div>
                    <span className="text-xs text-slate-500">{maintRecords.length} record{maintRecords.length !== 1 ? 's' : ''}</span>
                  </div>

                  {maintRecords.length === 0 ? (
                    <div className="p-6 text-center">
                      <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No maintenance records yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-dark-600">
                      {maintRecords.map(rec => {
                        const MTYPE = {
                          preventive:  { label: 'Preventive Maintenance', dot: 'bg-blue-400',   text: 'text-blue-400'   },
                          breakdown:   { label: 'Breakdown Repair',       dot: 'bg-red-400',    text: 'text-red-400'    },
                          accidental:  { label: 'Accidental Damage',      dot: 'bg-red-400',    text: 'text-red-400'    },
                          overhaul:    { label: 'Overhaul',               dot: 'bg-orange-400', text: 'text-orange-400' },
                          inspection:  { label: 'Inspection',             dot: 'bg-teal-400',   text: 'text-teal-400'   },
                          other:       { label: 'Other',                  dot: 'bg-slate-400',  text: 'text-slate-400'  },
                        }
                        const mt = MTYPE[rec.maintenance_type] || MTYPE.other
                        const statusPill = rec.status === 'completed'
                          ? <span className="text-[10px] bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">Completed</span>
                          : rec.status === 'in_progress'
                          ? <span className="text-[10px] bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded-full font-medium">In Progress</span>
                          : <span className="text-[10px] bg-amber-500/15 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">Open</span>
                        return (
                          <div key={rec.id} className="px-4 py-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${mt.dot}`} />
                                <span className={`text-xs font-semibold ${mt.text}`}>{mt.label}</span>
                                {statusPill}
                                {rec.priority === 'high' && (
                                  <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full font-medium">High Priority</span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 shrink-0">
                                {format(new Date(rec.service_date), 'dd MMM yyyy')}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 ml-4 leading-relaxed">{rec.description}</p>
                            {rec.technician_name && (
                              <p className="text-xs text-slate-500 ml-4">
                                🔧 {rec.technician_name}
                                {rec.done_by === 'vendor' ? ' (Vendor)' : rec.done_by === 'inhouse' ? ' (In-house)' : ''}
                              </p>
                            )}
                            {(rec.labour_cost > 0 || rec.total_cost > 0 || rec.downtime_hours > 0) && (
                              <div className="ml-4 flex gap-4 text-xs">
                                {rec.labour_cost > 0 && <span className="text-slate-400">Labour <span className="text-slate-200 font-medium">₹{Number(rec.labour_cost).toLocaleString('en-IN')}</span></span>}
                                {rec.total_cost > 0 && <span className="text-slate-400">Total <span className="text-primary-400 font-semibold">₹{Number(rec.total_cost).toLocaleString('en-IN')}</span></span>}
                                {rec.downtime_hours > 0 && <span className="text-slate-400">Downtime <span className="text-orange-400 font-medium">{rec.downtime_hours}h</span></span>}
                              </div>
                            )}
                            {rec.projects?.project_name && (
                              <p className="text-[10px] text-slate-500 ml-4">📍 {rec.projects.project_name}</p>
                            )}
                            {isAdmin && rec.status !== 'completed' && (
                              <button
                                onClick={async () => {
                                  const { error } = await supabase.from('maintenance_records')
                                    .update({ status: 'completed', completed_date: new Date().toISOString().split('T')[0] })
                                    .eq('id', rec.id)
                                  if (!error) { toast.success('Marked as completed'); refetchMaint() }
                                  else toast.error(error.message)
                                }}
                                className="ml-4 self-start text-[11px] flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors"
                              >
                                <CheckCircle className="w-3 h-3" /> Mark Complete
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Legacy service schedule from equipment fields */}
                {(equipment.last_service_date || equipment.next_service_date || equipment.next_service_meter) && (
                  <div className="border border-dark-600 rounded-xl overflow-hidden">
                    <div className="bg-dark-700 px-4 py-2.5 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Legacy Service Schedule</span>
                    </div>
                    <div className="p-4 space-y-2 text-xs">
                      {equipment.last_service_date && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Last service</span>
                          <span className="text-slate-200 font-medium">
                            {format(new Date(equipment.last_service_date), 'dd MMM yyyy')}
                            {equipment.last_service_meter ? ` · ${equipment.last_service_meter} hrs` : ''}
                          </span>
                        </div>
                      )}
                      {equipment.next_service_meter && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Next service due at</span>
                          <span className={`font-medium ${serviceHrsRemaining !== null && serviceHrsRemaining < 50 ? 'text-orange-400' : 'text-emerald-400'}`}>
                            {equipment.next_service_meter} hrs
                            {serviceHrsRemaining !== null && ` (${serviceHrsRemaining > 0 ? `${serviceHrsRemaining.toFixed(0)} hrs away` : `Overdue by ${Math.abs(serviceHrsRemaining).toFixed(0)} hrs`})`}
                          </span>
                        </div>
                      )}
                      {equipment.next_service_date && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Next service date</span>
                          <span className="text-slate-200">{format(new Date(equipment.next_service_date), 'dd MMM yyyy')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── LOG TAB ── */}
        {detailTab === 'operator_log' && (
          <div className="space-y-5 pt-1">

            {/* ── Operator Attendance Log ─────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Operator Shifts</p>
                {onNavigate && (
                  <button
                    onClick={() => { onClose(); onNavigate('hr') }}
                    className="flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    View in HR &amp; Attendance <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              {shiftLog.length === 0 ? (
                <div className="bg-dark-700/50 rounded-xl border border-dashed border-dark-600 p-6 text-center">
                  <User className="w-7 h-7 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No shift records yet</p>
                </div>
              ) : (
                <div className="divide-y divide-dark-600 rounded-xl overflow-hidden border border-dark-700">
                  {shiftLog.map(s => {
                    const shiftLabel = s.shift_type === 'night' ? '🌙 Night'
                      : s.shift_type === 'mid' ? '🌅 Mid' : '☀️ Day'
                    const hrs = Number(s.working_hours || 0)
                    const idleHrs = Number(s.idle_hours || 0)
                    const statusDot = s.status === 'closed' ? 'bg-emerald-400' : s.status === 'open' ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'
                    return (
                      <div key={s.id} className="px-4 py-3 bg-dark-700/40 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {s.operator_name || '—'}
                            </span>
                            <span className="text-[10px] text-slate-500">{shiftLabel}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 ml-3.5">
                            {format(new Date(s.shift_date), 'dd MMM yyyy')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold text-slate-200">{hrs.toFixed(1)} hrs</p>
                          {idleHrs > 0 && (
                            <p className="text-[10px] text-amber-500">{idleHrs.toFixed(1)} idle</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Fuel Log ────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fuel Entries</p>
                {onNavigate && (
                  <button
                    onClick={() => { onClose(); onNavigate('operations', { tab: 'fuel', equipmentId: equipment.id, equipmentName: equipment.name }) }}
                    className="flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    View in Site Operations <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              {fuelStats && Number(fuelStats.totalLitres) > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-dark-700 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] text-slate-500">Total Consumed</p>
                    <p className="text-lg font-bold text-yellow-400">{fuelStats.totalLitres} <span className="text-xs font-normal text-slate-400">L</span></p>
                  </div>
                  {fuelStats.totalAmount > 0 && (
                    <div className="bg-dark-700 rounded-xl px-3 py-2.5">
                      <p className="text-[10px] text-slate-500">Total Cost</p>
                      <p className="text-lg font-bold text-primary-300">₹{Number(fuelStats.totalAmount).toLocaleString('en-IN')}</p>
                    </div>
                  )}
                </div>
              )}
              {recentFuel.length === 0 ? (
                <div className="bg-dark-700/50 rounded-xl border border-dashed border-dark-600 p-6 text-center">
                  <Fuel className="w-7 h-7 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No fuel entries yet</p>
                </div>
              ) : (
                <div className="divide-y divide-dark-600 rounded-xl overflow-hidden border border-dark-700">
                  {recentFuel.map(f => (
                    <div key={f.id} className="px-4 py-3 bg-dark-700/40 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-200">{f.quantity_liters} L</span>
                          {f.vendor_name && <span className="text-[10px] text-slate-500">· {f.vendor_name}</span>}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {f.delivered_by_name ? `By ${f.delivered_by_name} · ` : ''}
                          {f.created_at ? format(new Date(f.created_at), 'dd MMM yyyy') : ''}
                        </p>
                      </div>
                      {f.total_amount > 0 && (
                        <span className="text-xs font-semibold text-yellow-400 shrink-0">
                          ₹{Number(f.total_amount).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── UTILIZATION TAB ── */}
        {detailTab === 'shift_schedule' && (() => {
          // ── calendar helpers ──────────────────────────────────────────────────
          const opsByDate = {}
          for (const op of monthlyOps) {
            if (!opsByDate[op.ops_date]) opsByDate[op.ops_date] = []
            opsByDate[op.ops_date].push(op)
          }
          const fuelByDate = {}
          for (const f of monthlyFuel) {
            const d = (f.entry_time || '').slice(0, 10)
            if (!d) continue
            fuelByDate[d] = (fuelByDate[d] || 0) + (Number(f.quantity_liters) || 0)
          }

          const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
          const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

          // Build calendar grid: array of weeks, each week has 7 day-slots (null = padding)
          const firstDay  = new Date(_calY, _calM, 1).getDay()   // 0=Sun
          const daysInMon = new Date(_calY, _calM + 1, 0).getDate()
          const slots = []
          for (let i = 0; i < firstDay; i++) slots.push(null)
          for (let d = 1; d <= daysInMon; d++) slots.push(d)
          while (slots.length % 7 !== 0) slots.push(null)
          const weeks = []
          for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7))

          const toDateStr = (day) => `${_calY}-${String(_calM + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

          const getTileKind = (day) => {
            if (!day) return 'pad'
            const ds    = toDateStr(day)
            const date  = new Date(ds + 'T00:00:00')
            const isSun = date.getDay() === 0
            const ops   = opsByDate[ds] || []
            const hasOps = ops.length > 0
            if (isSun)  return hasOps ? 'gold' : 'blue'
            if (!hasOps) return 'empty'
            const statuses    = ops.map(o => o.status)
            const hasBreakdown = statuses.includes('breakdown')
            const hasWorking   = statuses.some(s => s === 'working' || s === 'idle' || s === 'maintenance')
            if (hasBreakdown && hasWorking) return 'diagonal'
            if (hasBreakdown) return 'red'
            return 'green'
          }

          const TILE_STYLES = {
            green:    { bg: 'bg-green-500/80',          border: 'border-green-500/60',  text: 'text-white',          label: 'Worked' },
            red:      { bg: 'bg-red-500/80',             border: 'border-red-500/60',    text: 'text-white',          label: 'Breakdown' },
            blue:     { bg: 'bg-blue-500/20',            border: 'border-blue-500/40',   text: 'text-blue-300',       label: 'Sunday' },
            gold:     { bg: 'bg-yellow-500/80',          border: 'border-yellow-500/60', text: 'text-yellow-900',     label: 'Sunday — Worked' },
            empty:    { bg: 'bg-dark-700/20',            border: 'border-dark-600/30',   text: 'text-slate-600',      label: 'No data' },
            diagonal: { bg: '',                          border: 'border-orange-400/60', text: 'text-white',          label: 'Breakdown Resolved' },
            pad:      { bg: 'bg-transparent',            border: 'border-transparent',   text: '',                    label: '' },
          }

          // Detail for selected day
          const selOps  = calSelectedDay ? (opsByDate[calSelectedDay] || []) : []
          const selFuel = calSelectedDay ? (fuelByDate[calSelectedDay] || 0)  : 0
          const selRunHours  = selOps.reduce((s, o) => s + (Number(o.running_hours) || 0), 0)
          const selFuelCons  = selOps.reduce((s, o) => s + (Number(o.fuel_consumed) || 0), 0)
          const selKind = calSelectedDay ? getTileKind(Number(calSelectedDay.slice(8))) : null

          // ── Planned vs Actual stats ──────────────────────────────────────
          const actualWorkedDays = Object.keys(opsByDate).filter(ds => {
            const ops = opsByDate[ds] || []
            return ops.some(o => o.status === 'working' || o.status === 'idle' || o.status === 'maintenance')
          }).length
          const plannedDays = utilizationTarget?.planned_days ?? null
          const utilPct = (plannedDays && plannedDays > 0) ? Math.round((actualWorkedDays / plannedDays) * 100) : null
          const utilColor = utilPct === null ? 'text-slate-400' : utilPct >= 90 ? 'text-green-400' : utilPct >= 70 ? 'text-amber-400' : 'text-red-400'
          const utilBg    = utilPct === null ? 'bg-dark-700/40 border-dark-600' : utilPct >= 90 ? 'bg-green-500/10 border-green-500/30' : utilPct >= 70 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'

          return (
            <div className="space-y-5 pt-1">

              {/* ── Planned vs Actual banner ──────────────────────────────── */}
              <div className={`rounded-xl border p-3 ${utilBg}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Actual</p>
                      <p className="text-2xl font-bold text-slate-100">{actualWorkedDays}</p>
                      <p className="text-[10px] text-slate-500">days worked</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Planned</p>
                      {editingTarget ? (
                        <div className="flex items-center gap-1 justify-center">
                          <input type="number" min={0} max={31}
                            className="w-14 bg-dark-700 border border-dark-500 rounded px-1.5 py-0.5 text-sm text-center text-slate-100 focus:outline-none"
                            value={targetInput} onChange={e => setTargetInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditingTarget(false) }}
                            autoFocus />
                          <button onClick={saveTarget} disabled={savingTarget}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-primary-600 text-white disabled:opacity-40">
                            {savingTarget ? '…' : '✓'}
                          </button>
                          <button onClick={() => setEditingTarget(false)} className="text-[10px] text-slate-500 hover:text-slate-300">✕</button>
                        </div>
                      ) : (
                        <button className="group flex items-center gap-1 justify-center w-full"
                          onClick={() => { setTargetInput(plannedDays ?? ''); setEditingTarget(true) }}
                          disabled={!isAdmin}>
                          <p className={`text-2xl font-bold ${plannedDays !== null ? 'text-slate-100' : 'text-slate-600'}`}>
                            {plannedDays !== null ? plannedDays : '—'}
                          </p>
                          {isAdmin && <Pencil className="w-3 h-3 text-slate-600 group-hover:text-slate-400 shrink-0 mb-1" />}
                        </button>
                      )}
                      <p className="text-[10px] text-slate-500">days target</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Utilization</p>
                      <p className={`text-2xl font-bold ${utilColor}`}>{utilPct !== null ? `${utilPct}%` : '—'}</p>
                      <p className="text-[10px] text-slate-500">{utilPct === null ? 'set target' : utilPct >= 90 ? 'on track' : utilPct >= 70 ? 'review' : 'below target'}</p>
                    </div>
                  </div>
                </div>
                {!isAdmin && plannedDays === null && (
                  <p className="text-[10px] text-slate-600 text-center mt-2">No planned days set for this month</p>
                )}
              </div>

              {/* ── Calendar section ──────────────────────────────────────── */}
              <div className="bg-dark-800 rounded-xl border border-dark-700 p-3 space-y-2">
                {/* Month navigator */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => { setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)); setCalSelectedDay(null) }}
                    className="p-1 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors">
                    <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                  </button>
                  <span className="text-xs font-semibold text-slate-200">
                    {MONTH_NAMES[_calM]} {_calY}
                  </span>
                  <button
                    onClick={() => { setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)); setCalSelectedDay(null) }}
                    className="p-1 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 gap-0.5">
                  {DAY_LABELS.map(dl => (
                    <div key={dl} className="text-center text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                      {dl}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="space-y-0.5">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-0.5">
                      {week.map((day, di) => {
                        const kind = getTileKind(day)
                        const ts   = TILE_STYLES[kind]
                        const ds   = day ? toDateStr(day) : null
                        const isSelected = ds && ds === calSelectedDay

                        if (kind === 'pad') {
                          return <div key={di} className="h-8 rounded" />
                        }

                        return (
                          <button key={di}
                            onClick={() => setCalSelectedDay(prev => prev === ds ? null : ds)}
                            className={`h-8 rounded border text-[11px] font-semibold flex items-center justify-center transition-all
                              ${ts.border} ${ts.text}
                              ${kind !== 'diagonal' ? ts.bg : ''}
                              ${isSelected ? 'ring-2 ring-white/60 scale-105 shadow-lg' : 'hover:opacity-90'}
                            `}
                            style={kind === 'diagonal' ? {
                              background: 'linear-gradient(135deg, #22c55e 50%, #f97316 50%)',
                            } : undefined}
                            title={ts.label}>
                            {day}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-dark-700">
                  {[
                    { kind: 'green',    label: 'Worked' },
                    { kind: 'diagonal', label: 'Breakdown Resolved' },
                    { kind: 'red',      label: 'Breakdown' },
                    { kind: 'blue',     label: 'Sunday' },
                    { kind: 'gold',     label: 'Sunday Worked' },
                    { kind: 'empty',    label: 'No Data' },
                  ].map(({ kind, label }) => (
                    <div key={kind} className="flex items-center gap-1.5">
                      <div className={`w-3 h-3 rounded-sm border ${TILE_STYLES[kind].border} ${kind !== 'diagonal' ? TILE_STYLES[kind].bg : ''}`}
                        style={kind === 'diagonal' ? { background: 'linear-gradient(135deg, #22c55e 50%, #f97316 50%)' } : undefined} />
                      <span className="text-[10px] text-slate-500">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Day detail panel ──────────────────────────────────────── */}
              {calSelectedDay && (
                <div className="bg-dark-800 rounded-2xl border border-dark-700 p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-300">
                        {new Date(calSelectedDay + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      <span className={`inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full
                        ${selKind === 'green'    ? 'bg-green-500/20 text-green-400'   : ''}
                        ${selKind === 'red'      ? 'bg-red-500/20 text-red-400'       : ''}
                        ${selKind === 'blue'     ? 'bg-blue-500/20 text-blue-400'     : ''}
                        ${selKind === 'gold'     ? 'bg-yellow-500/20 text-yellow-400' : ''}
                        ${selKind === 'diagonal' ? 'bg-orange-500/20 text-orange-400' : ''}
                        ${selKind === 'empty'    ? 'bg-dark-600 text-slate-500'       : ''}
                      `}>
                        {TILE_STYLES[selKind]?.label || ''}
                      </span>
                    </div>
                    <button onClick={() => setCalSelectedDay(null)} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
                  </div>

                  {selOps.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-dark-700 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">Running Hours</p>
                        <p className="text-lg font-bold text-slate-100">{selRunHours > 0 ? selRunHours.toFixed(1) : '—'}</p>
                        <p className="text-[10px] text-slate-500">hrs</p>
                      </div>
                      <div className="bg-dark-700 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">Fuel Consumed</p>
                        <p className="text-lg font-bold text-slate-100">{selFuelCons > 0 ? selFuelCons.toFixed(1) : '—'}</p>
                        <p className="text-[10px] text-slate-500">litres</p>
                      </div>
                      <div className="bg-dark-700 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">Fuel Filled</p>
                        <p className="text-lg font-bold text-slate-100">{selFuel > 0 ? selFuel.toFixed(1) : '—'}</p>
                        <p className="text-[10px] text-slate-500">litres</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-3">No operational data recorded for this date.</p>
                  )}

                  {selOps.length > 0 && (
                    <div className="space-y-1">
                      {selOps.map((op, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-dark-700/60 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              op.status === 'working'     ? 'bg-green-400' :
                              op.status === 'breakdown'   ? 'bg-red-400'   :
                              op.status === 'idle'        ? 'bg-yellow-400':
                              'bg-slate-400'
                            }`} />
                            <span className="text-xs capitalize text-slate-300">{op.shift_type || 'general'} shift</span>
                            <span className="text-[10px] text-slate-500 capitalize">· {op.status}</span>
                          </div>
                          {op.operator_name && (
                            <span className="text-[10px] text-slate-500">{op.operator_name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

        </div>
    )
  })()}

        {/* ── EQUIPMENT P&L TAB ── */}
        {detailTab === 'pl' && (
          <EquipmentPLTab equipment={equipment} companyId={companyId} />
        )}

        {/* ── REMARKS TAB ── */}
        {detailTab === 'remarks' && (
          <div className="space-y-4 pt-1">
            <DocumentsSection equipment={equipment} companyId={companyId} isAdmin={isAdmin} />

            {/* ── Text Remarks ── */}
            <div className="bg-dark-700 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Remarks</p>
              <VoiceTextarea
                value={remarksText}
                onChange={setRemarksText}
                placeholder="Add remarks, site notes, observations…"
                rows={5}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{remarksText.length} characters</span>
                <button
                  disabled={savingRemarks || remarksText === (equipment.notes || '')}
                  onClick={async () => {
                    setSavingRemarks(true)
                    try {
                      const { error } = await supabase
                        .from('equipment_registry')
                        .update({ notes: remarksText || null })
                        .eq('id', equipment.id)
                      if (error) throw error
                      setEquipment(prev => ({ ...prev, notes: remarksText || null }))
                      qc.invalidateQueries(['equipment', companyId])
                      toast.success('Remarks saved')
                    } catch (err) {
                      toast.error('Failed to save: ' + err.message)
                    } finally {
                      setSavingRemarks(false)
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingRemarks ? 'Saving…' : 'Save Remarks'}
                </button>
              </div>
            </div>
          </div>
        )}

      </Modal>

      {showEdit && (
        <EquipmentFormModal companyId={companyId} initialValues={equipment}
          onClose={() => setShowEdit(false)}
          onSaved={refreshEquipment} />
      )}
      {modal === 'fuel'     && <FuelModal     equipment={equipment} companyId={companyId} onClose={() => setModal(null)} />}
      {modal === 'incident' && <IncidentModal equipment={equipment} companyId={companyId} onClose={() => setModal(null)} />}
      {showTCModal && tcPending && (
        <TCCaptureModal
          fromProject={tcPending.fromProject}
          toProject={tcPending.toProject}
          equipment={equipment}
          meterReading={deployHourMeter || equipment.current_meter_reading || ''}
          authorizedBy={userProfile?.full_name || ''}
          deploySaving={deploySaving}
          onConfirm={(tcDetails) => completeDeploy(tcDetails, tcPending.fromProject, tcPending.fromDepId)}
          onCancel={() => { setShowTCModal(false); setTcPending(null) }}
        />
      )}
    </>
  )
}

// ── Equipment Card ────────────────────────────────────────────────────────────
function EquipmentCard({ equipment, onClick }) {
  const st         = STATUS_COLORS[equipment.status] || STATUS_COLORS.active
  const alert      = hasExpiryAlert(equipment)
  const ownerBadge = equipment.ownership_type === 'hired'
    ? { label: 'Hired',  color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' }
    : equipment.ownership_type === 'client_supplied'
    ? { label: 'Client', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' }
    : null

  return (
    <button onClick={onClick}
      className="w-full text-left bg-dark-800 border border-dark-700 hover:border-dark-500 rounded-xl p-4 transition-all active:scale-[0.98]">

      {/* Row 1: name + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-100 text-sm leading-tight truncate">{equipment.name}</p>
            {equipment.equipment_number && (
              <span className="text-xs text-primary-500 font-mono shrink-0">{equipment.equipment_number}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{equipment.category}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {alert && <AlertCircle className="w-3.5 h-3.5 text-orange-400" title="Document expiry within 30 days" />}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
        </div>
      </div>

      {/* Row 2: make/model/year + meter */}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {(equipment.make || equipment.model) && (
          <span className="text-xs text-slate-400">
            {[equipment.make, equipment.model, equipment.year_of_manufacture].filter(Boolean).join(' · ')}
          </span>
        )}
        <div className="flex items-center gap-1 text-xs text-slate-400 ml-auto">
          <Gauge className="w-3.5 h-3.5" />
          <span className="font-medium text-slate-300">
            {Number(equipment.current_meter_reading || 0).toFixed(1)} {equipment.meter_type === 'kilometers' ? 'km' : 'hrs'}
          </span>
        </div>
      </div>

      {/* Row 3: reg number + ownership + site */}
      <div className="flex items-center justify-between mt-2 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {equipment.registration_number && (
            <span className="text-xs text-primary-500 font-mono bg-dark-700 px-2 py-0.5 rounded">{equipment.registration_number}</span>
          )}
          {ownerBadge && (
            <span className={`text-xs px-1.5 py-0.5 rounded border ${ownerBadge.color}`}>{ownerBadge.label}</span>
          )}
          {equipment.current_site_name && (
            <span className="text-xs bg-emerald-900/20 text-emerald-400 border border-emerald-700/30 px-2 py-0.5 rounded truncate max-w-[130px]">
              📍 {equipment.current_site_name}
            </span>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
      </div>
    </button>
  )
}

// ── Fleet Tab ─────────────────────────────────────────────────────────────────
function FleetTab({ companyId, showAdd, setShowAdd, onNavigate }) {
  const [selected,        setSelected]        = useState(null)
  const [search,          setSearch]          = useState('')
  const [filterStatus,    setFilterStatus]    = useState('all')
  const [filterOwnership, setFilterOwnership] = useState('all')
  const [viewMode,        setViewMode]        = useState('grid')    // 'grid' | 'site' | 'utilization' | 'cost'
  const [alertDismissed,  setAlertDismissed]  = useState(false)
  const [gateDismissed,   setGateDismissed]   = useState(false)
  const [costGroupBy,     setCostGroupBy]     = useState('project') // 'project' | 'machine'
  // Shared month state for utilization grid + cost allocation
  const [gridMonth, setGridMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['equipment', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })

  // Also fetch equipment_documents expiry alerts
  const { data: docAlerts = [] } = useQuery({
    queryKey: ['doc_expiry_alerts', companyId],
    queryFn: async () => {
      const thirtyDaysFromNow = new Date(); thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      const { data } = await supabase.from('equipment_documents')
        .select('equipment_id, doc_name, doc_type, expiry_date, equipment(name)')
        .eq('company_id', companyId)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .order('expiry_date')
      return data || []
    },
    enabled: !!companyId,
  })

  // Daily Log Gate — deployed machines with no ops record for today
  const todayDateStr = new Date().toISOString().slice(0, 10)
  const { data: unloggedToday = [] } = useQuery({
    queryKey: ['unlogged_today', companyId, todayDateStr],
    queryFn: async () => {
      const deployed = equipment.filter(e => !!e.current_project_id)
      if (deployed.length === 0) return []
      const deployedIds = deployed.map(e => e.id)
      const { data: loggedToday } = await supabase.from('daily_operations')
        .select('equipment_id')
        .eq('company_id', companyId)
        .eq('ops_date', todayDateStr)
        .in('equipment_id', deployedIds)
      const loggedIds = new Set((loggedToday || []).map(o => o.equipment_id))
      return deployed.filter(e => !loggedIds.has(e.id))
    },
    enabled: equipment.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Fleet utilization grid data
  const _gY  = gridMonth.getFullYear()
  const _gM  = gridMonth.getMonth()
  const gridMonthStart = `${_gY}-${String(_gM + 1).padStart(2, '0')}-01`
  const gridMonthEnd   = (() => { const d = new Date(_gY, _gM + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const daysInGridMonth = new Date(_gY, _gM + 1, 0).getDate()

  const { data: gridOps = [] } = useQuery({
    queryKey: ['fleet_grid_ops', companyId, gridMonthStart],
    queryFn: async () => {
      const { data } = await supabase.from('daily_operations')
        .select('equipment_id, ops_date, status')
        .eq('company_id', companyId)
        .gte('ops_date', gridMonthStart)
        .lte('ops_date', gridMonthEnd)
      return data || []
    },
    enabled: viewMode === 'utilization',
  })

  const { data: gridTargets = [] } = useQuery({
    queryKey: ['fleet_grid_targets', companyId, _gY, _gM + 1],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_utilization_targets')
        .select('equipment_id, planned_days')
        .eq('company_id', companyId)
        .eq('year', _gY)
        .eq('month', _gM + 1)
      return data || []
    },
    enabled: viewMode === 'utilization',
  })

  // Build lookup: equipment_id → Set of worked day numbers
  const gridOpsByEquip = {}
  const gridBreakByEquip = {}
  for (const op of gridOps) {
    const day = parseInt(op.ops_date.slice(8), 10)
    if (!gridOpsByEquip[op.equipment_id]) gridOpsByEquip[op.equipment_id] = new Set()
    if (op.status === 'working' || op.status === 'idle' || op.status === 'maintenance') {
      gridOpsByEquip[op.equipment_id].add(day)
    }
    if (op.status === 'breakdown') {
      if (!gridBreakByEquip[op.equipment_id]) gridBreakByEquip[op.equipment_id] = new Set()
      gridBreakByEquip[op.equipment_id].add(day)
    }
  }
  const gridTargetByEquip = {}
  for (const t of gridTargets) gridTargetByEquip[t.equipment_id] = t.planned_days

  // ── Cost Allocation queries ──
  const { data: costOps = [] } = useQuery({
    queryKey: ['cost_ops', companyId, gridMonthStart],
    queryFn: async () => {
      const { data } = await supabase.from('daily_operations')
        .select('equipment_id, ops_date, running_hours, project_id, status')
        .eq('company_id', companyId)
        .gte('ops_date', gridMonthStart)
        .lte('ops_date', gridMonthEnd)
      return data || []
    },
    enabled: viewMode === 'cost',
  })

  const { data: costDeployments = [] } = useQuery({
    queryKey: ['cost_deployments', companyId, gridMonthStart, gridMonthEnd],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_deployments')
        .select('equipment_id, project_id, deployed_date, withdrawn_date, project:project_id(name)')
        .eq('company_id', companyId)
        .lte('deployed_date', gridMonthEnd)
        .or(`withdrawn_date.is.null,withdrawn_date.gte.${gridMonthStart}`)
      return data || []
    },
    enabled: viewMode === 'cost',
  })

  const { data: costProjects = [] } = useQuery({
    queryKey: ['projects_for_cost', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('company_id', companyId)
      return data || []
    },
    enabled: viewMode === 'cost',
  })

  // Cost allocation computation
  const costAllocationData = useMemo(() => {
    if (!costOps.length && viewMode !== 'cost') return { byProject: {}, byMachine: {}, grandTotal: 0, pairs: [] }
    const equipMap   = Object.fromEntries(equipment.map(e => [e.id, e]))
    const projMap    = Object.fromEntries(costProjects.map(p => [p.id, p]))
    const deplByEquip = {}
    for (const d of costDeployments) {
      if (!deplByEquip[d.equipment_id]) deplByEquip[d.equipment_id] = []
      deplByEquip[d.equipment_id].push(d)
    }
    // Aggregate (equipId, projectId) → { hours, daySet }
    const agg = {}
    for (const op of costOps) {
      if (op.status === 'breakdown') continue
      let pid = op.project_id
      if (!pid) {
        const depls = deplByEquip[op.equipment_id] || []
        const m = depls.find(d =>
          d.deployed_date <= op.ops_date &&
          (!d.withdrawn_date || d.withdrawn_date >= op.ops_date)
        )
        pid = m?.project_id || '__none__'
      }
      const key = `${op.equipment_id}|||${pid}`
      if (!agg[key]) agg[key] = { equipId: op.equipment_id, pid, hours: 0, days: new Set() }
      agg[key].hours += Number(op.running_hours || 0)
      agg[key].days.add(op.ops_date)
    }
    const fmtMoney = n => `₹${Math.round(n).toLocaleString('en-IN')}`
    const pairs = Object.values(agg).map(({ equipId, pid, hours, days }) => {
      const eq   = equipMap[equipId]
      const proj = pid === '__none__' ? { name: 'No Project (Yard / Standby)' } : projMap[pid]
      const basis = eq?.internal_rate_basis || 'hourly'
      let cost = 0
      let rateStr = 'No rate set'
      let hasRate = false
      if (eq) {
        if (basis === 'hourly' && eq.internal_rate_per_hour) {
          cost = hours * Number(eq.internal_rate_per_hour)
          rateStr = `${fmtMoney(eq.internal_rate_per_hour)}/hr`
          hasRate = true
        } else if (basis === 'daily' && eq.internal_rate_per_day) {
          cost = days.size * Number(eq.internal_rate_per_day)
          rateStr = `${fmtMoney(eq.internal_rate_per_day)}/day`
          hasRate = true
        } else if (basis === 'monthly' && eq.internal_rate_per_month) {
          cost = Number(eq.internal_rate_per_month)
          rateStr = `${fmtMoney(eq.internal_rate_per_month)}/mo`
          hasRate = true
        }
      }
      return {
        equipId, pid,
        equipName:   eq ? `${eq.name}${eq.equipment_number ? ` (${eq.equipment_number})` : ''}` : 'Unknown Machine',
        projectName: proj?.name || 'Unknown Project',
        hours:       Math.round(hours * 10) / 10,
        days:        days.size,
        cost:        Math.round(cost),
        rateStr,
        hasRate,
      }
    }).sort((a, b) => b.cost - a.cost)
    const byProject = {}
    for (const p of pairs) {
      if (!byProject[p.pid]) byProject[p.pid] = { name: p.projectName, rows: [], subtotal: 0 }
      byProject[p.pid].rows.push(p)
      byProject[p.pid].subtotal += p.cost
    }
    const byMachine = {}
    for (const p of pairs) {
      if (!byMachine[p.equipId]) byMachine[p.equipId] = { name: p.equipName, rows: [], subtotal: 0 }
      byMachine[p.equipId].rows.push(p)
      byMachine[p.equipId].subtotal += p.cost
    }
    const grandTotal = pairs.reduce((s, p) => s + p.cost, 0)
    return { byProject, byMachine, grandTotal, pairs }
  }, [costOps, costDeployments, costProjects, equipment, viewMode])

  const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const filtered = equipment.filter(e =>
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.registration_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.category || '').toLowerCase().includes(search.toLowerCase())) &&
    (filterStatus === 'all'    || e.status === filterStatus) &&
    (filterOwnership === 'all' || (e.ownership_type || 'own') === filterOwnership)
  )

  // Group by site for site view
  const bySite = (() => {
    const groups = {}
    filtered.forEach(e => {
      const key = e.current_site_name || '__undeployed__'
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    })
    // Sort: deployed sites first, then undeployed
    const entries = Object.entries(groups).sort(([a], [b]) => {
      if (a === '__undeployed__') return 1
      if (b === '__undeployed__') return -1
      return a.localeCompare(b)
    })
    return entries
  })()

  const counts = { active: 0, idle: 0, breakdown: 0, maintenance: 0 }
  equipment.forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++ })
  const totalAlerts = docAlerts.length

  return (
    <div className="flex flex-col h-full">

      {/* ── Expiry Alert Banner ── */}
      {!alertDismissed && (totalAlerts > 0) && (
        <div className="mx-4 mt-2 mb-1 bg-orange-900/30 border border-orange-700/40 rounded-xl px-3 py-2.5 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Bell className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-orange-300">
                  {totalAlerts} document expiry alert{totalAlerts > 1 ? 's' : ''} — action required
                </p>
                <div className="mt-1 space-y-0.5">
                  {docAlerts.slice(0, 6).map((d, i) => {
                    const days = differenceInDays(new Date(d.expiry_date), new Date())
                    return (
                      <p key={i} className="text-xs text-orange-400">
                        · {d.equipment?.name}: {d.doc_name || d.doc_type} {days < 0 ? 'expired' : `expires in ${days}d`}
                      </p>
                    )
                  })}
                  {totalAlerts > 6 && <p className="text-xs text-orange-500">+ {totalAlerts - 6} more — open equipment to view</p>}
                </div>
              </div>
            </div>
            <button onClick={() => setAlertDismissed(true)} className="p-1 text-orange-500 hover:text-orange-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Daily Log Gate Banner ── */}
      {!gateDismissed && unloggedToday.length > 0 && (
        <div className="mx-4 mt-2 mb-1 bg-red-900/30 border border-red-700/40 rounded-xl px-3 py-2.5 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-300">
                  {unloggedToday.length} deployed machine{unloggedToday.length > 1 ? 's' : ''} not logged today
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {unloggedToday.map(e => (
                    <button key={e.id}
                      onClick={() => setSelected(e)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-red-800/50 border border-red-700/50 text-red-300 hover:bg-red-700/60 transition-colors">
                      {e.equipment_number ? `${e.equipment_number} · ` : ''}{e.name}
                      {e.current_site_name ? ` @ ${e.current_site_name}` : ''} →
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={() => setGateDismissed(true)} className="p-1 text-red-500 hover:text-red-300 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Status filter chips ── */}
      {equipment.length > 0 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto shrink-0">
          {Object.entries(counts).map(([status, count]) => {
            const st = STATUS_COLORS[status]
            return (
              <button key={status} onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all
                  ${filterStatus === status ? `${st.bg} ${st.text} ${st.border}` : 'border-dark-600 text-slate-500'}`}>
                {count} {st.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Search + filters ── */}
      <div className="px-4 pb-2 shrink-0 flex gap-2">
        <input className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
          placeholder="Search equipment, reg. no, category…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-primary-500"
          value={filterOwnership} onChange={e => setFilterOwnership(e.target.value)}>
          <option value="all">All</option>
          <option value="own">Own</option>
          <option value="hired">Hired</option>
          <option value="client_supplied">Client</option>
        </select>
        {/* View toggle */}
        <div className="flex bg-dark-700 border border-dark-600 rounded-lg overflow-hidden shrink-0">
          <button onClick={() => setViewMode('grid')}
            className={`px-2.5 py-2 transition-colors ${viewMode === 'grid' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            title="Grid view"><LayoutGrid className="w-3.5 h-3.5" /></button>
          <button onClick={() => setViewMode('site')}
            className={`px-2.5 py-2 transition-colors ${viewMode === 'site' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            title="Group by site"><List className="w-3.5 h-3.5" /></button>
          <button onClick={() => setViewMode('utilization')}
            className={`px-2.5 py-2 transition-colors ${viewMode === 'utilization' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            title="Fleet utilization grid"><CalendarDays className="w-3.5 h-3.5" /></button>
          <button onClick={() => setViewMode('cost')}
            className={`px-2.5 py-2 transition-colors ${viewMode === 'cost' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            title="Internal cost allocation"><IndianRupee className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* ── Equipment list ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Truck className="w-12 h-12 text-slate-600" />
            <p className="text-slate-400 font-medium">{equipment.length === 0 ? 'No equipment added yet' : 'No equipment matches filter'}</p>
            {equipment.length === 0 && (
              <button onClick={() => setShowAdd(true)} className="btn-primary text-sm mt-2"><Plus className="w-4 h-4" /> Add First Equipment</button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(eq => <EquipmentCard key={eq.id} equipment={eq} onClick={() => setSelected(eq)} />)}
          </div>
        ) : viewMode === 'site' ? (
          /* Site-grouped view */
          <div className="space-y-5">
            {bySite.map(([site, items]) => (
              <div key={site}>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {site === '__undeployed__' ? 'Not Deployed' : site}
                  </span>
                  <span className="text-xs text-slate-600">({items.length})</span>
                  <div className="flex-1 h-px bg-dark-700" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map(eq => <EquipmentCard key={eq.id} equipment={eq} onClick={() => setSelected(eq)} />)}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'utilization' ? (
          /* ── Fleet Utilization Grid ── */
          <div className="space-y-3">
            {/* Month navigator */}
            <div className="flex items-center justify-between bg-dark-800 rounded-xl border border-dark-700 px-3 py-2">
              <button onClick={() => setGridMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="p-1 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="text-center">
                <span className="text-sm font-semibold text-slate-200">{MONTH_NAMES_SHORT[_gM]} {_gY}</span>
                <p className="text-[10px] text-slate-500 mt-0.5">{daysInGridMonth} days · {equipment.filter(e => !!e.current_project_id).length} deployed machines</p>
              </div>
              <button onClick={() => setGridMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="p-1 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Legend */}
            <div className="flex gap-4 flex-wrap px-1">
              {[
                { color: 'bg-green-500/80',  label: 'Worked' },
                { color: 'bg-red-500/70',    label: 'Breakdown' },
                { color: 'bg-blue-500/20',   label: 'Sunday' },
                { color: 'bg-dark-600/40',   label: 'No data' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                  <span className="text-[10px] text-slate-500">{label}</span>
                </div>
              ))}
            </div>

            {/* Grid header: day numbers */}
            <div className="overflow-x-auto rounded-xl border border-dark-700 bg-dark-800">
              {/* Day header row */}
              <div className="flex border-b border-dark-700 bg-dark-900/50 sticky top-0 z-10" style={{ minWidth: `${180 + daysInGridMonth * 20}px` }}>
                <div className="w-44 shrink-0 px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-r border-dark-700">Machine</div>
                <div className="w-16 shrink-0 px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-r border-dark-700 text-center">Util %</div>
                {Array.from({ length: daysInGridMonth }, (_, i) => i + 1).map(day => {
                  const dow = new Date(_gY, _gM, day).getDay()
                  return (
                    <div key={day} className={`flex-1 py-1.5 text-center text-[9px] font-semibold border-r border-dark-700/50 last:border-r-0
                      ${dow === 0 ? 'text-blue-400' : 'text-slate-500'}`} style={{ minWidth: 20 }}>
                      {day}
                    </div>
                  )
                })}
              </div>

              {/* Machine rows */}
              {equipment.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">No equipment found</div>
              ) : (
                equipment.map(eq => {
                  const worked   = gridOpsByEquip[eq.id]  || new Set()
                  const broken   = gridBreakByEquip[eq.id] || new Set()
                  const planned  = gridTargetByEquip[eq.id] ?? null
                  const actualDays = worked.size
                  const pct = (planned && planned > 0) ? Math.round((actualDays / planned) * 100) : null
                  const pctColor = pct === null ? 'text-slate-500' : pct >= 90 ? 'text-green-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'

                  return (
                    <button key={eq.id}
                      onClick={() => setSelected(eq)}
                      className="flex w-full border-b border-dark-700/50 last:border-b-0 hover:bg-dark-700/30 transition-colors group text-left"
                      style={{ minWidth: `${180 + daysInGridMonth * 20}px` }}>
                      {/* Machine name */}
                      <div className="w-44 shrink-0 px-3 py-2 border-r border-dark-700 flex flex-col justify-center">
                        <p className="text-xs font-medium text-slate-200 truncate group-hover:text-primary-300 transition-colors">{eq.name}</p>
                        {eq.registration_number && (
                          <p className="text-[9px] text-slate-600 truncate">{eq.registration_number}</p>
                        )}
                      </div>
                      {/* Utilization % */}
                      <div className="w-16 shrink-0 px-2 py-2 border-r border-dark-700 flex flex-col items-center justify-center">
                        <span className={`text-xs font-bold ${pctColor}`}>{pct !== null ? `${pct}%` : '—'}</span>
                        <span className="text-[9px] text-slate-600">{actualDays}/{planned ?? '?'}</span>
                      </div>
                      {/* Day cells */}
                      {Array.from({ length: daysInGridMonth }, (_, i) => i + 1).map(day => {
                        const dow    = new Date(_gY, _gM, day).getDay()
                        const isSun  = dow === 0
                        const hasW   = worked.has(day)
                        const hasB   = broken.has(day)
                        const today  = new Date()
                        const isFut  = new Date(_gY, _gM, day) > today

                        let cellBg = isFut ? 'bg-transparent' : isSun ? 'bg-blue-500/15' : 'bg-dark-600/25'
                        if (hasW && hasB)   cellBg = 'bg-gradient-to-br from-green-500/70 to-red-500/70'
                        else if (hasW)      cellBg = 'bg-green-500/75'
                        else if (hasB)      cellBg = 'bg-red-500/65'

                        return (
                          <div key={day}
                            className={`flex-1 py-2 border-r border-dark-700/30 last:border-r-0 ${cellBg}`}
                            style={{ minWidth: 20 }} />
                        )
                      })}
                    </button>
                  )
                })
              )}
            </div>

            {/* Summary footer */}
            <div className="grid grid-cols-3 gap-3">
              {(() => {
                const totalActual  = equipment.reduce((s, eq) => s + (gridOpsByEquip[eq.id]?.size || 0), 0)
                const totalPlanned = equipment.reduce((s, eq) => s + (gridTargetByEquip[eq.id] || 0), 0)
                const fleetPct = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : null
                const onTrack = equipment.filter(eq => {
                  const a = gridOpsByEquip[eq.id]?.size || 0
                  const p = gridTargetByEquip[eq.id]
                  return p && (a / p) >= 0.9
                }).length
                return (
                  <>
                    <div className="bg-dark-800 rounded-xl border border-dark-700 p-3 text-center">
                      <p className="text-[10px] text-slate-500 mb-0.5">Fleet Utilization</p>
                      <p className={`text-xl font-bold ${fleetPct === null ? 'text-slate-500' : fleetPct >= 90 ? 'text-green-400' : fleetPct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                        {fleetPct !== null ? `${fleetPct}%` : '—'}
                      </p>
                      <p className="text-[10px] text-slate-600">{totalActual} / {totalPlanned || '?'} days</p>
                    </div>
                    <div className="bg-dark-800 rounded-xl border border-dark-700 p-3 text-center">
                      <p className="text-[10px] text-slate-500 mb-0.5">On Track (≥90%)</p>
                      <p className="text-xl font-bold text-green-400">{onTrack}</p>
                      <p className="text-[10px] text-slate-600">of {equipment.length} machines</p>
                    </div>
                    <div className="bg-dark-800 rounded-xl border border-dark-700 p-3 text-center">
                      <p className="text-[10px] text-slate-500 mb-0.5">No Target Set</p>
                      <p className="text-xl font-bold text-slate-400">{equipment.filter(eq => gridTargetByEquip[eq.id] === undefined).length}</p>
                      <p className="text-[10px] text-slate-600">machines</p>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        ) : (
          /* ── Internal Cost Allocation ── */
          <div className="space-y-3">
            {/* Month navigator */}
            <div className="flex items-center justify-between bg-dark-800 rounded-xl border border-dark-700 px-3 py-2">
              <button onClick={() => setGridMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="p-1 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="text-center">
                <span className="text-sm font-semibold text-slate-200">{MONTH_NAMES_SHORT[_gM]} {_gY}</span>
                <p className="text-[10px] text-slate-500 mt-0.5">P&M internal cross-charge to projects</p>
              </div>
              <button onClick={() => setGridMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="p-1 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Group-by toggle */}
            <div className="flex gap-2">
              {[{ v: 'project', l: 'By Project' }, { v: 'machine', l: 'By Machine' }].map(({ v, l }) => (
                <button key={v} onClick={() => setCostGroupBy(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                    ${costGroupBy === v ? 'bg-primary-600 border-primary-500 text-white' : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-slate-200'}`}>
                  {l}
                </button>
              ))}
              {/* Grand total */}
              <div className="ml-auto flex items-center gap-2 bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-xs font-bold text-primary-300">
                  {costAllocationData.grandTotal > 0
                    ? `₹${costAllocationData.grandTotal.toLocaleString('en-IN')}`
                    : '₹0'}
                </span>
                <span className="text-[10px] text-slate-500">total</span>
              </div>
            </div>

            {/* No data empty state */}
            {costAllocationData.pairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <IndianRupee className="w-10 h-10 text-slate-600" />
                <p className="text-sm font-medium text-slate-400">No operational data for {MONTH_NAMES_SHORT[_gM]} {_gY}</p>
                <p className="text-xs text-slate-500 max-w-xs">
                  Log daily operations to see cost allocation. Set internal hire rates on each machine using the edit form.
                </p>
              </div>
            ) : costGroupBy === 'project' ? (
              /* By Project view */
              <div className="space-y-3">
                {Object.entries(costAllocationData.byProject)
                  .sort(([, a], [, b]) => b.subtotal - a.subtotal)
                  .map(([pid, group]) => (
                  <div key={pid} className="rounded-xl border border-dark-700 bg-dark-800/60 overflow-hidden">
                    {/* Project header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-dark-900/40 border-b border-dark-700">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                        <span className="text-xs font-semibold text-slate-200">{group.name}</span>
                      </div>
                      <span className="text-xs font-bold text-primary-300">
                        {group.subtotal > 0 ? `₹${group.subtotal.toLocaleString('en-IN')}` : '—'}
                      </span>
                    </div>
                    {/* Machine rows */}
                    <div className="divide-y divide-dark-700/50">
                      {/* Column headers */}
                      <div className="grid grid-cols-12 px-3 py-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                        <span className="col-span-4">Machine</span>
                        <span className="col-span-2 text-right">Days</span>
                        <span className="col-span-2 text-right">Hours</span>
                        <span className="col-span-2 text-right">Rate</span>
                        <span className="col-span-2 text-right">Cost</span>
                      </div>
                      {group.rows.map((row, i) => (
                        <div key={i} className="grid grid-cols-12 px-3 py-2 hover:bg-dark-700/30 transition-colors">
                          <div className="col-span-4">
                            <p className="text-xs text-slate-200 font-medium truncate">{row.equipName}</p>
                          </div>
                          <span className="col-span-2 text-right text-xs text-slate-400">{row.days}d</span>
                          <span className="col-span-2 text-right text-xs text-slate-400">{row.hours}h</span>
                          <span className={`col-span-2 text-right text-[10px] ${row.hasRate ? 'text-slate-400' : 'text-amber-500'}`}>
                            {row.rateStr}
                          </span>
                          <span className={`col-span-2 text-right text-xs font-semibold ${row.hasRate ? 'text-slate-200' : 'text-slate-500'}`}>
                            {row.hasRate ? `₹${row.cost.toLocaleString('en-IN')}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* By Machine view */
              <div className="space-y-3">
                {Object.entries(costAllocationData.byMachine)
                  .sort(([, a], [, b]) => b.subtotal - a.subtotal)
                  .map(([eid, group]) => (
                  <div key={eid} className="rounded-xl border border-dark-700 bg-dark-800/60 overflow-hidden">
                    {/* Machine header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-dark-900/40 border-b border-dark-700">
                      <div className="flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                        <span className="text-xs font-semibold text-slate-200">{group.name}</span>
                      </div>
                      <span className="text-xs font-bold text-primary-300">
                        {group.subtotal > 0 ? `₹${group.subtotal.toLocaleString('en-IN')}` : '—'}
                      </span>
                    </div>
                    {/* Project rows */}
                    <div className="divide-y divide-dark-700/50">
                      <div className="grid grid-cols-12 px-3 py-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                        <span className="col-span-4">Project</span>
                        <span className="col-span-2 text-right">Days</span>
                        <span className="col-span-2 text-right">Hours</span>
                        <span className="col-span-2 text-right">Rate</span>
                        <span className="col-span-2 text-right">Cost</span>
                      </div>
                      {group.rows.map((row, i) => (
                        <div key={i} className="grid grid-cols-12 px-3 py-2 hover:bg-dark-700/30 transition-colors">
                          <div className="col-span-4">
                            <p className="text-xs text-slate-200 font-medium truncate">{row.projectName}</p>
                          </div>
                          <span className="col-span-2 text-right text-xs text-slate-400">{row.days}d</span>
                          <span className="col-span-2 text-right text-xs text-slate-400">{row.hours}h</span>
                          <span className={`col-span-2 text-right text-[10px] ${row.hasRate ? 'text-slate-400' : 'text-amber-500'}`}>
                            {row.rateStr}
                          </span>
                          <span className={`col-span-2 text-right text-xs font-semibold ${row.hasRate ? 'text-slate-200' : 'text-slate-500'}`}>
                            {row.hasRate ? `₹${row.cost.toLocaleString('en-IN')}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No rate warning */}
            {costAllocationData.pairs.some(p => !p.hasRate) && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300">
                  Some machines have no internal rate set. Edit the equipment and add an Internal Hire Rate to see cost values.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd  && <EquipmentFormModal companyId={companyId} onClose={() => setShowAdd(false)} />}
      {selected && <EquipmentDetail   equipment={selected}  companyId={companyId} onClose={() => setSelected(null)} onNavigate={onNavigate} />}
    </div>
  )
}

// ── Fuel Issue Modal ──────────────────────────────────────────────────────────
function FuelIssueModal({ companyId, userProfile, onClose, onSaved }) {
  const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'
  const [date,        setDate]        = useState(new Date().toISOString().slice(0, 10))
  const [equipId,     setEquipId]     = useState('')
  const [qty,         setQty]         = useState('')
  const [source,      setSource]      = useState('company_bowser')
  const [tankId,      setTankId]      = useState('')
  const [vendorId,    setVendorId]    = useState('')
  const [poId,        setPoId]        = useState('')
  const [meter,       setMeter]       = useState('')
  const [voucher,     setVoucher]     = useState('')
  const [deliveredBy, setDeliveredBy] = useState('')
  const [inchargeId,  setInchargeId]  = useState(userProfile?.id || '')
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  const isCompanySource = source === 'company_bowser' || source === 'company_tank'
  const isVendorSource  = source === 'vendor_supply'

  const { data: allEquip = [] } = useQuery({
    queryKey: ['equipment_for_fuel', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id,name,equipment_number,category').eq('company_id', companyId).order('name')
      return data || []
    },
  })

  const { data: tanks = [] } = useQuery({
    queryKey: ['fuel_tanks', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('fuel_tanks')
        .select('id,name,tank_type,location,current_stock,capacity_liters,equipment_id,equipment:equipment_id(name,registration_number,equipment_number)')
        .eq('company_id', companyId).eq('is_active', true).order('name')
      return data || []
    },
    enabled: isCompanySource,
  })

  const { data: fuelVendors = [] } = useQuery({
    queryKey: ['fuel_vendors', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id,name,contact_name,contact_phone').eq('company_id', companyId).eq('vendor_type', 'fuel').eq('is_active', true).order('name')
      return data || []
    },
    enabled: isVendorSource,
  })

  const { data: vendorPOs = [] } = useQuery({
    queryKey: ['vendor_pos_fuel', vendorId],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_orders').select('id,po_number,po_date,total_amount').eq('company_id', companyId).eq('vendor_id', vendorId).in('status', ['approved', 'partial', 'open']).order('po_date', { ascending: false }).limit(20)
      return data || []
    },
    enabled: isVendorSource && !!vendorId,
  })

  const { data: staff = [] } = useQuery({
    queryKey: ['staff_for_incharge', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles').select('id,full_name,role').eq('company_id', companyId).in('role', ['admin', 'manager', 'accounts']).order('full_name')
      return data || []
    },
  })

  const selectedTank   = tanks.find(t => t.id === tankId)
  const selectedVendor = fuelVendors.find(v => v.id === vendorId)
  const selectedPO     = vendorPOs.find(p => p.id === poId)
  const selectedStaff  = staff.find(s => s.id === inchargeId)
  const qtyNum         = parseFloat(qty) || 0
  const tankShortfall  = selectedTank ? qtyNum > selectedTank.current_stock : false

  const handleSave = async () => {
    if (!qty || !equipId)   return toast.error('Select equipment and enter quantity')
    if (isCompanySource && !tankId) return toast.error('Select which tank/bowser the fuel is from')
    if (isVendorSource  && !vendorId) return toast.error('Select the fuel vendor')
    if (!inchargeId)        return toast.error('Select a company incharge who is authorising this issue')
    setSaving(true)
    try {
      const eq = allEquip.find(e => e.id === equipId)
      const { error } = await supabase.from('fuel_issues').insert({
        company_id:          companyId,
        issue_date:          date,
        equipment_id:        equipId,
        equipment_name:      eq ? `${eq.equipment_number ? eq.equipment_number + ' — ' : ''}${eq.name}` : null,
        quantity_liters:     qtyNum,
        fuel_source:         source,
        tank_id:             isCompanySource && tankId   ? tankId   : null,
        tank_name:           isCompanySource && selectedTank ? selectedTank.name : null,
        vendor_id:           isVendorSource  && vendorId ? vendorId : null,
        vendor_name:         isVendorSource  && selectedVendor ? selectedVendor.name : null,
        purchase_order_id:   isVendorSource  && poId     ? poId     : null,
        po_number:           isVendorSource  && selectedPO ? selectedPO.po_number : null,
        meter_at_issue:      meter   ? parseFloat(meter)  : null,
        voucher_number:      voucher.trim()      || null,
        delivered_by:        deliveredBy.trim()  || null,
        incharge_id:         inchargeId           || null,
        incharge_name:       selectedStaff?.full_name || null,
        notes:               notes.trim()         || null,
        issued_by:           userProfile?.id       || null,
        issued_by_name:      userProfile?.full_name || userProfile?.name || null,
      })
      if (error) throw error
      toast.success('Fuel issue logged')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 shrink-0">
          <p className="text-sm font-bold text-slate-100">Issue Fuel from Stock</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {/* Date + Qty */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Date *</p>
              <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Qty (Litres) *</p>
              <input type="number" className={inp} value={qty} onChange={e => setQty(e.target.value)} placeholder="0.0" min="0" step="0.5" />
            </div>
          </div>

          {/* Equipment */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Equipment *</p>
            <select className={inp} value={equipId} onChange={e => setEquipId(e.target.value)}>
              <option value="">Select equipment…</option>
              {allEquip.map(e => <option key={e.id} value={e.id}>{e.equipment_number ? `${e.equipment_number} — ` : ''}{e.name}</option>)}
            </select>
          </div>

          {/* Source */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Fuel Source *</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: 'company_bowser', l: '🚛 Company Bowser' },
                { v: 'company_tank',   l: '🛢️ Company Tank'   },
                { v: 'vendor_supply',  l: '🏪 Vendor Supply'  },
                { v: 'petrol_pump',    l: '⛽ Petrol Pump'    },
              ].map(({ v, l }) => (
                <button key={v} type="button" onClick={() => { setSource(v); setTankId(''); setVendorId(''); setPoId('') }}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium text-left transition-all ${source === v ? 'border-primary-500 bg-primary-500/10 text-primary-300' : 'border-dark-600 text-slate-400 hover:text-slate-200'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Company Tank/Bowser — tank picker */}
          {isCompanySource && (
            <div>
              <p className="text-xs text-slate-400 mb-1">From Tank / Bowser *</p>
              {tanks.length === 0 ? (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300">
                  ⚠️ No fuel tanks set up. Add a tank in the Fuel → Tanks tab first.
                </div>
              ) : (
                <>
                  <select className={inp} value={tankId} onChange={e => setTankId(e.target.value)}>
                    <option value="">Select tank…</option>
                    {tanks.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.equipment?.registration_number ? ` [${t.equipment.registration_number}]` : ''}
                        {t.location ? ` @ ${t.location}` : ''} — {t.current_stock?.toFixed(0)} L available
                      </option>
                    ))}
                  </select>
                  {selectedTank && (
                    <div className={`mt-1.5 flex items-center gap-2 text-xs px-2 py-1 rounded-lg ${tankShortfall ? 'bg-red-900/30 text-red-400' : 'bg-green-900/20 text-green-400'}`}>
                      <span>{tankShortfall ? '⚠️' : '✓'}</span>
                      <span>
                        {tankShortfall
                          ? `Stock low — only ${selectedTank.current_stock?.toFixed(0)} L available, issuing ${qtyNum.toFixed(0)} L`
                          : `${selectedTank.current_stock?.toFixed(0)} L available → ${(selectedTank.current_stock - qtyNum).toFixed(0)} L remaining after issue`}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Vendor Supply — vendor + PO */}
          {isVendorSource && (
            <>
              <div>
                <p className="text-xs text-slate-400 mb-1">Fuel Vendor *</p>
                {fuelVendors.length === 0 ? (
                  <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300">
                    ⚠️ No fuel vendors found. Add a vendor with type "Fuel" in Purchase → Vendors first.
                  </div>
                ) : (
                  <select className={inp} value={vendorId} onChange={e => { setVendorId(e.target.value); setPoId('') }}>
                    <option value="">Select vendor…</option>
                    {fuelVendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.contact_name ? ` — ${v.contact_name}` : ''}</option>)}
                  </select>
                )}
              </div>
              {vendorId && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Purchase Order (optional)</p>
                  <select className={inp} value={poId} onChange={e => setPoId(e.target.value)}>
                    <option value="">No PO / Ad-hoc supply</option>
                    {vendorPOs.map(p => (
                      <option key={p.id} value={p.id}>{p.po_number} — {format(new Date(p.po_date), 'dd MMM yyyy')} — ₹{Number(p.total_amount || 0).toLocaleString('en-IN')}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Meter + Voucher */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Meter at Issue</p>
              <input type="number" className={inp} value={meter} onChange={e => setMeter(e.target.value)} placeholder="hrs / km" min="0" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Voucher No.</p>
              <input className={inp} value={voucher} onChange={e => setVoucher(e.target.value)} placeholder="FV-001" />
            </div>
          </div>

          {/* Delivery person + Company Incharge */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">
                {isVendorSource ? 'Delivered By (vendor)' : 'Issued By (name)'}
              </p>
              <input className={inp} value={deliveredBy} onChange={e => setDeliveredBy(e.target.value)}
                placeholder={isVendorSource ? 'Driver / delivery person' : 'Who filled the fuel'} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Company Incharge *</p>
              <select className={inp} value={inchargeId} onChange={e => setInchargeId(e.target.value)}>
                <option value="">Select incharge…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Notes</p>
            <input className={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any remarks…" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-dark-700 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-dark-600 text-slate-400 text-sm hover:text-slate-200 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Log Issue'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Fuel Tab ──────────────────────────────────────────────────────────────────
function FuelTab({ companyId }) {
  const { userProfile, role } = useAuth()
  const qc = useQueryClient()
  const [subTab,          setSubTab]          = useState('issues')  // 'issues' | 'filled' | 'tanks'
  const [showIssueForm,   setShowIssueForm]   = useState(false)
  const [showAddTank,     setShowAddTank]     = useState(false)
  const [replenishTankId, setReplenishTankId] = useState(null) // tank id to replenish, or null
  const [filterMonth,     setFilterMonth]     = useState(format(new Date(), 'yyyy-MM'))
  const [expandedTankId,  setExpandedTankId]  = useState(null) // tank id whose receipt log is shown

  const canIssueFuel = ['admin', 'manager'].includes(role)

  const monthStart = filterMonth + '-01'
  const monthEnd   = (() => {
    const [y, m] = filterMonth.split('-').map(Number)
    return new Date(y, m, 0).toISOString().slice(0, 10)
  })()

  // Fuel Issues (company stock → machine)
  const { data: issues = [], isLoading: issuesLoading } = useQuery({
    queryKey: ['fuel_issues', companyId, filterMonth],
    queryFn: async () => {
      const { data } = await supabase.from('fuel_issues')
        .select('*')
        .eq('company_id', companyId)
        .gte('issue_date', monthStart)
        .lte('issue_date', monthEnd)
        .order('issue_date', { ascending: false })
      return data || []
    },
  })

  // Operator-reported fuel fills (shift_fuel_entries)
  const { data: fills = [], isLoading: fillsLoading } = useQuery({
    queryKey: ['all_fuel', companyId, filterMonth],
    queryFn: async () => {
      const { data } = await supabase.from('shift_fuel_entries')
        .select('*, equipment(name, category)')
        .eq('company_id', companyId)
        .gte('entry_time', monthStart + 'T00:00:00')
        .lte('entry_time', monthEnd + 'T23:59:59')
        .order('entry_time', { ascending: false })
      return data || []
    },
  })

  // Daily ops fuel consumed for the month
  const { data: consumed = [] } = useQuery({
    queryKey: ['fuel_consumed_month', companyId, filterMonth],
    queryFn: async () => {
      const { data } = await supabase.from('daily_operations')
        .select('equipment_id, equipment_name, fuel_consumed')
        .eq('company_id', companyId)
        .gte('ops_date', monthStart)
        .lte('ops_date', monthEnd)
        .not('fuel_consumed', 'is', null)
      return data || []
    },
  })

  // Fuel Tanks — always loaded (needed for Tanks sub-tab)
  const { data: tanks = [], isLoading: tanksLoading } = useQuery({
    queryKey: ['fuel_tanks', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('fuel_tanks')
        .select('id,name,tank_type,location,capacity_liters,current_stock,is_active,notes,equipment_id,equipment:equipment_id(name,registration_number,equipment_number,category)')
        .eq('company_id', companyId)
        .order('name')
      return data || []
    },
  })

  // Replenishment receipts — all tanks for this company, most recent first
  const { data: allReplenishments = [] } = useQuery({
    queryKey: ['fuel_replenishments', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('fuel_tank_replenishments')
        .select('id,tank_id,replenish_date,quantity_liters,vendor_name,invoice_ref,rate_per_liter,total_amount,notes,bill_id,bill:bill_id(bill_number)')
        .eq('company_id', companyId)
        .order('replenish_date', { ascending: false })
        .order('created_at',     { ascending: false })
        .limit(200)
      return data || []
    },
  })

  const totalIssued   = issues.reduce((s, i) => s + Number(i.quantity_liters || 0), 0)
  const totalFilled   = fills.reduce((s, f) => s + Number(f.quantity_liters || 0), 0)
  const totalConsumed = consumed.reduce((s, c) => s + Number(c.fuel_consumed || 0), 0)
  const variance      = totalIssued - totalConsumed  // positive = unaccounted
  const totalTankStock = tanks.filter(t => t.is_active).reduce((s, t) => s + Number(t.current_stock || 0), 0)

  const SOURCE_LABELS = {
    company_bowser: '🚛 Bowser',
    company_tank:   '🛢️ Tank',
    vendor_supply:  '🏪 Vendor',
    petrol_pump:    '⛽ Pump',
  }
  const TANK_TYPE_LABELS = { bowser: 'Bowser', fixed_tank: 'Fixed Tank', drum: 'Drum' }

  const isListLoading = subTab === 'issues' ? issuesLoading : subTab === 'filled' ? fillsLoading : tanksLoading

  const refetchTanks = () => {
    qc.invalidateQueries({ queryKey: ['fuel_tanks', companyId] })
    qc.invalidateQueries({ queryKey: ['fuel_replenishments', companyId] })
  }

  return (
    <div className="flex flex-col h-full">
      {/* KPI strip */}
      <div className="flex gap-2 px-4 pt-3 pb-1 shrink-0 overflow-x-auto">
        <div className="bg-dark-700 rounded-xl px-3 py-2 text-xs shrink-0">
          <p className="text-slate-400">Issued</p>
          <p className="font-bold text-yellow-400">{totalIssued.toFixed(0)} L</p>
        </div>
        <div className="bg-dark-700 rounded-xl px-3 py-2 text-xs shrink-0">
          <p className="text-slate-400">Consumed</p>
          <p className="font-bold text-blue-400">{totalConsumed.toFixed(0)} L</p>
        </div>
        <div className="bg-dark-700 rounded-xl px-3 py-2 text-xs shrink-0">
          <p className="text-slate-400">Filled (ops)</p>
          <p className="font-bold text-green-400">{totalFilled.toFixed(0)} L</p>
        </div>
        <div className={`rounded-xl px-3 py-2 text-xs shrink-0 ${variance > 5 ? 'bg-red-900/40' : 'bg-dark-700'}`}>
          <p className="text-slate-400">Variance</p>
          <p className={`font-bold ${variance > 5 ? 'text-red-400' : variance < -5 ? 'text-orange-400' : 'text-slate-300'}`}>
            {variance >= 0 ? '+' : ''}{variance.toFixed(0)} L
          </p>
        </div>
        <div className="bg-dark-700 rounded-xl px-3 py-2 text-xs shrink-0">
          <p className="text-slate-400">Tank Stock</p>
          <p className="font-bold text-cyan-400">{totalTankStock.toFixed(0)} L</p>
        </div>
      </div>

      {/* Sub-tab + month filter + action */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0">
        <div className="flex rounded-lg overflow-hidden border border-dark-600 shrink-0">
          {[
            { id: 'issues', label: 'Issued' },
            { id: 'filled', label: 'Filled (ops)' },
            { id: 'tanks',  label: '🛢️ Tanks' },
          ].map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors
                ${subTab === t.id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {subTab !== 'tanks' && (
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-primary-500" />
        )}
        {subTab === 'issues' && canIssueFuel && (
          <button onClick={() => setShowIssueForm(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium transition-colors shrink-0">
            <Plus className="w-3.5 h-3.5" /> Issue Fuel
          </button>
        )}
        {subTab === 'tanks' && canIssueFuel && (
          <button onClick={() => setShowAddTank(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium transition-colors shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add Tank
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isListLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : subTab === 'issues' ? (
          issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Fuel className="w-10 h-10 text-slate-600" />
              <p className="text-slate-400">No fuel issues logged this month</p>
              {canIssueFuel && (
                <button onClick={() => setShowIssueForm(true)} className="btn-primary text-xs mt-2 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Issue Fuel
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {issues.map(i => (
                <div key={i.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-100 text-sm truncate">{i.equipment_name || '—'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{format(new Date(i.issue_date), 'dd MMM yyyy')}</span>
                        <span className="text-xs bg-dark-600 text-slate-400 rounded px-1.5 py-0.5">{SOURCE_LABELS[i.fuel_source] || i.fuel_source}</span>
                        {(i.tank_name || i.vendor_name) && (
                          <span className="text-xs text-slate-500 truncate">{i.tank_name || i.vendor_name}</span>
                        )}
                      </div>
                    </div>
                    <p className="font-bold text-yellow-400 text-sm shrink-0">{i.quantity_liters} L</p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    {i.po_number        && <span>PO: {i.po_number}</span>}
                    {i.meter_at_issue   && <span>Meter: {i.meter_at_issue}</span>}
                    {i.voucher_number   && <span>Voucher: {i.voucher_number}</span>}
                    {i.delivered_by     && <span>Delivered by: {i.delivered_by}</span>}
                    {i.incharge_name    && <span className="text-primary-400">Incharge: {i.incharge_name}</span>}
                    {i.notes            && <span className="italic">{i.notes}</span>}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : subTab === 'filled' ? (
          fills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Fuel className="w-10 h-10 text-slate-600" />
              <p className="text-slate-400">No operator fuel entries this month</p>
            </div>
          ) : (
            <div className="space-y-2">
              {fills.map(e => (
                <div key={e.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-100 text-sm">{e.equipment?.name}</p>
                      <p className="text-xs text-slate-400">{e.equipment?.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-400">{e.quantity_liters} L</p>
                      {e.total_amount && <p className="text-xs text-slate-400">₹{Number(e.total_amount).toLocaleString('en-IN')}</p>}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    {e.meter_at_filling  && <span>Meter: {e.meter_at_filling} hrs</span>}
                    {e.delivered_by_name && <span>By: {e.delivered_by_name}</span>}
                    {e.rate_per_liter    && <span>₹{e.rate_per_liter}/L</span>}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{format(new Date(e.entry_time || e.created_at), 'dd MMM yyyy, HH:mm')}</p>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Tanks sub-tab */
          tanks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Fuel className="w-10 h-10 text-slate-600" />
              <p className="text-slate-400">No tanks added yet</p>
              {canIssueFuel && (
                <button onClick={() => setShowAddTank(true)} className="btn-primary text-xs mt-2 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Tank / Bowser
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {tanks.map(tank => {
                const pct = tank.capacity_liters ? Math.min(100, (tank.current_stock / tank.capacity_liters) * 100) : null
                const isLow = pct !== null && pct < 20
                return (
                  <div key={tank.id} className={`bg-dark-800 border rounded-xl p-4 ${isLow ? 'border-red-700/60' : 'border-dark-700'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-100 text-sm">{tank.name}</p>
                          <span className="text-xs bg-dark-600 text-slate-400 rounded px-1.5 py-0.5">{TANK_TYPE_LABELS[tank.tank_type] || tank.tank_type}</span>
                          {tank.equipment?.registration_number && (
                            <span className="text-xs font-mono text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded">{tank.equipment.registration_number}</span>
                          )}
                          {!tank.is_active && <span className="text-xs bg-red-900/40 text-red-400 rounded px-1.5 py-0.5">Inactive</span>}
                        </div>
                        {tank.location && <p className="text-xs text-slate-500 mt-0.5">📍 {tank.location}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${isLow ? 'text-red-400' : 'text-cyan-400'}`}>{Number(tank.current_stock || 0).toFixed(0)} L</p>
                        {tank.capacity_liters && <p className="text-xs text-slate-500">of {tank.capacity_liters} L cap.</p>}
                      </div>
                    </div>
                    {pct !== null && (
                      <div className="mt-3">
                        <div className="w-full h-2 bg-dark-600 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${isLow ? 'bg-red-500' : pct < 50 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{pct.toFixed(0)}% full {isLow && '— Low stock!'}</p>
                      </div>
                    )}
                    {tank.notes && <p className="text-xs text-slate-500 mt-2 italic">{tank.notes}</p>}
                    {/* Receipt History toggle */}
                    {(() => {
                      const tankRecs = allReplenishments.filter(r => r.tank_id === tank.id)
                      const isExpanded = expandedTankId === tank.id
                      if (tankRecs.length === 0 && !isExpanded) return null
                      return (
                        <div className="mt-3">
                          <button
                            onClick={() => setExpandedTankId(isExpanded ? null : tank.id)}
                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors w-full"
                          >
                            <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            Receipt History ({tankRecs.length})
                          </button>
                          {isExpanded && (
                            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {tankRecs.length === 0 && (
                                <p className="text-xs text-slate-600 text-center py-3">No receipts yet</p>
                              )}
                              {tankRecs.map(r => (
                                <div key={r.id} className="bg-dark-700/60 rounded-lg px-2.5 py-2 flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-semibold text-cyan-400">+{Number(r.quantity_liters).toFixed(0)} L</span>
                                      {r.bill?.bill_number && (
                                        <span className="text-[10px] font-mono text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded">{r.bill.bill_number}</span>
                                      )}
                                      {r.invoice_ref && !r.bill?.bill_number && (
                                        <span className="text-[10px] text-slate-500">{r.invoice_ref}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 flex-wrap">
                                      <span>{r.replenish_date}</span>
                                      {r.vendor_name && <span>· {r.vendor_name}</span>}
                                      {r.rate_per_liter && <span>· ₹{Number(r.rate_per_liter).toFixed(2)}/L</span>}
                                    </div>
                                  </div>
                                  {r.total_amount && (
                                    <span className="text-xs font-semibold text-green-400 shrink-0">₹{Number(r.total_amount).toLocaleString('en-IN')}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {canIssueFuel && (
                      <div className="mt-3 flex justify-end">
                        <button onClick={() => setReplenishTankId(tank.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-700/30 hover:bg-cyan-700/50 text-cyan-300 text-xs font-medium transition-colors">
                          + Replenish Stock
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {showIssueForm && (
        <FuelIssueModal
          companyId={companyId}
          userProfile={userProfile}
          onClose={() => setShowIssueForm(false)}
          onSaved={() => {
            setShowIssueForm(false)
            qc.invalidateQueries({ queryKey: ['fuel_issues', companyId, filterMonth] })
            refetchTanks()
          }}
        />
      )}
      {showAddTank && (
        <FuelTankModal
          companyId={companyId}
          userProfile={userProfile}
          onClose={() => setShowAddTank(false)}
          onSaved={() => { setShowAddTank(false); refetchTanks() }}
        />
      )}
      {replenishTankId && (
        <ReplenishTankModal
          companyId={companyId}
          tankId={replenishTankId}
          tankName={tanks.find(t => t.id === replenishTankId)?.name}
          userProfile={userProfile}
          onClose={() => setReplenishTankId(null)}
          onSaved={() => { setReplenishTankId(null); refetchTanks() }}
        />
      )}
    </div>
  )
}

// ── Job Card Modal ────────────────────────────────────────────────────────────
function JobCardModal({ equipment, companyId, initialValues, onClose, onSaved }) {
  const inp  = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'
  const area = `${inp} resize-none`
  const isEdit = !!initialValues?.id

  const [jcType,       setJcType]       = useState(initialValues?.jc_type       || 'breakdown')
  const [status,       setStatus]       = useState(initialValues?.status         || 'open')
  const [complaint,    setComplaint]    = useState(initialValues?.complaint       || '')
  const [diagnosis,    setDiagnosis]    = useState(initialValues?.diagnosis      || '')
  const [workDone,     setWorkDone]     = useState(initialValues?.work_done      || '')
  const [techName,     setTechName]     = useState(initialValues?.technician_name || '')
  const [doneBy,       setDoneBy]       = useState(initialValues?.done_by        || 'inhouse')
  const [vendorName,   setVendorName]   = useState(initialValues?.vendor_name    || '')
  const [openedDate,   setOpenedDate]   = useState(initialValues?.opened_date    || today())
  const [closedDate,   setClosedDate]   = useState(initialValues?.closed_date    || '')
  const [meterAtOpen,  setMeterAtOpen]  = useState(initialValues?.meter_at_open  || equipment.current_meter_reading || '')
  const [laborHours,   setLaborHours]   = useState(initialValues?.labor_hours    || '')
  const [laborCost,    setLaborCost]    = useState(initialValues?.labor_cost     || '')
  const [downtime,     setDowntime]     = useState(initialValues?.downtime_hours || '')
  const [notes,        setNotes]        = useState(initialValues?.notes          || '')

  // Parts
  const [parts, setParts] = useState(initialValues?.job_card_parts || [])
  const [newPart, setNewPart] = useState({ part_name: '', part_number: '', quantity: '1', unit_cost: '' })

  const [saving, setSaving] = useState(false)

  const addPart = () => {
    if (!newPart.part_name.trim()) return
    setParts(prev => [...prev, { ...newPart, _new: true, id: crypto.randomUUID() }])
    setNewPart({ part_name: '', part_number: '', quantity: '1', unit_cost: '' })
  }
  const removePart = (id) => setParts(prev => prev.filter(p => p.id !== id))

  const handleSave = async () => {
    if (!complaint.trim() && !workDone.trim()) {
      toast.error('Enter complaint or work done description')
      return
    }
    setSaving(true)
    try {
      const payload = {
        company_id:      companyId,
        equipment_id:    equipment.id,
        equipment_name:  equipment.equipment_name || equipment.name || '',
        jc_type:         jcType,
        status,
        complaint:       complaint || null,
        diagnosis:       diagnosis || null,
        work_done:       workDone  || null,
        technician_name: techName  || null,
        done_by:         doneBy    || null,
        vendor_name:     doneBy === 'vendor' ? (vendorName || null) : null,
        opened_date:     openedDate,
        closed_date:     closedDate || null,
        meter_at_open:   meterAtOpen ? Number(meterAtOpen) : null,
        labor_hours:     laborHours  ? Number(laborHours)  : null,
        labor_cost:      laborCost   ? Number(laborCost)   : null,
        downtime_hours:  downtime    ? Number(downtime)    : null,
        notes:           notes       || null,
        pm_schedule_id:  initialValues?.pm_schedule_id || null,
        jc_number:       isEdit ? undefined : '',   // trigger generates it
      }

      let jcId = initialValues?.id
      if (isEdit) {
        const { error } = await supabase.from('job_cards').update(payload).eq('id', jcId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('job_cards').insert(payload).select('id').single()
        if (error) throw error
        jcId = data.id
      }

      // Sync parts: delete old and re-insert new for simplicity (small lists)
      const newParts = parts.filter(p => p._new || !p.job_card_id)
      const keepIds  = parts.filter(p => !p._new && p.job_card_id).map(p => p.id)

      if (isEdit) {
        // Delete removed parts
        await supabase.from('job_card_parts')
          .delete()
          .eq('job_card_id', jcId)
          .not('id', 'in', `(${keepIds.length ? keepIds.join(',') : "''"})`)
      }

      const partsToInsert = newParts.map(p => ({
        job_card_id: jcId,
        company_id:  companyId,
        part_name:   p.part_name,
        part_number: p.part_number || null,
        quantity:    Number(p.quantity) || 1,
        unit_cost:   p.unit_cost ? Number(p.unit_cost) : null,
      }))
      if (partsToInsert.length > 0) {
        const { error } = await supabase.from('job_card_parts').insert(partsToInsert)
        if (error) throw error
      }

      toast.success(isEdit ? 'Job card updated' : 'Job card created')
      onSaved?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{isEdit ? 'Edit Job Card' : 'New Job Card'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{equipment.equipment_name || equipment.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select value={jcType} onChange={e => setJcType(e.target.value)} className={inp}>
                <option value="breakdown">Breakdown</option>
                <option value="pm_service">PM Service</option>
                <option value="unscheduled">Unscheduled</option>
                <option value="inspection">Inspection</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inp}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Dates + Meter */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Opened Date</label>
              <input type="date" value={openedDate} onChange={e => setOpenedDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Meter at Open (hrs)</label>
              <input type="number" value={meterAtOpen} onChange={e => setMeterAtOpen(e.target.value)} placeholder={equipment.current_meter_reading || '0'} className={inp} />
            </div>
          </div>

          {/* Complaint */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Complaint / Problem Reported</label>
            <textarea rows={2} value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="What did the operator report?" className={area} />
          </div>

          {/* Diagnosis */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Diagnosis</label>
            <textarea rows={2} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Workshop finding..." className={area} />
          </div>

          {/* Work Done */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Work Done</label>
            <textarea rows={2} value={workDone} onChange={e => setWorkDone(e.target.value)} placeholder="Describe work carried out..." className={area} />
          </div>

          {/* Technician */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Technician</label>
              <input type="text" value={techName} onChange={e => setTechName(e.target.value)} placeholder="Technician name" className={inp} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Done By</label>
              <select value={doneBy} onChange={e => setDoneBy(e.target.value)} className={inp}>
                <option value="inhouse">In-house</option>
                <option value="vendor">Vendor</option>
                <option value="oem">OEM</option>
              </select>
            </div>
          </div>
          {doneBy === 'vendor' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Vendor Name</label>
              <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Service vendor name" className={inp} />
            </div>
          )}

          {/* Labor + Downtime */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Labor Hours</label>
              <input type="number" value={laborHours} onChange={e => setLaborHours(e.target.value)} placeholder="0" className={inp} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Labor Cost (₹)</label>
              <input type="number" value={laborCost} onChange={e => setLaborCost(e.target.value)} placeholder="0" className={inp} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Downtime (hrs)</label>
              <input type="number" value={downtime} onChange={e => setDowntime(e.target.value)} placeholder="0" className={inp} />
            </div>
          </div>

          {/* Closed Date */}
          {status === 'closed' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Closed Date</label>
              <input type="date" value={closedDate} onChange={e => setClosedDate(e.target.value)} className={inp} />
            </div>
          )}

          {/* Parts */}
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-2">Parts Used</p>
            {parts.length > 0 && (
              <div className="space-y-1 mb-2">
                {parts.map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-dark-700/50 rounded-lg px-3 py-2 text-xs">
                    <span className="flex-1 text-slate-200">{p.part_name}{p.part_number ? ` · ${p.part_number}` : ''}</span>
                    <span className="text-slate-500">×{p.quantity}</span>
                    {p.unit_cost > 0 && <span className="text-slate-400">₹{(Number(p.unit_cost) * Number(p.quantity)).toLocaleString('en-IN')}</span>}
                    <button onClick={() => removePart(p.id)} className="text-red-400 hover:text-red-300 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-12 gap-2">
              <input type="text" value={newPart.part_name} onChange={e => setNewPart(p => ({ ...p, part_name: e.target.value }))} placeholder="Part name" className={`${inp} col-span-5`} />
              <input type="text" value={newPart.part_number} onChange={e => setNewPart(p => ({ ...p, part_number: e.target.value }))} placeholder="P/N" className={`${inp} col-span-2`} />
              <input type="number" value={newPart.quantity} onChange={e => setNewPart(p => ({ ...p, quantity: e.target.value }))} placeholder="Qty" className={`${inp} col-span-2`} />
              <input type="number" value={newPart.unit_cost} onChange={e => setNewPart(p => ({ ...p, unit_cost: e.target.value }))} placeholder="₹/unit" className={`${inp} col-span-2`} />
              <button onClick={addPart} className="col-span-1 flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." className={area} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-dark-600 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 border border-dark-500 text-slate-300 text-sm rounded-xl hover:border-slate-400 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PM Schedule Modal ─────────────────────────────────────────────────────────
function PMScheduleModal({ equipment, companyId, initialValues, onClose, onSaved }) {
  const inp  = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'
  const isEdit = !!initialValues?.id

  const [name,         setName]         = useState(initialValues?.schedule_name   || '')
  const [interval,     setInterval]     = useState(initialValues?.interval_hours  || '')
  const [lastMeter,    setLastMeter]    = useState(initialValues?.last_done_meter || '')
  const [lastDate,     setLastDate]     = useState(initialValues?.last_done_date  || '')
  const [nextMeter,    setNextMeter]    = useState(initialValues?.next_due_meter  || '')
  const [notes,        setNotes]        = useState(initialValues?.notes           || '')
  const [tasks,        setTasks]        = useState(() => {
    const t = initialValues?.tasks
    if (!t) return []
    if (Array.isArray(t)) return t.map(item => typeof item === 'string' ? { task: item, category: '', required: false } : item)
    return []
  })
  const [newTask,      setNewTask]      = useState('')
  const [newRequired,  setNewRequired]  = useState(false)
  const [saving,       setSaving]       = useState(false)

  // Auto-compute next_due_meter when lastMeter or interval changes
  useEffect(() => {
    if (lastMeter && interval) {
      setNextMeter((Number(lastMeter) + Number(interval)).toString())
    }
  }, [lastMeter, interval])

  const addTask = () => {
    if (!newTask.trim()) return
    setTasks(prev => [...prev, { task: newTask.trim(), category: '', required: newRequired }])
    setNewTask(''); setNewRequired(false)
  }
  const removeTask = (i) => setTasks(prev => prev.filter((_, idx) => idx !== i))
  const toggleRequired = (i) => setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, required: !t.required } : t))

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Schedule name is required'); return }
    if (!interval)    { toast.error('Interval hours is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id:       companyId,
        equipment_id:     equipment.id,
        equipment_name:   equipment.equipment_name || equipment.name || '',
        schedule_name:    name.trim(),
        interval_hours:   Number(interval),
        last_done_meter:  lastMeter ? Number(lastMeter) : null,
        last_done_date:   lastDate  || null,
        next_due_meter:   nextMeter ? Number(nextMeter) : null,
        tasks:            tasks,
        notes:            notes || null,
        is_active:        true,
      }
      if (isEdit) {
        const { error } = await supabase.from('pm_schedules').update(payload).eq('id', initialValues.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('pm_schedules').insert(payload)
        if (error) throw error
      }
      toast.success(isEdit ? 'PM schedule updated' : 'PM schedule added')
      onSaved?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{isEdit ? 'Edit PM Schedule' : 'Add PM Schedule'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{equipment.equipment_name || equipment.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name + Interval */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Schedule Name <span className="text-red-400">*</span></label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 250hr Service" className={inp} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Interval (hrs) <span className="text-red-400">*</span></label>
              <input type="number" value={interval} onChange={e => setInterval(e.target.value)} placeholder="250" className={inp} />
            </div>
          </div>

          {/* Last done */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Last Done at (hrs)</label>
              <input type="number" value={lastMeter} onChange={e => setLastMeter(e.target.value)} placeholder="Current meter reading" className={inp} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Last Done Date</label>
              <input type="date" value={lastDate} onChange={e => setLastDate(e.target.value)} className={inp} />
            </div>
          </div>

          {/* Next due */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Next Due at (hrs) <span className="text-slate-600">— auto-computed</span></label>
            <input type="number" value={nextMeter} onChange={e => setNextMeter(e.target.value)} placeholder="last_done + interval" className={inp} />
          </div>

          {/* Task checklist */}
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-2">Task Checklist</p>
            {tasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {tasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 bg-dark-700/50 rounded-lg px-3 py-2 text-xs">
                    <span className="flex-1 text-slate-200">{t.task}</span>
                    <button onClick={() => toggleRequired(i)} className={`text-[10px] px-1.5 rounded transition-colors ${t.required ? 'bg-red-500/20 text-red-400' : 'bg-dark-600 text-slate-500 hover:text-slate-300'}`}>req</button>
                    <button onClick={() => removeTask(i)} className="text-red-400 hover:text-red-300 transition-colors"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newTask} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="Add task (e.g. Check engine oil, Replace filter...)" className={`${inp} flex-1`} />
              <button onClick={addTask} className="px-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." className={`${inp} resize-none`} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-dark-600 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 border border-dark-500 text-slate-300 text-sm rounded-xl hover:border-slate-400 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Fuel Tank Modal (add new tank) ────────────────────────────────────────────
function FuelTankModal({ companyId, onClose, onSaved }) {
  const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'
  const [name,        setName]        = useState('')
  const [type,        setType]        = useState('fixed_tank')
  const [location,    setLocation]    = useState('')
  const [capacity,    setCapacity]    = useState('')
  const [stock,       setStock]       = useState('0')
  const [notes,       setNotes]       = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [saving,      setSaving]      = useState(false)

  // Fleet bowsers for linking
  const { data: fleetBowsers = [] } = useQuery({
    queryKey: ['fleet_bowsers', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id, name, equipment_number, registration_number, category')
        .eq('company_id', companyId)
        .eq('category', 'Fuel Bowser')
        .order('name')
      return data || []
    },
    enabled: type === 'bowser' && !!companyId,
  })

  const handleEquipSelect = (equipId) => {
    setEquipmentId(equipId)
    const equip = fleetBowsers.find(e => e.id === equipId)
    if (equip && !name.trim()) setName(equip.name)
  }

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Enter a name')
    setSaving(true)
    try {
      const { error } = await supabase.from('fuel_tanks').insert({
        company_id:      companyId,
        name:            name.trim(),
        tank_type:       type,
        location:        location.trim() || null,
        capacity_liters: capacity ? parseFloat(capacity) : null,
        current_stock:   stock    ? parseFloat(stock)    : 0,
        notes:           notes.trim() || null,
        equipment_id:    equipmentId || null,
      })
      if (error) throw error
      toast.success(type === 'bowser' ? 'Bowser fuel record added' : 'Tank added')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <p className="text-sm font-bold text-slate-100">Add Fuel Tank / Bowser Stock</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-xs text-slate-400 mb-1">Type</p>
            <select className={inp} value={type} onChange={e => { setType(e.target.value); setEquipmentId('') }}>
              <option value="fixed_tank">Fixed Tank (stationary)</option>
              <option value="bowser">Bowser (mobile vehicle)</option>
              <option value="drum">Drum</option>
            </select>
          </div>

          {/* If bowser: link to fleet equipment */}
          {type === 'bowser' && (
            <div className="bg-dark-700/60 rounded-xl p-3 space-y-2 border border-dark-600">
              <p className="text-xs font-semibold text-primary-400 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Link to Fleet Bowser
              </p>
              <p className="text-[11px] text-slate-500">Select the bowser registered in Fleet to link its vehicle details. Register it in Fleet → Add Equipment (type: Fuel Bowser) first if not listed.</p>
              <select className={inp} value={equipmentId} onChange={e => handleEquipSelect(e.target.value)}>
                <option value="">— Select fleet bowser —</option>
                {fleetBowsers.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name}{e.equipment_number ? ` (${e.equipment_number})` : ''}{e.registration_number ? ` · ${e.registration_number}` : ''}
                  </option>
                ))}
                {fleetBowsers.length === 0 && <option disabled>No Fuel Bowser equipment registered yet</option>}
              </select>
            </div>
          )}

          <div>
            <p className="text-xs text-slate-400 mb-1">{type === 'bowser' ? 'Bowser Name / Label *' : 'Tank Name *'}</p>
            <input className={inp} value={name} onChange={e => setName(e.target.value)}
              placeholder={type === 'bowser' ? 'e.g. Main Bowser, FB-01' : 'e.g. Site A Tank, Yard Tank'} />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">{type === 'bowser' ? 'Base Location / Yard' : 'Location / Site'}</p>
            <input className={inp} value={location} onChange={e => setLocation(e.target.value)} placeholder="Site name or yard" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Capacity (L)</p>
              <input type="number" className={inp} value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="e.g. 5000" min="0" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Opening Stock (L)</p>
              <input type="number" className={inp} value={stock} onChange={e => setStock(e.target.value)} placeholder="0" min="0" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Notes</p>
            <input className={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any remarks" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-dark-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-dark-600 text-slate-400 text-sm hover:text-slate-200 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Replenish Tank Modal ───────────────────────────────────────────────────────
function ReplenishTankModal({ companyId, tankId, tankName, userProfile, onClose, onSaved }) {
  const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'
  const [date,       setDate]       = useState(new Date().toISOString().slice(0, 10))
  const [qty,        setQty]        = useState('')
  const [vendorId,   setVendorId]   = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [rate,       setRate]       = useState('')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)

  const { data: fuelVendors = [] } = useQuery({
    queryKey: ['fuel_vendors', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id,name').eq('company_id', companyId).eq('vendor_type', 'fuel').eq('is_active', true).order('name')
      return data || []
    },
  })

  const selectedVendor = fuelVendors.find(v => v.id === vendorId)
  const qtyNum         = parseFloat(qty) || 0
  const totalAmount    = rate && qtyNum ? (parseFloat(rate) * qtyNum).toFixed(2) : null

  const handleSave = async () => {
    if (!qty || qtyNum <= 0) return toast.error('Enter quantity to replenish')
    setSaving(true)
    try {
      const { error } = await supabase.from('fuel_tank_replenishments').insert({
        company_id:      companyId,
        tank_id:         tankId,
        replenish_date:  date,
        quantity_liters: qtyNum,
        vendor_id:       vendorId || null,
        vendor_name:     selectedVendor?.name || null,
        invoice_ref:     invoiceRef.trim() || null,
        rate_per_liter:  rate  ? parseFloat(rate)  : null,
        total_amount:    totalAmount ? parseFloat(totalAmount) : null,
        received_by:     userProfile?.id        || null,
        received_by_name: userProfile?.full_name || null,
        notes:           notes.trim() || null,
      })
      if (error) throw error
      toast.success(`${qtyNum.toFixed(0)} L added to ${tankName}`)
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <p className="text-sm font-bold text-slate-100">Replenish — {tankName}</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Date *</p>
              <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Qty Received (L) *</p>
              <input type="number" className={inp} value={qty} onChange={e => setQty(e.target.value)} placeholder="0.0" min="0" step="0.5" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Fuel Vendor</p>
            <select className={inp} value={vendorId} onChange={e => setVendorId(e.target.value)}>
              <option value="">Select vendor (optional)</option>
              {fuelVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Invoice / DC Ref.</p>
              <input className={inp} value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-001" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Rate per Litre (₹)</p>
              <input type="number" className={inp} value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" min="0" step="0.01" />
            </div>
          </div>
          {totalAmount && (
            <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
              <span className="text-slate-400">Total Value</span>
              <span className="font-bold text-green-400">₹{Number(totalAmount).toLocaleString('en-IN')}</span>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400 mb-1">Notes</p>
            <input className={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any remarks" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-dark-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-dark-600 text-slate-400 text-sm hover:text-slate-200 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Add Stock'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Incidents Tab ─────────────────────────────────────────────────────────────
function IncidentsTab({ companyId }) {
  const qc = useQueryClient()
  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['all_incidents', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('shift_incidents')
        .select('*, equipment(name, category)').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data || []
    },
  })

  const resolveIncident = async (id) => {
    const { error } = await supabase.from('shift_incidents')
      .update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error('Failed to resolve'); return }
    toast.success('Marked as resolved')
    qc.invalidateQueries(['all_incidents', companyId])
  }

  const open = incidents.filter(i => !i.resolved).length

  return (
    <div className="flex flex-col h-full">
      {incidents.length > 0 && (
        <div className="px-4 py-2 shrink-0">
          <p className="text-xs text-slate-400">{open} open · {incidents.length - open} resolved</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertTriangle className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">No incidents reported</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incidents.map(i => {
              const incOption = INCIDENT_OPTIONS.find(t => t.value === i.incident_type)
              return (
                <div key={i.id} className={`bg-dark-800 border rounded-xl p-3 ${i.resolved ? 'border-dark-700 opacity-60' : 'border-orange-700/30'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 text-sm">{i.equipment?.name}</p>
                      <p className="text-xs text-slate-400">{incOption?.icon} {incOption?.label || i.incident_type}{i.severity ? ` · ${i.severity}` : ''}</p>
                    </div>
                    {!i.resolved && (
                      <button onClick={() => resolveIncident(i.id)}
                        className="shrink-0 flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-700/40 rounded-lg px-2 py-1">
                        <CheckCircle className="w-3 h-3" /> Resolve
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{i.description}</p>
                  {i.breakdown_cause        && <p className="text-xs text-slate-400 mt-0.5">Cause: {i.breakdown_cause}</p>}
                  {i.rectification_needed   && <p className="text-xs text-slate-400 mt-0.5">Fix needed: {i.rectification_needed}</p>}
                  {i.damage_cause           && <p className="text-xs text-slate-400 mt-0.5">How: {i.damage_cause}</p>}
                  {i.what_needs_to_be_done  && <p className="text-xs text-slate-400 mt-0.5">Action: {i.what_needs_to_be_done}</p>}
                  {i.location_address && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{i.location_address.slice(0, 60)}</p>
                  )}
                  <p className="text-xs text-slate-600 mt-1">{format(new Date(i.created_at), 'dd MMM yyyy, HH:mm')}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hired In Tab ──────────────────────────────────────────────────────────────
// ── Transfer Certificate Capture Modal ────────────────────────────────────────
// Shown when a machine transfer is detected — captures fuel level, condition,
// and incharge signatures before generating the TC PDF.
function TCCaptureModal({ fromProject, toProject, equipment, meterReading, authorizedBy, deploySaving, onConfirm, onCancel }) {
  const FUEL_LEVELS  = ['Full', '3/4 Full', 'Half', '1/4 Full', 'Empty']
  const CONDITIONS   = [
    { value: 'Good',    label: 'Good',    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    { value: 'Fair',    label: 'Fair',    color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    { value: 'Damaged', label: 'Damaged', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  ]

  const [form, setForm] = useState({
    meterReading:   meterReading || '',
    fuelLevel:      'Half',
    condition:      'Good',
    conditionNotes: '',
    fromIncharge:   '',
    fromDesig:      '',
    toIncharge:     '',
    toDesig:        '',
    authorizedBy:   authorizedBy || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-700 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Transfer Certificate</h3>
              <p className="text-xs text-slate-500 mt-0.5">{fromProject} → {toProject}</p>
            </div>
          </div>
          <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5">
            <p className="text-xs text-amber-300 font-medium">{equipment.name}{equipment.equipment_number ? ` · ${equipment.equipment_number}` : ''}</p>
            {equipment.registration_number && <p className="text-xs text-slate-500 mt-0.5">{equipment.registration_number}</p>}
          </div>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">

          {/* Meter + fuel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Meter at Handover ({equipment.meter_type === 'km' ? 'km' : 'hrs'})</label>
              <input className={inp} type="number" value={form.meterReading} onChange={e => set('meterReading', e.target.value)} placeholder="Current reading" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Fuel Level</label>
              <select className={inp + ' appearance-none'} value={form.fuelLevel} onChange={e => set('fuelLevel', e.target.value)}>
                {FUEL_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Machine Condition</label>
            <div className="flex gap-2">
              {CONDITIONS.map(c => (
                <button key={c.value} onClick={() => set('condition', c.value)}
                  className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-all ${form.condition === c.value ? c.color : 'border-dark-600 text-slate-500 bg-dark-800'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Condition notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Condition Notes <span className="text-slate-600">(optional)</span></label>
            <textarea className={inp + ' resize-none'} rows={2}
              value={form.conditionNotes} onChange={e => set('conditionNotes', e.target.value)}
              placeholder="Any damage, defects, or remarks to note…" />
          </div>

          {/* Signatures */}
          <div className="rounded-xl border border-dark-700 bg-dark-800/40 p-3 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Incharge Details <span className="text-slate-600 normal-case font-normal">(printed on TC)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Outgoing Incharge</label>
                <input className={inp} value={form.fromIncharge} onChange={e => set('fromIncharge', e.target.value)} placeholder="Name" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Designation</label>
                <input className={inp} value={form.fromDesig} onChange={e => set('fromDesig', e.target.value)} placeholder="Site Engineer" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Incoming Incharge</label>
                <input className={inp} value={form.toIncharge} onChange={e => set('toIncharge', e.target.value)} placeholder="Name" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Designation</label>
                <input className={inp} value={form.toDesig} onChange={e => set('toDesig', e.target.value)} placeholder="Project Manager" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Authorized By</label>
              <input className={inp} value={form.authorizedBy} onChange={e => set('authorizedBy', e.target.value)} placeholder="Signatory name" />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-dark-700 shrink-0 flex gap-2">
          <button onClick={onCancel} disabled={deploySaving}
            className="flex-1 py-2.5 rounded-xl border border-dark-600 text-slate-400 text-sm hover:text-slate-200 transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={() => onConfirm(form)} disabled={deploySaving}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-40">
            {deploySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
            {deploySaving ? 'Transferring…' : 'Confirm Transfer + Download TC'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HiredInModal({ companyId, contract, projects, onClose, onSaved }) {
  const { role } = useAuth()
  const isAdmin  = ['admin', 'manager'].includes(role)
  const qc       = useQueryClient()

  // Load registered vendors for auto-fill
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-hired-in', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors')
        .select('id, name, contact_name, contact_phone, contact_email, address')
        .eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })
  const [selectedVendorId, setSelectedVendorId] = useState(contract?.vendor_id || '')
  const [vendorSearch, setVendorSearch] = useState('')
  const [showVendorDrop, setShowVendorDrop] = useState(false)

  const filteredVendors = useMemo(() => {
    if (!vendorSearch.trim()) return vendors
    const q = vendorSearch.toLowerCase()
    return vendors.filter(v => v.name.toLowerCase().includes(q))
  }, [vendors, vendorSearch])

  const handleVendorSelect = (v) => {
    setSelectedVendorId(v.id)
    setVendorSearch(v.name)
    setShowVendorDrop(false)
    const contact = [v.contact_name, v.contact_phone, v.contact_email].filter(Boolean).join(' · ')
    setForm(f => ({
      ...f,
      vendor_id:      v.id,
      vendor_name:    v.name,
      vendor_contact: contact,
      vendor_address: v.address || '',
    }))
  }

  const clearVendor = () => {
    setSelectedVendorId('')
    setVendorSearch('')
    setForm(f => ({ ...f, vendor_id: null, vendor_name: '', vendor_contact: '', vendor_address: '' }))
  }

  // Pre-fill search box if editing an existing contract with a vendor name
  useState(() => {
    if (contract?.vendor_name) setVendorSearch(contract.vendor_name)
  })

  const [form, setForm] = useState(contract ? {
    vendor_id:             contract.vendor_id          || null,
    vendor_name:           contract.vendor_name        || '',
    vendor_contact:        contract.vendor_contact      || '',
    vendor_address:        contract.vendor_address      || '',
    machine_type:          contract.machine_type        || '',
    make:                  contract.make               || '',
    model:                 contract.model              || '',
    year_of_manufacture:   contract.year_of_manufacture || '',
    registration_number:   contract.registration_number || '',
    capacity_description:  contract.capacity_description || '',
    hire_rate:             contract.hire_rate           || '',
    rate_type:             contract.rate_type           || 'monthly',
    billing_period:        contract.billing_period      || 'monthly',
    max_hours_per_day:     contract.max_hours_per_day   || '',
    mob_date:              contract.mob_date            || '',
    expected_demob_date:   contract.expected_demob_date || '',
    current_project_id:    contract.current_project_id  || '',
    operator_provided_by:  contract.operator_provided_by || 'own',
    operator_name:         contract.operator_name       || '',
    notes:                 contract.notes               || '',
    status:                contract.status              || 'active',
  } : {
    vendor_id: null, vendor_name: '', vendor_contact: '', vendor_address: '',
    machine_type: '', make: '', model: '', year_of_manufacture: '',
    registration_number: '', capacity_description: '',
    hire_rate: '', rate_type: 'monthly', billing_period: 'monthly',
    max_hours_per_day: '',
    mob_date: new Date().toISOString().slice(0, 10),
    expected_demob_date: '',
    current_project_id: '', operator_provided_by: 'own', operator_name: '',
    notes: '', status: 'active',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.vendor_name.trim() || !form.machine_type.trim()) {
      toast.error('Vendor name and machine type are required'); return
    }
    setSaving(true)
    try {
      const proj = projects.find(p => p.id === form.current_project_id)
      const payload = {
        ...form,
        company_id:           companyId,
        hire_rate:            form.hire_rate ? Number(form.hire_rate) : null,
        max_hours_per_day:    form.max_hours_per_day ? Number(form.max_hours_per_day) : null,
        year_of_manufacture:  form.year_of_manufacture ? Number(form.year_of_manufacture) : null,
        mob_date:             form.mob_date || null,
        expected_demob_date:  form.expected_demob_date || null,
        current_project_name: proj?.project_name || null,
      }
      if (contract?.id) {
        await supabase.from('inward_hire_contracts').update(payload).eq('id', contract.id)
      } else {
        await supabase.from('inward_hire_contracts').insert(payload)
      }
      qc.invalidateQueries(['inward_hire', companyId])
      toast.success(contract?.id ? 'Contract updated' : 'Contract added')
      onSaved?.()
      onClose()
    } catch (err) { toast.error(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const F = ({ label, children, required }) => (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      {children}
    </div>
  )
  const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500'
  const sel = inp + ' appearance-none'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 shrink-0">
          <h3 className="text-base font-semibold text-slate-100">{contract?.id ? 'Edit Hired-In Contract' : 'Add Hired-In Machine'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* Vendor */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor Details</p>
            {selectedVendorId && (
              <button onClick={clearVendor} className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1">
                <X className="w-3 h-3" /> Clear vendor
              </button>
            )}
          </div>

          {/* Vendor search / picker */}
          <F label="Select from Vendor Directory" required>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                className={inp + ' pl-9'}
                value={vendorSearch}
                onChange={e => { setVendorSearch(e.target.value); setShowVendorDrop(true); setSelectedVendorId('') }}
                onFocus={() => setShowVendorDrop(true)}
                onBlur={() => setTimeout(() => setShowVendorDrop(false), 150)}
                placeholder="Search vendor name…"
              />
              {showVendorDrop && filteredVendors.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-dark-800 border border-dark-600 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {filteredVendors.map(v => (
                    <button key={v.id} onMouseDown={() => handleVendorSelect(v)}
                      className="w-full text-left px-3 py-2 hover:bg-dark-700 transition-colors">
                      <p className="text-sm text-slate-100">{v.name}</p>
                      {(v.contact_phone || v.contact_email) && (
                        <p className="text-xs text-slate-500">{v.contact_phone || v.contact_email}</p>
                      )}
                    </button>
                  ))}
                  {filteredVendors.length === 0 && (
                    <p className="text-xs text-slate-500 px-3 py-2">No vendors found — fill details manually below</p>
                  )}
                </div>
              )}
            </div>
          </F>

          {/* Auto-filled or manual fields */}
          <div className={`grid grid-cols-2 gap-3 ${selectedVendorId ? 'opacity-80' : ''}`}>
            <F label="Vendor Name" required>
              <input className={inp} value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)}
                placeholder="Or type manually" readOnly={!!selectedVendorId} />
            </F>
            <F label="Contact">
              <input className={inp} value={form.vendor_contact} onChange={e => set('vendor_contact', e.target.value)}
                placeholder="Phone · email" readOnly={!!selectedVendorId} />
            </F>
          </div>
          {selectedVendorId && (
            <p className="text-xs text-primary-400 -mt-2 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Auto-filled from vendor directory — edit fields above if needed
            </p>
          )}
          <F label="Address">
            <input className={inp} value={form.vendor_address} onChange={e => set('vendor_address', e.target.value)}
              placeholder="Vendor address" readOnly={!!selectedVendorId} />
          </F>

          {/* Machine */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-2">Machine Details</p>
          <div className="grid grid-cols-2 gap-3">
            <F label="Machine Type" required><input className={inp} value={form.machine_type} onChange={e => set('machine_type', e.target.value)} placeholder="Excavator, Tipper…" /></F>
            <F label="Make / Brand"><input className={inp} value={form.make} onChange={e => set('make', e.target.value)} placeholder="Volvo, TATA…" /></F>
            <F label="Model"><input className={inp} value={form.model} onChange={e => set('model', e.target.value)} placeholder="EC210" /></F>
            <F label="Year"><input className={inp} type="number" value={form.year_of_manufacture} onChange={e => set('year_of_manufacture', e.target.value)} placeholder="2020" /></F>
            <F label="Reg / Serial No."><input className={inp} value={form.registration_number} onChange={e => set('registration_number', e.target.value)} placeholder="TN01AB1234" /></F>
            <F label="Capacity / Description"><input className={inp} value={form.capacity_description} onChange={e => set('capacity_description', e.target.value)} placeholder="1.2 cu.m bucket, 10T" /></F>
          </div>

          {/* Hire Terms */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-2">Hire Terms</p>
          <div className="grid grid-cols-3 gap-3">
            <F label="Hire Rate (₹)"><input className={inp} type="number" value={form.hire_rate} onChange={e => set('hire_rate', e.target.value)} placeholder="0" /></F>
            <F label="Rate Type">
              <select className={sel} value={form.rate_type} onChange={e => set('rate_type', e.target.value)}>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
              </select>
            </F>
            <F label="Max hrs/day"><input className={inp} type="number" value={form.max_hours_per_day} onChange={e => set('max_hours_per_day', e.target.value)} placeholder="8" /></F>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <F label="Mob Date"><input className={inp} type="date" value={form.mob_date} onChange={e => set('mob_date', e.target.value)} /></F>
            <F label="Expected Demob"><input className={inp} type="date" value={form.expected_demob_date} onChange={e => set('expected_demob_date', e.target.value)} /></F>
          </div>

          {/* Assignment */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-2">Assignment</p>
          <div className="grid grid-cols-2 gap-3">
            <F label="Assigned Project">
              <select className={sel} value={form.current_project_id} onChange={e => set('current_project_id', e.target.value)}>
                <option value="">— None —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
              </select>
            </F>
            <F label="Operator Provided By">
              <select className={sel} value={form.operator_provided_by} onChange={e => set('operator_provided_by', e.target.value)}>
                <option value="own">Own (our operator)</option>
                <option value="vendor">Vendor (included)</option>
              </select>
            </F>
            {form.operator_provided_by === 'vendor' && (
              <F label="Vendor Operator Name"><input className={inp} value={form.operator_name} onChange={e => set('operator_name', e.target.value)} placeholder="Operator name" /></F>
            )}
          </div>

          {contract?.id && isAdmin && (
            <F label="Status">
              <select className={sel} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="returned">Returned</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </F>
          )}

          <F label="Notes"><textarea className={inp + ' resize-none'} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes…" /></F>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-dark-700 shrink-0">
          <button onClick={onClose} className="flex-1 bg-dark-700 hover:bg-dark-600 text-slate-300 py-2 rounded-lg text-sm font-medium transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-500 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {contract?.id ? 'Save Changes' : 'Add Contract'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HiredInTab({ companyId }) {
  const { role } = useAuth()
  const isAdmin  = ['admin', 'manager'].includes(role)
  const qc       = useQueryClient()
  const [modal,        setModal]        = useState(null)   // null | {} (new) | contract (edit)
  const [returnModal,  setReturnModal]  = useState(null)   // null | contract
  const [statusFilter, setStatusFilter] = useState('active')
  const [search,       setSearch]       = useState('')

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['inward_hire', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('inward_hire_contracts')
        .select('*')
        .eq('company_id', companyId)
        .order('mob_date', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, project_name, project_code').eq('company_id', companyId).order('project_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => {
    let rows = contracts
    if (statusFilter !== 'all') rows = rows.filter(c => c.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(c =>
        c.vendor_name?.toLowerCase().includes(q) ||
        c.machine_type?.toLowerCase().includes(q) ||
        c.registration_number?.toLowerCase().includes(q) ||
        c.current_project_name?.toLowerCase().includes(q)
      )
    }
    return rows
  }, [contracts, statusFilter, search])

  const rateLabel = (c) => {
    if (!c.hire_rate) return null
    const unit = c.rate_type === 'hourly' ? '/hr' : c.rate_type === 'daily' ? '/day' : '/mo'
    return `₹${Number(c.hire_rate).toLocaleString('en-IN')}${unit}`
  }

  const ST = {
    active:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    returned:  'bg-slate-500/15 text-slate-400 border-slate-600/30',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
  }

  // Opened from card — shows return condition modal
  const openReturn = (contract) => setReturnModal(contract)

  return (
    <div className="p-4 space-y-3 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Vendor, machine type, registration…"
            className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>}
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-dark-800 border border-dark-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500">
          <option value="active">Active</option>
          <option value="returned">Returned</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
        {isAdmin && (
          <button onClick={() => setModal({})}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white px-3 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0">
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </div>

      {/* Stats bar */}
      {contracts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {['active','returned','cancelled'].map(s => {
            const cnt = contracts.filter(c => c.status === s).length
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`bg-dark-800 border rounded-xl p-2.5 text-center transition-colors ${statusFilter === s ? 'border-primary-500' : 'border-dark-700'}`}>
                <div className="text-lg font-bold text-slate-100">{cnt}</div>
                <div className="text-[10px] text-slate-500 capitalize">{s}</div>
              </button>
            )
          })}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-24 bg-dark-800 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <PackageOpen className="w-10 h-10 text-slate-600 mb-2" />
          <p className="text-slate-400 text-sm">No hired-in machines</p>
          {isAdmin && <button onClick={() => setModal({})} className="mt-3 text-sm text-primary-400 hover:text-primary-300">+ Add first contract</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const rl = rateLabel(c)
            return (
              <div key={c.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-100">{c.machine_type}</span>
                      {c.make && <span className="text-xs text-slate-400">{c.make}{c.model ? ` ${c.model}` : ''}</span>}
                      {c.registration_number && (
                        <span className="text-xs font-mono text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded">{c.registration_number}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${ST[c.status] || ST.returned}`}>{c.status}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{c.vendor_name}{c.vendor_contact ? ` · ${c.vendor_contact}` : ''}</p>
                    {c.current_project_name && (
                      <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />{c.current_project_name}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {rl && <p className="text-xs font-semibold text-emerald-400">{rl}</p>}
                    {c.contract_ref && <p className="text-xs text-slate-500 font-mono mt-0.5">{c.contract_ref}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  {c.mob_date && <span>↓ Mob: {format(new Date(c.mob_date), 'd MMM yyyy')}</span>}
                  {c.expected_demob_date && <span>↑ Exp Demob: {format(new Date(c.expected_demob_date), 'd MMM yyyy')}</span>}
                  {c.capacity_description && <span>· {c.capacity_description}</span>}
                  {c.max_hours_per_day && <span>· Max {c.max_hours_per_day}hr/day</span>}
                  {c.operator_provided_by === 'vendor' && <span>· Op by vendor{c.operator_name ? `: ${c.operator_name}` : ''}</span>}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setModal(c)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                    {c.status === 'active' && (
                      <button onClick={() => openReturn(c)}
                        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors ml-2">
                        <ArrowLeftRight className="w-3 h-3" /> Mark Returned
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal !== null && (
        <HiredInModal
          companyId={companyId}
          contract={modal?.id ? modal : null}
          projects={projects}
          onClose={() => setModal(null)}
          onSaved={() => {}}
        />
      )}
      {returnModal && (
        <HiredInReturnModal
          contract={returnModal}
          companyId={companyId}
          onClose={() => setReturnModal(null)}
        />
      )}
    </div>
  )
}

// ── Hired-In Return Condition Modal ────────────────────────────────────────────
function HiredInReturnModal({ contract, companyId, onClose }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    actual_demob_date:  new Date().toISOString().slice(0, 10),
    return_meter_reading: '',
    return_condition:   'Good',
    return_notes:       '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const CONDITIONS = [
    { value: 'Good',    label: 'Good',    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    { value: 'Fair',    label: 'Fair',    color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    { value: 'Damaged', label: 'Damaged', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  ]

  const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500'

  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.from('inward_hire_contracts')
        .update({
          status:               'returned',
          actual_demob_date:    form.actual_demob_date || new Date().toISOString().slice(0, 10),
          return_meter_reading: form.return_meter_reading ? Number(form.return_meter_reading) : null,
          return_condition:     form.return_condition,
          return_notes:         form.return_notes || null,
        })
        .eq('id', contract.id)
      qc.invalidateQueries(['inward_hire', companyId])
      toast.success('Machine marked as returned')
      onClose()
    } catch (err) { toast.error(err.message || 'Failed to update')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-dark-700">
          <h3 className="text-base font-semibold text-slate-100">Return Machine</h3>
          <p className="text-xs text-slate-500 mt-0.5">{contract.machine_type} · {contract.vendor_name}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Return Date</label>
              <input className={inp} type="date" value={form.actual_demob_date} onChange={e => set('actual_demob_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Meter at Return {contract.registration_number ? `· ${contract.registration_number}` : ''}
              </label>
              <input className={inp} type="number" value={form.return_meter_reading} onChange={e => set('return_meter_reading', e.target.value)} placeholder="hrs / km" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Return Condition</label>
            <div className="flex gap-2">
              {CONDITIONS.map(c => (
                <button key={c.value} onClick={() => set('return_condition', c.value)}
                  className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-all ${form.return_condition === c.value ? c.color : 'border-dark-600 text-slate-500 bg-dark-800'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Remarks / Damage Notes</label>
            <textarea className={inp + ' resize-none'} rows={3}
              value={form.return_notes} onChange={e => set('return_notes', e.target.value)}
              placeholder="Note any defects, missing parts, or pending payments…" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-dark-700 flex gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-dark-600 text-slate-400 text-sm hover:text-slate-200 transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Confirm Return'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ companyId }) {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const { company }                     = useAuth()

  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['all_deployments_hist', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_deployments')
        .select(`
          id, deployed_date, withdrawn_date, status, billing_basis,
          rate_per_hour, rate_per_day, rate_per_month,
          equipment_id, project_id, client_id,
          operator_name, hour_meter_at_deployment, work_order_ref,
          tc_pdf_url, tc_from_project, tc_to_project, tc_generated_at,
          equipment:equipment_id (id, name, equipment_number, category, registration_number, meter_type)
        `)
        .eq('company_id', companyId)
        .order('deployed_date', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const projectIds = useMemo(() => [...new Set(deployments.map(d => d.project_id).filter(Boolean))], [deployments])
  const { data: projects = [] } = useQuery({
    queryKey: ['hist_projects', projectIds.join(',')],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, project_name, project_code').in('id', projectIds)
      return data || []
    },
    enabled: projectIds.length > 0,
  })
  const projMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])

  const clientIds = useMemo(() => [...new Set(deployments.map(d => d.client_id).filter(Boolean))], [deployments])
  const { data: histClients = [] } = useQuery({
    queryKey: ['hist_clients', clientIds.join(',')],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, display_name, business_name').in('id', clientIds)
      return data || []
    },
    enabled: clientIds.length > 0,
  })
  const clientMap = useMemo(() => Object.fromEntries(histClients.map(c => [c.id, c])), [histClients])

  const filtered = useMemo(() => {
    let rows = deployments
    if (statusFilter !== 'all') rows = rows.filter(d => d.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(d =>
        d.equipment?.name?.toLowerCase().includes(q) ||
        d.equipment?.equipment_number?.toLowerCase().includes(q) ||
        projMap[d.project_id]?.project_name?.toLowerCase().includes(q) ||
        d.operator_name?.toLowerCase().includes(q) ||
        d.work_order_ref?.toLowerCase().includes(q)
      )
    }
    return rows
  }, [deployments, search, statusFilter, projMap])

  const daysOnSite = (dep, wit) => {
    if (!dep) return null
    return differenceInDays(wit ? new Date(wit) : new Date(), new Date(dep))
  }

  const rateLabel = (d) => {
    if (d.billing_basis === 'hourly'  && d.rate_per_hour)  return `₹${Number(d.rate_per_hour).toLocaleString('en-IN')}/hr`
    if (d.billing_basis === 'daily'   && d.rate_per_day)   return `₹${Number(d.rate_per_day).toLocaleString('en-IN')}/day`
    if (d.billing_basis === 'monthly' && d.rate_per_month) return `₹${Number(d.rate_per_month).toLocaleString('en-IN')}/mo`
    return null
  }

  const ST = {
    active:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    withdrawn: 'bg-slate-500/15 text-slate-400 border-slate-600/30',
    completed: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  }

  return (
    <div className="p-4 space-y-3 overflow-y-auto h-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Equipment, project, operator, work order…"
            className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>}
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-dark-800 border border-dark-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-dark-800 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <History className="w-10 h-10 text-slate-600 mb-2" />
          <p className="text-slate-400 text-sm">No deployment history found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(dep => {
            const proj   = projMap[dep.project_id]
            const client = clientMap[dep.client_id]
            const d      = daysOnSite(dep.deployed_date, dep.withdrawn_date)
            const rl     = rateLabel(dep)
            return (
              <div key={dep.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-100 truncate">{dep.equipment?.name || '—'}</span>
                      {dep.equipment?.equipment_number && (
                        <span className="text-xs font-mono text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded">{dep.equipment.equipment_number}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${ST[dep.status] || ST.withdrawn}`}>{dep.status}</span>
                    </div>
                    {proj && (
                      <p className="text-xs text-slate-300 mt-0.5">
                        {proj.project_name}{proj.project_code ? <span className="text-slate-500 ml-1">{proj.project_code}</span> : ''}
                      </p>
                    )}
                    {client && <p className="text-xs text-slate-500">{client.display_name || client.business_name}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {rl && <p className="text-xs text-emerald-400 font-medium">{rl}</p>}
                    {d !== null && <p className="text-xs text-slate-400">{d}d</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-slate-500">
                  <span>↓ {dep.deployed_date ? format(new Date(dep.deployed_date), 'd MMM yyyy') : '—'}</span>
                  {dep.withdrawn_date && <span>↑ {format(new Date(dep.withdrawn_date), 'd MMM yyyy')}</span>}
                  {dep.operator_name && <span>· Op: {dep.operator_name}</span>}
                  {dep.hour_meter_at_deployment != null && <span>· {dep.hour_meter_at_deployment} hrs</span>}
                  {dep.work_order_ref && <span>· {dep.work_order_ref}</span>}
                </div>
                {/* TC transfer info + download */}
                {dep.tc_from_project && dep.tc_to_project && (
                  <div className="mt-2 flex items-center justify-between gap-2 bg-dark-700/60 rounded-lg px-2.5 py-1.5">
                    <span className="text-xs text-slate-400 truncate">
                      <span className="text-slate-500">TC:</span> {dep.tc_from_project}
                      <span className="text-slate-600 mx-1">→</span>
                      {dep.tc_to_project}
                    </span>
                    <button
                      onClick={() => downloadTransferCertificate(company, {
                        tcNumber:      `TC-${dep.withdrawn_date?.slice(0,4)}-${dep.id.slice(-4).toUpperCase()}`,
                        tcDate:        dep.tc_generated_at
                                         ? dep.tc_generated_at.slice(0, 10)
                                         : dep.withdrawn_date || dep.deployed_date,
                        equipmentName: dep.equipment?.name || '',
                        equipmentType: dep.equipment?.category || '',
                        registrationNo: dep.equipment?.registration_number || '',
                        meterReading:  dep.hour_meter_at_deployment || '',
                        meterUnit:     dep.equipment?.meter_type === 'km' ? 'km' : 'hrs',
                        fromProject:   dep.tc_from_project,
                        toProject:     dep.tc_to_project,
                        fuelLevel:     '',
                        condition:     'Good',
                        conditionNotes: '',
                        authorizedBy:  company?.name || '',
                      })}
                      className="flex-shrink-0 flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                      title="Download Transfer Certificate"
                    >
                      <Download className="w-3 h-3" />
                      TC
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Ledger Tab ────────────────────────────────────────────────────────────────
function LedgerTab({ companyId }) {
  const [selectedEquipId, setSelectedEquipId] = useState('')
  const [selectedMonth,   setSelectedMonth]   = useState(format(new Date(), 'yyyy-MM'))

  const { data: allEquip = [] } = useQuery({
    queryKey: ['equip_list_ledger', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id, name, equipment_number, category')
        .eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: deployment } = useQuery({
    queryKey: ['active_dep_ledger', selectedEquipId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_deployments')
        .select('billing_basis, rate_per_hour, rate_per_day, rate_per_month, project_id, client_id')
        .eq('equipment_id', selectedEquipId).eq('status', 'active').maybeSingle()
      return data
    },
    enabled: !!selectedEquipId,
  })

  const periodStart = selectedMonth ? `${selectedMonth}-01` : null
  const periodEnd   = useMemo(() => {
    if (!selectedMonth) return null
    const [y, m] = selectedMonth.split('-').map(Number)
    const last   = new Date(y, m, 0).getDate()
    return `${selectedMonth}-${String(last).padStart(2, '0')}`
  }, [selectedMonth])

  const { data: ops = [], isLoading: opsLoading } = useQuery({
    queryKey: ['daily_ops_ledger', selectedEquipId, selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from('daily_operations')
        .select('id, ops_date, shift_type, status, running_hours, kilometer_run, trip_count, fuel_consumed, operator_name, activity')
        .eq('company_id', companyId)
        .eq('equipment_id', selectedEquipId)
        .gte('ops_date', periodStart)
        .lte('ops_date', periodEnd)
        .order('ops_date')
      return data || []
    },
    enabled: !!selectedEquipId && !!selectedMonth,
  })

  const totalHours  = useMemo(() => ops.reduce((s, o) => s + (Number(o.running_hours) || 0), 0), [ops])
  const workingDays = useMemo(() => new Set(ops.filter(o => o.status === 'working').map(o => o.ops_date)).size, [ops])
  const totalFuel   = useMemo(() => ops.reduce((s, o) => s + (Number(o.fuel_consumed) || 0), 0), [ops])

  const billable = useMemo(() => {
    if (!deployment) return 0
    if (deployment.billing_basis === 'hourly'  && deployment.rate_per_hour)  return totalHours * Number(deployment.rate_per_hour)
    if (deployment.billing_basis === 'daily'   && deployment.rate_per_day)   return workingDays * Number(deployment.rate_per_day)
    if (deployment.billing_basis === 'monthly' && deployment.rate_per_month) return Number(deployment.rate_per_month)
    return 0
  }, [deployment, totalHours, workingDays])

  const STATUS_CLR = { working: 'text-emerald-400', idle: 'text-amber-400', breakdown: 'text-red-400', maintenance: 'text-orange-400' }

  return (
    <div className="p-4 space-y-3 overflow-y-auto h-full">
      <div className="flex gap-2">
        <select value={selectedEquipId} onChange={e => setSelectedEquipId(e.target.value)}
          className="flex-1 bg-dark-800 border border-dark-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500">
          <option value="">Select equipment…</option>
          {allEquip.map(e => <option key={e.id} value={e.id}>{e.name}{e.equipment_number ? ` · ${e.equipment_number}` : ''}</option>)}
        </select>
        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          className="bg-dark-800 border border-dark-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500" />
      </div>

      {selectedEquipId && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Hours', value: totalHours.toFixed(1), cls: 'text-primary-400' },
              { label: 'Working Days', value: workingDays, cls: 'text-emerald-400' },
              { label: 'Fuel (L)', value: totalFuel.toFixed(0), cls: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
                <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Billing estimate */}
          {deployment && billable > 0 && (
            <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-400">Estimated Billable</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {deployment.billing_basis === 'hourly'  && `${totalHours.toFixed(1)} hrs × ₹${Number(deployment.rate_per_hour).toLocaleString('en-IN')}/hr`}
                  {deployment.billing_basis === 'daily'   && `${workingDays} days × ₹${Number(deployment.rate_per_day).toLocaleString('en-IN')}/day`}
                  {deployment.billing_basis === 'monthly' && 'Monthly flat rate'}
                </p>
              </div>
              <p className="text-lg font-bold text-emerald-300">₹{Math.round(billable).toLocaleString('en-IN')}</p>
            </div>
          )}

          {/* Daily log */}
          {opsLoading ? (
            <div className="space-y-1.5">{[1,2,3].map(i => <div key={i} className="h-9 bg-dark-800 rounded animate-pulse" />)}</div>
          ) : ops.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Gauge className="w-10 h-10 text-slate-600 mb-2" />
              <p className="text-slate-400 text-sm">No operations logged for this period</p>
              <p className="text-slate-500 text-xs mt-1">Log daily ops in Site Operations to populate this ledger</p>
            </div>
          ) : (
            <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[72px_50px_60px_55px_1fr] px-3 py-2 border-b border-dark-700 bg-dark-750 text-[10px] text-slate-500 uppercase tracking-wider gap-1">
                <span>Date</span><span>Shift</span><span className="text-right">Hrs</span><span className="text-right">Fuel L</span><span className="pl-2">Operator / Activity</span>
              </div>
              <div className="divide-y divide-dark-700/60">
                {ops.map(op => (
                  <div key={op.id} className="grid grid-cols-[72px_50px_60px_55px_1fr] px-3 py-2 gap-1 items-center">
                    <span className="text-xs text-slate-300">{format(new Date(op.ops_date), 'd MMM')}</span>
                    <span className="text-xs text-slate-500 capitalize">{op.shift_type}</span>
                    <span className={`text-xs text-right font-mono font-semibold ${STATUS_CLR[op.status] || 'text-slate-400'}`}>
                      {op.running_hours != null ? Number(op.running_hours).toFixed(1) : '—'}
                    </span>
                    <span className="text-xs text-right text-slate-500 font-mono">
                      {op.fuel_consumed != null ? Number(op.fuel_consumed).toFixed(0) : '—'}
                    </span>
                    <div className="pl-2 min-w-0">
                      {op.operator_name && <p className="text-xs text-slate-300 truncate">{op.operator_name}</p>}
                      {op.activity && <p className="text-[10px] text-slate-500 truncate">{op.activity}</p>}
                      {!op.operator_name && !op.activity && <p className="text-xs text-slate-600 capitalize">{op.status}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {/* Totals */}
              <div className="grid grid-cols-[72px_50px_60px_55px_1fr] px-3 py-2.5 border-t border-dark-600 bg-dark-750 gap-1">
                <span className="text-xs font-semibold text-slate-300">Total</span>
                <span />
                <span className="text-xs text-right font-bold text-primary-400 font-mono">{totalHours.toFixed(1)}</span>
                <span className="text-xs text-right font-bold text-amber-400 font-mono">{totalFuel.toFixed(0)}</span>
                <span />
              </div>
            </div>
          )}
        </>
      )}

      {!selectedEquipId && (
        <div className="flex flex-col items-center py-16 text-center">
          <BookOpen className="w-10 h-10 text-slate-600 mb-2" />
          <p className="text-slate-400 text-sm">Select an equipment to view its daily ledger</p>
        </div>
      )}
    </div>
  )
}

// ── Main FleetPage ────────────────────────────────────────────────────────────
export default function FleetPage({ onNavigate }) {
  const { companyId } = useAuth()
  const [activeTab,  setActiveTab]  = useState('fleet')
  const [showAdd,    setShowAdd]    = useState(false)

  const tabs = [
    { id: 'fleet',     label: 'Fleet',     icon: Truck },
    { id: 'fuel',      label: 'Fuel',      icon: Fuel },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
    { id: 'history',   label: 'History',   icon: History },
    { id: 'ledger',    label: 'Ledger',    icon: BookOpen },
    { id: 'hired_in',  label: 'Hired In',  icon: PackageOpen },
  ]

  return (
    <div className="relative flex flex-col h-full bg-dark-900">
      <div className="px-4 pt-4 pb-2 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Equipments &amp; Machineries</h1>
          <p className="text-xs text-slate-400">Registry · Documents · Service · Deployment</p>
        </div>
        {activeTab === 'fleet' && (
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2">
            <Plus className="w-4 h-4" /> Add Equipment
          </button>
        )}
      </div>
      <div className="flex border-b border-dark-700 shrink-0 px-2">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors
                ${activeTab === t.id ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          )
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'fleet'     && <FleetTab     companyId={companyId} showAdd={showAdd} setShowAdd={setShowAdd} onNavigate={onNavigate} />}
        {activeTab === 'fuel'      && <FuelTab      companyId={companyId} />}
        {activeTab === 'incidents' && <IncidentsTab companyId={companyId} />}
        {activeTab === 'history'   && <HistoryTab   companyId={companyId} />}
        {activeTab === 'ledger'    && <LedgerTab    companyId={companyId} />}
        {activeTab === 'hired_in'  && <HiredInTab   companyId={companyId} />}
      </div>
    </div>
  )
}
