/**
 * OperatorPortal.jsx — Mobile-first operator interface
 * Rules:
 *  - Equipment is PRE-ASSIGNED by admin — operator cannot change it
 *  - Shift type is AUTO-FILLED from project/site assignment — operator cannot change it
 *  - Shift can only be started within project/site defined time window (± grace period)
 *  - Attendance auto-calculated from clock time when shift ends (≥4 hrs = Present, <4 = Half Day)
 *  - Live salary shown: days worked × daily rate, updates after each shift
 */

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import FieldExpensePage from '../fieldexpense/FieldExpensePage'

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmt   = n  => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`
const fmtN  = (n, d=0) => n == null ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits:d, maximumFractionDigits:d })
const today = () => new Date().toISOString().slice(0, 10)
const nowTime = () => new Date().toTimeString().slice(0, 5)

async function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve(`${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`),
      () => resolve(null), { timeout: 6000, enableHighAccuracy: true }
    )
  })
}

async function stampAndUpload(file, label) {
  const location = await getLocation()
  const stamp = `${new Date().toLocaleString('en-IN')}${location ? `  📍 ${location}` : ''}`

  const blob = await new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const maxW = 1400
        const scale = img.width > maxW ? maxW / img.width : 1
        const w = img.width * scale, h = img.height * scale
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        const barH = Math.max(h * 0.055, 32)
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(0, h - barH * 2.2, w, barH * 2.2)
        const fs = Math.max(Math.round(barH * 0.48), 12)
        ctx.fillStyle = '#fff'; ctx.font = `bold ${fs}px monospace`
        ctx.fillText(label, 10, h - barH - 6)
        ctx.font = `${fs * 0.88}px monospace`; ctx.fillStyle = '#bbb'
        ctx.fillText(stamp, 10, h - 8)
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })

  try {
    const filename = `${Date.now()}_${label.replace(/\W+/g,'_')}.jpg`
    const { data, error } = await supabase.storage.from('operator-photos')
      .upload(filename, blob, { contentType: 'image/jpeg' })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('operator-photos').getPublicUrl(data.path)
      return { url: publicUrl, location }
    }
  } catch (_) {}
  return new Promise(resolve => {
    const r = new FileReader(); r.onload = e => resolve({ url: e.target.result, location }); r.readAsDataURL(blob)
  })
}

// Returns { allowed, reason, shiftType }
function checkShiftWindow(project, equipment) {
  const start = project?.shift_start_time || null
  const end   = project?.shift_end_time   || null
  const grace = project?.shift_grace_mins ?? 30
  const shiftType = equipment?.default_shift_type || 'day'

  if (!start || !end) return { allowed: true, reason: null, shiftType }

  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const windowStart = sh * 60 + sm - grace
  const windowEnd   = eh * 60 + em + grace

  if (nowMins < windowStart) {
    const readyAt = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`
    return { allowed: false, reason: `Your shift starts at ${readyAt}. You cannot start the shift yet.`, shiftType }
  }
  if (nowMins > windowEnd) {
    const endedAt = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`
    return { allowed: false, reason: `Your shift window ended at ${endedAt}. Contact your supervisor for any changes.`, shiftType }
  }
  return { allowed: true, reason: null, shiftType }
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex bg-dark-800 border border-dark-600 rounded-full p-0.5 text-xs">
      {['basic','advanced'].map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={`px-3 py-1 rounded-full capitalize font-semibold transition-all ${mode===m ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
          {m}
        </button>
      ))}
    </div>
  )
}

function PhotoCapture({ label, onCapture, preview, disabled }) {
  const ref = useRef()
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1.5">{label}</p>
      <div className="flex items-center gap-3">
        <button type="button" disabled={disabled} onClick={() => ref.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 border border-dark-500 rounded-xl text-sm text-slate-200 hover:bg-dark-600 active:scale-95 transition-all disabled:opacity-40">
          📷 Take Photo
        </button>
        {preview && (
          <div className="w-16 h-16 rounded-lg overflow-hidden border border-primary-700">
            <img src={preview} alt="preview" className="w-full h-full object-cover" />
          </div>
        )}
        <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => e.target.files?.[0] && onCapture(e.target.files[0])} />
      </div>
    </div>
  )
}

