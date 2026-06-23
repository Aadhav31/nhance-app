/**
 * OperatorPortal.jsx
 * Mobile-first operator interface — separate from admin shell
 * Modules: Shift | Attendance | HR & Payroll
 * Each module has Basic / Advanced mode
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n) { return n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}` }
function today() { return new Date().toISOString().slice(0, 10) }
function nowTime() { return new Date().toTimeString().slice(0, 5) }

async function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve(`${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`),
      () => resolve(null),
      { timeout: 6000, enableHighAccuracy: true }
    )
  })
}

async function stampAndUpload(file, label, supabaseClient) {
  const location = await getLocation()
  const stamp = `${new Date().toLocaleString('en-IN')}${location ? `  📍 ${location}` : ''}`

  const blob = await new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const maxW = 1400
        const scale = img.width > maxW ? maxW / img.width : 1
        const w = img.width * scale
        const h = img.height * scale
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)

        // Bottom stamp bar
        const barH = Math.max(h * 0.055, 32)
        ctx.fillStyle = 'rgba(0,0,0,0.68)'
        ctx.fillRect(0, h - barH * 2.2, w, barH * 2.2)
        const fs = Math.max(Math.round(barH * 0.48), 12)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${fs}px monospace`
        ctx.fillText(label, 10, h - barH - 8)
        ctx.font = `${fs * 0.88}px monospace`
        ctx.fillStyle = '#ccc'
        ctx.fillText(stamp, 10, h - 10)

        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })

  // Try Supabase storage first
  try {
    const filename = `${Date.now()}_${label.replace(/\s+/g, '_')}.jpg`
    const { data, error } = await supabaseClient.storage
      .from('operator-photos')
      .upload(filename, blob, { contentType: 'image/jpeg', upsert: false })
    if (!error) {
      const { data: { publicUrl } } = supabaseClient.storage.from('operator-photos').getPublicUrl(data.path)
      return { url: publicUrl, location }
    }
  } catch (_) { /* fall through to base64 */ }

  // Fallback: base64 data URL
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => resolve({ url: e.target.result, location })
    reader.readAsDataURL(blob)
  })
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex items-center bg-dark-800 border border-dark-600 rounded-full p-0.5 text-xs">
      {['basic', 'advanced'].map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={`px-3 py-1 rounded-full capitalize font-medium transition-all ${mode === m ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
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
        <button type="button" disabled={disabled}
          onClick={() => ref.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 border border-dark-500 rounded-xl text-sm text-slate-200 hover:bg-dark-600 active:scale-95 transition-all disabled:opacity-40">
          📷 Take Photo
        </button>
        {preview && (
          <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-dark-500">
            <img src={preview} alt="preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span className="text-[10px] text-white">✓</span>
            </div>
          </div>
        )}
        <input ref={ref} type="file" accept="image/*" capture="environment"
          className="hidden" onChange={e => e.target.files?.[0] && onCapture(e.target.files[0])} />
      </div>
    </div>
  )
}

function Sheet({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-h-[92vh] bg-dark-900 border-t border-dark-600 rounded-t-2xl overflow-y-auto animate-slide-up">
        <div className="sticky top-0 bg-dark-900 border-b border-dark-700 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100 text-base">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function FieldLabel({ children }) { return <p className="text-xs text-slate-400 mb-1">{children}</p> }

const inp = 'w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500'
const bigNum = 'w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-4 text-2xl font-bold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary-500 text-center tracking-widest'

function Btn({ onClick, disabled, loading, children, variant = 'primary', className = '' }) {
  const base = 'w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2'
  const variants = {
    primary: 'bg-primary-600 hover:bg-primary-500 text-white',
    danger:  'bg-red-700 hover:bg-red-600 text-white',
    ghost:   'bg-dark-700 hover:bg-dark-600 text-slate-200 border border-dark-500',
  }
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${variants[variant]} ${className}`}>
      {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : children}
    </button>
  )
}

// ─── SHIFT MODULE ─────────────────────────────────────────────────────────────

