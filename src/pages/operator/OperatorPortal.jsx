/**
 * OperatorPortal.jsx — Icon-first operator interface
 * Design rules:
 *  - Zero reading required: icons + colors communicate everything
 *  - Max 3 taps to complete any action
 *  - Photo is the PRIMARY input, not optional
 *  - Large touch targets (min 56px)
 *  - Regional language captions (EN / தமிழ் / हिंदी / తెలుగు)
 *  - Green = good / Red = action needed — no text status
 *  - Equipment PRE-ASSIGNED by admin — operator cannot change it
 *  - Shift type AUTO-FILLED from project — operator cannot change it
 *  - Attendance auto-calculated: ≥4 clock hrs = Present, <4 = Half Day
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

// enforcement: 'off' | 'flexible' | 'strict'
//   off      → no restriction, always allowed
//   flexible → allowed anywhere inside the shift window ± grace (default)
//   strict   → allowed only within ±grace of the shift START time
function checkShiftWindow(project, equipment, enforcement = 'flexible') {
  const shiftType = equipment?.default_shift_type || 'day'

  // Substituted operators bypass the window — admin already approved
  if (equipment?.is_substitution) {
    return { allowed: true, reason: null, shiftType, isSubstitution: true }
  }

  // Off → always open
  if (enforcement === 'off') {
    return { allowed: true, reason: null, shiftType }
  }

  const start = project?.shift_start_time || null
  const end   = project?.shift_end_time   || null
  const grace = project?.shift_grace_mins ?? 30

  // No window configured on the project → always open
  if (!start || !end) return { allowed: true, reason: null, shiftType }

  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const dayStart = sh * 60 + sm   // e.g. 480  (08:00)
  const dayEnd   = eh * 60 + em   // e.g. 1200 (20:00)

  // Double shift: spans the full day, always open
  if (shiftType === 'double') {
    return { allowed: true, reason: null, shiftType }
  }

  // ── Strict mode: ±grace of the shift START time ────────────────────────────
  if (enforcement === 'strict') {
    let shiftStartMins = shiftType === 'night' ? dayEnd : dayStart
    const windowStart = shiftStartMins - grace
    const windowEnd   = shiftStartMins + grace

    // Night shift start crosses midnight — check both sides
    if (shiftType === 'night') {
      if (nowMins >= windowStart || nowMins <= (grace)) {
        return { allowed: true, reason: null, shiftType }
      }
      return { allowed: false, reason: `Must start within ${grace} min of ${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`, shiftType }
    }

    if (nowMins < windowStart || nowMins > windowEnd) {
      return { allowed: false, reason: `Must start within ${grace} min of ${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`, shiftType }
    }
    return { allowed: true, reason: null, shiftType }
  }

  // ── Flexible mode (default): full shift window ± grace ─────────────────────

  // Night shift: window is dayEnd-grace → midnight → dayStart+grace
  if (shiftType === 'night') {
    const nightStart = dayEnd - grace   // e.g. 19:30
    const nightEnd   = dayStart + grace // e.g. 08:30
    if (nowMins >= nightStart || nowMins <= nightEnd) {
      return { allowed: true, reason: null, shiftType }
    }
    return { allowed: false, reason: `Night shift opens at ${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`, shiftType }
  }

  // Day shift
  const windowStart = dayStart - grace
  const windowEnd   = dayEnd + grace

  if (nowMins < windowStart) {
    return { allowed: false, reason: `Shift starts at ${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`, shiftType }
  }
  if (nowMins > windowEnd) {
    return { allowed: false, reason: `Shift window closed`, shiftType }
  }
  return { allowed: true, reason: null, shiftType }
}

// ─── Language System ──────────────────────────────────────────────────────────

const LANGS = {
  en: {
    flag: '🇬🇧', label: 'EN',
    startShift: 'Start Shift', endShift: 'End Shift',
    fuel: 'Fuel', problem: 'Problem',
    shift: 'Shift', attendance: 'Days', pay: 'Pay', expenses: 'Bills',
    meterReading: 'Meter Reading', meterPhoto: 'Meter Photo',
    presencePhoto: 'Your Photo', fuelQty: 'Litres',
    noEquip: 'No Machine Assigned', contactSupervisor: 'Call your supervisor',
    shiftRunning: 'Shift Running', shiftDone: 'Done for Today',
    takePhoto: '📷 Take Photo', photoOk: '✓ Photo Done',
    enterNumber: 'Enter number',
    submit: 'Submit', saving: 'Saving…',
    fullDay: 'Full Day ✓', halfDay: '½ Day',
    present: 'Present', absent: 'Absent', leave: 'Leave',
    good: 'Good', greeting_morning: 'Morning', greeting_afternoon: 'Afternoon', greeting_evening: 'Evening',
    shiftNotAvail: 'Shift Not Open Yet',
    windowClosed: 'Shift Window Closed',
  },
  ta: {
    flag: '🇮🇳', label: 'தமிழ்',
    startShift: 'ஷிஃப்ட் தொடங்கு', endShift: 'ஷிஃப்ட் முடி',
    fuel: 'டீசல்', problem: 'பிரச்சனை',
    shift: 'ஷிஃப்ட்', attendance: 'நாட்கள்', pay: 'சம்பளம்', expenses: 'செலவு',
    meterReading: 'மீட்டர் ரீடிங்', meterPhoto: 'மீட்டர் போட்டோ',
    presencePhoto: 'உங்கள் போட்டோ', fuelQty: 'லிட்டர்',
    noEquip: 'இயந்திரம் இல்லை', contactSupervisor: 'சூப்பர்வைசரை அழைக்கவும்',
    shiftRunning: 'ஷிஃப்ட் நடக்கிறது', shiftDone: 'இன்றைய வேலை முடிந்தது',
    takePhoto: '📷 போட்டோ எடு', photoOk: '✓ போட்டோ சரி',
    enterNumber: 'எண் உள்ளிடவும்',
    submit: 'சமர்ப்பி', saving: 'சேமிக்கிறது…',
    fullDay: 'முழு நாள் ✓', halfDay: 'அரை நாள்',
    present: 'வந்தார்', absent: 'வரவில்லை', leave: 'விடுப்பு',
    good: 'வணக்கம்', greeting_morning: 'காலை', greeting_afternoon: 'மதியம்', greeting_evening: 'மாலை',
    shiftNotAvail: 'ஷிஃப்ட் நேரம் இல்லை',
    windowClosed: 'ஷிஃப்ட் முடிந்தது',
  },
  hi: {
    flag: '🇮🇳', label: 'हिंदी',
    startShift: 'शिफ्ट शुरू', endShift: 'शिफ्ट खत्म',
    fuel: 'डीजल', problem: 'समस्या',
    shift: 'शिफ्ट', attendance: 'दिन', pay: 'तनख्वाह', expenses: 'खर्च',
    meterReading: 'मीटर रीडिंग', meterPhoto: 'मीटर फोटो',
    presencePhoto: 'आपकी फोटो', fuelQty: 'लीटर',
    noEquip: 'मशीन नहीं मिली', contactSupervisor: 'सुपरवाइजर को बुलाएं',
    shiftRunning: 'शिफ्ट चल रही है', shiftDone: 'आज का काम हो गया',
    takePhoto: '📷 फोटो लें', photoOk: '✓ फोटो ठीक है',
    enterNumber: 'नंबर डालें',
    submit: 'जमा करें', saving: 'सेव हो रहा है…',
    fullDay: 'पूरा दिन ✓', halfDay: 'आधा दिन',
    present: 'उपस्थित', absent: 'अनुपस्थित', leave: 'छुट्टी',
    good: 'नमस्ते', greeting_morning: 'सुबह', greeting_afternoon: 'दोपहर', greeting_evening: 'शाम',
    shiftNotAvail: 'शिफ्ट का समय नहीं',
    windowClosed: 'शिफ्ट बंद है',
  },
  te: {
    flag: '🇮🇳', label: 'తెలుగు',
    startShift: 'షిఫ్ట్ ప్రారంభించు', endShift: 'షిఫ్ట్ ముగించు',
    fuel: 'డీజిల్', problem: 'సమస్య',
    shift: 'షిఫ్ట్', attendance: 'రోజులు', pay: 'జీతం', expenses: 'ఖర్చు',
    meterReading: 'మీటర్ రీడింగ్', meterPhoto: 'మీటర్ ఫోటో',
    presencePhoto: 'మీ ఫోటో', fuelQty: 'లీటర్లు',
    noEquip: 'యంత్రం కేటాయించలేదు', contactSupervisor: 'సూపర్‌వైజర్‌ను పిలవండి',
    shiftRunning: 'షిఫ్ట్ నడుస్తోంది', shiftDone: 'ఈరోజు పని అయింది',
    takePhoto: '📷 ఫోటో తీయండి', photoOk: '✓ ఫోటో సరే',
    enterNumber: 'సంఖ్య నమోదు చేయండి',
    submit: 'సమర్పించండి', saving: 'సేవ్ అవుతోంది…',
    fullDay: 'పూర్తి రోజు ✓', halfDay: 'అర రోజు',
    present: 'హాజరు', absent: 'గైర్హాజరు', leave: 'సెలవు',
    good: 'నమస్కారం', greeting_morning: 'ఉదయం', greeting_afternoon: 'మధ్యాహ్నం', greeting_evening: 'సాయంత్రం',
    shiftNotAvail: 'షిఫ్ట్ సమయం కాదు',
    windowClosed: 'షిఫ్ట్ మూసింది',
  },
}

// ─── Shared UI primitives ──────────────────────────────────────────────────────

/** Full-screen bottom sheet */
function Sheet({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-h-[95vh] bg-dark-900 border-t-2 border-dark-600 rounded-t-3xl overflow-y-auto">
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-dark-600 rounded-full" />
        </div>
        <div className="px-4 pb-8">{children}</div>
      </div>
    </div>
  )
}

