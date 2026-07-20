import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Users, Truck, MapPin, Package, FileText, Plus, Edit2, Trash2, X, Save,
  Loader2, CheckCircle, Settings2, ChevronRight, AlertCircle, ToggleLeft,
  ToggleRight, Phone, Mail, CreditCard, Calendar, Building2, Hash,
  Eye, Download, Ban, Printer, ClipboardCheck, RefreshCw, ArrowLeftRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'tokens',     label: 'Tokens',             icon: Printer      },
  { key: 'invoices',   label: 'Invoices',            icon: FileText     },
  { key: 'clients',    label: 'Clients',             icon: Users        },
  { key: 'vehicles',   label: 'Vehicles',            icon: Truck        },
  { key: 'locations',  label: 'Loading Points',      icon: MapPin       },
  { key: 'materials',  label: 'Materials & HSN',     icon: Package      },
]

const VEHICLE_TYPES = [
  'Tipper (6-Wheeler)', 'Tipper (10-Wheeler)', 'Tipper (12-Wheeler)', 'Tipper (14-Wheeler)',
  'Hyva Tipper', 'Lorry', 'Mini Truck', 'Tractor-Trailer', 'Own Fleet Vehicle', 'Other',
]

const PAYMENT_MODES = [
  { value: 'cash',          label: 'Cash' },
  { value: 'gpay',          label: 'GPay' },
  { value: 'upi',           label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'neft',          label: 'NEFT' },
  { value: 'rtgs',          label: 'RTGS' },
  { value: 'cheque',        label: 'Cheque' },
]

function inp(extra = '') {
  return `w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-slate-200
          placeholder:text-slate-500 focus:outline-none focus:border-primary-500 ${extra}`
}

function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className={`bg-dark-800 rounded-xl border border-dark-700 shadow-2xl flex flex-col max-h-[90vh] ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-dark-700 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-dark-700 flex justify-end gap-2 flex-shrink-0">{footer}</div>}
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

function Badge({ label, color = 'slate' }) {
  const colors = {
    slate:  'bg-slate-500/20 text-slate-400',
    green:  'bg-emerald-500/20 text-emerald-400',
    blue:   'bg-primary-500/20 text-primary-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    red:    'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors[color]}`}>
      {label}
    </span>
  )
}

