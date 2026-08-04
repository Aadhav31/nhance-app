import { useState, useEffect, useRef, useMemo } from 'react'
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
  Search, History, BookOpen
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

  const setShiftRow = (i, key, val) =>
    setShiftRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ['equipment_assignments', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_assignments')
        .select('*').eq('equipment_id', equipment.id).eq('is_active', true).order('operator_name')
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
    queryKey: ['projects_for_client', deployClientId],
    queryFn: async () => {
      const { data } = await supabase.from('projects')
        .select('id, project_name, project_code').eq('company_id', companyId).eq('client_id', deployClientId).order('project_name')
      return data || []
    },
    enabled: isAdmin && !!deployClientId,
  })

  // Rate card items for the selected deploy project
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
        .select('rate_item_id').eq('equipment_id', equipmentProp.id).eq('status', 'active').maybeSingle()
      return data
    },
    enabled: isAdmin,
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

  const { data: recentFuel = [] } = useQuery({
    queryKey: ['fuel', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shift_fuel_entries').select('*')
        .eq('equipment_id', equipment.id).order('created_at', { ascending: false }).limit(5)
      return data || []
    },
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
  const handleDeploy = async () => {
    if (!deployProjectId) { toast.error('Select a project to deploy'); return }
    setDeploySaving(true)
    try {
      // 1. Resolve the selected rate item (if any)
      const selectedRate = rateItems.find(r => r.id === deployRateItemId) || null
      const effectiveRate = selectedRate || (matchedRates.length === 1 ? matchedRates[0] : null)

      // 2. Update equipment current deployment fields
      const { error } = await supabase.from('equipment').update({
        current_client_id:  deployClientId  || null,
        current_project_id: deployProjectId || null,
        current_site_name:  deploySiteName  || null,
        fuel_by_client:     deployFuelByClient,
      }).eq('id', equipment.id)
      if (error) throw error

      // 3. Close any active deployment for this equipment
      await supabase.from('equipment_deployments')
        .update({ status: 'withdrawn', withdrawn_date: new Date().toISOString().slice(0, 10) })
        .eq('equipment_id', equipment.id).eq('status', 'active')

      // 4. Insert new deployment record with full rate details
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
        deployed_date:       new Date().toISOString().slice(0, 10),
        status:              'active',
        rental_rate:         legacyRate,
        rate_unit:           legacyUnit,
        // Rate card details
        rate_item_id:        effectiveRate?.id        || null,
        item_name:           effectiveRate?.item_name || null,
        billing_basis:       effectiveRate?.billing_basis    || null,
        rate_per_hour:       effectiveRate?.rate_per_hour    || null,
        rate_per_day:        effectiveRate?.rate_per_day     || null,
        rate_per_month:      effectiveRate?.rate_per_month   || null,
        max_hours_per_day:      effectiveRate?.max_hours_per_day      || 8,
        max_hours_per_month:    effectiveRate?.max_hours_per_month    || 200,
        working_days_per_month: effectiveRate?.working_days_per_month || 26,
        ot_percentage:          effectiveRate?.ot_percentage          || 125,
        fuel_by_client:      deployFuelByClient,
        // Deployment record
        hour_meter_at_deployment: deployHourMeter !== '' ? Number(deployHourMeter) : null,
        operator_name:        deployOperatorName   || null,
        site_incharge:        deploySiteIncharge   || null,
        work_order_ref:       deployWorkOrderRef   || null,
        machine_photo_url:    deployMachinePhotoUrl || null,
        hour_meter_photo_url: deployMeterPhotoUrl  || null,
        deployment_location:  deployGpsLoc?.address || null,
      })

      setEquipment(e => ({ ...e, current_client_id: deployClientId, current_project_id: deployProjectId, current_site_name: deploySiteName, fuel_by_client: deployFuelByClient }))
      qc.invalidateQueries(['equipment', companyId])
      qc.invalidateQueries(['project_detail', deployProjectId])
      toast.success('Equipment deployed — rate card saved')
    } catch (err) { toast.error(err.message || 'Failed to deploy')
    } finally { setDeploySaving(false) }
  }

  const handleAddOperator = async () => {
    if (!newOperator) { toast.error('Select an operator'); return }
    const selectedEmp = hrOperators.find(e => e.id === newOperator)
    if (!selectedEmp) return
    setOperatorSaving(true)
    try {
      // Upsert into equipment_assignments — store user_id so portal can look up by user
      const { error } = await supabase.from('equipment_assignments').upsert({
        company_id: companyId, equipment_id: equipment.id,
        operator_name: selectedEmp.name, shift_type: newShiftType, is_active: true,
        user_id: selectedEmp.user_id || null,
      }, { onConflict: 'equipment_id,operator_name' })
      if (error) throw error

      setNewOperator(''); setNewShiftType('day'); refetchAssignments()
      qc.invalidateQueries(['equipment_assignments', equipment.id])
      toast.success(`${selectedEmp.name} assigned — ${newShiftType} shift${selectedEmp.user_id ? ' · Portal linked ✓' : ' (no portal login)'}`)
    } catch (err) { toast.error(err.message || 'Failed to assign operator')
    } finally { setOperatorSaving(false) }
  }

  const handleRemoveOperator = async (assignmentId, name) => {
    await supabase.from('equipment_assignments').update({ is_active: false }).eq('id', assignmentId)
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
                      const shiftEmoji = { day: '☀️', night: '🌙', double: '🔄' }[a.shift_type] || '☀️'
                      return (
                        <div key={a.id} className="flex items-center gap-1.5 text-xs text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="truncate flex-1">{a.operator_name}</span>
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
            { id: 'shift_schedule', label: 'Shift Schedule' },
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

            {/* Admin: deploy form + operators */}
            {isAdmin && (
              <div className="border border-dark-600 rounded-xl overflow-hidden">
                <div className="bg-dark-700 px-4 py-2.5 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary-400" />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Operations Setup</span>
                </div>

                {/* Deploy form */}
                <div className="p-4 space-y-2.5 border-b border-dark-600">
                  <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Deploy to Client / Project
                  </p>
                  {equipment.current_site_name && (
                    <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300">
                      ✓ Currently: {equipment.current_site_name}
                    </div>
                  )}
                  <select className={inp('text-xs')} value={deployClientId}
                    onChange={e => { setDeployClientId(e.target.value); setDeployProjectId('') }}>
                    <option value="">Select client…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
                  </select>
                  {deployClientId && (
                    <select className={inp('text-xs')} value={deployProjectId} onChange={e => setDeployProjectId(e.target.value)}>
                      <option value="">Select project…</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ''}{p.project_name}</option>)}
                    </select>
                  )}
                  <input className={inp('text-xs')} value={deploySiteName} onChange={e => setDeploySiteName(e.target.value)}
                    placeholder="Site name (optional, e.g. Phase 2 — North Block)" />

                  {deployProjectId && rateItems.length > 0 && (
                    <div className="bg-dark-750 border border-dark-500 rounded-lg p-2.5 space-y-2">
                      <p className="text-xs text-slate-400 font-medium">Select applicable rate item:</p>
                      <select
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-primary-500"
                        value={deployRateItemId}
                        onChange={e => setDeployRateItemId(e.target.value)}>
                        <option value="">— None / Enter manually later —</option>
                        {(matchedRates.length > 0 ? matchedRates : rateItems).map(r => (
                          <option key={r.id} value={r.id}>
                            {r.item_name}
                            {r.billing_basis === 'monthly' ? ` — ₹${r.rate_per_month}/mo` : r.billing_basis === 'hourly' ? ` — ₹${r.rate_per_hour}/hr` : ` — ₹${r.rate_per_day}/day`}
                            {matchedRates.includes(r) ? ' ✓' : ''}
                          </option>
                        ))}
                      </select>
                      {deployRateItemId && (() => {
                        const r = rateItems.find(x => x.id === deployRateItemId)
                        if (!r) return null
                        return (
                          <div className="text-[10px] text-slate-400 space-y-0.5">
                            <p>Billing: <span className="text-slate-200 capitalize">{r.billing_basis}</span>
                              {r.billing_basis === 'daily'   && r.max_hours_per_day   && ` · Max ${r.max_hours_per_day} hrs/day`}
                              {r.billing_basis === 'monthly' && r.max_hours_per_month && ` · Max ${r.max_hours_per_month} hrs/mo`}
                            </p>
                            {r.ot_percentage && <p>OT: <span className="text-primary-300">{r.ot_percentage}% of pro-rata rate</span></p>}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {deployProjectId && (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <div className={`w-8 h-4 rounded-full transition-colors relative ${deployFuelByClient ? 'bg-primary-500' : 'bg-dark-600'}`}
                        onClick={() => setDeployFuelByClient(v => !v)}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${deployFuelByClient ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-xs text-slate-300">Fuel supplied by client</span>
                      {deployFuelByClient && (
                        <span className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded px-1.5 py-0.5">
                          Fuel costs excluded from our P&amp;L
                        </span>
                      )}
                    </label>
                  )}

                  {deployProjectId && (
                    <div className="bg-dark-750 border border-dark-500 rounded-lg p-3 space-y-2.5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Deployment Record</p>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Hour Meter at Deployment</label>
                        <input type="number" min="0" step="0.1" className={inp('text-xs mt-1')}
                          value={deployHourMeter} onChange={e => setDeployHourMeter(e.target.value)}
                          placeholder={`Current: ${equipment.current_meter_reading || 0} hrs`} />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Operator at Deployment</label>
                        <select className={inp('text-xs mt-1')} value={deployOperatorName} onChange={e => setDeployOperatorName(e.target.value)}>
                          <option value="">Select operator…</option>
                          {hrOperators.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Site In-charge</label>
                        <input className={inp('text-xs mt-1')} value={deploySiteIncharge}
                          onChange={e => setDeploySiteIncharge(e.target.value)}
                          placeholder="Name of person responsible at site" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Work Order / PO / Contract Ref</label>
                        <input className={inp('text-xs mt-1')} value={deployWorkOrderRef}
                          onChange={e => setDeployWorkOrderRef(e.target.value)}
                          placeholder="e.g. WO-2026-042 or HC-001" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Machine Photo</label>
                        <CameraButton companyId={companyId} label={`deploy_machine_${equipment.id}`}
                          photoUrl={deployMachinePhotoUrl} onCapture={setDeployMachinePhotoUrl} location={deployGpsLoc} />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                          Hour Meter Photo <span className="normal-case text-slate-600">(optional)</span>
                        </label>
                        <CameraButton companyId={companyId} label={`deploy_meter_${equipment.id}`}
                          photoUrl={deployMeterPhotoUrl} onCapture={setDeployMeterPhotoUrl} location={deployGpsLoc} />
                      </div>
                      <GPSField location={deployGpsLoc} loading={deployGpsLoading} />
                    </div>
                  )}

                  <button onClick={handleDeploy} disabled={deploySaving || !deployProjectId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium disabled:opacity-40 transition-colors">
                    {deploySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {deploySaving ? 'Saving…' : 'Save Deployment'}
                  </button>
                </div>

                {/* Operators */}
                <div className="p-4 space-y-2">
                  <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Assigned Operators
                    <span className="text-slate-600 font-normal ml-1">· from HR module</span>
                  </p>
                  <p className="text-[10px] text-slate-600">📱 = has portal login</p>
                  {assignments.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No operators assigned yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {assignments.map(a => {
                        const hr = hrOperators.find(e => e.name === a.operator_name)
                        const shiftLabel = { day: '☀️ Day', night: '🌙 Night', double: '🔄 Double' }[a.shift_type] || '☀️ Day'
                        return (
                          <div key={a.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 bg-dark-700">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-slate-200">{a.operator_name}</span>
                              {hr && <span className="text-[10px] text-slate-500 ml-2">{hr.employee_number}</span>}
                              {(hr?.user_id || a.user_id) && <span className="text-[10px] text-slate-400 ml-1">📱</span>}
                              <span className="text-[10px] text-slate-500 ml-2">{shiftLabel}</span>
                            </div>
                            <button onClick={() => handleRemoveOperator(a.id, a.operator_name)}
                              className="p-1 text-slate-500 hover:text-red-400 transition-colors shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {(() => {
                    const assignedNames = new Set(assignments.map(a => a.operator_name))
                    const available = hrOperators.filter(e => !assignedNames.has(e.name))
                    if (hrOperators.length === 0) return (
                      <p className="text-xs text-amber-400/80 bg-amber-900/20 border border-amber-700/30 rounded-lg px-2.5 py-2">
                        No operators in HR module. Add employees with Operator/Driver designation first.
                      </p>
                    )
                    return (
                      <div className="space-y-1.5">
                        <select
                          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
                          value={newOperator}
                          onChange={e => setNewOperator(e.target.value)}>
                          <option value="">Select operator from HR…</option>
                          {available.map(e => (
                            <option key={e.id} value={e.id}>{e.name} — {e.designation}{e.user_id ? ' 📱' : ''}</option>
                          ))}
                        </select>
                        {newOperator && !hrOperators.find(e => e.id === newOperator)?.user_id && (
                          <p className="text-[10px] text-amber-400">⚠️ No portal login — operator won't appear in Operator Portal until account created in HR → Employee Logins</p>
                        )}
                        <div className="flex gap-2">
                          <select
                            className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
                            value={newShiftType}
                            onChange={e => setNewShiftType(e.target.value)}>
                            <option value="day">☀️ Day Shift</option>
                            <option value="night">🌙 Night Shift</option>
                            <option value="double">🔄 Double Shift</option>
                          </select>
                          <button onClick={handleAddOperator} disabled={operatorSaving || !newOperator}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-dark-600 border border-dark-500 hover:border-primary-500 text-xs text-slate-300 disabled:opacity-40 transition-colors shrink-0">
                            {operatorSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Assign
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MAINTENANCE TAB ── */}
        {detailTab === 'maintenance' && (
          <div className="space-y-4 pt-1">

            {/* ── Maintenance Records ── */}
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
                  <p className="text-xs text-slate-600 mt-1">Records added from the Maintenance page will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-dark-600">
                  {maintRecords.map(rec => {
                    const MTYPE = {
                      preventive:  { label: 'Preventive Maintenance', dot: 'bg-blue-400',   text: 'text-blue-400'   },
                      breakdown:   { label: 'Breakdown Repair',        dot: 'bg-red-400',    text: 'text-red-400'    },
                      accidental:  { label: 'Accidental Damage',       dot: 'bg-red-400',    text: 'text-red-400'    },
                      overhaul:    { label: 'Overhaul',                dot: 'bg-orange-400', text: 'text-orange-400' },
                      inspection:  { label: 'Inspection',              dot: 'bg-teal-400',   text: 'text-teal-400'   },
                      other:       { label: 'Other',                   dot: 'bg-slate-400',  text: 'text-slate-400'  },
                    }
                    const mt = MTYPE[rec.maintenance_type] || MTYPE.other
                    const statusPill = rec.status === 'completed'
                      ? <span className="text-[10px] bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">Completed</span>
                      : rec.status === 'in_progress'
                      ? <span className="text-[10px] bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded-full font-medium">In Progress</span>
                      : <span className="text-[10px] bg-amber-500/15 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">Open</span>
                    return (
                      <div key={rec.id} className="px-4 py-3 space-y-2">
                        {/* Header row */}
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

                        {/* Description */}
                        <p className="text-xs text-slate-300 ml-4 leading-relaxed">{rec.description}</p>

                        {/* Technician */}
                        {rec.technician_name && (
                          <p className="text-xs text-slate-500 ml-4">
                            🔧 {rec.technician_name}
                            {rec.done_by === 'vendor' ? ' (Vendor)' : rec.done_by === 'inhouse' ? ' (In-house)' : ''}
                          </p>
                        )}

                        {/* Cost / downtime row */}
                        {(rec.labour_cost > 0 || rec.total_cost > 0 || rec.downtime_hours > 0) && (
                          <div className="ml-4 flex gap-4 text-xs">
                            {rec.labour_cost > 0 && (
                              <span className="text-slate-400">Labour <span className="text-slate-200 font-medium">₹{Number(rec.labour_cost).toLocaleString('en-IN')}</span></span>
                            )}
                            {rec.total_cost > 0 && (
                              <span className="text-slate-400">Total <span className="text-primary-400 font-semibold">₹{Number(rec.total_cost).toLocaleString('en-IN')}</span></span>
                            )}
                            {rec.downtime_hours > 0 && (
                              <span className="text-slate-400">Downtime <span className="text-orange-400 font-medium">{rec.downtime_hours}h</span></span>
                            )}
                          </div>
                        )}

                        {/* Project */}
                        {rec.projects?.project_name && (
                          <p className="text-[10px] text-slate-500 ml-4">📍 {rec.projects.project_name}</p>
                        )}

                        {/* Mark Complete — admin only, open/in-progress records */}
                        {isAdmin && rec.status !== 'completed' && (
                          <button
                            onClick={async () => {
                              const { error } = await supabase.from('maintenance_records')
                                .update({ status: 'completed', completed_date: new Date().toISOString().split('T')[0] })
                                .eq('id', rec.id)
                              if (!error) {
                                toast.success('Marked as completed')
                                refetchMaint()
                              } else toast.error(error.message)
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

            {(equipment.last_service_date || equipment.next_service_date || equipment.next_service_meter) ? (
              <div className="border border-dark-600 rounded-xl overflow-hidden">
                <div className="bg-dark-700 px-4 py-2.5 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Service Schedule</span>
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
                  {equipment.service_interval_hrs && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Service interval</span>
                      <span className="text-slate-300">Every {equipment.service_interval_hrs} hrs</span>
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
            ) : (
              <div className="bg-dark-700/50 rounded-xl border border-dashed border-dark-600 p-6 text-center">
                <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No service schedule set</p>
                <p className="text-xs text-slate-600 mt-1">Edit the equipment to add service interval and dates</p>
              </div>
            )}

            {equipment.ownership_type !== 'own' && (
              <div className="border border-dark-600 rounded-xl overflow-hidden">
                <div className="bg-dark-700 px-4 py-2.5 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Ownership Details</span>
                </div>
                <div className="p-4 space-y-1.5 text-xs">
                  {equipment.owner_name && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-200">{equipment.owner_name}</span>
                      {equipment.ownership_type === 'hired' && <span className="text-slate-500">(Owner/Vendor)</span>}
                    </div>
                  )}
                  {equipment.owner_contact && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-300">{equipment.owner_contact}</span>
                    </div>
                  )}
                  {equipment.ownership_type === 'hired' && (equipment.hire_start_date || equipment.hire_end_date) && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-300">
                        Hire: {equipment.hire_start_date ? format(new Date(equipment.hire_start_date), 'dd MMM yyyy') : '—'}
                        {' → '}{equipment.hire_end_date ? format(new Date(equipment.hire_end_date), 'dd MMM yyyy') : '—'}
                      </span>
                    </div>
                  )}
                </div>
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
                    onClick={() => { onClose(); onNavigate('operations') }}
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

        {/* ── SHIFT SCHEDULE TAB ── */}
        {detailTab === 'shift_schedule' && (
          <div className="space-y-4 pt-1">
            {isAdmin ? (
              <>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button key={n} type="button" onClick={() => setShiftCount(n)}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        shiftCount === n
                          ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                          : 'border-dark-600 bg-dark-700 text-slate-500 hover:text-slate-300'
                      }`}>
                      {n === 1 ? '☀️ Single' : n === 2 ? '☀️🌙 Double' : '☀️🌙🌒 Triple'}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {Array.from({ length: shiftCount }, (_, i) => i).map(i => (
                    <div key={i} className="bg-dark-700 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Shift {i + 1}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1">Name</p>
                          <input
                            className="w-full bg-dark-600 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
                            value={shiftRows[i].label}
                            onChange={e => setShiftRow(i, 'label', e.target.value)}
                            placeholder={['Day', 'Night', 'Mid'][i]} />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1">Start</p>
                          <input type="time"
                            className="w-full bg-dark-600 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
                            value={shiftRows[i].start}
                            onChange={e => setShiftRow(i, 'start', e.target.value)} />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1">End</p>
                          <input type="time"
                            className="w-full bg-dark-600 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
                            value={shiftRows[i].end}
                            onChange={e => setShiftRow(i, 'end', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-dark-700 rounded-xl px-4 py-3 space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={alertEnabled} onChange={e => setAlertEnabled(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary-500" />
                    <div>
                      <p className="text-xs font-medium text-slate-200">Alert on late start / overdue end</p>
                      <p className="text-[10px] text-slate-500">Notify when shift hasn't started or ended on time</p>
                    </div>
                  </label>
                  {alertEnabled && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 pl-6">
                      <span>Alert after</span>
                      <input type="number" min="5" max="120" step="5"
                        className="w-14 bg-dark-600 border border-dark-500 rounded-lg px-2 py-1 text-xs text-center text-slate-100 focus:outline-none focus:border-primary-500"
                        value={graceMinutes} onChange={e => setGraceMinutes(e.target.value)} />
                      <span>minutes past scheduled time</span>
                    </div>
                  )}
                </div>
                {shiftCount === 1 && (
                  <p className="text-[10px] text-slate-500 italic">Single shift — no fixed time enforced. Operators can start anytime.</p>
                )}
                <button onClick={handleSaveSchedule} disabled={scheduleSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium disabled:opacity-40 transition-colors">
                  {scheduleSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {scheduleSaving ? 'Saving…' : shiftSchedule ? 'Update Schedule' : 'Save Schedule'}
                </button>
              </>
            ) : (
              <div className="bg-dark-700/50 rounded-xl border border-dashed border-dark-600 p-8 text-center">
                <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Admin access required to edit shift schedule</p>
              </div>
            )}
          </div>
        )}

        {/* ── EQUIPMENT P&L TAB ── */}
        {detailTab === 'pl' && (
          <div className="pt-1 bg-dark-700/50 rounded-xl border border-dark-600 p-8 text-center">
            <Activity className="w-10 h-10 text-primary-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300 mb-1">Equipment P&amp;L</p>
            <p className="text-xs text-slate-500">
              Revenue vs. expenses tracking for {equipment.name} is available in the Fleet module's P&amp;L section.
            </p>
          </div>
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
function FleetTab({ companyId, showAdd, setShowAdd }) {
  const [selected,        setSelected]        = useState(null)
  const [search,          setSearch]          = useState('')
  const [filterStatus,    setFilterStatus]    = useState('all')
  const [filterOwnership, setFilterOwnership] = useState('all')
  const [viewMode,        setViewMode]        = useState('grid')    // 'grid' | 'site'
  const [alertDismissed,  setAlertDismissed]  = useState(false)

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
        ) : (
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
        )}
      </div>

      {showAdd  && <EquipmentFormModal companyId={companyId} onClose={() => setShowAdd(false)} />}
      {selected && <EquipmentDetail   equipment={selected}  companyId={companyId} onClose={() => setSelected(null)} onNavigate={onNavigate} />}
    </div>
  )
}

// ── Fuel Tab ──────────────────────────────────────────────────────────────────
function FuelTab({ companyId }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['all_fuel', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('shift_fuel_entries')
        .select('*, equipment(name, category, current_project_id)').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data || []
    },
  })

  const totalLitres = entries.reduce((s, e) => s + Number(e.quantity_liters || 0), 0)
  const totalAmount = entries.reduce((s, e) => s + Number(e.total_amount   || 0), 0)

  return (
    <div className="flex flex-col h-full">
      {entries.length > 0 && (
        <div className="flex gap-3 px-4 py-2 shrink-0">
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs">
            <p className="text-slate-400">Total Fuel</p>
            <p className="font-bold text-yellow-400">{totalLitres.toFixed(0)} L</p>
          </div>
          {totalAmount > 0 && (
            <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs">
              <p className="text-slate-400">Total Amount</p>
              <p className="font-bold text-primary-400">₹{totalAmount.toLocaleString('en-IN')}</p>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Fuel className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">No fuel entries yet</p>
            <p className="text-xs text-slate-500">Log fuel from an equipment's detail panel</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-100 text-sm">{e.equipment?.name}</p>
                    <p className="text-xs text-slate-400">{e.equipment?.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-yellow-400">{e.quantity_liters} L</p>
                    {e.total_amount && <p className="text-xs text-slate-400">₹{Number(e.total_amount).toLocaleString('en-IN')}</p>}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-slate-400">
                  {e.meter_at_filling  && <span>Meter: {e.meter_at_filling} hrs</span>}
                  {e.km_at_filling     && <span>KM: {e.km_at_filling}</span>}
                  {e.delivered_by_name && <span>By: {e.delivered_by_name}</span>}
                  {e.vendor_name       && <span>Vendor: {e.vendor_name}</span>}
                  {e.invoice_number    && <span>Invoice: #{e.invoice_number}</span>}
                  {e.rate_per_liter    && <span>Rate: ₹{e.rate_per_liter}/L</span>}
                </div>
                {e.location_address && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{e.location_address.slice(0, 60)}
                  </p>
                )}
                <p className="text-xs text-slate-600 mt-1">{format(new Date(e.created_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            ))}
          </div>
        )}
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

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ companyId }) {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

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
          equipment:equipment_id (id, name, equipment_number, category)
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
        {activeTab === 'fleet'     && <FleetTab     companyId={companyId} showAdd={showAdd} setShowAdd={setShowAdd} />}
        {activeTab === 'fuel'      && <FuelTab      companyId={companyId} />}
        {activeTab === 'incidents' && <IncidentsTab companyId={companyId} />}
        {activeTab === 'history'   && <HistoryTab   companyId={companyId} />}
        {activeTab === 'ledger'    && <LedgerTab    companyId={companyId} />}
      </div>
    </div>
  )
}