/** Big photo capture button with preview */
function BigPhoto({ label, sublabel, onCapture, preview, disabled }) {
  const ref = useRef()
  return (
    <div>
      {label && <p className="text-center text-sm font-semibold text-slate-300 mb-1">{label}</p>}
      {sublabel && <p className="text-center text-xs text-slate-500 mb-3">{sublabel}</p>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className={`w-full rounded-2xl border-2 border-dashed transition-all active:scale-[0.97] flex flex-col items-center justify-center gap-2 disabled:opacity-40
          ${preview
            ? 'border-green-500 bg-green-900/10 p-2'
            : 'border-primary-600/60 bg-dark-800 py-8'
          }`}
      >
        {preview ? (
          <>
            <img src={preview} alt="proof" className="w-full max-h-48 object-cover rounded-xl" />
            <span className="text-green-400 font-bold text-sm py-1">✓ Done — tap to retake</span>
          </>
        ) : (
          <>
            <span className="text-5xl">📷</span>
            <span className="text-slate-300 font-semibold text-base">{label || 'Take Photo'}</span>
          </>
        )}
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => e.target.files?.[0] && onCapture(e.target.files[0])} />
    </div>
  )
}

/** Full-width action button */
function BigBtn({ onClick, disabled, loading, children, color='primary', className='' }) {
  const colors = {
    primary: 'bg-primary-600 hover:bg-primary-500 text-white',
    green:   'bg-green-600 hover:bg-green-500 text-white',
    red:     'bg-red-700 hover:bg-red-600 text-white',
    amber:   'bg-amber-600 hover:bg-amber-500 text-white',
    ghost:   'bg-dark-700 border border-dark-500 text-slate-200',
  }
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg ${colors[color]} ${className}`}>
      {loading
        ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        : children}
    </button>
  )
}

/** Big number input */
function BigNumber({ value, onChange, placeholder = '0', min = 0, step = '0.1', label }) {
  return (
    <div>
      {label && <p className="text-center text-sm text-slate-400 mb-2">{label}</p>}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        min={min}
        className="w-full bg-dark-700 border-2 border-dark-500 focus:border-primary-500 rounded-2xl px-4 py-4 text-4xl font-bold text-slate-100 placeholder-slate-600 focus:outline-none text-center tracking-widest"
      />
    </div>
  )
}

/** Step progress indicator */
function StepDots({ total, current }) {
  return (
    <div className="flex justify-center gap-2 py-3">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`rounded-full transition-all ${i < current ? 'w-3 h-3 bg-green-500' : i === current ? 'w-4 h-4 bg-primary-500' : 'w-3 h-3 bg-dark-600'}`} />
      ))}
    </div>
  )
}

/** Status circle: true=green, false=red, null=grey */
function StatusCircle({ ok, size = 'lg' }) {
  const sz = size === 'lg' ? 'w-16 h-16 text-3xl' : 'w-8 h-8 text-base'
  const col = ok === true ? 'bg-green-500' : ok === false ? 'bg-red-500' : 'bg-dark-600'
  const icon = ok === true ? '✓' : ok === false ? '!' : '·'
  return (
    <div className={`${sz} ${col} rounded-full flex items-center justify-center text-white font-bold shadow-lg`}>
      {icon}
    </div>
  )
}

/** Language selector pill */
function LangPicker({ lang, onChange }) {
  const keys = Object.keys(LANGS)
  return (
    <div className="flex gap-1">
      {keys.map(k => (
        <button key={k} onClick={() => onChange(k)}
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${lang === k ? 'bg-primary-600 text-white' : 'bg-dark-800 text-slate-500 border border-dark-600'}`}>
          {LANGS[k].label}
        </button>
      ))}
    </div>
  )
}

// ─── Notification helpers ─────────────────────────────────────────────────────

function requestNotificationPermission() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') Notification.requestPermission()
}

function fireNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try { new Notification(title, { body, tag, requireInteraction: true, icon: '/nhance-icon.png' }) } catch (_) {}
}

// ─── Overdue Alarm Banner (fixed, full-width) ─────────────────────────────────

function OverdueBanner({ elapsedHrs, onEndNow, onDismiss }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] max-w-lg mx-auto animate-pulse">
      <div className="bg-red-600 px-4 py-3 flex items-center gap-3 shadow-2xl">
        <span className="text-3xl shrink-0">🚨</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-base leading-tight">{Number(elapsedHrs).toFixed(1)} HRS</p>
          <p className="text-red-100 text-xs">Shift too long — end now</p>
        </div>
        <button onClick={onEndNow} className="shrink-0 bg-white text-red-700 font-black text-sm px-4 py-2 rounded-xl active:scale-95">
          END
        </button>
        <button onClick={onDismiss} className="shrink-0 text-red-200 text-2xl px-1">×</button>
      </div>
    </div>
  )
}

// ─── START SHIFT FLOW ─────────────────────────────────────────────────────────