// ── Invoice Form Modal ────────────────────────────────────────────────────────
function InvoiceFormModal({ companyId, onClose, prefill = null, onAfterSave = null }) {
  const qc = useQueryClient()
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    invoice_type:        'non_tax',
    invoice_date:        today,
    client_id:           prefill?.client_id        || '',
    walkin_name:         prefill?.walkin_name       || '',
    vehicle_id:          prefill?.vehicle_id        || '',
    vehicle_manual:      prefill?.vehicle_manual    ?? false,
    walkin_vehicle_num:  prefill?.walkin_vehicle_num || '',
    loading_point:       prefill?.loading_point     || '',
    unloading_point:     '',
    payment_type:        'cash',
    payment_mode:        'cash',
    credit_due_date:     '',
    notes:               '',
  })
  const [items, setItems] = useState([
    {
      grade_id:      prefill?.tokenGradeId  || '',
      material_name: prefill?.tokenMaterial || '',
      hsn_code:      '',
      unit:          prefill?.tokenUnit     || 'tonnes',
      quantity:      prefill?.tokenQty      || '',
      rate:          '',
    }
  ])
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-inv', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients')
        .select('id, display_name, business_name')
        .eq('company_id', companyId).order('display_name')
      if (error) console.error(error)
      return data || []
    },
  })

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles-inv', companyId, form.client_id],
    queryFn: async () => {
      let q = supabase.from('crusher_client_vehicles')
        .select('id, vehicle_number, vehicle_type, billing_basis, capacity_tonnes, capacity_uom, owner_type')
        .eq('company_id', companyId).eq('is_active', true)
      if (form.client_id) q = q.eq('client_id', form.client_id)
      const { data, error } = await q.order('vehicle_number')
      if (error) console.error(error)
      return data || []
    },
  })

  const { data: loadingPoints = [] } = useQuery({
    queryKey: ['loading-pts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('crusher_loading_points')
        .select('id, point_name, point_type')
        .eq('company_id', companyId).eq('is_active', true).order('sort_order')
      if (error) console.error(error)
      return data || []
    },
  })

  const { data: grades = [] } = useQuery({
    queryKey: ['crusher-grades', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('crusher_grades')
        .select('id, grade_name, hsn_code, default_gst_rate, default_rate')
        .eq('company_id', companyId).eq('is_active', true).order('grade_name')
      if (error) console.error(error)
      return data || []
    },
  })

  // When grades load and an item already has a grade_id (from token prefill) but no rate yet,
  // back-fill the default rate from the grade master.
  useEffect(() => {
    if (!grades.length) return
    setItems(prev => prev.map(it => {
      if (it.grade_id && !it.rate) {
        const g = grades.find(x => x.id === it.grade_id)
        if (g?.default_rate) return { ...it, rate: String(g.default_rate) }
      }
      return it
    }))
  }, [grades])

  const selectedVehicle = vehicles.find(v => v.id === form.vehicle_id)

  const handleVehicleChange = (vehicleId) => {
    set('vehicle_id', vehicleId)
    const v = vehicles.find(x => x.id === vehicleId)
    if (v?.billing_basis === 'fixed_capacity' && v?.capacity_tonnes) {
      setItems(prev => prev.map((item, i) =>
        i === 0 && !item.quantity
          ? { ...item, quantity: String(v.capacity_tonnes), unit: v.capacity_uom || 'tonnes' }
          : item
      ))
    }
  }

  const addItem    = () => setItems(p => [...p, { grade_id: '', material_name: '', hsn_code: '', unit: 'tonnes', quantity: '', rate: '' }])
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i))
  const setItem    = (i, k, v) => setItems(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it))

  const handleGradeChange = (i, gradeId) => {
    const g = grades.find(x => x.id === gradeId)
    setItems(p => p.map((it, idx) => idx === i
      ? {
          ...it,
          grade_id:      gradeId,
          material_name: g?.grade_name  || '',
          hsn_code:      g?.hsn_code    || '',
          // auto-fill rate from grade default; keep existing if grade has no rate set
          rate: g?.default_rate ? String(g.default_rate) : it.rate,
        }
      : it))
  }

  const isTax = form.invoice_type === 'tax'
  const computedItems = items.map(item => {
    const qty    = parseFloat(item.quantity) || 0
    const rate   = parseFloat(item.rate)     || 0
    const amount = qty * rate
    const gstRate   = isTax ? (parseFloat(grades.find(g => g.id === item.grade_id)?.default_gst_rate) || 0) : 0
    const gstAmount = amount * gstRate / 100
    return { ...item, amount, gstRate, gstAmount, totalAmount: amount + gstAmount }
  })
  const subtotal    = computedItems.reduce((s, i) => s + i.amount, 0)
  const totalTax    = computedItems.reduce((s, i) => s + i.gstAmount, 0)
  const totalAmount = subtotal + totalTax
  const fmt = n => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const genInvNumber = async () => {
    const dateStr = today.replace(/-/g, '')
    const { count } = await supabase.from('crusher_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).gte('invoice_date', today)
    const seq = String((count || 0) + 1).padStart(4, '0')
    return `INV-${dateStr}-${seq}`
  }

  const handleSave = async () => {
    const validItems = computedItems.filter(i => i.material_name && i.quantity && i.rate)
    if (validItems.length === 0) { toast.error('Add at least one material line with qty & rate'); return }
    if (form.payment_type === 'credit' && !form.credit_due_date) { toast.error('Credit due date is required'); return }
    setSaving(true)
    try {
      const invNumber   = await genInvNumber()
      const clientSnap  = clients.find(c => c.id === form.client_id)
      // client_name: registered client name OR typed walk-in name
      const resolvedClientName = clientSnap
        ? (clientSnap.display_name || clientSnap.business_name)
        : (form.walkin_name.trim() || null)
      // vehicle: registered vehicle OR manually typed number
      const resolvedVehicleNum = form.vehicle_manual
        ? (form.walkin_vehicle_num.trim() || null)
        : (selectedVehicle?.vehicle_number || null)

      const { data: inv, error: invErr } = await supabase.from('crusher_invoices').insert({
        company_id:      companyId,
        invoice_number:  invNumber,
        invoice_type:    form.invoice_type,
        invoice_date:    form.invoice_date,
        client_id:       form.client_id   || null,
        client_name:     resolvedClientName,
        vehicle_id:      form.vehicle_manual ? null : (form.vehicle_id || null),
        vehicle_number:  resolvedVehicleNum,
        vehicle_capacity: form.vehicle_manual ? null : (selectedVehicle?.capacity_tonnes || null),
        billing_basis:   form.vehicle_manual ? null : (selectedVehicle?.billing_basis   || null),
        loading_point:   form.loading_point   || null,
        unloading_point: form.unloading_point || null,
        payment_type:    form.payment_type,
        payment_mode:    form.payment_type === 'cash'   ? form.payment_mode    : null,
        credit_due_date: form.payment_type === 'credit' ? form.credit_due_date : null,
        subtotal,
        total_tax:    totalTax,
        total_amount: totalAmount,
        paid_amount:  form.payment_type === 'cash' ? totalAmount : 0,
        balance:      form.payment_type === 'cash' ? 0 : totalAmount,
        status:       form.payment_type === 'cash' ? 'paid' : 'issued',
        notes:        form.notes || null,
      }).select('id').single()
      if (invErr) throw invErr

      const itemRows = validItems.map((item, idx) => ({
        invoice_id:    inv.id,
        grade_id:      item.grade_id    || null,
        material_name: item.material_name,
        hsn_code:      item.hsn_code    || null,
        unit:          item.unit,
        quantity:      parseFloat(item.quantity),
        rate:          parseFloat(item.rate),
        amount:        item.amount,
        gst_rate:      item.gstRate,
        gst_amount:    item.gstAmount,
        total_amount:  item.totalAmount,
        sort_order:    idx,
      }))
      const { error: itemErr } = await supabase.from('crusher_invoice_items').insert(itemRows)
      if (itemErr) throw itemErr

      toast.success(`Invoice ${invNumber} created`)
      qc.invalidateQueries({ queryKey: ['crusher-invoices', companyId] })
      if (onAfterSave) { onAfterSave(inv.id) } else { onClose() }
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to save invoice')
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Create Crusher Invoice" onClose={onClose} wide
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-dark-700 text-slate-300 hover:bg-dark-600">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Invoice
          </button>
        </>
      }>

      {/* Invoice Type toggle */}
      <div className="bg-dark-700 rounded-xl p-1 flex gap-1">
        {[{ v: 'non_tax', label: '📄 Non-Tax Invoice' }, { v: 'tax', label: '🧾 Tax Invoice (GST)' }].map(opt => (
          <button key={opt.v} onClick={() => set('invoice_type', opt.v)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${form.invoice_type === opt.v ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Date */}
      <Field label="Invoice Date" required>
        <input type="date" className={inp()} value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
      </Field>

      {/* Client */}
      <Field label="Client">
        <select className={inp()} value={form.client_id}
          onChange={e => { set('client_id', e.target.value); set('vehicle_id', ''); set('walkin_name', '') }}>
          <option value="">— Walk-in / One-time customer —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
        </select>
      </Field>

      {/* Walk-in name (only when no registered client selected) */}
      {!form.client_id && (
        <Field label="Customer Name (optional — for walk-in)">
          <input className={inp()} value={form.walkin_name}
            onChange={e => set('walkin_name', e.target.value)}
            placeholder="e.g. Rajan, Murugan Traders…" />
        </Field>
      )}

      {/* Vehicle — toggle between registry and manual */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-400">Vehicle</label>
          <button type="button"
            onClick={() => { set('vehicle_manual', !form.vehicle_manual); set('vehicle_id', ''); set('walkin_vehicle_num', '') }}
            className="text-[11px] text-primary-400 hover:text-primary-300 underline underline-offset-2">
            {form.vehicle_manual ? 'Pick from registry instead' : 'Type vehicle number instead'}
          </button>
        </div>

        {form.vehicle_manual ? (
          <input className={inp()} value={form.walkin_vehicle_num}
            onChange={e => set('walkin_vehicle_num', e.target.value.toUpperCase())}
            placeholder="e.g. TN38AB1234" />
        ) : (
          <select className={inp()} value={form.vehicle_id} onChange={e => handleVehicleChange(e.target.value)}>
            <option value="">— Select registered vehicle —</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number} ({v.vehicle_type})</option>)}
          </select>
        )}
      </div>

      {/* Vehicle info chip (only for registry vehicles) */}
      {!form.vehicle_manual && selectedVehicle && (
        <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs text-slate-400 flex gap-4 border border-dark-600">
          <span>Billing: <strong className="text-slate-200">{selectedVehicle.billing_basis === 'fixed_capacity' ? 'Fixed Capacity' : 'Weigh-Based'}</strong></span>
          {selectedVehicle.billing_basis === 'fixed_capacity' && (
            <span>Capacity: <strong className="text-slate-200">{selectedVehicle.capacity_tonnes} {(selectedVehicle.capacity_uom || 'tonnes').toUpperCase()}</strong></span>
          )}
        </div>
      )}

      {/* Loading / Unloading */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loading Point">
          <select className={inp()} value={form.loading_point} onChange={e => set('loading_point', e.target.value)}>
            <option value="">— Select —</option>
            {loadingPoints.filter(p => p.point_type !== 'unloading').map(p => <option key={p.id} value={p.point_name}>{p.point_name}</option>)}
          </select>
        </Field>
        <Field label="Unloading Point">
          <select className={inp()} value={form.unloading_point} onChange={e => set('unloading_point', e.target.value)}>
            <option value="">— Select —</option>
            {loadingPoints.filter(p => p.point_type !== 'loading').map(p => <option key={p.id} value={p.point_name}>{p.point_name}</option>)}
          </select>
        </Field>
      </div>

      {/* Payment */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Payment</label>
        <div className="bg-dark-700 rounded-xl p-1 flex gap-1 mb-3">
          {[{ v: 'cash', label: '💵 Cash' }, { v: 'credit', label: '📋 Credit' }].map(opt => (
            <button key={opt.v} onClick={() => set('payment_type', opt.v)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${form.payment_type === opt.v ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        {form.payment_type === 'cash' && (
          <Field label="Payment Mode">
            <select className={inp()} value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}>
              {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        )}
        {form.payment_type === 'credit' && (
          <Field label="Payment Due Date" required>
            <input type="date" className={inp()} value={form.credit_due_date} onChange={e => set('credit_due_date', e.target.value)} />
          </Field>
        )}
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-400">Materials</label>
          <button onClick={addItem} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Line
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="bg-dark-700 rounded-lg p-3 space-y-2 border border-dark-600">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Line {i + 1}</span>
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <Field label="Material (from grade list)">
                <select className={inp()} value={item.grade_id} onChange={e => handleGradeChange(i, e.target.value)}>
                  <option value="">— Select grade —</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.grade_name}</option>)}
                </select>
              </Field>

              {!item.grade_id && (
                <Field label="Material Name (manual)">
                  <input className={inp()} value={item.material_name}
                    onChange={e => setItem(i, 'material_name', e.target.value)}
                    placeholder="e.g. M-Sand, 20mm Jelly…" />
                </Field>
              )}

              {isTax && item.grade_id && (
                <p className="text-[11px] text-slate-500 bg-dark-800 rounded px-2 py-1">
                  HSN: <span className="text-slate-300">{item.hsn_code || '—'}</span>
                  &nbsp;·&nbsp; GST: <span className="text-slate-300">{computedItems[i].gstRate}%</span>
                </p>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Field label="Quantity">
                  <input type="number" className={inp()} value={item.quantity}
                    onChange={e => setItem(i, 'quantity', e.target.value)}
                    placeholder="0" step="0.001" min="0" />
                </Field>
                <Field label="Unit">
                  <select className={inp()} value={item.unit} onChange={e => setItem(i, 'unit', e.target.value)}>
                    <option value="tonnes">Tonnes</option>
                    <option value="cum">CUM</option>
                    <option value="units">Units (Vol)</option>
                    <option value="bags">Bags</option>
                    <option value="trips">Trips</option>
                  </select>
                </Field>
                <Field label="Rate (₹)">
                  <input type="number" className={inp()} value={item.rate}
                    onChange={e => setItem(i, 'rate', e.target.value)}
                    placeholder="0.00" step="0.01" min="0" />
                </Field>
              </div>

              {item.quantity && item.rate && (
                <div className="text-right text-xs pt-0.5">
                  <span className="text-slate-500">Amount: </span>
                  <span className="text-slate-200 font-semibold">{fmt(computedItems[i].amount)}</span>
                  {isTax && computedItems[i].gstAmount > 0 && (
                    <span className="text-slate-400"> + GST {fmt(computedItems[i].gstAmount)} = <strong className="text-emerald-400">{fmt(computedItems[i].totalAmount)}</strong></span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Totals summary */}
      {computedItems.some(i => i.amount > 0) && (
        <div className="bg-dark-700 rounded-xl p-4 space-y-1.5 border border-dark-600">
          <div className="flex justify-between text-sm text-slate-400">
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          {isTax && totalTax > 0 && (
            <div className="flex justify-between text-sm text-slate-400">
              <span>GST</span><span>{fmt(totalTax)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-100 border-t border-dark-600 pt-2 mt-1">
            <span>Total</span>
            <span className="text-emerald-400">{fmt(totalAmount)}</span>
          </div>
          {form.payment_type === 'credit' && (
            <p className="text-[11px] text-yellow-400 text-right">Credit — full amount due on {form.credit_due_date || '—'}</p>
          )}
        </div>
      )}

      {/* Notes */}
      <Field label="Notes">
        <textarea className={inp('resize-none')} rows={2} value={form.notes}
          onChange={e => set('notes', e.target.value)} placeholder="Optional remarks…" />
      </Field>
    </Modal>
  )
}

// ── Thermal Receipt Print ─────────────────────────────────────────────────────
function printToken(token, companyName) {
  const timeStr = token.token_time
    ? token.token_time.substring(0, 5)          // HH:MM
    : new Date().toTimeString().substring(0, 5)
  const dateStr = token.token_date
    ? token.token_date.split('-').reverse().join('/')
    : new Date().toLocaleDateString('en-IN')

  const line  = '─'.repeat(32)
  const dline = '━'.repeat(32)

  const row = (label, value) => {
    const pad = 10
    const l = label.padEnd(pad)
    return `${l}: ${value || '—'}`
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${token.token_number}</title>
<style>
  @page { size: 80mm auto; margin: 3mm 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    width: 76mm;
    color: #000;
    background: #fff;
  }
  .center   { text-align: center; }
  .bold     { font-weight: bold; }
  .large    { font-size: 15px; letter-spacing: 1px; }
  .xlarge   { font-size: 20px; letter-spacing: 2px; }
  .divider  { border-top: 1px dashed #000; margin: 5px 0; }
  .thick    { border-top: 2px solid #000; margin: 5px 0; }
  .row      { display: flex; justify-content: space-between; margin: 2px 0; }
  .label    { color: #555; }
  .spacer   { height: 6px; }
  .footer   { margin-top: 8px; font-size: 10px; }
  pre       { font-family: inherit; font-size: 11px; white-space: pre-wrap; }
  @media print {
    body { width: 76mm; }
  }
</style>
</head>
<body>

<div class="center bold large">${(companyName || 'COMPANY').toUpperCase()}</div>
<div class="center" style="font-size:10px; margin-bottom:3px;">LOADING TOKEN</div>
<div class="thick"></div>

<div class="center xlarge bold">${token.token_number}</div>
<div class="spacer"></div>
<div class="row">
  <span class="label">Date</span>
  <span class="bold">${dateStr}</span>
</div>
<div class="row">
  <span class="label">Time</span>
  <span class="bold">${timeStr}</span>
</div>

<div class="divider"></div>

<div class="row">
  <span class="label">Customer</span>
  <span class="bold">${token.customer_name || 'Walk-in'}</span>
</div>
<div class="row">
  <span class="label">Vehicle</span>
  <span class="bold">${token.vehicle_number || '—'}</span>
</div>

<div class="divider"></div>

<div class="row">
  <span class="label">Stock Yard</span>
  <span class="bold">${token.stock_yard || '—'}</span>
</div>
<div class="row">
  <span class="label">Material</span>
  <span class="bold">${token.material_name || '—'}</span>
</div>
<div class="row">
  <span class="label">Quantity</span>
  <span class="bold" style="font-size:13px;">${Number(token.quantity || 0).toFixed(3)} ${(token.unit || 'TONNES').toUpperCase()}</span>
</div>

${token.notes ? `<div class="divider"></div>
<div style="font-size:10px; color:#555;">Note: ${token.notes}</div>` : ''}

<div class="thick"></div>
<div class="center bold" style="font-size:10px; letter-spacing:1px;">✦ VALID FOR ONE TRIP ONLY ✦</div>
<div class="center footer" style="margin-top:4px; color:#555;">Printed: ${new Date().toLocaleString('en-IN')}</div>

<script>
  window.onload = function() {
    window.print();
    setTimeout(function() { window.close(); }, 2000);
  };
</script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=320,height=600,toolbar=0,menubar=0,scrollbars=0')
  if (w) { w.document.write(html); w.document.close() }
  else   { alert('Please allow pop-ups to print tokens') }
}

// ── Issue Token Modal ─────────────────────────────────────────────────────────
function TokenFormModal({ companyId, onClose, onSaved }) {
  const qc = useQueryClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const timeNow = now.toTimeString().substring(0, 5)

  const [form, setForm] = useState({
    token_date:     today,
    token_time:     timeNow,
    client_id:      '',
    customer_name:  '',
    vehicle_manual: false,
    vehicle_id:     '',
    vehicle_number: '',
    stock_yard:     '',
    grade_id:       '',
    material_name:  '',
    quantity:       '',
    unit:           'tonnes',
    notes:          '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('clients')
        .select('id, display_name, business_name')
        .eq('company_id', companyId).order('display_name')
      return data || []
    },
  })

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles-inv', companyId, form.client_id],
    queryFn: async () => {
      let q = supabase.from('crusher_client_vehicles')
        .select('id, vehicle_number, vehicle_type')
        .eq('company_id', companyId).eq('is_active', true)
      if (form.client_id) q = q.eq('client_id', form.client_id)
      const { data } = await q.order('vehicle_number')
      return data || []
    },
  })

  const { data: loadingPoints = [] } = useQuery({
    queryKey: ['loading-pts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_loading_points')
        .select('id, point_name, point_type')
        .eq('company_id', companyId).eq('is_active', true).order('sort_order')
      return data || []
    },
  })

  const { data: grades = [] } = useQuery({
    queryKey: ['crusher-grades', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_grades')
        .select('id, grade_name, default_rate')
        .eq('company_id', companyId).eq('is_active', true).order('grade_name')
      return data || []
    },
  })

  const handleGradeChange = (gradeId) => {
    const g = grades.find(x => x.id === gradeId)
    setForm(p => ({ ...p, grade_id: gradeId, material_name: g?.grade_name || '' }))
  }

  const genTokenNumber = async () => {
    const dateStr = today.replace(/-/g, '')
    const { count } = await supabase.from('crusher_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).gte('token_date', today)
    const seq = String((count || 0) + 1).padStart(4, '0')
    return `TKN-${dateStr}-${seq}`
  }

  const handleSave = async () => {
    if (!form.quantity)     { toast.error('Quantity is required'); return }
    if (!form.material_name && !form.grade_id) { toast.error('Select or enter a material'); return }
    const vNum = form.vehicle_manual ? form.vehicle_number.trim() : (vehicles.find(v => v.id === form.vehicle_id)?.vehicle_number || '')
    const clientSnap = clients.find(c => c.id === form.client_id)
    const custName = clientSnap
      ? (clientSnap.display_name || clientSnap.business_name)
      : form.customer_name.trim() || null

    setSaving(true)
    try {
      const tokenNumber = await genTokenNumber()
      const { data: token, error } = await supabase.from('crusher_tokens').insert({
        company_id:     companyId,
        token_number:   tokenNumber,
        token_date:     form.token_date,
        token_time:     form.token_time + ':00',
        client_id:      form.client_id || null,
        customer_name:  custName,
        vehicle_id:     form.vehicle_manual ? null : (form.vehicle_id || null),
        vehicle_number: vNum || null,
        stock_yard:     form.stock_yard || null,
        grade_id:       form.grade_id   || null,
        material_name:  form.material_name || null,
        quantity:       Number(form.quantity),
        unit:           form.unit,
        notes:          form.notes || null,
        status:         'pending',
      }).select().single()
      if (error) throw error
      toast.success(`Token ${tokenNumber} issued`)
      qc.invalidateQueries({ queryKey: ['crusher-tokens', companyId] })
      onSaved(token)
    } catch (e) {
      toast.error(e.message)
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Issue Loading Token" onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-dark-700 text-slate-300 hover:bg-dark-600">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Issue & Print
          </button>
        </>
      }>

      {/* Date & Time */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Token Date" required>
          <input type="date" className={inp()} value={form.token_date} onChange={e => set('token_date', e.target.value)} />
        </Field>
        <Field label="Time">
          <input type="time" className={inp()} value={form.token_time} onChange={e => set('token_time', e.target.value)} />
        </Field>
      </div>

      {/* Customer */}
      <Field label="Customer">
        <select className={inp()} value={form.client_id}
          onChange={e => { set('client_id', e.target.value); set('vehicle_id', ''); set('customer_name', '') }}>
          <option value="">— Walk-in / One-time —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
        </select>
      </Field>
      {!form.client_id && (
        <Field label="Customer Name (walk-in)">
          <input className={inp()} value={form.customer_name}
            onChange={e => set('customer_name', e.target.value)}
            placeholder="e.g. Murugan, Rajan Traders…" />
        </Field>
      )}

      {/* Vehicle */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-400">Vehicle</label>
          <button type="button" onClick={() => { set('vehicle_manual', !form.vehicle_manual); set('vehicle_id', ''); set('vehicle_number', '') }}
            className="text-[11px] text-primary-400 hover:text-primary-300 underline underline-offset-2">
            {form.vehicle_manual ? 'Pick from registry' : 'Type vehicle number'}
          </button>
        </div>
        {form.vehicle_manual
          ? <input className={inp()} value={form.vehicle_number}
              onChange={e => set('vehicle_number', e.target.value.toUpperCase())}
              placeholder="e.g. TN38AB1234" />
          : <select className={inp()} value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
              <option value="">— Select vehicle —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number} ({v.vehicle_type})</option>)}
            </select>
        }
      </div>

      {/* Stock Yard */}
      <Field label="Stock Yard / Loading Point">
        <select className={inp()} value={form.stock_yard} onChange={e => set('stock_yard', e.target.value)}>
          <option value="">— Select yard —</option>
          {loadingPoints.filter(p => p.point_type !== 'unloading').map(p => (
            <option key={p.id} value={p.point_name}>{p.point_name}</option>
          ))}
        </select>
      </Field>

      {/* Material & Quantity */}
      <Field label="Material">
        <select className={inp()} value={form.grade_id} onChange={e => handleGradeChange(e.target.value)}>
          <option value="">— Select grade —</option>
          {grades.map(g => <option key={g.id} value={g.id}>{g.grade_name}</option>)}
        </select>
      </Field>
      {!form.grade_id && (
        <Field label="Material Name (manual)">
          <input className={inp()} value={form.material_name}
            onChange={e => set('material_name', e.target.value)}
            placeholder="e.g. M-Sand, 20mm Jelly…" />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" required>
          <input type="number" className={inp()} value={form.quantity}
            onChange={e => set('quantity', e.target.value)}
            placeholder="e.g. 5.8" step="0.001" min="0" />
        </Field>
        <Field label="Unit">
          <select className={inp()} value={form.unit} onChange={e => set('unit', e.target.value)}>
            <option value="tonnes">Tonnes</option>
            <option value="cum">CUM</option>
            <option value="units">Units (Vol)</option>
            <option value="bags">Bags</option>
            <option value="trips">Trips</option>
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <input className={inp()} value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Optional remarks…" />
      </Field>
    </Modal>
  )
}

// ── Token View Modal ──────────────────────────────────────────────────────────
function TokenViewModal({ token, companyName, onClose, onEdit }) {
  const sc = {
    pending:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    loaded:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
    invoiced:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    cancelled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  }
  const row = (label, val) => val
    ? <div className="flex justify-between items-start py-2 border-b border-dark-600 last:border-0 gap-4">
        <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
        <span className="text-xs text-slate-200 font-medium text-right">{val}</span>
      </div>
    : null

  return (
    <Modal title="Token Details" onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-dark-700 text-slate-300 hover:bg-dark-600">Close</button>
          {(token.status === 'pending' || token.status === 'loaded') && onEdit && (
            <button onClick={onEdit} className="px-4 py-2 text-sm rounded-lg bg-dark-600 text-slate-200 hover:bg-dark-500 flex items-center gap-2">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          <button onClick={() => printToken(token, companyName)}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-2">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </>
      }>
      {/* Token number + status badge */}
      <div className="text-center py-5 bg-dark-800 rounded-xl border border-dark-600 mb-4">
        <p className="text-2xl font-black font-mono text-primary-400 tracking-widest mb-2">{token.token_number}</p>
        <span className={`inline-block text-xs px-3 py-1 rounded-full border font-semibold ${sc[token.status] || ''}`}>
          {token.status.toUpperCase()}
        </span>
      </div>
      <div className="space-y-0 bg-dark-700 rounded-xl px-4 py-1 border border-dark-600">
        {row('Date', token.token_date)}
        {row('Time', token.token_time?.substring(0, 5))}
        {row('Customer', token.customer_name || 'Walk-in')}
        {row('Vehicle', token.vehicle_number)}
        {row('Stock Yard', token.stock_yard)}
        {row('Material', token.material_name)}
        {row('Quantity', token.quantity ? `${Number(token.quantity).toFixed(3)} ${(token.unit || '').toUpperCase()}` : null)}
        {row('Notes', token.notes)}
        {token.invoice_id && row('Invoice', 'Linked ✓')}
      </div>
    </Modal>
  )
}

// ── Token Edit Modal ──────────────────────────────────────────────────────────
function TokenEditModal({ companyId, token, onClose, onSaved }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    token_date:     token.token_date,
    token_time:     token.token_time?.substring(0, 5) || '',
    client_id:      token.client_id      || '',
    customer_name:  token.customer_name  || '',
    vehicle_manual: !token.vehicle_id,
    vehicle_id:     token.vehicle_id     || '',
    vehicle_number: token.vehicle_number || '',
    stock_yard:     token.stock_yard     || '',
    grade_id:       token.grade_id       || '',
    material_name:  token.material_name  || '',
    quantity:       token.quantity ? String(token.quantity) : '',
    unit:           token.unit           || 'tonnes',
    notes:          token.notes          || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('clients')
        .select('id, display_name, business_name')
        .eq('company_id', companyId).order('display_name')
      return data || []
    },
  })
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles-inv', companyId, form.client_id],
    queryFn: async () => {
      let q = supabase.from('crusher_client_vehicles')
        .select('id, vehicle_number, vehicle_type')
        .eq('company_id', companyId).eq('is_active', true)
      if (form.client_id) q = q.eq('client_id', form.client_id)
      const { data } = await q.order('vehicle_number')
      return data || []
    },
  })
  const { data: loadingPoints = [] } = useQuery({
    queryKey: ['loading-pts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_loading_points')
        .select('id, point_name, point_type')
        .eq('company_id', companyId).eq('is_active', true).order('sort_order')
      return data || []
    },
  })
  const { data: grades = [] } = useQuery({
    queryKey: ['crusher-grades', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_grades')
        .select('id, grade_name, default_rate')
        .eq('company_id', companyId).eq('is_active', true).order('grade_name')
      return data || []
    },
  })

  const handleGradeChange = (gradeId) => {
    const g = grades.find(x => x.id === gradeId)
    setForm(p => ({ ...p, grade_id: gradeId, material_name: g?.grade_name || '' }))
  }

  const handleSave = async () => {
    if (!form.quantity) { toast.error('Quantity is required'); return }
    const vNum = form.vehicle_manual
      ? form.vehicle_number.trim()
      : (vehicles.find(v => v.id === form.vehicle_id)?.vehicle_number || '')
    const clientSnap = clients.find(c => c.id === form.client_id)
    const custName = clientSnap
      ? (clientSnap.display_name || clientSnap.business_name)
      : form.customer_name.trim() || null

    setSaving(true)
    try {
      const { error } = await supabase.from('crusher_tokens').update({
        token_date:     form.token_date,
        token_time:     form.token_time + ':00',
        client_id:      form.client_id      || null,
        customer_name:  custName,
        vehicle_id:     form.vehicle_manual ? null : (form.vehicle_id || null),
        vehicle_number: vNum || null,
        stock_yard:     form.stock_yard     || null,
        grade_id:       form.grade_id       || null,
        material_name:  form.material_name  || null,
        quantity:       Number(form.quantity),
        unit:           form.unit,
        notes:          form.notes          || null,
      }).eq('id', token.id)
      if (error) throw error
      toast.success('Token updated')
      qc.invalidateQueries({ queryKey: ['crusher-tokens', companyId] })
      onSaved()
    } catch (e) {
      toast.error(e.message)
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Edit Token · ${token.token_number}`} onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-dark-700 text-slate-300 hover:bg-dark-600">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </>
      }>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Token Date" required>
          <input type="date" className={inp()} value={form.token_date} onChange={e => set('token_date', e.target.value)} />
        </Field>
        <Field label="Time">
          <input type="time" className={inp()} value={form.token_time} onChange={e => set('token_time', e.target.value)} />
        </Field>
      </div>

      <Field label="Customer">
        <select className={inp()} value={form.client_id}
          onChange={e => { set('client_id', e.target.value); set('customer_name', '') }}>
          <option value="">— Walk-in —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
        </select>
      </Field>
      {!form.client_id && (
        <Field label="Customer Name (walk-in)">
          <input className={inp()} value={form.customer_name}
            onChange={e => set('customer_name', e.target.value)} placeholder="e.g. Murugan…" />
        </Field>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-400">Vehicle</label>
          <button type="button" onClick={() => { set('vehicle_manual', !form.vehicle_manual); set('vehicle_id', ''); set('vehicle_number', '') }}
            className="text-[11px] text-primary-400 hover:text-primary-300 underline underline-offset-2">
            {form.vehicle_manual ? 'Pick from registry' : 'Type vehicle number'}
          </button>
        </div>
        {form.vehicle_manual
          ? <input className={inp()} value={form.vehicle_number}
              onChange={e => set('vehicle_number', e.target.value.toUpperCase())} placeholder="e.g. TN38AB1234" />
          : <select className={inp()} value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
              <option value="">— Select vehicle —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number} ({v.vehicle_type})</option>)}
            </select>
        }
      </div>

      <Field label="Stock Yard / Loading Point">
        <select className={inp()} value={form.stock_yard} onChange={e => set('stock_yard', e.target.value)}>
          <option value="">— Select yard —</option>
          {loadingPoints.filter(p => p.point_type !== 'unloading').map(p => (
            <option key={p.id} value={p.point_name}>{p.point_name}</option>
          ))}
        </select>
      </Field>

      <Field label="Material">
        <select className={inp()} value={form.grade_id} onChange={e => handleGradeChange(e.target.value)}>
          <option value="">— Select grade —</option>
          {grades.map(g => <option key={g.id} value={g.id}>{g.grade_name}</option>)}
        </select>
      </Field>
      {!form.grade_id && (
        <Field label="Material Name (manual)">
          <input className={inp()} value={form.material_name}
            onChange={e => set('material_name', e.target.value)} placeholder="e.g. M-Sand…" />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" required>
          <input type="number" className={inp()} value={form.quantity}
            onChange={e => set('quantity', e.target.value)} step="0.001" min="0" />
        </Field>
        <Field label="Unit">
          <select className={inp()} value={form.unit} onChange={e => set('unit', e.target.value)}>
            <option value="tonnes">Tonnes</option>
            <option value="cum">CUM</option>
            <option value="units">Units (Vol)</option>
            <option value="bags">Bags</option>
            <option value="trips">Trips</option>
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <input className={inp()} value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Optional remarks…" />
      </Field>
    </Modal>
  )
}

// ── Tokens Tab ────────────────────────────────────────────────────────────────
function TokensTab({ companyId }) {
  const qc = useQueryClient()
  const [issueOpen,  setIssueOpen]  = useState(false)
  const [viewToken,  setViewToken]  = useState(null)
  const [editToken,  setEditToken]  = useState(null)
  const [fromToken,  setFromToken]  = useState(null)

  const { data: company } = useQuery({
    queryKey: ['company-name', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('name').eq('id', companyId).single()
      return data
    },
  })
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['crusher-tokens', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('crusher_tokens')
        .select('*')
        .eq('company_id', companyId)
        .order('token_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) { console.error(error); return [] }
      return data || []
    },
  })

  const statusColor = { pending: 'yellow', loaded: 'blue', invoiced: 'green', cancelled: 'slate' }

  const handleStatusChange = async (tok, newStatus) => {
    const { error } = await supabase.from('crusher_tokens').update({ status: newStatus }).eq('id', tok.id)
    if (error) { toast.error(error.message); return }
    toast.success(`Marked as ${newStatus}`)
    qc.invalidateQueries({ queryKey: ['crusher-tokens', companyId] })
  }

  const handleVoid = async (tok) => {
    if (!window.confirm(`Void token ${tok.token_number}? This cannot be undone.`)) return
    await handleStatusChange(tok, 'cancelled')
  }

  const handleDelete = async (tok) => {
    if (!window.confirm(`Permanently delete token ${tok.token_number}?`)) return
    const { error } = await supabase.from('crusher_tokens').delete().eq('id', tok.id)
    if (error) { toast.error(error.message); return }
    toast.success('Token deleted')
    qc.invalidateQueries({ queryKey: ['crusher-tokens', companyId] })
  }

  const handleSaved = (tok) => { setIssueOpen(false); printToken(tok, company?.name) }
  const handleEdited = () => setEditToken(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Loading Tokens</h3>
          <p className="text-xs text-slate-500">Issue before loading · Convert to invoice after delivery</p>
        </div>
        <button onClick={() => setIssueOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-all">
          <Printer className="w-4 h-4" /> Issue Token
        </button>
      </div>

      <div className="bg-dark-700 rounded-xl p-3 border border-dark-600 flex items-center gap-3 text-xs text-slate-400">
        <Printer className="w-4 h-4 text-primary-400 flex-shrink-0" />
        <span>Issue Token → <strong className="text-slate-300">Load Material</strong> → Mark Loaded → <strong className="text-slate-300">Create Invoice</strong></span>
      </div>

      {isLoading && <div className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary-400" /></div>}

      {!isLoading && tokens.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Printer className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-500">No tokens issued yet.</p>
          <button onClick={() => setIssueOpen(true)}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">
            Issue First Token
          </button>
        </div>
      )}

      {!isLoading && tokens.length > 0 && (
        <div className="space-y-2">
          {tokens.map(tok => (
            <div key={tok.id}
              className={`bg-dark-700 rounded-xl border border-dark-600 overflow-hidden ${tok.status === 'cancelled' ? 'opacity-50' : ''}`}>

              {/* Main info row */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold font-mono text-primary-400">{tok.token_number}</span>
                      <Badge label={tok.status.toUpperCase()} color={statusColor[tok.status] || 'slate'} />
                    </div>
                    <p className="text-xs text-slate-400">
                      {tok.token_date} {tok.token_time?.substring(0, 5)}
                      {tok.customer_name ? ` · ${tok.customer_name}` : ''}
                      {tok.vehicle_number ? ` · ${tok.vehicle_number}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {tok.stock_yard ? `${tok.stock_yard} → ` : ''}
                      <strong className="text-slate-300">{tok.material_name || '—'}</strong>
                      {tok.quantity ? ` · ${Number(tok.quantity).toFixed(3)} ${(tok.unit || '').toUpperCase()}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-black text-slate-200">{tok.quantity ? Number(tok.quantity).toFixed(2) : '—'}</p>
                    <p className="text-[10px] text-slate-500">{(tok.unit || '').toUpperCase()}</p>
                  </div>
                </div>
              </div>

              {/* Action bar */}
              <div className="px-3 py-2 bg-dark-800 border-t border-dark-600 flex items-center gap-0.5 flex-wrap">

                {/* LEFT: View + Print + status toggles */}
                <button onClick={() => setViewToken(tok)}
                  className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-dark-600 transition-all">
                  <Eye className="w-3.5 h-3.5" /> View
                </button>

                <button onClick={() => printToken(tok, company?.name)}
                  className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-dark-600 transition-all">
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>

                {tok.status === 'pending' && (
                  <button onClick={() => handleStatusChange(tok, 'loaded')}
                    className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md text-blue-400 hover:bg-blue-500/10 transition-all">
                    <ClipboardCheck className="w-3.5 h-3.5" /> Mark Loaded
                  </button>
                )}
                {tok.status === 'loaded' && (
                  <button onClick={() => handleStatusChange(tok, 'pending')}
                    className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md text-slate-400 hover:bg-dark-600 transition-all">
                    <RefreshCw className="w-3.5 h-3.5" /> Undo
                  </button>
                )}

                <div className="flex-1" />

                {/* RIGHT: Edit + Create Invoice + Void + Delete */}
                {(tok.status === 'pending' || tok.status === 'loaded') && (
                  <button onClick={() => setEditToken(tok)}
                    className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-dark-600 transition-all">
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                )}

                {(tok.status === 'pending' || tok.status === 'loaded') && (
                  <button onClick={() => setFromToken(tok)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-all">
                    <FileText className="w-3.5 h-3.5" /> Invoice
                  </button>
                )}

                {(tok.status === 'pending' || tok.status === 'loaded') && (
                  <button onClick={() => handleVoid(tok)}
                    className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md text-amber-400 hover:bg-amber-500/10 transition-all">
                    <Ban className="w-3.5 h-3.5" /> Void
                  </button>
                )}

                <button onClick={() => handleDelete(tok)}
                  className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-all">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {issueOpen && <TokenFormModal companyId={companyId} onClose={() => setIssueOpen(false)} onSaved={handleSaved} />}
      {viewToken && (
        <TokenViewModal
          token={viewToken} companyName={company?.name}
          onClose={() => setViewToken(null)}
          onEdit={() => { setEditToken(viewToken); setViewToken(null) }}
        />
      )}
      {editToken && <TokenEditModal companyId={companyId} token={editToken} onClose={() => setEditToken(null)} onSaved={handleEdited} />}
      {fromToken && <InvoiceFromTokenModal companyId={companyId} token={fromToken} onClose={() => setFromToken(null)} />}
    </div>
  )
}

// ── Invoice from Token (pre-filled) ──────────────────────────────────────────
function InvoiceFromTokenModal({ companyId, token, onClose }) {
  const qc = useQueryClient()
  // Reuse InvoiceFormModal but after save, mark token as invoiced
  const handleSaved = async (invoiceId) => {
    await supabase.from('crusher_tokens')
      .update({ status: 'invoiced', invoice_id: invoiceId }).eq('id', token.id)
    qc.invalidateQueries({ queryKey: ['crusher-tokens', companyId] })
    onClose()
  }
  return (
    <InvoiceFormModal
      companyId={companyId}
      prefill={{
        walkin_name:        token.customer_name || '',
        client_id:          token.client_id     || '',
        vehicle_manual:     !token.vehicle_id,
        vehicle_id:         token.vehicle_id    || '',
        walkin_vehicle_num: !token.vehicle_id ? (token.vehicle_number || '') : '',
        loading_point:      token.stock_yard    || '',
        tokenGradeId:       token.grade_id      || '',
        tokenMaterial:      token.material_name || '',
        tokenQty:           token.quantity      ? String(token.quantity) : '',
        tokenUnit:          token.unit          || 'tonnes',
      }}
      onClose={onClose}
      onAfterSave={handleSaved}
    />
  )
}

// ── Crusher Invoice PDF ───────────────────────────────────────────────────────
async function downloadCrusherPDF(inv, items, companyName) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, M = 14
  const isTax = inv.invoice_type === 'tax'
  let y = M

  // Header band
  doc.setFillColor(20, 80, 160)
  doc.rect(0, 0, W, 26, 'F')
  doc.setFontSize(14).setFont('helvetica', 'bold').setTextColor(255)
  doc.text(companyName || 'Company', M, 10)
  doc.setFontSize(8).setFont('helvetica', 'normal')
  doc.text(isTax ? 'TAX INVOICE' : 'NON-TAX INVOICE', M, 17)
  doc.setFontSize(13).setFont('helvetica', 'bold')
  doc.text(inv.invoice_number, W - M, 10, { align: 'right' })
  doc.setFontSize(8).setFont('helvetica', 'normal')
  doc.text(`Date: ${inv.invoice_date}`, W - M, 17, { align: 'right' })
  y = 34

  // Client + vehicle row
  doc.setTextColor(0).setFontSize(8).setFont('helvetica', 'bold')
  doc.text('BILL TO', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(20)
  doc.text(inv.client_name || 'Walk-in Customer', M, y + 5)
  if (inv.vehicle_number) {
    doc.setFontSize(8).setTextColor(80)
    doc.text(`Vehicle: ${inv.vehicle_number}`, M, y + 11)
  }
  if (inv.loading_point)   { doc.text(`From: ${inv.loading_point}`,   M, y + (inv.vehicle_number ? 16 : 11)); }
  if (inv.unloading_point) { doc.text(`To:   ${inv.unloading_point}`, M, y + (inv.vehicle_number ? 21 : 16)); }

  // Payment info top-right
  doc.setFontSize(8).setFont('helvetica', 'bold').setTextColor(0)
  doc.text('PAYMENT', W - M - 50, y, { align: 'left' })
  doc.setFont('helvetica', 'normal').setTextColor(60)
  const pmLabel = inv.payment_type === 'cash'
    ? (inv.payment_mode || 'cash').toUpperCase()
    : `CREDIT — Due ${inv.credit_due_date || '—'}`
  doc.text(pmLabel, W - M - 50, y + 5)
  doc.setFont('helvetica', 'bold').setTextColor(inv.status === 'paid' ? [0, 140, 80] : [200, 50, 50])
  doc.text(inv.status.toUpperCase(), W - M - 50, y + 11)

  y += 32

  // Items table
  const cols = isTax
    ? [{ header: '#', dataKey: 'n' }, { header: 'Material', dataKey: 'm' }, { header: 'HSN', dataKey: 'h' },
       { header: 'Qty', dataKey: 'q' }, { header: 'Unit', dataKey: 'u' }, { header: 'Rate ₹', dataKey: 'r' },
       { header: 'Amount ₹', dataKey: 'a' }, { header: 'GST%', dataKey: 'g' }, { header: 'GST ₹', dataKey: 'ga' }, { header: 'Total ₹', dataKey: 't' }]
    : [{ header: '#', dataKey: 'n' }, { header: 'Material', dataKey: 'm' },
       { header: 'Qty', dataKey: 'q' }, { header: 'Unit', dataKey: 'u' }, { header: 'Rate ₹', dataKey: 'r' }, { header: 'Amount ₹', dataKey: 'a' }]

  const rows = items.map((item, i) => {
    const base = {
      n: i + 1, m: item.material_name,
      q: Number(item.quantity), u: item.unit,
      r: Number(item.rate).toFixed(2), a: Number(item.amount).toFixed(2),
    }
    return isTax
      ? { ...base, h: item.hsn_code || '—', g: `${item.gst_rate}%`, ga: Number(item.gst_amount).toFixed(2), t: Number(item.total_amount).toFixed(2) }
      : base
  })

  autoTable(doc, {
    startY: y, columns: cols, body: rows,
    margin: { left: M, right: M },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [20, 80, 160], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 252] },
    columnStyles: isTax
      ? { n: { cellWidth: 6 }, m: { cellWidth: 38 }, h: { cellWidth: 14 } }
      : { n: { cellWidth: 8 }, m: { cellWidth: 70 } },
  })

  y = doc.lastAutoTable.finalY + 6

  // Totals block
  const fmtN = n => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  const tX = W - M - 70
  const addRow = (lbl, val, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 9 : 8)
    doc.setTextColor(bold ? 0 : 80)
    doc.text(lbl, tX, y)
    doc.text(fmtN(val), W - M, y, { align: 'right' })
    y += 5
  }
  addRow('Subtotal', inv.subtotal)
  if (isTax && Number(inv.total_tax) > 0) addRow('GST', inv.total_tax)
  doc.setDrawColor(180).line(tX, y - 1, W - M, y - 1)
  addRow('TOTAL', inv.total_amount, true)
  if (Number(inv.balance) > 0) {
    doc.setTextColor(200, 50, 50).setFont('helvetica', 'normal').setFontSize(8)
    doc.text('Balance Due', tX, y)
    doc.text(fmtN(inv.balance), W - M, y, { align: 'right' })
    y += 5
  }

  if (inv.notes) {
    y += 4
    doc.setFontSize(8).setFont('helvetica', 'italic').setTextColor(120)
    doc.text(`Notes: ${inv.notes}`, M, y)
  }

  doc.save(`${inv.invoice_number}.pdf`)
}

// ── Invoice View Modal ────────────────────────────────────────────────────────
function InvoiceViewModal({ invoiceId, onClose, onDownload }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['crusher-invoice-detail', invoiceId],
    queryFn: async () => {
      const [invRes, itemsRes] = await Promise.all([
        supabase.from('crusher_invoices').select('*').eq('id', invoiceId).single(),
        supabase.from('crusher_invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
      ])
      if (invRes.error) throw invRes.error
      return { inv: invRes.data, items: itemsRes.data || [] }
    },
  })

  const inv = detail?.inv
  const items = detail?.items || []
  const isTax = inv?.invoice_type === 'tax'
  const fmtM = n => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  const statusColor = { issued: 'blue', paid: 'green', partial: 'yellow', overdue: 'red', draft: 'slate', void: 'slate' }

  return (
    <Modal title={inv ? `Invoice — ${inv.invoice_number}` : 'Invoice Details'} onClose={onClose} wide
      footer={
        inv && (
          <button onClick={() => onDownload(inv, items)}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2">
            <Download className="w-4 h-4" /> Download PDF
          </button>
        )
      }>

      {isLoading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>}

      {inv && (
        <div className="space-y-4">
          {/* Top row */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Invoice Number</p>
              <p className="text-xl font-bold font-mono text-primary-400">{inv.invoice_number}</p>
              <p className="text-xs text-slate-500 mt-1">{inv.invoice_date}</p>
            </div>
            <div className="text-right space-y-1.5">
              <div><Badge label={isTax ? 'GST Invoice' : 'Non-Tax Invoice'} color={isTax ? 'blue' : 'slate'} /></div>
              <div><Badge label={inv.status.toUpperCase()} color={statusColor[inv.status] || 'slate'} /></div>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'Customer',        value: inv.client_name || 'Walk-in' },
              { label: 'Vehicle',         value: inv.vehicle_number || '—' },
              { label: 'Loading Point',   value: inv.loading_point  || '—' },
              { label: 'Unloading Point', value: inv.unloading_point || '—' },
              { label: 'Payment',         value: inv.payment_type === 'cash' ? (inv.payment_mode || 'Cash').toUpperCase() : 'Credit' },
              { label: 'Due Date',        value: inv.credit_due_date || (inv.payment_type === 'cash' ? 'N/A — Cash' : '—') },
            ].map(({ label, value }) => (
              <div key={label} className="bg-dark-700 rounded-lg p-3 border border-dark-600">
                <p className="text-slate-500 mb-0.5">{label}</p>
                <p className="text-slate-200 font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Materials</p>
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <div key={i} className="bg-dark-700 rounded-lg p-3 border border-dark-600 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{item.material_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.quantity} {item.unit} × {fmtM(item.rate)}
                      {isTax && item.hsn_code && ` · HSN ${item.hsn_code}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-200">{fmtM(item.amount)}</p>
                    {isTax && Number(item.gst_amount) > 0 && (
                      <p className="text-[11px] text-slate-500">+GST {item.gst_rate}% = {fmtM(item.total_amount)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-dark-700 rounded-xl p-4 border border-dark-600 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span>{fmtM(inv.subtotal)}</span></div>
            {isTax && Number(inv.total_tax) > 0 && (
              <div className="flex justify-between text-sm text-slate-400"><span>GST</span><span>{fmtM(inv.total_tax)}</span></div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-dark-600 pt-2 mt-1">
              <span className="text-slate-100">Total</span>
              <span className="text-emerald-400">{fmtM(inv.total_amount)}</span>
            </div>
            {Number(inv.balance) > 0 && (
              <div className="flex justify-between text-sm text-red-400"><span>Balance Due</span><span>{fmtM(inv.balance)}</span></div>
            )}
          </div>

          {inv.notes && <p className="text-xs text-slate-500 italic">Notes: {inv.notes}</p>}
        </div>
      )}
    </Modal>
  )
}

// ── Invoices Tab ──────────────────────────────────────────────────────────────
// ── Invoice Edit Modal ────────────────────────────────────────────────────────
function InvoiceEditModal({ companyId, invoice, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    invoice_type:    invoice.invoice_type,
    invoice_date:    invoice.invoice_date,
    payment_type:    invoice.payment_type,
    payment_mode:    invoice.payment_mode || 'cash',
    credit_due_date: invoice.credit_due_date || '',
    loading_point:   invoice.loading_point  || '',
    unloading_point: invoice.unloading_point || '',
    notes:           invoice.notes          || '',
  })
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: grades = [] } = useQuery({
    queryKey: ['crusher-grades', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_grades')
        .select('id, grade_name, hsn_code, default_gst_rate, default_rate')
        .eq('company_id', companyId).eq('is_active', true).order('grade_name')
      return data || []
    },
  })
  const { data: loadingPoints = [] } = useQuery({
    queryKey: ['loading-pts', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_loading_points')
        .select('id, point_name, point_type')
        .eq('company_id', companyId).eq('is_active', true).order('sort_order')
      return data || []
    },
  })

  // Load existing line items
  useEffect(() => {
    supabase.from('crusher_invoice_items').select('*')
      .eq('invoice_id', invoice.id).order('sort_order')
      .then(({ data }) => {
        setItems((data || []).map(it => ({
          id:            it.id,
          grade_id:      it.grade_id      || '',
          material_name: it.material_name || '',
          hsn_code:      it.hsn_code      || '',
          unit:          it.unit          || 'tonnes',
          quantity:      String(it.quantity || ''),
          rate:          String(it.rate     || ''),
        })))
        setLoading(false)
      })
  }, [invoice.id])

  const addItem    = () => setItems(p => [...p, { grade_id: '', material_name: '', hsn_code: '', unit: 'tonnes', quantity: '', rate: '' }])
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i))
  const setItem    = (i, k, v) => setItems(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it))

  const handleGradeChange = (i, gradeId) => {
    const g = grades.find(x => x.id === gradeId)
    setItems(p => p.map((it, idx) => idx === i ? {
      ...it,
      grade_id:      gradeId,
      material_name: g?.grade_name  || '',
      hsn_code:      g?.hsn_code    || '',
      rate: g?.default_rate ? String(g.default_rate) : it.rate,
    } : it))
  }

  const isTax = form.invoice_type === 'tax'
  const computedItems = items.map(item => {
    const qty        = parseFloat(item.quantity) || 0
    const rate       = parseFloat(item.rate)     || 0
    const amount     = qty * rate
    const gstRate    = isTax ? (parseFloat(grades.find(g => g.id === item.grade_id)?.default_gst_rate) || 0) : 0
    const gstAmount  = amount * gstRate / 100
    return { ...item, amount, gstRate, gstAmount, totalAmount: amount + gstAmount }
  })
  const subtotal    = computedItems.reduce((s, i) => s + i.amount,      0)
  const totalTax    = computedItems.reduce((s, i) => s + i.gstAmount,   0)
  const totalAmount = subtotal + totalTax
  const fmt = n => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

  const handleSave = async () => {
    const validItems = computedItems.filter(i => i.material_name && i.quantity && i.rate)
    if (!validItems.length) { toast.error('At least one material line with qty & rate required'); return }
    setSaving(true)
    try {
      // Update invoice header
      const { error: invErr } = await supabase.from('crusher_invoices').update({
        invoice_type:    form.invoice_type,
        invoice_date:    form.invoice_date,
        payment_type:    form.payment_type,
        payment_mode:    form.payment_type === 'cash'   ? form.payment_mode    : null,
        credit_due_date: form.payment_type === 'credit' ? form.credit_due_date : null,
        loading_point:   form.loading_point   || null,
        unloading_point: form.unloading_point || null,
        notes:           form.notes           || null,
        subtotal,
        total_tax:    totalTax,
        total_amount: totalAmount,
        // Recalculate balance if cash — fully paid; credit — keep existing balance logic
        paid_amount: form.payment_type === 'cash' ? totalAmount : (invoice.paid_amount || 0),
        balance:     form.payment_type === 'cash' ? 0 : Math.max(0, totalAmount - (invoice.paid_amount || 0)),
        status:      form.payment_type === 'cash' ? 'paid' : (invoice.status === 'paid' ? 'issued' : invoice.status),
      }).eq('id', invoice.id)
      if (invErr) throw invErr

      // Replace line items: delete old → insert new
      const { error: delErr } = await supabase.from('crusher_invoice_items').delete().eq('invoice_id', invoice.id)
      if (delErr) throw delErr

      const itemRows = validItems.map((item, idx) => ({
        invoice_id:    invoice.id,
        grade_id:      item.grade_id    || null,
        material_name: item.material_name,
        hsn_code:      item.hsn_code    || null,
        unit:          item.unit,
        quantity:      parseFloat(item.quantity),
        rate:          parseFloat(item.rate),
        amount:        item.amount,
        gst_rate:      item.gstRate,
        gst_amount:    item.gstAmount,
        total_amount:  item.totalAmount,
        sort_order:    idx,
      }))
      const { error: itemErr } = await supabase.from('crusher_invoice_items').insert(itemRows)
      if (itemErr) throw itemErr

      toast.success('Invoice updated')
      qc.invalidateQueries({ queryKey: ['crusher-invoices', companyId] })
      onClose()
    } catch (e) {
      toast.error(e.message || 'Failed to update invoice')
    } finally { setSaving(false) }
  }

  if (loading) return (
    <Modal title={`Edit · ${invoice.invoice_number}`} onClose={onClose} wide footer={null}>
      <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-400" /></div>
    </Modal>
  )

  return (
    <Modal title={`Edit · ${invoice.invoice_number}`} onClose={onClose} wide
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-dark-700 text-slate-300 hover:bg-dark-600">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </>
      }>

      {/* Invoice Type Toggle — the main conversion control */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1.5 block">Invoice Type</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: 'non_tax', label: '📄 Non-Tax Invoice', sub: 'No GST applied' },
            { val: 'tax',     label: '🧾 Tax Invoice (GST)', sub: 'GST added per grade rate' },
          ].map(opt => (
            <button key={opt.val} type="button" onClick={() => set('invoice_type', opt.val)}
              className={`p-3 rounded-xl border text-left transition-all ${
                form.invoice_type === opt.val
                  ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                  : 'border-dark-600 bg-dark-700 text-slate-400 hover:border-dark-500'
              }`}>
              <p className="text-xs font-semibold">{opt.label}</p>
              <p className="text-[10px] mt-0.5 opacity-70">{opt.sub}</p>
            </button>
          ))}
        </div>
        {form.invoice_type !== invoice.invoice_type && (
          <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Totals will be recalculated — verify amounts before saving
          </p>
        )}
      </div>

      {/* Date */}
      <Field label="Invoice Date" required>
        <input type="date" className={inp()} value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
      </Field>

      {/* Loading / Unloading */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loading Point">
          <select className={inp()} value={form.loading_point} onChange={e => set('loading_point', e.target.value)}>
            <option value="">— None —</option>
            {loadingPoints.map(p => <option key={p.id} value={p.point_name}>{p.point_name}</option>)}
          </select>
        </Field>
        <Field label="Unloading Point">
          <select className={inp()} value={form.unloading_point} onChange={e => set('unloading_point', e.target.value)}>
            <option value="">— None —</option>
            {loadingPoints.map(p => <option key={p.id} value={p.point_name}>{p.point_name}</option>)}
          </select>
        </Field>
      </div>

      {/* Payment */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1.5 block">Payment</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {['cash', 'credit'].map(pt => (
            <button key={pt} type="button" onClick={() => set('payment_type', pt)}
              className={`py-2 rounded-lg border text-xs font-semibold capitalize transition-all ${
                form.payment_type === pt
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : 'border-dark-600 bg-dark-700 text-slate-400 hover:border-dark-500'
              }`}>
              {pt === 'cash' ? '💵 Cash' : '📋 Credit'}
            </button>
          ))}
        </div>
        {form.payment_type === 'cash' && (
          <select className={inp()} value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cheque">Cheque</option>
          </select>
        )}
        {form.payment_type === 'credit' && (
          <Field label="Credit Due Date" required>
            <input type="date" className={inp()} value={form.credit_due_date} onChange={e => set('credit_due_date', e.target.value)} />
          </Field>
        )}
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-400">Materials</label>
          <button type="button" onClick={addItem}
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Line
          </button>
        </div>
        <div className="space-y-3">
          {items.map((item, i) => {
            const computed = computedItems[i]
            return (
              <div key={i} className="bg-dark-800 rounded-xl p-3 border border-dark-600 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-500">Line {i + 1}</span>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <select className={inp()} value={item.grade_id} onChange={e => handleGradeChange(i, e.target.value)}>
                  <option value="">— Select grade —</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.grade_name}</option>)}
                </select>
                {!item.grade_id && (
                  <input className={inp()} value={item.material_name}
                    onChange={e => setItem(i, 'material_name', e.target.value)}
                    placeholder="Material name" />
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Qty</label>
                    <input type="number" className={inp()} value={item.quantity}
                      onChange={e => setItem(i, 'quantity', e.target.value)} step="0.001" min="0" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Unit</label>
                    <select className={inp()} value={item.unit} onChange={e => setItem(i, 'unit', e.target.value)}>
                      <option value="tonnes">Tonnes</option>
                      <option value="cum">CUM</option>
                      <option value="units">Units</option>
                      <option value="bags">Bags</option>
                      <option value="trips">Trips</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Rate (₹)</label>
                    <input type="number" className={inp()} value={item.rate}
                      onChange={e => setItem(i, 'rate', e.target.value)} step="0.01" min="0" />
                  </div>
                </div>
                <div className="flex justify-between text-[11px] pt-1">
                  <span className="text-slate-500">Amount: {fmt(computed?.amount || 0)}</span>
                  {isTax && computed?.gstRate > 0 && (
                    <span className="text-slate-500">GST {computed.gstRate}%: {fmt(computed.gstAmount)}</span>
                  )}
                  <span className="text-slate-300 font-semibold">Total: {fmt(computed?.totalAmount || 0)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Totals summary */}
      <div className="bg-dark-800 rounded-xl p-3 border border-dark-600 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Subtotal</span>
          <span className="text-slate-200">{fmt(subtotal)}</span>
        </div>
        {isTax && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Total GST</span>
            <span className="text-slate-200">{fmt(totalTax)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold pt-1 border-t border-dark-600">
          <span className="text-slate-200">Total</span>
          <span className="text-emerald-400">{fmt(totalAmount)}</span>
        </div>
      </div>

      <Field label="Notes">
        <input className={inp()} value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Optional remarks…" />
      </Field>
    </Modal>
  )
}

function InvoicesTab({ companyId }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [viewId,     setViewId]     = useState(null)
  const [editInv,    setEditInv]    = useState(null)

  const { data: company } = useQuery({
    queryKey: ['company-name', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('name').eq('id', companyId).single()
      return data
    },
  })

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['crusher-invoices', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('crusher_invoices')
        .select('id, invoice_number, invoice_type, invoice_date, client_name, vehicle_number, payment_type, status, total_amount, subtotal, total_tax, balance, credit_due_date, payment_mode, loading_point, unloading_point, notes')
        .eq('company_id', companyId)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) { console.error(error); return [] }
      return data || []
    },
  })

  const statusColor = { issued: 'blue', paid: 'green', partial: 'yellow', overdue: 'red', draft: 'slate', void: 'slate' }

  const handleVoid = async (inv) => {
    const isVoided = inv.status === 'void'
    const msg = isVoided
      ? `Re-activate invoice ${inv.invoice_number}?`
      : `Void invoice ${inv.invoice_number}? It will be marked as cancelled.`
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('crusher_invoices')
      .update({ status: isVoided ? 'issued' : 'void' }).eq('id', inv.id)
    if (error) { toast.error(error.message); return }
    toast.success(isVoided ? 'Invoice re-activated' : 'Invoice voided')
    qc.invalidateQueries({ queryKey: ['crusher-invoices', companyId] })
  }

  const handleDelete = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) return
    const { error } = await supabase.from('crusher_invoices').delete().eq('id', inv.id)
    if (error) { toast.error(error.message); return }
    toast.success('Invoice deleted')
    qc.invalidateQueries({ queryKey: ['crusher-invoices', companyId] })
  }

  const [converting, setConverting] = useState(null) // invoice id being converted

  const handleConvertType = async (inv) => {
    const toTax  = inv.invoice_type === 'non_tax'
    const label  = toTax ? 'Tax Invoice (GST)' : 'Non-Tax Invoice'
    const detail = toTax
      ? 'GST will be added to each line based on the grade\'s configured rate.\nThe total amount will increase accordingly.'
      : 'GST will be removed from all lines.\nThe total amount will decrease accordingly.'

    const ok = window.confirm(
      `⚠️ Convert ${inv.invoice_number} to ${label}?\n\n${detail}\n\nThis recalculates and saves all amounts immediately.`
    )
    if (!ok) return

    setConverting(inv.id)
    try {
      // 1. Fetch existing line items
      const { data: items, error: ie } = await supabase
        .from('crusher_invoice_items').select('*')
        .eq('invoice_id', inv.id).order('sort_order')
      if (ie) throw ie

      // 2. If converting TO tax, fetch GST rates for the grade IDs in one query
      let gradeMap = {}
      if (toTax) {
        const gradeIds = [...new Set(items.map(i => i.grade_id).filter(Boolean))]
        if (gradeIds.length) {
          const { data: gd } = await supabase.from('crusher_grades')
            .select('id, default_gst_rate').in('id', gradeIds)
          gd?.forEach(g => { gradeMap[g.id] = parseFloat(g.default_gst_rate) || 0 })
        }
      }

      // 3. Recalculate each line
      let newSubtotal = 0, newTotalTax = 0
      const updatedLines = items.map(it => {
        const qty       = parseFloat(it.quantity) || 0
        const rate      = parseFloat(it.rate)     || 0
        const amount    = qty * rate
        const gstRate   = toTax ? (gradeMap[it.grade_id] || 0) : 0
        const gstAmount = amount * gstRate / 100
        const totalAmt  = amount + gstAmount
        newSubtotal  += amount
        newTotalTax  += gstAmount
        return { id: it.id, gst_rate: gstRate, gst_amount: gstAmount, total_amount: totalAmt }
      })
      const newTotal = newSubtotal + newTotalTax

      // 4. Update all line items (parallel)
      const lineUpdates = updatedLines.map(l =>
        supabase.from('crusher_invoice_items')
          .update({ gst_rate: l.gst_rate, gst_amount: l.gst_amount, total_amount: l.total_amount })
          .eq('id', l.id)
      )
      const results = await Promise.all(lineUpdates)
      const lineErr = results.find(r => r.error)?.error
      if (lineErr) throw lineErr

      // 5. Update invoice header
      const paidAmt = parseFloat(inv.paid_amount) || 0
      const { error: invErr } = await supabase.from('crusher_invoices').update({
        invoice_type: toTax ? 'tax' : 'non_tax',
        subtotal:     newSubtotal,
        total_tax:    newTotalTax,
        total_amount: newTotal,
        balance:      Math.max(0, newTotal - paidAmt),
      }).eq('id', inv.id)
      if (invErr) throw invErr

      toast.success(`Converted to ${label}`)
      qc.invalidateQueries({ queryKey: ['crusher-invoices', companyId] })
    } catch (e) {
      toast.error('Conversion failed: ' + e.message)
    } finally { setConverting(null) }
  }

  const handleDownload = async (inv, items) => {
    try {
      let lineItems = items
      if (!lineItems) {
        const { data } = await supabase.from('crusher_invoice_items').select('*').eq('invoice_id', inv.id).order('sort_order')
        lineItems = data || []
      }
      await downloadCrusherPDF(inv, lineItems, company?.name)
    } catch (e) {
      toast.error('PDF generation failed: ' + e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Crusher Invoices</h3>
          <p className="text-xs text-slate-500">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-all">
          <Plus className="w-4 h-4" /> Create Invoice
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading invoices…
        </div>
      )}

      {!isLoading && invoices.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-500">No invoices yet.</p>
          <button onClick={() => setCreateOpen(true)}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">
            Create First Invoice
          </button>
        </div>
      )}

      {!isLoading && invoices.length > 0 && (
        <div className="space-y-2">
          {invoices.map(inv => (
            <div key={inv.id} className={`bg-dark-700 rounded-xl border border-dark-600 overflow-hidden ${inv.status === 'void' ? 'opacity-60' : ''}`}>
              {/* Main row */}
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-primary-400 font-mono">{inv.invoice_number}</span>
                    <Badge label={inv.invoice_type === 'tax' ? 'GST' : 'Non-Tax'} color={inv.invoice_type === 'tax' ? 'blue' : 'slate'} />
                    <Badge label={inv.status} color={statusColor[inv.status] || 'slate'} />
                  </div>
                  <p className="text-xs text-slate-400">
                    {inv.invoice_date} · {inv.client_name || 'Walk-in'}{inv.vehicle_number ? ` · ${inv.vehicle_number}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-emerald-400">₹{Number(inv.total_amount).toLocaleString('en-IN')}</p>
                  {Number(inv.balance) > 0 && (
                    <p className="text-[11px] text-red-400">Due: ₹{Number(inv.balance).toLocaleString('en-IN')}</p>
                  )}
                </div>
              </div>

              {/* Action bar */}
              <div className="px-4 py-2.5 bg-dark-800 border-t border-dark-600 flex items-center gap-1 flex-wrap">
                <button onClick={() => setViewId(inv.id)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-dark-600 transition-all">
                  <Eye className="w-3.5 h-3.5" /> View
                </button>
                <button onClick={() => handleDownload(inv)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-dark-600 transition-all">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                {inv.status !== 'void' && (
                  <button onClick={() => setEditInv(inv)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-dark-600 transition-all">
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                {inv.status !== 'void' && (
                  <button
                    onClick={() => handleConvertType(inv)}
                    disabled={converting === inv.id}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium transition-all disabled:opacity-50 ${
                      inv.invoice_type === 'non_tax'
                        ? 'text-blue-400 hover:bg-blue-500/10'
                        : 'text-slate-400 hover:bg-dark-600'
                    }`}
                    title={inv.invoice_type === 'non_tax' ? 'Convert to Tax Invoice (add GST)' : 'Convert to Non-Tax Invoice (remove GST)'}>
                    {converting === inv.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <ArrowLeftRight className="w-3.5 h-3.5" />}
                    {inv.invoice_type === 'non_tax' ? '→ GST' : '→ Non-Tax'}
                  </button>
                )}
                <div className="flex-1" />
                <button onClick={() => handleVoid(inv)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-all ${inv.status === 'void' ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-yellow-400 hover:bg-yellow-500/10'}`}>
                  <Ban className="w-3.5 h-3.5" />
                  {inv.status === 'void' ? 'Re-activate' : 'Void'}
                </button>
                <button onClick={() => handleDelete(inv)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && <InvoiceFormModal  companyId={companyId} onClose={() => setCreateOpen(false)} />}
      {viewId    && <InvoiceViewModal   invoiceId={viewId}   onClose={() => setViewId(null)} onDownload={handleDownload} />}
      {editInv   && <InvoiceEditModal   companyId={companyId} invoice={editInv} onClose={() => setEditInv(null)} />}
    </div>
  )
}

// ── Quick Add / Edit Client Modal ────────────────────────────────────────────
function QuickClientModal({ companyId, existing, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    display_name:  existing?.display_name || existing?.business_name || '',
    gstin:         existing?.gstin         || '',
    contact_phone: existing?.contact_phone || existing?.phone || '',
    contact_email: existing?.contact_email || existing?.email || '',
    registered_address: existing?.registered_address || existing?.address || '',
    // Also set credit settings inline
    credit_period_days:   '',
    statement_day:        '',
    payment_due_days:     '7',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.display_name.trim()) { toast.error('Client name is required'); return }
    setSaving(true)
    try {
      const clientPayload = {
        company_id:          companyId,
        display_name:        form.display_name.trim(),
        business_name:       form.display_name.trim(),
        gstin:               form.gstin.trim() || null,
        contact_phone:       form.contact_phone.trim() || null,
        contact_email:       form.contact_email.trim() || null,
        registered_address:  form.registered_address.trim() || null,
        client_type:         'business',
        currency:            'INR',
        tax_preference:      'tax_payer',
      }

      let clientId = existing?.id
      if (isEdit) {
        const { error } = await supabase.from('clients').update(clientPayload).eq('id', clientId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('clients').insert(clientPayload).select('id').single()
        if (error) throw error
        clientId = data.id
      }

      // Save credit settings if any credit fields filled
      if (form.credit_period_days) {
        const creditPayload = {
          company_id:        companyId,
          client_id:         clientId,
          credit_period_days: Number(form.credit_period_days),
          statement_day:     form.statement_day ? Number(form.statement_day) : null,
          payment_due_days:  Number(form.payment_due_days) || 7,
          updated_at:        new Date().toISOString(),
        }
        await supabase.from('crusher_client_settings')
          .upsert(creditPayload, { onConflict: 'company_id,client_id' })
      }

      await qc.invalidateQueries({ queryKey: ['clients', companyId] })
      await qc.invalidateQueries({ queryKey: ['crusher_client_settings', companyId] })
      toast.success(isEdit ? 'Client updated' : 'Client added')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit — ${existing.display_name || existing.business_name}` : 'Add New Client'}
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update Client' : 'Add Client'}
          </button>
        </>
      }
    >
      {/* Client details */}
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Client Details</div>
      <Field label="Company / Client Name" required>
        <input className={inp()} value={form.display_name}
          onChange={e => set('display_name', e.target.value)}
          placeholder="e.g. ABC Constructions" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="GSTIN">
          <input className={inp('font-mono')} value={form.gstin}
            onChange={e => set('gstin', e.target.value.toUpperCase())}
            placeholder="22AAAAA0000A1Z5" maxLength={15} />
        </Field>
        <Field label="Phone">
          <input className={inp()} value={form.contact_phone}
            onChange={e => set('contact_phone', e.target.value)}
            placeholder="+91 98765 43210" />
        </Field>
      </div>
      <Field label="Email">
        <input type="email" className={inp()} value={form.contact_email}
          onChange={e => set('contact_email', e.target.value)}
          placeholder="billing@example.com" />
      </Field>
      <Field label="Address">
        <textarea className={inp()} rows={2} value={form.registered_address}
          onChange={e => set('registered_address', e.target.value)}
          placeholder="Full billing address…" />
      </Field>

      {/* Credit settings (optional) */}
      <div className="border-t border-dark-600 pt-3 mt-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Credit Settings <span className="font-normal normal-case text-slate-500">(optional — can set later)</span></div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Credit Period (days)">
            <input type="number" className={inp()} value={form.credit_period_days}
              onChange={e => set('credit_period_days', e.target.value)}
              placeholder="e.g. 30" min={1} />
          </Field>
          <Field label="Statement Day (1–31)">
            <input type="number" className={inp()} value={form.statement_day}
              onChange={e => set('statement_day', e.target.value)}
              placeholder="e.g. 1" min={1} max={31} />
          </Field>
          <Field label="Payment Due (days)">
            <input type="number" className={inp()} value={form.payment_due_days}
              onChange={e => set('payment_due_days', e.target.value)}
              placeholder="7" min={0} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── Credit Settings Modal ─────────────────────────────────────────────────────
function CreditSettingsModal({ client, companyId, existing, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    credit_period_days:   existing?.credit_period_days   ?? 30,
    statement_day:        existing?.statement_day         ?? 1,
    payment_due_days:     existing?.payment_due_days      ?? 7,
    default_loading_pt:   existing?.default_loading_pt    ?? '',
    default_unloading_pt: existing?.default_unloading_pt  ?? '',
    notes:                existing?.notes                 ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        company_id:           companyId,
        client_id:            client.id,
        credit_period_days:   Number(form.credit_period_days),
        statement_day:        form.statement_day ? Number(form.statement_day) : null,
        payment_due_days:     Number(form.payment_due_days),
        default_loading_pt:   form.default_loading_pt  || null,
        default_unloading_pt: form.default_unloading_pt || null,
        notes:                form.notes || null,
        updated_at:           new Date().toISOString(),
      }
      const { error } = existing
        ? await supabase.from('crusher_client_settings').update(payload).eq('id', existing.id)
        : await supabase.from('crusher_client_settings').insert({ ...payload })
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['crusher_client_settings', companyId] })
      toast.success('Credit settings saved')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Credit Settings — ${client.display_name || client.business_name}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Credit Period (days)" required>
          <input type="number" className={inp()} value={form.credit_period_days}
            onChange={e => set('credit_period_days', e.target.value)} min={1} max={365} />
        </Field>
        <Field label="Statement Day (1–31)">
          <input type="number" className={inp()} value={form.statement_day}
            onChange={e => set('statement_day', e.target.value)} min={1} max={31}
            placeholder="e.g. 1" />
        </Field>
        <Field label="Payment Due (days after stmt)">
          <input type="number" className={inp()} value={form.payment_due_days}
            onChange={e => set('payment_due_days', e.target.value)} min={0} max={90} />
        </Field>
      </div>
      <Field label="Default Loading Point">
        <input className={inp()} value={form.default_loading_pt}
          onChange={e => set('default_loading_pt', e.target.value)}
          placeholder="e.g. Plant Gate, Quarry 1" />
      </Field>
      <Field label="Default Unloading Point">
        <input className={inp()} value={form.default_unloading_pt}
          onChange={e => set('default_unloading_pt', e.target.value)}
          placeholder="e.g. Site A, Customer Yard" />
      </Field>
      <Field label="Notes">
        <textarea className={inp()} rows={2} value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Any billing notes for this client…" />
      </Field>
      <div className="bg-dark-700 rounded-lg p-3 border border-dark-600 text-xs text-slate-400 space-y-1">
        <div className="flex items-center gap-1.5 text-slate-300 font-medium mb-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-primary-400" /> How credit periods work
        </div>
        <p>• Invoices created with <strong className="text-slate-300">Credit</strong> payment type will auto-set due date = invoice date + credit period days.</p>
        <p>• Statement will be generated on day <strong className="text-slate-300">{form.statement_day || '?'}</strong> of each month.</p>
        <p>• Expected payment = statement date + <strong className="text-slate-300">{form.payment_due_days}</strong> days.</p>
      </div>
    </Modal>
  )
}

// ── Clients Tab ───────────────────────────────────────────────────────────────
function ClientsTab({ companyId }) {
  const [creditModal, setCreditModal] = useState(null)   // { client, existing }
  const [clientModal, setClientModal] = useState(null)   // null | { existing? }

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*')
        .eq('company_id', companyId).order('display_name')
      if (error) console.error('clients query:', error)
      return data || []
    },
  })

  const { data: settings = [] } = useQuery({
    queryKey: ['crusher_client_settings', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_settings').select('*')
        .eq('company_id', companyId)
      return data || []
    },
  })

  const { data: vehicles = [] } = useQuery({
    queryKey: ['crusher_client_vehicles', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_vehicles').select('client_id')
        .eq('company_id', companyId).eq('owner_type', 'client')
      return data || []
    },
  })

  const settingsMap = Object.fromEntries(settings.map(s => [s.client_id, s]))
  const vehicleCount = vehicles.reduce((acc, v) => {
    acc[v.client_id] = (acc[v.client_id] || 0) + 1
    return acc
  }, {})

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setClientModal({ existing: null })} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Client
        </button>
        <span className="text-xs text-slate-500 ml-auto">{clients.length} client{clients.length !== 1 ? 's' : ''}</span>
      </div>

      {!clients.length ? (
        <div className="text-center py-16 text-slate-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm mb-3">No clients yet.</p>
          <button onClick={() => setClientModal({ existing: null })} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Add First Client
          </button>
        </div>
      ) : null}

      {clients.map(client => {
        const s = settingsMap[client.id]
        const vCount = vehicleCount[client.id] || 0
        return (
          <div key={client.id} className="bg-dark-700 rounded-xl border border-dark-600 p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center text-sm font-bold text-primary-400 flex-shrink-0">
              {(client.display_name || client.business_name)?.[0]?.toUpperCase() || 'C'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-200">{client.display_name || client.business_name}</span>
                {s ? (
                  <Badge label={`Credit: ${s.credit_period_days}d`} color="blue" />
                ) : (
                  <Badge label="No credit settings" color="slate" />
                )}
                {vCount > 0 && <Badge label={`${vCount} vehicle${vCount > 1 ? 's' : ''}`} color="green" />}
              </div>
              {client.contact_phone && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Phone className="w-3 h-3" />{client.contact_phone}</p>}
              {s && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Statement: day {s.statement_day || '—'} of month · Due: {s.payment_due_days}d after statement
                  {s.default_loading_pt && ` · Load: ${s.default_loading_pt}`}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex gap-1.5">
              <button
                onClick={() => setClientModal({ existing: client })}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-dark-600 hover:bg-dark-500 px-3 py-1.5 rounded-lg transition-all"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setCreditModal({ client, existing: s })}
                className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-all"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {s ? 'Credit' : 'Set Credit'}
              </button>
            </div>
          </div>
        )
      })}

      {clientModal && (
        <QuickClientModal
          companyId={companyId}
          existing={clientModal.existing}
          onClose={() => setClientModal(null)}
        />
      )}

      {creditModal && (
        <CreditSettingsModal
          client={creditModal.client}
          companyId={companyId}
          existing={creditModal.existing}
          onClose={() => setCreditModal(null)}
        />
      )}
    </div>
  )
}

// ── Vehicle Form Modal ────────────────────────────────────────────────────────
function VehicleFormModal({ companyId, clients, fleet, existing, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    vehicle_number:   existing?.vehicle_number  ?? '',
    vehicle_type:     existing?.vehicle_type    ?? 'Tipper (10-Wheeler)',
    owner_type:       existing?.owner_type      ?? 'client',
    client_id:        existing?.client_id       ?? '',
    equipment_id:     existing?.equipment_id    ?? '',
    billing_basis:    existing?.billing_basis   ?? 'fixed_capacity',
    capacity_tonnes:  existing?.capacity_tonnes ?? '',
    capacity_uom:     existing?.capacity_uom    ?? 'tonnes',
    notes:            existing?.notes           ?? '',
    is_active:        existing?.is_active       ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.vehicle_number.trim()) { toast.error('Vehicle number is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id:      companyId,
        vehicle_number:  form.vehicle_number.trim().toUpperCase(),
        vehicle_type:    form.vehicle_type,
        owner_type:      form.owner_type,
        client_id:       form.owner_type === 'client' && form.client_id ? form.client_id : null,
        equipment_id:    form.owner_type === 'own' && form.equipment_id ? form.equipment_id : null,
        billing_basis:   form.billing_basis,
        capacity_tonnes: form.capacity_tonnes ? Number(form.capacity_tonnes) : null,
        capacity_uom:    form.capacity_uom || 'tonnes',
        notes:           form.notes || null,
        is_active:       form.is_active,
      }
      const { error } = isEdit
        ? await supabase.from('crusher_client_vehicles').update(payload).eq('id', existing.id)
        : await supabase.from('crusher_client_vehicles').insert(payload)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['crusher_client_vehicles', companyId] })
      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle registered')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit Vehicle' : 'Register Vehicle'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Register'}
          </button>
        </>
      }
    >
      <Field label="Vehicle Registration Number" required>
        <input className={inp()} value={form.vehicle_number}
          onChange={e => set('vehicle_number', e.target.value)}
          placeholder="e.g. TN38 AB 1234"
          style={{ textTransform: 'uppercase' }} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Vehicle Type" required>
          <select className={inp()} value={form.vehicle_type}
            onChange={e => set('vehicle_type', e.target.value)}>
            {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Owner">
          <select className={inp()} value={form.owner_type}
            onChange={e => set('owner_type', e.target.value)}>
            <option value="client">Client's Vehicle</option>
            <option value="own">Own Fleet Vehicle</option>
          </select>
        </Field>
      </div>

      {form.owner_type === 'client' && (
        <Field label="Linked Client">
          <select className={inp()} value={form.client_id}
            onChange={e => set('client_id', e.target.value)}>
            <option value="">— Select client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
          </select>
        </Field>
      )}

      {form.owner_type === 'own' && fleet.length > 0 && (
        <Field label="Link to Fleet Equipment (optional)">
          <select className={inp()} value={form.equipment_id}
            onChange={e => set('equipment_id', e.target.value)}>
            <option value="">— Not linked —</option>
            {fleet.map(eq => (
              <option key={eq.id} value={eq.id}>{eq.name} ({eq.equipment_number})</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Billing Basis" required>
        <select className={inp()} value={form.billing_basis}
          onChange={e => set('billing_basis', e.target.value)}>
          <option value="fixed_capacity">Fixed Capacity (per trip)</option>
          <option value="weighed">Weigh-Based (actual weight per trip)</option>
        </select>
      </Field>

      {form.billing_basis === 'fixed_capacity' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capacity">
            <input type="number" className={inp()} value={form.capacity_tonnes}
              onChange={e => set('capacity_tonnes', e.target.value)}
              placeholder="e.g. 10.5" step={0.5} min={0} />
          </Field>
          <Field label="Unit of Measure">
            <select className={inp()} value={form.capacity_uom}
              onChange={e => set('capacity_uom', e.target.value)}>
              <option value="tonnes">Tonnes (T)</option>
              <option value="cum">Cubic Metres (CUM)</option>
              <option value="units">Units (Volume)</option>
            </select>
          </Field>
        </div>
      )}
      {form.billing_basis === 'weighed' && (
        <p className="text-xs text-slate-500 bg-dark-700 rounded-lg px-3 py-2 border border-dark-600">
          ⚖️ Actual weight per trip will be entered on each invoice at the time of billing.
        </p>
      )}

      <Field label="Notes">
        <input className={inp()} value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Any notes about this vehicle…" />
      </Field>

      {isEdit && (
        <div className="flex items-center gap-3">
          <button onClick={() => set('is_active', !form.is_active)}
            className={`flex items-center gap-2 text-sm transition-colors ${form.is_active ? 'text-emerald-400' : 'text-slate-400'}`}>
            {form.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {form.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
      )}
    </Modal>
  )
}

// ── Vehicles Tab ──────────────────────────────────────────────────────────────
function VehiclesTab({ companyId }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null) // null | { existing? }
  const [filterClient, setFilterClient] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['crusher_client_vehicles', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_vehicles')
        .select('*, clients(display_name, business_name), equipment(name, equipment_number)')
        .eq('company_id', companyId).order('vehicle_number')
      return data || []
    },
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('clients')
        .select('id, display_name, business_name')
        .eq('company_id', companyId).order('display_name')
      return data || []
    },
  })

  const { data: fleet = [] } = useQuery({
    queryKey: ['fleet_basic', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id, name, equipment_number')
        .eq('company_id', companyId).eq('status', 'active').order('name')
      return data || []
    },
  })

  const handleDelete = async (id) => {
    const { error } = await supabase.from('crusher_client_vehicles').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    await qc.invalidateQueries({ queryKey: ['crusher_client_vehicles', companyId] })
    toast.success('Vehicle removed')
    setConfirmDel(null)
  }

  const filtered = filterClient
    ? vehicles.filter(v => v.client_id === filterClient || (filterClient === '__own' && v.owner_type === 'own'))
    : vehicles

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setModal({ existing: null })} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Register Vehicle
        </button>
        <select className="rounded-lg border border-dark-600 bg-dark-700 px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
          value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">All Vehicles</option>
          <option value="__own">Own Fleet</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
        </select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} vehicle{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
      ) : !filtered.length ? (
        <div className="text-center py-12 text-slate-500">
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No vehicles registered yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(v => (
            <div key={v.id} className={`bg-dark-700 rounded-xl border p-4 flex items-start gap-4 ${v.is_active ? 'border-dark-600' : 'border-dark-600 opacity-60'}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${v.owner_type === 'own' ? 'bg-emerald-500/10' : 'bg-primary-500/10'}`}>
                <Truck className={`w-5 h-5 ${v.owner_type === 'own' ? 'text-emerald-400' : 'text-primary-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-primary-300">{v.vehicle_number}</span>
                  <Badge label={v.vehicle_type} color="slate" />
                  {v.owner_type === 'own'
                    ? <Badge label="Own Fleet" color="green" />
                    : <Badge label="Client Vehicle" color="blue" />}
                  {!v.is_active && <Badge label="Inactive" color="red" />}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {v.owner_type === 'client' && v.clients && <span className="mr-2">Client: <strong>{v.clients.display_name || v.clients.business_name}</strong></span>}
                  {v.owner_type === 'own' && v.equipment?.name && <span className="mr-2">Fleet: <strong>{v.equipment.name}</strong></span>}
                  {v.billing_basis === 'fixed_capacity'
                    ? <span>Fixed capacity: <strong>{v.capacity_tonnes ?? '—'} {(v.capacity_uom || 'tonnes').toUpperCase()}</strong></span>
                    : <span className="text-yellow-400">Weigh-based billing</span>}
                </p>
                {v.notes && <p className="text-[11px] text-slate-500 mt-0.5">{v.notes}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setModal({ existing: v })}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDel(v)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <VehicleFormModal
          companyId={companyId}
          clients={clients}
          fleet={fleet}
          existing={modal.existing}
          onClose={() => setModal(null)}
        />
      )}

      {confirmDel && (
        <Modal title="Remove Vehicle?" onClose={() => setConfirmDel(null)}
          footer={
            <>
              <button onClick={() => setConfirmDel(null)} className="btn-ghost">Cancel</button>
              <button onClick={() => handleDelete(confirmDel.id)} className="btn-danger">Remove</button>
            </>
          }>
          <p className="text-sm text-slate-300">Remove <strong>{confirmDel.vehicle_number}</strong> from the registry? This won't affect existing invoices.</p>
        </Modal>
      )}
    </div>
  )
}

// ── Location Form Modal ───────────────────────────────────────────────────────
function LocationFormModal({ companyId, existing, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    point_name:  existing?.point_name  ?? '',
    point_type:  existing?.point_type  ?? 'both',
    address:     existing?.address     ?? '',
    sort_order:  existing?.sort_order  ?? 0,
    is_active:   existing?.is_active   ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.point_name.trim()) { toast.error('Point name is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id:  companyId,
        point_name:  form.point_name.trim(),
        point_type:  form.point_type,
        address:     form.address || null,
        sort_order:  Number(form.sort_order),
        is_active:   form.is_active,
      }
      const { error } = isEdit
        ? await supabase.from('crusher_loading_points').update(payload).eq('id', existing.id)
        : await supabase.from('crusher_loading_points').insert(payload)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['crusher_loading_points', companyId] })
      toast.success(isEdit ? 'Location updated' : 'Location added')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit Location' : 'Add Loading / Unloading Point'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Add'}
          </button>
        </>
      }
    >
      <Field label="Point Name" required>
        <input className={inp()} value={form.point_name}
          onChange={e => set('point_name', e.target.value)}
          placeholder="e.g. Plant Gate, Quarry 1, Site A" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className={inp()} value={form.point_type}
            onChange={e => set('point_type', e.target.value)}>
            <option value="loading">Loading Point (source)</option>
            <option value="unloading">Unloading Point (destination)</option>
            <option value="both">Both (loading & unloading)</option>
          </select>
        </Field>
        <Field label="Display Order">
          <input type="number" className={inp()} value={form.sort_order}
            onChange={e => set('sort_order', e.target.value)} min={0} />
        </Field>
      </div>
      <Field label="Address / Description">
        <textarea className={inp()} rows={2} value={form.address}
          onChange={e => set('address', e.target.value)}
          placeholder="Full address or description of this point…" />
      </Field>
    </Modal>
  )
}

// ── Locations Tab ─────────────────────────────────────────────────────────────
function LocationsTab({ companyId }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['crusher_loading_points', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_loading_points').select('*')
        .eq('company_id', companyId).order('sort_order').order('point_name')
      return data || []
    },
  })

  const toggleActive = async (loc) => {
    const { error } = await supabase.from('crusher_loading_points')
      .update({ is_active: !loc.is_active }).eq('id', loc.id)
    if (error) { toast.error(error.message); return }
    await qc.invalidateQueries({ queryKey: ['crusher_loading_points', companyId] })
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('crusher_loading_points').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    await qc.invalidateQueries({ queryKey: ['crusher_loading_points', companyId] })
    toast.success('Location removed')
    setConfirmDel(null)
  }

  const typeLabel = { loading: '🔼 Loading', unloading: '🔽 Unloading', both: '↕ Both' }
  const typeColor = { loading: 'blue', unloading: 'green', both: 'yellow' }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setModal({ existing: null })} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Location
        </button>
        <span className="text-xs text-slate-500 ml-auto">{locations.length} location{locations.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
      ) : !locations.length ? (
        <div className="text-center py-12 text-slate-500">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No loading/unloading points added yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {locations.map(loc => (
            <div key={loc.id} className={`bg-dark-700 rounded-xl border p-4 flex items-start gap-4 ${loc.is_active ? 'border-dark-600' : 'border-dark-600 opacity-60'}`}>
              <div className="w-9 h-9 rounded-lg bg-dark-600 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-200">{loc.point_name}</span>
                  <Badge label={typeLabel[loc.point_type]} color={typeColor[loc.point_type]} />
                  {!loc.is_active && <Badge label="Inactive" color="red" />}
                </div>
                {loc.address && <p className="text-xs text-slate-500 mt-0.5">{loc.address}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => toggleActive(loc)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                  title={loc.is_active ? 'Deactivate' : 'Activate'}>
                  {loc.is_active ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
                <button onClick={() => setModal({ existing: loc })}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDel(loc)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <LocationFormModal companyId={companyId} existing={modal.existing} onClose={() => setModal(null)} />
      )}

      {confirmDel && (
        <Modal title="Remove Location?" onClose={() => setConfirmDel(null)}
          footer={
            <>
              <button onClick={() => setConfirmDel(null)} className="btn-ghost">Cancel</button>
              <button onClick={() => handleDelete(confirmDel.id)} className="btn-danger">Remove</button>
            </>
          }>
          <p className="text-sm text-slate-300">Remove <strong>{confirmDel.point_name}</strong>? This won't affect existing invoices.</p>
        </Modal>
      )}
    </div>
  )
}

// ── HSN Edit Modal ────────────────────────────────────────────────────────────
// ── Grade Form Modal (Add / Edit material grade) ──────────────────────────────
function GradeFormModal({ companyId, existing, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    grade_name:       existing?.grade_name       || '',
    description:      existing?.description      || '',
    default_rate:     existing?.default_rate     ?? '',
    hsn_code:         existing?.hsn_code         ?? '2517',
    default_gst_rate: existing?.default_gst_rate ?? 5,
    is_active:        existing?.is_active        ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.grade_name.trim()) { toast.error('Material name is required'); return }
    setSaving(true)
    try {
      const payload = {
        grade_name:       form.grade_name.trim(),
        description:      form.description.trim() || null,
        default_rate:     form.default_rate !== '' ? Number(form.default_rate) : 0,
        hsn_code:         form.hsn_code.trim()    || null,
        default_gst_rate: Number(form.default_gst_rate),
        is_active:        form.is_active,
      }
      if (isEdit) {
        const { error } = await supabase.from('crusher_grades').update(payload).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('crusher_grades').insert({ ...payload, company_id: companyId })
        if (error) throw error
      }
      await qc.invalidateQueries({ queryKey: ['crusher_grades_hsn'] })
      await qc.invalidateQueries({ queryKey: ['crusher-grades', companyId] })
      toast.success(isEdit ? 'Material updated' : 'Material added')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally { setSaving(false) }
  }

  return (
    <Modal
      title={isEdit ? `Edit — ${existing.grade_name}` : 'Add Material / Grade'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-dark-700 text-slate-300 hover:bg-dark-600">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Add Material'}
          </button>
        </>
      }
    >
      <Field label="Material Name" required>
        <input className={inp()} value={form.grade_name}
          onChange={e => set('grade_name', e.target.value)}
          placeholder="e.g. M Sand, 20mm Jelly, GSB…" />
      </Field>

      <Field label="Description">
        <input className={inp()} value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Optional — e.g. Fine aggregate for plastering" />
      </Field>

      <Field label="Default Rate (₹ per unit)" required>
        <input type="number" className={inp()} value={form.default_rate}
          onChange={e => set('default_rate', e.target.value)}
          placeholder="e.g. 850.00" step="0.01" min="0" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="HSN Code">
          <input className={inp()} value={form.hsn_code}
            onChange={e => set('hsn_code', e.target.value)}
            placeholder="e.g. 2517" />
        </Field>
        <Field label="Default GST Rate">
          <select className={inp()} value={form.default_gst_rate}
            onChange={e => set('default_gst_rate', e.target.value)}>
            <option value={0}>0% (Exempt / Non-Tax)</option>
            <option value={5}>5%</option>
            <option value={12}>12%</option>
            <option value={18}>18%</option>
            <option value={28}>28%</option>
          </select>
        </Field>
      </div>

      <div className="bg-dark-700 rounded-lg p-3 border border-dark-600 text-xs text-slate-400 space-y-1">
        <p>• HSN <strong className="text-slate-300">2517</strong> — Crushed stone, aggregate, dust, GSB, rejects → <strong className="text-slate-300">5% GST</strong></p>
        <p>• HSN <strong className="text-slate-300">2505</strong> — Natural / manufactured sands (M Sand, P Sand) → <strong className="text-slate-300">5% GST</strong></p>
        <p className="text-slate-500 pt-0.5">GST rate auto-applied on tax invoices. Non-tax invoices always show ₹0 GST.</p>
      </div>

      {isEdit && (
        <div className="flex items-center justify-between bg-dark-700 rounded-lg px-3 py-2.5 border border-dark-600">
          <span className="text-sm text-slate-300">Active (shows in invoice picker)</span>
          <button onClick={() => set('is_active', !form.is_active)}
            className={`w-10 h-5 rounded-full transition-all ${form.is_active ? 'bg-emerald-500' : 'bg-dark-500'}`}>
            <span className={`block w-4 h-4 bg-white rounded-full shadow transition-all mx-0.5 ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      )}
    </Modal>
  )
}

// ── Materials & HSN Tab ───────────────────────────────────────────────────────
function MaterialsTab({ companyId }) {
  const [editGrade, setEditGrade]   = useState(null)  // existing grade object → edit
  const [addOpen,   setAddOpen]     = useState(false)  // new grade form

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['crusher_grades_hsn'],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_grades').select('*')
        .eq('company_id', companyId).order('sort_order').order('grade_name')
      return data || []
    },
  })

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Materials & Grades</h3>
          <p className="text-xs text-slate-500">
            {grades.length} material{grades.length !== 1 ? 's' : ''} · HSN & GST auto-applied on tax invoices
          </p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-all">
          <Plus className="w-4 h-4" /> Add Material
        </button>
      </div>

      {/* Empty state */}
      {!grades.length && (
        <div className="text-center py-14 space-y-3">
          <Package className="w-10 h-10 mx-auto text-slate-600" />
          <p className="text-sm text-slate-500">No materials yet.</p>
          <button onClick={() => setAddOpen(true)}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">
            Add First Material
          </button>
        </div>
      )}

      {/* Grade list */}
      {grades.length > 0 && (
        <div className="grid gap-2">
          {grades.map(g => (
            <div key={g.id}
              className={`bg-dark-700 rounded-xl border border-dark-600 p-4 flex items-center gap-4 ${!g.is_active ? 'opacity-50' : ''}`}>
              <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-200">{g.grade_name}</span>
                  {!g.is_active && <Badge label="Inactive" color="red" />}
                </div>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  <span className="text-xs text-slate-500">
                    Rate: <strong className="text-emerald-400">₹{Number(g.default_rate || 0).toLocaleString('en-IN')}</strong>
                  </span>
                  <span className="text-xs text-slate-500">
                    HSN: <strong className="font-mono text-primary-300">{g.hsn_code || '—'}</strong>
                  </span>
                  <span className="text-xs text-slate-500">
                    GST: <strong className={Number(g.default_gst_rate) > 0 ? 'text-yellow-400' : 'text-slate-400'}>
                      {g.default_gst_rate ?? 0}%
                    </strong>
                  </span>
                  {g.description && <span className="text-xs text-slate-600 truncate">{g.description}</span>}
                </div>
              </div>
              <button onClick={() => setEditGrade(g)}
                className="flex-shrink-0 flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-all">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {addOpen  && <GradeFormModal companyId={companyId} onClose={() => setAddOpen(false)} />}
      {editGrade && <GradeFormModal companyId={companyId} existing={editGrade} onClose={() => setEditGrade(null)} />}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CrusherSalesPage() {
  const { companyId } = useAuth()
  const [tab, setTab] = useState('invoices')

  const tabIcons = { invoices: FileText, clients: Users, vehicles: Truck, locations: MapPin, materials: Package }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-dark-700 px-6 py-4">
        <h1 className="text-xl font-bold text-slate-100">Crusher Sales</h1>
        <p className="text-sm text-slate-400 mt-0.5">Vehicle-linked tonnage invoicing, client credit management, and material billing</p>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-dark-700 px-4">
        <nav className="flex gap-1 overflow-x-auto py-2">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0
                  ${isActive ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'}`}>
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'tokens'    && <TokensTab     companyId={companyId} />}
        {tab === 'invoices'  && <InvoicesTab   companyId={companyId} />}
        {tab === 'clients'   && <ClientsTab    companyId={companyId} />}
        {tab === 'vehicles'  && <VehiclesTab   companyId={companyId} />}
        {tab === 'locations' && <LocationsTab  companyId={companyId} />}
        {tab === 'materials' && <MaterialsTab  companyId={companyId} />}
      </div>
    </div>
  )
}
