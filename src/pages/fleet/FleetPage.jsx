import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  EQUIPMENT_CATEGORIES, getMeterType, STATUS_COLORS, INCIDENT_SEVERITY
} from '../../lib/equipmentTypes'
import {
  Truck, Plus, ChevronRight, Fuel, AlertTriangle, Clock,
  X, Loader2, CheckCircle, Activity, PlayCircle, StopCircle,
  Gauge, User, Mic, MicOff, MapPin, Camera, Building2, Users, Save, Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }
function nowTime() { return new Date().toTimeString().slice(0, 5) }

// ── Add timestamp + location overlay to image using Canvas ───────────────────
async function addTimestampToImage(file, locationText = null) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const now = new Date()
      const stamp = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
        '  ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

      const dateFontSize  = Math.max(16, Math.round(img.width / 26))
      const locFontSize   = Math.max(13, Math.round(img.width / 36))
      const pad = 14
      const barH = locationText
        ? dateFontSize + locFontSize + pad * 3
        : dateFontSize + pad * 2

      // Semi-transparent dark bar at bottom
      ctx.fillStyle = 'rgba(0,0,0,0.70)'
      ctx.fillRect(0, img.height - barH, img.width, barH)

      // Golden date+time
      ctx.font = `bold ${dateFontSize}px monospace`
      ctx.fillStyle = '#FFD700'
      ctx.fillText(stamp, pad, img.height - barH + pad + dateFontSize)

      // White location (truncated to fit)
      if (locationText) {
        ctx.font = `${locFontSize}px monospace`
        ctx.fillStyle = '#FFFFFF'
        let loc = '📍 ' + locationText
        while (ctx.measureText(loc).width > img.width - pad * 2 && loc.length > 15) {
          loc = loc.slice(0, -4) + '…'
        }
        ctx.fillText(loc, pad, img.height - pad)
      }

      canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob) }, 'image/jpeg', 0.88)
    }
    img.src = url
  })
}

// ── Upload photo to Supabase Storage ─────────────────────────────────────────
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
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const locationText = location?.address || null
      const blob = await addTimestampToImage(file, locationText)
      const url = await uploadPhoto(blob, companyId, label)
      onCapture(url)
      toast.success('Photo saved with timestamp')
    } catch (err) {
      toast.error('Failed to save photo — check Storage bucket')
    } finally { setUploading(false); e.target.value = '' }
  }

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all
          ${photoUrl
            ? 'border-emerald-600 bg-emerald-900/20 text-emerald-400'
            : 'border-dark-500 bg-dark-700 text-slate-400 hover:border-primary-500 hover:text-primary-400'}`}>
        {uploading
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
          : <><Camera className="w-3.5 h-3.5" /> {photoUrl ? '✓ Photo taken' : 'Take Photo'}</>}
      </button>
      {photoUrl && (
        <a href={photoUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs text-primary-400 underline">View</a>
      )}
    </div>
  )
}

// ── GPS Hook ──────────────────────────────────────────────────────────────────
function useGPS() {
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(false)

  const capture = () => {
    if (!navigator.geolocation) { toast.error('GPS not supported on this device'); return }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          setLocation({ lat: latitude, lng: longitude, address: data.display_name })
        } catch {
          setLocation({ lat: latitude, lng: longitude, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` })
        }
        setLoading(false)
      },
      () => { toast.error('Could not get location — check GPS permission'); setLoading(false) },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  useEffect(() => { capture() }, []) // auto-capture on mount

  return { location, loading, capture }
}

// ── Speech-to-Text Hook ───────────────────────────────────────────────────────
function useSpeechToText(onResult) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)

  const toggle = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { toast.error('Voice input not supported in this browser'); return }
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const rec = new SR()
    rec.lang = 'en-IN'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e) => onResult(e.results[0][0].transcript)
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
    recRef.current = rec
    setListening(true)
  }

  return { listening, toggle }
}