function Sheet({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-h-[92vh] bg-dark-900 border-t border-dark-600 rounded-t-2xl overflow-y-auto">
        <div className="sticky top-0 bg-dark-900 border-b border-dark-700 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100 text-base">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-2xl leading-none">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

const FL = ({ children }) => <p className="text-xs text-slate-400 mb-1">{children}</p>
const inp = 'w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500'
const bigNum = 'w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-4 text-2xl font-bold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary-500 text-center tracking-widest'

function Btn({ onClick, disabled, loading, children, variant='primary', className='' }) {
  const v = { primary:'bg-primary-600 hover:bg-primary-500 text-white', danger:'bg-red-700 hover:bg-red-600 text-white', ghost:'bg-dark-700 hover:bg-dark-600 text-slate-200 border border-dark-500' }
  return (
    <button onClick={onClick} disabled={disabled||loading}
      className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 ${v[variant]} ${className}`}>
      {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : children}
    </button>
  )
}

function InfoRow({ label, value, accent }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-slate-400">{label}</span>
      <span className={accent||'text-slate-200'}>{value || '—'}</span>
    </div>
  )
}

// ─── Notification helpers ─────────────────────────────────────────────────────

function requestNotificationPermission() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function fireNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      tag,                   // deduplicates — replaces existing same-tag notification
      requireInteraction: true,
      icon: '/nhance-icon.png',
      badge: '/nhance-icon.png',
    })
  } catch (_) {}
}

// ─── Shift Alarm Banner ───────────────────────────────────────────────────────

function ShiftAlarmBanner({ type, elapsedHrs, onEndNow, onDismiss }) {
  if (type === 'overdue') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] max-w-lg mx-auto animate-pulse">
        <div className="bg-red-600 border-b-2 border-red-400 px-4 py-3 flex items-center gap-3 shadow-2xl">
          <span className="text-2xl shrink-0">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Shift Overdue — {Number(elapsedHrs).toFixed(1)} hrs running</p>
            <p className="text-red-100 text-xs mt-0.5">Please close your shift immediately</p>
          </div>
          <button onClick={onEndNow}
            className="shrink-0 bg-white text-red-700 font-bold text-xs px-3 py-1.5 rounded-lg active:scale-95">
            End Now
          </button>
          <button onClick={onDismiss} className="shrink-0 text-red-200 hover:text-white text-xl leading-none px-1">×</button>
        </div>
      </div>
    )
  }
  if (type === 'login_reminder') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] max-w-lg mx-auto">
        <div className="bg-amber-600 border-b-2 border-amber-400 px-4 py-3 flex items-center gap-3 shadow-2xl">
          <span className="text-2xl shrink-0">⏰</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Shift Window is Open</p>
            <p className="text-amber-100 text-xs mt-0.5">Don't forget to start your shift!</p>
          </div>
          <button onClick={onDismiss} className="shrink-0 text-amber-200 hover:text-white text-xl leading-none px-1">×</button>
        </div>
      </div>
    )
  }
  return null
}

// ─── SHIFT MODULE ─────────────────────────────────────────────────────────────

function ShiftWindowBanner({ check }) {
  if (check.allowed) return null
  return (
    <div className="bg-red-950/50 border border-red-700/50 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🚫</span>
        <div>
          <p className="text-red-300 font-semibold text-sm">Shift Not Available</p>
          <p className="text-red-400/80 text-xs mt-1">{check.reason}</p>
          <p className="text-slate-500 text-[11px] mt-2">OT and schedule changes can only be authorised by your Manager, HR, or Admin.</p>
        </div>
      </div>
    </div>
  )
}

function AssignedEquipmentCard({ equipment, project }) {
  return (
    <div className="bg-dark-800 border border-primary-700/30 rounded-2xl p-4">
      <p className="text-[10px] text-primary-400 uppercase tracking-widest font-semibold mb-2">Your Assigned Equipment</p>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-100 font-bold text-lg">{equipment.name}</p>
          <p className="text-slate-500 text-xs font-mono">{equipment.equipment_number} · {equipment.category}</p>
        </div>
        <span className="text-[10px] px-2 py-1 bg-primary-900/30 border border-primary-700/30 text-primary-400 rounded-full capitalize font-semibold">
          {equipment.default_shift_type || 'day'} shift
        </span>
      </div>
      {project && (
        <div className="mt-3 pt-3 border-t border-dark-700 flex items-center justify-between">
          <p className="text-xs text-slate-400">Project</p>
          <p className="text-xs text-slate-200">{project.project_name}</p>
        </div>
      )}
      {(project?.shift_start_time && project?.shift_end_time) && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Shift Window</p>
          <p className="text-xs text-slate-200">{project.shift_start_time.slice(0,5)} – {project.shift_end_time.slice(0,5)}</p>
        </div>
      )}
      {equipment.current_meter_reading && (
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-slate-400">Last Meter</p>
          <p className="text-xs text-slate-200 font-mono">{Number(equipment.current_meter_reading).toLocaleString('en-IN')} hrs</p>
        </div>
      )}
    </div>
  )
}

function StartShiftForm({ companyId, operatorId, employeeId, equipment, project, mode, onStarted }) {
  const [meter,        setMeter]     = useState('')
  const [meterFile,    setMeterFile] = useState(null)
  const [meterPreview, setMeterPrev] = useState(null)
  const [saving, setSaving]          = useState(false)

  const check = checkShiftWindow(project, equipment)

  const handleMeterPhoto = f => { setMeterFile(f); setMeterPrev(URL.createObjectURL(f)) }

  const canSubmit = check.allowed && meter && meterFile

  const handleStart = async () => {
    if (!check.allowed) return toast.error(check.reason || 'Outside shift window')
    if (!meter)     return toast.error('Enter hour meter reading')
    if (!meterFile) return toast.error('Take a photo of the hour meter')
    setSaving(true)
    try {
      const meterLabel = `${equipment.equipment_number} — Meter Start`
      const { url: meterUrl, location } = await stampAndUpload(meterFile, meterLabel)
      const { data, error } = await supabase.from('shifts').insert({
        company_id: companyId, equipment_id: equipment.id, operator_id: employeeId,
        shift_date: today(), shift_type: check.shiftType, start_time: nowTime(),
        start_meter: Number(meter), start_meter_photo: meterUrl,
        start_location: location,
        project_id: project?.id || null, status: 'open',
      }).select().single()
      if (error) throw error
      toast.success('Shift started!')
      onStarted(data)
    } catch (err) { toast.error(err.message || 'Failed to start shift')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <FL>Start Hour Meter Reading</FL>
        <input type="number" className={bigNum} value={meter} onChange={e => setMeter(e.target.value)}
          placeholder="0000.0" step="0.1" min="0" inputMode="decimal" />
        {equipment?.current_meter_reading && (
          <p className="text-center text-xs text-slate-500 mt-1">Last recorded: {Number(equipment.current_meter_reading).toLocaleString('en-IN')} hrs</p>
        )}
      </div>

      {/* Required photo: Meter reading */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
        <p className="text-xs text-amber-400 font-semibold uppercase tracking-wide mb-3">📷 Meter Reading Photo</p>
        <div className={`rounded-xl border-2 p-3 transition-all ${meterFile ? 'border-green-600/60 bg-green-900/10' : 'border-dashed border-dark-500'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meterFile ? 'bg-green-700/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
              {meterFile ? '✓ Done' : 'Required'}
            </span>
            <span className="text-xs text-slate-300">Photo of hour meter</span>
          </div>
          <PhotoCapture label="" onCapture={handleMeterPhoto} preview={meterPreview} />
        </div>
      </div>

      {!check.allowed ? (
        <ShiftWindowBanner check={check} />
      ) : (
        <Btn onClick={handleStart} loading={saving} disabled={!canSubmit}>
          {canSubmit ? '🚀 Start Shift' : `Complete ${!meter ? 'meter reading' : 'meter photo'} first`}
        </Btn>
      )}
    </div>
  )
}

function RecordFuelSheet({ open, onClose, shift, companyId, mode }) {
  const [qty, setQty]           = useState('')
  const [meter, setMeter]       = useState('')
  const [rate, setRate]         = useState('')
  const [source, setSource]     = useState('tank')
  const [photoFile, setPhoto]   = useState(null)
  const [photoPreview, setPP]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const qc = useQueryClient()

  const handlePhoto = f => { setPhoto(f); setPP(URL.createObjectURL(f)) }

  const handleSave = async () => {
    if (!qty)     return toast.error('Enter fuel quantity')
    if (!photoFile) return toast.error('Take a proof photo')
    setSaving(true)
    try {
      const { url } = await stampAndUpload(photoFile, 'Fuel Entry Proof')
      const totalAmt = rate && qty ? Number(qty) * Number(rate) : null
      await supabase.from('shift_fuel_entries').insert({
        company_id: companyId, shift_id: shift.id, equipment_id: shift.equipment_id,
        quantity_liters: Number(qty), rate_per_liter: rate ? Number(rate) : null,
        total_amount: totalAmt, meter_at_filling: meter ? Number(meter) : null,
        fuel_source: source, receipt_url: url,
      })
      toast.success('Fuel recorded')
      qc.invalidateQueries(['op_shift_fuel', shift.id])
      setQty(''); setMeter(''); setRate(''); setSource('tank'); setPhoto(null); setPP(null)
      onClose()
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="⛽ Record Fuel">
      <div className="space-y-4">
        <div>
          <FL>Quantity Filled (Litres) *</FL>
          <input type="number" className={bigNum} value={qty} onChange={e => setQty(e.target.value)}
            placeholder="0.0" step="0.5" min="0" inputMode="decimal" />
        </div>
        <div>
          <FL>Hour Meter at Filling (optional)</FL>
          <input type="number" className={inp} value={meter} onChange={e => setMeter(e.target.value)}
            placeholder="Current meter reading" step="0.1" min="0" inputMode="decimal" />
        </div>

        {/* Advanced-only: rate + fuel source */}
        {mode === 'advanced' && (
          <>
            <div>
              <FL>Rate per Litre (₹) — for cost tracking</FL>
              <input type="number" className={inp} value={rate} onChange={e => setRate(e.target.value)}
                placeholder="e.g. 95.50" step="0.01" min="0" inputMode="decimal" />
              {qty && rate && <p className="text-xs text-primary-400 mt-1">Total: {fmt(Number(qty)*Number(rate))}</p>}
            </div>
            <div>
              <FL>Fuel Source</FL>
              <div className="grid grid-cols-2 gap-2">
                {[['tank','🛢 Our Tank'],['client','🏗 Client Supplied']].map(([v,l]) => (
                  <button key={v} onClick={() => setSource(v)}
                    className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${source===v ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 border border-dark-500'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {source === 'client' && <p className="text-[10px] text-amber-400 mt-1">Client-supplied fuel will be excluded from our cost P&L</p>}
            </div>
          </>
        )}

        <PhotoCapture label="Proof Photo (meter / receipt) *" onCapture={handlePhoto} preview={photoPreview} />
        <Btn onClick={handleSave} loading={saving}>Save Fuel Entry</Btn>
      </div>
    </Sheet>
  )
}

function RecordIncidentSheet({ open, onClose, shift, companyId, mode }) {
  const [type, setType]         = useState('breakdown')
  const [sev, setSev]           = useState('low')
  const [desc, setDesc]         = useState('')
  const [action, setAction]     = useState('')
  const [photoFile, setPhoto]   = useState(null)
  const [photoPreview, setPP]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const qc = useQueryClient()

  const TYPES = ['breakdown','accident','near_miss','damage','theft','other']
  const SEVS  = ['low','medium','high','critical']
  const SEV_COLOR = { low:'bg-green-700', medium:'bg-yellow-600', high:'bg-orange-600', critical:'bg-red-600' }

  const handlePhoto = f => { setPhoto(f); setPP(URL.createObjectURL(f)) }

  const handleSave = async () => {
    if (!desc.trim()) return toast.error('Describe the incident')
    setSaving(true)
    try {
      let photoUrls = []
      if (photoFile) {
        const { url } = await stampAndUpload(photoFile, 'Incident Photo')
        photoUrls = [url]
      }
      await supabase.from('shift_incidents').insert({
        company_id: companyId, shift_id: shift.id, equipment_id: shift.equipment_id,
        incident_type: type, severity: sev, description: desc,
        action_taken: action || null,
        reported_by: shift.operator_id, photo_urls: photoUrls,
        incident_time: new Date().toISOString(),
      })
      toast.success('Incident reported')
      qc.invalidateQueries(['op_incidents', shift.id])
      setDesc(''); setAction(''); setType('breakdown'); setSev('low'); setPhoto(null); setPP(null)
      onClose()
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="⚠️ Report Incident">
      <div className="space-y-4">
        <div>
          <FL>Incident Type *</FL>
          <select className={inp} value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t} value={t}>{t.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
          </select>
        </div>
        <div>
          <FL>Severity *</FL>
          <div className="grid grid-cols-4 gap-2">
            {SEVS.map(s => (
              <button key={s} onClick={() => setSev(s)}
                className={`py-2 rounded-xl text-xs font-semibold capitalize transition-all ${sev===s ? `${SEV_COLOR[s]} text-white` : 'bg-dark-700 text-slate-400 border border-dark-500'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FL>Description *</FL>
          <textarea className={`${inp} resize-none`} rows={3} value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Describe what happened…" />
        </div>

        {/* Advanced: action taken */}
        {mode === 'advanced' && (
          <div>
            <FL>Action Taken</FL>
            <textarea className={`${inp} resize-none`} rows={2} value={action} onChange={e => setAction(e.target.value)}
              placeholder="What did you do about it? (e.g. shut down, called supervisor, bypassed…)" />
          </div>
        )}

        <PhotoCapture label="Photo (optional)" onCapture={handlePhoto} preview={photoPreview} />
        <Btn onClick={handleSave} loading={saving} variant="danger">Submit Incident Report</Btn>
      </div>
    </Sheet>
  )
}

function EndShiftSheet({ open, onClose, shift, companyId, employeeId, mode, onEnded }) {
  const [meter,         setMeter]     = useState('')
  const [idleHrs,       setIdleHrs]   = useState('')
  const [breakdownType, setBdType]    = useState('')
  const [workDesc,      setWorkDesc]  = useState('')
  const [notes,         setNotes]     = useState('')
  const [meterFile,     setMeterFile] = useState(null)
  const [meterPreview,  setMeterPrev] = useState(null)
  const [logoutFile,    setLogoutFile]= useState(null)
  const [logoutPreview, setLogoutPrev]= useState(null)
  const [saving, setSaving]           = useState(false)

  const handleMeterPhoto  = f => { setMeterFile(f);  setMeterPrev(URL.createObjectURL(f)) }
  const handleLogoutPhoto = f => { setLogoutFile(f); setLogoutPrev(URL.createObjectURL(f)) }

  const canSubmit = meter && meterFile && logoutFile

  const handleEnd = async () => {
    if (!meter)      return toast.error('Enter end hour meter reading')
    if (!meterFile)  return toast.error('Take a photo of the closing meter')
    if (!logoutFile) return toast.error('Take a logout / presence photo')
    setSaving(true)
    try {
      const endTime = nowTime()
      const [{ url: meterUrl, location }, { url: logoutUrl }] = await Promise.all([
        stampAndUpload(meterFile,  'Shift End — Hour Meter'),
        stampAndUpload(logoutFile, 'Logout — Presence'),
      ])
      const startM   = Number(shift.start_meter) || 0
      const endM     = Number(meter)
      const meterHrs = endM > startM ? endM - startM : 0
      const [sh, sm] = (shift.start_time || '00:00').split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      const clockHrs = Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60)

      const { error } = await supabase.from('shifts').update({
        end_time: endTime, end_meter: endM, end_meter_photo: meterUrl,
        logout_photo_url: logoutUrl,
        end_location: location, working_hours: meterHrs,
        idle_hours: idleHrs ? Number(idleHrs) : 0,
        notes: [workDesc ? `Work: ${workDesc}` : '', notes ? `Handover: ${notes}` : ''].filter(Boolean).join(' | ') || null,
        status: 'closed',
      }).eq('id', shift.id)
      if (error) throw error

      // ── Auto attendance from clock time ──────────────────────────────────
      if (employeeId) {
        const attStatus = clockHrs >= 4 ? 'present' : clockHrs > 0 ? 'half_day' : 'absent'
        const attPayload = {
          company_id: companyId, employee_id: employeeId,
          attendance_date: shift.shift_date, status: attStatus,
          shift_start_time: shift.start_time, shift_end_time: endTime,
          notes: `Auto — ${meterHrs.toFixed(1)} meter hrs, ${clockHrs.toFixed(1)} clock hrs`,
        }
        const { data: existing } = await supabase.from('hr_attendance')
          .select('id').eq('employee_id', employeeId).eq('attendance_date', shift.shift_date).maybeSingle()
        if (existing) {
          await supabase.from('hr_attendance').update(attPayload).eq('id', existing.id)
        } else {
          await supabase.from('hr_attendance').insert(attPayload)
        }
      }

      const label = clockHrs >= 4 ? 'Present' : clockHrs > 0 ? 'Half Day' : ''
      toast.success(`Shift ended · ${meterHrs.toFixed(1)} meter hrs · ${clockHrs.toFixed(1)} clock hrs${label ? ` · ${label}` : ''}`)
      onEnded()
      onClose()
      // reset
      setMeter(''); setIdleHrs(''); setBdType(''); setWorkDesc(''); setNotes(''); setPhoto(null); setPP(null)
    } catch (err) { toast.error(err.message || 'Failed')
    } finally { setSaving(false) }
  }

  const meterDelta = meter && shift.start_meter ? Math.max(0, Number(meter) - Number(shift.start_meter)).toFixed(1) : null
  const clockPreview = (() => {
    if (!shift.start_time) return null
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const now = new Date()
    const mins = (now.getHours() * 60 + now.getMinutes()) - (sh * 60 + sm)
    if (mins <= 0) return null
    return { hrs: (mins/60).toFixed(1), isHalfDay: mins/60 < 4 }
  })()

  const BREAKDOWN_TYPES = ['Mechanical','Electrical','Hydraulic','Fuel/Starvation','Operator Error','Waiting for Work','Other']

  return (
    <Sheet open={open} onClose={onClose} title="🏁 End Shift">
      <div className="space-y-5">
        {/* Shift summary */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 space-y-1.5">
          <InfoRow label="Started at" value={shift.start_time} />
          <InfoRow label="Start meter" value={`${Number(shift.start_meter).toLocaleString('en-IN')} hrs`} />
          {clockPreview && (
            <div className="flex justify-between text-sm pt-1 border-t border-dark-700">
              <span className="text-slate-400">Time on site</span>
              <span className={`font-semibold ${clockPreview.isHalfDay ? 'text-yellow-400' : 'text-green-400'}`}>
                {clockPreview.hrs} hrs {clockPreview.isHalfDay ? '— Half Day' : '— Full Day'}
              </span>
            </div>
          )}
        </div>

        <div>
          <FL>End Hour Meter Reading *</FL>
          <input type="number" className={bigNum} value={meter} onChange={e => setMeter(e.target.value)}
            placeholder="0000.0" step="0.1" min={shift.start_meter||0} inputMode="decimal" />
          {meterDelta && <p className="text-center text-sm text-primary-400 font-semibold mt-2">{meterDelta} working hrs (meter)</p>}
        </div>

        {/* Required photos */}
        <div className="space-y-3 bg-dark-800 border border-dark-600 rounded-2xl p-4">
          <p className="text-xs text-amber-400 font-semibold uppercase tracking-wide">📷 Required Photos — both must be taken</p>

          <div className={`rounded-xl border-2 p-3 transition-all ${meterFile ? 'border-green-600/60 bg-green-900/10' : 'border-dashed border-dark-500'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meterFile ? 'bg-green-700/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {meterFile ? '✓ Done' : 'Required'}
              </span>
              <span className="text-xs text-slate-300">Closing Meter Photo</span>
            </div>
            <PhotoCapture label="" onCapture={handleMeterPhoto} preview={meterPreview} />
          </div>

          <div className={`rounded-xl border-2 p-3 transition-all ${logoutFile ? 'border-green-600/60 bg-green-900/10' : 'border-dashed border-dark-500'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${logoutFile ? 'bg-green-700/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {logoutFile ? '✓ Done' : 'Required'}
              </span>
              <span className="text-xs text-slate-300">Logout / Presence Photo</span>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">Selfie or site photo confirming your end-of-shift presence</p>
            <PhotoCapture label="" onCapture={handleLogoutPhoto} preview={logoutPreview} />
          </div>
        </div>

        {/* Advanced mode extra fields */}
        {mode === 'advanced' && (
          <>
            <div>
              <FL>Work Done This Shift</FL>
              <textarea className={`${inp} resize-none`} rows={2} value={workDesc} onChange={e => setWorkDesc(e.target.value)}
                placeholder="Brief description of work performed…" />
            </div>
            <div>
              <FL>Idle / Breakdown Hours</FL>
              <input type="number" className={inp} value={idleHrs} onChange={e => setIdleHrs(e.target.value)}
                placeholder="0.0" step="0.5" min="0" inputMode="decimal" />
            </div>
            {idleHrs && Number(idleHrs) > 0 && (
              <div>
                <FL>Breakdown / Idle Reason</FL>
                <select className={inp} value={breakdownType} onChange={e => setBdType(e.target.value)}>
                  <option value="">Select reason…</option>
                  {BREAKDOWN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        <div>
          <FL>Handover Notes for Next Operator</FL>
          <textarea className={`${inp} resize-none`} rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Any issues, fuel level, pending work…" />
        </div>

        <div className="bg-blue-950/30 border border-blue-700/20 rounded-xl px-3 py-2">
          <p className="text-[11px] text-blue-400">📋 Attendance auto-marked on submit: ≥4 clock hrs = Present · &lt;4 hrs = Half Day</p>
        </div>

        <Btn onClick={handleEnd} loading={saving} disabled={!canSubmit}>
          {canSubmit ? '🏁 End Shift & Record Attendance' : `Complete ${!meter ? 'meter reading' : !meterFile ? 'meter photo' : 'logout photo'} first`}
        </Btn>
      </div>
    </Sheet>
  )
}

function ActionBtn({ icon, label, onClick, color }) {
  const C = { yellow:'bg-yellow-900/30 border-yellow-700/30 text-yellow-400', orange:'bg-orange-900/30 border-orange-700/30 text-orange-400', red:'bg-red-900/30 border-red-700/30 text-red-400' }
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-4 rounded-2xl border font-medium transition-all active:scale-95 ${C[color]}`}>
      <span className="text-2xl">{icon}</span>
      <span className="text-[11px]">{label}</span>
    </button>
  )
}

function ShiftModule({ companyId, operatorId, employeeId, employeeName, mode }) {
  const qc = useQueryClient()
  const [fuelOpen,     setFuelOpen]   = useState(false)
  const [incOpen,      setIncOpen]    = useState(false)
  const [endOpen,      setEndOpen]    = useState(false)
  const [alarmType,    setAlarmType]  = useState(null)   // 'overdue' | 'login_reminder' | null
  const [alarmDismiss, setDismissed]  = useState(false)
  const [elapsedHrs,   setElapsed]    = useState(0)

  // Equipment lookup — SECURITY DEFINER RPC bypasses RLS, uses auth.uid() server-side
  const { data: assignedEq, isLoading: eqLoading } = useQuery({
    queryKey: ['op_assigned_equipment', operatorId, companyId],
    queryFn: async () => {
      const { data: eq, error } = await supabase.rpc('get_my_equipment')
      if (error) { console.error('get_my_equipment error:', error); return null }
      if (!eq) return null
      // Use assignment's shift_type as fallback if equipment doesn't have one
      if (eq && !eq.default_shift_type) eq.default_shift_type = eq.assignment_shift_type
      return eq
    },
    enabled: !!companyId && !!operatorId,
  })

  // Project shift timing
  const { data: project } = useQuery({
    queryKey: ['op_project_timing', assignedEq?.current_project_id],
    queryFn: async () => {
      const { data } = await supabase.from('projects')
        .select('id,project_name,shift_start_time,shift_end_time,shift_grace_mins')
        .eq('id', assignedEq.current_project_id).maybeSingle()
      return data || null
    },
    enabled: !!assignedEq?.current_project_id,
  })

  // Today's active shift
  const { data: activeShift, isLoading: shiftLoading, refetch: refetchShift } = useQuery({
    queryKey: ['op_active_shift', employeeId, today()],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('*, equipment:equipment_id(name,equipment_number,category)')
        .eq('company_id', companyId).eq('operator_id', employeeId)
        .eq('shift_date', today()).eq('status','open')
        .order('created_at', { ascending:false }).limit(1).maybeSingle()
      return data || null
    },
    enabled: !!companyId && !!employeeId,
    refetchInterval: 30_000,          // poll every 30 s as fallback
    refetchIntervalInBackground: true,
  })

  // Realtime: instantly sync shift state across devices
  useEffect(() => {
    if (!companyId || !employeeId) return
    const channel = supabase
      .channel(`op_shift_${employeeId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shifts',
        filter: `operator_id=eq.${employeeId}`,
      }, () => {
        qc.invalidateQueries(['op_active_shift', employeeId, today()])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [companyId, employeeId])

  // Alarm / reminder system — checks every 60 s
  useEffect(() => {
    const OVERDUE_HRS = 10   // fire alarm if shift > 10 hrs

    const check = () => {
      if (activeShift) {
        const [sh, sm] = (activeShift.start_time || '00:00').split(':').map(Number)
        const now = new Date()
        const hrs = ((now.getHours() * 60 + now.getMinutes()) - (sh * 60 + sm)) / 60
        setElapsed(Math.max(0, hrs))
        if (hrs > OVERDUE_HRS) {
          if (!alarmDismiss) setAlarmType('overdue')
          fireNotification(
            '🚨 Shift Overdue',
            `Your shift has been running for ${hrs.toFixed(1)} hours. Please close your shift!`,
            'shift-overdue'
          )
        } else {
          setAlarmType(null)
        }
      } else if (assignedEq && project) {
        // Check if within shift window but no shift started
        const { allowed } = checkShiftWindow(project, assignedEq)
        if (allowed) {
          if (!alarmDismiss) setAlarmType('login_reminder')
          fireNotification(
            '⏰ Shift Reminder',
            'Your shift window is open. Don\'t forget to start your shift!',
            'shift-login-reminder'
          )
        } else {
          setAlarmType(null)
        }
      }
    }

    check()   // run immediately
    const timer = setInterval(check, 60_000)   // then every 60 s
    return () => clearInterval(timer)
  }, [activeShift, assignedEq, project, alarmDismiss])

  // Fuel entries
  const { data: fuelEntries = [] } = useQuery({
    queryKey: ['op_shift_fuel', activeShift?.id],
    queryFn: async () => {
      if (!activeShift?.id) return []
      const { data } = await supabase.from('shift_fuel_entries').select('*').eq('shift_id', activeShift.id).order('created_at')
      return data || []
    },
    enabled: !!activeShift?.id,
  })

  const totalFuel = fuelEntries.reduce((s,f) => s + (Number(f.quantity_liters)||0), 0)

  const onEnded = () => {
    refetchShift()
    qc.invalidateQueries(['op_active_shift', employeeId, today()])
    qc.invalidateQueries(['op_attendance_today', employeeId, today()])
    qc.invalidateQueries(['op_attendance_month', employeeId])
    qc.invalidateQueries(['op_live_salary', operatorId])
  }

  if (eqLoading || shiftLoading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
    </div>
  )

  // No equipment assigned
  if (!assignedEq) return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 text-center">
      <div className="text-4xl mb-3">🏗</div>
      <p className="text-slate-200 font-semibold">No Equipment Assigned</p>
      <p className="text-slate-500 text-sm mt-2">Contact your supervisor or HR to get an equipment assignment before you can start a shift.</p>
    </div>
  )

  // No active shift → show start form
  if (!activeShift) {
    const check = checkShiftWindow(project, assignedEq)
    const hour  = new Date().getHours()
    const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'

    return (
      <div className="space-y-5">
        <div className="text-center">
          <p className="text-slate-200 font-semibold text-lg">Good {greeting}!</p>
          <p className="text-slate-500 text-sm mt-0.5">No active shift today</p>
        </div>
        <AssignedEquipmentCard equipment={assignedEq} project={project} />
        {!check.allowed && <ShiftWindowBanner check={check} />}
        {check.allowed && (
          <StartShiftForm companyId={companyId} operatorId={operatorId} employeeId={employeeId}
            equipment={assignedEq} project={project} mode={mode} onStarted={refetchShift} />
        )}
      </div>
    )
  }

  // Active shift view
  const eq = activeShift.equipment
  const [sh, sm] = (activeShift.start_time||'00:00').split(':').map(Number)
  const now = new Date()
  const currentElapsed = ((now.getHours()*60+now.getMinutes()) - (sh*60+sm)) / 60
  const isHalfDaySoFar = currentElapsed < 4

  const handleDismissAlarm = () => {
    setDismissed(true)
    setAlarmType(null)
    // Re-enable alarm after 30 min so it fires again
    setTimeout(() => setDismissed(false), 30 * 60 * 1000)
  }

  return (
    <div className="space-y-4">
      {/* Alarm / reminder banner */}
      {alarmType && (
        <ShiftAlarmBanner
          type={alarmType}
          elapsedHrs={elapsedHrs}
          onEndNow={() => { setEndOpen(true); handleDismissAlarm() }}
          onDismiss={handleDismissAlarm}
        />
      )}

      {/* Active shift card */}
      <div className="bg-gradient-to-br from-primary-900/40 to-dark-800 border border-primary-700/30 rounded-2xl p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[10px] text-primary-400 uppercase tracking-widest font-semibold">Active Shift</p>
            <p className="text-slate-100 font-bold text-lg mt-0.5">{eq?.name}</p>
            <p className="text-slate-500 text-xs">{eq?.equipment_number}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary-300">{Math.max(0,currentElapsed).toFixed(1)}</p>
            <p className={`text-[10px] font-semibold ${isHalfDaySoFar ? 'text-yellow-400' : 'text-green-400'}`}>
              hrs · {isHalfDaySoFar ? 'Half Day so far' : 'Full Day ✓'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-dark-800/60 rounded-xl py-2">
            <p className="text-sm font-bold text-slate-100">{activeShift.start_time}</p>
            <p className="text-[10px] text-slate-500">Started</p>
          </div>
          <div className="bg-dark-800/60 rounded-xl py-2">
            <p className="text-sm font-bold text-slate-100">{Number(activeShift.start_meter).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Start Meter</p>
          </div>
          <div className="bg-dark-800/60 rounded-xl py-2">
            <p className="text-sm font-bold text-yellow-300">{fmtN(totalFuel,1)} L</p>
            <p className="text-[10px] text-slate-500">Fuel</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ActionBtn icon="⛽" label="Record Fuel" onClick={() => setFuelOpen(true)} color="yellow" />
        <ActionBtn icon="⚠️" label="Incident"    onClick={() => setIncOpen(true)}  color="orange" />
        <ActionBtn icon="🏁" label="End Shift"   onClick={() => setEndOpen(true)}  color="red"    />
      </div>

      {fuelEntries.length > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Fuel Today</p>
          {fuelEntries.map(f => (
            <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-dark-700 last:border-0">
              <p className="text-xs text-slate-400">{new Date(f.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</p>
              <p className="text-sm font-semibold text-yellow-400">{Number(f.quantity_liters)} L</p>
              <p className="text-xs text-slate-500 capitalize">{f.fuel_source==='client'?'Client':'Tank'}</p>
              {f.receipt_url && <a href={f.receipt_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary-400">📷</a>}
            </div>
          ))}
        </div>
      )}

      <RecordFuelSheet     open={fuelOpen} onClose={() => setFuelOpen(false)} shift={activeShift} companyId={companyId} mode={mode} />
      <RecordIncidentSheet open={incOpen}  onClose={() => setIncOpen(false)}  shift={activeShift} companyId={companyId} mode={mode} />
      <EndShiftSheet       open={endOpen}  onClose={() => setEndOpen(false)}  shift={activeShift} companyId={companyId} employeeId={employeeId} mode={mode} onEnded={onEnded} />
    </div>
  )
}

// ─── ATTENDANCE MODULE ────────────────────────────────────────────────────────

function AttendanceModule({ companyId, operatorId, employeeId, mode }) {
  const qc = useQueryClient()
  const [leaveOpen, setLeaveOpen] = useState(false)
  const todayStr = today()
  const now = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  const STATUS_COLOR = { present:'text-green-400', absent:'text-red-400', on_leave:'text-blue-400', half_day:'text-yellow-400', holiday:'text-purple-400' }

  const { data: todayShift } = useQuery({
    queryKey: ['op_today_shift_att', employeeId, todayStr],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('start_time,end_time,working_hours,status,equipment:equipment_id(name,equipment_number)')
        .eq('company_id', companyId).eq('operator_id', employeeId).eq('shift_date', todayStr)
        .order('created_at',{ascending:false}).limit(1).maybeSingle()
      return data || null
    },
    enabled: !!companyId && !!employeeId, refetchInterval: 30000,
  })

  const { data: todayAtt } = useQuery({
    queryKey: ['op_attendance_today', employeeId, todayStr],
    queryFn: async () => {
      if (!employeeId) return null
      const { data } = await supabase.from('hr_attendance')
        .select('*').eq('employee_id', employeeId).eq('attendance_date', todayStr).maybeSingle()
      return data || null
    },
    enabled: !!employeeId,
  })

  const { data: monthAtt = [] } = useQuery({
    queryKey: ['op_attendance_month', employeeId, year, month],
    queryFn: async () => {
      if (!employeeId) return []
      const from = `${year}-${String(month).padStart(2,'0')}-01`
      const to   = `${year}-${String(month).padStart(2,'0')}-31`
      const { data } = await supabase.from('hr_attendance')
        .select('*').eq('employee_id', employeeId).gte('attendance_date', from).lte('attendance_date', to)
        .order('attendance_date',{ascending:false})
      return data || []
    },
    enabled: !!employeeId,
  })

  const { data: leaves = [] } = useQuery({
    queryKey: ['op_leaves', employeeId],
    queryFn: async () => {
      if (!employeeId) return []
      const { data } = await supabase.from('hr_leaves')
        .select('*').eq('employee_id', employeeId).order('created_at',{ascending:false}).limit(20)
      return data || []
    },
    enabled: !!employeeId,
  })

  const daysPresent = monthAtt.filter(a=>a.status==='present').length
  const daysHalf    = monthAtt.filter(a=>a.status==='half_day').length
  const daysAbsent  = monthAtt.filter(a=>a.status==='absent').length
  const daysLeave   = monthAtt.filter(a=>a.status==='on_leave').length

  return (
    <div className="space-y-4">
      {/* Today card */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
          Today · {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}
        </p>
        <div className="bg-primary-950/40 border border-primary-800/30 rounded-xl px-3 py-2 mb-3">
          <p className="text-[11px] text-primary-400">📋 Attendance auto-tracked from shift — start & end your shift in the Shift tab</p>
        </div>
        {todayShift ? (
          <div className="space-y-1.5">
            <InfoRow label="Equipment" value={todayShift.equipment?.name} />
            <InfoRow label="Shift started" value={todayShift.start_time} accent="text-green-400" />
            {todayShift.end_time
              ? <InfoRow label="Shift ended" value={todayShift.end_time} accent="text-orange-400" />
              : <div className="flex justify-between text-sm"><span className="text-slate-400">Status</span><span className="text-primary-400 font-semibold animate-pulse">● In progress</span></div>
            }
            {todayShift.working_hours > 0 && <InfoRow label="Working hrs (meter)" value={`${Number(todayShift.working_hours).toFixed(1)} hrs`} />}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-2">No shift started today</p>
        )}
        {todayAtt && (
          <div className={`mt-3 rounded-xl px-3 py-2 border flex items-center justify-between ${todayAtt.status==='present' ? 'bg-green-900/20 border-green-700/30' : todayAtt.status==='half_day' ? 'bg-yellow-900/20 border-yellow-700/30' : 'bg-dark-700 border-dark-600'}`}>
            <p className="text-xs text-slate-400">Today's attendance</p>
            <span className={`text-sm font-bold capitalize ${STATUS_COLOR[todayAtt.status]||'text-slate-300'}`}>
              {todayAtt.status?.replace('_',' ')}
            </span>
          </div>
        )}
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-4 gap-2">
        {[['Present',daysPresent,'text-green-400'],['Half',daysHalf,'text-yellow-400'],['Absent',daysAbsent,'text-red-400'],['Leave',daysLeave,'text-blue-400']].map(([l,v,c]) => (
          <div key={l} className="bg-dark-800 border border-dark-600 rounded-xl p-2.5 text-center">
            <p className={`text-xl font-bold ${c}`}>{v}</p>
            <p className="text-[9px] text-slate-500 mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      {/* Leave */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-300">Leave Requests</p>
        <button onClick={() => setLeaveOpen(true)}
          className="text-xs text-primary-400 bg-primary-900/20 border border-primary-700/30 px-3 py-1.5 rounded-lg">
          + Apply Leave
        </button>
      </div>
      {leaves.length === 0 && <p className="text-slate-600 text-xs text-center py-2">No leave requests yet</p>}
      {leaves.slice(0,5).map(l => (
        <div key={l.id} className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-200 capitalize">{l.leave_type} Leave</p>
            <p className="text-xs text-slate-500">{l.from_date} → {l.to_date} · {l.days} day{l.days!==1?'s':''}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${l.status==='approved'?'bg-green-900/30 text-green-400':l.status==='rejected'?'bg-red-900/30 text-red-400':'bg-yellow-900/30 text-yellow-400'}`}>
            {l.status}
          </span>
        </div>
      ))}

      {/* Full history — Advanced */}
      {mode === 'advanced' && monthAtt.length > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <p className="text-xs text-slate-500 uppercase tracking-wide px-4 py-2.5 border-b border-dark-700">
            {now.toLocaleString('en-IN',{month:'long',year:'numeric'})} History
          </p>
          <div className="divide-y divide-dark-700 max-h-72 overflow-y-auto">
            {monthAtt.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <p className="text-xs text-slate-500 w-14 shrink-0">{new Date(a.attendance_date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric'})}</p>
                <p className="text-xs text-slate-400 flex-1">{a.shift_start_time||'—'} → {a.shift_end_time||'—'}</p>
                <span className={`text-xs font-semibold capitalize shrink-0 ${STATUS_COLOR[a.status]||'text-slate-400'}`}>{a.status?.replace('_',' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <LeaveRequestSheet open={leaveOpen} onClose={() => setLeaveOpen(false)}
        companyId={companyId} employeeId={employeeId}
        onSaved={() => qc.invalidateQueries(['op_leaves', employeeId])} />
    </div>
  )
}

function LeaveRequestSheet({ open, onClose, companyId, employeeId, onSaved }) {
  const [type, setType]     = useState('casual')
  const [from, setFrom]     = useState(today())
  const [to, setTo]         = useState(today())
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!employeeId) return toast.error('Employee record not linked')
    const days = Math.max(1, Math.round((new Date(to)-new Date(from))/86400000)+1)
    setSaving(true)
    try {
      await supabase.from('hr_leaves').insert({
        company_id: companyId, employee_id: employeeId,
        leave_type: type, from_date: from, to_date: to, days, reason, status: 'pending',
      })
      toast.success('Leave request submitted')
      onSaved(); onClose(); setReason(''); setType('casual')
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Apply for Leave">
      <div className="space-y-4">
        <div>
          <FL>Leave Type</FL>
          <div className="grid grid-cols-3 gap-2">
            {['casual','sick','earned','unpaid','comp_off'].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`py-2 rounded-lg text-xs font-semibold capitalize ${type===t?'bg-primary-600 text-white':'bg-dark-700 text-slate-400 border border-dark-500'}`}>
                {t.replace('_',' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><FL>From</FL><input type="date" className={inp} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><FL>To</FL><input type="date" className={inp} value={to}   onChange={e => setTo(e.target.value)}   /></div>
        </div>
        <div><FL>Reason</FL><textarea className={`${inp} resize-none`} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for leave…" /></div>
        <Btn onClick={handleSubmit} loading={saving}>Submit Request</Btn>
      </div>
    </Sheet>
  )
}

// ─── HR MODULE ────────────────────────────────────────────────────────────────

function HRModule({ companyId, operatorId, employeeId, profile, mode }) {
  const [editOpen, setEditOpen] = useState(false)
  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()
  const qc = useQueryClient()

  const { data: salary } = useQuery({
    queryKey: ['op_salary_structure', employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      const { data } = await supabase.from('hr_salary_structure')
        .select('*').eq('employee_id', employeeId).order('effective_from',{ascending:false}).limit(1).maybeSingle()
      return data || null
    },
    enabled: !!employeeId,
  })

  // Live earnings: attendance × daily_rate (updates every shift completion)
  const { data: liveEarnings } = useQuery({
    queryKey: ['op_live_salary', operatorId, year, month],
    queryFn: async () => {
      if (!employeeId || !salary) return null
      const dailyRate = Number(salary.daily_rate) ||
        ((Number(salary.basic_salary)||0)+(Number(salary.hra)||0)+(Number(salary.special_allowance)||0)+(Number(salary.other_allowance)||0)) / 26
      if (!dailyRate) return null

      const from = `${year}-${String(month).padStart(2,'0')}-01`
      const to   = `${year}-${String(month).padStart(2,'0')}-31`
      const { data: att } = await supabase.from('hr_attendance')
        .select('status').eq('employee_id', employeeId).gte('attendance_date', from).lte('attendance_date', to)

      const present = (att||[]).filter(a=>a.status==='present').length
      const halfDay = (att||[]).filter(a=>a.status==='half_day').length
      const earnedDays = present + halfDay * 0.5
      return { dailyRate, present, halfDay, earnedDays, earned: earnedDays * dailyRate }
    },
    enabled: !!employeeId && !!salary,
  })

  const { data: payslip } = useQuery({
    queryKey: ['op_payslip', operatorId, year, month],
    queryFn: async () => {
      const { data } = await supabase.from('salary_records')
        .select('*').eq('user_id', operatorId).eq('year', year).eq('month', month).maybeSingle()
      return data || null
    },
    enabled: !!operatorId,
  })

  // Salary history (Advanced)
  const { data: salHistory = [] } = useQuery({
    queryKey: ['op_salary_history', employeeId],
    queryFn: async () => {
      if (!employeeId) return []
      const { data } = await supabase.from('hr_salary_history')
        .select('*').eq('employee_id', employeeId).order('created_at',{ascending:false}).limit(10)
      return data || []
    },
    enabled: !!employeeId && mode === 'advanced',
  })

  const gross = salary
    ? (Number(salary.basic_salary)||0)+(Number(salary.hra)||0)+(Number(salary.special_allowance)||0)+(Number(salary.other_allowance)||0)
    : 0

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="bg-gradient-to-br from-dark-800 to-dark-900 border border-dark-600 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary-900/40 border-2 border-primary-700/40 flex items-center justify-center text-xl font-bold text-primary-300 shrink-0">
          {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-lg truncate">{profile?.full_name}</p>
          <p className="text-slate-400 text-sm">{profile?.designation || 'Operator'}</p>
          {profile?.employee_id && <p className="text-xs text-slate-500 font-mono">{profile.employee_id}</p>}
        </div>
        <button onClick={() => setEditOpen(true)} className="text-xs text-primary-400 px-2 py-1 rounded-lg bg-primary-900/20 border border-primary-700/20 shrink-0">Edit</button>
      </div>

      {/* Live earnings — THIS MONTH */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
          {now.toLocaleString('en-IN',{month:'long',year:'numeric'})} — Live Earnings
        </p>
        {liveEarnings ? (
          <>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-3xl font-bold text-green-400">{fmt(liveEarnings.earned)}</p>
                <p className="text-xs text-slate-500 mt-0.5">earned so far</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-300">{fmt(liveEarnings.dailyRate)}<span className="text-slate-500 text-xs">/day</span></p>
                <p className="text-xs text-slate-500">{liveEarnings.earnedDays} days</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Present',liveEarnings.present,'text-green-400'],['Half Day',liveEarnings.halfDay,'text-yellow-400'],['Earned Days',liveEarnings.earnedDays.toFixed(1),'text-primary-400']].map(([l,v,c]) => (
                <div key={l} className="bg-dark-900/60 rounded-xl py-2">
                  <p className={`text-lg font-bold ${c}`}>{v}</p>
                  <p className="text-[9px] text-slate-500">{l}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 text-center mt-2">Updates automatically after each shift</p>
          </>
        ) : salary ? (
          <div>
            <p className="text-xs text-slate-500 mb-2">Salary structure on file — attendance data loading…</p>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Gross Monthly</span><span className="text-slate-200 font-semibold">{fmt(gross)}</span></div>
            {salary.daily_rate > 0 && <div className="flex justify-between text-sm mt-1"><span className="text-slate-400">Daily Rate</span><span className="text-slate-200">{fmt(salary.daily_rate)}</span></div>}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-4">No salary information on file.<br/>Contact HR.</p>
        )}
      </div>

      {/* Processed payslip (if available) */}
      {payslip && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Processed Payslip</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${payslip.status==='paid'?'bg-green-900/30 text-green-400':'bg-yellow-900/30 text-yellow-400'}`}>
              {payslip.status==='paid'?'✓ Paid':payslip.status}
            </span>
          </div>
          {[['Days Present',`${payslip.days_present}/${payslip.working_days}`],['Gross Salary',fmt(payslip.gross_salary)],['Deductions',`-${fmt(payslip.deductions)}`],['Net Pay',fmt(payslip.net_salary)]].map(([l,v]) => (
            <div key={l} className="flex justify-between text-sm py-1">
              <span className="text-slate-400">{l}</span>
              <span className={l==='Net Pay'?'text-green-400 font-bold text-base':'text-slate-200'}>{v}</span>
            </div>
          ))}
          {payslip.payment_date && <p className="text-xs text-slate-500 mt-2">Paid on {payslip.payment_date}</p>}
        </div>
      )}

      {/* Advanced: contact info + salary history */}
      {mode === 'advanced' && (
        <>
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Contact & Info</p>
            {[['Phone',profile?.phone],['Joined',profile?.date_of_joining],['Blood Group',profile?.blood_group],['Department',profile?.department],
              ['Emergency',profile?.emergency_contact_name ? `${profile.emergency_contact_name} · ${profile.emergency_contact_phone||''}`:null]
            ].filter(([,v])=>v).map(([l,v]) => (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-slate-500">{l}</span>
                <span className="text-slate-200 text-right max-w-48 truncate">{v}</span>
              </div>
            ))}
          </div>

          {salHistory.length > 0 && (
            <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
              <p className="text-xs text-slate-500 uppercase tracking-wide px-4 py-2.5 border-b border-dark-700">Salary History</p>
              {salHistory.map(h => (
                <div key={h.id} className="px-4 py-2.5 border-b border-dark-700 last:border-0">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300 capitalize">{h.change_type}</span>
                    <span className="text-green-400 font-semibold">
                      {h.percentage_change > 0 ? `+${h.percentage_change}%` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                    <span>{h.effective_date}</span>
                    <span>{fmt(h.previous_basic)} → {fmt(h.new_basic)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} profile={profile} operatorId={operatorId} qc={qc} />
    </div>
  )
}

function EditProfileSheet({ open, onClose, profile, operatorId, qc }) {
  const [phone, setPhone]     = useState(profile?.phone||'')
  const [blood, setBlood]     = useState(profile?.blood_group||'')
  const [ecName, setEcName]   = useState(profile?.emergency_contact_name||'')
  const [ecPhone, setEcPhone] = useState(profile?.emergency_contact_phone||'')
  const [saving, setSaving]   = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.from('user_profiles').update({ phone, blood_group: blood, emergency_contact_name: ecName, emergency_contact_phone: ecPhone }).eq('id', operatorId)
      toast.success('Profile updated')
      qc.invalidateQueries(['op_profile']); onClose()
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit Profile">
      <div className="space-y-4">
        <div><FL>Phone</FL><input className={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile number" type="tel" /></div>
        <div>
          <FL>Blood Group</FL>
          <select className={inp} value={blood} onChange={e => setBlood(e.target.value)}>
            <option value="">Select…</option>
            {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div><FL>Emergency Contact Name</FL><input className={inp} value={ecName} onChange={e => setEcName(e.target.value)} placeholder="Name" /></div>
        <div><FL>Emergency Contact Phone</FL><input className={inp} value={ecPhone} onChange={e => setEcPhone(e.target.value)} placeholder="Phone" type="tel" /></div>
        <Btn onClick={handleSave} loading={saving}>Save Changes</Btn>
      </div>
    </Sheet>
  )
}

// ─── MAIN PORTAL ──────────────────────────────────────────────────────────────

const TABS = [
  { id:'shift',      icon:'⚙️', label:'Shift'      },
  { id:'attendance', icon:'📅', label:'Attendance'  },
  { id:'hr',         icon:'👤', label:'HR & Pay'    },
  { id:'expenses',   icon:'🧾', label:'Expenses'    },
]

export default function OperatorPortal() {
  const { userProfile, company, companyId, signOut } = useAuth()
  const [tab, setTab]   = useState('shift')
  const [mode, setMode] = useState('basic')

  // Request notification permission once on portal load
  useEffect(() => { requestNotificationPermission() }, [])

  const { data: employee } = useQuery({
    queryKey: ['op_employee_record', userProfile?.id],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id,name,employee_number,designation,department')
        .eq('user_id', userProfile.id).maybeSingle()
      return data || null
    },
    enabled: !!userProfile?.id,
  })

  const employeeId   = employee?.id   || null
  const employeeName = employee?.name || null
  const props = { companyId, operatorId: userProfile?.id, employeeId, employeeName, profile: userProfile, mode }

  const content = () => {
    switch (tab) {
      case 'shift':      return <ShiftModule      {...props} />
      case 'attendance': return <AttendanceModule {...props} />
      case 'hr':         return <HRModule         {...props} />
      case 'expenses':   return <FieldExpensePage embedded={true} />
      default:           return null
    }
  }

  return (
    <div className="flex flex-col h-screen bg-dark-900 text-slate-100 max-w-lg mx-auto">
      {/* Top bar */}
      <div className="shrink-0 bg-dark-800 border-b border-dark-700 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{userProfile?.full_name}</p>
          <p className="text-[11px] text-slate-500 truncate">{company?.name} · {userProfile?.designation||'Operator'}</p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
        <button onClick={signOut} className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded-lg hover:bg-dark-700">
          Out
        </button>
      </div>

      {/* Mode indicator */}
      {mode === 'advanced' && (
        <div className="shrink-0 bg-primary-900/20 border-b border-primary-700/20 px-4 py-1.5">
          <p className="text-[10px] text-primary-400 text-center tracking-wide">ADVANCED MODE — additional fields visible</p>
        </div>
      )}

      {/* Content */}
      {tab === 'expenses'
        ? (
          /* Expenses: full-height, no extra padding — FieldExpensePage handles its own layout */
          <div className="flex-1 overflow-hidden flex flex-col pb-16">
            <FieldExpensePage embedded={true} />
          </div>
        )
        : (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 pb-28">
              <div className="flex items-center gap-2 mb-5">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${tab===t.id ? 'bg-primary-600 text-white' : 'bg-dark-800 text-slate-400 border border-dark-600'}`}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              {content()}
            </div>
          </div>
        )
      }

      {/* Bottom nav */}
      <div className="shrink-0 fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-dark-800/95 backdrop-blur border-t border-dark-700">
        <div className="flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${tab===t.id ? 'text-primary-400' : 'text-slate-500'}`}>
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="text-[10px] font-medium">{t.label}</span>
              {tab===t.id && <div className="w-1 h-1 rounded-full bg-primary-400 mt-0.5" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
