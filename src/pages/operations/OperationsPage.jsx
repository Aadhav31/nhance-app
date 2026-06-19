import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { INCIDENT_SEVERITY } from '../../lib/equipmentTypes'
import {
  Truck, Plus, Fuel, AlertTriangle, X, Loader2, CheckCircle,
  Gauge, User, Mic, MicOff, MapPin, Camera,
  Clock, Activity, PlayCircle, StopCircle, ChevronRight, Lock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }
function nowTime() { return new Date().toTimeString().slice(0, 5) }
function inp(extra = '') { return `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${extra}` }

// ── Image timestamp overlay ───────────────────────────────────────────────────
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
  const { error } = await supabase.storage.from('nhance-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
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
      onCapture(url); toast.success('Photo saved')
    } catch { toast.error('Failed to save photo')
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
    </div>
  )
}

// ── GPS Hook ──────────────────────────────────────────────────────────────────
function useGPS() {
  const [location, setLocation] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const capture = () => {
    if (!navigator.geolocation) return
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
          const d = await r.json()
          if (d.display_name) address = d.display_name
        } catch {}
        setLocation({ lat, lng, address })
        setLoading(false)
      },
      () => setLoading(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }
  useEffect(() => { capture() }, [])
  return { location, loading, capture }
}

// ── Speech-to-Text ────────────────────────────────────────────────────────────
function useSpeechToText(onResult) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const toggle = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { toast.error('Speech not supported in this browser'); return }
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const rec = new SR(); recRef.current = rec
    rec.lang = 'en-IN'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult  = (e) => { onResult(e.results[0][0].transcript); setListening(false) }
    rec.onerror   = ()  => setListening(false)
    rec.onend     = ()  => setListening(false)
    rec.start(); setListening(true)
  }
  return { listening, toggle }
}