// ── Voice Textarea ────────────────────────────────────────────────────────────
function VoiceTextarea({ value, onChange, placeholder, rows = 2 }) {
  const { listening, toggle } = useSpeechToText((text) => onChange(value ? value + ' ' + text : text))
  return (
    <div className="relative">
      <textarea
        className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 pr-10 text-sm text-slate-100 focus:outline-none focus:border-primary-500 resize-none"
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
      />
      <button type="button" onClick={toggle}
        title={listening ? 'Stop recording' : 'Speak to type'}
        className={`absolute right-2 top-2 p-1.5 rounded-lg transition-all
          ${listening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-500 hover:text-slate-200 hover:bg-dark-600'}`}>
        {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ── GPS Field — shows status only, auto-captured on mount ────────────────────
function GPSField({ location, loading }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <MapPin className={`w-3.5 h-3.5 shrink-0 ${location ? 'text-emerald-400' : 'text-slate-500'}`} />
      {loading
        ? <span className="text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Getting location…</span>
        : location
          ? <span className="text-slate-400 truncate">{location.address}</span>
          : <span className="text-slate-500">Location unavailable — check GPS permission</span>
      }
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
      <div className="w-full sm:max-w-lg bg-dark-800 rounded-t-2xl sm:rounded-xl border border-dark-600 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
          <h2 className="font-semibold text-slate-100 text-base">{title}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
        {footer && <div className="flex gap-3 p-4 border-t border-dark-700">{footer}</div>}
      </div>
    </div>
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

// ── Add Equipment Modal ───────────────────────────────────────────────────────
function AddEquipmentModal({ companyId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    equipment_number: '', name: '', category: '', make: '', model: '',
    year_of_manufacture: '', registration_number: '', chassis_number: '',
    capacity: '', fuel_type: 'diesel', meter_type: 'hours',
    current_meter_reading: '0', status: 'active', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleCategoryChange = (cat) => {
    set('category', cat)
    set('meter_type', getMeterType(cat))
  }

  const handleSave = async () => {
    if (!form.name.trim())             { toast.error('Equipment name is required'); return }
    if (!form.category.trim())         { toast.error('Category is required'); return }
    if (!form.equipment_number.trim()) { toast.error('Equipment number is required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('equipment').insert({
        company_id: companyId,
        equipment_number: form.equipment_number,
        name: form.name,
        category: form.category,
        make: form.make || null,
        model: form.model || null,
        year_of_manufacture: form.year_of_manufacture ? Number(form.year_of_manufacture) : null,
        registration_number: form.registration_number || null,
        chassis_number: form.chassis_number || null,
        capacity: form.capacity || null,
        fuel_type: form.fuel_type,
        meter_type: form.meter_type,
        current_meter_reading: Number(form.current_meter_reading) || 0,
        status: form.status,
        notes: form.notes || null,
      })
      if (error) throw error
      toast.success('Equipment added')
      qc.invalidateQueries(['equipment', companyId])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to add equipment')
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Add Equipment" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Add Equipment'}
        </button>
      </>
    }>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Equipment No." required>
          <input className={inp()} value={form.equipment_number} onChange={e => set('equipment_number', e.target.value)} placeholder="EQ-001" />
        </Field>
        <Field label="Status">
          <select className={inp()} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>
      </div>
      <Field label="Equipment Name" required>
        <input className={inp()} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Tata Hitachi EX200 — Site A" />
      </Field>
      <Field label="Category" required>
        <select className={inp()} value={form.category} onChange={e => handleCategoryChange(e.target.value)}>
          <option value="">Select category…</option>
          {EQUIPMENT_CATEGORIES.map(c => (
            <option key={c.category} value={c.category}>{c.category}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make / Brand">
          <input className={inp()} value={form.make} onChange={e => set('make', e.target.value)} placeholder="Tata, JCB, Volvo…" />
        </Field>
        <Field label="Model">
          <input className={inp()} value={form.model} onChange={e => set('model', e.target.value)} placeholder="EX200, 3DX…" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Year">
          <input type="number" className={inp()} value={form.year_of_manufacture} onChange={e => set('year_of_manufacture', e.target.value)} placeholder="2022" />
        </Field>
        <Field label="Reg. / Serial No.">
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
          <input className={inp()} value={form.capacity} onChange={e => set('capacity', e.target.value)} placeholder="e.g. 20T, 1.2m³" />
        </Field>
      </div>
      <Field label="Notes">
        <VoiceTextarea value={form.notes} onChange={v => set('notes', v)} placeholder="Any additional details…" />
      </Field>
    </Modal>
  )
}

// ── Start Shift Modal ─────────────────────────────────────────────────────────
function StartShiftModal({ equipment, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading, capture } = useGPS()
  const [form, setForm] = useState({
    shift_date: today(), shift_type: 'day',
    operator_name: '', site_incharge_name: '',
    start_time: nowTime(),
    start_meter: String(equipment.current_meter_reading || ''),
    start_km: '', notes: '',
  })

  // Fetch assigned operators for this equipment
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['equipment_assignments', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_assignments')
        .select('*').eq('equipment_id', equipment.id).eq('is_active', true)
        .order('operator_name')
      return data || []
    },
  })
  const [previousClosing, setPreviousClosing] = useState(null)
  const [meterChanged, setMeterChanged] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [meterPhotoUrl, setMeterPhotoUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const mt = equipment.meter_type

  // Fetch last closed shift to pre-fill meter
  useEffect(() => {
    supabase.from('shifts').select('end_meter, end_km, operator_name, shift_date')
      .eq('equipment_id', equipment.id).eq('status', 'closed')
      .order('shift_date', { ascending: false }).order('end_time', { ascending: false })
      .limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.end_meter) {
          setPreviousClosing(data)
          setForm(p => ({ ...p, start_meter: String(data.end_meter) }))
        }
        if (data?.end_km) {
          setForm(p => ({ ...p, start_km: String(data.end_km) }))
        }
      })
  }, [equipment.id])

  const handleMeterChange = (v) => {
    set('start_meter', v)
    if (previousClosing && v !== String(previousClosing.end_meter)) {
      setMeterChanged(true)
    } else {
      setMeterChanged(false)
    }
  }

  const handleSave = async () => {
    if (!form.operator_name.trim()) { toast.error('Operator name is required'); return }
    if (mt !== 'kilometers' && !form.start_meter) { toast.error('Start meter reading required'); return }
    if (meterChanged && !overrideReason.trim()) { toast.error('Please provide reason for meter correction'); return }
    setSaving(true)
    try {
      const { data: shift, error } = await supabase.from('shifts').insert({
        company_id: companyId,
        equipment_id: equipment.id,
        shift_date: form.shift_date,
        shift_type: form.shift_type,
        operator_name: form.operator_name,
        site_incharge_name: form.site_incharge_name || null,
        start_time: form.start_time,
        start_meter: form.start_meter ? Number(form.start_meter) : null,
        start_km: form.start_km ? Number(form.start_km) : null,
        meter_previous_closing: previousClosing?.end_meter || null,
        meter_discrepancy: meterChanged,
        meter_discrepancy_reason: meterChanged ? overrideReason : null,
        meter_photo_url: meterPhotoUrl || null,
        location_lat: location?.lat || null,
        location_lng: location?.lng || null,
        location_address: location?.address || null,
        status: 'open',
        notes: form.notes || null,
      }).select().single()
      if (error) throw error

      // Notify admin if meter was corrected
      if (meterChanged) {
        await supabase.from('notifications').insert({
          company_id: companyId,
          type: 'meter_discrepancy',
          title: `Meter correction on ${equipment.name}`,
          body: `${form.operator_name} changed opening meter from ${previousClosing?.end_meter} to ${form.start_meter} hrs. Reason: ${overrideReason}`,
          metadata: { equipment_id: equipment.id, shift_id: shift?.id, equipment_name: equipment.name }
        })
      }

      await supabase.from('equipment').update({ status: 'active' }).eq('id', equipment.id)
      toast.success('Shift started')
      qc.invalidateQueries(['equipment', companyId])
      qc.invalidateQueries(['active_shift', equipment.id])
      qc.invalidateQueries(['shifts', equipment.id])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to start shift')
    } finally { setSaving(false) }
  }

  // ── Blocking checks ──────────────────────────────────────────────────────────
  const notLinked   = !equipment.current_project_id
  const noOperators = !assignmentsLoading && assignments.length === 0
  const isBlocked   = notLinked || noOperators

  return (
    <Modal title={`Start Shift — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving || isBlocked} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</> : '▶ Start Shift'}
        </button>
      </>
    }>

      {/* Block: not linked to a project */}
      {notLinked && (
        <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-300">Equipment not deployed to any project</p>
            <p className="text-xs text-orange-400/80 mt-1">Admin must assign this equipment to a Client &amp; Project before shifts can be started.</p>
          </div>
        </div>
      )}

      {/* Block: no operators assigned */}
      {!notLinked && noOperators && (
        <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4 flex gap-3 items-start">
          <Users className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-300">No operators assigned to this equipment</p>
            <p className="text-xs text-orange-400/80 mt-1">Admin must assign at least one operator before shifts can be started.</p>
          </div>
        </div>
      )}

      {!isBlocked && (
        <>
          {/* Show current deployment */}
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-primary-400 shrink-0" />
            <span className="truncate">
              {equipment.current_site_name
                ? `${equipment.current_site_name}`
                : 'Deployed project'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" className={inp()} value={form.shift_date} onChange={e => set('shift_date', e.target.value)} />
            </Field>
            <Field label="Shift Type">
              <select className={inp()} value={form.shift_type} onChange={e => set('shift_type', e.target.value)}>
                <option value="day">Day Shift</option>
                <option value="night">Night Shift</option>
                <option value="double">Double Shift</option>
              </select>
            </Field>
          </div>
          <Field label="Operator / Driver Name" required>
            {assignmentsLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading operators…
              </div>
            ) : (
              <select className={inp()} value={form.operator_name} onChange={e => set('operator_name', e.target.value)}>
                <option value="">Select assigned operator…</option>
                {assignments.map(a => (
                  <option key={a.id} value={a.operator_name}>{a.operator_name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Site Incharge Name">
            <input className={inp()} value={form.site_incharge_name} onChange={e => set('site_incharge_name', e.target.value)} placeholder="Supervisor / Incharge name" />
          </Field>
          <Field label="Shift Start Time">
            <input type="time" className={inp()} value={form.start_time} onChange={e => set('start_time', e.target.value)} />
          </Field>

          {(mt === 'hours' || mt === 'both') && (
            <div>
              <Field label="Start Hour Meter (hrs)" required>
                <input type="number" className={inp(meterChanged ? 'border-orange-500' : '')}
                  value={form.start_meter} onChange={e => handleMeterChange(e.target.value)}
                  placeholder="e.g. 4250.5" step="0.1" />
              </Field>
              {previousClosing && (
                <p className="text-xs text-slate-500 mt-1">
                  Pre-filled from last shift closing ({previousClosing.operator_name} · {previousClosing.shift_date})
                </p>
              )}
              <CameraButton companyId={companyId} label="meter_start" photoUrl={meterPhotoUrl} onCapture={setMeterPhotoUrl} location={location} />
              {meterChanged && (
                <div className="mt-2 bg-orange-900/20 border border-orange-700/30 rounded-lg p-3">
                  <p className="text-xs text-orange-400 font-medium mb-2">
                    ⚠ Meter changed from {previousClosing?.end_meter} — provide reason
                  </p>
                  <VoiceTextarea value={overrideReason} onChange={setOverrideReason}
                    placeholder="Why is the opening meter different from last closing?" rows={2} />
                </div>
              )}
            </div>
          )}

          {(mt === 'kilometers' || mt === 'both') && (
            <Field label="Start Odometer (km)" required={mt === 'kilometers'}>
              <input type="number" className={inp()} value={form.start_km} onChange={e => set('start_km', e.target.value)} placeholder="e.g. 125400" />
            </Field>
          )}

          <GPSField location={location} loading={gpsLoading} />

          <Field label="Notes">
            <VoiceTextarea value={form.notes} onChange={v => set('notes', v)} placeholder="Site location, work details…" />
          </Field>
        </>
      )}
    </Modal>
  )
}

// ── End Shift Modal ───────────────────────────────────────────────────────────
function EndShiftModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading } = useGPS()
  const [form, setForm] = useState({
    end_time: nowTime(), end_meter: '', end_km: '',
    working_hours: '', idle_hours: '0', breakdown_hours: '0', notes: '',
  })
  const [meterPhotoUrl, setMeterPhotoUrl] = useState(null)
  const [logsheetPhotoUrl, setLogsheetPhotoUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const mt = equipment.meter_type

  // Calculate actual clock hours between start and end time
  const getClockHours = (endTime = form.end_time) => {
    if (!shift.start_time || !endTime) return null
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60 // overnight
    return +(mins / 60).toFixed(2)
  }

  // Auto-calculate working hours when end meter changes
  const handleEndMeterChange = (v) => {
    set('end_meter', v)
    if (v && shift.start_meter) {
      const meterDiff = Math.max(0, Number(v) - Number(shift.start_meter))
      const clockHrs = getClockHours()
      // Cap to clock hours — meter diff can't exceed actual time worked
      set('working_hours', clockHrs ? String(Math.min(meterDiff, clockHrs).toFixed(1)) : String(meterDiff.toFixed(1)))
    }
  }

  const handleSave = async () => {
    if (mt !== 'kilometers' && !form.end_meter) { toast.error('End meter reading required'); return }

    // Validate meter vs clock time
    const clockHrs = getClockHours()
    const meterDiff = Number(form.end_meter || 0) - Number(shift.start_meter || 0)
    if (clockHrs && meterDiff > clockHrs + 0.5) {
      toast.error(`Hour meter difference (${meterDiff.toFixed(1)} hrs) exceeds shift clock time (${clockHrs.toFixed(1)} hrs) — check reading`)
      return
    }

    setSaving(true)
    try {
      const endMeter = Number(form.end_meter || 0)
      const startMeter = Number(shift.start_meter || 0)
      const hoursWorked = mt === 'hours' || mt === 'both'
        ? (form.working_hours ? Number(form.working_hours) : Math.max(0, endMeter - startMeter))
        : Number(form.working_hours || 0)

      const { error } = await supabase.from('shifts').update({
        end_time: form.end_time,
        end_meter: form.end_meter ? endMeter : null,
        end_km: form.end_km ? Number(form.end_km) : null,
        working_hours: hoursWorked,
        idle_hours: Number(form.idle_hours || 0),
        breakdown_hours: Number(form.breakdown_hours || 0),
        status: 'closed',
        notes: form.notes || shift.notes,
        meter_photo_url: meterPhotoUrl || null,
        logsheet_photo_url: logsheetPhotoUrl || null,
      }).eq('id', shift.id)
      if (error) throw error

      if (form.end_meter) {
        await supabase.from('equipment')
          .update({ current_meter_reading: endMeter, status: 'idle' })
          .eq('id', equipment.id)
      }
      toast.success('Shift ended')
      qc.invalidateQueries(['equipment', companyId])
      qc.invalidateQueries(['active_shift', equipment.id])
      qc.invalidateQueries(['shifts', equipment.id])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to end shift')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`End Shift — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-danger">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : '■ End Shift'}
        </button>
      </>
    }>
      <div className="bg-dark-700 rounded-lg p-3 text-sm">
        <p className="text-slate-400 text-xs mb-0.5">Operator</p>
        <p className="text-slate-100 font-medium">{shift.operator_name}</p>
        <p className="text-slate-400 text-xs">Started {shift.start_time} · Opening: {shift.start_meter} {mt === 'kilometers' ? 'km' : 'hrs'}</p>
      </div>
      <Field label="Shift End Time">
        <input type="time" className={inp()} value={form.end_time} onChange={e => set('end_time', e.target.value)} />
      </Field>
      {(mt === 'hours' || mt === 'both') && (
        <div>
          <Field label="Closing Hour Meter (hrs)" required>
            <input type="number" className={inp()} value={form.end_meter}
              onChange={e => handleEndMeterChange(e.target.value)}
              placeholder={`≥ ${shift.start_meter}`} step="0.1" />
          </Field>
          {form.end_meter && shift.start_meter && (
            <p className="text-xs text-slate-500 mt-1">
              Meter diff: {Math.max(0, Number(form.end_meter) - Number(shift.start_meter)).toFixed(1)} hrs
              {getClockHours() ? ` · Shift clock: ${getClockHours().toFixed(1)} hrs` : ''}
            </p>
          )}
          <CameraButton companyId={companyId} label="meter_end" photoUrl={meterPhotoUrl} onCapture={setMeterPhotoUrl} location={location} />
        </div>
      )}
      {(mt === 'kilometers' || mt === 'both') && (
        <Field label="Closing Odometer (km)" required={mt === 'kilometers'}>
          <input type="number" className={inp()} value={form.end_km} onChange={e => set('end_km', e.target.value)} />
        </Field>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Working Hrs">
          <input type="number" className={inp()} value={form.working_hours}
            onChange={e => set('working_hours', e.target.value)}
            placeholder="Auto-filled" step="0.1" />
        </Field>
        <Field label="Idle Hrs">
          <input type="number" className={inp()} value={form.idle_hours} onChange={e => set('idle_hours', e.target.value)} placeholder="0" step="0.1" />
        </Field>
        <Field label="Breakdown Hrs">
          <input type="number" className={inp()} value={form.breakdown_hours} onChange={e => set('breakdown_hours', e.target.value)} placeholder="0" step="0.1" />
        </Field>
      </div>
      <Field label="Notes">
        <VoiceTextarea value={form.notes} onChange={v => set('notes', v)} placeholder="Work done, issues, remarks…" />
      </Field>
      <div>
        <p className="text-xs font-medium text-slate-400 mb-1">Log Sheet Photo</p>
        <p className="text-xs text-slate-500 mb-2">Photograph the paper log / daily report before closing</p>
        <CameraButton companyId={companyId} label="logsheet" photoUrl={logsheetPhotoUrl} onCapture={setLogsheetPhotoUrl} location={location} />
      </div>
    </Modal>
  )
}

// ── Fuel Modal ────────────────────────────────────────────────────────────────
function FuelModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading, capture } = useGPS()
  const [form, setForm] = useState({
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
      const qty = Number(form.quantity_liters)
      const rate = form.rate_per_liter ? Number(form.rate_per_liter) : null
      const { error } = await supabase.from('shift_fuel_entries').insert({
        company_id: companyId,
        shift_id: shift?.id || null,
        equipment_id: equipment.id,
        quantity_liters: qty,
        rate_per_liter: rate,
        total_amount: rate ? qty * rate : null,
        meter_at_filling: form.meter_at_filling ? Number(form.meter_at_filling) : null,
        km_at_filling: form.km_at_filling ? Number(form.km_at_filling) : null,
        delivered_by_name: form.delivered_by_name || null,
        vendor_name: form.vendor_name || null,
        invoice_number: form.invoice_number || null,
        filling_location: location?.address || null,
        location_lat: location?.lat || null,
        location_lng: location?.lng || null,
        location_address: location?.address || null,
        fuel_photo_url: fuelPhotoUrl || null,
        notes: form.notes || null,
      })
      if (error) throw error
      toast.success(`${qty}L fuel logged`)
      qc.invalidateQueries(['fuel', equipment.id])
      qc.invalidateQueries(['all_fuel', companyId])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to log fuel')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Fuel Entry — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Log Fuel'}
        </button>
      </>
    }>
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
      <Field label="Filled / Delivered By">
        <input className={inp()} value={form.delivered_by_name} onChange={e => set('delivered_by_name', e.target.value)} placeholder="Person name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vendor Name">
          <input className={inp()} value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} placeholder="Fuel station / supplier" />
        </Field>
        <Field label="Invoice No.">
          <input className={inp()} value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="INV-001" />
        </Field>
      </div>
      <GPSField location={location} loading={gpsLoading} />
      <Field label="Notes">
        <VoiceTextarea value={form.notes} onChange={v => set('notes', v)} placeholder="Any remarks…" />
      </Field>
    </Modal>
  )
}

// ── Incident Modal — Dynamic per type ─────────────────────────────────────────
const INCIDENT_OPTIONS = [
  { value: 'breakdown',               label: 'Breakdown',               icon: '🔴', desc: 'Equipment stopped — cannot operate' },
  { value: 'unscheduled_maintenance', label: 'Unscheduled Maintenance',  icon: '🔧', desc: 'Unexpected repair needed' },
  { value: 'regular_maintenance',     label: 'Regular Maintenance',     icon: '⚙️', desc: 'Scheduled service / oil change etc.' },
  { value: 'damage',                  label: 'Damage / Broken',         icon: '💥', desc: 'Physical damage to equipment' },
  { value: 'theft',                   label: 'Theft',                   icon: '🚨', desc: 'Equipment or parts stolen' },
  { value: 'safety_issue',            label: 'Safety Issue',            icon: '⚠️', desc: 'Hazard that needs attention' },
  { value: 'accident',                label: 'Accident',                icon: '🚧', desc: 'Collision or mishap occurred' },
  { value: 'near_miss',               label: 'Near Miss',               icon: '😰', desc: 'Almost had an accident' },
  { value: 'other',                   label: 'Others',                  icon: '📋', desc: 'Any other issue' },
]

function IncidentModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading, capture } = useGPS()
  const [incidentType, setIncidentType] = useState('')
  const [form, setForm] = useState({
    description: '', action_taken: '', breakdown_cause: '',
    rectification_needed: '', parts_status: 'to_order',
    maintenance_subtype: 'unscheduled', damage_cause: '',
    what_needs_to_be_done: '', severity: 'medium',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!incidentType) { toast.error('Select incident type'); return }
    if (!form.description.trim()) { toast.error('Description is required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('shift_incidents').insert({
        company_id: companyId,
        shift_id: shift?.id || null,
        equipment_id: equipment.id,
        incident_type: incidentType,
        severity: ['safety_issue', 'accident', 'near_miss'].includes(incidentType) ? form.severity : null,
        description: form.description,
        action_taken: form.action_taken || null,
        breakdown_cause: form.breakdown_cause || null,
        rectification_needed: form.rectification_needed || null,
        parts_status: incidentType === 'breakdown' ? form.parts_status : null,
        maintenance_subtype: incidentType === 'unscheduled_maintenance' || incidentType === 'regular_maintenance' ? form.maintenance_subtype : null,
        damage_cause: form.damage_cause || null,
        what_needs_to_be_done: form.what_needs_to_be_done || null,
        notify_assigned: ['damage', 'safety_issue', 'theft', 'accident'].includes(incidentType),
        location_lat: location?.lat || null,
        location_lng: location?.lng || null,
        location_address: location?.address || null,
        resolved: false,
      })
      if (error) throw error

      // Set equipment status for certain types
      if (incidentType === 'breakdown') {
        await supabase.from('equipment').update({ status: 'breakdown' }).eq('id', equipment.id)
      } else if (incidentType === 'regular_maintenance' || incidentType === 'unscheduled_maintenance') {
        await supabase.from('equipment').update({ status: 'maintenance' }).eq('id', equipment.id)
      }

      // Create notification for types that need it
      if (['damage', 'safety_issue', 'theft', 'accident', 'breakdown'].includes(incidentType)) {
        await supabase.from('notifications').insert({
          company_id: companyId,
          type: `incident_${incidentType}`,
          title: `${INCIDENT_OPTIONS.find(i => i.value === incidentType)?.label} — ${equipment.name}`,
          body: form.description,
          metadata: { equipment_id: equipment.id, equipment_name: equipment.name, incident_type: incidentType }
        })
      }

      toast.success('Incident reported')
      qc.invalidateQueries(['incidents', equipment.id])
      qc.invalidateQueries(['all_incidents', companyId])
      qc.invalidateQueries(['equipment', companyId])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to report incident')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Report Incident — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving || !incidentType} className="flex-1 btn-danger">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Reporting…</> : 'Report Incident'}
        </button>
      </>
    }>
      {/* Incident Type Dropdown */}
      <Field label="Incident Type" required>
        <select className={inp()} value={incidentType} onChange={e => setIncidentType(e.target.value)}>
          <option value="">Select what happened…</option>
          {INCIDENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
          ))}
        </select>
        {incidentType && (
          <p className="text-xs text-slate-500 mt-1">{INCIDENT_OPTIONS.find(o => o.value === incidentType)?.desc}</p>
        )}
      </Field>

      {/* ── Breakdown Form ── */}
      {incidentType === 'breakdown' && (
        <>
          <Field label="What happened / Cause of breakdown" required>
            <VoiceTextarea value={form.breakdown_cause} onChange={v => set('breakdown_cause', v)}
              placeholder="Describe what failed — e.g. hydraulic hose burst, engine overheating, pump failure…" rows={3} />
          </Field>
          <Field label="What needs to be done to fix it">
            <VoiceTextarea value={form.rectification_needed} onChange={v => set('rectification_needed', v)}
              placeholder="What repair / replacement is needed?" rows={2} />
          </Field>
          <Field label="Additional Notes">
            <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Any other details…" rows={2} />
          </Field>
          <GPSField location={location} loading={gpsLoading} />
        </>
      )}

      {/* ── Unscheduled Maintenance Form ── */}
      {incidentType === 'unscheduled_maintenance' && (
        <>
          <Field label="What issue did you notice?" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)}
              placeholder="e.g. oil leak from engine, seal damaged, coolant loss…" rows={3} />
          </Field>
          <Field label="What needs to be done?">
            <VoiceTextarea value={form.what_needs_to_be_done} onChange={v => set('what_needs_to_be_done', v)}
              placeholder="What action or repair is needed?" rows={2} />
          </Field>
        </>
      )}

      {/* ── Regular Maintenance Form ── */}
      {incidentType === 'regular_maintenance' && (
        <>
          <Field label="Maintenance Description" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)}
              placeholder="e.g. 250hr service, oil change, filter replacement…" rows={3} />
          </Field>
          <Field label="Action Taken">
            <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)}
              placeholder="What was done?" rows={2} />
          </Field>
        </>
      )}

      {/* ── Damage Form ── */}
      {incidentType === 'damage' && (
        <>
          <Field label="How did the damage happen?" required>
            <VoiceTextarea value={form.damage_cause} onChange={v => set('damage_cause', v)}
              placeholder="e.g. lorry hit the equipment, crane rope snapped, dropped during loading…" rows={3} />
          </Field>
          <Field label="Describe the damage">
            <VoiceTextarea value={form.description} onChange={v => set('description', v)}
              placeholder="Which part is damaged? How severe?" rows={2} />
          </Field>
          <Field label="What needs to be done?">
            <VoiceTextarea value={form.what_needs_to_be_done} onChange={v => set('what_needs_to_be_done', v)}
              placeholder="Repair needed, parts to replace?" rows={2} />
          </Field>
          <GPSField location={location} loading={gpsLoading} />
          <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-2.5 text-xs text-orange-300">
            ⚠ Admin and all assigned personnel will be notified automatically
          </div>
        </>
      )}

      {/* ── Theft Form ── */}
      {incidentType === 'theft' && (
        <>
          <Field label="What was stolen?" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)}
              placeholder="Describe what was stolen — equipment, parts, tools, fuel…" rows={3} />
          </Field>
          <Field label="When was it noticed?">
            <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)}
              placeholder="When and how was the theft noticed?" rows={2} />
          </Field>
          <GPSField location={location} loading={gpsLoading} />
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2.5 text-xs text-red-300">
            🚨 Admin will be notified immediately
          </div>
        </>
      )}

      {/* ── Safety Issue Form ── */}
      {incidentType === 'safety_issue' && (
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
          <Field label="What is the safety issue?" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)}
              placeholder="Describe the hazard clearly — what is the risk?" rows={3} />
          </Field>
          <Field label="What needs to be done?">
            <VoiceTextarea value={form.what_needs_to_be_done} onChange={v => set('what_needs_to_be_done', v)}
              placeholder="What immediate action is needed to make it safe?" rows={2} />
          </Field>
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2.5 text-xs text-yellow-300">
            ⚠ All personnel assigned to this equipment will be notified
          </div>
        </>
      )}

      {/* ── Accident Form ── */}
      {incidentType === 'accident' && (
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
          <Field label="What happened?" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)}
              placeholder="Describe the accident — what happened, who was involved?" rows={3} />
          </Field>
          <Field label="Immediate action taken">
            <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)}
              placeholder="What was done immediately after the accident?" rows={2} />
          </Field>
          <GPSField location={location} loading={gpsLoading} />
        </>
      )}

      {/* ── Near Miss Form ── */}
      {incidentType === 'near_miss' && (
        <>
          <Field label="What almost happened?" required>
            <VoiceTextarea value={form.description} onChange={v => set('description', v)}
              placeholder="Describe the near miss — what could have gone wrong?" rows={3} />
          </Field>
          <Field label="Action taken to prevent recurrence">
            <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)}
              placeholder="What was done to prevent this from happening again?" rows={2} />
          </Field>
        </>
      )}

      {/* ── Others Form ── */}
      {incidentType === 'other' && (
        <Field label="Description" required>
          <VoiceTextarea value={form.description} onChange={v => set('description', v)}
            placeholder="Describe the issue…" rows={4} />
        </Field>
      )}
    </Modal>
  )
}

