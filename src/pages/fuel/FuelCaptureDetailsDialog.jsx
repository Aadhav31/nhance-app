import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { fuelCaptureDetails, validateFuelCaptureDetails, completeFuelCapture } from '../../lib/fuelCaptureCompletion'
import { supabase } from '../../lib/supabase'

const inputClass = 'w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-slate-100 focus:border-primary-500 focus:outline-none'
const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function FuelCaptureDetailsDialog({ capture, equipment, projects, onClose, onSaved }) {
  const dialog = useRef(null)
  const [details, setDetails] = useState(() => fuelCaptureDetails(capture))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => { setDetails(current => ({ ...current, [key]: value })); setError('') }
  const machine = equipment.find(item => item.id === details.equipment_id)
  const calculated = Number(details.quantity_liters) * Number(details.rate_per_liter)
  const validation = validateFuelCaptureDetails(details, capture.total_amount)

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  async function save(submit) {
    if (saving) return
    if (validation) { setError(validation); return }
    setSaving(true)
    setError('')
    try {
      await completeFuelCapture(supabase, capture, details, submit)
      onSaved(submit)
    } catch (err) {
      setError(['PGRST202', '42883'].includes(err.code)
        ? 'Fuel detail saving is not available on this release yet.' : err.message || 'Could not save fuel details. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="fuel-detail-title" aria-describedby="fuel-detail-description" onCancel={event => { event.preventDefault(); if (!saving) onClose() }} className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-dark-600 bg-dark-800 p-0 text-slate-100 shadow-2xl backdrop:bg-black/70">
      <div className="flex items-start justify-between gap-3 border-b border-dark-600 p-4">
        <div>
          <h2 id="fuel-detail-title" className="text-lg font-bold">Complete fuel details</h2>
          <p id="fuel-detail-description" className="mt-1 text-xs text-slate-400">Enter the receipt details, then submit for independent approval.</p>
        </div>
        <button type="button" disabled={saving} onClick={onClose} aria-label="Close fuel details" className="rounded-lg p-2 text-slate-400 hover:bg-dark-700"><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={event => { event.preventDefault(); save(true) }} className="space-y-4 p-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="text-slate-400">Recorded expense <strong className="float-right text-base text-amber-300">{money(capture.total_amount)}</strong></p>
          <p className="mt-2 text-slate-500">Payee: {capture.source_snapshot?.payee_name || capture.vendor_name || 'Not recorded'}. This payment stays linked to the original expense.</p>
          {capture.receipt_url && /^https?:\/\//i.test(capture.receipt_url) && <a href={capture.receipt_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-primary-400 underline">View original receipt</a>}
        </div>
        <fieldset disabled={saving} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-400">Fuel date *<input className={inputClass} type="date" required value={details.expense_date} onChange={event => set('expense_date', event.target.value)} /></label>
          <label className="space-y-1 text-xs text-slate-400">Fuel source *<select className={inputClass} value={details.fuel_source} onChange={event => set('fuel_source', event.target.value)}><option value="petrol_pump">Petrol pump</option><option value="vendor_supply">Vendor supply</option><option value="company_bowser">Company bowser</option><option value="company_tank">Company tank</option></select></label>
          <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">Equipment *<select className={inputClass} required value={details.equipment_id} onChange={event => set('equipment_id', event.target.value)}><option value="">Select equipment</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}{item.equipment_number ? ` · ${item.equipment_number}` : ''}</option>)}</select></label>
          <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">Project *<select className={inputClass} required value={details.project_id} onChange={event => set('project_id', event.target.value)}><option value="">Select project</option>{projects.map(item => <option key={item.id} value={item.id}>{item.project_name}</option>)}</select></label>
          <label className="space-y-1 text-xs text-slate-400">Litres filled *<input className={inputClass} type="number" inputMode="decimal" min="0.001" step="0.001" required value={details.quantity_liters} onChange={event => set('quantity_liters', event.target.value)} /></label>
          <label className="space-y-1 text-xs text-slate-400">Unit price (₹/litre) *<input className={inputClass} type="number" inputMode="decimal" min="0.001" step="0.001" required value={details.rate_per_liter} onChange={event => set('rate_per_liter', event.target.value)} /></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="button" disabled={Number(details.quantity_liters) <= 0} onClick={() => set('rate_per_liter', (Number(capture.total_amount) / Number(details.quantity_liters)).toFixed(3))} className="btn-ghost px-2 py-1 text-[11px]">Calculate unit price from amount</button>
            <button type="button" disabled={Number(details.rate_per_liter) <= 0} onClick={() => set('quantity_liters', (Number(capture.total_amount) / Number(details.rate_per_liter)).toFixed(3))} className="btn-ghost px-2 py-1 text-[11px]">Calculate litres from amount</button>
          </div>
          <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">Fuel station / supplier *<input className={inputClass} required maxLength={200} value={details.station_name} onChange={event => set('station_name', event.target.value)} placeholder="Name shown on the fuel receipt" /></label>
          <label className="space-y-1 text-xs text-slate-400">Invoice / bill number<input className={inputClass} maxLength={100} value={details.bill_number} onChange={event => set('bill_number', event.target.value)} placeholder="If issued" /></label>
          <label className="space-y-1 text-xs text-slate-400">{machine?.meter_type === 'odometer' ? 'Odometer reading' : 'Hour-meter reading'}<input className={inputClass} type="number" inputMode="decimal" min="0" step="0.01" value={details.meter_reading} onChange={event => set('meter_reading', event.target.value)} placeholder="Optional" /></label>
        </fieldset>
        <div className="rounded-lg bg-dark-700 p-3 text-xs text-slate-300" aria-live="polite">Litres × unit price: <strong>{money(calculated)}</strong> · Recorded: <strong>{money(capture.total_amount)}</strong><p className="mt-1 text-[11px] text-slate-500">Check both against the receipt. Saving these details does not create another expense or fuel entry.</p></div>
        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
        <p className="text-[11px] text-slate-500">Use Save details first if the approval route needs attention. Submit this entry once the reviewer is configured.</p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-dark-600 pt-3">
          <button type="button" disabled={saving} onClick={() => save(false)} className="btn-ghost px-3 py-2 text-xs">Save details</button>
          <button type="submit" disabled={saving} className="btn-primary px-3 py-2 text-xs">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save &amp; submit for approval</button>
        </div>
      </form>
    </dialog>
  )
}