function StartShiftFlow({ companyId, operatorId, employeeId, equipment, project, lang, onStarted, enforcement = 'flexible' }) {
  const L = LANGS[lang]
  const [step, setStep]       = useState(0) // 0=meter, 1=photo, 2=confirm
  const [meter, setMeter]     = useState('')
  const [meterFile, setFile]  = useState(null)
  const [meterPrev, setPrev]  = useState(null)
  const [saving, setSaving]   = useState(false)

  const check = checkShiftWindow(project, equipment, enforcement)

  const handlePhoto = f => { setFile(f); setPrev(URL.createObjectURL(f)) }

  const handleStart = async () => {
    setSaving(true)
    try {
      const { url: meterUrl, location } = await stampAndUpload(meterFile, `${equipment.equipment_number} — Meter Start`)
      const { data, error } = await supabase.from('shifts').insert({
        company_id: companyId, equipment_id: equipment.id, operator_id: employeeId,
        shift_date: today(), shift_type: check.shiftType, start_time: nowTime(),
        start_meter: Number(meter), start_meter_photo: meterUrl,
        start_location: location, project_id: project?.id || null, status: 'open',
      }).select().single()
      if (error) throw error
      toast.success('Shift started! 🚀')
      onStarted(data)
    } catch (err) { toast.error(err.message || 'Failed')
    } finally { setSaving(false) }
  }

  // Shift window blocked
  if (!check.allowed) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 px-4 text-center">
        <div className="w-24 h-24 bg-red-900/40 border-2 border-red-700/40 rounded-full flex items-center justify-center text-5xl">🚫</div>
        <p className="text-red-300 font-bold text-xl">{L.shiftNotAvail}</p>
        <p className="text-slate-500 text-sm">{check.reason}</p>
        {(project?.shift_start_time && project?.shift_end_time) && (
          <div className="bg-dark-800 border border-dark-600 rounded-2xl px-6 py-4">
            <p className="text-slate-400 text-xs mb-1">Shift Window</p>
            <p className="text-slate-100 font-bold text-2xl">
              {project.shift_start_time.slice(0,5)} – {project.shift_end_time.slice(0,5)}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Substitution notice */}
      {equipment.is_substitution && (
        <div className="bg-amber-900/30 border border-amber-600/40 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-2xl shrink-0">🔄</span>
          <div>
            <p className="text-amber-300 font-bold text-sm">Substitution Active</p>
            <p className="text-amber-400/70 text-xs">You are covering for today's {equipment.default_shift_type} shift — approved by manager</p>
          </div>
        </div>
      )}

      {/* Equipment card — compact */}
      <div className={`rounded-2xl p-4 flex items-center gap-3 border ${equipment.is_substitution ? 'bg-dark-800 border-amber-700/30' : 'bg-dark-800 border-primary-700/30'}`}>
        <div className="text-4xl">🏗</div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-lg truncate">{equipment.name}</p>
          <p className="text-slate-500 text-xs font-mono">{equipment.equipment_number}</p>
          {project && <p className="text-primary-400 text-xs mt-0.5 truncate">{project.project_name}</p>}
        </div>
        <div className="text-center">
          <p className={`text-xl font-bold ${equipment.is_substitution ? 'text-amber-400' : 'text-primary-400'}`}>{equipment.default_shift_type || 'day'}</p>
          <p className="text-[10px] text-slate-500">shift</p>
        </div>
      </div>

      {equipment.current_meter_reading && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-2 flex justify-between items-center">
          <span className="text-xs text-slate-500">Last meter</span>
          <span className="text-sm font-mono font-bold text-slate-200">{Number(equipment.current_meter_reading).toLocaleString('en-IN')} hrs</span>
        </div>
      )}

      <StepDots total={2} current={step} />

      {/* Step 0: Meter reading */}
      {step === 0 && (
        <div className="space-y-4">
          <BigNumber value={meter} onChange={setMeter} placeholder="0000.0" label={L.meterReading} />
          <BigBtn onClick={() => setStep(1)} disabled={!meter || Number(meter) <= 0} color="primary">
            Next →
          </BigBtn>
        </div>
      )}

      {/* Step 1: Meter photo + Submit */}
      {step === 1 && (
        <div className="space-y-4">
          <BigPhoto label={L.meterPhoto} sublabel={equipment.equipment_number} onCapture={handlePhoto} preview={meterPrev} />
          <div className="flex gap-3">
            <BigBtn onClick={() => setStep(0)} color="ghost" className="max-w-20">← {meter}</BigBtn>
            <BigBtn onClick={handleStart} disabled={!meterFile} loading={saving} color="green" className="flex-1">
              🚀 {L.startShift}
            </BigBtn>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SLIDE TO END SHIFT ────────────────────────────────────────────────────────

function SlideToEnd({ onEnd }) {
  const [progress, setProgress]   = useState(0)
  const [active,   setActive]     = useState(false)
  const trackRef  = useRef(null)
  const startRef  = useRef({ x: 0, w: 300 })

  const THUMB   = 60    // knob diameter px
  const PAD     = 5     // padding from track edge
  const TRIGGER = 0.80  // 80% travel = fire

  const calcProgress = (clientX) => {
    const travel = startRef.current.w - THUMB - PAD * 2
    if (travel <= 0) return 0
    // thumb starts on RIGHT → slide LEFT to increase progress
    const moved = startRef.current.x - clientX
    return Math.max(0, Math.min(1, moved / travel))
  }

  const onStart = (clientX) => {
    startRef.current = {
      x: clientX,
      w: trackRef.current?.offsetWidth || 300,
    }
    setActive(true)
  }

  const onMove = (clientX) => {
    if (!active) return
    setProgress(calcProgress(clientX))
  }

  const onRelease = (clientX) => {
    if (!active) return
    setActive(false)
    if (calcProgress(clientX) >= TRIGGER) {
      navigator.vibrate?.(80)
      onEnd()
    }
    setProgress(0)
  }

  const hot = progress >= 0.55
  // Thumb CSS position: p=0 → right side, p=1 → left side
  const thumbLeft = `calc(${(1 - progress).toFixed(4)} * (100% - ${THUMB + PAD * 2}px) + ${PAD}px)`

  // Track fill grows from left as knob slides left
  const fillWidth = `calc(${(1 - progress).toFixed(4)} * (100% - ${THUMB + PAD * 2}px) + ${PAD}px)`

  return (
    <div
      ref={trackRef}
      onTouchStart={e => onStart(e.touches[0].clientX)}
      onTouchMove={e => onMove(e.touches[0].clientX)}
      onTouchEnd={e => onRelease(e.changedTouches[0].clientX)}
      onMouseDown={e => onStart(e.clientX)}
      onMouseMove={e => { if (active) onMove(e.clientX) }}
      onMouseUp={e => onRelease(e.clientX)}
      onMouseLeave={() => { if (active) { setActive(false); setProgress(0) } }}
      className="relative select-none touch-none rounded-full overflow-hidden"
      style={{
        height: '76px',
        background: hot
          ? `rgba(185, 28, 28, ${0.80 + progress * 0.18})`   // bright red when hot
          : 'rgba(127, 29, 29, 0.92)',                        // deep solid dark-red at rest
        border: `2px solid ${hot ? 'rgba(252,100,100,0.75)' : 'rgba(220,80,80,0.55)'}`,
        boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
        cursor: active ? 'grabbing' : 'grab',
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      {/* Bright fill strip that sweeps left as knob moves */}
      <div
        className="absolute inset-y-0 right-0 pointer-events-none"
        style={{
          width: fillWidth,
          background: 'rgba(239,68,68,0.18)',
          transition: active ? 'none' : 'width 0.35s cubic-bezier(.4,0,.2,1)',
        }}
      />

      {/* Track label — bright white, always legible */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ paddingRight: `${THUMB + PAD * 2 + 8}px` }}   // stay left of knob
      >
        <span
          className="text-sm font-black tracking-[0.18em] uppercase pointer-events-none"
          style={{
            color: `rgba(255,255,255,${0.90 - progress * 0.80})`,
            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
            letterSpacing: '0.18em',
          }}
        >
          ← Slide to End Shift
        </span>
      </div>

      {/* Knob */}
      <div
        className="absolute flex items-center justify-center rounded-full pointer-events-none"
        style={{
          width: `${THUMB}px`,
          height: `${THUMB}px`,
          top: '50%',
          transform: 'translateY(-50%)',
          left: thumbLeft,
          background: hot ? '#ef4444' : '#ffffff',
          boxShadow: hot
            ? `0 0 0 4px rgba(252,100,100,0.40), 0 6px 24px rgba(0,0,0,0.60)`
            : `0 0 0 2px rgba(255,255,255,0.25), 0 6px 24px rgba(0,0,0,0.60)`,
          transition: active
            ? 'none'
            : 'left 0.35s cubic-bezier(.4,0,.2,1), background 0.2s, box-shadow 0.2s',
        }}
      >
        <span className="text-2xl select-none pointer-events-none">
          {hot ? '🏁' : '🔴'}
        </span>
      </div>
    </div>
  )
}

// ─── ACTIVE SHIFT VIEW ─────────────────────────────────────────────────────────

function ActiveShiftView({ shift, fuelEntries, lang, onFuel, onIncident, onEnd }) {
  const L = LANGS[lang]
  const [sh, sm] = (shift.start_time || '00:00').split(':').map(Number)
  const now = new Date()
  const elapsedMins = (now.getHours() * 60 + now.getMinutes()) - (sh * 60 + sm)
  const elapsedHrs = Math.max(0, elapsedMins / 60)
  const isFullDay = elapsedHrs >= 4
  const totalFuel = fuelEntries.reduce((s, f) => s + (Number(f.quantity_liters) || 0), 0)

  return (
    <div className="space-y-4">
      {/* Big status card */}
      <div className={`rounded-3xl p-5 border-2 ${isFullDay ? 'bg-green-900/20 border-green-700/30' : 'bg-amber-900/20 border-amber-700/30'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Active</p>
            <p className="text-slate-100 font-black text-xl mt-0.5">{shift.equipment?.name}</p>
            <p className="text-slate-500 text-xs font-mono">{shift.equipment?.equipment_number}</p>
          </div>
          <div className="text-center">
            <p className={`text-5xl font-black leading-none ${isFullDay ? 'text-green-400' : 'text-amber-400'}`}>
              {elapsedHrs.toFixed(1)}
            </p>
            <p className={`text-xs font-bold mt-1 ${isFullDay ? 'text-green-400' : 'text-amber-400'}`}>
              {isFullDay ? L.fullDay : L.halfDay}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-dark-900/40 rounded-xl py-2.5 text-center">
            <p className="text-base font-bold text-slate-100">{shift.start_time}</p>
            <p className="text-[10px] text-slate-500">Started</p>
          </div>
          <div className="bg-dark-900/40 rounded-xl py-2.5 text-center">
            <p className="text-base font-bold text-slate-100 font-mono">{Number(shift.start_meter).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Start Meter</p>
          </div>
          <div className="bg-dark-900/40 rounded-xl py-2.5 text-center">
            <p className="text-base font-bold text-yellow-300">{fmtN(totalFuel, 1)} L</p>
            <p className="text-[10px] text-slate-500">{L.fuel}</p>
          </div>
        </div>
      </div>

      {/* 2 action buttons — larger now that End Shift has its own row */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onFuel}
          className="flex flex-col items-center justify-center gap-2 py-7 rounded-2xl bg-yellow-900/30 border-2 border-yellow-700/30 active:scale-95 transition-all">
          <span className="text-5xl">⛽</span>
          <span className="text-yellow-300 text-sm font-bold">{L.fuel}</span>
        </button>
        <button onClick={onIncident}
          className="flex flex-col items-center justify-center gap-2 py-7 rounded-2xl bg-orange-900/30 border-2 border-orange-700/30 active:scale-95 transition-all">
          <span className="text-5xl">⚠️</span>
          <span className="text-orange-300 text-sm font-bold">{L.problem}</span>
        </button>
      </div>

      {/* Slide-to-end — full width, prevents accidental taps */}
      <SlideToEnd onEnd={onEnd} />

      {/* Fuel log (compact) */}
      {fuelEntries.length > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest px-4 py-2 border-b border-dark-700">
            {L.fuel} today
          </p>
          {fuelEntries.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-dark-700 last:border-0">
              <span className="text-xl">⛽</span>
              <p className="text-yellow-300 font-bold text-lg flex-1">{Number(f.quantity_liters)} L</p>
              <p className="text-xs text-slate-500">{new Date(f.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</p>
              {f.receipt_url && <a href={f.receipt_url} target="_blank" rel="noreferrer" className="text-primary-400 text-lg">📷</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FUEL SHEET ───────────────────────────────────────────────────────────────

function FuelSheet({ open, onClose, shift, companyId, lang }) {
  const L = LANGS[lang]
  const [step, setStep]         = useState(0)
  const [qty, setQty]           = useState('')
  const [meter, setMeter]       = useState('')
  const [photoFile, setPhoto]   = useState(null)
  const [photoPreview, setPP]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const qc = useQueryClient()

  const reset = () => { setStep(0); setQty(''); setMeter(''); setPhoto(null); setPP(null) }

  const handlePhoto = f => { setPhoto(f); setPP(URL.createObjectURL(f)) }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { url } = await stampAndUpload(photoFile, 'Fuel Entry Proof')
      await supabase.from('shift_fuel_entries').insert({
        company_id: companyId, shift_id: shift.id, equipment_id: shift.equipment_id,
        quantity_liters: Number(qty),
        meter_at_filling: meter ? Number(meter) : null,
        fuel_source: 'tank', receipt_url: url,
      })
      toast.success('⛽ Fuel recorded')
      qc.invalidateQueries(['op_shift_fuel', shift.id])
      reset(); onClose()
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }}>
      <div className="space-y-5">
        <div className="text-center pt-2">
          <span className="text-5xl">⛽</span>
          <p className="text-slate-100 font-bold text-xl mt-2">{L.fuel}</p>
        </div>

        <StepDots total={2} current={step} />

        {step === 0 && (
          <div className="space-y-4">
            <BigNumber value={qty} onChange={setQty} placeholder="0.0" step="0.5" label={L.fuelQty} />
            <div>
              <p className="text-center text-xs text-slate-500 mb-2">Hour Meter (optional)</p>
              <input type="number" inputMode="decimal" value={meter} onChange={e => setMeter(e.target.value)}
                placeholder="e.g. 1234.5" step="0.1"
                className="w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-primary-500 text-center" />
            </div>
            <BigBtn onClick={() => setStep(1)} disabled={!qty || Number(qty) <= 0} color="primary">
              Next →
            </BigBtn>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <BigPhoto label={L.takePhoto} sublabel="Meter / receipt proof" onCapture={handlePhoto} preview={photoPreview} />
            <div className="flex gap-3">
              <BigBtn onClick={() => setStep(0)} color="ghost" className="max-w-20">←</BigBtn>
              <BigBtn onClick={handleSave} disabled={!photoFile} loading={saving} color="green" className="flex-1">
                ✓ Save
              </BigBtn>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─── INCIDENT SHEET ────────────────────────────────────────────────────────────

const INCIDENT_ICONS = [
  { type: 'breakdown',  icon: '🔧', label: 'Breakdown' },
  { type: 'accident',   icon: '💥', label: 'Accident'  },
  { type: 'near_miss',  icon: '⚡', label: 'Near Miss' },
  { type: 'damage',     icon: '🪛', label: 'Damage'    },
  { type: 'theft',      icon: '🔒', label: 'Theft'     },
  { type: 'other',      icon: '❓', label: 'Other'     },
]

const SEV_ICONS = [
  { val: 'low',      icon: '🟡', label: 'Low'      },
  { val: 'medium',   icon: '🟠', label: 'Medium'   },
  { val: 'high',     icon: '🔴', label: 'High'     },
  { val: 'critical', icon: '🚨', label: 'Critical' },
]

function IncidentSheet({ open, onClose, shift, companyId, lang }) {
  const L = LANGS[lang]
  const [step, setStep]       = useState(0)
  const [type, setType]       = useState(null)
  const [sev, setSev]         = useState(null)
  const [desc, setDesc]       = useState('')
  const [photoFile, setPhoto] = useState(null)
  const [photoPrev, setPP]    = useState(null)
  const [saving, setSaving]   = useState(false)
  const qc = useQueryClient()

  const reset = () => { setStep(0); setType(null); setSev(null); setDesc(''); setPhoto(null); setPP(null) }

  const handlePhoto = f => { setPhoto(f); setPP(URL.createObjectURL(f)) }

  const handleSave = async () => {
    if (!type || !sev) return toast.error('Select type and severity')
    setSaving(true)
    try {
      let photoUrls = []
      if (photoFile) {
        const { url } = await stampAndUpload(photoFile, 'Incident Photo')
        photoUrls = [url]
      }
      await supabase.from('shift_incidents').insert({
        company_id: companyId, shift_id: shift.id, equipment_id: shift.equipment_id,
        incident_type: type, severity: sev,
        description: desc || `${type} reported by operator`,
        reported_by: shift.operator_id, photo_urls: photoUrls,
        incident_time: new Date().toISOString(),
      })
      toast.success('⚠️ Incident reported')
      qc.invalidateQueries(['op_incidents', shift.id])
      reset(); onClose()
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }}>
      <div className="space-y-5">
        <div className="text-center pt-2">
          <span className="text-5xl">⚠️</span>
          <p className="text-slate-100 font-bold text-xl mt-2">{L.problem}</p>
        </div>

        <StepDots total={3} current={step} />

        {/* Step 0: Pick incident type */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {INCIDENT_ICONS.map(({ type: t, icon, label }) => (
                <button key={t} onClick={() => { setType(t); setStep(1) }}
                  className={`flex flex-col items-center gap-2 py-5 rounded-2xl border-2 active:scale-95 transition-all
                    ${type === t ? 'bg-orange-900/40 border-orange-500' : 'bg-dark-800 border-dark-600'}`}>
                  <span className="text-3xl">{icon}</span>
                  <span className="text-xs text-slate-300 font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Severity */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-center text-slate-400 text-sm">How bad is it?</p>
            <div className="grid grid-cols-2 gap-3">
              {SEV_ICONS.map(({ val, icon, label }) => (
                <button key={val} onClick={() => { setSev(val); setStep(2) }}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 active:scale-95 transition-all
                    ${sev === val ? 'bg-red-900/30 border-red-500' : 'bg-dark-800 border-dark-600'}`}>
                  <span className="text-3xl">{icon}</span>
                  <span className="text-slate-200 font-bold text-base">{label}</span>
                </button>
              ))}
            </div>
            <BigBtn onClick={() => setStep(0)} color="ghost">← Back</BigBtn>
          </div>
        )}

        {/* Step 2: Photo + optional note + submit */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-dark-800 rounded-xl px-4 py-2.5">
              <span className="text-2xl">{INCIDENT_ICONS.find(x=>x.type===type)?.icon}</span>
              <span className="text-slate-200 font-semibold capitalize">{type?.replace('_',' ')}</span>
              <span className="ml-auto text-xl">{SEV_ICONS.find(x=>x.val===sev)?.icon}</span>
            </div>

            <BigPhoto label="Photo (optional but recommended)" onCapture={handlePhoto} preview={photoPrev} />

            <div>
              <p className="text-xs text-slate-500 mb-1.5 text-center">Describe what happened (optional)</p>
              <textarea
                className="w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary-500 resize-none"
                rows={3} value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="What happened?" />
            </div>

            <div className="flex gap-3">
              <BigBtn onClick={() => setStep(1)} color="ghost" className="max-w-20">←</BigBtn>
              <BigBtn onClick={handleSave} loading={saving} color="red" className="flex-1">
                🚨 Report
              </BigBtn>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─── END SHIFT SHEET ──────────────────────────────────────────────────────────

function EndShiftSheet({ open, onClose, shift, companyId, employeeId, otThreshold = 12, lang, onEnded }) {
  const L = LANGS[lang]
  const [step, setStep]         = useState(0)
  const [meter, setMeter]       = useState('')
  const [meterFile, setMFile]   = useState(null)
  const [meterPrev, setMPrev]   = useState(null)
  const [selfieFile, setSFile]  = useState(null)
  const [selfiePrev, setSPrev]  = useState(null)
  const [saving, setSaving]     = useState(false)

  const handleMeter   = f => { setMFile(f);  setMPrev(URL.createObjectURL(f)) }
  const handleSelfie  = f => { setSFile(f);  setSPrev(URL.createObjectURL(f)) }

  const reset = () => {
    setStep(0); setMeter(''); setMFile(null); setMPrev(null); setSFile(null); setSPrev(null)
  }

  const meterDelta = meter && shift.start_meter ? Math.max(0, Number(meter) - Number(shift.start_meter)).toFixed(1) : null

  const clockPreview = (() => {
    if (!shift.start_time) return null
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const now = new Date()
    const mins = (now.getHours() * 60 + now.getMinutes()) - (sh * 60 + sm)
    if (mins <= 0) return null
    return { hrs: (mins / 60).toFixed(1), isHalfDay: mins / 60 < 4 }
  })()

  const handleEnd = async () => {
    setSaving(true)
    try {
      const endTime = nowTime()
      const [{ url: meterUrl, location }, { url: selfieUrl }] = await Promise.all([
        stampAndUpload(meterFile,  'Shift End — Hour Meter'),
        stampAndUpload(selfieFile, 'Logout — Presence'),
      ])
      const startM   = Number(shift.start_meter) || 0
      const endM     = Number(meter)
      const meterHrs = endM > startM ? endM - startM : 0
      const [sh, sm] = (shift.start_time || '00:00').split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      const clockHrs = Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60)

      const { error } = await supabase.from('shifts').update({
        end_time: endTime, end_meter: endM, end_meter_photo: meterUrl,
        logout_photo_url: selfieUrl,
        end_location: location, working_hours: meterHrs,
        idle_hours: 0, status: 'closed',
      }).eq('id', shift.id)
      if (error) throw error

      if (employeeId) {
        const attStatus  = clockHrs >= 4 ? 'present' : clockHrs > 0 ? 'half_day' : 'absent'
        const shiftType  = shift.shift_type || 'day'
        const otHrs      = Math.max(0, Math.round((clockHrs - otThreshold) * 10) / 10)
        const attPayload = {
          company_id:       companyId,
          employee_id:      employeeId,
          attendance_date:  shift.shift_date,
          status:           attStatus,
          shift_type:       shiftType,
          shift_start_time: shift.start_time,
          shift_end_time:   endTime,
          ot_hours:         otHrs > 0 ? otHrs : 0,
          notes: `Auto — ${meterHrs.toFixed(1)} meter hrs, ${clockHrs.toFixed(1)} clock hrs${otHrs > 0 ? `, ${otHrs}h OT` : ''}`,
        }
        const { data: existing } = await supabase.from('hr_attendance')
          .select('id').eq('employee_id', employeeId).eq('attendance_date', shift.shift_date).maybeSingle()
        if (existing) {
          await supabase.from('hr_attendance').update(attPayload).eq('id', existing.id)
        } else {
          await supabase.from('hr_attendance').insert(attPayload)
        }
      }

      const otHrsForToast = Math.max(0, Math.round((clockHrs - otThreshold) * 10) / 10)
      const label = clockHrs >= 4 ? '✓ Present' : clockHrs > 0 ? '½ Half Day' : ''
      const otTag = otHrsForToast > 0 ? ` · +${otHrsForToast}h OT` : ''
      toast.success(`🏁 ${meterHrs.toFixed(1)} hrs · ${label}${otTag}`)
      onEnded(); reset(); onClose()
    } catch (err) { toast.error(err.message || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }}>
      <div className="space-y-5">
        <div className="text-center pt-2">
          <span className="text-5xl">🏁</span>
          <p className="text-slate-100 font-bold text-xl mt-2">{L.endShift}</p>

          {/* Clock preview */}
          {clockPreview && (
            <div className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold
              ${clockPreview.isHalfDay ? 'bg-amber-900/30 text-amber-300' : 'bg-green-900/30 text-green-300'}`}>
              {clockPreview.isHalfDay ? '½' : '✓'} {clockPreview.hrs} hrs on site
            </div>
          )}
        </div>

        <StepDots total={3} current={step} />

        {/* Step 0: End meter reading */}
        {step === 0 && (
          <div className="space-y-4">
            <BigNumber value={meter} onChange={setMeter} placeholder={shift.start_meter || '0000.0'}
              min={shift.start_meter || 0} label={L.meterReading} />
            {meterDelta && (
              <div className="text-center">
                <span className="text-primary-400 font-bold text-lg">{meterDelta}</span>
                <span className="text-slate-500 text-sm"> working hrs</span>
              </div>
            )}
            <BigBtn onClick={() => setStep(1)} disabled={!meter || Number(meter) < (Number(shift.start_meter) || 0)} color="primary">
              Next →
            </BigBtn>
          </div>
        )}

        {/* Step 1: Meter photo */}
        {step === 1 && (
          <div className="space-y-4">
            <BigPhoto label={L.meterPhoto} sublabel={`Started: ${Number(shift.start_meter).toLocaleString()} → Now: ${meter}`}
              onCapture={handleMeter} preview={meterPrev} />
            <div className="flex gap-3">
              <BigBtn onClick={() => setStep(0)} color="ghost" className="max-w-20">←</BigBtn>
              <BigBtn onClick={() => setStep(2)} disabled={!meterFile} color="primary" className="flex-1">Next →</BigBtn>
            </div>
          </div>
        )}

        {/* Step 2: Selfie / presence + final submit */}
        {step === 2 && (
          <div className="space-y-4">
            <BigPhoto label={L.presencePhoto} sublabel="Selfie or site photo" onCapture={handleSelfie} preview={selfiePrev} />
            <div className="bg-blue-950/30 border border-blue-700/20 rounded-xl px-3 py-2 text-center">
              <p className="text-blue-400 text-xs">≥4 hrs = Present · &lt;4 hrs = Half Day</p>
            </div>
            <div className="flex gap-3">
              <BigBtn onClick={() => setStep(1)} color="ghost" className="max-w-20">←</BigBtn>
              <BigBtn onClick={handleEnd} disabled={!selfieFile} loading={saving} color="red" className="flex-1">
                🏁 {L.endShift}
              </BigBtn>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─── SHIFT MODULE (orchestrator) ───────────────────────────────────────────────

// ─── SHIFT COMPLETED VIEW ─────────────────────────────────────────────────────
// Shown when today's shift is closed. Blocks a re-start. Offers "Continue"
// only if the shift window is still open — reopen the SAME shift row so
// attendance & OT accumulate on one record rather than creating a duplicate.

function ShiftCompletedView({ shift, equipment, project, enforcement, onContinue, continuing, lang }) {
  const check   = checkShiftWindow(project, equipment, enforcement)
  const canCont = check.allowed

  const [sh, sm] = (shift.start_time || '00:00').split(':').map(Number)
  const [eh, em] = (shift.end_time   || '00:00').split(':').map(Number)
  let endMins = eh * 60 + em
  if (endMins < sh * 60 + sm) endMins += 24 * 60   // cross-midnight
  const clockHrs = Math.max(0, (endMins - (sh * 60 + sm)) / 60)

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="bg-dark-800 border border-dark-600 rounded-3xl p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-20 h-20 bg-green-900/40 border-2 border-green-600/40 rounded-full flex items-center justify-center text-4xl">✅</div>
        <p className="text-green-400 font-bold text-xl">Shift Complete</p>
        <p className="text-slate-400 text-sm">
          {shift.equipment?.name} · {shift.equipment?.equipment_number}
        </p>
      </div>

      {/* Summary strip */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 grid grid-cols-3 gap-3 text-center text-xs">
        <div>
          <p className="text-slate-500 mb-1">Started</p>
          <p className="text-slate-100 font-bold text-base">{(shift.start_time || '—').slice(0,5)}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">Ended</p>
          <p className="text-slate-100 font-bold text-base">{(shift.end_time || '—').slice(0,5)}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">Hours</p>
          <p className="text-green-400 font-bold text-base">{clockHrs.toFixed(1)}h</p>
        </div>
      </div>

      {/* Continue section */}
      {canCont ? (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 space-y-3">
          <p className="text-amber-800 font-bold text-sm">More work to log?</p>
          <p className="text-amber-900 text-xs leading-relaxed">
            Tapping <strong>Continue Shift</strong> reopens your existing shift record.
            Your original start time and meter reading are preserved — the final
            attendance and hours will be calculated when you end the shift again.
            No duplicate records are created.
          </p>
          <button
            onClick={onContinue}
            disabled={continuing}
            className="w-full bg-amber-600 active:bg-amber-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm transition-colors"
          >
            {continuing ? 'Reopening…' : '↩  Continue Shift'}
          </button>
        </div>
      ) : (
        <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4 text-center space-y-1">
          <p className="text-slate-600 text-sm font-semibold">Shift window has closed</p>
          <p className="text-slate-400 text-xs">Additional work cannot be logged for today's shift</p>
        </div>
      )}
    </div>
  )
}

// ─── SHIFT MODULE ─────────────────────────────────────────────────────────────

function ShiftModule({ companyId, operatorId, employeeId, employeeName, otThreshold = 12, lang, shiftEnforcement = 'flexible' }) {
  const qc = useQueryClient()
  const [fuelOpen, setFuelOpen] = useState(false)
  const [incOpen,  setIncOpen]  = useState(false)
  const [endOpen,  setEndOpen]  = useState(false)
  const [alarmType,  setAlarmType]  = useState(null)
  const [alarmDismiss, setDismissed] = useState(false)
  const [elapsedHrs, setElapsed]    = useState(0)

  const L = LANGS[lang]

  const { data: assignedEq, isLoading: eqLoading } = useQuery({
    queryKey: ['op_assigned_equipment', operatorId, employeeId, companyId],
    queryFn: async () => {
      const { data: eq, error } = await supabase.rpc('get_my_equipment')
      if (error) { console.error('get_my_equipment error:', error); return null }
      if (!eq) return null
      if (!eq.default_shift_type) eq.default_shift_type = eq.assignment_shift_type

      // Client-side substitution check — defense-in-depth.
      // The RPC should return is_substitution=true, but if the RPC version is old
      // or the substitution stored hr_employees.id instead of user_profiles.id,
      // we check both IDs here to catch all cases.
      if (!eq.is_substitution) {
        const orFilter = [
          `substitute_operator_id.eq.${operatorId}`,
          employeeId ? `substitute_operator_id.eq.${employeeId}` : null,
        ].filter(Boolean).join(',')
        const { data: sub } = await supabase
          .from('operator_substitutions')
          .select('id,shift_type,equipment_id')
          .or(orFilter)
          .eq('shift_date', today())
          .eq('equipment_id', eq.id)
          .maybeSingle()
        if (sub) {
          eq.is_substitution = true
          eq.default_shift_type = sub.shift_type || eq.default_shift_type
        }
      }

      return eq
    },
    enabled: !!companyId && !!operatorId,
  })

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

  const { data: activeShift, isLoading: shiftLoading, refetch: refetchShift } = useQuery({
    queryKey: ['op_active_shift', employeeId, today()],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('*, equipment:equipment_id(name,equipment_number,category)')
        .eq('company_id', companyId).eq('operator_id', employeeId)
        .eq('shift_date', today()).eq('status', 'open')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      return data || null
    },
    enabled: !!companyId && !!employeeId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  // Today's most recent CLOSED shift — used to block re-start and offer "Continue"
  const { data: closedShift } = useQuery({
    queryKey: ['op_closed_shift', employeeId, today()],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('*, equipment:equipment_id(name,equipment_number,category)')
        .eq('company_id', companyId).eq('operator_id', employeeId)
        .eq('shift_date', today()).eq('status', 'closed')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      return data || null
    },
    enabled: !!companyId && !!employeeId,
  })

  const [continuing, setContinuing] = useState(false)

  const handleContinueShift = async () => {
    if (!closedShift) return
    setContinuing(true)
    try {
      const { error } = await supabase.from('shifts').update({
        status: 'open',
        end_time: null, end_meter: null,
        end_meter_photo: null, logout_photo_url: null, end_location: null,
      }).eq('id', closedShift.id)
      if (error) throw error
      await refetchShift()
      qc.invalidateQueries({ queryKey: ['op_closed_shift', employeeId, today()] })
      toast.success('Shift reopened — continue logging work')
    } catch (err) {
      toast.error(err.message || 'Failed to reopen shift')
    } finally { setContinuing(false) }
  }

  useEffect(() => {
    if (!companyId || !employeeId) return
    const channel = supabase
      .channel(`op_shift_${employeeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `operator_id=eq.${employeeId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['op_active_shift', employeeId, today()] })
          qc.invalidateQueries({ queryKey: ['op_closed_shift', employeeId, today()] })
        }
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [companyId, employeeId])

  useEffect(() => {
    const OVERDUE_HRS = 10
    const check = () => {
      if (activeShift) {
        const [sh, sm] = (activeShift.start_time || '00:00').split(':').map(Number)
        const now = new Date()
        const hrs = ((now.getHours() * 60 + now.getMinutes()) - (sh * 60 + sm)) / 60
        setElapsed(Math.max(0, hrs))
        if (hrs > OVERDUE_HRS) {
          if (!alarmDismiss) setAlarmType('overdue')
          fireNotification('🚨 Shift Overdue', `Running ${hrs.toFixed(1)} hrs — close now!`, 'shift-overdue')
        } else { setAlarmType(null) }
      } else if (assignedEq && project) {
        const { allowed } = checkShiftWindow(project, assignedEq, shiftEnforcement)
        if (allowed) {
          if (!alarmDismiss) setAlarmType('login_reminder')
          fireNotification('⏰ Shift Reminder', 'Window open — start your shift!', 'shift-login-reminder')
        } else { setAlarmType(null) }
      }
    }
    check()
    const timer = setInterval(check, 60_000)
    return () => clearInterval(timer)
  }, [activeShift, assignedEq, project, alarmDismiss])

  const { data: fuelEntries = [] } = useQuery({
    queryKey: ['op_shift_fuel', activeShift?.id],
    queryFn: async () => {
      if (!activeShift?.id) return []
      const { data } = await supabase.from('shift_fuel_entries').select('*').eq('shift_id', activeShift.id).order('created_at')
      return data || []
    },
    enabled: !!activeShift?.id,
  })

  const onEnded = () => {
    refetchShift()
    qc.invalidateQueries({ queryKey: ['op_active_shift',   employeeId, today()] })
    qc.invalidateQueries({ queryKey: ['op_closed_shift',   employeeId, today()] })
    qc.invalidateQueries({ queryKey: ['op_attendance_today', employeeId, today()] })
    qc.invalidateQueries({ queryKey: ['op_attendance_month', employeeId] })
    qc.invalidateQueries({ queryKey: ['op_live_salary', operatorId] })
  }

  const handleDismissAlarm = () => {
    setDismissed(true); setAlarmType(null)
    setTimeout(() => setDismissed(false), 30 * 60 * 1000)
  }

  if (eqLoading || shiftLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
    </div>
  )

  if (!assignedEq) return (
    <div className="flex flex-col items-center gap-5 py-16 px-6 text-center">
      <div className="w-28 h-28 bg-dark-800 border-2 border-dark-600 rounded-full flex items-center justify-center text-6xl">🏗</div>
      <div>
        <p className="text-slate-200 font-bold text-xl">{L.noEquip}</p>
        <p className="text-slate-500 text-sm mt-2">{L.contactSupervisor}</p>
      </div>
    </div>
  )

  // Login reminder banner (not overdue)
  const loginReminderBanner = alarmType === 'login_reminder' && !activeShift ? (
    <div className="bg-amber-600 px-4 py-3 flex items-center gap-3 rounded-2xl mb-4">
      <span className="text-2xl">⏰</span>
      <p className="text-white font-bold flex-1">Shift window is open!</p>
      <button onClick={handleDismissAlarm} className="text-amber-200 text-xl">×</button>
    </div>
  ) : null

  return (
    <>
      {alarmType === 'overdue' && (
        <OverdueBanner elapsedHrs={elapsedHrs} onEndNow={() => { setEndOpen(true); handleDismissAlarm() }} onDismiss={handleDismissAlarm} />
      )}

      <div className={alarmType === 'overdue' ? 'mt-14' : ''}>
        {loginReminderBanner}

        {activeShift ? (
          <>
            <ActiveShiftView
              shift={activeShift}
              fuelEntries={fuelEntries}
              lang={lang}
              onFuel={() => setFuelOpen(true)}
              onIncident={() => setIncOpen(true)}
              onEnd={() => setEndOpen(true)}
            />
            <FuelSheet     open={fuelOpen} onClose={() => setFuelOpen(false)} shift={activeShift} companyId={companyId} lang={lang} />
            <IncidentSheet open={incOpen}  onClose={() => setIncOpen(false)}  shift={activeShift} companyId={companyId} lang={lang} />
            <EndShiftSheet open={endOpen}  onClose={() => setEndOpen(false)}  shift={activeShift} companyId={companyId} employeeId={employeeId} otThreshold={otThreshold} lang={lang} onEnded={onEnded} />
          </>
        ) : closedShift ? (
          /* Shift already ended today — block re-start, offer continue within window */
          <ShiftCompletedView
            shift={closedShift}
            equipment={assignedEq}
            project={project}
            enforcement={shiftEnforcement}
            onContinue={handleContinueShift}
            continuing={continuing}
            lang={lang}
          />
        ) : (
          <StartShiftFlow
            companyId={companyId} operatorId={operatorId} employeeId={employeeId}
            equipment={assignedEq} project={project} lang={lang} onStarted={refetchShift}
            enforcement={shiftEnforcement}
          />
        )}
      </div>
    </>
  )
}

// ─── ATTENDANCE MODULE ────────────────────────────────────────────────────────

function AttendanceModule({ companyId, operatorId, employeeId, lang }) {
  const L = LANGS[lang]
  const qc = useQueryClient()
  const [leaveOpen, setLeaveOpen] = useState(false)
  const todayStr = today()
  const now = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  const STATUS_BG = { present: 'bg-green-500', absent: 'bg-red-500', on_leave: 'bg-blue-500', half_day: 'bg-yellow-500', holiday: 'bg-purple-500' }

  const { data: todayShift } = useQuery({
    queryKey: ['op_today_shift_att', employeeId, todayStr],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('start_time,end_time,working_hours,status,equipment:equipment_id(name,equipment_number)')
        .eq('company_id', companyId).eq('operator_id', employeeId).eq('shift_date', todayStr)
        .order('created_at', {ascending: false}).limit(1).maybeSingle()
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
        .order('attendance_date', {ascending: false})
      return data || []
    },
    enabled: !!employeeId,
  })

  const { data: leaves = [] } = useQuery({
    queryKey: ['op_leaves', employeeId],
    queryFn: async () => {
      if (!employeeId) return []
      const { data } = await supabase.from('hr_leaves')
        .select('*').eq('employee_id', employeeId).order('created_at', {ascending: false}).limit(20)
      return data || []
    },
    enabled: !!employeeId,
  })

  const daysPresent = monthAtt.filter(a => a.status === 'present').length
  const daysHalf    = monthAtt.filter(a => a.status === 'half_day').length
  const daysAbsent  = monthAtt.filter(a => a.status === 'absent').length
  const daysLeave   = monthAtt.filter(a => a.status === 'on_leave').length

  // Orphaned attendance: record exists but the shift was deleted by admin
  const orphanedAtt = todayAtt && !todayShift

  return (
    <div className="space-y-4">

      {/* ── Orphaned-attendance notice (read-only for operator) ─────────────── */}
      {orphanedAtt && (
        <div className="bg-amber-900/30 border border-amber-500/50 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-amber-300 font-bold text-sm">Shift Deleted by Admin</p>
              <p className="text-amber-200/70 text-xs mt-1 leading-relaxed">
                An attendance record (<strong className="text-amber-200 capitalize">
                  {todayAtt.status.replace('_', ' ')}
                </strong>) exists for today but the shift it belongs to has been removed.
                Please contact your supervisor to correct this.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Today status — big visual */}
      <div className="bg-dark-800 border border-dark-600 rounded-3xl p-5">
        <p className="text-xs text-slate-500 text-center uppercase tracking-widest mb-4">
          {new Date().toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'short'})}
        </p>
        <div className="flex items-center justify-center gap-5">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white font-black text-3xl
            ${todayAtt ? (STATUS_BG[todayAtt.status] || 'bg-dark-600') : todayShift ? 'bg-primary-600 animate-pulse' : 'bg-dark-600'}`}>
            {todayAtt?.status === 'present' ? '✓' : todayAtt?.status === 'half_day' ? '½' : todayAtt?.status === 'absent' ? '✗' : todayShift ? '●' : '?'}
          </div>
          <div>
            <p className="text-slate-100 font-bold text-lg">
              {todayAtt
                ? (todayAtt.status === 'present' ? L.present : todayAtt.status === 'half_day' ? L.halfDay : todayAtt.status === 'on_leave' ? L.leave : 'Absent')
                : todayShift ? 'Shift running…' : 'Not started'
              }
            </p>
            {todayShift && (
              <p className="text-slate-500 text-sm">
                {todayShift.start_time}{todayShift.end_time ? ` → ${todayShift.end_time}` : ' →  now'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Month summary — 4 stat cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          [daysPresent, 'bg-green-600',  L.present],
          [daysHalf,    'bg-yellow-600', L.halfDay],
          [daysAbsent,  'bg-red-600',    L.absent],
          [daysLeave,   'bg-blue-600',   L.leave],
        ].map(([n, bg, lbl], i) => (
          <div key={i} className={`${bg} rounded-2xl py-3 px-1 text-center`}>
            <p className="text-white font-black text-3xl">{n}</p>
            <p className="text-white/80 text-[11px] font-semibold mt-1 leading-tight">{lbl}</p>
          </div>
        ))}
      </div>

      {/* Leave button */}
      <button onClick={() => setLeaveOpen(true)}
        className="w-full py-4 rounded-2xl border-2 border-dashed border-primary-600/40 text-primary-400 font-bold text-base active:scale-[0.98] transition-all">
        + Leave Request
      </button>

      {/* Recent leaves */}
      {leaves.slice(0, 5).map(l => (
        <div key={l.id} className="bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0
            ${l.status === 'approved' ? 'bg-green-600' : l.status === 'rejected' ? 'bg-red-600' : 'bg-yellow-600'}`}>
            {l.status === 'approved' ? '✓' : l.status === 'rejected' ? '✗' : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 text-sm font-semibold capitalize">{l.leave_type} Leave</p>
            <p className="text-slate-500 text-xs">{l.from_date} → {l.to_date}</p>
          </div>
          <span className="text-xs text-slate-500">{l.days}d</span>
        </div>
      ))}

      {/* Month calendar — compact */}
      {monthAtt.length > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
          <p className="text-xs text-slate-500 uppercase tracking-wide px-4 py-3 border-b border-dark-700">
            {now.toLocaleString('en-IN', {month:'long', year:'numeric'})}
          </p>
          <div className="grid grid-cols-7 gap-1 p-3">
            {monthAtt.map(a => {
              const d = new Date(a.attendance_date)
              const bg = STATUS_BG[a.status] || 'bg-dark-700'
              return (
                <div key={a.id} className={`${bg} rounded-lg flex flex-col items-center py-1.5`}>
                  <p className="text-white text-[10px] font-bold">{d.getDate()}</p>
                  <p className="text-white/60 text-[8px]">{d.toLocaleDateString('en-IN',{weekday:'short'}).slice(0,1)}</p>
                </div>
              )
            })}
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

  const TYPES = [
    { val: 'casual', icon: '🌴' },
    { val: 'sick',   icon: '🤒' },
    { val: 'earned', icon: '⭐' },
    { val: 'unpaid', icon: '💸' },
  ]

  const handleSubmit = async () => {
    if (!employeeId) return toast.error('Employee record not linked')
    const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1)
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
    <Sheet open={open} onClose={onClose}>
      <div className="space-y-5">
        <div className="text-center pt-2">
          <span className="text-5xl">🌴</span>
          <p className="text-slate-100 font-bold text-xl mt-2">Leave Request</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {TYPES.map(t => (
            <button key={t.val} onClick={() => setType(t.val)}
              className={`flex flex-col items-center gap-1 py-3 rounded-2xl border-2 active:scale-95 transition-all
                ${type === t.val ? 'bg-primary-900/40 border-primary-500 text-primary-300' : 'bg-dark-800 border-dark-600 text-slate-400'}`}>
              <span className="text-2xl">{t.icon}</span>
              <span className="text-[10px] font-semibold capitalize">{t.val}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1 text-center">From</p>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full bg-dark-700 border border-dark-500 rounded-xl px-3 py-3 text-sm text-slate-200 focus:outline-none focus:border-primary-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1 text-center">To</p>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full bg-dark-700 border border-dark-500 rounded-xl px-3 py-3 text-sm text-slate-200 focus:outline-none focus:border-primary-500" />
          </div>
        </div>
        <textarea className="w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary-500 resize-none"
          rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)…" />
        <BigBtn onClick={handleSubmit} loading={saving} color="primary">Send Request</BigBtn>
      </div>
    </Sheet>
  )
}

// ─── PAY MODULE ───────────────────────────────────────────────────────────────

function PayModule({ companyId, operatorId, employeeId, profile, lang }) {
  const L = LANGS[lang]
  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  const { data: salary } = useQuery({
    queryKey: ['op_salary_structure', employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      const { data } = await supabase.from('hr_salary_structure')
        .select('*').eq('employee_id', employeeId).order('effective_from', {ascending: false}).limit(1).maybeSingle()
      return data || null
    },
    enabled: !!employeeId,
  })

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
      const present = (att||[]).filter(a => a.status === 'present').length
      const halfDay = (att||[]).filter(a => a.status === 'half_day').length
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

  const gross = salary
    ? (Number(salary.basic_salary)||0)+(Number(salary.hra)||0)+(Number(salary.special_allowance)||0)+(Number(salary.other_allowance)||0)
    : 0

  return (
    <div className="space-y-4">
      {/* Profile */}
      <div className="bg-gradient-to-br from-dark-800 to-dark-900 border border-dark-600 rounded-3xl p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary-900/40 border-2 border-primary-600/40 flex items-center justify-center text-2xl font-black text-primary-300 shrink-0">
          {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-black text-xl truncate">{profile?.full_name}</p>
          <p className="text-slate-400 text-sm">{profile?.designation || 'Operator'}</p>
          {profile?.employee_id && <p className="text-xs text-slate-500 font-mono">{profile.employee_id}</p>}
        </div>
      </div>

      {/* Big earnings display */}
      <div className="bg-dark-800 border border-dark-600 rounded-3xl p-5">
        <p className="text-xs text-slate-500 uppercase tracking-widest text-center mb-4">
          {now.toLocaleString('en-IN', {month:'long', year:'numeric'})}
        </p>

        {liveEarnings ? (
          <>
            <div className="text-center mb-5">
              <p className="text-5xl font-black text-green-400">{fmt(liveEarnings.earned)}</p>
              <p className="text-slate-500 text-sm mt-1">earned this month</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                [liveEarnings.present,              'text-green-400',   L.present.slice(0,3)],
                [liveEarnings.halfDay,              'text-yellow-400',  '½'],
                [liveEarnings.earnedDays.toFixed(1),'text-primary-400', 'Days'],
              ].map(([v, c, l], i) => (
                <div key={i} className="bg-dark-900/60 rounded-2xl py-3 text-center">
                  <p className={`text-2xl font-black ${c}`}>{v}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{l}</p>
                </div>
              ))}
            </div>
            {salary?.daily_rate > 0 && (
              <p className="text-center text-xs text-slate-500 mt-3">{fmt(liveEarnings.dailyRate)} per day</p>
            )}
          </>
        ) : salary ? (
          <div className="text-center">
            <p className="text-4xl font-black text-slate-200">{fmt(gross)}</p>
            <p className="text-slate-500 text-sm mt-1">monthly gross</p>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-5xl mb-3">💬</p>
            <p className="text-slate-400">Contact HR for salary info</p>
          </div>
        )}
      </div>

      {/* Processed payslip */}
      {payslip && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Payslip</p>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${payslip.status === 'paid' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'}`}>
              {payslip.status === 'paid' ? '✓ PAID' : payslip.status}
            </span>
          </div>
          {[
            ['Days', `${payslip.days_present}/${payslip.working_days}`],
            ['Gross', fmt(payslip.gross_salary)],
            ['Deductions', `-${fmt(payslip.deductions)}`],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between text-sm py-1">
              <span className="text-slate-500">{l}</span>
              <span className="text-slate-200">{v}</span>
            </div>
          ))}
          <div className="flex justify-between text-base font-black mt-2 pt-2 border-t border-dark-700">
            <span className="text-slate-300">Net Pay</span>
            <span className="text-green-400">{fmt(payslip.net_salary)}</span>
          </div>
          {payslip.payment_date && <p className="text-xs text-slate-500 mt-2">Paid {payslip.payment_date}</p>}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PORTAL ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'shift',      big: '⚙️',  label: 'shift'      },
  { id: 'attendance', big: '📅',  label: 'attendance' },
  { id: 'pay',        big: '💰',  label: 'pay'        },
  { id: 'expenses',   big: '🧾',  label: 'expenses'   },
]

export default function OperatorPortal() {
  const { userProfile, company, companyId, signOut } = useAuth()
  const [tab,  setTab]  = useState('shift')
  const [lang, setLang] = useState('en')

  const L = LANGS[lang]

  useEffect(() => { requestNotificationPermission() }, [])

  const { data: employee } = useQuery({
    queryKey: ['op_employee_record', userProfile?.id],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id,name,employee_number,designation,department,ot_threshold_hours')
        .eq('user_id', userProfile.id).maybeSingle()
      return data || null
    },
    enabled: !!userProfile?.id,
  })

  const employeeId    = employee?.id   || null
  const employeeName  = employee?.name || null
  const otThreshold   = Number(employee?.ot_threshold_hours ?? 12)
  const shiftEnforcement = company?.shift_enforcement || 'flexible'
  const sharedProps  = { companyId, operatorId: userProfile?.id, employeeId, employeeName, otThreshold, profile: userProfile, lang, shiftEnforcement }

  return (
    <div className="flex flex-col h-screen bg-dark-900 text-slate-100 max-w-lg mx-auto">
      {/* Top bar — minimal */}
      <div className="shrink-0 bg-dark-800 border-b border-dark-700 px-4 py-2.5 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{userProfile?.full_name}</p>
          <p className="text-[10px] text-slate-500 truncate">{company?.name}</p>
        </div>
        <LangPicker lang={lang} onChange={setLang} />
        <button onClick={signOut} className="ml-1 w-8 h-8 flex items-center justify-center rounded-full bg-dark-700 border border-dark-600 text-slate-400 hover:text-slate-200 active:scale-95 text-base">
          ⏻
        </button>
      </div>

      {/* Content */}
      {tab === 'expenses' ? (
        <div className="flex-1 overflow-hidden flex flex-col pb-16">
          <FieldExpensePage embedded={true} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 pb-28">
            {tab === 'shift'      && <ShiftModule      {...sharedProps} />}
            {tab === 'attendance' && <AttendanceModule {...sharedProps} />}
            {tab === 'pay'        && <PayModule        {...sharedProps} />}
          </div>
        </div>
      )}

      {/* Bottom nav — large icons, no clutter */}
      <div className="shrink-0 fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-dark-800/95 backdrop-blur border-t border-dark-700">
        <div className="flex">
          {TABS.map(t => {
            const active = tab === t.id
            const label  = L[t.label] || t.label
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${active ? 'text-primary-400' : 'text-slate-500'}`}>
                <span className="text-2xl leading-none">{t.big}</span>
                <span className="text-[9px] font-semibold truncate max-w-full px-1">{label}</span>
                {active && <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
