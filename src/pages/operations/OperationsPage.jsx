import { useState, useEffect, useRef, useMemo } from 'react'
import { VendorPicker } from '../../components/shared/EntityPicker'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { INCIDENT_SEVERITY } from '../../lib/equipmentTypes'
import {
  Truck, Plus, Fuel, AlertTriangle, X, Loader2, CheckCircle,
  Gauge, User, Mic, MicOff, MapPin, Camera,
  Clock, Activity, PlayCircle, StopCircle, ChevronRight, Lock, Bell,
  ExternalLink, ZoomIn, Edit2,
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

  // Project comes directly from equipment.current_project_id (set in Fleet → Deploy)
  const [activeDeployment, setActiveDeployment] = useState(null)
  useEffect(() => {
    const pid = equipment.current_project_id
    const cid = equipment.current_client_id
    if (!pid) return
    Promise.all([
      supabase.from('projects').select('id, project_name, project_code').eq('id', pid).single(),
      cid ? supabase.from('clients').select('id, name').eq('id', cid).single() : Promise.resolve({ data: null }),
    ]).then(([{ data: proj }, { data: client }]) => {
      if (proj) setActiveDeployment({ project_id: pid, client_id: cid, projects: proj, clients: client })
    })
  }, [equipment.current_project_id, equipment.current_client_id])

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
        // Auto-mapped from equipment's current deployment (set in Fleet → Deploy)
        project_id: equipment.current_project_id || null,
        client_id:  equipment.current_client_id  || null,
        shift_date: form.shift_date,
        shift_type: form.shift_type,
        operator_name: form.operator_name,
        operator_id: myEmployee?.id || null,
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
        {/* Active deployment info — shows which project this shift will be logged against */}
        {activeDeployment ? (
          <div className="bg-primary-900/20 border border-primary-700/30 rounded-lg px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-primary-500 uppercase font-bold tracking-wide">Project</p>
              <p className="text-xs font-semibold text-primary-300 truncate">{activeDeployment.projects?.project_name || '—'}</p>
              {activeDeployment.clients?.name && <p className="text-[10px] text-slate-500 truncate">{activeDeployment.clients.name}</p>}
            </div>
            <CheckCircle className="w-4 h-4 text-primary-500 shrink-0" />
          </div>
        ) : equipment.current_site_name ? (
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs text-slate-400">
            📍 {equipment.current_site_name}
          </div>
        ) : null}
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
// ── Auto-attendance helper ─────────────────────────────────────────────────────
async function autoMarkAttendance({ companyId, shiftId, shiftDate, startTime, endTime, operatorName, siteInchargeName, otThreshold }) {
  // Derive hours (cross-midnight safe)
  const calcHrs = (s, e) => {
    if (!s || !e) return 0
    const [sh, sm] = s.split(':').map(Number)
    const [eh, em] = e.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60
    return Math.round(mins / 60 * 10) / 10
  }
  const deriveStatus = (hrs) => hrs <= 0 ? null : hrs < 4 ? 'half_day' : 'present'

  const threshold = otThreshold || 12
  const hours     = calcHrs(startTime, endTime)
  const status    = deriveStatus(hours)
  if (!status) return

  const otHours = hours > threshold ? Math.round((hours - threshold) * 10) / 10 : 0

  // Look up employees by name (case-insensitive)
  const names = [operatorName, siteInchargeName].filter(Boolean)
  if (names.length === 0) return

  const { data: employees } = await supabase.from('hr_employees')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .in('name', names)

  for (const emp of (employees || [])) {
    const { data: existing } = await supabase.from('hr_attendance')
      .select('id, source')
      .eq('employee_id', emp.id)
      .eq('attendance_date', shiftDate)
      .single()

    // Never overwrite a manual entry
    if (existing && existing.source !== 'shift_auto') continue

    const payload = {
      status,
      shift_start_time: startTime,
      shift_end_time:   endTime,
      ot_hours:         otHours,
      source:           'shift_auto',
      shift_id:         shiftId,
    }

    if (existing) {
      await supabase.from('hr_attendance').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('hr_attendance').insert({
        company_id:      companyId,
        employee_id:     emp.id,
        attendance_date: shiftDate,
        ...payload,
      })
    }
  }
}

function EndShiftModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const { location, loading: gpsLoading } = useGPS()   // auto-fires on mount

  // Fetch company OT threshold
  const { data: company } = useQuery({
    queryKey: ['company_settings', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('ot_threshold_hours').eq('id', companyId).single()
      return data
    },
    staleTime: 60000,
  })
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

      // Auto-mark attendance for operator + site incharge
      await autoMarkAttendance({
        companyId,
        shiftId:           shift.id,
        shiftDate:         shift.shift_date,
        startTime:         shift.start_time,
        endTime:           form.end_time,
        operatorName:      shift.operator_name,
        siteInchargeName:  shift.site_incharge_name,
        otThreshold:       company?.ot_threshold_hours ?? 12,
      }).catch(() => {})   // non-blocking — shift save is primary

      toast.success('Shift ended — attendance auto-marked')
      qc.invalidateQueries(['equipment', companyId])
      qc.invalidateQueries(['active_shift', equipment.id])
      qc.invalidateQueries(['today_ops', companyId])
      qc.invalidateQueries(['hr_attendance', companyId])
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
          <VendorPicker companyId={companyId} value={form.vendor_name} onChange={n => set('vendor_name', n)} onSelect={v => set('vendor_name', v.name)} placeholder="Fuel station / supplier" className={inp()} />
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
    if (!incidentType) { toast.error('Select incident type'); return }
    // Validate the primary description field for each incident type
    const primaryField = incidentType === 'breakdown' ? form.breakdown_cause
      : incidentType === 'damage' ? form.damage_cause
      : form.description
    if (!primaryField?.trim()) { toast.error('Please fill in the required description'); return }
    setSaving(true)
    try {
      // Use primary field as description if form.description is empty
      const descriptionValue = form.description?.trim() || primaryField?.trim() || ''

      const { error } = await supabase.from('shift_incidents').insert({
        company_id: companyId,
        shift_id: shift?.id || null,
        equipment_id: equipment.id,
        incident_type: incidentType,
        severity: ['safety_issue', 'accident', 'near_miss'].includes(incidentType) ? form.severity : null,
        description: descriptionValue,
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

      // Equipment status update
      if (incidentType === 'breakdown') {
        await supabase.from('equipment').update({ status: 'breakdown' }).eq('id', equipment.id)
      } else if (['regular_maintenance', 'unscheduled_maintenance'].includes(incidentType)) {
        await supabase.from('equipment').update({ status: 'maintenance' }).eq('id', equipment.id)
      }

      // Notification insert — fire and forget, completely non-blocking
      // Using an IIFE so errors never surface to the outer try/catch
      if (companyId && ['damage', 'safety_issue', 'theft', 'accident', 'breakdown'].includes(incidentType)) {
        ;(async () => {
          try {
            const label = INCIDENT_OPTIONS.find(i => i.value === incidentType)?.label ?? incidentType
            await supabase.from('notifications').insert({
              company_id: companyId,
              type: `incident_${incidentType}`,
              title: `${label} — ${equipment.name}`,
              body: descriptionValue,
              metadata: { equipment_id: equipment.id, equipment_name: equipment.name, incident_type: incidentType },
            })
          } catch (_) { /* Notification failure never blocks incident save */ }
        })()
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

// ── Photo Lightbox ─────────────────────────────────────────────────────────────
function PhotoLightbox({ url, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/60 hover:text-white z-10" onClick={onClose}>
        <X className="w-7 h-7" />
      </button>
      <img src={url} alt="Full size" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
    </div>
  )
}

// ── Photo Thumbnail ─────────────────────────────────────────────────────────────
function PhotoThumb({ url, label, onView }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 p-3 bg-dark-700 rounded-xl border border-dashed border-dark-500 aspect-video">
        <Camera className="w-5 h-5 text-slate-600" />
        <p className="text-[10px] text-slate-600 text-center leading-tight">{label}</p>
      </div>
    )
  }
  return (
    <button onClick={() => onView(url)} className="relative group rounded-xl overflow-hidden border border-dark-600 aspect-video w-full">
      <img src={url} alt={label} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
        <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <p className="text-[10px] text-white/80 font-medium">{label}</p>
      </div>
    </button>
  )
}

// ── Shift Detail Modal ─────────────────────────────────────────────────────────
function ShiftDetailModal({ shift, onClose, isAdmin, onEdit }) {
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const mt = shift.equipment?.meter_type

  const { data: fuelEntries = [] } = useQuery({
    queryKey: ['shift_fuel_detail', shift.id],
    queryFn: async () => {
      const { data } = await supabase.from('shift_fuel_entries')
        .select('*').eq('shift_id', shift.id).order('created_at')
      return data || []
    },
  })

  const { data: incidents = [] } = useQuery({
    queryKey: ['shift_incidents_detail', shift.id],
    queryFn: async () => {
      const { data } = await supabase.from('shift_incidents')
        .select('*').eq('shift_id', shift.id).order('created_at')
      return data || []
    },
  })

  const totalFuel    = fuelEntries.reduce((s, e) => s + Number(e.quantity_liters || 0), 0)
  const totalFuelAmt = fuelEntries.reduce((s, e) => s + Number(e.total_amount    || 0), 0)
  const meterDiff    = shift.end_meter && shift.start_meter
    ? (Number(shift.end_meter) - Number(shift.start_meter)).toFixed(1) : null

  const shiftBadge = ({
    day:    { label: '☀️ Day',    cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-700/40' },
    night:  { label: '🌙 Night',  cls: 'bg-blue-500/10   text-blue-400   border-blue-700/40'   },
    double: { label: '🔄 Double', cls: 'bg-purple-500/10 text-purple-400 border-purple-700/40' },
  }[shift.shift_type]) || { label: shift.shift_type, cls: 'bg-dark-700 text-slate-400 border-dark-600' }

  const mapsUrl    = shift.location_lat      ? `https://maps.google.com/?q=${shift.location_lat},${shift.location_lng}`            : null
  const endMapsUrl = shift.end_location_lat  ? `https://maps.google.com/?q=${shift.end_location_lat},${shift.end_location_lng}`    : null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-lg bg-dark-900 sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh]">
          {/* Header */}
          <div className="flex items-start justify-between px-4 py-3 border-b border-dark-700 shrink-0 bg-dark-800 sm:rounded-t-2xl">
            <div className="flex-1 min-w-0 pr-2">
              <p className="font-bold text-slate-100 truncate">{shift.equipment?.name || 'Shift Detail'}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-slate-400">{format(new Date(shift.shift_date), 'dd MMM yyyy')}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${shiftBadge.cls}`}>{shiftBadge.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${shift.status === 'open' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40' : 'bg-dark-700 text-slate-400 border-dark-600'}`}>
                  {shift.status === 'open' ? '🟢 Active' : '✓ Closed'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isAdmin && onEdit && (
                <button onClick={() => onEdit(shift)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500/10 border border-primary-500/30 text-primary-400 hover:bg-primary-500/20 text-xs font-medium transition-all">
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">

            {/* People */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Operator</p>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-primary-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 leading-tight truncate">{shift.operator_name || '—'}</p>
                    {shift._operator?.designation && (
                      <p className="text-[10px] text-slate-500 truncate">{shift._operator.designation}</p>
                    )}
                    {shift._operator?.employee_number && (
                      <p className="text-[10px] text-primary-400 font-mono">{shift._operator.employee_number}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Site Incharge</p>
                <p className="text-sm font-semibold text-slate-100 mt-1">{shift.site_incharge_name || '—'}</p>
              </div>
            </div>

            {/* Timings */}
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Timings</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-slate-500">Start</p>
                  <p className="text-2xl font-mono font-black text-emerald-400">{shift.start_time || '—'}</p>
                </div>
                <div className="text-slate-600 text-xl font-bold">→</div>
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-slate-500">End</p>
                  <p className="text-2xl font-mono font-black text-red-400">
                    {shift.end_time || (shift.status === 'open' ? '...' : '—')}
                  </p>
                </div>
              </div>
            </div>

            {/* Hours */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-emerald-500 uppercase">Working</p>
                <p className="text-2xl font-black text-emerald-400">{shift.working_hours || 0}</p>
                <p className="text-[10px] text-slate-500">hrs</p>
              </div>
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-yellow-500 uppercase">Idle</p>
                <p className="text-2xl font-black text-yellow-400">{shift.idle_hours || 0}</p>
                <p className="text-[10px] text-slate-500">hrs</p>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-red-500 uppercase">Breakdown</p>
                <p className="text-2xl font-black text-red-400">{shift.breakdown_hours || 0}</p>
                <p className="text-[10px] text-slate-500">hrs</p>
              </div>
            </div>

            {/* Meter readings */}
            {(shift.start_meter != null || shift.end_meter != null || shift.start_km != null) && (
              <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Meter Readings</p>
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[10px] text-slate-500">Opening</p>
                    <p className="text-base font-bold text-slate-100">
                      {shift.start_meter ?? shift.start_km ?? '—'} <span className="text-xs font-normal text-slate-500">{mt === 'kilometers' ? 'km' : 'hrs'}</span>
                    </p>
                  </div>
                  {meterDiff && <>
                    <div className="text-slate-600 text-lg font-bold">→</div>
                    <div>
                      <p className="text-[10px] text-slate-500">Closing</p>
                      <p className="text-base font-bold text-slate-100">
                        {shift.end_meter ?? shift.end_km ?? '—'} <span className="text-xs font-normal text-slate-500">{mt === 'kilometers' ? 'km' : 'hrs'}</span>
                      </p>
                    </div>
                    <div className="ml-auto bg-primary-900/30 border border-primary-700/30 rounded-lg px-3 py-1.5 text-center shrink-0">
                      <p className="text-[10px] text-primary-400">Diff</p>
                      <p className="text-sm font-bold text-primary-300">+{meterDiff}</p>
                    </div>
                  </>}
                </div>
                {shift.meter_discrepancy && (
                  <div className="mt-2 bg-orange-900/20 border border-orange-700/30 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-orange-400 font-semibold">⚠ Meter was corrected</p>
                    {shift.meter_previous_closing && <p className="text-xs text-slate-400 mt-0.5">Previous closing: {shift.meter_previous_closing}</p>}
                    {shift.meter_discrepancy_reason && <p className="text-xs text-slate-400 mt-0.5">Reason: {shift.meter_discrepancy_reason}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Photos */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Photos</p>
              <div className="grid grid-cols-3 gap-2">
                <PhotoThumb url={shift.meter_photo_url}     label="Opening Meter" onView={setLightboxUrl} />
                <PhotoThumb url={shift.meter_photo_url_end} label="Closing Meter" onView={setLightboxUrl} />
                <PhotoThumb url={shift.logsheet_photo_url}  label="Log Sheet"     onView={setLightboxUrl} />
              </div>
            </div>

            {/* Work done */}
            {shift.work_done && (
              <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Work Done</p>
                <p className="text-sm text-slate-200 leading-relaxed">{shift.work_done}</p>
              </div>
            )}

            {/* Handover */}
            {shift.handover_notes && (
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-3">
                <p className="text-[10px] text-yellow-500 uppercase tracking-wide mb-1.5">Handover to Next Shift</p>
                <p className="text-sm text-yellow-200/90 leading-relaxed">{shift.handover_notes}</p>
              </div>
            )}

            {/* Notes */}
            {shift.notes && (
              <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-slate-300 italic">{shift.notes}</p>
              </div>
            )}

            {/* Locations */}
            {(shift.location_address || shift.end_location_address) && (
              <div className="bg-dark-800 rounded-xl p-3 border border-dark-700 space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">GPS Locations</p>
                {shift.location_address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-500">Shift Start</p>
                      <p className="text-xs text-slate-300">{shift.location_address}</p>
                    </div>
                    {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="shrink-0 text-primary-400 hover:text-primary-300"><ExternalLink className="w-3.5 h-3.5" /></a>}
                  </div>
                )}
                {shift.end_location_address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-500">Shift End</p>
                      <p className="text-xs text-slate-300">{shift.end_location_address}</p>
                    </div>
                    {endMapsUrl && <a href={endMapsUrl} target="_blank" rel="noreferrer" className="shrink-0 text-primary-400 hover:text-primary-300"><ExternalLink className="w-3.5 h-3.5" /></a>}
                  </div>
                )}
              </div>
            )}

            {/* Fuel entries for this shift */}
            {fuelEntries.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
                  Fuel This Shift · <span className="text-yellow-400 font-bold">{totalFuel.toFixed(0)} L</span>
                  {totalFuelAmt > 0 && <span className="text-slate-500"> · ₹{totalFuelAmt.toLocaleString('en-IN')}</span>}
                </p>
                <div className="space-y-2">
                  {fuelEntries.map(fe => (
                    <div key={fe.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3 flex items-center gap-3">
                      {fe.fuel_photo_url
                        ? <button onClick={() => setLightboxUrl(fe.fuel_photo_url)} className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-dark-600">
                            <img src={fe.fuel_photo_url} alt="Fuel" className="w-full h-full object-cover" />
                          </button>
                        : <div className="w-12 h-12 rounded-lg bg-dark-700 border border-dark-600 flex items-center justify-center shrink-0">
                            <Fuel className="w-5 h-5 text-yellow-400" />
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-yellow-400 text-sm">{fe.quantity_liters} L {fe.total_amount ? `· ₹${Number(fe.total_amount).toLocaleString('en-IN')}` : ''}</p>
                        <p className="text-xs text-slate-400">{[fe.delivered_by_name, fe.vendor_name].filter(Boolean).join(' · ')}{fe.invoice_number ? ` · #${fe.invoice_number}` : ''}</p>
                        <p className="text-[10px] text-slate-600">{format(new Date(fe.created_at), 'HH:mm')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Incidents for this shift */}
            {incidents.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Incidents This Shift</p>
                <div className="space-y-2">
                  {incidents.map(inc => {
                    const opt = INCIDENT_OPTIONS.find(o => o.value === inc.incident_type)
                    return (
                      <div key={inc.id} className="bg-dark-800 border border-orange-700/30 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-orange-300">{opt?.icon} {opt?.label || inc.incident_type}</p>
                            {inc.description && <p className="text-xs text-slate-300 mt-1">{inc.description}</p>}
                            {inc.breakdown_cause && <p className="text-xs text-slate-400 mt-0.5">Cause: {inc.breakdown_cause}</p>}
                          </div>
                          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${inc.resolved ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                            {inc.resolved ? '✓ Resolved' : 'Open'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-700 text-center pb-2">ID: {shift.id}</p>
          </div>
        </div>
      </div>
      {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  )
}

// ── Fuel Detail Modal ──────────────────────────────────────────────────────────
function FuelDetailModal({ entry, onClose }) {
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const mt = entry.equipment?.meter_type
  const mapsUrl = entry.location_lat ? `https://maps.google.com/?q=${entry.location_lat},${entry.location_lng}` : null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-md bg-dark-900 sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">
          <div className="flex items-start justify-between px-4 py-3 border-b border-dark-700 shrink-0 bg-dark-800 sm:rounded-t-2xl">
            <div>
              <p className="font-bold text-slate-100">{entry.equipment?.name || 'Fuel Entry'}</p>
              <p className="text-xs text-slate-400">{format(new Date(entry.created_at), 'dd MMM yyyy, HH:mm')}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 shrink-0"><X className="w-5 h-5" /></button>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
            {/* Big fuel stat */}
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-2xl p-4 flex items-center gap-4">
              <Fuel className="w-10 h-10 text-yellow-400 shrink-0" />
              <div>
                <p className="text-3xl font-black text-yellow-400">{entry.quantity_liters} L</p>
                {entry.total_amount && <p className="text-base text-slate-200 font-bold">₹{Number(entry.total_amount).toLocaleString('en-IN')}</p>}
                {entry.rate_per_liter && <p className="text-xs text-slate-500">@ ₹{entry.rate_per_liter} / litre</p>}
              </div>
            </div>

            {/* Photo */}
            <PhotoThumb url={entry.fuel_photo_url} label="Fuel Delivery Photo" onView={setLightboxUrl} />

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-2">
              {entry.delivered_by_name && (
                <div className="bg-dark-800 rounded-xl p-2.5 border border-dark-700">
                  <p className="text-[10px] text-slate-500">Delivered By</p>
                  <p className="text-sm text-slate-200 font-medium mt-0.5">{entry.delivered_by_name}</p>
                </div>
              )}
              {entry.vendor_name && (
                <div className="bg-dark-800 rounded-xl p-2.5 border border-dark-700">
                  <p className="text-[10px] text-slate-500">Vendor</p>
                  <p className="text-sm text-slate-200 font-medium mt-0.5">{entry.vendor_name}</p>
                </div>
              )}
              {entry.invoice_number && (
                <div className="bg-dark-800 rounded-xl p-2.5 border border-dark-700">
                  <p className="text-[10px] text-slate-500">Invoice No.</p>
                  <p className="text-sm text-slate-200 font-medium mt-0.5">#{entry.invoice_number}</p>
                </div>
              )}
              {entry.meter_at_filling != null && (
                <div className="bg-dark-800 rounded-xl p-2.5 border border-dark-700">
                  <p className="text-[10px] text-slate-500">Meter at Filling</p>
                  <p className="text-sm text-slate-200 font-medium mt-0.5">{entry.meter_at_filling} {mt === 'kilometers' ? 'km' : 'hrs'}</p>
                </div>
              )}
              {entry.km_at_filling != null && (
                <div className="bg-dark-800 rounded-xl p-2.5 border border-dark-700">
                  <p className="text-[10px] text-slate-500">Odometer</p>
                  <p className="text-sm text-slate-200 font-medium mt-0.5">{entry.km_at_filling} km</p>
                </div>
              )}
            </div>

            {entry.notes && (
              <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
                <p className="text-[10px] text-slate-500 mb-1">Notes</p>
                <p className="text-sm text-slate-300">{entry.notes}</p>
              </div>
            )}

            {entry.location_address && (
              <div className="bg-dark-800 rounded-xl p-3 border border-dark-700 flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500">Filling Location</p>
                  <p className="text-xs text-slate-300">{entry.location_address}</p>
                </div>
                {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="shrink-0 text-primary-400 hover:text-primary-300"><ExternalLink className="w-3.5 h-3.5" /></a>}
              </div>
            )}
          </div>
        </div>
      </div>
      {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  )
}

// ── Incident Detail Modal ──────────────────────────────────────────────────────
function IncidentDetailModal({ incident, onClose, onResolve }) {
  const opt = INCIDENT_OPTIONS.find(o => o.value === incident.incident_type)
  const mapsUrl = incident.location_lat ? `https://maps.google.com/?q=${incident.location_lat},${incident.location_lng}` : null
  const severityColor = { high: 'text-red-400', medium: 'text-orange-400', low: 'text-yellow-400' }[incident.severity] || 'text-slate-400'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-dark-900 sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">
        <div className="flex items-start justify-between px-4 py-3 border-b border-dark-700 shrink-0 bg-dark-800 sm:rounded-t-2xl">
          <div>
            <p className="font-bold text-slate-100">{incident.equipment?.name || 'Incident'}</p>
            <p className="text-xs text-slate-400">{format(new Date(incident.created_at), 'dd MMM yyyy, HH:mm')}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          {/* Type banner */}
          <div className="bg-orange-900/20 border border-orange-700/30 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-3xl mb-1">{opt?.icon}</p>
              <p className="text-lg font-bold text-orange-300">{opt?.label || incident.incident_type}</p>
              {incident.severity && <p className={`text-xs font-bold mt-0.5 ${severityColor}`}>{incident.severity.toUpperCase()} SEVERITY</p>}
            </div>
            <span className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${incident.resolved ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40' : 'bg-red-900/30 text-red-400 border-red-700/40'}`}>
              {incident.resolved ? '✓ Resolved' : '● Open'}
            </span>
          </div>

          {incident.description && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 mb-1 uppercase">Description</p>
              <p className="text-sm text-slate-200 leading-relaxed">{incident.description}</p>
            </div>
          )}
          {incident.breakdown_cause && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 mb-1 uppercase">Cause</p>
              <p className="text-sm text-slate-200">{incident.breakdown_cause}</p>
            </div>
          )}
          {incident.rectification_needed && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 mb-1 uppercase">Rectification Needed</p>
              <p className="text-sm text-slate-200">{incident.rectification_needed}</p>
            </div>
          )}
          {incident.parts_status && incident.incident_type === 'breakdown' && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 mb-1 uppercase">Parts Status</p>
              <p className="text-sm text-slate-200 capitalize">{incident.parts_status.replace(/_/g, ' ')}</p>
            </div>
          )}
          {incident.damage_cause && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 mb-1 uppercase">How it Happened</p>
              <p className="text-sm text-slate-200">{incident.damage_cause}</p>
            </div>
          )}
          {incident.what_needs_to_be_done && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 mb-1 uppercase">Action Required</p>
              <p className="text-sm text-slate-200">{incident.what_needs_to_be_done}</p>
            </div>
          )}
          {incident.action_taken && (
            <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3">
              <p className="text-[10px] text-emerald-500 mb-1 uppercase">Action Taken</p>
              <p className="text-sm text-emerald-200">{incident.action_taken}</p>
            </div>
          )}
          {incident.location_address && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700 flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500">Location</p>
                <p className="text-xs text-slate-300">{incident.location_address}</p>
              </div>
              {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="shrink-0 text-primary-400"><ExternalLink className="w-3.5 h-3.5" /></a>}
            </div>
          )}
          {incident.resolved && incident.resolved_at && (
            <p className="text-xs text-emerald-600 text-center">Resolved {format(new Date(incident.resolved_at), 'dd MMM yyyy, HH:mm')}</p>
          )}
        </div>

        {!incident.resolved && onResolve && (
          <div className="px-4 py-3 border-t border-dark-700 shrink-0">
            <button onClick={() => { onResolve(incident.id); onClose() }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
              <CheckCircle className="w-4 h-4" /> Mark as Resolved
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Edit Shift Modal (Admin only) ─────────────────────────────────────────────
function EditShiftModal({ shift, companyId, onClose, onSaved }) {
  const qc = useQueryClient()
  const mt = shift.equipment?.meter_type

  const { data: empList = [] } = useQuery({
    queryKey: ['hr_emp_names', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id, name, designation, employee_number')
        .eq('company_id', companyId).eq('is_active', true).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const [form, setForm] = useState({
    shift_date:         shift.shift_date || '',
    shift_type:         shift.shift_type || 'day',
    operator_name:      shift.operator_name || '',
    site_incharge_name: shift.site_incharge_name || '',
    start_time:         shift.start_time || '',
    end_time:           shift.end_time   || '',
    start_meter:        shift.start_meter != null ? String(shift.start_meter) : '',
    end_meter:          shift.end_meter   != null ? String(shift.end_meter)   : '',
    start_km:           shift.start_km    != null ? String(shift.start_km)    : '',
    end_km:             shift.end_km      != null ? String(shift.end_km)      : '',
    working_hours:      shift.working_hours   != null ? String(shift.working_hours)   : '',
    idle_hours:         shift.idle_hours      != null ? String(shift.idle_hours)      : '0',
    breakdown_hours:    shift.breakdown_hours != null ? String(shift.breakdown_hours) : '0',
    notes:              shift.notes          || '',
    work_done:          shift.work_done      || '',
    handover_notes:     shift.handover_notes || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.operator_name.trim()) { toast.error('Operator name required'); return }
    setSaving(true)
    try {
      // Resolve operator_id if name changed
      let newOperatorId = shift.operator_id
      if (form.operator_name !== shift.operator_name) {
        const emp = empList.find(e => e.name === form.operator_name)
        newOperatorId = emp?.id || null
      }
      const payload = {
        shift_date:         form.shift_date,
        shift_type:         form.shift_type,
        operator_name:      form.operator_name.trim(),
        operator_id:        newOperatorId,
        site_incharge_name: form.site_incharge_name || null,
        start_time:         form.start_time || null,
        end_time:           form.end_time   || null,
        start_meter:        form.start_meter   ? Number(form.start_meter)   : null,
        end_meter:          form.end_meter     ? Number(form.end_meter)     : null,
        start_km:           form.start_km      ? Number(form.start_km)      : null,
        end_km:             form.end_km        ? Number(form.end_km)        : null,
        working_hours:      form.working_hours   ? Number(form.working_hours)   : null,
        idle_hours:         form.idle_hours      ? Number(form.idle_hours)      : 0,
        breakdown_hours:    form.breakdown_hours ? Number(form.breakdown_hours) : 0,
        notes:              form.notes          || null,
        work_done:          form.work_done      || null,
        handover_notes:     form.handover_notes || null,
      }
      const { error } = await supabase.from('shifts').update(payload).eq('id', shift.id)
      if (error) throw error
      toast.success('Shift updated')
      qc.invalidateQueries(['all_shifts',  companyId])
      qc.invalidateQueries(['today_ops',   companyId])
      qc.invalidateQueries(['active_shift', shift.equipment_id])
      onSaved()
    } catch (e) {
      toast.error(e.message || 'Failed to update shift')
    } finally { setSaving(false) }
  }

  const i = (extra = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${extra}`
  const lbl = 'text-xs text-slate-400 mb-1 block'

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-dark-800 sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700 shrink-0 bg-dark-800 sm:rounded-t-2xl">
          <div>
            <p className="font-bold text-slate-100">Edit Shift</p>
            <p className="text-xs text-slate-400">{shift.equipment?.name} · {shift.shift_date}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
          {/* Date + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Shift Date</label>
              <input type="date" className={i()} value={form.shift_date} onChange={e => set('shift_date', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Shift Type</label>
              <select className={i()} value={form.shift_type} onChange={e => set('shift_type', e.target.value)}>
                <option value="day">☀️ Day</option>
                <option value="night">🌙 Night</option>
                <option value="double">🔄 Double</option>
              </select>
            </div>
          </div>

          {/* Operator */}
          <div>
            <label className={lbl}>Operator / Driver *</label>
            {empList.length > 0 ? (
              <select className={i()} value={form.operator_name} onChange={e => set('operator_name', e.target.value)}>
                <option value="">Select operator…</option>
                {empList.map(e => (
                  <option key={e.id} value={e.name}>{e.name}{e.employee_number ? ` (${e.employee_number})` : ''}</option>
                ))}
                {/* Keep current value even if not in list */}
                {form.operator_name && !empList.find(e => e.name === form.operator_name) && (
                  <option value={form.operator_name}>{form.operator_name} (current)</option>
                )}
              </select>
            ) : (
              <input className={i()} value={form.operator_name} onChange={e => set('operator_name', e.target.value)} placeholder="Operator name" />
            )}
          </div>

          {/* Site Incharge */}
          <div>
            <label className={lbl}>Site Incharge</label>
            <input className={i()} value={form.site_incharge_name} onChange={e => set('site_incharge_name', e.target.value)} placeholder="Supervisor / incharge name" />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Start Time</label>
              <input type="time" className={i()} value={form.start_time} onChange={e => set('start_time', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>End Time</label>
              <input type="time" className={i()} value={form.end_time} onChange={e => set('end_time', e.target.value)} />
            </div>
          </div>

          {/* Meter readings */}
          {(mt === 'hours' || mt === 'both' || !mt) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Opening Meter (hrs)</label>
                <input type="number" className={i()} value={form.start_meter} onChange={e => set('start_meter', e.target.value)} step="0.1" placeholder="e.g. 4250" />
              </div>
              <div>
                <label className={lbl}>Closing Meter (hrs)</label>
                <input type="number" className={i()} value={form.end_meter} onChange={e => set('end_meter', e.target.value)} step="0.1" placeholder="e.g. 4258" />
              </div>
            </div>
          )}
          {(mt === 'kilometers' || mt === 'both') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Opening Odometer (km)</label>
                <input type="number" className={i()} value={form.start_km} onChange={e => set('start_km', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Closing Odometer (km)</label>
                <input type="number" className={i()} value={form.end_km} onChange={e => set('end_km', e.target.value)} />
              </div>
            </div>
          )}

          {/* Hours */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={lbl}>Working Hrs</label>
              <input type="number" className={i('text-center')} value={form.working_hours} onChange={e => set('working_hours', e.target.value)} step="0.1" placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Idle Hrs</label>
              <input type="number" className={i('text-center')} value={form.idle_hours} onChange={e => set('idle_hours', e.target.value)} step="0.1" placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Breakdown Hrs</label>
              <input type="number" className={i('text-center')} value={form.breakdown_hours} onChange={e => set('breakdown_hours', e.target.value)} step="0.1" placeholder="0" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={lbl}>Start Remarks</label>
            <textarea className={i('resize-none')} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Shift start notes…" />
          </div>
          <div>
            <label className={lbl}>Work Done</label>
            <textarea className={i('resize-none')} rows={2} value={form.work_done} onChange={e => set('work_done', e.target.value)} placeholder="What was accomplished…" />
          </div>
          <div>
            <label className={lbl}>Handover Notes</label>
            <textarea className={i('resize-none')} rows={2} value={form.handover_notes} onChange={e => set('handover_notes', e.target.value)} placeholder="Notes to next shift…" />
          </div>
        </div>

        <div className="flex gap-3 px-4 py-3 border-t border-dark-700 shrink-0">
          <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shifts Tab — Daily Operations Log ─────────────────────────────────────────
function ShiftsTab({ companyId }) {
  const { role } = useAuth()
  const isAdmin  = ['admin', 'superadmin'].includes(role)
  const qc       = useQueryClient()

  const [dateFrom,      setDateFrom]      = useState(today())
  const [dateTo,        setDateTo]        = useState(today())
  const [equipFilter,   setEquipFilter]   = useState('all')
  const [selectedShift, setSelectedShift] = useState(null)
  const [editShift,     setEditShift]     = useState(null)

  // Equipment list for filter dropdown
  const { data: equipList = [] } = useQuery({
    queryKey: ['equip_list_ops', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id, name, category, meter_type').eq('company_id', companyId)
        .order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Shifts with equipment info + project name
  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['all_shifts', companyId, dateFrom, dateTo, equipFilter],
    queryFn: async () => {
      let q = supabase.from('shifts')
        .select('*, equipment(id, name, equipment_number, category, meter_type, current_project_id, current_client_id)')
        .eq('company_id', companyId)
        .gte('shift_date', dateFrom)
        .lte('shift_date', dateTo)
        .order('shift_date', { ascending: false })
        .order('start_time', { ascending: false })
      if (equipFilter !== 'all') q = q.eq('equipment_id', equipFilter)
      const { data, error } = await q.limit(200)
      if (error) throw error

      const shifts = data || []

      // ── Resolve project for each shift ────────────────────────────────────────
      // Priority 1: shift.project_id (stored at shift creation)
      // Priority 2: equipment.current_project_id (set in Fleet → Deploy)
      const allProjectIds = [...new Set(
        shifts.map(s => s.project_id || s.equipment?.current_project_id).filter(Boolean)
      )]
      if (allProjectIds.length > 0) {
        const { data: projects } = await supabase.from('projects')
          .select('id, project_name, project_code').in('id', allProjectIds)
        if (projects) {
          const pMap = Object.fromEntries(projects.map(p => [p.id, p]))
          shifts.forEach(s => {
            const pid = s.project_id || s.equipment?.current_project_id
            s._project = pid ? (pMap[pid] || null) : null
          })
        }
      }

      // ── Resolve HR operator for each shift ───────────────────────────────────
      // Pass 1: resolve by operator_id (set when operator role starts shift)
      const allOperatorIds = [...new Set(shifts.map(s => s.operator_id).filter(Boolean))]
      const eById = {}
      if (allOperatorIds.length > 0) {
        const { data: employees } = await supabase.from('hr_employees')
          .select('id, name, designation, employee_number').in('id', allOperatorIds)
        if (employees) employees.forEach(e => { eById[e.id] = e })
      }

      // Pass 2: resolve by operator_name for shifts without operator_id
      const unlinkedNames = [...new Set(
        shifts.filter(s => !s.operator_id && s.operator_name).map(s => s.operator_name)
      )]
      const eByName = {}
      if (unlinkedNames.length > 0) {
        const { data: empsByName } = await supabase.from('hr_employees')
          .select('id, name, designation, employee_number')
          .eq('company_id', companyId)
          .in('name', unlinkedNames)
        if (empsByName) empsByName.forEach(e => { eByName[e.name.toLowerCase()] = e })
      }

      shifts.forEach(s => {
        if (s.operator_id && eById[s.operator_id]) {
          s._operator = eById[s.operator_id]
          // If operator_name was blank or shows employee number, correct it
          if (!s.operator_name || s.operator_name === s._operator.employee_number) {
            s.operator_name = s._operator.name
          }
        } else if (s.operator_name) {
          s._operator = eByName[s.operator_name.toLowerCase()] || null
        }
      })

      return shifts
    },
    enabled: !!companyId,
  })

  // Fuel summaries for all fetched shifts (one batch query)
  const shiftIds = shifts.map(s => s.id)
  const { data: fuelSummary = [] } = useQuery({
    queryKey: ['shifts_fuel_summary', shiftIds.join(',')],
    queryFn: async () => {
      if (!shiftIds.length) return []
      const { data } = await supabase.from('shift_fuel_entries')
        .select('shift_id, quantity_liters').in('shift_id', shiftIds)
      return data || []
    },
    enabled: shiftIds.length > 0,
  })

  // Incident counts for all fetched shifts (one batch query)
  const { data: incidentSummary = [] } = useQuery({
    queryKey: ['shifts_incident_summary', shiftIds.join(',')],
    queryFn: async () => {
      if (!shiftIds.length) return []
      const { data } = await supabase.from('shift_incidents')
        .select('shift_id, severity').in('shift_id', shiftIds)
      return data || []
    },
    enabled: shiftIds.length > 0,
  })

  // Build lookup maps
  const fuelByShift = useMemo(() => {
    const m = {}
    fuelSummary.forEach(f => { m[f.shift_id] = (m[f.shift_id] || 0) + Number(f.quantity_liters || 0) })
    return m
  }, [fuelSummary])

  const incidentsByShift = useMemo(() => {
    const m = {}
    incidentSummary.forEach(i => {
      if (!m[i.shift_id]) m[i.shift_id] = { count: 0, hasCritical: false }
      m[i.shift_id].count++
      if (i.severity === 'critical' || i.severity === 'high') m[i.shift_id].hasCritical = true
    })
    return m
  }, [incidentSummary])

  // Totals for summary bar
  const totalWorkHrs  = shifts.reduce((s, r) => s + Number(r.working_hours || 0), 0)
  const totalFuelL    = Object.values(fuelByShift).reduce((s, v) => s + v, 0)
  const totalIncidents = incidentSummary.length
  const openCount     = shifts.filter(s => s.status === 'open').length

  // Clock time = difference between start_time and end_time in hours
  function clockHours(start, end) {
    if (!start || !end) return null
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60 // overnight
    return (mins / 60).toFixed(1)
  }

  const meterUnit = (s) => s.equipment?.meter_type === 'kilometers' ? 'km' : 'h'

  return (
    <div className="flex flex-col h-full">
      {/* ── Filters ── */}
      <div className="px-4 py-2 shrink-0 border-b border-dark-800 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-slate-500">From</label>
            <input type="date" className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-slate-500">To</label>
            <input type="date" className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
              value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button onClick={() => { setDateFrom(today()); setDateTo(today()) }}
            className="text-[11px] text-primary-400 hover:text-primary-300 px-2 py-1.5 rounded-lg hover:bg-primary-500/10 border border-primary-700/30">
            Today
          </button>
          <button onClick={() => {
            const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0')
            setDateFrom(`${y}-${m}-01`)
            setDateTo(`${y}-${m}-${String(new Date(y, d.getMonth()+1, 0).getDate()).padStart(2, '0')}`)
          }} className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded-lg hover:bg-dark-700 border border-dark-600">
            This Month
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="flex-1 min-w-[140px] bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
            value={equipFilter} onChange={e => setEquipFilter(e.target.value)}>
            <option value="all">All Equipment</option>
            {equipList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {shifts.length > 0 && (
            <div className="flex gap-2 ml-auto">
              <span className="text-[11px] bg-dark-700 rounded-lg px-2 py-1.5 text-slate-400">{shifts.length} shifts</span>
              <span className="text-[11px] bg-dark-700 rounded-lg px-2 py-1.5"><span className="text-emerald-400 font-bold">{totalWorkHrs.toFixed(1)}</span><span className="text-slate-500"> hrs</span></span>
              {totalFuelL > 0 && <span className="text-[11px] bg-dark-700 rounded-lg px-2 py-1.5"><span className="text-yellow-400 font-bold">{totalFuelL.toFixed(0)}</span><span className="text-slate-500"> L fuel</span></span>}
              {totalIncidents > 0 && <span className="text-[11px] bg-red-900/30 border border-red-700/40 rounded-lg px-2 py-1.5 text-red-400 font-bold">{totalIncidents} incidents</span>}
              {openCount > 0 && <span className="text-[11px] bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-2 py-1.5 text-emerald-400">{openCount} active</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Table Header ── */}
      {!isLoading && shifts.length > 0 && (
        <div className="shrink-0 px-4 pt-2 pb-1">
          <div className="grid w-full text-[10px] font-bold text-slate-600 uppercase tracking-wider"
            style={{ gridTemplateColumns: '0.7fr 1fr 1fr 1.2fr 0.8fr 0.8fr 0.9fr 0.9fr 0.7fr 0.7fr 0.7fr 26px' }}>
            <span>Date</span>
            <span>Equip No.</span>
            <span>Operator</span>
            <span>Project</span>
            <span className="text-center">Start Hr</span>
            <span className="text-center">End Hr</span>
            <span className="text-center">Clock In</span>
            <span className="text-center">Clock Out</span>
            <span className="text-center">Work Hrs</span>
            <span className="text-center">Clock Hrs</span>
            <span className="text-center">Fuel (L)</span>
            <span className="text-center"></span>
          </div>
        </div>
      )}

      {/* ── Rows ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : shifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Clock className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">No shifts found for selected filters</p>
          </div>
        ) : (
          <div className="space-y-0.5 mt-1">
            {shifts.map(s => {
              const fuel      = fuelByShift[s.id] || 0
              const incidents = incidentsByShift[s.id]
              const clockHr   = clockHours(s.start_time, s.end_time)
              const startMeter = s.start_meter ?? s.start_km
              const endMeter   = s.end_meter   ?? s.end_km
              const isOpen     = s.status === 'open'

              return (
                <button key={s.id} onClick={() => setSelectedShift(s)}
                  className={`w-full text-left rounded-xl px-3 py-2.5 transition-all group border
                    ${isOpen
                      ? 'bg-emerald-900/10 border-emerald-700/20 hover:border-emerald-600/40'
                      : 'bg-dark-800 border-dark-700 hover:border-primary-700/40'}`}>
                  <div className="grid w-full items-center gap-x-2"
                    style={{ gridTemplateColumns: '0.7fr 1fr 1fr 1.2fr 0.8fr 0.8fr 0.9fr 0.9fr 0.7fr 0.7fr 0.7fr 26px' }}>

                    {/* Date */}
                    <div>
                      <p className="text-xs font-semibold text-slate-200 leading-tight">
                        {format(new Date(s.shift_date + 'T00:00:00'), 'dd MMM')}
                      </p>
                      <p className="text-[10px] text-slate-500">{format(new Date(s.shift_date + 'T00:00:00'), 'EEE')}</p>
                    </div>

                    {/* Equipment Number */}
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-semibold text-primary-400 truncate leading-tight">
                        {s.equipment?.equipment_number || '—'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">{s.equipment?.category || ''}</p>
                    </div>

                    {/* Operator */}
                    <div className="min-w-0">
                      <p className="text-xs text-slate-200 truncate leading-tight">{s.operator_name || '—'}</p>
                      {s._operator?.designation && (
                        <p className="text-[10px] text-slate-500 truncate">{s._operator.designation}</p>
                      )}
                    </div>

                    {/* Project */}
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 truncate leading-tight">
                        {s._project?.project_name || '—'}
                      </p>
                      {s._project?.project_code && (
                        <p className="text-[10px] text-slate-600 truncate">{s._project.project_code}</p>
                      )}
                    </div>

                    {/* Start Hour (meter) */}
                    <div className="text-center">
                      <p className="text-xs font-mono text-slate-300">{startMeter != null ? startMeter : '—'}</p>
                      <p className="text-[10px] text-slate-600">{meterUnit(s)}</p>
                    </div>

                    {/* End Hour (meter) */}
                    <div className="text-center">
                      <p className={`text-xs font-mono ${endMeter != null ? 'text-slate-300' : 'text-slate-600'}`}>
                        {endMeter != null ? endMeter : isOpen ? '…' : '—'}
                      </p>
                      <p className="text-[10px] text-slate-600">{meterUnit(s)}</p>
                    </div>

                    {/* Clock In */}
                    <div className="text-center">
                      <p className="text-xs font-mono text-emerald-400">{s.start_time || '—'}</p>
                    </div>

                    {/* Clock Out */}
                    <div className="text-center">
                      <p className={`text-xs font-mono ${s.end_time ? 'text-red-400' : isOpen ? 'text-emerald-500 animate-pulse' : 'text-slate-600'}`}>
                        {s.end_time || (isOpen ? 'Live' : '—')}
                      </p>
                    </div>

                    {/* Working Hours */}
                    <div className="text-center">
                      <p className={`text-sm font-black ${Number(s.working_hours) > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {s.working_hours || '—'}
                      </p>
                    </div>

                    {/* Clock Hours */}
                    <div className="text-center">
                      <p className={`text-xs font-mono ${clockHr ? 'text-slate-300' : 'text-slate-600'}`}>
                        {clockHr ? `${clockHr}h` : '—'}
                      </p>
                    </div>

                    {/* Fuel */}
                    <div className="text-center">
                      <p className={`text-xs font-semibold ${fuel > 0 ? 'text-yellow-400' : 'text-slate-700'}`}>
                        {fuel > 0 ? `${fuel.toFixed(0)}L` : '—'}
                      </p>
                    </div>

                    {/* Incident icon */}
                    <div className="flex items-center justify-center">
                      {incidents ? (
                        <span title={`${incidents.count} incident${incidents.count > 1 ? 's' : ''}`}>
                          <AlertTriangle className={`w-3.5 h-3.5 ${incidents.hasCritical ? 'text-red-400' : 'text-orange-400'}`} />
                        </span>
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors" />
                      )}
                    </div>
                  </div>

                  {/* Extra badges row — only if noteworthy */}
                  {(s.breakdown_hours > 0 || s.meter_discrepancy || s.handover_notes || s.work_done) && (
                    <div className="flex gap-1.5 mt-1.5 pl-0 flex-wrap">
                      {s.breakdown_hours > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 border border-red-700/30 text-red-400">⚡ Breakdown {s.breakdown_hours}h</span>}
                      {s.idle_hours > 0       && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/20 border border-yellow-700/20 text-yellow-600">Idle {s.idle_hours}h</span>}
                      {s.meter_discrepancy    && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/20 border border-orange-700/20 text-orange-400">⚠ Meter corrected</span>}
                      {s.handover_notes       && <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-slate-500">📨 Handover note</span>}
                      {s.work_done            && <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-slate-500">📋 Work logged</span>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedShift && !editShift && (
        <ShiftDetailModal
          shift={selectedShift}
          onClose={() => setSelectedShift(null)}
          isAdmin={isAdmin}
          onEdit={(s) => { setSelectedShift(null); setEditShift(s) }}
        />
      )}
      {editShift && (
        <EditShiftModal
          shift={editShift}
          companyId={companyId}
          onClose={() => setEditShift(null)}
          onSaved={() => setEditShift(null)}
        />
      )}
    </div>
  )
}

// ── Fuel Tab ──────────────────────────────────────────────────────────────────
function FuelTab({ companyId }) {
  const [filterDate,   setFilterDate]   = useState('')
  const [selectedFuel, setSelectedFuel] = useState(null)

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
              <button key={e.id} onClick={() => setSelectedFuel(e)}
                className="w-full text-left bg-dark-800 border border-dark-700 hover:border-yellow-700/50 rounded-xl p-3 transition-colors group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-100 text-sm truncate">{e.equipment?.name}</p>
                    <p className="text-xs text-slate-500">{e.equipment?.category}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-1.5">
                    <div>
                      <p className="font-bold text-yellow-400">{e.quantity_liters} L</p>
                      {e.total_amount && <p className="text-xs text-slate-400">₹{Number(e.total_amount).toLocaleString('en-IN')}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  {e.delivered_by_name && <span>By: {e.delivered_by_name}</span>}
                  {e.vendor_name       && <span>Vendor: {e.vendor_name}</span>}
                  {e.invoice_number    && <span>Invoice: #{e.invoice_number}</span>}
                  {e.rate_per_liter    && <span>Rate: ₹{e.rate_per_liter}/L</span>}
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-xs text-slate-600">{format(new Date(e.created_at), 'dd MMM yyyy, HH:mm')}</p>
                  {e.fuel_photo_url && <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-slate-500">📷 Photo</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedFuel && <FuelDetailModal entry={selectedFuel} onClose={() => setSelectedFuel(null)} />}
    </div>
  )
}

// ── Incidents Tab ─────────────────────────────────────────────────────────────
function IncidentsTab({ companyId }) {
  const qc = useQueryClient()
  const [selectedIncident, setSelectedIncident] = useState(null)
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
                <button key={i.id} onClick={() => setSelectedIncident(i)}
                  className={`w-full text-left bg-dark-800 border rounded-xl p-3 transition-colors group
                    ${i.resolved ? 'border-dark-700 opacity-70 hover:opacity-100' : 'border-orange-700/30 hover:border-orange-600/60'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 text-sm truncate">{i.equipment?.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{opt?.icon} {opt?.label || i.incident_type}{i.severity ? ` · ${i.severity}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {i.resolved
                        ? <span className="text-xs text-slate-500">✓ Resolved</span>
                        : <span className="text-xs text-red-400 font-medium">● Open</span>
                      }
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </div>
                  </div>
                  {i.description && <p className="text-xs text-slate-300 mt-1 line-clamp-2">{i.description}</p>}
                  <p className="text-xs text-slate-600 mt-1.5">{format(new Date(i.created_at), 'dd MMM yyyy, HH:mm')}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {selectedIncident && (
        <IncidentDetailModal
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onResolve={resolveIncident}
        />
      )}
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