// ── Voice Textarea ────────────────────────────────────────────────────────────
function VoiceTextarea({ value, onChange, placeholder, rows = 2 }) {
  const { listening, toggle } = useSpeechToText((t) => onChange(value ? value + ' ' + t : t))
  return (
    <div className="relative">
      <textarea className={`${inp()} pr-10 resize-none`} rows={rows} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      <button type="button" onClick={toggle}
        className={`absolute right-2.5 top-2.5 p-1 rounded-full transition-colors ${listening ? 'text-red-400 animate-pulse' : 'text-slate-500 hover:text-slate-300'}`}>
        {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ── GPS Field ─────────────────────────────────────────────────────────────────
function GPSField({ location, loading }) {
  return (
    <div className="flex items-start gap-2 text-xs text-slate-500 bg-dark-700 rounded-lg px-3 py-2">
      <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0 mt-0.5" />
      {loading ? 'Getting location…' : location ? location.address : 'Location not captured'}
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700 shrink-0">
          <h2 className="font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">{children}</div>
        {footer && <div className="flex gap-2 px-4 py-3 border-t border-dark-700 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

// ── Incident Options ──────────────────────────────────────────────────────────
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

// ── Start Shift Modal ─────────────────────────────────────────────────────────
function StartShiftModal({ equipment, companyId, onClose }) {
  const qc = useQueryClient()
  const { role, session } = useAuth()
  const { location, loading: gpsLoading } = useGPS()
  const isAdmin    = ['admin', 'superadmin'].includes(role)
  const isOperator = role === 'operator'

  // Look up the logged-in user's HR employee record (operators only)
  const { data: myEmployee, isLoading: employeeLoading } = useQuery({
    queryKey: ['my_employee_shift', session?.user?.id, companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id, name, designation, employee_number')
        .eq('company_id', companyId)
        .eq('user_id', session.user.id)
        .maybeSingle()
      return data
    },
    enabled: !!companyId && !!session?.user?.id && isOperator,
  })

  const [form, setForm] = useState({
    shift_date: today(), shift_type: 'day',
    operator_name: '', site_incharge_name: '',
    start_time: nowTime(),   // auto-captured at modal open
    start_meter: String(equipment.current_meter_reading || ''),
    start_km: '', notes: '',
  })
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['equipment_assignments', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_assignments')
        .select('*').eq('equipment_id', equipment.id).eq('is_active', true).order('operator_name')
      return data || []
    },
  })
  const [previousClosing, setPreviousClosing] = useState(null)
  const [meterChanged, setMeterChanged]       = useState(false)
  const [overrideReason, setOverrideReason]   = useState('')
  const [meterPhotoUrl, setMeterPhotoUrl]     = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const mt = equipment.meter_type

  // Auto-fill operator name from HR record once loaded
  useEffect(() => {
    if (myEmployee && isOperator) {
      setForm(p => ({ ...p, operator_name: myEmployee.name }))
    }
  }, [myEmployee, isOperator])

  // Auto-fill shift type from assignment once both are loaded
  useEffect(() => {
    if (myEmployee && isOperator && assignments.length > 0) {
      const myAssignment = assignments.find(a => a.operator_name === myEmployee.name)
      if (myAssignment?.shift_type) {
        setForm(p => ({ ...p, shift_type: myAssignment.shift_type }))
      }
    }
  }, [myEmployee, assignments, isOperator])

  // When operator is selected manually (non-operator roles), auto-fill shift type
  const handleOperatorChange = (name) => {
    set('operator_name', name)
    if (!isAdmin) {
      const assignment = assignments.find(a => a.operator_name === name)
      if (assignment?.shift_type) set('shift_type', assignment.shift_type)
    }
  }

  useEffect(() => {
    supabase.from('shifts').select('end_meter, end_km, operator_name, shift_date')
      .eq('equipment_id', equipment.id).eq('status', 'closed')
      .order('shift_date', { ascending: false }).order('end_time', { ascending: false })
      .limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.end_meter) { setPreviousClosing(data); setForm(p => ({ ...p, start_meter: String(data.end_meter) })) }
        if (data?.end_km)    { setForm(p => ({ ...p, start_km: String(data.end_km) })) }
      })
  }, [equipment.id])

  const handleMeterChange = (v) => {
    set('start_meter', v)
    setMeterChanged(previousClosing && v !== String(previousClosing.end_meter))
  }

  const handleSave = async () => {
    if (!form.operator_name.trim()) { toast.error('Operator name is required'); return }
    if ((mt === 'hours' || mt === 'both') && !form.start_meter) { toast.error('Start meter reading required'); return }
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
      if (meterChanged) {
        await supabase.from('notifications').insert({
          company_id: companyId, type: 'meter_discrepancy',
          title: `Meter correction on ${equipment.name}`,
          body: `${form.operator_name} changed opening meter from ${previousClosing?.end_meter} to ${form.start_meter} hrs. Reason: ${overrideReason}`,
          metadata: { equipment_id: equipment.id, shift_id: shift?.id, equipment_name: equipment.name }
        }).catch(() => {})
      }
      await supabase.from('equipment').update({ status: 'active' }).eq('id', equipment.id)
      toast.success('Shift started')
      qc.invalidateQueries(['equipment', companyId])
      qc.invalidateQueries(['active_shift', equipment.id])
      qc.invalidateQueries(['today_ops', companyId])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to start shift')
    } finally { setSaving(false) }
  }

  const notLinked   = !equipment.current_project_id
  const noOperators = !assignmentsLoading && assignments.length === 0
  // Operator without linked HR record can't start a shift
  const notLinkedHR = isOperator && !employeeLoading && !myEmployee
  const isBlocked   = notLinked || noOperators || notLinkedHR

  return (
    <Modal title={`Start Shift — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving || isBlocked} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</> : '▶ Start Shift'}
        </button>
      </>
    }>
      {notLinked && (
        <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-300">Equipment not deployed to any project</p>
            <p className="text-xs text-orange-400/80 mt-1">Admin must assign this equipment to a Client &amp; Project first.</p>
          </div>
        </div>
      )}
      {!notLinked && noOperators && (
        <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-300">No operators assigned to this equipment</p>
            <p className="text-xs text-orange-400/80 mt-1">Admin must assign at least one operator first.</p>
          </div>
        </div>
      )}
      {notLinkedHR && (
        <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-300">Account not linked to an employee record</p>
            <p className="text-xs text-orange-400/80 mt-1">Ask your admin to link your login account in HR → Employee → Compliance & Bank.</p>
          </div>
        </div>
      )}
      {!isBlocked && (<>
        {equipment.current_site_name && (
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs text-slate-400">
            📍 {equipment.current_site_name}
          </div>
        )}
        {/* Date (admin can change, everyone else locked to today) */}
        <Field label="Date">
          {isAdmin
            ? <input type="date" className={inp()} value={form.shift_date} onChange={e => set('shift_date', e.target.value)} />
            : <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="text-sm text-slate-200 flex-1">{form.shift_date}</span>
                <Lock className="w-3.5 h-3.5 text-slate-600" />
              </div>}
        </Field>

        {/* Operator — auto-identified for operators, dropdown for admin/supervisor */}
        <Field label="Operator / Driver" required>
          {isOperator && myEmployee ? (
            /* Operator sees their own name auto-filled, locked */
            <div className="bg-dark-700 border border-primary-700/40 rounded-lg px-3 py-2 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-500/20 border border-primary-600/40 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-100">{myEmployee.name}</p>
                <p className="text-xs text-slate-500">{myEmployee.designation || 'Operator'}{myEmployee.employee_number ? ` · ${myEmployee.employee_number}` : ''}</p>
              </div>
              <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            </div>
          ) : assignmentsLoading ? (
            <div className="text-xs text-slate-500 py-2 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</div>
          ) : (
            <select className={inp()} value={form.operator_name} onChange={e => handleOperatorChange(e.target.value)}>
              <option value="">Select operator…</option>
              {assignments.map(a => (
                <option key={a.id} value={a.operator_name}>{a.operator_name}</option>
              ))}
            </select>
          )}
        </Field>

        {/* Shift Type — preset from assignment, locked for operators */}
        <Field label="Shift Type">
          {isAdmin ? (
            <select className={inp()} value={form.shift_type} onChange={e => set('shift_type', e.target.value)}>
              <option value="day">☀️ Day Shift</option>
              <option value="night">🌙 Night Shift</option>
              <option value="double">🔄 Double Shift</option>
            </select>
          ) : (
            <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-sm text-slate-200 flex-1">
                {{ day: '☀️ Day Shift', night: '🌙 Night Shift', double: '🔄 Double Shift' }[form.shift_type] || '☀️ Day Shift'}
              </span>
              <span className="text-[10px] text-slate-500">preset by admin</span>
              <Lock className="w-3.5 h-3.5 text-slate-600" />
            </div>
          )}
        </Field>

        {/* Start Time — auto-captured, locked for operators */}
        <Field label="Shift Start Time">
          {isAdmin ? (
            <input type="time" className={inp()} value={form.start_time} onChange={e => set('start_time', e.target.value)} />
          ) : (
            <div className="bg-dark-700 border border-emerald-700/40 rounded-lg px-3 py-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-mono font-semibold text-emerald-300 text-base flex-1">{form.start_time}</span>
              <span className="text-[10px] text-slate-500">auto-captured</span>
            </div>
          )}
        </Field>

        <Field label="Site Incharge">
          <input className={inp()} value={form.site_incharge_name} onChange={e => set('site_incharge_name', e.target.value)} placeholder="Supervisor / incharge name" />
        </Field>
        {(mt === 'hours' || mt === 'both') && (
          <div>
            <Field label="Start Hour Meter (hrs)" required>
              <input type="number" className={inp(meterChanged ? 'border-orange-500' : '')}
                value={form.start_meter} onChange={e => handleMeterChange(e.target.value)}
                placeholder="e.g. 4250.5" step="0.1" />
            </Field>
            {previousClosing && (
              <p className="text-xs text-slate-500 mt-1">Pre-filled from last shift ({previousClosing.operator_name} · {previousClosing.shift_date})</p>
            )}
            <CameraButton companyId={companyId} label="meter_start" photoUrl={meterPhotoUrl} onCapture={setMeterPhotoUrl} location={location} />
            {meterChanged && (
              <div className="mt-2 bg-orange-900/20 border border-orange-700/30 rounded-lg p-3">
                <p className="text-xs text-orange-400 font-medium mb-2">⚠ Meter changed from {previousClosing?.end_meter} — provide reason</p>
                <VoiceTextarea value={overrideReason} onChange={setOverrideReason} placeholder="Why is the opening meter different?" rows={2} />
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
        <Field label="Remarks">
          <VoiceTextarea value={form.notes} onChange={v => set('notes', v)}
            placeholder="Tap 🎤 to dictate or type remarks — site conditions, work instructions, any notes…"
            rows={3} />
          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <Mic className="w-3 h-3" /> Tap the mic icon to speak your remarks
          </p>
        </Field>
      </>)}
    </Modal>
  )
}

// ── End Shift Modal ───────────────────────────────────────────────────────────
function EndShiftModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading } = useGPS()   // auto-fires on mount
  const [form, setForm] = useState({
    end_time: nowTime(),
    end_meter: '', end_km: '',
    working_hours: '', idle_hours: '0', breakdown_hours: '0',
    work_done: '',        // what was accomplished this shift
    handover_notes: '',   // notes passed to the next operator
  })
  const [meterPhotoUrl,    setMeterPhotoUrl]    = useState(null)
  const [logsheetPhotoUrl, setLogsheetPhotoUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const mt = equipment.meter_type

  // ── Clock-based hours (cross-midnight safe) ───────────────────────────────
  const getClockHours = (endTime = form.end_time) => {
    if (!shift.start_time || !endTime) return null
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60
    return +(mins / 60).toFixed(2)
  }

  // Auto-calculate working hours from meter diff when closing meter is entered
  const handleEndMeterChange = (v) => {
    set('end_meter', v)
    if (v && shift.start_meter) {
      const meterDiff = Math.max(0, Number(v) - Number(shift.start_meter))
      const clockHrs  = getClockHours()
      // Use meter diff as authoritative; cap at clock time if wildly different
      const hrs = clockHrs ? String(Math.min(meterDiff, clockHrs + 0.5).toFixed(1)) : String(meterDiff.toFixed(1))
      set('working_hours', hrs)
    }
  }

  // Re-calc working hours when end time changes
  const handleEndTimeChange = (v) => {
    set('end_time', v)
    if (!form.end_meter && shift.start_time) {
      const [sh, sm] = shift.start_time.split(':').map(Number)
      const [eh, em] = v.split(':').map(Number)
      let mins = (eh * 60 + em) - (sh * 60 + sm)
      if (mins < 0) mins += 24 * 60
      set('working_hours', (mins / 60).toFixed(1))
    }
  }

  const handleSave = async () => {
    if ((mt === 'hours' || mt === 'both') && !form.end_meter) { toast.error('Closing meter reading is required'); return }
    const clockHrs  = getClockHours()
    const meterDiff = Number(form.end_meter || 0) - Number(shift.start_meter || 0)
    if (clockHrs && meterDiff > clockHrs + 0.5) {
      toast.error(`Meter diff (${meterDiff.toFixed(1)} hrs) exceeds clock time (${clockHrs.toFixed(1)} hrs)`); return
    }
    setSaving(true)
    try {
      const endMeter    = Number(form.end_meter || 0)
      const startMeter  = Number(shift.start_meter || 0)
      const hoursWorked = (mt === 'hours' || mt === 'both')
        ? (form.working_hours ? Number(form.working_hours) : Math.max(0, endMeter - startMeter))
        : Number(form.working_hours || 0)

      const { error } = await supabase.from('shifts').update({
        end_time:              form.end_time,
        end_meter:             form.end_meter ? endMeter : null,
        end_km:                form.end_km ? Number(form.end_km) : null,
        working_hours:         hoursWorked,
        idle_hours:            Number(form.idle_hours || 0),
        breakdown_hours:       Number(form.breakdown_hours || 0),
        status:                'closed',
        notes:                 shift.notes,                          // preserve start-shift remarks
        work_done:             form.work_done || null,
        handover_notes:        form.handover_notes || null,
        meter_photo_url:       meterPhotoUrl || null,
        logsheet_photo_url:    logsheetPhotoUrl || null,
        end_location_lat:      location?.lat    || null,
        end_location_lng:      location?.lng    || null,
        end_location_address:  location?.address || null,
      }).eq('id', shift.id)
      if (error) throw error
      if (form.end_meter) {
        await supabase.from('equipment').update({ current_meter_reading: endMeter, status: 'idle' }).eq('id', equipment.id)
      }
      toast.success('Shift ended')
      qc.invalidateQueries(['equipment', companyId])
      qc.invalidateQueries(['active_shift', equipment.id])
      qc.invalidateQueries(['today_ops', companyId])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to end shift')
    } finally { setSaving(false) }
  }

  const clockHrs   = getClockHours()
  const meterDiff  = form.end_meter ? Math.max(0, Number(form.end_meter) - Number(shift.start_meter || 0)) : null

  return (
    <Modal title={`End Shift — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-danger">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : '■ End Shift'}
        </button>
      </>
    }>
      {/* Shift summary header */}
      <div className="bg-dark-700 rounded-xl p-3 space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Operator</p>
            <p className="text-sm font-semibold text-slate-100">{shift.operator_name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Started</p>
            <p className="text-sm font-mono text-slate-300">{shift.start_time}</p>
          </div>
        </div>
        {shift.start_meter && (
          <p className="text-xs text-slate-500">Opening meter: {shift.start_meter} {mt === 'kilometers' ? 'km' : 'hrs'}</p>
        )}
      </div>

      {/* End time — manual entry */}
      <Field label="Shift End Time">
        <input type="time" className={inp()} value={form.end_time}
          onChange={e => handleEndTimeChange(e.target.value)} />
      </Field>

      {/* Hour meter */}
      {(mt === 'hours' || mt === 'both') && (
        <div className="space-y-1.5">
          <Field label="Closing Hour Meter (hrs)" required>
            <input type="number" className={inp()} value={form.end_meter}
              onChange={e => handleEndMeterChange(e.target.value)}
              placeholder={`≥ ${shift.start_meter || '0'}`} step="0.1" />
          </Field>
          <CameraButton companyId={companyId} label="meter_end" photoUrl={meterPhotoUrl} onCapture={setMeterPhotoUrl} location={location} />
        </div>
      )}
      {(mt === 'kilometers' || mt === 'both') && (
        <Field label="Closing Odometer (km)" required={mt === 'kilometers'}>
          <input type="number" className={inp()} value={form.end_km} onChange={e => set('end_km', e.target.value)} />
        </Field>
      )}

      {/* Auto-calculated working hours summary */}
      {(meterDiff !== null || clockHrs) && (
        <div className="bg-primary-900/20 border border-primary-700/30 rounded-xl px-3 py-2.5 space-y-1">
          <p className="text-xs font-medium text-primary-400">Hours Calculation</p>
          <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-400">
            {meterDiff !== null && <span>Meter diff: <span className="text-slate-200 font-semibold">{meterDiff.toFixed(1)} hrs</span></span>}
            {clockHrs && <span>Clock time: <span className="text-slate-200 font-semibold">{clockHrs.toFixed(1)} hrs</span></span>}
          </div>
        </div>
      )}

      {/* Working / Idle / Breakdown hrs */}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Working Hrs">
          <input type="number" className={inp('text-center')} value={form.working_hours}
            onChange={e => set('working_hours', e.target.value)} placeholder="Auto" step="0.1" />
        </Field>
        <Field label="Idle Hrs">
          <input type="number" className={inp('text-center')} value={form.idle_hours}
            onChange={e => set('idle_hours', e.target.value)} placeholder="0" step="0.1" />
        </Field>
        <Field label="Breakdown Hrs">
          <input type="number" className={inp('text-center')} value={form.breakdown_hours}
            onChange={e => set('breakdown_hours', e.target.value)} placeholder="0" step="0.1" />
        </Field>
      </div>

      {/* End location — auto-tagged */}
      <div className="flex items-start gap-2 text-xs bg-dark-700 rounded-lg px-3 py-2">
        <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0 mt-0.5" />
        <span className="text-slate-400">
          {gpsLoading ? 'Getting location…' : location ? location.address : 'Location not captured'}
        </span>
      </div>

      {/* Work done — voice */}
      <Field label="Work Done This Shift">
        <VoiceTextarea
          value={form.work_done}
          onChange={v => set('work_done', v)}
          placeholder="Tap 🎤 or type — trips completed, quantity moved, work area, progress…"
          rows={3}
        />
        <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
          <Mic className="w-3 h-3" /> Speak to auto-transcribe your summary
        </p>
      </Field>

      {/* Handover notes — voice */}
      <Field label="Notes to Next Shift">
        <VoiceTextarea
          value={form.handover_notes}
          onChange={v => set('handover_notes', v)}
          placeholder="Tap 🎤 or type — machine condition, pending work, warnings for next operator…"
          rows={3}
        />
        <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
          <Mic className="w-3 h-3" /> Speak your handover notes
        </p>
      </Field>

      {/* Log sheet photo */}
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
  const { location, loading: gpsLoading } = useGPS()
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
      const qty  = Number(form.quantity_liters)
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
      qc.invalidateQueries(['all_fuel', companyId])
      qc.invalidateQueries(['today_ops', companyId])
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
        <Field label="Rate / Litre (₹)">
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

// ── Incident Modal ─────────────────────────────────────────────────────────────
function IncidentModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading } = useGPS()
  const [incidentType, setIncidentType] = useState('')
  const [form, setForm] = useState({
    description: '', action_taken: '', breakdown_cause: '',
    rectification_needed: '', parts_status: 'to_order',
    damage_cause: '', what_needs_to_be_done: '', severity: 'medium',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!incidentType)           { toast.error('Select incident type'); return }
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
        damage_cause: form.damage_cause || null,
        what_needs_to_be_done: form.what_needs_to_be_done || null,
        location_lat: location?.lat || null,
        location_lng: location?.lng || null,
        location_address: location?.address || null,
        resolved: false,
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
          type: `incident_${incidentType}`,
          title: `${INCIDENT_OPTIONS.find(i => i.value === incidentType)?.label} — ${equipment.name}`,
          body: form.description,
          metadata: { equipment_id: equipment.id, equipment_name: equipment.name, incident_type: incidentType }
        }).catch(() => {})
      }
      toast.success('Incident reported')
      qc.invalidateQueries(['all_incidents', companyId])
      qc.invalidateQueries(['today_ops', companyId])
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
      <Field label="Incident Type" required>
        <select className={inp()} value={incidentType} onChange={e => setIncidentType(e.target.value)}>
          <option value="">Select what happened…</option>
          {INCIDENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
        </select>
        {incidentType && <p className="text-xs text-slate-500 mt-1">{INCIDENT_OPTIONS.find(o => o.value === incidentType)?.desc}</p>}
      </Field>

      {incidentType === 'breakdown' && (<>
        <Field label="Cause of breakdown" required>
          <VoiceTextarea value={form.breakdown_cause} onChange={v => set('breakdown_cause', v)} placeholder="What failed? e.g. hydraulic hose burst, engine overheating…" rows={3} />
        </Field>
        <Field label="What needs to be done?">
          <VoiceTextarea value={form.rectification_needed} onChange={v => set('rectification_needed', v)} placeholder="Repair / replacement needed?" rows={2} />
        </Field>
        <Field label="Additional Notes">
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Any other details…" rows={2} />
        </Field>
        <GPSField location={location} loading={gpsLoading} />
      </>)}

      {incidentType === 'unscheduled_maintenance' && (<>
        <Field label="What issue did you notice?" required>
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="e.g. oil leak, seal damaged…" rows={3} />
        </Field>
        <Field label="What needs to be done?">
          <VoiceTextarea value={form.what_needs_to_be_done} onChange={v => set('what_needs_to_be_done', v)} rows={2} />
        </Field>
      </>)}

      {incidentType === 'regular_maintenance' && (<>
        <Field label="Maintenance Description" required>
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="e.g. 250hr service, oil change…" rows={3} />
        </Field>
        <Field label="Action Taken">
          <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)} rows={2} />
        </Field>
      </>)}

      {incidentType === 'damage' && (<>
        <Field label="How did the damage happen?" required>
          <VoiceTextarea value={form.damage_cause} onChange={v => set('damage_cause', v)} placeholder="e.g. lorry hit the equipment…" rows={3} />
        </Field>
        <Field label="Describe the damage">
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} rows={2} />
        </Field>
        <Field label="What needs to be done?">
          <VoiceTextarea value={form.what_needs_to_be_done} onChange={v => set('what_needs_to_be_done', v)} rows={2} />
        </Field>
        <GPSField location={location} loading={gpsLoading} />
        <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-2.5 text-xs text-orange-300">⚠ Admin will be notified automatically</div>
      </>)}

      {incidentType === 'theft' && (<>
        <Field label="What was stolen?" required>
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Equipment, parts, tools, fuel…" rows={3} />
        </Field>
        <Field label="When was it noticed?">
          <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)} rows={2} />
        </Field>
        <GPSField location={location} loading={gpsLoading} />
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2.5 text-xs text-red-300">🚨 Admin will be notified immediately</div>
      </>)}

      {(incidentType === 'safety_issue' || incidentType === 'accident') && (<>
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
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} rows={3} />
        </Field>
        {incidentType === 'accident' && (
          <Field label="Immediate action taken">
            <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)} rows={2} />
          </Field>
        )}
        {incidentType === 'safety_issue' && (
          <Field label="What needs to be done?">
            <VoiceTextarea value={form.what_needs_to_be_done} onChange={v => set('what_needs_to_be_done', v)} rows={2} />
          </Field>
        )}
        <GPSField location={location} loading={gpsLoading} />
      </>)}

      {incidentType === 'near_miss' && (<>
        <Field label="What almost happened?" required>
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Describe the near miss…" rows={3} />
        </Field>
        <Field label="Action to prevent recurrence">
          <VoiceTextarea value={form.action_taken} onChange={v => set('action_taken', v)} rows={2} />
        </Field>
      </>)}

      {incidentType === 'other' && (
        <Field label="Description" required>
          <VoiceTextarea value={form.description} onChange={v => set('description', v)} placeholder="Describe the issue…" rows={4} />
        </Field>
      )}
    </Modal>
  )
}