// ── Equipment Detail ──────────────────────────────────────────────────────────
function EquipmentDetail({ equipment: equipmentProp, companyId, onClose }) {
  const [modal, setModal]         = useState(null)
  const [equipment, setEquipment] = useState(equipmentProp) // local copy so we can update after deploy
  const qc                        = useQueryClient()
  const { role }                  = useAuth()
  const isAdmin                   = ['admin', 'superadmin', 'manager'].includes(role)

  // ── Admin state ─────────────────────────────────────────────────────────────
  const [deployClientId,  setDeployClientId]  = useState(equipment.current_client_id  || '')
  const [deployProjectId, setDeployProjectId] = useState(equipment.current_project_id || '')
  const [deploySiteName,  setDeploySiteName]  = useState(equipment.current_site_name  || '')
  const [deploySaving,    setDeploySaving]    = useState(false)

  const [newOperator,     setNewOperator]     = useState('')
  const [operatorSaving,  setOperatorSaving]  = useState(false)

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
      const { data, error } = await supabase.from('clients').select('id, name')
        .eq('company_id', companyId).order('name')
      if (error) return [] // table may not exist yet
      return data || []
    },
    enabled: isAdmin,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects_for_client', deployClientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name')
        .eq('company_id', companyId).eq('client_id', deployClientId).order('name')
      if (error) return [] // table may not exist yet
      return data || []
    },
    enabled: isAdmin && !!deployClientId,
  })

  // ── Admin actions ────────────────────────────────────────────────────────────
  const handleDeploy = async () => {
    if (!deployProjectId) { toast.error('Select a project to deploy'); return }
    setDeploySaving(true)
    try {
      const { error } = await supabase.from('equipment').update({
        current_client_id:  deployClientId  || null,
        current_project_id: deployProjectId || null,
        current_site_name:  deploySiteName  || null,
      }).eq('id', equipment.id)
      if (error) throw error
      setEquipment(e => ({ ...e, current_client_id: deployClientId, current_project_id: deployProjectId, current_site_name: deploySiteName }))
      qc.invalidateQueries(['equipment', companyId])
      toast.success('Equipment deployed to project')
    } catch (err) {
      toast.error(err.message || 'Failed to deploy')
    } finally { setDeploySaving(false) }
  }

  const handleAddOperator = async () => {
    const name = newOperator.trim()
    if (!name) { toast.error('Enter operator name'); return }
    setOperatorSaving(true)
    try {
      const { error } = await supabase.from('equipment_assignments').insert({
        company_id: companyId, equipment_id: equipment.id, operator_name: name, is_active: true,
      })
      if (error) {
        if (error.code === '23505') { toast.error('Operator already assigned'); return }
        throw error
      }
      setNewOperator('')
      refetchAssignments()
      qc.invalidateQueries(['equipment_assignments', equipment.id])
      toast.success(`${name} assigned`)
    } catch (err) {
      toast.error(err.message || 'Failed to assign operator')
    } finally { setOperatorSaving(false) }
  }

  const handleRemoveOperator = async (assignmentId, name) => {
    try {
      await supabase.from('equipment_assignments').update({ is_active: false }).eq('id', assignmentId)
      refetchAssignments()
      qc.invalidateQueries(['equipment_assignments', equipment.id])
      toast.success(`${name} removed`)
    } catch (err) {
      toast.error('Failed to remove')
    }
  }

  const { data: activeShift } = useQuery({
    queryKey: ['active_shift', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shifts').select('*')
        .eq('equipment_id', equipment.id).eq('status', 'open')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      return data
    },
  })

  const { data: recentShifts = [] } = useQuery({
    queryKey: ['shifts', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shifts').select('*')
        .eq('equipment_id', equipment.id).order('shift_date', { ascending: false }).limit(5)
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

  const { data: openIncidents = [] } = useQuery({
    queryKey: ['incidents', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shift_incidents').select('*')
        .eq('equipment_id', equipment.id).eq('resolved', false)
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  const st = STATUS_COLORS[equipment.status] || STATUS_COLORS.active
  const mt = equipment.meter_type

  return (
    <>
      <Modal title={equipment.name} onClose={onClose}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
          <span className="text-xs text-slate-400">{equipment.category}</span>
          {equipment.registration_number && <span className="text-xs text-slate-500 font-mono">{equipment.registration_number}</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(mt === 'hours' || mt === 'both') && (
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-slate-400">Hour Meter</p>
              <p className="text-xl font-bold text-slate-100">{Number(equipment.current_meter_reading || 0).toFixed(1)} <span className="text-sm font-normal text-slate-400">hrs</span></p>
            </div>
          )}
          {(mt === 'kilometers' || mt === 'both') && (
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-slate-400">Odometer</p>
              <p className="text-xl font-bold text-slate-100">{Number(equipment.current_meter_reading || 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">km</span></p>
            </div>
          )}
        </div>

        {activeShift && (
          <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400 uppercase">Shift Active</span>
            </div>
            <p className="text-sm text-slate-200">{activeShift.operator_name} · Started {activeShift.start_time}</p>
            {activeShift.site_incharge_name && <p className="text-xs text-slate-400">Incharge: {activeShift.site_incharge_name}</p>}
            {activeShift.location_address && (
              <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                <MapPin className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />{activeShift.location_address}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {!activeShift ? (
            <button onClick={() => setModal('start')}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors col-span-2">
              <PlayCircle className="w-5 h-5" /> Start Shift
            </button>
          ) : (
            <button onClick={() => setModal('end')}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-colors col-span-2">
              <StopCircle className="w-5 h-5" /> End Shift
            </button>
          )}
          <button onClick={() => setModal('fuel')}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dark-700 border border-dark-600 hover:border-yellow-500 text-slate-200 text-sm transition-colors">
            <Fuel className="w-4 h-4 text-yellow-400" /> Add Fuel
          </button>
          <button onClick={() => setModal('incident')}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dark-700 border border-dark-600 hover:border-orange-500 text-slate-200 text-sm transition-colors">
            <AlertTriangle className="w-4 h-4 text-orange-400" /> Report Incident
          </button>
        </div>

        {/* ── Admin: Deployment + Operators ─────────────────────────────── */}
        {isAdmin && (
          <div className="border border-dark-600 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="bg-dark-700 px-3 py-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Operations Setup</span>
            </div>

            {/* Deploy to Project */}
            <div className="p-3 space-y-2 border-b border-dark-600">
              <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Deploy to Client / Project
              </p>
              {equipment.current_site_name && (
                <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300">
                  ✓ Currently: {equipment.current_site_name}
                </div>
              )}
              <select className={inp('text-xs')} value={deployClientId} onChange={e => { setDeployClientId(e.target.value); setDeployProjectId('') }}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {deployClientId && (
                <select className={inp('text-xs')} value={deployProjectId} onChange={e => setDeployProjectId(e.target.value)}>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <input className={inp('text-xs')} value={deploySiteName}
                onChange={e => setDeploySiteName(e.target.value)}
                placeholder="Site name (optional, e.g. Phase 2 — North Block)" />
              <button onClick={handleDeploy} disabled={deploySaving || !deployProjectId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium disabled:opacity-40 transition-colors">
                {deploySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {deploySaving ? 'Saving…' : 'Save Deployment'}
              </button>
            </div>

            {/* Manage Operators */}
            <div className="p-3 space-y-2">
              <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Assigned Operators
              </p>
              {assignments.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No operators assigned yet</p>
              ) : (
                <div className="space-y-1.5">
                  {assignments.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-dark-700 rounded-lg px-2.5 py-1.5">
                      <span className="text-xs text-slate-200">{a.operator_name}</span>
                      <button onClick={() => handleRemoveOperator(a.id, a.operator_name)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input className={inp('text-xs flex-1')} value={newOperator}
                  onChange={e => setNewOperator(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddOperator()}
                  placeholder="Operator name…" />
                <button onClick={handleAddOperator} disabled={operatorSaving || !newOperator.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-dark-600 border border-dark-500 hover:border-primary-500 text-xs text-slate-300 disabled:opacity-40 transition-colors shrink-0">
                  {operatorSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {openIncidents.length > 0 && (
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
            <p className="text-xs font-semibold text-red-400 mb-1">⚠ {openIncidents.length} Open Incident{openIncidents.length > 1 ? 's' : ''}</p>
            {openIncidents.map(i => (
              <p key={i.id} className="text-xs text-slate-300">· {INCIDENT_OPTIONS.find(t => t.value === i.incident_type)?.label || i.incident_type} — {i.description?.slice(0, 60)}</p>
            ))}
          </div>
        )}

        {recentShifts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recent Shifts</p>
            <div className="space-y-2">
              {recentShifts.map(s => (
                <div key={s.id} className="bg-dark-700 rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-200 font-medium">{s.operator_name} · {s.shift_date}</p>
                    <span className={`px-2 py-0.5 rounded-full ${s.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-600 text-slate-400'}`}>{s.status}</span>
                  </div>
                  <p className="text-slate-400">{s.start_time}{s.end_time ? ` → ${s.end_time}` : ' (open)'} · {s.working_hours || 0} hrs</p>
                  {s.meter_discrepancy && <p className="text-orange-400 mt-0.5">⚠ Meter corrected · {s.meter_discrepancy_reason}</p>}
                  {s.location_address && <p className="text-slate-500 mt-0.5 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{s.location_address.slice(0, 50)}…</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {recentFuel.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recent Fuel</p>
            <div className="space-y-2">
              {recentFuel.map(f => (
                <div key={f.id} className="bg-dark-700 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 font-medium">{f.quantity_liters}L {f.vendor_name ? `· ${f.vendor_name}` : ''}</p>
                    <p className="text-slate-400">{f.delivered_by_name ? `By ${f.delivered_by_name}` : ''}{f.invoice_number ? ` · #${f.invoice_number}` : ''}</p>
                    {f.location_address && <p className="text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-2.5 h-2.5" />{f.location_address.slice(0, 40)}…</p>}
                  </div>
                  {f.total_amount && <span className="text-yellow-400 font-medium">₹{Number(f.total_amount).toLocaleString('en-IN')}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {modal === 'start'    && <StartShiftModal  equipment={equipment} companyId={companyId} onClose={() => { setModal(null); onClose() }} />}
      {modal === 'end'      && <EndShiftModal    equipment={equipment} shift={activeShift}   companyId={companyId} onClose={() => { setModal(null); onClose() }} />}
      {modal === 'fuel'     && <FuelModal        equipment={equipment} shift={activeShift}   companyId={companyId} onClose={() => setModal(null)} />}
      {modal === 'incident' && <IncidentModal    equipment={equipment} shift={activeShift}   companyId={companyId} onClose={() => setModal(null)} />}
    </>
  )
}

// ── Equipment Card ────────────────────────────────────────────────────────────
function EquipmentCard({ equipment, onClick }) {
  const st = STATUS_COLORS[equipment.status] || STATUS_COLORS.active
  return (
    <button onClick={onClick}
      className="w-full text-left bg-dark-800 border border-dark-700 hover:border-dark-500 rounded-xl p-4 transition-all active:scale-[0.98]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-100 text-sm leading-tight truncate">{equipment.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{equipment.category}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
      </div>
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Gauge className="w-3.5 h-3.5" />
          <span>{Number(equipment.current_meter_reading || 0).toFixed(1)} {equipment.meter_type === 'kilometers' ? 'km' : 'hrs'}</span>
        </div>
        {equipment.registration_number && <span className="text-xs text-slate-500 font-mono">{equipment.registration_number}</span>}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1.5">
          {equipment.make  && <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded">{equipment.make}</span>}
          {equipment.model && <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded">{equipment.model}</span>}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600" />
      </div>
    </button>
  )
}

// ── Fleet Tab ─────────────────────────────────────────────────────────────────
function FleetTab({ companyId }) {
  const [showAdd, setShowAdd]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['equipment', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })

  const filtered = equipment.filter(e =>
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.registration_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.category || '').toLowerCase().includes(search.toLowerCase())) &&
    (filterStatus === 'all' || e.status === filterStatus)
  )

  const counts = { active: 0, idle: 0, breakdown: 0, maintenance: 0 }
  equipment.forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++ })

  return (
    <div className="flex flex-col h-full">
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
      <div className="px-4 pb-2 shrink-0">
        <input className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
          placeholder="Search equipment, reg. no, category…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(eq => <EquipmentCard key={eq.id} equipment={eq} onClick={() => setSelected(eq)} />)}
          </div>
        )}
      </div>
      {equipment.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-dark-900 pt-8">
          <button onClick={() => setShowAdd(true)} className="w-full btn-primary py-3"><Plus className="w-5 h-5" /> Add Equipment</button>
        </div>
      )}
      {showAdd  && <AddEquipmentModal companyId={companyId} onClose={() => setShowAdd(false)} />}
      {selected && <EquipmentDetail equipment={selected} companyId={companyId} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ── Shifts Tab ────────────────────────────────────────────────────────────────
function ShiftsTab({ companyId }) {
  const [filterDate, setFilterDate] = useState(today())

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['all_shifts', companyId, filterDate],
    queryFn: async () => {
      let q = supabase.from('shifts').select('*, equipment(name, category, meter_type)')
        .eq('company_id', companyId).order('shift_date', { ascending: false }).order('start_time', { ascending: false })
      if (filterDate) q = q.eq('shift_date', filterDate)
      const { data, error } = await q.limit(50)
      if (error) throw error
      return data || []
    },
  })

  const totalHours = shifts.reduce((sum, s) => sum + Number(s.working_hours || 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 shrink-0 flex items-center gap-3">
        <input type="date" className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
          value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        {shifts.length > 0 && <span className="text-xs text-slate-400">{shifts.length} shifts · {totalHours.toFixed(1)} hrs total</span>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : shifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Clock className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">No shifts for this date</p>
          </div>
        ) : (
          <div className="space-y-2">
            {shifts.map(s => (
              <div key={s.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-100 text-sm truncate">{s.equipment?.name}</p>
                    <p className="text-xs text-slate-400">{s.equipment?.category}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${s.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-600 text-slate-400'}`}>{s.status}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-slate-400">
                  <span><User className="w-3 h-3 inline mr-1" />{s.operator_name || '—'}</span>
                  <span><Clock className="w-3 h-3 inline mr-1" />{s.start_time}{s.end_time ? ` → ${s.end_time}` : ' (ongoing)'}</span>
                  <span>Opening: {s.start_meter || s.start_km} {s.equipment?.meter_type === 'kilometers' ? 'km' : 'hrs'}</span>
                  <span>Worked: <strong className="text-slate-200">{s.working_hours || 0} hrs</strong></span>
                </div>
                {s.meter_discrepancy && (
                  <p className="text-xs text-orange-400 mt-1">⚠ Meter corrected · {s.meter_discrepancy_reason}</p>
                )}
                {s.location_address && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{s.location_address.slice(0, 60)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Fuel Tab ──────────────────────────────────────────────────────────────────
function FuelTab({ companyId }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['all_fuel', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('shift_fuel_entries')
        .select('*, equipment(name, category)').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data || []
    },
  })

  const totalLitres = entries.reduce((sum, e) => sum + Number(e.quantity_liters || 0), 0)
  const totalAmount = entries.reduce((sum, e) => sum + Number(e.total_amount || 0), 0)

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
            <p className="text-xs text-slate-500">Add fuel from equipment detail</p>
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
                  {e.meter_at_filling && <span>Meter: {e.meter_at_filling} hrs</span>}
                  {e.km_at_filling    && <span>KM: {e.km_at_filling}</span>}
                  {e.delivered_by_name && <span>By: {e.delivered_by_name}</span>}
                  {e.vendor_name      && <span>Vendor: {e.vendor_name}</span>}
                  {e.invoice_number   && <span>Invoice: #{e.invoice_number}</span>}
                </div>
                {e.location_address && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{e.location_address.slice(0, 60)}
                  </p>
                )}
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
                  {i.breakdown_cause && <p className="text-xs text-slate-400 mt-0.5">Cause: {i.breakdown_cause}</p>}
                  {i.rectification_needed && <p className="text-xs text-slate-400 mt-0.5">Fix needed: {i.rectification_needed}</p>}
                  {i.parts_status && <p className="text-xs text-slate-400 mt-0.5">Parts: {i.parts_status.replace(/_/g, ' ')}</p>}
                  {i.damage_cause && <p className="text-xs text-slate-400 mt-0.5">How: {i.damage_cause}</p>}
                  {i.what_needs_to_be_done && <p className="text-xs text-slate-400 mt-0.5">Action: {i.what_needs_to_be_done}</p>}
                  {i.location_address && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" />{i.location_address.slice(0, 60)}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">{format(new Date(i.created_at), 'dd MMM yyyy, HH:mm')}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main FleetPage ────────────────────────────────────────────────────────────
export default function FleetPage() {
  const { companyId } = useAuth()
  const [activeTab, setActiveTab] = useState('fleet')

  const tabs = [
    { id: 'fleet',     label: 'Fleet',     icon: Truck },
    { id: 'shifts',    label: 'Shifts',    icon: Clock },
    { id: 'fuel',      label: 'Fuel',      icon: Fuel },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
  ]

  return (
    <div className="relative flex flex-col h-full bg-dark-900">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-lg font-bold text-slate-100">Fleet Management</h1>
        <p className="text-xs text-slate-400">Track equipment, shifts, fuel & incidents</p>
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
        {activeTab === 'fleet'     && <FleetTab     companyId={companyId} />}
        {activeTab === 'shifts'    && <ShiftsTab    companyId={companyId} />}
        {activeTab === 'fuel'      && <FuelTab      companyId={companyId} />}
        {activeTab === 'incidents' && <IncidentsTab companyId={companyId} />}
      </div>
    </div>
  )
}