function StartShiftBasic({ companyId, operatorId, equipments, onStarted }) {
  const [equipId, setEquipId]   = useState('')
  const [meter, setMeter]       = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving]     = useState(false)

  const selectedEq = equipments.find(e => e.id === equipId)

  const handlePhoto = file => {
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleStart = async () => {
    if (!equipId) return toast.error('Select equipment')
    if (!meter)   return toast.error('Enter hour meter reading')
    if (!photoFile) return toast.error('Take a photo of the hour meter')
    setSaving(true)
    try {
      const label = `${selectedEq?.equipment_number || 'EQ'} — Shift Start`
      const { url, location } = await stampAndUpload(photoFile, label, supabase)
      const { data, error } = await supabase.from('shifts').insert({
        company_id: companyId, equipment_id: equipId, operator_id: operatorId,
        shift_date: today(), shift_type: 'day', start_time: nowTime(),
        start_meter: Number(meter), start_meter_photo: url, start_location: location,
        status: 'open',
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
        <FieldLabel>Equipment</FieldLabel>
        <select className={inp} value={equipId} onChange={e => setEquipId(e.target.value)}>
          <option value="">Select equipment…</option>
          {equipments.map(e => (
            <option key={e.id} value={e.id}>{e.name} ({e.equipment_number})</option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel>Hour Meter Reading</FieldLabel>
        <input type="number" className={bigNum} value={meter} onChange={e => setMeter(e.target.value)}
          placeholder="0000.0" step="0.1" min="0" inputMode="decimal" />
        {selectedEq?.last_meter && (
          <p className="text-xs text-slate-500 text-center mt-1">
            Last recorded: {Number(selectedEq.last_meter).toLocaleString('en-IN')} hrs
          </p>
        )}
      </div>

      <PhotoCapture label="Hour Meter Photo (Required)" onCapture={handlePhoto} preview={photoPreview} />

      <Btn onClick={handleStart} loading={saving}>🚀 Start Shift</Btn>
    </div>
  )
}

function RecordFuelSheet({ open, onClose, shift, companyId }) {
  const [qty, setQty]       = useState('')
  const [meter, setMeter]   = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const handlePhoto = file => { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)) }

  const handleSave = async () => {
    if (!qty)     return toast.error('Enter fuel quantity')
    if (!photoFile) return toast.error('Take a photo of the fuel meter / receipt')
    setSaving(true)
    try {
      let receiptUrl = null
      if (photoFile) {
        const { url } = await stampAndUpload(photoFile, 'Fuel Entry Proof', supabase)
        receiptUrl = url
      }
      const { error } = await supabase.from('shift_fuel_entries').insert({
        company_id: companyId, shift_id: shift.id, equipment_id: shift.equipment_id,
        quantity_liters: Number(qty), meter_at_filling: meter ? Number(meter) : null,
        receipt_url: receiptUrl, fuel_source: 'tank',
      })
      if (error) throw error
      toast.success('Fuel recorded')
      qc.invalidateQueries(['op_shift_fuel', shift.id])
      setQty(''); setMeter(''); setPhotoFile(null); setPhotoPreview(null)
      onClose()
    } catch (err) { toast.error(err.message || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="⛽ Record Fuel">
      <div className="space-y-4">
        <div>
          <FieldLabel>Quantity Filled (Litres)</FieldLabel>
          <input type="number" className={bigNum} value={qty} onChange={e => setQty(e.target.value)}
            placeholder="0.0" step="0.5" min="0" inputMode="decimal" />
        </div>
        <div>
          <FieldLabel>Hour Meter at Filling (optional)</FieldLabel>
          <input type="number" className={inp} value={meter} onChange={e => setMeter(e.target.value)}
            placeholder="Current meter reading" step="0.1" min="0" inputMode="decimal" />
        </div>
        <PhotoCapture label="Proof Photo (quantity / receipt)" onCapture={handlePhoto} preview={photoPreview} />
        <Btn onClick={handleSave} loading={saving}>Save Fuel Entry</Btn>
      </div>
    </Sheet>
  )
}

function RecordIncidentSheet({ open, onClose, shift, companyId }) {
  const [type, setType]   = useState('breakdown')
  const [desc, setDesc]   = useState('')
  const [sev, setSev]     = useState('low')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const TYPES = ['breakdown','accident','near_miss','damage','theft','other']
  const SEVS  = ['low','medium','high','critical']

  const handlePhoto = file => { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)) }

  const handleSave = async () => {
    if (!desc.trim()) return toast.error('Describe the incident')
    setSaving(true)
    try {
      let photoUrls = []
      if (photoFile) {
        const { url } = await stampAndUpload(photoFile, 'Incident Photo', supabase)
        photoUrls = [url]
      }
      const { error } = await supabase.from('shift_incidents').insert({
        company_id: companyId, shift_id: shift.id, equipment_id: shift.equipment_id,
        incident_type: type, severity: sev, description: desc,
        reported_by: shift.operator_id, photo_urls: photoUrls,
        incident_time: new Date().toISOString(),
      })
      if (error) throw error
      toast.success('Incident reported')
      qc.invalidateQueries(['op_incidents', shift.id])
      setDesc(''); setType('breakdown'); setSev('low'); setPhotoFile(null); setPhotoPreview(null)
      onClose()
    } catch (err) { toast.error(err.message || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="⚠️ Report Incident">
      <div className="space-y-4">
        <div>
          <FieldLabel>Incident Type</FieldLabel>
          <select className={inp} value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>Severity</FieldLabel>
          <div className="grid grid-cols-4 gap-2">
            {SEVS.map(s => (
              <button key={s} onClick={() => setSev(s)}
                className={`py-2 rounded-lg text-xs font-semibold capitalize transition-all ${sev === s
                  ? s === 'critical' ? 'bg-red-600 text-white' : s === 'high' ? 'bg-orange-600 text-white' : s === 'medium' ? 'bg-yellow-600 text-white' : 'bg-green-700 text-white'
                  : 'bg-dark-700 text-slate-400 border border-dark-500'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Description *</FieldLabel>
          <textarea className={`${inp} resize-none`} rows={3} value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Describe what happened…" />
        </div>
        <PhotoCapture label="Photo (optional)" onCapture={handlePhoto} preview={photoPreview} />
        <Btn onClick={handleSave} loading={saving} variant="danger">Submit Incident</Btn>
      </div>
    </Sheet>
  )
}

function EndShiftSheet({ open, onClose, shift, companyId, onEnded }) {
  const [meter, setMeter]     = useState('')
  const [notes, setNotes]     = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving]   = useState(false)

  const handlePhoto = file => { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)) }

  const handleEnd = async () => {
    if (!meter)   return toast.error('Enter end hour meter reading')
    if (!photoFile) return toast.error('Take a photo of the hour meter')
    setSaving(true)
    try {
      const label = 'Shift End — Hour Meter'
      const { url, location } = await stampAndUpload(photoFile, label, supabase)
      const startM = Number(shift.start_meter) || 0
      const endM   = Number(meter)
      const workingHrs = endM > startM ? (endM - startM) : 0

      const { error } = await supabase.from('shifts').update({
        end_time: nowTime(), end_meter: endM, end_meter_photo: url,
        end_location: location, working_hours: workingHrs,
        notes, status: 'closed',
      }).eq('id', shift.id)
      if (error) throw error
      toast.success(`Shift ended — ${workingHrs.toFixed(1)} hrs recorded`)
      onEnded()
      onClose()
    } catch (err) { toast.error(err.message || 'Failed to end shift')
    } finally { setSaving(false) }
  }

  const workingPreview = meter && shift.start_meter
    ? Math.max(0, Number(meter) - Number(shift.start_meter)).toFixed(1)
    : null

  return (
    <Sheet open={open} onClose={onClose} title="🏁 End Shift">
      <div className="space-y-5">
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 text-sm text-slate-400">
          Started at <span className="text-slate-200">{shift.start_time}</span> · Start meter <span className="text-slate-200">{Number(shift.start_meter).toLocaleString('en-IN')} hrs</span>
        </div>

        <div>
          <FieldLabel>End Hour Meter Reading</FieldLabel>
          <input type="number" className={bigNum} value={meter} onChange={e => setMeter(e.target.value)}
            placeholder="0000.0" step="0.1" min={shift.start_meter || 0} inputMode="decimal" />
          {workingPreview && (
            <p className="text-center text-sm text-primary-400 font-semibold mt-2">
              Working hours: {workingPreview} hrs
            </p>
          )}
        </div>

        <PhotoCapture label="Hour Meter Photo (Required)" onCapture={handlePhoto} preview={photoPreview} />

        <div>
          <FieldLabel>Notes for Next Operator (optional)</FieldLabel>
          <textarea className={`${inp} resize-none`} rows={3} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Any handover notes, issues to watch, pending work…" />
        </div>

        <Btn onClick={handleEnd} loading={saving}>🏁 End Shift</Btn>
      </div>
    </Sheet>
  )
}

function ShiftModule({ companyId, operatorId, mode }) {
  const qc = useQueryClient()
  const [fuelOpen, setFuelOpen]         = useState(false)
  const [incOpen, setIncOpen]           = useState(false)
  const [endOpen, setEndOpen]           = useState(false)

  // Today's open shift
  const { data: activeShift, isLoading: shiftLoading, refetch: refetchShift } = useQuery({
    queryKey: ['op_active_shift', operatorId, today()],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('*, equipment:equipment_id(name,equipment_number,category)')
        .eq('company_id', companyId).eq('operator_id', operatorId)
        .eq('shift_date', today()).in('status', ['open'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      return data || null
    },
    enabled: !!companyId && !!operatorId,
  })

  // Equipment list
  const { data: equipments = [] } = useQuery({
    queryKey: ['op_equipment', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id,name,equipment_number,category,meter_reading,last_meter')
        .eq('company_id', companyId).in('status', ['active','idle'])
        .order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Fuel entries for active shift
  const { data: fuelEntries = [] } = useQuery({
    queryKey: ['op_shift_fuel', activeShift?.id],
    queryFn: async () => {
      if (!activeShift?.id) return []
      const { data } = await supabase.from('shift_fuel_entries')
        .select('*').eq('shift_id', activeShift.id).order('created_at')
      return data || []
    },
    enabled: !!activeShift?.id,
  })

  const totalFuelToday = fuelEntries.reduce((s, f) => s + (Number(f.quantity_liters) || 0), 0)

  if (shiftLoading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
    </div>
  )

  // ── No active shift ────────────────────────────────────────────────────────
  if (!activeShift) {
    return (
      <div className="space-y-6">
        <div className="text-center py-6">
          <div className="text-5xl mb-3">🌅</div>
          <p className="text-slate-200 font-semibold text-lg">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}!</p>
          <p className="text-slate-500 text-sm mt-1">No active shift today — start one to begin</p>
        </div>
        <StartShiftBasic companyId={companyId} operatorId={operatorId} equipments={equipments}
          onStarted={() => refetchShift()} />
      </div>
    )
  }

  // ── Active shift ────────────────────────────────────────────────────────────
  const eq = activeShift.equipment
  const elapsedMins = activeShift.start_time
    ? Math.max(0, Math.round((Date.now() - new Date(`${today()} ${activeShift.start_time}`).getTime()) / 60000))
    : 0
  const elapsedHrs = (elapsedMins / 60).toFixed(1)

  return (
    <div className="space-y-4">
      {/* Active shift card */}
      <div className="bg-gradient-to-br from-primary-900/40 to-dark-800 border border-primary-700/30 rounded-2xl p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-primary-400 font-semibold uppercase tracking-wide">Active Shift</p>
            <p className="text-slate-100 font-bold text-lg mt-0.5">{eq?.name}</p>
            <p className="text-slate-500 text-xs">{eq?.equipment_number} · {eq?.category}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary-300">{elapsedHrs}</p>
            <p className="text-xs text-slate-500">hrs elapsed</p>
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
            <p className="text-sm font-bold text-yellow-300">{fmtN(totalFuelToday, 1)} L</p>
            <p className="text-[10px] text-slate-500">Fuel Today</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-3">
        <ActionBtn icon="⛽" label="Record Fuel" onClick={() => setFuelOpen(true)} color="yellow" />
        <ActionBtn icon="⚠️" label="Incident" onClick={() => setIncOpen(true)} color="orange" />
        <ActionBtn icon="🏁" label="End Shift" onClick={() => setEndOpen(true)} color="red" />
      </div>

      {/* Fuel log */}
      {fuelEntries.length > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Today's Fuel</p>
          {fuelEntries.map(f => (
            <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-dark-700 last:border-0">
              <p className="text-xs text-slate-300">{new Date(f.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-sm font-semibold text-yellow-400">{Number(f.quantity_liters)} L</p>
              {f.receipt_url && <a href={f.receipt_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary-400">📷 Proof</a>}
            </div>
          ))}
        </div>
      )}

      {/* Sheets */}
      <RecordFuelSheet open={fuelOpen} onClose={() => setFuelOpen(false)} shift={activeShift} companyId={companyId} />
      <RecordIncidentSheet open={incOpen} onClose={() => setIncOpen(false)} shift={activeShift} companyId={companyId} />
      <EndShiftSheet open={endOpen} onClose={() => setEndOpen(false)} shift={activeShift} companyId={companyId}
        onEnded={() => { refetchShift(); qc.invalidateQueries(['op_active_shift', operatorId, today()]) }} />
    </div>
  )
}

function ActionBtn({ icon, label, onClick, color }) {
  const colors = {
    yellow: 'bg-yellow-900/30 border-yellow-700/30 text-yellow-400',
    orange: 'bg-orange-900/30 border-orange-700/30 text-orange-400',
    red:    'bg-red-900/30 border-red-700/30 text-red-400',
    green:  'bg-green-900/30 border-green-700/30 text-green-400',
  }
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-4 rounded-2xl border font-medium transition-all active:scale-95 ${colors[color] || colors.green}`}>
      <span className="text-2xl">{icon}</span>
      <span className="text-[11px]">{label}</span>
    </button>
  )
}

// ─── ATTENDANCE MODULE ────────────────────────────────────────────────────────

function AttendanceModule({ companyId, operatorId, employeeId, mode }) {
  const qc = useQueryClient()
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [saving, setSaving]       = useState(false)

  const todayStr = today()
  const now      = new Date()
  const month    = now.getMonth() + 1
  const year     = now.getFullYear()

  // Today's attendance
  const { data: todayAtt, refetch: refetchToday } = useQuery({
    queryKey: ['op_attendance_today', employeeId, todayStr],
    queryFn: async () => {
      if (!employeeId) return null
      const { data } = await supabase.from('hr_attendance')
        .select('*').eq('employee_id', employeeId).eq('attendance_date', todayStr).maybeSingle()
      return data || null
    },
    enabled: !!employeeId,
  })

  // Month attendance
  const { data: monthAtt = [] } = useQuery({
    queryKey: ['op_attendance_month', employeeId, year, month],
    queryFn: async () => {
      if (!employeeId) return []
      const from = `${year}-${String(month).padStart(2,'0')}-01`
      const to   = `${year}-${String(month).padStart(2,'0')}-31`
      const { data } = await supabase.from('hr_attendance')
        .select('*').eq('employee_id', employeeId).gte('attendance_date', from).lte('attendance_date', to)
      return data || []
    },
    enabled: !!employeeId,
  })

  // Leave balance
  const { data: leaves = [] } = useQuery({
    queryKey: ['op_leaves', employeeId],
    queryFn: async () => {
      if (!employeeId) return []
      const { data } = await supabase.from('hr_leaves')
        .select('*').eq('employee_id', employeeId).order('created_at', { ascending: false }).limit(20)
      return data || []
    },
    enabled: !!employeeId,
  })

  const handleCheckIn = async () => {
    if (!employeeId) return toast.error('Employee record not linked to your login')
    setSaving(true)
    try {
      const location = await getLocation()
      const time = nowTime()
      if (todayAtt) {
        await supabase.from('hr_attendance').update({ shift_start_time: time, status: 'present', check_in_location: location }).eq('id', todayAtt.id)
      } else {
        await supabase.from('hr_attendance').insert({
          company_id: companyId, employee_id: employeeId, attendance_date: todayStr,
          status: 'present', shift_start_time: time, check_in_location: location,
          marked_by: operatorId,
        })
      }
      toast.success(`Checked in at ${time}`)
      refetchToday(); qc.invalidateQueries(['op_attendance_month'])
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  const handleCheckOut = async () => {
    if (!todayAtt) return toast.error('Check in first')
    setSaving(true)
    try {
      const location = await getLocation()
      const time = nowTime()
      await supabase.from('hr_attendance').update({ shift_end_time: time, check_out_location: location }).eq('id', todayAtt.id)
      toast.success(`Checked out at ${time}`)
      refetchToday(); qc.invalidateQueries(['op_attendance_month'])
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  const daysPresent = monthAtt.filter(a => a.status === 'present').length
  const daysAbsent  = monthAtt.filter(a => a.status === 'absent').length
  const daysLeave   = monthAtt.filter(a => a.status === 'on_leave').length
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length

  const isCheckedIn  = !!todayAtt?.shift_start_time
  const isCheckedOut = !!todayAtt?.shift_end_time

  const STATUS_COLOR = { present:'text-green-400', absent:'text-red-400', on_leave:'text-blue-400', half_day:'text-yellow-400', holiday:'text-purple-400' }

  return (
    <div className="space-y-4">
      {/* Today's check-in/out card */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
          Today · {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'short' })}
        </p>
        {todayAtt ? (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-green-900/20 border border-green-700/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-green-400">{todayAtt.shift_start_time || '—'}</p>
              <p className="text-[10px] text-slate-500">Check-in</p>
            </div>
            <div className="bg-orange-900/20 border border-orange-700/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-orange-400">{todayAtt.shift_end_time || '—'}</p>
              <p className="text-[10px] text-slate-500">Check-out</p>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm mb-4 text-center">Not yet marked today</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Btn onClick={handleCheckIn} loading={saving} disabled={isCheckedIn} variant={isCheckedIn ? 'ghost' : 'primary'}>
            {isCheckedIn ? '✓ Checked In' : '👆 Check In'}
          </Btn>
          <Btn onClick={handleCheckOut} loading={saving} disabled={!isCheckedIn || isCheckedOut} variant={isCheckedOut ? 'ghost' : 'danger'}>
            {isCheckedOut ? '✓ Checked Out' : '✋ Check Out'}
          </Btn>
        </div>
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-3 gap-2">
        {[['Present', daysPresent, 'text-green-400'],['Absent', daysAbsent, 'text-red-400'],['Leave', daysLeave, 'text-blue-400']].map(([l,v,c]) => (
          <div key={l} className="bg-dark-800 border border-dark-600 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${c}`}>{v}</p>
            <p className="text-[10px] text-slate-500">{l} days</p>
          </div>
        ))}
      </div>

      {/* Leave request */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-300">Leave Requests</p>
        <button onClick={() => setLeaveOpen(true)}
          className="text-xs text-primary-400 bg-primary-900/20 border border-primary-700/30 px-3 py-1.5 rounded-lg hover:bg-primary-900/40 transition-colors">
          + Apply Leave
        </button>
      </div>

      {leaves.slice(0, 5).map(l => (
        <div key={l.id} className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-200 capitalize">{l.leave_type} Leave</p>
            <p className="text-xs text-slate-500">{l.from_date} → {l.to_date} · {l.days} day{l.days !== 1 ? 's':''}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${l.status === 'approved' ? 'bg-green-900/30 text-green-400' : l.status === 'rejected' ? 'bg-red-900/30 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
            {l.status}
          </span>
        </div>
      ))}

      {/* Attendance history (Advanced) */}
      {mode === 'advanced' && monthAtt.length > 0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <p className="text-xs text-slate-500 uppercase tracking-wide px-4 py-2 border-b border-dark-700">This Month</p>
          <div className="divide-y divide-dark-700 max-h-60 overflow-y-auto">
            {monthAtt.map(a => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2">
                <p className="text-xs text-slate-400">{new Date(a.attendance_date).toLocaleDateString('en-IN', { weekday:'short', day:'numeric' })}</p>
                <div className="text-xs text-slate-300">{a.shift_start_time || '—'} → {a.shift_end_time || '—'}</div>
                <span className={`text-xs font-semibold capitalize ${STATUS_COLOR[a.status] || 'text-slate-400'}`}>{a.status?.replace('_',' ')}</span>
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
  const [type, setType]   = useState('casual')
  const [from, setFrom]   = useState(today())
  const [to, setTo]       = useState(today())
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const TYPES = ['casual','sick','earned','unpaid','comp_off']

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
      onSaved(); onClose()
      setReason(''); setType('casual')
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Apply for Leave">
      <div className="space-y-4">
        <div>
          <FieldLabel>Leave Type</FieldLabel>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`py-2 rounded-lg text-xs font-semibold capitalize transition-all ${type === t ? 'bg-primary-600 text-white' : 'bg-dark-700 text-slate-400 border border-dark-500'}`}>
                {t.replace('_',' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>From</FieldLabel><input type="date" className={inp} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><FieldLabel>To</FieldLabel><input type="date" className={inp} value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <div>
          <FieldLabel>Reason</FieldLabel>
          <textarea className={`${inp} resize-none`} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for leave…" />
        </div>
        <Btn onClick={handleSubmit} loading={saving}>Submit Leave Request</Btn>
      </div>
    </Sheet>
  )
}

// ─── HR MODULE ────────────────────────────────────────────────────────────────

function HRModule({ companyId, operatorId, employeeId, profile, mode }) {
  const [editOpen, setEditOpen] = useState(false)

  const { data: salary } = useQuery({
    queryKey: ['op_salary_structure', employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      const { data } = await supabase.from('hr_salary_structure')
        .select('*').eq('employee_id', employeeId).order('effective_from', { ascending: false }).limit(1).maybeSingle()
      return data || null
    },
    enabled: !!employeeId,
  })

  const now    = new Date()
  const { data: payslip } = useQuery({
    queryKey: ['op_payslip', operatorId, now.getFullYear(), now.getMonth() + 1],
    queryFn: async () => {
      const { data } = await supabase.from('salary_records')
        .select('*').eq('user_id', operatorId)
        .eq('year', now.getFullYear()).eq('month', now.getMonth() + 1).maybeSingle()
      return data || null
    },
    enabled: !!operatorId,
  })

  const gross = salary
    ? (Number(salary.basic_salary)||0)+(Number(salary.hra)||0)+(Number(salary.special_allowance)||0)+(Number(salary.other_allowance)||0)
    : 0

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="bg-gradient-to-br from-dark-800 to-dark-900 border border-dark-600 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary-900/40 border-2 border-primary-700/50 flex items-center justify-center text-2xl font-bold text-primary-300 shrink-0">
          {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-lg truncate">{profile?.full_name}</p>
          <p className="text-slate-400 text-sm">{profile?.designation || 'Operator'}</p>
          {profile?.employee_id && <p className="text-xs text-slate-500 font-mono">{profile.employee_id}</p>}
          <p className="text-xs text-slate-500">{profile?.department || ''}</p>
        </div>
        <button onClick={() => setEditOpen(true)}
          className="text-xs text-primary-400 px-2 py-1 rounded-lg bg-primary-900/20 border border-primary-700/20">
          Edit
        </button>
      </div>

      {/* Current month payslip */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
          {now.toLocaleString('en-IN', { month:'long', year:'numeric' })} — Salary
        </p>
        {payslip ? (
          <div className="space-y-2">
            <SalRow label="Gross Salary" value={fmt(payslip.gross_salary)} accent />
            <SalRow label="Days Present" value={`${payslip.days_present} / ${payslip.working_days}`} />
            <SalRow label="Base Salary" value={fmt(payslip.base_salary)} />
            <SalRow label="Allowances"  value={fmt(payslip.allowances)} />
            {Number(payslip.overtime_amount) > 0 && <SalRow label="Overtime" value={fmt(payslip.overtime_amount)} />}
            <SalRow label="Deductions"  value={`-${fmt(payslip.deductions)}`} color="text-red-400" />
            <div className="border-t border-dark-600 pt-2 mt-2">
              <SalRow label="Net Pay" value={fmt(payslip.net_salary)} accent large />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full ${payslip.status === 'paid' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                {payslip.status === 'paid' ? '✓ Paid' : payslip.status}
              </span>
              {payslip.payment_date && <span className="text-xs text-slate-500">{payslip.payment_date}</span>}
            </div>
          </div>
        ) : salary ? (
          <div>
            <p className="text-xs text-slate-500 mb-3">Payslip not yet processed — salary structure on file:</p>
            <SalRow label="Gross Monthly" value={fmt(gross)} accent />
            {salary.daily_rate > 0 && <SalRow label="Daily Rate" value={fmt(salary.daily_rate)} />}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-4">No salary information on file.<br />Contact HR.</p>
        )}
      </div>

      {/* Contact info (Advanced) */}
      {mode === 'advanced' && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Contact & Info</p>
          {[['Phone', profile?.phone],['Joined', profile?.date_of_joining],['Blood Group', profile?.blood_group],['Emergency', profile?.emergency_contact_name ? `${profile.emergency_contact_name} — ${profile.emergency_contact_phone}` : null]].filter(([,v])=>v).map(([l,v]) => (
            <div key={l} className="flex justify-between text-sm">
              <span className="text-slate-500">{l}</span>
              <span className="text-slate-200">{v}</span>
            </div>
          ))}
        </div>
      )}

      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} profile={profile} operatorId={operatorId} />
    </div>
  )
}

function SalRow({ label, value, accent, large, color }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={accent ? 'text-slate-300 font-semibold' : 'text-slate-400'}>{label}</span>
      <span className={`font-mono ${large ? 'text-base font-bold text-green-400' : accent ? 'text-slate-100 font-semibold' : color || 'text-slate-200'}`}>{value}</span>
    </div>
  )
}

function EditProfileSheet({ open, onClose, profile, operatorId }) {
  const [phone, setPhone]   = useState(profile?.phone || '')
  const [blood, setBlood]   = useState(profile?.blood_group || '')
  const [ecName, setEcName] = useState(profile?.emergency_contact_name || '')
  const [ecPhone, setEcPhone] = useState(profile?.emergency_contact_phone || '')
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.from('user_profiles').update({ phone, blood_group: blood, emergency_contact_name: ecName, emergency_contact_phone: ecPhone }).eq('id', operatorId)
      toast.success('Profile updated')
      qc.invalidateQueries(['op_profile'])
      onClose()
    } catch (err) { toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit Profile">
      <div className="space-y-4">
        <div><FieldLabel>Phone</FieldLabel><input className={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile number" type="tel" /></div>
        <div><FieldLabel>Blood Group</FieldLabel>
          <select className={inp} value={blood} onChange={e => setBlood(e.target.value)}>
            <option value="">Select…</option>
            {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div><FieldLabel>Emergency Contact Name</FieldLabel><input className={inp} value={ecName} onChange={e => setEcName(e.target.value)} placeholder="Name" /></div>
        <div><FieldLabel>Emergency Contact Phone</FieldLabel><input className={inp} value={ecPhone} onChange={e => setEcPhone(e.target.value)} placeholder="Phone" type="tel" /></div>
        <Btn onClick={handleSave} loading={saving}>Save Changes</Btn>
      </div>
    </Sheet>
  )
}

// ─── MAIN PORTAL ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'shift',      icon: '⚙️',  label: 'Shift' },
  { id: 'attendance', icon: '📅',  label: 'Attendance' },
  { id: 'hr',         icon: '👤',  label: 'HR & Pay' },
]

export default function OperatorPortal() {
  const { userProfile, company, companyId, signOut } = useAuth()
  const [tab, setTab]   = useState('shift')
  const [mode, setMode] = useState('basic')

  // Look up hr_employees record linked to this user
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

  const employeeId = employee?.id || null

  const tabContent = () => {
    const props = { companyId, operatorId: userProfile?.id, employeeId, profile: userProfile, mode }
    switch (tab) {
      case 'shift':      return <ShiftModule      {...props} />
      case 'attendance': return <AttendanceModule {...props} />
      case 'hr':         return <HRModule         {...props} />
      default:           return null
    }
  }

  return (
    <div className="flex flex-col h-screen bg-dark-900 text-slate-100 max-w-lg mx-auto">
      {/* Top bar */}
      <div className="shrink-0 bg-dark-800 border-b border-dark-700 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{userProfile?.full_name}</p>
          <p className="text-[11px] text-slate-500 truncate">{company?.name} · {userProfile?.designation || 'Operator'}</p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
        <button onClick={signOut} className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded-lg hover:bg-dark-700 transition-colors">
          Out
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 pb-28">
          {/* Tab header */}
          <div className="flex items-center gap-2 mb-5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === t.id ? 'bg-primary-600 text-white' : 'bg-dark-800 text-slate-400 border border-dark-600'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          {tabContent()}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="shrink-0 fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-dark-800/95 backdrop-blur border-t border-dark-700">
        <div className="flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${tab === t.id ? 'text-primary-400' : 'text-slate-500'}`}>
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="text-[10px] font-medium">{t.label}</span>
              {tab === t.id && <div className="w-1 h-1 rounded-full bg-primary-400 mt-0.5" />}
            </button>
          ))}
        </div>
        <div className="h-safe-area-inset-bottom" />
      </div>
    </div>
  )
}

// ─── Helper (used in ShiftModule) ─────────────────────────────────────────────
function fmtN(n, d = 0) { return n == null ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) }
