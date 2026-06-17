import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  EQUIPMENT_CATEGORIES, getMeterType, STATUS_COLORS, INCIDENT_TYPES, INCIDENT_SEVERITY
} from '../../lib/equipmentTypes'
import {
  Truck, Plus, ChevronRight, Fuel, AlertTriangle, Clock,
  X, Loader2, CheckCircle, Activity,
  PlayCircle, StopCircle, Gauge, User
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// ── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().split('T')[0] }
function nowTime() { return new Date().toTimeString().slice(0, 5) }

function MeterDisplay({ equipment }) {
  const mt = equipment.meter_type
  const val = Number(equipment.current_meter_reading || 0).toFixed(1)
  if (mt === 'hours')      return <span>{val} hrs</span>
  if (mt === 'kilometers') return <span>{val} km</span>
  return <span>{val} hrs</span>
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
    } finally {
      setSaving(false)
    }
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
          <input type="number" className={inp()} value={form.year_of_manufacture} onChange={e => set('year_of_manufacture', e.target.value)} placeholder="2022" min="1990" max="2030" />
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
        <textarea className={inp()} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional details…" />
      </Field>
    </Modal>
  )
}

// ── Start Shift Modal ─────────────────────────────────────────────────────────

function StartShiftModal({ equipment, companyId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    shift_date: today(), shift_type: 'day',
    operator_name: '', site_incharge_name: '',
    start_time: nowTime(), start_meter: String(equipment.current_meter_reading || ''),
    start_km: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const mt = equipment.meter_type

  const handleSave = async () => {
    if (!form.operator_name.trim()) { toast.error('Operator name is required'); return }
    if (mt !== 'kilometers' && !form.start_meter) { toast.error('Start meter reading required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('shifts').insert({
        company_id: companyId,
        equipment_id: equipment.id,
        shift_date: form.shift_date,
        shift_type: form.shift_type,
        operator_name: form.operator_name,
        site_incharge_name: form.site_incharge_name || null,
        start_time: form.start_time,
        start_meter: form.start_meter ? Number(form.start_meter) : null,
        start_km: form.start_km ? Number(form.start_km) : null,
        status: 'open',
        notes: form.notes || null,
      })
      if (error) throw error
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

  return (
    <Modal title={`Start Shift — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</> : '▶ Start Shift'}
        </button>
      </>
    }>
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
        <input className={inp()} value={form.operator_name} onChange={e => set('operator_name', e.target.value)} placeholder="Full name" />
      </Field>
      <Field label="Site Incharge Name">
        <input className={inp()} value={form.site_incharge_name} onChange={e => set('site_incharge_name', e.target.value)} placeholder="Supervisor / Incharge name" />
      </Field>
      <Field label="Shift Start Time">
        <input type="time" className={inp()} value={form.start_time} onChange={e => set('start_time', e.target.value)} />
      </Field>
      {(mt === 'hours' || mt === 'both') && (
        <Field label="Start Hour Meter (hrs)" required>
          <input type="number" className={inp()} value={form.start_meter} onChange={e => set('start_meter', e.target.value)} placeholder="e.g. 4250.5" step="0.1" />
        </Field>
      )}
      {(mt === 'kilometers' || mt === 'both') && (
        <Field label="Start Odometer (km)" required={mt === 'kilometers'}>
          <input type="number" className={inp()} value={form.start_km} onChange={e => set('start_km', e.target.value)} placeholder="e.g. 125400" />
        </Field>
      )}
      <Field label="Notes">
        <textarea className={inp()} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Site location, work details…" />
      </Field>
    </Modal>
  )
}

// ── End Shift Modal ───────────────────────────────────────────────────────────

function EndShiftModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    end_time: nowTime(), end_meter: '', end_km: '',
    working_hours: '', idle_hours: '0', breakdown_hours: '0', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const mt = equipment.meter_type

  const handleSave = async () => {
    if (mt !== 'kilometers' && !form.end_meter) { toast.error('End meter reading required'); return }
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
        <Field label="Closing Hour Meter (hrs)" required>
          <input type="number" className={inp()} value={form.end_meter} onChange={e => set('end_meter', e.target.value)} placeholder={`≥ ${shift.start_meter}`} step="0.1" />
        </Field>
      )}
      {(mt === 'kilometers' || mt === 'both') && (
        <Field label="Closing Odometer (km)" required={mt === 'kilometers'}>
          <input type="number" className={inp()} value={form.end_km} onChange={e => set('end_km', e.target.value)} placeholder={`≥ ${shift.start_km || 0}`} />
        </Field>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Working Hrs">
          <input type="number" className={inp()} value={form.working_hours} onChange={e => set('working_hours', e.target.value)} placeholder="Auto" step="0.1" />
        </Field>
        <Field label="Idle Hrs">
          <input type="number" className={inp()} value={form.idle_hours} onChange={e => set('idle_hours', e.target.value)} placeholder="0" step="0.1" />
        </Field>
        <Field label="Breakdown Hrs">
          <input type="number" className={inp()} value={form.breakdown_hours} onChange={e => set('breakdown_hours', e.target.value)} placeholder="0" step="0.1" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={inp()} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Work done, issues, remarks…" />
      </Field>
    </Modal>
  )
}

// ── Fuel Modal ────────────────────────────────────────────────────────────────

function FuelModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    quantity_liters: '', rate_per_liter: '',
    meter_at_filling: String(equipment.current_meter_reading || ''), km_at_filling: '',
    delivered_by_name: '', vendor_name: '', invoice_number: '', filling_location: '', notes: '',
  })
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
        filling_location: form.filling_location || null,
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
      <Field label="Filling Location">
        <input className={inp()} value={form.filling_location} onChange={e => set('filling_location', e.target.value)} placeholder="Site / location name" />
      </Field>
      <Field label="Notes">
        <textarea className={inp()} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </Field>
    </Modal>
  )
}

// ── Incident Modal ────────────────────────────────────────────────────────────

function IncidentModal({ equipment, shift, companyId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ incident_type: 'breakdown', severity: 'medium', description: '', action_taken: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error('Description is required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('shift_incidents').insert({
        company_id: companyId,
        shift_id: shift?.id || null,
        equipment_id: equipment.id,
        incident_type: form.incident_type,
        severity: form.severity,
        description: form.description,
        action_taken: form.action_taken || null,
        resolved: false,
      })
      if (error) throw error
      if (form.incident_type === 'breakdown') {
        await supabase.from('equipment').update({ status: 'breakdown' }).eq('id', equipment.id)
      } else if (form.incident_type === 'regular_maintenance') {
        await supabase.from('equipment').update({ status: 'maintenance' }).eq('id', equipment.id)
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

  const sevColors = { low: 'emerald', medium: 'yellow', high: 'orange', critical: 'red' }

  return (
    <Modal title={`Report Incident — ${equipment.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-danger">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Reporting…</> : 'Report Incident'}
        </button>
      </>
    }>
      <Field label="Incident Type" required>
        <div className="grid grid-cols-2 gap-2">
          {INCIDENT_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => set('incident_type', t.value)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium text-left transition-all
                ${form.incident_type === t.value
                  ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                  : 'border-dark-600 bg-dark-700 text-slate-400 hover:border-dark-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Severity">
        <div className="grid grid-cols-4 gap-2">
          {INCIDENT_SEVERITY.map(s => (
            <button key={s.value} type="button" onClick={() => set('severity', s.value)}
              className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-all
                ${form.severity === s.value
                  ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                  : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Description" required>
        <textarea className={inp()} rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What happened? Describe clearly…" />
      </Field>
      <Field label="Action Taken">
        <textarea className={inp()} rows={2} value={form.action_taken} onChange={e => set('action_taken', e.target.value)} placeholder="What was done immediately?" />
      </Field>
    </Modal>
  )
}

// ── Equipment Detail ──────────────────────────────────────────────────────────

function EquipmentDetail({ equipment, companyId, onClose }) {
  const [modal, setModal] = useState(null)

  const { data: activeShift } = useQuery({
    queryKey: ['active_shift', equipment.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('shifts').select('*').eq('equipment_id', equipment.id)
        .eq('status', 'open').order('created_at', { ascending: false }).limit(1).maybeSingle()
      return data
    },
  })

  const { data: recentShifts = [] } = useQuery({
    queryKey: ['shifts', equipment.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('shifts').select('*').eq('equipment_id', equipment.id)
        .order('shift_date', { ascending: false }).limit(5)
      return data || []
    },
  })

  const { data: recentFuel = [] } = useQuery({
    queryKey: ['fuel', equipment.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('shift_fuel_entries').select('*').eq('equipment_id', equipment.id)
        .order('created_at', { ascending: false }).limit(5)
      return data || []
    },
  })

  const { data: openIncidents = [] } = useQuery({
    queryKey: ['incidents', equipment.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('shift_incidents').select('*').eq('equipment_id', equipment.id)
        .eq('resolved', false).order('created_at', { ascending: false })
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

        {openIncidents.length > 0 && (
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
            <p className="text-xs font-semibold text-red-400 mb-1">⚠ {openIncidents.length} Open Incident{openIncidents.length > 1 ? 's' : ''}</p>
            {openIncidents.map(i => (
              <p key={i.id} className="text-xs text-slate-300">· {INCIDENT_TYPES.find(t => t.value === i.incident_type)?.label} — {i.description?.slice(0, 60)}</p>
            ))}
          </div>
        )}

        {recentShifts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recent Shifts</p>
            <div className="space-y-2">
              {recentShifts.map(s => (
                <div key={s.id} className="bg-dark-700 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 font-medium">{s.operator_name} · {s.shift_date}</p>
                    <p className="text-slate-400">{s.start_time}{s.end_time ? ` → ${s.end_time}` : ' (open)'} · {s.working_hours || 0} hrs</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full ${s.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-600 text-slate-400'}`}>{s.status}</span>
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
                  </div>
                  {f.total_amount && <span className="text-yellow-400 font-medium">₹{Number(f.total_amount).toLocaleString('en-IN')}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {modal === 'start'    && <StartShiftModal  equipment={equipment} companyId={companyId} onClose={() => { setModal(null); onClose() }} />}
      {modal === 'end'      && <EndShiftModal    equipment={equipment} shift={activeShift} companyId={companyId} onClose={() => { setModal(null); onClose() }} />}
      {modal === 'fuel'     && <FuelModal        equipment={equipment} shift={activeShift} companyId={companyId} onClose={() => setModal(null)} />}
      {modal === 'incident' && <IncidentModal    equipment={equipment} shift={activeShift} companyId={companyId} onClose={() => setModal(null)} />}
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
          <Gauge className="w-3.5 h-3.5" /><MeterDisplay equipment={equipment} />
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
        {shifts.length > 0 && <span className="text-xs text-slate-400">{shifts.length} shifts · {totalHours.toFixed(1)} hrs</span>}
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
                  {s.site_incharge_name && <span className="col-span-2 mt-0.5">Incharge: {s.site_incharge_name}</span>}
                  <span>Opening: {s.start_meter || s.start_km} {s.equipment?.meter_type === 'kilometers' ? 'km' : 'hrs'}</span>
                  <span>Worked: <strong className="text-slate-200">{s.working_hours || 0} hrs</strong></span>
                </div>
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
                  {e.filling_location && <span>Location: {e.filling_location}</span>}
                </div>
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
              const incType = INCIDENT_TYPES.find(t => t.value === i.incident_type)
              return (
                <div key={i.id} className={`bg-dark-800 border rounded-xl p-3 ${i.resolved ? 'border-dark-700 opacity-60' : 'border-orange-700/30'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 text-sm">{i.equipment?.name}</p>
                      <p className="text-xs text-slate-400">{incType?.label} · {i.severity}</p>
                    </div>
                    {!i.resolved && (
                      <button onClick={() => resolveIncident(i.id)}
                        className="shrink-0 flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-700/40 rounded-lg px-2 py-1">
                        <CheckCircle className="w-3 h-3" /> Resolve
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{i.description}</p>
                  {i.action_taken && <p className="text-xs text-slate-500 mt-1">Action: {i.action_taken}</p>}
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