// ── Equipment Operation Card ───────────────────────────────────────────────────
function EquipmentOpCard({ equipment, companyId }) {
  const [modal, setModal] = useState(null) // 'start' | 'end' | 'fuel' | 'incident'

  const { data: activeShift } = useQuery({
    queryKey: ['active_shift', equipment.id],
    queryFn: async () => {
      const { data } = await supabase.from('shifts').select('*')
        .eq('equipment_id', equipment.id).eq('status', 'open')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      return data
    },
  })

  const statusColors = {
    active:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-700/40', label: 'Active' },
    idle:        { bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-600',      label: 'Idle' },
    breakdown:   { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-700/40',     label: 'Breakdown' },
    maintenance: { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-700/40',  label: 'Maintenance' },
  }
  const st = statusColors[equipment.status] || statusColors.idle
  const mt = equipment.meter_type

  return (
    <>
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-100 text-sm leading-tight truncate">{equipment.name}</p>
            <p className="text-xs text-slate-500 truncate">{equipment.category}{equipment.sub_category ? ` · ${equipment.sub_category}` : ''}</p>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
        </div>

        {/* Meter + site */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5" />
            {Number(equipment.current_meter_reading || 0).toFixed(1)} {mt === 'kilometers' ? 'km' : 'hrs'}
          </span>
          {equipment.current_site_name && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />{equipment.current_site_name}
            </span>
          )}
        </div>

        {/* Active shift badge */}
        {activeShift && (
          <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-emerald-300 font-medium truncate">{activeShift.operator_name}</p>
              <p className="text-xs text-slate-500">Since {activeShift.start_time} · {activeShift.shift_type} shift</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          {!activeShift ? (
            <button onClick={() => setModal('start')}
              className="col-span-2 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors">
              <PlayCircle className="w-4 h-4" /> Start Shift
            </button>
          ) : (
            <button onClick={() => setModal('end')}
              className="col-span-2 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors">
              <StopCircle className="w-4 h-4" /> End Shift
            </button>
          )}
          <button onClick={() => setModal('fuel')}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-dark-700 border border-dark-600 hover:border-yellow-500 text-slate-300 text-xs transition-colors">
            <Fuel className="w-3.5 h-3.5 text-yellow-400" /> Fuel
          </button>
          <button onClick={() => setModal('incident')}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-dark-700 border border-dark-600 hover:border-orange-500 text-slate-300 text-xs transition-colors">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" /> Incident
          </button>
        </div>
      </div>

      {modal === 'start'    && <StartShiftModal equipment={equipment} companyId={companyId} onClose={() => setModal(null)} />}
      {modal === 'end'      && <EndShiftModal   equipment={equipment} shift={activeShift}   companyId={companyId} onClose={() => setModal(null)} />}
      {modal === 'fuel'     && <FuelModal       equipment={equipment} shift={activeShift}   companyId={companyId} onClose={() => setModal(null)} />}
      {modal === 'incident' && <IncidentModal   equipment={equipment} shift={activeShift}   companyId={companyId} onClose={() => setModal(null)} />}
    </>
  )
}

// ── Today Tab ─────────────────────────────────────────────────────────────────
function TodayTab({ companyId }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const { role, session } = useAuth()
  const isOperator = role === 'operator'

  // Identify the logged-in operator's HR record
  const { data: myEmployee } = useQuery({
    queryKey: ['my_employee_today', session?.user?.id, companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('user_id', session.user.id)
        .maybeSingle()
      return data
    },
    enabled: !!companyId && !!session?.user?.id && isOperator,
  })

  // Get only equipment IDs assigned to this operator
  const { data: myAssignments = [] } = useQuery({
    queryKey: ['my_equipment_assignments', myEmployee?.name, companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_assignments')
        .select('equipment_id')
        .eq('company_id', companyId)
        .eq('operator_name', myEmployee.name)
        .eq('is_active', true)
      return data || []
    },
    enabled: !!myEmployee?.name,
  })

  const myEquipmentIds = myAssignments.map(a => a.equipment_id)

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['equipment', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment').select('*')
        .eq('company_id', companyId).order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: todayShifts = [] } = useQuery({
    queryKey: ['today_ops', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('shifts').select('equipment_id, status, working_hours, shift_type, start_time')
        .eq('company_id', companyId).eq('shift_date', today())
      return data || []
    },
    enabled: !!companyId,
  })

  // Shift schedules for alert calculation
  const { data: shiftSchedules = [] } = useQuery({
    queryKey: ['all_shift_schedules', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_shift_schedule')
        .select('*').eq('company_id', companyId).eq('alert_enabled', true)
      return data || []
    },
    enabled: !!companyId,
    refetchInterval: 5 * 60 * 1000,   // re-check every 5 min
  })

  // ── Alert computation ────────────────────────────────────────────────────────
  const shiftAlerts = useMemo(() => {
    const alerts = []
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()

    shiftSchedules.forEach(sched => {
      if (sched.shift_count < 2) return   // single shift — no enforcement
      const eq = equipment.find(e => e.id === sched.equipment_id)
      if (!eq) return

      const openShift   = todayShifts.find(s => s.equipment_id === sched.equipment_id && s.status === 'open')
      const closedToday = todayShifts.filter(s => s.equipment_id === sched.equipment_id && s.status === 'closed')
      const grace = sched.grace_minutes || 30

      const toMins = (t) => {
        if (!t) return null
        const [h, m] = t.slice(0, 5).split(':').map(Number)
        return h * 60 + m
      }

      for (let i = 1; i <= sched.shift_count; i++) {
        const label = sched[`shift${i}_label`] || `Shift ${i}`
        const startMins = toMins(sched[`shift${i}_start`])
        const endMins   = toMins(sched[`shift${i}_end`])
        if (!startMins || !endMins) continue

        // Cross-midnight end: if end < start, end is next day
        const effectiveEnd = endMins <= startMins ? endMins + 24 * 60 : endMins

        const alreadyStarted = openShift ||
          closedToday.some(s => {
            const st = toMins(s.start_time)
            return st && Math.abs(st - startMins) < 90
          })

        // LATE START: current time > scheduled start + grace, shift not started yet
        if (!alreadyStarted && nowMins > startMins + grace && nowMins < effectiveEnd) {
          alerts.push({
            type: 'late_start',
            equipment: eq,
            label,
            scheduledStart: sched[`shift${i}_start`]?.slice(0, 5),
            minutesLate: nowMins - startMins,
          })
        }

        // OVERDUE END: shift open, current time > scheduled end + grace
        if (openShift && nowMins > effectiveEnd + grace) {
          alerts.push({
            type: 'overdue_end',
            equipment: eq,
            label,
            scheduledEnd: sched[`shift${i}_end`]?.slice(0, 5),
            minutesOver: nowMins - effectiveEnd,
          })
        }
      }
    })
    return alerts
  }, [shiftSchedules, equipment, todayShifts])

  const activeCount    = equipment.filter(e => e.status === 'active').length
  const idleCount      = equipment.filter(e => e.status === 'idle').length
  const breakdownCount = equipment.filter(e => e.status === 'breakdown').length
  const totalHrsToday  = todayShifts.reduce((s, sh) => s + Number(sh.working_hours || 0), 0)

  const filtered = equipment.filter(e =>
    // Operators see only their assigned equipment
    (!isOperator || !myEmployee || myEquipmentIds.includes(e.id)) &&
    (filterStatus === 'all' || e.status === filterStatus) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.registration_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.current_site_name || '').toLowerCase().includes(search.toLowerCase()))
  )

  const operatorNotLinked = isOperator && session?.user?.id && myEmployee === null

  return (
    <div className="flex flex-col h-full">
      {/* Operator account not linked warning */}
      {operatorNotLinked && (
        <div className="mx-4 mt-3 mb-1 bg-orange-900/20 border border-orange-700/40 rounded-xl p-3 flex gap-3 items-start shrink-0">
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-300">Account not linked</p>
            <p className="text-xs text-orange-400/80 mt-0.5">Ask your admin to link your login in HR → Employee → Compliance & Bank.</p>
          </div>
        </div>
      )}
      {/* Operator identity banner */}
      {isOperator && myEmployee && (
        <div className="mx-4 mt-3 mb-1 bg-primary-900/20 border border-primary-700/30 rounded-xl px-3 py-2 flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-full bg-primary-500/20 border border-primary-600/40 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-primary-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-primary-300">{myEmployee.name}</p>
            <p className="text-[10px] text-slate-500">Showing your assigned equipment only</p>
          </div>
        </div>
      )}
      {/* Shift alerts */}
      {shiftAlerts.length > 0 && (
        <div className="mx-4 mt-2 mb-1 space-y-1.5 shrink-0">
          {shiftAlerts.map((a, idx) => (
            <div key={idx}
              className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 border
                ${a.type === 'late_start'
                  ? 'bg-orange-900/20 border-orange-700/40'
                  : 'bg-red-900/20 border-red-700/40'}`}>
              <Bell className={`w-4 h-4 shrink-0 mt-0.5 ${a.type === 'late_start' ? 'text-orange-400' : 'text-red-400'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${a.type === 'late_start' ? 'text-orange-300' : 'text-red-300'}`}>
                  {a.type === 'late_start' ? '⏰ Shift Not Started' : '🔴 Shift Overdue to End'}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  <span className="font-medium text-slate-300">{a.equipment.name}</span>
                  {' · '}{a.label}
                  {a.type === 'late_start'
                    ? ` · Was scheduled at ${a.scheduledStart} (${a.minutesLate} min ago)`
                    : ` · Should have ended at ${a.scheduledEnd} (${a.minutesOver} min ago)`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary chips */}
      <div className="flex gap-2 px-4 py-2 overflow-x-auto shrink-0">
        {[
          { label: 'All', value: 'all', count: equipment.length, cls: 'border-dark-600 text-slate-400' },
          { label: 'Active', value: 'active', count: activeCount, cls: 'border-emerald-700/40 text-emerald-400 bg-emerald-500/10' },
          { label: 'Idle', value: 'idle', count: idleCount, cls: 'border-slate-600 text-slate-400' },
          { label: 'Breakdown', value: 'breakdown', count: breakdownCount, cls: 'border-red-700/40 text-red-400 bg-red-500/10' },
        ].map(chip => (
          <button key={chip.value} onClick={() => setFilterStatus(filterStatus === chip.value ? 'all' : chip.value)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all
              ${filterStatus === chip.value ? chip.cls : 'border-dark-600 text-slate-500'}`}>
            {chip.count} {chip.label}
          </button>
        ))}
        {totalHrsToday > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary-700/40 bg-primary-500/10 text-xs text-primary-400 font-medium">
            <Clock className="w-3 h-3" /> {totalHrsToday.toFixed(1)} hrs today
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-4 pb-2 shrink-0">
        <input className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
          placeholder="Search equipment or site…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <Truck className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">
              {equipment.length === 0 ? 'No equipment in fleet'
                : isOperator && myEmployee && myEquipmentIds.length === 0 ? 'No equipment assigned to you'
                : 'No equipment matches filter'}
            </p>
            {equipment.length === 0 && <p className="text-xs text-slate-500">Add equipment in the Fleet module first</p>}
            {isOperator && myEmployee && myEquipmentIds.length === 0 && (
              <p className="text-xs text-slate-500">Ask your admin to assign equipment to you in the Fleet module</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(eq => <EquipmentOpCard key={eq.id} equipment={eq} companyId={companyId} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shifts Tab ─────────────────────────────────────────────────────────────────
function ShiftsTab({ companyId }) {
  const [filterDate, setFilterDate] = useState(today())

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['all_shifts', companyId, filterDate],
    queryFn: async () => {
      let q = supabase.from('shifts').select('*, equipment(name, category, meter_type)')
        .eq('company_id', companyId).order('shift_date', { ascending: false }).order('start_time', { ascending: false })
      if (filterDate) q = q.eq('shift_date', filterDate)
      const { data, error } = await q.limit(100)
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const totalHours = shifts.reduce((sum, s) => sum + Number(s.working_hours || 0), 0)
  const openCount  = shifts.filter(s => s.status === 'open').length

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 shrink-0 flex items-center gap-3 flex-wrap">
        <input type="date" className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
          value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <button onClick={() => setFilterDate(today())} className="text-xs text-primary-400 hover:text-primary-300">Today</button>
        {shifts.length > 0 && (
          <span className="text-xs text-slate-400 ml-auto">
            {shifts.length} shifts · {totalHours.toFixed(1)} hrs{openCount > 0 ? ` · ${openCount} open` : ''}
          </span>
        )}
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
                    <p className="text-xs text-slate-500">{s.equipment?.category}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${s.status === 'open' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-700/40' : 'bg-dark-700 text-slate-400'}`}>
                    {s.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{s.operator_name || '—'}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.start_time}{s.end_time ? ` → ${s.end_time}` : ' (ongoing)'}</span>
                  <span>Opening: {s.start_meter ?? s.start_km ?? '—'} {s.equipment?.meter_type === 'kilometers' ? 'km' : 'hrs'}</span>
                  <span>Worked: <strong className="text-slate-200">{s.working_hours || 0} hrs</strong></span>
                  {s.idle_hours > 0      && <span>Idle: {s.idle_hours} hrs</span>}
                  {s.breakdown_hours > 0 && <span className="text-red-400">Breakdown: {s.breakdown_hours} hrs</span>}
                </div>
                {s.meter_discrepancy && (
                  <p className="text-xs text-orange-400 mt-1">⚠ Meter corrected · {s.meter_discrepancy_reason}</p>
                )}
                {s.site_incharge_name && (
                  <p className="text-xs text-slate-500 mt-1">Incharge: {s.site_incharge_name}</p>
                )}
                {s.location_address && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{s.location_address.slice(0, 70)}
                  </p>
                )}
                {s.notes && <p className="text-xs text-slate-400 mt-1 italic">📝 {s.notes}</p>}
                {s.work_done && (
                  <div className="mt-2 bg-dark-700 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] font-medium text-slate-500 mb-0.5">Work Done</p>
                    <p className="text-xs text-slate-300">{s.work_done}</p>
                  </div>
                )}
                {s.handover_notes && (
                  <div className="mt-1.5 bg-yellow-900/20 border border-yellow-700/20 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] font-medium text-yellow-500 mb-0.5">Handover to Next Shift</p>
                    <p className="text-xs text-yellow-200/80">{s.handover_notes}</p>
                  </div>
                )}
                {s.end_location_address && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0" />End: {s.end_location_address.slice(0, 60)}
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
  const [filterDate, setFilterDate] = useState('')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['all_fuel', companyId, filterDate],
    queryFn: async () => {
      let q = supabase.from('shift_fuel_entries')
        .select('*, equipment(name, category)').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(100)
      if (filterDate) {
        const start = `${filterDate}T00:00:00`
        const end   = `${filterDate}T23:59:59`
        q = q.gte('created_at', start).lte('created_at', end)
      }
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const totalLitres = entries.reduce((sum, e) => sum + Number(e.quantity_liters || 0), 0)
  const totalAmount = entries.reduce((sum, e) => sum + Number(e.total_amount || 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 shrink-0 flex items-center gap-3 flex-wrap">
        <input type="date" className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
          value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        {filterDate && <button onClick={() => setFilterDate('')} className="text-xs text-slate-400 hover:text-slate-200">Clear</button>}
        {entries.length > 0 && (
          <div className="ml-auto flex gap-2">
            <div className="bg-dark-700 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-400">Fuel </span><span className="font-bold text-yellow-400">{totalLitres.toFixed(0)} L</span>
            </div>
            {totalAmount > 0 && (
              <div className="bg-dark-700 rounded-lg px-3 py-1.5 text-xs">
                <span className="text-slate-400">Amount </span><span className="font-bold text-primary-400">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Fuel className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">No fuel entries{filterDate ? ' for this date' : ' yet'}</p>
            <p className="text-xs text-slate-500">Log fuel from the Today tab → equipment card</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-100 text-sm truncate">{e.equipment?.name}</p>
                    <p className="text-xs text-slate-500">{e.equipment?.category}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-yellow-400">{e.quantity_liters} L</p>
                    {e.total_amount && <p className="text-xs text-slate-400">₹{Number(e.total_amount).toLocaleString('en-IN')}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  {e.meter_at_filling  && <span>Meter: {e.meter_at_filling} hrs</span>}
                  {e.km_at_filling     && <span>KM: {e.km_at_filling}</span>}
                  {e.delivered_by_name && <span>By: {e.delivered_by_name}</span>}
                  {e.vendor_name       && <span>Vendor: {e.vendor_name}</span>}
                  {e.invoice_number    && <span>Invoice: #{e.invoice_number}</span>}
                  {e.rate_per_liter    && <span>Rate: ₹{e.rate_per_liter}/L</span>}
                </div>
                {e.location_address && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{e.location_address.slice(0, 70)}
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
  const [showResolved, setShowResolved] = useState(false)

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['all_incidents', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('shift_incidents')
        .select('*, equipment(name, category)').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const resolveIncident = async (id) => {
    const { error } = await supabase.from('shift_incidents')
      .update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error('Failed to resolve'); return }
    toast.success('Marked as resolved')
    qc.invalidateQueries(['all_incidents', companyId])
  }

  const openCount     = incidents.filter(i => !i.resolved).length
  const displayed     = showResolved ? incidents : incidents.filter(i => !i.resolved)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 shrink-0 flex items-center gap-3">
        <span className="text-xs text-slate-400">{openCount} open · {incidents.length - openCount} resolved</span>
        <button onClick={() => setShowResolved(v => !v)}
          className="ml-auto text-xs text-primary-400 hover:text-primary-300">
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
            <p className="text-slate-400">No open incidents</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(i => {
              const opt = INCIDENT_OPTIONS.find(t => t.value === i.incident_type)
              return (
                <div key={i.id} className={`bg-dark-800 border rounded-xl p-3 ${i.resolved ? 'border-dark-700 opacity-60' : 'border-orange-700/30'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 text-sm truncate">{i.equipment?.name}</p>
                      <p className="text-xs text-slate-400">{opt?.icon} {opt?.label || i.incident_type}{i.severity ? ` · ${i.severity}` : ''}</p>
                    </div>
                    {!i.resolved && (
                      <button onClick={() => resolveIncident(i.id)}
                        className="shrink-0 flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-700/40 rounded-lg px-2 py-1">
                        <CheckCircle className="w-3 h-3" /> Resolve
                      </button>
                    )}
                    {i.resolved && <span className="shrink-0 text-xs text-slate-500">✓ Resolved</span>}
                  </div>
                  {i.description && <p className="text-xs text-slate-300 mt-1">{i.description}</p>}
                  {i.breakdown_cause      && <p className="text-xs text-slate-400 mt-0.5">Cause: {i.breakdown_cause}</p>}
                  {i.rectification_needed && <p className="text-xs text-slate-400 mt-0.5">Fix needed: {i.rectification_needed}</p>}
                  {i.damage_cause         && <p className="text-xs text-slate-400 mt-0.5">How: {i.damage_cause}</p>}
                  {i.what_needs_to_be_done && <p className="text-xs text-slate-400 mt-0.5">Action: {i.what_needs_to_be_done}</p>}
                  {i.location_address && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" />{i.location_address.slice(0, 60)}
                    </p>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OperationsPage() {
  const { companyId } = useAuth()
  const [activeTab, setActiveTab] = useState('today')

  const tabs = [
    { id: 'today',     label: "Today's Ops", icon: Activity },
    { id: 'shifts',    label: 'Shifts',      icon: Clock },
    { id: 'fuel',      label: 'Fuel',        icon: Fuel },
    { id: 'incidents', label: 'Incidents',   icon: AlertTriangle },
  ]

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-lg font-bold text-slate-100">Daily Operations</h1>
        <p className="text-xs text-slate-400">Shifts · Fuel · Incidents · {format(new Date(), 'dd MMM yyyy')}</p>
      </div>
      <div className="flex border-b border-dark-700 shrink-0 px-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors
                ${activeTab === t.id ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          )
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'today'     && <TodayTab     companyId={companyId} />}
        {activeTab === 'shifts'    && <ShiftsTab    companyId={companyId} />}
        {activeTab === 'fuel'      && <FuelTab      companyId={companyId} />}
        {activeTab === 'incidents' && <IncidentsTab companyId={companyId} />}
      </div>
    </div>
  )
}
