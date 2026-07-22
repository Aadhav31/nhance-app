import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Users, Truck, MapPin, Package, FileText, Plus, Edit2, Trash2, X, Save,
  Loader2, CheckCircle, Settings2, ChevronRight, AlertCircle, ToggleLeft,
  ToggleRight, Phone, Mail, CreditCard, Calendar, Building2, Hash,
  Eye, Download, Ban, Printer, ClipboardCheck, RefreshCw, ArrowLeftRight, BarChart2, GripVertical, Lock
} from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'tokens',     label: 'Tokens',             icon: Printer      },
  { key: 'invoices',   label: 'Invoices',            icon: FileText     },
  { key: 'aging',      label: 'Outstanding',         icon: BarChart2    },
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

// ── Autocomplete Input ────────────────────────────────────────────────────────
// freeText: allow typing a value not in the list (for loading/unloading points)
function Autocomplete({ options = [], value = '', onChange, placeholder = 'Search…', freeText = false, className = '', disabled = false }) {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const [hiIdx,  setHiIdx]  = useState(-1)
  const wrapRef  = useRef(null)

  const selectedLabel = options.find(o => o.value === value)?.label ?? value ?? ''

  useEffect(() => {
    const fn = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Locked/disabled display
  if (disabled) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl bg-dark-800/60 border border-dark-700 ${className}`}>
        <Lock className="w-3 h-3 text-slate-500 flex-shrink-0" />
        <span className="text-sm text-slate-300 truncate">{selectedLabel || <span className="text-slate-600 text-xs italic">—</span>}</span>
      </div>
    )
  }

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const pick = (opt) => {
    onChange(opt.value)
    setQuery(''); setOpen(false); setHiIdx(-1)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHiIdx(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHiIdx(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (hiIdx >= 0 && filtered[hiIdx]) pick(filtered[hiIdx])
      else if (freeText && query) { onChange(query); setQuery(''); setOpen(false) }
    }
    else if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        type="text"
        className={inp()}
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        onFocus={() => { setOpen(true); setQuery(''); setHiIdx(-1) }}
        onChange={e => {
          setQuery(e.target.value)
          setHiIdx(-1)
          if (freeText) onChange(e.target.value)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (filtered.length > 0 || (freeText && query && !options.find(o => o.value === query))) && (
        <div className="absolute z-[60] top-full left-0 right-0 mt-1 bg-dark-700 border border-dark-500 rounded-xl shadow-2xl max-h-52 overflow-y-auto">
          {filtered.length === 0 && freeText && query && (
            <div className="px-3 py-2 text-xs text-slate-500 italic">Press Enter to use "{query}"</div>
          )}
          {filtered.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={() => pick(opt)}
              className={`w-full text-left px-3 py-2.5 text-sm border-b border-dark-600 last:border-0 transition-colors
                ${i === hiIdx
                  ? 'bg-primary-500/20 text-primary-300'
                  : 'text-slate-300 hover:bg-dark-600 hover:text-slate-100'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Invoice Form Modal ────────────────────────────────────────────────────────
function InvoiceFormModal({ companyId, onClose, prefill = null, onAfterSave = null, fromToken = null }) {
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
    unloading_address:   '',
    driver_name:         prefill?.driver_name       || '',
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

  // Lock helpers — fields pre-filled from token are read-only
  const lk   = (key)     => !!fromToken && !!(prefill?.[key])
  const lkLn = (lineKey) => !!fromToken && !!(prefill?.[
    lineKey === 'grade_id' ? 'tokenGradeId' :
    lineKey === 'quantity' ? 'tokenQty'     :
    lineKey === 'unit'     ? 'tokenUnit'    : ''
  ])
  const lockedInp = `${inp()} opacity-70 cursor-not-allowed pointer-events-none bg-dark-800/60`

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
    queryKey: ['vehicles-inv', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('crusher_client_vehicles')
        .select('id, vehicle_number, vehicle_type, billing_basis, capacity_tonnes, capacity_uom, owner_type, client_id, transporter_name')
        .eq('company_id', companyId).eq('is_active', true)
        .order('vehicle_number')
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
        .select('id, grade_name, hsn_code, default_gst_rate, default_rate, default_uom')
        .eq('company_id', companyId).eq('is_active', true).order('grade_name')
      if (error) console.error(error)
      return data || []
    },
  })

  const { data: companyAddress = '' } = useQuery({
    queryKey: ['company-address', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('address').eq('id', companyId).single()
      return data?.address || ''
    },
  })

  // Client default settings — re-fetch when client changes
  const { data: clientDefaults } = useQuery({
    queryKey: ['crusher-client-defaults', companyId, form.client_id],
    queryFn: async () => {
      if (!form.client_id) return null
      const { data } = await supabase.from('crusher_client_settings')
        .select('default_grade_id, default_loading_pt, default_unloading_pt, credit_limit, payment_type')
        .eq('company_id', companyId).eq('client_id', form.client_id).single()
      return data || null
    },
    enabled: !!form.client_id,
  })

  // Outstanding balance for selected client — used for credit limit check
  const { data: clientOutstanding = 0 } = useQuery({
    queryKey: ['crusher-client-outstanding-inv', companyId, form.client_id],
    queryFn: async () => {
      if (!form.client_id) return 0
      const { data } = await supabase.from('crusher_invoices')
        .select('balance')
        .eq('company_id', companyId)
        .eq('client_id', form.client_id)
        .neq('status', 'void')
        .gt('balance', 0)
      return (data || []).reduce((sum, row) => sum + Number(row.balance || 0), 0)
    },
    enabled: !!form.client_id,
  })

  // Delivery sites for selected client — drives unloading point picker
  const { data: clientSites = [] } = useQuery({
    queryKey: ['crusher-client-sites', companyId, form.client_id],
    queryFn: async () => {
      if (!form.client_id) return []
      const { data } = await supabase.from('crusher_client_sites')
        .select('id, site_name, address')
        .eq('company_id', companyId).eq('client_id', form.client_id)
        .eq('is_active', true).order('sort_order')
      return data || []
    },
    enabled: !!form.client_id,
  })

  // Per-client rate overrides — auto-applied when grade selected
  const { data: clientRates = [] } = useQuery({
    queryKey: ['crusher-client-rates', companyId, form.client_id],
    queryFn: async () => {
      if (!form.client_id) return []
      const { data } = await supabase.from('crusher_client_rates')
        .select('grade_id, custom_rate')
        .eq('company_id', companyId).eq('client_id', form.client_id).eq('is_active', true)
      return data || []
    },
    enabled: !!form.client_id,
  })

  // Auto-fill loading point, unloading point, and first line grade from client defaults
  useEffect(() => {
    if (!clientDefaults) return
    setForm(p => ({
      ...p,
      loading_point:   clientDefaults.default_loading_pt   || p.loading_point,
      unloading_point: clientDefaults.default_unloading_pt || p.unloading_point,
    }))
    if (clientDefaults.default_grade_id) {
      setItems(prev => prev.map((it, i) =>
        i === 0 && !it.grade_id
          ? { ...it, grade_id: clientDefaults.default_grade_id }
          : it
      ))
    }
  }, [clientDefaults])

  // When grades load and an item already has a grade_id (from token prefill) but no rate/HSN yet,
  // back-fill rate and hsn_code from the grade master.
  useEffect(() => {
    if (!grades.length) return
    setItems(prev => prev.map(it => {
      if (it.grade_id) {
        const g = grades.find(x => x.id === it.grade_id)
        if (!g) return it
        const updates = {}
        if (!it.rate     && g.default_rate) updates.rate     = String(g.default_rate)
        if (!it.hsn_code && g.hsn_code)     updates.hsn_code = g.hsn_code
        return Object.keys(updates).length ? { ...it, ...updates } : it
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
    const g          = grades.find(x => x.id === gradeId)
    const clientRate = clientRates.find(r => r.grade_id === gradeId)
    setItems(p => p.map((it, idx) => idx === i
      ? {
          ...it,
          grade_id:      gradeId,
          material_name: g?.grade_name  || '',
          hsn_code:      g?.hsn_code    || '',
          unit:          g?.default_uom || it.unit || 'tonnes',
          // prefer client-specific rate, then grade default, then keep existing
          rate: clientRate
            ? String(clientRate.custom_rate)
            : g?.default_rate ? String(g.default_rate) : it.rate,
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
    const prefix = `INV-${dateStr}-`
    // Use MAX of existing numbers for today, not count — avoids collision when invoices are voided/deleted
    const { data } = await supabase.from('crusher_invoices')
      .select('invoice_number')
      .eq('company_id', companyId)
      .gte('invoice_date', today).lte('invoice_date', today)
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(1)
    let seq = 1
    if (data?.length) {
      const parsed = parseInt(data[0].invoice_number.replace(prefix, ''), 10)
      if (!isNaN(parsed)) seq = parsed + 1
    }
    return `${prefix}${String(seq).padStart(4, '0')}`
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
        loading_point:     form.loading_point     || null,
        unloading_point:   form.unloading_point   || null,
        unloading_address: form.unloading_address || null,
        driver_name:       form.driver_name.trim() || null,
        payment_type:    form.payment_type,
        payment_mode:    form.payment_type === 'cash'   ? form.payment_mode    : null,
        credit_due_date: form.payment_type === 'credit' ? form.credit_due_date : null,
        subtotal,
        total_tax:    totalTax,
        total_amount: totalAmount,
        paid_amount:  0,
        balance:      totalAmount,
        status:       'issued',
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

      {/* Token source banner */}
      {fromToken && (
        <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-3 flex items-center gap-3">
          <Printer className="w-4 h-4 text-primary-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary-300">Converting Token → Invoice</p>
            <p className="text-[11px] text-primary-400/70">{fromToken.token_number} · {fromToken.token_date} · {fromToken.token_time?.slice(0,5)}</p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-primary-400/60">
            <Lock className="w-3 h-3" /> locked fields from token
          </div>
        </div>
      )}

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
      <Field label={lk('client_id') || lk('walkin_name') ? <span className="flex items-center gap-1">Client <Lock className="w-3 h-3 text-slate-500" /></span> : 'Client'}>
        <Autocomplete
          options={clients.map(c => ({ value: c.id, label: c.display_name || c.business_name }))}
          value={form.client_id}
          onChange={val => { set('client_id', val); set('vehicle_id', ''); set('walkin_name', '') }}
          placeholder="Search client… (blank = walk-in)"
          disabled={lk('client_id')}
        />
      </Field>

      {/* Walk-in name (only when no registered client selected) */}
      {!form.client_id && (
        <Field label={lk('walkin_name') ? <span className="flex items-center gap-1">Customer Name <Lock className="w-3 h-3 text-slate-500" /></span> : 'Customer Name (optional — for walk-in)'}>
          <input className={lk('walkin_name') ? lockedInp : inp()} value={form.walkin_name}
            onChange={e => set('walkin_name', e.target.value)}
            readOnly={lk('walkin_name')}
            placeholder="e.g. Rajan, Murugan Traders…" />
        </Field>
      )}

      {/* Vehicle — toggle between registry and manual */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1">
            Vehicle {(lk('vehicle_id') || lk('walkin_vehicle_num')) && <Lock className="w-3 h-3 text-slate-500" />}
          </label>
          {/* Hide toggle when locked from token */}
          {!(lk('vehicle_id') || lk('walkin_vehicle_num')) && (
            <button type="button"
              onClick={() => { set('vehicle_manual', !form.vehicle_manual); set('vehicle_id', ''); set('walkin_vehicle_num', '') }}
              className="text-[11px] text-primary-400 hover:text-primary-300 underline underline-offset-2">
              {form.vehicle_manual ? 'Pick from registry instead' : 'Type vehicle number instead'}
            </button>
          )}
        </div>

        {form.vehicle_manual ? (
          <input className={lk('walkin_vehicle_num') ? lockedInp : inp()} value={form.walkin_vehicle_num}
            onChange={e => set('walkin_vehicle_num', e.target.value.toUpperCase())}
            readOnly={lk('walkin_vehicle_num')}
            placeholder="e.g. TN38AB1234" />
        ) : (
          <Autocomplete
            options={vehicles.map(v => {
              const ownerTag = v.owner_type === 'own' ? ' [Own]' : v.owner_type === 'third_party' ? ` [${v.transporter_name || 'Third-party'}]` : ''
              return { value: v.id, label: `${v.vehicle_number} (${v.vehicle_type})${ownerTag}` }
            })}
            value={form.vehicle_id}
            onChange={val => handleVehicleChange(val)}
            placeholder="Search vehicle number…"
            disabled={lk('vehicle_id')}
          />
        )}
      </div>

      {/* Vehicle info chip (only for registry vehicles) */}
      {!form.vehicle_manual && selectedVehicle && (
        <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs text-slate-400 flex gap-4 flex-wrap border border-dark-600">
          <span>Type: <strong className="text-slate-200">{selectedVehicle.owner_type === 'own' ? 'Own Fleet' : selectedVehicle.owner_type === 'third_party' ? 'Third-party' : 'Client Vehicle'}</strong></span>
          <span>Billing: <strong className="text-slate-200">{selectedVehicle.billing_basis === 'fixed_capacity' ? 'Fixed Capacity' : 'Weigh-Based'}</strong></span>
          {selectedVehicle.billing_basis === 'fixed_capacity' && (
            <span>Capacity: <strong className="text-primary-300">{selectedVehicle.capacity_tonnes} {(selectedVehicle.capacity_uom || 'tonnes').toUpperCase()}</strong></span>
          )}
        </div>
      )}

      {/* Driver Name */}
      <Field label="Driver Name">
        <input className={inp()} value={form.driver_name}
          onChange={e => set('driver_name', e.target.value)}
          placeholder="e.g. Murugan, Rajan…" />
      </Field>

      {/* Loading / Unloading */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={lk('loading_point') ? <span className="flex items-center gap-1">Loading Point <Lock className="w-3 h-3 text-slate-500" /></span> : 'Loading Point'}>
          <Autocomplete
            freeText
            options={loadingPoints.filter(p => p.point_type !== 'unloading').map(p => ({ value: p.point_name, label: p.point_name }))}
            value={form.loading_point}
            onChange={val => set('loading_point', val)}
            placeholder="Search or type loading point…"
            disabled={lk('loading_point')}
          />
          {companyAddress && !lk('loading_point') && (
            <p className="text-[11px] text-slate-500 mt-1.5 bg-dark-700 rounded px-2 py-1 leading-snug">
              📍 {companyAddress}
            </p>
          )}
        </Field>
        <Field label="Unloading Point">
          {/* If client has saved sites, show them as quick-pick buttons */}
          {clientSites.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {clientSites.map(site => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => {
                    set('unloading_point', site.site_name)
                    set('unloading_address', site.address || '')
                  }}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    form.unloading_point === site.site_name
                      ? 'bg-primary-600 border-primary-500 text-white'
                      : 'bg-dark-700 border-dark-600 text-dark-300 hover:border-primary-500'
                  }`}
                >
                  {site.site_name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { set('unloading_point', ''); set('unloading_address', '') }}
                className="px-2.5 py-1 rounded text-xs border border-dark-600 bg-dark-700 text-dark-400 hover:border-dark-500"
              >
                Clear
              </button>
            </div>
          )}
          <Autocomplete
            freeText
            options={loadingPoints.filter(p => p.point_type !== 'loading').map(p => ({ value: p.point_name, label: p.point_name }))}
            value={form.unloading_point}
            onChange={val => set('unloading_point', val)}
            placeholder="Search or type unloading point…"
          />
          <input className={`${inp()} mt-2`} value={form.unloading_address}
            onChange={e => set('unloading_address', e.target.value)}
            placeholder="Delivery address (auto-fills from site or type manually)" />
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

        {/* Credit limit status — shown when credit selected, client chosen, and limit configured */}
        {form.payment_type === 'credit' && form.client_id && Number(clientDefaults?.credit_limit) > 0 && (() => {
          const limit       = Number(clientDefaults.credit_limit)
          const outstanding = Number(clientOutstanding)
          const thisInv     = totalAmount
          const headroom    = limit - outstanding - thisInv
          const overLimit   = headroom < 0
          const fmtC = n => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          return (
            <div className={`rounded-lg border p-3 space-y-2 mt-1 ${overLimit ? 'border-red-500/50 bg-red-500/5' : 'border-dark-600 bg-dark-700/60'}`}>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Credit Position</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-slate-500">Credit Limit</span>
                <span className="text-right font-mono text-slate-200">{fmtC(limit)}</span>
                <span className="text-slate-500">Current Outstanding</span>
                <span className="text-right font-mono text-yellow-300">{fmtC(outstanding)}</span>
                <span className="text-slate-500">This Invoice</span>
                <span className="text-right font-mono text-slate-300">{fmtC(thisInv)}</span>
                <span className={`font-semibold ${overLimit ? 'text-red-400' : 'text-emerald-400'}`}>Headroom</span>
                <span className={`text-right font-mono font-semibold ${overLimit ? 'text-red-400' : 'text-emerald-400'}`}>
                  {overLimit ? `−${fmtC(Math.abs(headroom))}` : fmtC(headroom)}
                </span>
              </div>
              {overLimit && (
                <div className="flex items-start gap-2 mt-1 p-2 rounded bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-300">
                    This invoice exceeds the credit limit by {fmtC(Math.abs(headroom))}. You can still save — please get approval before issuing.
                  </p>
                </div>
              )}
            </div>
          )
        })()}
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

              <Field label={lkLn('grade_id') && i === 0 ? <span className="flex items-center gap-1">Material (from grade list) <Lock className="w-3 h-3 text-slate-500" /></span> : 'Material (from grade list)'}>
                <Autocomplete
                  options={grades.map(g => ({ value: g.id, label: g.grade_name }))}
                  value={item.grade_id}
                  onChange={val => handleGradeChange(i, val)}
                  placeholder="Search grade…"
                  disabled={lkLn('grade_id') && i === 0}
                />
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
                <Field label={lkLn('quantity') && i === 0 ? <span className="flex items-center gap-1">Quantity <Lock className="w-3 h-3 text-slate-500" /></span> : 'Quantity'}>
                  <input type="number" className={lkLn('quantity') && i === 0 ? lockedInp : inp()} value={item.quantity}
                    onChange={e => setItem(i, 'quantity', e.target.value)}
                    readOnly={lkLn('quantity') && i === 0}
                    placeholder="0" step="0.001" min="0" />
                </Field>
                <Field label={lkLn('unit') && i === 0 ? <span className="flex items-center gap-1">Unit <Lock className="w-3 h-3 text-slate-500" /></span> : 'Unit'}>
                  <select className={lkLn('unit') && i === 0 ? lockedInp : inp()} value={item.unit}
                    onChange={e => setItem(i, 'unit', e.target.value)}
                    disabled={lkLn('unit') && i === 0}>
                    <option value="tonnes">Tonnes</option>
                    <option value="cum">CUM</option>
                    <option value="units">Units (Vol)</option>
                    <option value="bags">Bags</option>
                    <option value="trips">Trips</option>
                  </select>
                </Field>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Rate (₹)
                    {item.grade_id && clientRates.find(r => r.grade_id === item.grade_id) && (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-400 border border-primary-500/30">
                        Custom Rate
                      </span>
                    )}
                  </label>
                  <input type="number" className={inp()} value={item.rate}
                    onChange={e => setItem(i, 'rate', e.target.value)}
                    placeholder="0.00" step="0.01" min="0" />
                </div>
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
    queryKey: ['vehicles-inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_vehicles')
        .select('id, vehicle_number, vehicle_type, owner_type, transporter_name')
        .eq('company_id', companyId).eq('is_active', true)
        .order('vehicle_number')
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
    const prefix = `TKN-${dateStr}-`
    const { data } = await supabase.from('crusher_tokens')
      .select('token_number')
      .eq('company_id', companyId)
      .gte('token_date', today).lte('token_date', today)
      .like('token_number', `${prefix}%`)
      .order('token_number', { ascending: false })
      .limit(1)
    let seq = 1
    if (data?.length) {
      const parsed = parseInt(data[0].token_number.replace(prefix, ''), 10)
      if (!isNaN(parsed)) seq = parsed + 1
    }
    return `${prefix}${String(seq).padStart(4, '0')}`
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
        <Autocomplete
          options={clients.map(c => ({ value: c.id, label: c.display_name || c.business_name }))}
          value={form.client_id}
          onChange={val => { set('client_id', val); set('vehicle_id', ''); set('customer_name', '') }}
          placeholder="Search client… (blank = walk-in)"
        />
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
          : <Autocomplete
              options={vehicles.map(v => {
                const ownerTag = v.owner_type === 'own' ? ' [Own]' : v.owner_type === 'third_party' ? ` [${v.transporter_name || 'Third-party'}]` : ''
                return { value: v.id, label: `${v.vehicle_number} (${v.vehicle_type})${ownerTag}` }
              })}
              value={form.vehicle_id}
              onChange={val => set('vehicle_id', val)}
              placeholder="Search vehicle number…"
            />
        }
      </div>

      {/* Stock Yard */}
      <Field label="Stock Yard / Loading Point">
        <Autocomplete
          freeText
          options={loadingPoints.filter(p => p.point_type !== 'unloading').map(p => ({ value: p.point_name, label: p.point_name }))}
          value={form.stock_yard}
          onChange={val => set('stock_yard', val)}
          placeholder="Search or type stock yard…"
        />
      </Field>

      {/* Material & Quantity */}
      <Field label="Material">
        <Autocomplete
          options={grades.map(g => ({ value: g.id, label: g.grade_name }))}
          value={form.grade_id}
          onChange={val => handleGradeChange(val)}
          placeholder="Search grade…"
        />
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
    queryKey: ['vehicles-inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_vehicles')
        .select('id, vehicle_number, vehicle_type, owner_type, transporter_name')
        .eq('company_id', companyId).eq('is_active', true)
        .order('vehicle_number')
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
        <Autocomplete
          options={clients.map(c => ({ value: c.id, label: c.display_name || c.business_name }))}
          value={form.client_id}
          onChange={val => { set('client_id', val); set('customer_name', '') }}
          placeholder="Search client… (blank = walk-in)"
        />
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
          : <Autocomplete
              options={vehicles.map(v => {
                const ownerTag = v.owner_type === 'own' ? ' [Own]' : v.owner_type === 'third_party' ? ` [${v.transporter_name || 'Third-party'}]` : ''
                return { value: v.id, label: `${v.vehicle_number} (${v.vehicle_type})${ownerTag}` }
              })}
              value={form.vehicle_id}
              onChange={val => set('vehicle_id', val)}
              placeholder="Search vehicle number…"
            />
        }
      </div>

      <Field label="Stock Yard / Loading Point">
        <Autocomplete
          freeText
          options={loadingPoints.filter(p => p.point_type !== 'unloading').map(p => ({ value: p.point_name, label: p.point_name }))}
          value={form.stock_yard}
          onChange={val => set('stock_yard', val)}
          placeholder="Search or type stock yard…"
        />
      </Field>

      <Field label="Material">
        <Autocomplete
          options={grades.map(g => ({ value: g.id, label: g.grade_name }))}
          value={form.grade_id}
          onChange={val => handleGradeChange(val)}
          placeholder="Search grade…"
        />
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
      fromToken={token}
      onClose={onClose}
      onAfterSave={handleSaved}
    />
  )
}

// ── Crusher Invoice PDF ───────────────────────────────────────────────────────
// ── Amount in Words (Indian system) ──────────────────────────────────────────
function numToWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function conv(n) {
    if (n === 0) return ''
    if (n < 20)      return ones[n] + ' '
    if (n < 100)     return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' '
    if (n < 1000)    return ones[Math.floor(n / 100)] + ' Hundred ' + conv(n % 100)
    if (n < 100000)  return conv(Math.floor(n / 1000)) + 'Thousand ' + conv(n % 1000)
    if (n < 10000000) return conv(Math.floor(n / 100000)) + 'Lakh ' + conv(n % 100000)
    return conv(Math.floor(n / 10000000)) + 'Crore ' + conv(n % 10000000)
  }
  const r = Math.floor(Math.abs(amount))
  const p = Math.round((Math.abs(amount) - r) * 100)
  let w = conv(r).trim() || 'Zero'
  w += ' Rupees'
  if (p > 0) w += ' and ' + conv(p).trim() + ' Paise'
  return w + ' Only'
}

// ── Logo image loader (fetch URL → base64 for jsPDF) ─────────────────────────
async function loadLogoAsBase64(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror  = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}
function getImgFmt(dataUrl) {
  if (!dataUrl) return 'JPEG'
  if (dataUrl.includes('image/png'))  return 'PNG'
  if (dataUrl.includes('image/webp')) return 'WEBP'
  return 'JPEG'
}

// ── Professional Crusher Invoice PDF ─────────────────────────────────────────
async function downloadCrusherPDF(inv, items, companyInfo = {}, clientInfo = null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, H = 297, ML = 10, MR = 10
  const CW = W - ML - MR   // 190mm
  const isTax = inv.invoice_type === 'tax'

  const f  = n => Number(n || 0).toFixed(2)
  const fa = n => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
  const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : ''

  const st = (sz, style, r, g, b) => doc.setFontSize(sz).setFont('helvetica', style).setTextColor(r, g, b)
  const ln = (x1, y1, x2, y2 = y1, lw = 0.25) => doc.setLineWidth(lw).setDrawColor(0,0,0).line(x1, y1, x2, y2)
  const bx = (x, y, w, h, lw = 0.3) => { doc.setLineWidth(lw).setDrawColor(0,0,0).rect(x, y, w, h, 'D') }
  const tx = (text, x, y, opts = {}) => doc.text(String(text ?? ''), x, y, opts)

  // ── ORIGINAL FOR RECIPIENT ────────────────────────────────────────────────────
  st(7, 'normal', 80, 80, 80)
  tx('ORIGINAL FOR RECIPIENT', W - MR, 8, { align: 'right' })

  // ── LOGO / COMPANY HEADER ─────────────────────────────────────────────────────
  const logoBase64 = await loadLogoAsBase64(companyInfo.logo_url)
  if (logoBase64) {
    // Logo image: up to 40mm wide, 20mm tall — top-left corner
    doc.addImage(logoBase64, getImgFmt(logoBase64), ML, 6, 40, 20, '', 'FAST')
  } else {
    // Fallback: company name as text
    st(22, 'bold', 0, 0, 0)
    tx(companyInfo.name?.toUpperCase().split(' ')[0] || 'GVR', ML, 22)
    st(8, 'normal', 60, 60, 60); tx(companyInfo.name || 'GVR M Sand', ML, 28)
  }

  // ── TITLE ─────────────────────────────────────────────────────────────────────
  st(13, 'bold', 0, 0, 0)
  tx(isTax ? 'Tax Invoice' : 'Non-Tax Invoice', W / 2, 36, { align: 'center' })

  // ── HEADER ─────────────────────────────────────────────────────────────────
  // ── HEADER TABLE ─────────────────────────────────────────────────────────────
  // Left col (company + consignee + buyer) | Right col (invoice details)
  const HY  = 40
  const LCW = 95, RCW = 95
  const LX  = ML, RX  = ML + LCW
  const MX  = RX + RCW / 2   // midpoint of right col

  // Left col row heights
  const compH  = 28
  const cneeH  = 20
  const buyH   = 22
  const totH   = compH + cneeH + buyH   // 70mm

  // Right col row heights (must sum to totH)
  const rh1 = 13, rh2 = 10, rh3 = 9, rh4 = 10, rh5 = 11
  const rh6  = totH - rh1 - rh2 - rh3 - rh4 - rh5   // remaining

  // Outer box + vertical divider
  bx(LX, HY, CW, totH)
  ln(RX, HY, RX, HY + totH, 0.3)

  // ── LEFT: Company info ───────────────────────────────────────────────────────
  st(8.5, 'bold', 0, 0, 0); tx(companyInfo.name || 'GVR M Sand', LX + 2, HY + 5)
  st(6.8, 'normal', 30, 30, 30)
  let lcy = HY + 10
  const addrLines = companyInfo.address ? doc.splitTextToSize(companyInfo.address, LCW - 4) : []
  addrLines.slice(0, 3).forEach(l => { tx(l, LX + 2, lcy); lcy += 3.8 })
  if (companyInfo.gstin)   { tx(`GSTIN/UIN : ${companyInfo.gstin}`, LX + 2, lcy); lcy += 3.8 }
  if (companyInfo.msme)    { tx(`MSME- ${companyInfo.msme}`, LX + 2, lcy); lcy += 3.8 }
  const phParts = [
    companyInfo.phone  && `Phone #: ${companyInfo.phone}`,
    companyInfo.phone2 && companyInfo.phone2,
    companyInfo.office_phone && `Office:${companyInfo.office_phone}`,
  ].filter(Boolean)
  if (phParts.length) tx(phParts.join('/'), LX + 2, lcy)

  ln(LX, HY + compH, RX, HY + compH, 0.25)   // divider below company

  // ── LEFT: Consignee (Ship to) ────────────────────────────────────────────────
  const shipName    = clientInfo?.display_name || clientInfo?.business_name || inv.client_name || ''
  const shipPt      = inv.unloading_point   || ''   // master-selected point name
  const shipAddr    = inv.unloading_address || ''   // manually typed full address
  st(7, 'italic', 80, 80, 80); tx('Consignee (Ship to)', LX + 2, HY + compH + 5)
  st(8, 'bold',   0,  0,  0);  tx(shipName, LX + 2, HY + compH + 10)
  st(7, 'normal', 40, 40, 40)
  let scy = HY + compH + 14.5
  if (shipPt)   { tx(shipPt,   LX + 2, scy); scy += 3.8 }
  if (shipAddr) { doc.splitTextToSize(shipAddr, LCW - 4).slice(0, 2).forEach(l => { tx(l, LX + 2, scy); scy += 3.8 }) }

  ln(LX, HY + compH + cneeH, RX, HY + compH + cneeH, 0.25)   // divider below consignee

  // ── LEFT: Buyer (Bill to) ────────────────────────────────────────────────────
  const billName  = clientInfo?.display_name || clientInfo?.business_name || inv.client_name || inv.walkin_name || ''
  const billGstin = clientInfo?.gstin || ''
  st(7, 'italic', 80, 80, 80); tx('Buyer (Bill to)', LX + 2, HY + compH + cneeH + 5)
  st(8, 'bold',   0,  0,  0);  tx(billName, LX + 2, HY + compH + cneeH + 10)
  st(7, 'normal', 40, 40, 40)
  if (clientInfo?.registered_address) tx(doc.splitTextToSize(clientInfo.registered_address, LCW - 4)[0], LX + 2, HY + compH + cneeH + 15)
  tx(billGstin ? `GSTIN/UIN : ${billGstin}` : 'GSTIN/UIN :', LX + 2, HY + compH + cneeH + 19)

  // ── RIGHT: Invoice detail rows ───────────────────────────────────────────────
  let rry = HY
  const rLbl = (lbl, x, y2) => { st(6.5, 'normal', 100,100,100); tx(lbl, x, y2 + 4) }
  const rVal = (val, x, y2) => { st(7.5, 'bold', 0,0,0); tx(String(val ?? ''), x, y2 + 9) }
  const rDiv = (y2, fullW = false) => { ln(RX, y2, RX + RCW, y2, 0.25); if (!fullW) return; }
  const rMid = (y2, h) => ln(MX, y2, MX, y2 + h, 0.25)

  // Row 1: Invoice No | Invoice Date + Time
  rLbl('Invoice No.', RX + 2, rry); rVal(inv.invoice_number, RX + 2, rry)
  rMid(rry, rh1)
  rLbl('Invoice Date', MX + 2, rry); rVal(fmtDate(inv.invoice_date), MX + 2, rry)
  const tStr = fmtTime(inv.created_at)
  if (tStr) { st(6.5, 'normal', 80,80,80); tx(`Time: ${tStr}`, MX + 2, rry + 13) }
  rry += rh1; rDiv(rry)

  // Row 2: Mode/Terms | Payment Due
  rLbl('Mode/Terms of Payment', RX + 2, rry)
  rVal(inv.payment_type === 'credit' ? 'Credit' : 'Cash', RX + 2, rry)
  rMid(rry, rh2)
  rLbl('Payment Due:', MX + 2, rry)
  rVal(fmtDate(inv.credit_due_date) || fmtDate(inv.invoice_date), MX + 2, rry)
  rry += rh2; rDiv(rry)

  // Row 3: DC No. | Other References
  rLbl('DC.No.', RX + 2, rry); rVal(inv.dc_number || '', RX + 2, rry)
  rMid(rry, rh3)
  rLbl('Other Reference(s)', MX + 2, rry)
  rry += rh3; rDiv(rry)

  // Row 4: PO Details (full width)
  rLbl('PO.Details', RX + 2, rry)
  rry += rh4; rDiv(rry)

  // Row 5: Driver | Motor Vehicle No.
  rLbl('Driver', RX + 2, rry); rVal(inv.driver_name || '', RX + 2, rry)
  rMid(rry, rh5)
  rLbl('Motor Vehicle No.', MX + 2, rry); rVal(inv.vehicle_number || '', MX + 2, rry)
  rry += rh5; rDiv(rry)

  // Row 6: Terms of Delivery (remaining height — no bottom divider, outer box covers it)
  rLbl('Terms of Delivery', RX + 2, rry)

  let y = HY + totH + 4

  // ── ITEMS TABLE ─────────────────────────────────────────────────────────────
  const subtotal  = items.reduce((s, i) => s + Number(i.amount || 0), 0)
  const totalQty  = items.reduce((s, i) => s + Number(i.quantity || 0), 0)
  const grandTotal = Number(inv.total_amount || 0)

  // Build GST rows by rate group
  const gstGroups = {}
  if (isTax) {
    items.forEach(it => {
      const rate = Number(it.gst_rate || 0)
      if (!gstGroups[rate]) gstGroups[rate] = 0
      gstGroups[rate] += Number(it.gst_amount || 0)
    })
  }

  const itemBody = items.map((it, i) => [
    i + 1, it.material_name || '', it.hsn_code || '',
    f(it.quantity), fa(it.rate), (it.unit || 'UNIT').toUpperCase(), fa(it.amount),
  ])

  const taxRows = []
  Object.entries(gstGroups).forEach(([rate, gstAmt]) => {
    taxRows.push(['', '', '', '', `SGST ${Number(rate)/2}%`, '', fa(gstAmt / 2)])
    taxRows.push(['', '', '', '', `CGST ${Number(rate)/2}%`, '', fa(gstAmt / 2)])
  })

  const totalRow = ['', 'Total', '', f(totalQty), '', '', fa(grandTotal)]
  const totalBodyIdx = itemBody.length + taxRows.length

  autoTable(doc, {
    startY: y,
    head: [['S.No', 'Description of\nGoods/Services', 'HSN/SAC', 'Quantity', 'Rate', 'UOM', 'Amount']],
    body: [...itemBody, ...taxRows, totalRow],
    margin: { left: ML, right: MR },
    tableWidth: CW,
    styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 }, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.25, font: 'helvetica' },
    headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: 'bold', fontSize: 7.5, halign: 'center', lineWidth: 0.3 },
    alternateRowStyles: { fillColor: [255,255,255] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 35, halign: 'right' },
    },
    didParseCell: data => {
      const ri = data.row.index
      if (ri >= itemBody.length && ri < totalBodyIdx) {
        // GST rows: rate label right-aligned in rate col
        if (data.column.index === 4) { data.cell.styles.halign = 'right'; data.cell.styles.fontStyle = 'bold' }
      }
      if (ri === totalBodyIdx) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [230, 230, 230]
      }
    },
  })
  y = doc.lastAutoTable.finalY + 4

  // ── AMOUNT IN WORDS ─────────────────────────────────────────────────────────
  st(7.5, 'bold', 0,0,0); tx('Amount in Words', ML, y + 4)
  st(7.5, 'italic', 0,0,0)
  const words = numToWords(grandTotal)
  tx(doc.splitTextToSize(words, CW)[0], ML, y + 9)
  y += 15

  // ── HSN/SAC SUMMARY TABLE ────────────────────────────────────────────────────
  if (isTax) {
    const hsnMap = {}
    items.forEach(it => {
      const key = it.hsn_code || ''
      const rate = Number(it.gst_rate || 0)
      if (!hsnMap[key]) hsnMap[key] = { taxable: 0, gst: 0, rate }
      hsnMap[key].taxable += Number(it.amount || 0)
      hsnMap[key].gst     += Number(it.gst_amount || 0)
    })
    const gRows = Object.entries(hsnMap).map(([hsn, v]) => [
      hsn, fa(v.taxable),
      `SGST ${v.rate/2}%`, fa(v.gst / 2),
      `CGST ${v.rate/2}%`, fa(v.gst / 2),
      fa(v.taxable + v.gst),
    ])
    autoTable(doc, {
      startY: y,
      head: [['HSN/SAC', 'Taxable Value', 'SGST %', 'SGST Amt', 'CGST %', 'CGST Amt', 'Total']],
      body: gRows,
      margin: { left: ML, right: MR },
      tableWidth: CW,
      styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 }, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.25 },
      headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: 'bold', halign: 'center', lineWidth: 0.3 },
      alternateRowStyles: { fillColor: [255,255,255] },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center' },
        1: { cellWidth: 33, halign: 'right' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 32, halign: 'right' },
      },
    })
    y = doc.lastAutoTable.finalY + 4
  }

  // ── DECLARATION ─────────────────────────────────────────────────────────────
  bx(ML, y, CW, 14)
  st(7, 'bold', 0,0,0); tx('Declaration', ML + 2, y + 4)
  st(6.5, 'normal', 40,40,40)
  tx('We declare that this invoice shows the actual price of the goods described and that all particulars are as true and correct.', ML + 2, y + 9, { maxWidth: CW - 4 })
  tx('*This is computer generated invoice no signature required*', ML + 2, y + 13)
  y += 18

  // Notes (optional)
  if (inv.notes) {
    st(7, 'bold', 0,0,0); tx('Note:', ML, y)
    st(7, 'italic', 60,60,60); tx(doc.splitTextToSize(inv.notes, CW - 15)[0], ML + 12, y)
    y += 6
  }

  // ── FOOTER: BANK DETAILS + SIGNATURE ────────────────────────────────────────
  const footY = y
  const bankW = 115, sigFW = CW - bankW
  const footH = 32
  bx(ML, footY, CW, footH)
  ln(ML + bankW, footY, ML + bankW, footY + footH, 0.3)

  st(7.5, 'bold', 0,0,0); tx('COMPANY BANK DETAILS', ML + 2, footY + 5)
  st(7.5, 'normal', 20,20,20)
  let bly = footY + 10
  if (companyInfo.bank_name)           { tx(`Bank Name :${companyInfo.bank_name}`, ML + 2, bly); bly += 4 }
  if (companyInfo.bank_account_number) { tx(`A/C No. : ${companyInfo.bank_account_number}`, ML + 2, bly); bly += 4 }
  if (companyInfo.bank_branch || companyInfo.bank_ifsc)
    { tx(`Branch & IFSC :${[companyInfo.bank_branch, companyInfo.bank_ifsc].filter(Boolean).join(' ')}`, ML + 2, bly); bly += 4 }
  if (companyInfo.upi_id) tx(`Google Pay No / Phone Pay No : ${companyInfo.upi_id}`, ML + 2, bly)

  const sigX2 = ML + bankW
  st(7.5, 'normal', 60,60,60)
  tx(`For ${companyInfo.name || 'GVR M Sand'}`, sigX2 + sigFW / 2, footY + 8, { align: 'center' })
  ln(sigX2 + 4, footY + footH - 6, sigX2 + sigFW - 4, footY + footH - 6, 0.25)
  st(7, 'normal', 60,60,60)
  tx('Authorised Signatory', sigX2 + sigFW / 2, footY + footH - 2, { align: 'center' })

  // ── COPYRIGHT ────────────────────────────────────────────────────────────────
  st(7, 'normal', 80,80,80)
  tx(`${companyInfo.name || 'GVR M Sand'} - Copyright ${new Date().getFullYear()}`, W / 2, footY + footH + 6, { align: 'center' })

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

// ── Record Payment Modal ──────────────────────────────────────────────────────
function RecordPaymentModal({ companyId, invoice, onClose }) {
  const qc = useQueryClient()
  const today   = new Date().toISOString().split('T')[0]
  const balance = Math.max(0, Number(invoice.balance ?? invoice.total_amount) )

  const [cashAmount,     setCashAmount]     = useState(balance.toFixed(2))
  const [mode,           setMode]           = useState(invoice.payment_mode || 'cash')
  const [date,           setDate]           = useState(today)
  const [useAdvance,     setUseAdvance]     = useState(false)
  const [advanceApplied, setAdvanceApplied] = useState('0')
  const [saving,         setSaving]         = useState(false)

  // Fetch client's advance balance
  const { data: advanceBalance = 0 } = useQuery({
    queryKey: ['crusher-client-advance', companyId, invoice.client_id],
    queryFn: async () => {
      if (!invoice.client_id) return 0
      const { data } = await supabase.from('crusher_customer_advances')
        .select('remaining').eq('company_id', companyId)
        .eq('client_id', invoice.client_id).gt('remaining', 0)
      return (data || []).reduce((s, r) => s + Number(r.remaining), 0)
    },
    enabled: !!invoice.client_id,
  })

  const handleToggleAdvance = (on) => {
    setUseAdvance(on)
    if (on) {
      const maxAdv = Math.min(advanceBalance, balance)
      setAdvanceApplied(maxAdv.toFixed(2))
      setCashAmount(Math.max(0, balance - maxAdv).toFixed(2))
    } else {
      setAdvanceApplied('0')
      setCashAmount(balance.toFixed(2))
    }
  }

  const cash  = Math.max(0, parseFloat(cashAmount) || 0)
  const adv   = useAdvance ? Math.max(0, parseFloat(advanceApplied) || 0) : 0
  const total = cash + adv

  const handleSave = async () => {
    if (total <= 0)                   { toast.error('Enter a valid amount'); return }
    if (total > balance + 0.01)       { toast.error(`Total exceeds balance of ₹${balance.toFixed(2)}`); return }
    if (adv > advanceBalance + 0.01)  { toast.error(`Advance exceeds available ₹${advanceBalance.toFixed(2)}`); return }

    const prevPaid   = Number(invoice.paid_amount || 0)
    const newPaid    = prevPaid + total
    const newBalance = Math.max(0, Number(invoice.total_amount) - newPaid)
    const newStatus  = newBalance <= 0.01 ? 'paid' : 'partial'

    setSaving(true)
    try {
      // 1. Update invoice
      const { error } = await supabase.from('crusher_invoices').update({
        paid_amount:  newPaid,
        balance:      newBalance,
        status:       newStatus,
        payment_mode: cash > 0 ? mode : 'advance',
      }).eq('id', invoice.id)
      if (error) throw error

      // 2. Cash/bank payment record
      if (cash > 0) {
        await supabase.from('crusher_invoice_payments').insert({
          company_id:   companyId,
          invoice_id:   invoice.id,
          client_id:    invoice.client_id  || null,
          client_name:  invoice.client_name || null,
          amount:       cash,
          payment_mode: mode,
          payment_date: date,
        })
      }

      // 3. Advance payment record + deduct from balance
      if (adv > 0) {
        await supabase.from('crusher_invoice_payments').insert({
          company_id:   companyId,
          invoice_id:   invoice.id,
          client_id:    invoice.client_id  || null,
          client_name:  invoice.client_name || null,
          amount:       adv,
          payment_mode: 'advance',
          payment_date: date,
          notes:        'Applied from advance balance',
        })
        // Deduct from advance records FIFO
        const { data: advRecs } = await supabase.from('crusher_customer_advances')
          .select('id, remaining').eq('company_id', companyId)
          .eq('client_id', invoice.client_id).gt('remaining', 0).order('created_at')
        let toDeduct = adv
        for (const rec of (advRecs || [])) {
          if (toDeduct <= 0) break
          const cut = Math.min(toDeduct, Number(rec.remaining))
          await supabase.from('crusher_customer_advances')
            .update({ remaining: Number(rec.remaining) - cut }).eq('id', rec.id)
          toDeduct -= cut
        }
      }

      const parts = []
      if (cash > 0) parts.push(`₹${cash.toFixed(2)} cash`)
      if (adv  > 0) parts.push(`₹${adv.toFixed(2)} advance`)
      toast.success(`${parts.join(' + ')} applied — invoice ${newStatus}`)
      qc.invalidateQueries({ queryKey: ['crusher-invoices',       companyId] })
      qc.invalidateQueries({ queryKey: ['crusher-aging',          companyId] })
      qc.invalidateQueries({ queryKey: ['crusher-advances',       companyId] })
      qc.invalidateQueries({ queryKey: ['crusher-client-advance', companyId, invoice.client_id] })
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Record Payment · ${invoice.invoice_number}`} onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-dark-700 text-slate-300 hover:bg-dark-600">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirm Payment
          </button>
        </>
      }>

      {/* Invoice summary */}
      <div className="bg-dark-800 rounded-xl p-4 border border-dark-600 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Invoice Total</p>
          <p className="text-sm font-bold text-slate-200">₹{Number(invoice.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500">Already Paid</p>
          <p className="text-sm font-semibold text-emerald-400">₹{Number(invoice.paid_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Outstanding</p>
          <p className="text-lg font-black text-red-400">₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Advance section — only when client has balance */}
      {advanceBalance > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-amber-400">Advance Available</p>
              <p className="text-sm font-bold text-amber-300">₹{advanceBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
            <button type="button" onClick={() => handleToggleAdvance(!useAdvance)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                useAdvance ? 'bg-amber-500 text-white' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              }`}>
              {useAdvance ? '✓ Applied' : 'Apply Advance'}
            </button>
          </div>
          {useAdvance && (
            <div>
              <label className="text-[11px] text-amber-400/80 mb-1 block">Amount from advance (₹)</label>
              <input type="number" step="0.01" min="0" max={Math.min(advanceBalance, balance)}
                className={inp()}
                value={advanceApplied}
                onChange={e => {
                  setAdvanceApplied(e.target.value)
                  setCashAmount(Math.max(0, balance - (parseFloat(e.target.value) || 0)).toFixed(2))
                }} />
            </div>
          )}
        </div>
      )}

      {/* Cash / bank entry */}
      <Field label={useAdvance && adv > 0 ? 'Additional Cash / Bank Payment (₹)' : 'Amount Received (₹)'} required={!useAdvance}>
        <input type="number" className={inp()} value={cashAmount}
          onChange={e => setCashAmount(e.target.value)}
          step="0.01" min="0" placeholder="0.00" />
      </Field>

      {cash > 0 && (
        <Field label="Payment Mode">
          <select className={inp()} value={mode} onChange={e => setMode(e.target.value)}>
            {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
      )}

      <Field label="Payment Date">
        <input type="date" className={inp()} value={date} onChange={e => setDate(e.target.value)} />
      </Field>

      {/* Breakdown when advance is used */}
      {useAdvance && total > 0 && (
        <div className="bg-dark-700 rounded-lg border border-dark-600 p-3 space-y-1.5">
          {adv  > 0 && <div className="flex justify-between text-xs"><span className="text-amber-400">From advance</span><span className="font-semibold text-amber-300">₹{adv.toFixed(2)}</span></div>}
          {cash > 0 && <div className="flex justify-between text-xs"><span className="text-slate-400">Cash / Bank</span><span className="font-semibold text-slate-200">₹{cash.toFixed(2)}</span></div>}
          <div className="flex justify-between text-sm border-t border-dark-600 pt-1.5">
            <span className="font-bold text-slate-200">Total Applied</span>
            <span className="font-black text-emerald-400">₹{total.toFixed(2)}</span>
          </div>
          {total < balance - 0.01 && (
            <p className="text-[10px] text-yellow-400">₹{(balance - total).toFixed(2)} will remain outstanding</p>
          )}
        </div>
      )}

      {!useAdvance && cash < balance - 0.01 && cash > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs text-yellow-400">
          Partial payment — ₹{(balance - cash).toFixed(2)} will remain outstanding.
        </div>
      )}
    </Modal>
  )
}

// ── Invoice Edit Modal ────────────────────────────────────────────────────────
function InvoiceEditModal({ companyId, invoice, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    invoice_type:    invoice.invoice_type,
    invoice_date:    invoice.invoice_date,
    payment_type:    invoice.payment_type,
    payment_mode:    invoice.payment_mode || 'cash',
    credit_due_date: invoice.credit_due_date || '',
    loading_point:     invoice.loading_point     || '',
    unloading_point:   invoice.unloading_point   || '',
    unloading_address: invoice.unloading_address || '',
    driver_name:       invoice.driver_name       || '',
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
        .select('id, grade_name, hsn_code, default_gst_rate, default_rate, default_uom')
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

  // Delivery sites for this invoice's client
  const { data: editClientSites = [] } = useQuery({
    queryKey: ['crusher-client-sites', companyId, invoice.client_id],
    queryFn: async () => {
      if (!invoice.client_id) return []
      const { data } = await supabase.from('crusher_client_sites')
        .select('id, site_name, address')
        .eq('company_id', companyId).eq('client_id', invoice.client_id)
        .eq('is_active', true).order('sort_order')
      return data || []
    },
    enabled: !!invoice.client_id,
  })

  // Per-client rate overrides for edit modal
  const { data: editClientRates = [] } = useQuery({
    queryKey: ['crusher-client-rates', companyId, invoice.client_id],
    queryFn: async () => {
      if (!invoice.client_id) return []
      const { data } = await supabase.from('crusher_client_rates')
        .select('grade_id, custom_rate')
        .eq('company_id', companyId).eq('client_id', invoice.client_id).eq('is_active', true)
      return data || []
    },
    enabled: !!invoice.client_id,
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
    const g          = grades.find(x => x.id === gradeId)
    const clientRate = editClientRates.find(r => r.grade_id === gradeId)
    setItems(p => p.map((it, idx) => idx === i ? {
      ...it,
      grade_id:      gradeId,
      material_name: g?.grade_name  || '',
      hsn_code:      g?.hsn_code    || '',
      unit:          g?.default_uom || it.unit || 'tonnes',
      rate: clientRate
        ? String(clientRate.custom_rate)
        : g?.default_rate ? String(g.default_rate) : it.rate,
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
        loading_point:     form.loading_point     || null,
        unloading_point:   form.unloading_point   || null,
        unloading_address: form.unloading_address || null,
        driver_name:       form.driver_name.trim() || null,
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

      {/* Driver Name */}
      <Field label="Driver Name">
        <input className={inp()} value={form.driver_name}
          onChange={e => set('driver_name', e.target.value)}
          placeholder="e.g. Murugan, Rajan…" />
      </Field>

      {/* Loading / Unloading */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loading Point">
          <Autocomplete
            freeText
            options={loadingPoints.filter(p => p.point_type !== 'unloading').map(p => ({ value: p.point_name, label: p.point_name }))}
            value={form.loading_point}
            onChange={val => set('loading_point', val)}
            placeholder="Search or type loading point…"
          />
        </Field>
        <Field label="Unloading Point">
          {editClientSites.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {editClientSites.map(site => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => {
                    set('unloading_point', site.site_name)
                    set('unloading_address', site.address || '')
                  }}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    form.unloading_point === site.site_name
                      ? 'bg-primary-600 border-primary-500 text-white'
                      : 'bg-dark-700 border-dark-600 text-dark-300 hover:border-primary-500'
                  }`}
                >
                  {site.site_name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { set('unloading_point', ''); set('unloading_address', '') }}
                className="px-2.5 py-1 rounded text-xs border border-dark-600 bg-dark-700 text-dark-400 hover:border-dark-500"
              >
                Clear
              </button>
            </div>
          )}
          <Autocomplete
            freeText
            options={loadingPoints.filter(p => p.point_type !== 'loading').map(p => ({ value: p.point_name, label: p.point_name }))}
            value={form.unloading_point}
            onChange={val => set('unloading_point', val)}
            placeholder="Search or type unloading point…"
          />
          <input className={`${inp()} mt-2`} value={form.unloading_address}
            onChange={e => set('unloading_address', e.target.value)}
            placeholder="Delivery address (auto-fills from site or type manually)" />
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
                <Autocomplete
                  options={grades.map(g => ({ value: g.id, label: g.grade_name }))}
                  value={item.grade_id}
                  onChange={val => handleGradeChange(i, val)}
                  placeholder="Search grade…"
                />
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

// ── Invoices Tab ──────────────────────────────────────────────────────────────
function InvoicesTab({ companyId }) {
  const qc = useQueryClient()
  const { role } = useAuth()
  const canDirectCreate = ['admin', 'superadmin', 'manager'].includes(role)

  const [createOpen, setCreateOpen] = useState(false)
  const [viewId,     setViewId]     = useState(null)
  const [editInv,    setEditInv]    = useState(null)
  const [payInv,     setPayInv]     = useState(null)

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
        .select('id, invoice_number, invoice_type, invoice_date, client_id, client_name, vehicle_number, driver_name, payment_type, status, total_amount, subtotal, total_tax, balance, paid_amount, credit_due_date, payment_mode, loading_point, unloading_point, unloading_address, notes')
        .eq('company_id', companyId)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) { console.error(error); return [] }
      return data || []
    },
  })

  const statusColor = { issued: 'blue', paid: 'green', partial: 'yellow', overdue: 'red', draft: 'slate', void: 'slate' }

  // Credit limits per client — used to flag over-limit clients in the list
  const { data: creditLimits = {} } = useQuery({
    queryKey: ['crusher-credit-limits', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_settings')
        .select('client_id, credit_limit')
        .eq('company_id', companyId)
        .gt('credit_limit', 0)
      const map = {}
      ;(data || []).forEach(r => { map[r.client_id] = Number(r.credit_limit) })
      return map
    },
  })

  // Compute outstanding per client from current invoice list (live, no extra fetch)
  const outstandingByClient = invoices.reduce((acc, inv) => {
    if (inv.status === 'void' || !inv.client_id) return acc
    const bal = Number(inv.balance || 0)
    if (bal > 0) acc[inv.client_id] = (acc[inv.client_id] || 0) + bal
    return acc
  }, {})

  const handleVoid = async (inv) => {
    const isVoided  = inv.status === 'void'
    const paidAmt   = Number(inv.paid_amount || 0)
    const clientLabel = inv.client_name || 'Walk-in customer'

    if (isVoided) {
      // Re-activating — warn if a credit was previously created
      if (!window.confirm(`Re-activate invoice ${inv.invoice_number}?\n\nNote: any advance credit created when this was voided will be removed.`)) return
      // Remove the advance credit that was auto-created on void
      await supabase.from('crusher_customer_advances')
        .delete().eq('reference_invoice_id', inv.id)
      const { error } = await supabase.from('crusher_invoices')
        .update({ status: 'issued', paid_amount: paidAmt, balance: Number(inv.total_amount) - paidAmt })
        .eq('id', inv.id)
      if (error) { toast.error(error.message); return }
      toast.success('Invoice re-activated')
      qc.invalidateQueries({ queryKey: ['crusher-invoices', companyId] })
      return
    }

    // Voiding — build confirmation message based on whether payment exists
    const msg = paidAmt > 0
      ? `⚠️ Cancel invoice ${inv.invoice_number}?\n\nRs. ${paidAmt.toFixed(2)} already received will be credited to "${clientLabel}" as ADVANCE RECEIVED.\n\nYou can apply this advance against their next invoice.`
      : `Void invoice ${inv.invoice_number}? It will be marked as cancelled.`
    if (!window.confirm(msg)) return

    // If payment exists → create advance credit before voiding
    if (paidAmt > 0) {
      const { error: advErr } = await supabase.from('crusher_customer_advances').insert({
        company_id:               companyId,
        client_id:                inv.client_id || null,
        client_name:              clientLabel,
        amount:                   paidAmt,
        remaining:                paidAmt,
        source:                   'voided_invoice',
        reference_invoice_id:     inv.id,
        reference_invoice_number: inv.invoice_number,
        notes: `Payment of Rs. ${paidAmt.toFixed(2)} credited from voided invoice ${inv.invoice_number}`,
      })
      if (advErr) { toast.error('Could not create advance credit: ' + advErr.message); return }
    }

    const { error } = await supabase.from('crusher_invoices')
      .update({ status: 'void' }).eq('id', inv.id)
    if (error) { toast.error(error.message); return }

    toast.success(paidAmt > 0
      ? `Invoice voided — Rs. ${paidAmt.toFixed(2)} credited as advance for ${clientLabel}`
      : 'Invoice voided')
    qc.invalidateQueries({ queryKey: ['crusher-invoices', companyId] })
    qc.invalidateQueries({ queryKey: ['crusher-advances', companyId] })
  }

  const handleDelete = async (inv) => {
    // Block deletion if payment recorded and invoice not yet voided
    if (Number(inv.paid_amount || 0) > 0 && inv.status !== 'void') {
      toast.error(
        `Cannot delete — Rs. ${Number(inv.paid_amount).toFixed(2)} payment recorded.\n` +
        `Void the invoice first. The payment will be credited to the customer as advance.`,
        { duration: 6000 }
      )
      return
    }
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
      // Company details (fetch all fields for PDF — missing cols return null gracefully)
      const { data: co } = await supabase.from('companies')
        .select('name, address, phone, phone2, office_phone, email, gstin, msme, bank_name, bank_account_number, bank_branch, bank_ifsc, upi_id, logo_url')
        .eq('id', companyId).single()
      const companyInfo = co || { name: company?.name }
      // Client details (if registered, not walk-in)
      let clientInfo = null
      if (inv.client_id) {
        const { data: cl } = await supabase.from('clients')
          .select('display_name, business_name, registered_address, contact_phone, contact_email, gstin')
          .eq('id', inv.client_id).single()
        clientInfo = cl
      }
      await downloadCrusherPDF(inv, lineItems, companyInfo, clientInfo)
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
        {canDirectCreate ? (
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-all">
            <Plus className="w-4 h-4" /> Create Invoice
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-xs text-slate-400">
            <ClipboardCheck className="w-4 h-4 text-primary-400 flex-shrink-0" />
            Convert a token to create an invoice
          </div>
        )}
      </div>

      {/* Token-first workflow hint for non-admin users */}
      {!canDirectCreate && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-primary-500/10 border border-primary-500/20">
          <AlertCircle className="w-4 h-4 text-primary-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-primary-300">Token-first workflow</p>
            <p className="text-xs text-slate-400 mt-0.5">All invoices must come from a token. Go to the <strong className="text-slate-300">Tokens</strong> tab, find the token, and use <strong className="text-slate-300">Convert to Invoice</strong>.</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading invoices…
        </div>
      )}

      {!isLoading && invoices.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-500">No invoices yet.</p>
          {canDirectCreate ? (
            <button onClick={() => setCreateOpen(true)}
              className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">
              Create First Invoice
            </button>
          ) : (
            <p className="text-xs text-slate-600">Convert a token from the Tokens tab to generate invoices.</p>
          )}
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
                    {inv.payment_type === 'credit' && inv.client_id && creditLimits[inv.client_id] &&
                      outstandingByClient[inv.client_id] > creditLimits[inv.client_id] && inv.status !== 'void' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                        <AlertCircle className="w-2.5 h-2.5" /> Over Limit
                      </span>
                    )}
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
                {inv.status !== 'void' && Number(inv.balance || 0) > 0 && (
                  <button onClick={() => setPayInv(inv)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all">
                    <CheckCircle className="w-3.5 h-3.5" /> Record Payment
                  </button>
                )}
                {inv.status !== 'void' && Number(inv.paid_amount || 0) === 0 && (
                  <button onClick={() => setEditInv(inv)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-dark-600 transition-all">
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                {inv.status !== 'void' && Number(inv.paid_amount || 0) === 0 && (
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

      {createOpen && <InvoiceFormModal     companyId={companyId} onClose={() => setCreateOpen(false)} />}
      {viewId    && <InvoiceViewModal     invoiceId={viewId}   onClose={() => setViewId(null)} onDownload={handleDownload} />}
      {editInv   && <InvoiceEditModal     companyId={companyId} invoice={editInv} onClose={() => setEditInv(null)} />}
      {payInv    && <RecordPaymentModal   companyId={companyId} invoice={payInv} onClose={() => setPayInv(null)} />}
    </div>
  )
}

// ── Quick Add / Edit Client Modal ────────────────────────────────────────────
// ── Client Modal (unified — profile + credit + defaults + bank) ───────────────
const CLIENT_CATEGORIES = ['Contractor', 'Builder', 'Government', 'Retail', 'Wholesale', 'Other']

function ClientModal({ companyId, existing, onClose }) {
  const qc     = useQueryClient()
  const isEdit = !!existing?.id

  // ── form state ──
  const [form, setForm] = useState({
    // Identity
    display_name:       existing?.display_name || existing?.business_name || '',
    client_category:    existing?.client_category  || 'Contractor',
    contact_person:     existing?.contact_person   || '',
    contact_phone:      existing?.contact_phone    || '',
    contact_phone2:     existing?.contact_phone2   || '',
    contact_email:      existing?.contact_email    || '',
    gstin:              existing?.gstin            || '',
    pan:                existing?.pan              || '',
    // Address
    registered_address: existing?.registered_address || '',
    // Credit & Defaults
    credit_period_days:        '',
    credit_limit:              '',
    statement_type:            'monthly',  // none | monthly | interval
    statement_day:             '',
    statement_interval_days:   '',
    payment_due_days:          '7',
    default_grade_id:          '',
    notes:                     '',
    // Bank & Finance
    opening_balance:      existing?.opening_balance ?? '',
    bank_name:            existing?.bank_name            || '',
    bank_account_number:  existing?.bank_account_number  || '',
    bank_ifsc:            existing?.bank_ifsc            || '',
  })
  const [settingsId, setSettingsId] = useState(null)  // existing crusher_client_settings id
  const [sites, setSites]           = useState([])     // delivery sites array
  const [rates, setRates]           = useState([])     // per-client rate overrides
  const [saving, setSaving]         = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Site helpers
  const addSite = () => setSites(p => [...p, { _tempId: Date.now(), site_name: '', address: '', _new: true }])
  const removeSite = (idx) => setSites(p => p.map((s, i) => i === idx ? { ...s, _deleted: true } : s))
  const updateSite = (idx, field, val) => setSites(p => p.map((s, i) => i === idx ? { ...s, [field]: val } : s))

  // Rate override helpers
  const addRate    = () => setRates(p => [...p, { _tempId: Date.now(), grade_id: '', custom_rate: '', notes: '', _new: true }])
  const removeRate = (idx) => setRates(p => p.map((r, i) => i === idx ? { ...r, _deleted: true } : r))
  const updateRate = (idx, field, val) => setRates(p => p.map((r, i) => i === idx ? { ...r, [field]: val } : r))

  // Load existing crusher_client_settings + delivery sites when editing
  useEffect(() => {
    if (!existing?.id) return
    // Load settings
    supabase.from('crusher_client_settings')
      .select('*').eq('company_id', companyId).eq('client_id', existing.id).single()
      .then(({ data }) => {
        if (!data) return
        setSettingsId(data.id)
        setForm(p => ({
          ...p,
          credit_period_days:      data.credit_period_days      != null ? String(data.credit_period_days)      : '',
          credit_limit:            data.credit_limit            != null ? String(data.credit_limit)            : '',
          statement_type:          data.statement_type          || 'monthly',
          statement_day:           data.statement_day           != null ? String(data.statement_day)           : '',
          statement_interval_days: data.statement_interval_days != null ? String(data.statement_interval_days) : '',
          payment_due_days:        data.payment_due_days        != null ? String(data.payment_due_days)        : '7',
          default_grade_id:        data.default_grade_id        || '',
          notes:                   data.notes                   || '',
        }))
      })
    // Load delivery sites
    supabase.from('crusher_client_sites')
      .select('id, site_name, address, sort_order')
      .eq('company_id', companyId).eq('client_id', existing.id)
      .eq('is_active', true).order('sort_order')
      .then(({ data }) => { if (data) setSites(data) })
    // Load rate overrides
    supabase.from('crusher_client_rates')
      .select('id, grade_id, custom_rate, notes')
      .eq('company_id', companyId).eq('client_id', existing.id).eq('is_active', true)
      .then(({ data }) => { if (data) setRates(data) })
  }, [existing?.id, companyId])

  // Grades for default grade selector
  const { data: grades = [] } = useQuery({
    queryKey: ['crusher-grades', companyId],
    queryFn:  async () => {
      const { data } = await supabase.from('crusher_grades')
        .select('id, grade_name').eq('company_id', companyId).eq('is_active', true).order('grade_name')
      return data || []
    },
  })

  const handleSave = async () => {
    if (!form.display_name.trim()) { toast.error('Client name is required'); return }
    setSaving(true)
    try {
      // 1 — Save / update client record
      const clientPayload = {
        company_id:          companyId,
        display_name:        form.display_name.trim(),
        business_name:       form.display_name.trim(),
        client_category:     form.client_category || null,
        contact_person:      form.contact_person.trim()  || null,
        contact_phone:       form.contact_phone.trim()   || null,
        contact_phone2:      form.contact_phone2.trim()  || null,
        contact_email:       form.contact_email.trim()   || null,
        gstin:               form.gstin.trim().toUpperCase() || null,
        pan:                 form.pan.trim().toUpperCase()   || null,
        registered_address:  form.registered_address.trim() || null,
        opening_balance:     form.opening_balance !== '' ? Number(form.opening_balance) : 0,
        bank_name:           form.bank_name.trim()           || null,
        bank_account_number: form.bank_account_number.trim() || null,
        bank_ifsc:           form.bank_ifsc.trim().toUpperCase() || null,
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

      // 2 — Save crusher_client_settings (always upsert)
      const settingsPayload = {
        company_id:              companyId,
        client_id:               clientId,
        credit_period_days:      form.credit_period_days ? Number(form.credit_period_days) : 30,
        credit_limit:            form.credit_limit !== '' ? Number(form.credit_limit) : null,
        statement_type:          form.statement_type || 'monthly',
        statement_day:           form.statement_type === 'monthly' && form.statement_day ? Number(form.statement_day) : null,
        statement_interval_days: form.statement_type === 'interval' && form.statement_interval_days ? Number(form.statement_interval_days) : null,
        payment_due_days:        Number(form.payment_due_days) || 7,
        default_grade_id:        form.default_grade_id || null,
        notes:                   form.notes || null,
        updated_at:              new Date().toISOString(),
      }
      const { error: sErr } = await supabase.from('crusher_client_settings')
        .upsert(settingsPayload, { onConflict: 'company_id,client_id' })
      if (sErr) throw sErr

      // 3 — Save delivery sites: delete removed, insert new
      const toDelete = sites.filter(s => s._deleted && s.id)
      const toInsert = sites.filter(s => s._new && !s._deleted && s.site_name.trim())
      if (toDelete.length) {
        const { error: dErr } = await supabase.from('crusher_client_sites')
          .delete().in('id', toDelete.map(s => s.id))
        if (dErr) throw dErr
      }
      if (toInsert.length) {
        const { error: iErr } = await supabase.from('crusher_client_sites')
          .insert(toInsert.map((s, i) => ({
            company_id: companyId,
            client_id:  clientId,
            site_name:  s.site_name.trim(),
            address:    s.address.trim() || null,
            sort_order: (sites.filter(x => !x._deleted && !x._new).length) + i,
          })))
        if (iErr) throw iErr
      }

      // 4 — Save rate overrides: delete removed, upsert active ones
      const ratesToDelete = rates.filter(r => r._deleted && r.id)
      const ratesToUpsert = rates.filter(r => !r._deleted && r.grade_id && r.custom_rate !== '')
      if (ratesToDelete.length) {
        await supabase.from('crusher_client_rates').delete().in('id', ratesToDelete.map(r => r.id))
      }
      if (ratesToUpsert.length) {
        const { error: rErr } = await supabase.from('crusher_client_rates').upsert(
          ratesToUpsert.map(r => ({
            ...(r.id ? { id: r.id } : {}),
            company_id:  companyId,
            client_id:   clientId,
            grade_id:    r.grade_id,
            custom_rate: Number(r.custom_rate),
            notes:       r.notes || null,
            is_active:   true,
          })),
          { onConflict: 'company_id,client_id,grade_id' }
        )
        if (rErr) throw rErr
      }

      await qc.invalidateQueries({ queryKey: ['clients', companyId] })
      await qc.invalidateQueries({ queryKey: ['crusher_client_settings', companyId] })
      await qc.invalidateQueries({ queryKey: ['crusher-client-sites', companyId] })
      await qc.invalidateQueries({ queryKey: ['crusher-client-rates', companyId] })
      toast.success(isEdit ? 'Client updated' : 'Client added')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally { setSaving(false) }
  }

  const SectionHead = ({ label }) => (
    <div className="text-[11px] font-bold uppercase tracking-widest text-primary-400 border-b border-dark-600 pb-1 mb-3 mt-1">
      {label}
    </div>
  )

  return (
    <Modal
      title={isEdit ? `Edit Client — ${existing.display_name || existing.business_name}` : 'Add New Client'}
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
      {/* ── 1. Identity ── */}
      <SectionHead label="Identity" />
      <Field label="Company / Client Name" required>
        <input className={inp()} value={form.display_name}
          onChange={e => set('display_name', e.target.value)} placeholder="e.g. SRA Mining and Constructions" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className={inp()} value={form.client_category} onChange={e => set('client_category', e.target.value)}>
            {CLIENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Contact Person">
          <input className={inp()} value={form.contact_person}
            onChange={e => set('contact_person', e.target.value)} placeholder="e.g. Ramesh Kumar (Site Mgr)" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone (Primary)">
          <input className={inp()} value={form.contact_phone}
            onChange={e => set('contact_phone', e.target.value)} placeholder="9443157573" />
        </Field>
        <Field label="Phone (Alternate / Accounts)">
          <input className={inp()} value={form.contact_phone2}
            onChange={e => set('contact_phone2', e.target.value)} placeholder="9842424204" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email">
          <input type="email" className={inp()} value={form.contact_email}
            onChange={e => set('contact_email', e.target.value)} placeholder="billing@example.com" />
        </Field>
        <Field label="GSTIN">
          <input className={inp('font-mono')} value={form.gstin}
            onChange={e => set('gstin', e.target.value.toUpperCase())}
            placeholder="33AAAAA0000A1Z5" maxLength={15} />
        </Field>
      </div>
      <Field label="PAN">
        <input className={inp('font-mono w-48')} value={form.pan}
          onChange={e => set('pan', e.target.value.toUpperCase())}
          placeholder="AAAPL1234C" maxLength={10} />
      </Field>

      {/* ── 2. Address ── */}
      <SectionHead label="Address" />
      <Field label="Billing / Registered Address">
        <textarea className={inp()} rows={2} value={form.registered_address}
          onChange={e => set('registered_address', e.target.value)}
          placeholder="Full billing address — appears on invoice Buyer (Bill to) block" />
      </Field>
      {/* Multi-site delivery address manager */}
      <div className="mb-3">
        <div className="text-[11px] font-semibold text-dark-400 uppercase tracking-wide mb-2">
          Delivery Sites
          <span className="ml-1 font-normal text-dark-500 normal-case">(invoice Unloading Point picker will list these)</span>
        </div>
        <div className="space-y-2">
          {sites.filter(s => !s._deleted).map((site, idx) => {
            const realIdx = sites.indexOf(site)
            return (
              <div key={site.id || site._tempId} className="flex gap-2 items-start bg-dark-700 rounded p-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    className={inp('text-sm')}
                    value={site.site_name}
                    onChange={e => updateSite(realIdx, 'site_name', e.target.value)}
                    placeholder="Site name (e.g. Kumbakonam Site)"
                  />
                  <input
                    className={inp('text-sm')}
                    value={site.address || ''}
                    onChange={e => updateSite(realIdx, 'address', e.target.value)}
                    placeholder="Full delivery address (optional)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSite(realIdx)}
                  className="p-1 text-red-400 hover:text-red-300 hover:bg-dark-600 rounded mt-0.5"
                  title="Remove site"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={addSite}
          className="mt-2 flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
        >
          <Plus className="w-3.5 h-3.5" /> Add delivery site
        </button>
      </div>

      {/* ── 3. Credit & Defaults ── */}
      <SectionHead label="Credit & Billing Defaults" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Credit Period (days)">
          <input type="number" className={inp()} value={form.credit_period_days}
            onChange={e => set('credit_period_days', e.target.value)} placeholder="30" min={1} />
        </Field>
        <Field label="Credit Limit (Rs.) — max outstanding">
          <input type="number" className={inp()} value={form.credit_limit}
            onChange={e => set('credit_limit', e.target.value)} placeholder="e.g. 200000" min={0} />
        </Field>
      </div>

      {/* Statement schedule */}
      <Field label="Statement Schedule">
        <div className="flex gap-2 flex-wrap">
          {[
            { val: 'none',     label: 'No Statement' },
            { val: 'monthly',  label: 'Monthly (Fixed Day)' },
            { val: 'interval', label: 'Every N Days' },
          ].map(opt => (
            <button
              key={opt.val}
              type="button"
              onClick={() => set('statement_type', opt.val)}
              className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                form.statement_type === opt.val
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'bg-dark-700 border-dark-600 text-dark-300 hover:border-primary-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>
      {form.statement_type === 'monthly' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day of Month (1–28)">
            <input type="number" className={inp()} value={form.statement_day}
              onChange={e => set('statement_day', e.target.value)} placeholder="e.g. 1, 5, 15" min={1} max={28} />
          </Field>
          <Field label="Payment Due (days after statement)">
            <input type="number" className={inp()} value={form.payment_due_days}
              onChange={e => set('payment_due_days', e.target.value)} placeholder="7" min={0} />
          </Field>
        </div>
      )}
      {form.statement_type === 'interval' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interval (days) — e.g. 10, 15, 30">
            <input type="number" className={inp()} value={form.statement_interval_days}
              onChange={e => set('statement_interval_days', e.target.value)} placeholder="e.g. 15" min={1} max={90} />
          </Field>
          <Field label="Payment Due (days after statement)">
            <input type="number" className={inp()} value={form.payment_due_days}
              onChange={e => set('payment_due_days', e.target.value)} placeholder="7" min={0} />
          </Field>
        </div>
      )}
      {form.statement_type === 'none' && (
        <Field label="Payment Due (days from invoice date)">
          <input type="number" className={inp('w-36')} value={form.payment_due_days}
            onChange={e => set('payment_due_days', e.target.value)} placeholder="7" min={0} />
        </Field>
      )}

      <Field label="Default Material Grade (auto-fills on invoice)">
        <select className={inp()} value={form.default_grade_id} onChange={e => set('default_grade_id', e.target.value)}>
          <option value="">— None —</option>
          {grades.map(g => <option key={g.id} value={g.id}>{g.grade_name}</option>)}
        </select>
      </Field>
      <Field label="Notes">
        <textarea className={inp()} rows={2} value={form.notes}
          onChange={e => set('notes', e.target.value)} placeholder="Billing notes, special terms…" />
      </Field>

      {/* ── 4. Rate Overrides ── */}
      <SectionHead label="Custom Rate Overrides" />
      {!isEdit ? (
        <p className="text-xs text-slate-500 italic mb-3">Save the client first, then re-open to set custom rates.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {rates.filter(r => !r._deleted).length === 0 && (
            <p className="text-xs text-slate-500 italic">No overrides set — default grade rates apply.</p>
          )}
          {rates.filter(r => !r._deleted).map((rate, idx) => {
            const realIdx = rates.indexOf(rate)
            return (
              <div key={rate.id || rate._tempId} className="flex gap-2 items-center bg-dark-700 rounded-lg p-2 border border-dark-600">
                <Autocomplete
                  className="flex-1"
                  options={grades.map(g => ({ value: g.id, label: g.grade_name }))}
                  value={rate.grade_id}
                  onChange={val => updateRate(realIdx, 'grade_id', val)}
                  placeholder="Search grade…"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">Rs.</span>
                  <input
                    type="number"
                    className={`${inp('text-sm font-mono w-24')}`}
                    value={rate.custom_rate}
                    onChange={e => updateRate(realIdx, 'custom_rate', e.target.value)}
                    placeholder="Rate"
                    step="0.01" min="0"
                  />
                </div>
                <input
                  className={`${inp('text-sm')} flex-1`}
                  value={rate.notes || ''}
                  onChange={e => updateRate(realIdx, 'notes', e.target.value)}
                  placeholder="Notes (optional)"
                />
                <button
                  type="button"
                  onClick={() => removeRate(realIdx)}
                  className="p-1 text-red-400 hover:text-red-300 hover:bg-dark-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={addRate}
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 mt-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add rate override
          </button>
          <p className="text-[10px] text-slate-600 mt-1">These rates auto-fill when this client is selected on an invoice, and can still be edited per invoice.</p>
        </div>
      )}

      {/* ── 5. Bank & Opening Balance ── */}
      <SectionHead label="Bank Details & Opening Balance" />
      <Field label="Opening Balance (Rs.) — amount owed at migration">
        <input type="number" className={inp('w-48')} value={form.opening_balance}
          onChange={e => set('opening_balance', e.target.value)} placeholder="0" min={0} step="0.01" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Bank Name">
          <input className={inp()} value={form.bank_name}
            onChange={e => set('bank_name', e.target.value)} placeholder="SBI, ICICI…" />
        </Field>
        <Field label="Account Number">
          <input className={inp('font-mono')} value={form.bank_account_number}
            onChange={e => set('bank_account_number', e.target.value)} placeholder="Account no." />
        </Field>
        <Field label="IFSC Code">
          <input className={inp('font-mono')} value={form.bank_ifsc}
            onChange={e => set('bank_ifsc', e.target.value.toUpperCase())}
            placeholder="SBIN0000796" maxLength={11} />
        </Field>
      </div>
    </Modal>
  )
}

// ── Clients Tab ───────────────────────────────────────────────────────────────
const CAT_COLOR = {
  Contractor: 'blue', Builder: 'green', Government: 'amber',
  Retail: 'slate', Wholesale: 'purple', Other: 'slate',
}

// ── Client Statement Modal ────────────────────────────────────────────────────
function ClientStatementModal({ companyId, client, onClose }) {
  const today  = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate,   setToDate]   = useState(today)
  const [generated, setGenerated] = useState(false)
  const [loading,   setLoading]   = useState(false)

  // Statement data state
  const [stmtData, setStmtData] = useState(null)

  const generate = async () => {
    setLoading(true)
    try {
      // 1. Opening balance: invoices created BEFORE fromDate (all time outstanding as of period start)
      const { data: preInvoices } = await supabase.from('crusher_invoices')
        .select('total_amount, paid_amount')
        .eq('company_id', companyId).eq('client_id', client.id)
        .neq('status', 'void').lt('invoice_date', fromDate)
      const totalPreInvoiced = (preInvoices || []).reduce((s, i) => s + Number(i.total_amount || 0), 0)

      const { data: prePayments } = await supabase.from('crusher_invoice_payments')
        .select('amount').eq('company_id', companyId).eq('client_id', client.id)
        .lt('payment_date', fromDate)
      const totalPrePaid = (prePayments || []).reduce((s, p) => s + Number(p.amount || 0), 0)
      const openingBalance = Math.max(0, totalPreInvoiced - totalPrePaid)

      // 2. Invoices in period
      const { data: periodInvoices } = await supabase.from('crusher_invoices')
        .select('id, invoice_number, invoice_type, invoice_date, total_amount, balance, status, loading_point, unloading_point')
        .eq('company_id', companyId).eq('client_id', client.id)
        .neq('status', 'void')
        .gte('invoice_date', fromDate).lte('invoice_date', toDate)
        .order('invoice_date')

      // 3. Payments in period
      const { data: periodPayments } = await supabase.from('crusher_invoice_payments')
        .select('id, invoice_id, amount, payment_mode, payment_date')
        .eq('company_id', companyId).eq('client_id', client.id)
        .gte('payment_date', fromDate).lte('payment_date', toDate)
        .order('payment_date')

      // 4. Advances available
      const { data: advances } = await supabase.from('crusher_customer_advances')
        .select('amount, remaining, source, created_at')
        .eq('company_id', companyId).eq('client_id', client.id)
        .gt('remaining', 0)

      // Build chronological ledger lines
      const lines = []
      ;(periodInvoices || []).forEach(inv => {
        lines.push({ date: inv.invoice_date, type: 'invoice', ref: inv.invoice_number, desc: `Invoice ${inv.invoice_number}${inv.unloading_point ? ` · ${inv.unloading_point}` : ''}`, debit: Number(inv.total_amount), credit: 0, raw: inv })
      })
      ;(periodPayments || []).forEach(pay => {
        const inv = (periodInvoices || []).find(i => i.id === pay.invoice_id)
        lines.push({ date: pay.payment_date, type: 'payment', ref: inv?.invoice_number || '', desc: `Payment received${inv ? ` · ${inv.invoice_number}` : ''} (${pay.payment_mode})`, debit: 0, credit: Number(pay.amount), raw: pay })
      })
      lines.sort((a, b) => a.date.localeCompare(b.date))

      // Compute running balance
      let running = openingBalance
      lines.forEach(l => {
        running += l.debit - l.credit
        l.balance = Math.max(0, running)
      })
      const closingBalance = running

      setStmtData({
        openingBalance,
        closingBalance,
        lines,
        advances: advances || [],
        totalInvoiced: (periodInvoices || []).reduce((s, i) => s + Number(i.total_amount || 0), 0),
        totalPaid:     (periodPayments  || []).reduce((s, p) => s + Number(p.amount    || 0), 0),
      })
      setGenerated(true)
    } catch (e) {
      toast.error('Error generating statement: ' + e.message)
    } finally { setLoading(false) }
  }

  const handleDownloadPDF = async () => {
    if (!stmtData) return
    const { default: jsPDFModule } = await import('jspdf')
    const { default: autoTableModule } = await import('jspdf-autotable')
    const doc = new jsPDFModule({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, M = 14

    // Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('ACCOUNT STATEMENT', W / 2, 18, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Client: ${client.display_name || client.business_name}`, M, 27)
    doc.text(`Period: ${fromDate} to ${toDate}`, M, 32)
    doc.text(`Generated: ${today}`, W - M, 27, { align: 'right' })
    if (client.gstin) doc.text(`GSTIN: ${client.gstin}`, W - M, 32, { align: 'right' })

    doc.setDrawColor(200, 200, 200)
    doc.line(M, 35, W - M, 35)

    // Opening balance
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Opening Balance (carried forward)', M, 41)
    doc.text(`Rs. ${stmtData.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, W - M, 41, { align: 'right' })

    // Ledger table
    const rows = stmtData.lines.map(l => [
      l.date,
      l.desc,
      l.debit  > 0 ? `Rs. ${l.debit.toLocaleString('en-IN',  { minimumFractionDigits: 2 })}` : '',
      l.credit > 0 ? `Rs. ${l.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '',
      `Rs. ${l.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    ])

    autoTableModule(doc, {
      startY: 45,
      head: [['Date', 'Description', 'Invoiced (Dr)', 'Received (Cr)', 'Balance']],
      body: rows,
      styles:     { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 72 },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' },
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    })

    const finalY = doc.lastAutoTable.finalY + 4
    doc.line(M, finalY, W - M, finalY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Closing Balance', M, finalY + 6)
    doc.text(`Rs. ${stmtData.closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, W - M, finalY + 6, { align: 'right' })

    if (stmtData.advances.length > 0) {
      const advTotal = stmtData.advances.reduce((s, a) => s + Number(a.remaining || 0), 0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`Advance Available: Rs. ${advTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, M, finalY + 12)
    }

    const clientLabel = (client.display_name || client.business_name || 'client').replace(/\s+/g, '_')
    doc.save(`Statement_${clientLabel}_${fromDate}_${toDate}.pdf`)
  }

  const fmtC  = n => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  const fmtD  = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : ''

  return (
    <Modal
      title={`Statement · ${client.display_name || client.business_name}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-dark-700 text-slate-300 hover:bg-dark-600">Close</button>
          <div className="flex-1" />
          {generated && (
            <button onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium">
              <Download className="w-4 h-4" /> Download PDF
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Generate
          </button>
        </div>
      }
    >
      {/* Date range */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="From Date" required>
          <input type="date" className={inp()} value={fromDate} onChange={e => { setFromDate(e.target.value); setGenerated(false) }} />
        </Field>
        <Field label="To Date" required>
          <input type="date" className={inp()} value={toDate} onChange={e => { setToDate(e.target.value); setGenerated(false) }} />
        </Field>
      </div>

      {!generated && !loading && (
        <div className="text-center py-10 text-slate-500 text-sm">
          <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Set the date range and click Generate
        </div>
      )}

      {loading && (
        <div className="text-center py-10 text-slate-400 text-sm">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Building statement…
        </div>
      )}

      {generated && stmtData && (
        <div className="space-y-3">
          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-dark-700 rounded-lg p-3 border border-dark-600 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Opening Balance</p>
              <p className="text-sm font-bold text-slate-200">{fmtC(stmtData.openingBalance)}</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3 border border-dark-600 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Invoiced</p>
              <p className="text-sm font-bold text-red-400">{fmtC(stmtData.totalInvoiced)}</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3 border border-dark-600 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Received</p>
              <p className="text-sm font-bold text-emerald-400">{fmtC(stmtData.totalPaid)}</p>
            </div>
          </div>

          {/* Closing balance */}
          <div className={`rounded-lg p-3 border flex items-center justify-between ${stmtData.closingBalance > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
            <span className="text-sm font-semibold text-slate-300">Closing Balance</span>
            <span className={`text-lg font-black ${stmtData.closingBalance > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
              {fmtC(stmtData.closingBalance)}
            </span>
          </div>

          {/* Advances */}
          {stmtData.advances.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-400 flex items-center justify-between">
              <span>Advance credit available</span>
              <span className="font-semibold">{fmtC(stmtData.advances.reduce((s, a) => s + Number(a.remaining || 0), 0))}</span>
            </div>
          )}

          {/* Ledger */}
          {stmtData.lines.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-4">No transactions in this period.</p>
          ) : (
            <div className="rounded-xl border border-dark-600 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[80px_1fr_80px_80px_80px] gap-2 px-3 py-2 bg-dark-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                <span>Date</span>
                <span>Description</span>
                <span className="text-right">Invoiced</span>
                <span className="text-right">Received</span>
                <span className="text-right">Balance</span>
              </div>
              {/* Opening row */}
              <div className="grid grid-cols-[80px_1fr_80px_80px_80px] gap-2 px-3 py-2 border-t border-dark-600 bg-dark-700/50">
                <span className="text-[11px] text-slate-500">{fmtD(fromDate)}</span>
                <span className="text-[11px] text-slate-400 italic">Opening Balance</span>
                <span />
                <span />
                <span className="text-right text-[11px] font-semibold text-slate-200">{fmtC(stmtData.openingBalance)}</span>
              </div>
              {/* Transaction rows */}
              {stmtData.lines.map((l, idx) => (
                <div key={idx} className={`grid grid-cols-[80px_1fr_80px_80px_80px] gap-2 px-3 py-2 border-t border-dark-600/50 ${l.type === 'payment' ? 'bg-emerald-500/5' : ''}`}>
                  <span className="text-[11px] text-slate-500">{fmtD(l.date)}</span>
                  <span className="text-[11px] text-slate-300 truncate">{l.desc}</span>
                  <span className="text-right text-[11px] font-mono text-red-400">{l.debit > 0 ? fmtC(l.debit) : ''}</span>
                  <span className="text-right text-[11px] font-mono text-emerald-400">{l.credit > 0 ? fmtC(l.credit) : ''}</span>
                  <span className="text-right text-[11px] font-mono font-semibold text-slate-100">{fmtC(l.balance)}</span>
                </div>
              ))}
              {/* Closing row */}
              <div className="grid grid-cols-[80px_1fr_80px_80px_80px] gap-2 px-3 py-2 border-t border-dark-600 bg-dark-800">
                <span />
                <span className="text-[11px] font-semibold text-slate-300">Closing Balance</span>
                <span />
                <span />
                <span className={`text-right text-sm font-black ${stmtData.closingBalance > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>{fmtC(stmtData.closingBalance)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Client Detail Panel ───────────────────────────────────────────────────────
function ClientDetailPanel({ companyId, client, settings, outstanding, advance, onEdit, onStatement, onClose }) {
  const catColor = CAT_COLOR[client.client_category] || 'slate'
  const creditLimit = Number(settings?.credit_limit || 0)
  const overLimit   = creditLimit > 0 && outstanding > creditLimit
  const fmtC = n => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  const fmtD = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

  const { data: sites = [] } = useQuery({
    queryKey: ['crusher-client-sites-detail', companyId, client.id],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_sites')
        .select('site_name, address').eq('company_id', companyId)
        .eq('client_id', client.id).eq('is_active', true).order('sort_order')
      return data || []
    },
  })

  const { data: recentInvoices = [] } = useQuery({
    queryKey: ['crusher-client-invoices-detail', companyId, client.id],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_invoices')
        .select('id, invoice_number, invoice_date, invoice_type, total_amount, balance, status, payment_type')
        .eq('company_id', companyId).eq('client_id', client.id)
        .neq('status', 'void')
        .order('invoice_date', { ascending: false }).limit(10)
      return data || []
    },
  })

  const { data: rateOverrides = [] } = useQuery({
    queryKey: ['crusher-client-rates-detail', companyId, client.id],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_rates')
        .select('custom_rate, notes, crusher_grades(grade_name)')
        .eq('company_id', companyId).eq('client_id', client.id).eq('is_active', true)
      return data || []
    },
  })

  const statusColor = { issued: 'text-blue-400', paid: 'text-emerald-400', partial: 'text-yellow-400', overdue: 'text-red-400' }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[480px] max-w-full bg-dark-800 border-l border-dark-600 flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-dark-600 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center text-base font-bold text-primary-400 flex-shrink-0">
            {(client.display_name || client.business_name)?.[0]?.toUpperCase() || 'C'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-100 leading-tight">{client.display_name || client.business_name}</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {client.client_category && <Badge label={client.client_category} color={catColor} />}
              {settings?.credit_period_days && <Badge label={`${settings.credit_period_days}d credit`} color="blue" />}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={onStatement}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-all">
              <FileText className="w-3.5 h-3.5" /> Statement
            </button>
            <button onClick={onEdit}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-dark-600 text-slate-300 hover:bg-dark-500 transition-all">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-600 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* 1. Profile & Contact */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mb-2">Profile & Contact</p>
            <div className="bg-dark-700 rounded-xl border border-dark-600 divide-y divide-dark-600">
              {[
                client.contact_person  && ['Contact',  client.contact_person],
                client.contact_phone   && ['Phone',    [client.contact_phone, client.contact_phone2].filter(Boolean).join(' / ')],
                client.contact_email   && ['Email',    client.contact_email],
                client.gstin           && ['GSTIN',    client.gstin],
                client.pan             && ['PAN',      client.pan],
                client.registered_address && ['Address', client.registered_address],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} className="flex gap-3 px-3 py-2">
                  <span className="text-[11px] text-slate-500 w-16 flex-shrink-0">{label}</span>
                  <span className="text-[11px] text-slate-200 break-all">{value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Financial Summary */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mb-2">Financial Summary</p>
            <div className="bg-dark-700 rounded-xl border border-dark-600 p-3 space-y-2">
              {creditLimit > 0 && (
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Outstanding vs Limit</span>
                    <span className={`font-semibold ${overLimit ? 'text-red-400' : 'text-slate-300'}`}>
                      {fmtC(outstanding)} / {fmtC(creditLimit)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${overLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (outstanding / creditLimit) * 100)}%` }} />
                  </div>
                  {overLimit && <p className="text-[10px] text-red-400 mt-1">⚠ Over credit limit by {fmtC(outstanding - creditLimit)}</p>}
                </div>
              )}
              {outstanding > 0 && !creditLimit && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Outstanding</span>
                  <span className="font-semibold text-orange-400">{fmtC(outstanding)}</span>
                </div>
              )}
              {advance > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Advance Available</span>
                  <span className="font-semibold text-amber-400">{fmtC(advance)}</span>
                </div>
              )}
              {outstanding === 0 && advance === 0 && (
                <p className="text-[11px] text-slate-500 text-center py-1">No outstanding balance</p>
              )}
              {rateOverrides.length > 0 && (
                <div className="pt-2 border-t border-dark-600">
                  <p className="text-[10px] text-slate-500 mb-1.5">Custom Rates</p>
                  <div className="space-y-1">
                    {rateOverrides.map((r, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span className="text-slate-400">{r.crusher_grades?.grade_name || '—'}</span>
                        <span className="font-mono text-primary-400">₹{Number(r.custom_rate).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 3. Delivery Sites */}
          {sites.length > 0 && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mb-2">Delivery Sites</p>
              <div className="space-y-1.5">
                {sites.map((s, i) => (
                  <div key={i} className="bg-dark-700 rounded-lg border border-dark-600 px-3 py-2">
                    <p className="text-[11px] font-semibold text-slate-200">{s.site_name}</p>
                    {s.address && <p className="text-[10px] text-slate-500 mt-0.5">{s.address}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4. Recent Invoices */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mb-2">Recent Invoices</p>
            {recentInvoices.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">No invoices yet.</p>
            ) : (
              <div className="space-y-1.5">
                {recentInvoices.map(inv => (
                  <div key={inv.id} className="bg-dark-700 rounded-lg border border-dark-600 px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-primary-400">{inv.invoice_number}</span>
                        <span className={`text-[10px] font-semibold capitalize ${statusColor[inv.status] || 'text-slate-400'}`}>{inv.status}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{fmtD(inv.invoice_date)} · {inv.invoice_type === 'tax' ? 'GST' : 'Non-Tax'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[11px] font-bold text-slate-200">{fmtC(Number(inv.total_amount))}</p>
                      {Number(inv.balance) > 0 && (
                        <p className="text-[10px] text-red-400">Due: {fmtC(Number(inv.balance))}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}

// ── Record Advance Modal ──────────────────────────────────────────────────────
function AdvanceModal({ companyId, client, onClose }) {
  const qc = useQueryClient()
  const today = new Date().toISOString().split('T')[0]
  const [amount,  setAmount]  = useState('')
  const [date,    setDate]    = useState(today)
  const [mode,    setMode]    = useState('cash')
  const [notes,   setNotes]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const handleSave = async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      // Upsert: if a record already exists for this client, add to it; otherwise insert fresh
      const { data: existing } = await supabase
        .from('crusher_customer_advances')
        .select('id, remaining')
        .eq('company_id', companyId)
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (existing) {
        await supabase.from('crusher_customer_advances').update({
          remaining: Number(existing.remaining) + amt,
          amount:    Number(existing.remaining) + amt,
          notes:     notes || existing.notes,
        }).eq('id', existing.id)
      } else {
        await supabase.from('crusher_customer_advances').insert({
          company_id:   companyId,
          client_id:    client.id,
          client_name:  client.display_name || client.business_name,
          amount:       amt,
          remaining:    amt,
          notes:        notes || null,
        })
      }

      await qc.invalidateQueries({ queryKey: ['crusher-advances', companyId] })
      toast.success(`Advance of ₹${amt.toLocaleString('en-IN')} recorded`)
      onClose()
    } catch (e) {
      toast.error('Failed to record advance')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Record Advance — ${client.display_name || client.business_name}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Advance
          </button>
        </>
      }
    >
      <Field label="Amount Received (₹)" required>
        <input
          type="number" step="0.01" min="0"
          className={inp()}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="e.g. 5000"
          autoFocus
        />
      </Field>

      <Field label="Received Date" required>
        <input type="date" className={inp()} value={date} onChange={e => setDate(e.target.value)} />
      </Field>

      <Field label="Payment Mode">
        <select className={inp()} value={mode} onChange={e => setMode(e.target.value)}>
          {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Field>

      <Field label="Notes">
        <input className={inp()} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Advance for July invoices…" />
      </Field>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
        <p className="text-[11px] text-amber-400">
          This advance will be available to apply against future invoices for this client.
        </p>
      </div>
    </Modal>
  )
}

function ClientsTab({ companyId }) {
  const [clientModal,    setClientModal]    = useState(null)   // null | existing client obj
  const [stmtClient,     setStmtClient]     = useState(null)   // client obj for statement
  const [detailClient,   setDetailClient]   = useState(null)   // client obj for detail panel
  const [advanceClient,  setAdvanceClient]  = useState(null)   // client obj for advance modal

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
      const { data } = await supabase.from('crusher_client_settings')
        .select('*, crusher_grades(grade_name)')
        .eq('company_id', companyId)
      return data || []
    },
  })

  const { data: vehicles = [] } = useQuery({
    queryKey: ['crusher_client_vehicles', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_vehicles').select('client_id')
        .eq('company_id', companyId)
      return data || []
    },
  })

  const { data: advances = [] } = useQuery({
    queryKey: ['crusher-advances', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_customer_advances')
        .select('client_id, remaining').eq('company_id', companyId).gt('remaining', 0)
      return data || []
    },
  })

  // Outstanding per client (sum of unpaid invoice balances)
  const { data: outstanding = [] } = useQuery({
    queryKey: ['crusher-outstanding', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_invoices')
        .select('client_id, balance')
        .eq('company_id', companyId).gt('balance', 0)
        .not('status', 'eq', 'void')
      return data || []
    },
  })

  const advanceMap     = advances.reduce((a, x) => { if (x.client_id) a[x.client_id] = (a[x.client_id] || 0) + Number(x.remaining); return a }, {})
  const outstandingMap = outstanding.reduce((a, x) => { if (x.client_id) a[x.client_id] = (a[x.client_id] || 0) + Number(x.balance); return a }, {})
  const settingsMap    = Object.fromEntries(settings.map(s => [s.client_id, s]))
  const vehicleCount   = vehicles.reduce((a, v) => { if (v.client_id) a[v.client_id] = (a[v.client_id] || 0) + 1; return a }, {})

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setClientModal('new')} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Client
        </button>
        <span className="text-xs text-slate-500 ml-auto">{clients.length} client{clients.length !== 1 ? 's' : ''}</span>
      </div>

      {!clients.length && (
        <div className="text-center py-16 text-slate-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm mb-3">No clients yet.</p>
          <button onClick={() => setClientModal('new')} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Add First Client
          </button>
        </div>
      )}

      {clients.map(client => {
        const s           = settingsMap[client.id]
        const vCount      = vehicleCount[client.id] || 0
        const advance     = advanceMap[client.id] || 0
        const owed        = outstandingMap[client.id] || 0
        const creditLimit = s?.credit_limit
        const overLimit   = creditLimit && owed > creditLimit
        const catColor    = CAT_COLOR[client.client_category] || 'slate'

        return (
          <div key={client.id} className="bg-dark-700 rounded-xl border border-dark-600 p-4 hover:border-primary-500/40 transition-colors">
            {/* Top row */}
            <div className="flex items-start gap-3">
              {/* Clickable area: avatar + info */}
              <button
                onClick={() => setDetailClient(client)}
                className="flex items-start gap-3 flex-1 min-w-0 text-left group"
              >
                <div className="w-9 h-9 rounded-full bg-primary-600/20 flex items-center justify-center text-sm font-bold text-primary-400 flex-shrink-0 mt-0.5 group-hover:bg-primary-600/30 transition-colors">
                  {(client.display_name || client.business_name)?.[0]?.toUpperCase() || 'C'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-200 group-hover:text-primary-300 transition-colors">{client.display_name || client.business_name}</span>
                    {client.client_category && <Badge label={client.client_category} color={catColor} />}
                    {s?.credit_period_days && <Badge label={`${s.credit_period_days}d credit`} color="blue" />}
                    {vCount > 0 && <Badge label={`${vCount} vehicle${vCount > 1 ? 's' : ''}`} color="green" />}
                  </div>

                  {/* Contact row */}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {client.contact_person && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        👤 {client.contact_person}
                      </span>
                    )}
                    {client.contact_phone && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {client.contact_phone}
                        {client.contact_phone2 && ` / ${client.contact_phone2}`}
                      </span>
                    )}
                    {client.gstin && (
                      <span className="text-[11px] font-mono text-slate-600">{client.gstin}</span>
                    )}
                  </div>

                  {/* Defaults row */}
                  {s && (
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-slate-500">
                      {s.crusher_grades?.grade_name && <span>📦 Default: {s.crusher_grades.grade_name}</span>}
                      {s.default_loading_pt && <span>📍 Load: {s.default_loading_pt}</span>}
                      {s.default_unloading_pt && <span>🏁 Deliver: {s.default_unloading_pt}</span>}
                    </div>
                  )}
                </div>
              </button>

              {/* Action buttons */}
              <div className="flex-shrink-0 flex gap-1.5">
                <button
                  onClick={() => setAdvanceClient(client)}
                  className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-all">
                  <CreditCard className="w-3.5 h-3.5" /> Advance
                </button>
                <button
                  onClick={() => setStmtClient(client)}
                  className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-all">
                  <FileText className="w-3.5 h-3.5" /> Statement
                </button>
                <button
                  onClick={() => setClientModal(client)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-dark-600 hover:bg-dark-500 px-3 py-1.5 rounded-lg transition-all">
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
              </div>
            </div>

            {/* Financial summary row */}
            {(owed > 0 || advance > 0) && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-dark-600 flex-wrap">
                {owed > 0 && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    overLimit
                      ? 'bg-red-500/15 text-red-400 border-red-500/30'
                      : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                  }`}>
                    {overLimit ? '⚠ Over Limit · ' : ''}Outstanding: Rs. {owed.toFixed(2)}
                    {creditLimit ? ` / Limit: Rs. ${Number(creditLimit).toLocaleString('en-IN')}` : ''}
                  </span>
                )}
                {advance > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    ⬆ Advance: Rs. {advance.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}

      {clientModal && (
        <ClientModal
          companyId={companyId}
          existing={clientModal === 'new' ? null : clientModal}
          onClose={() => setClientModal(null)}
        />
      )}
      {stmtClient && (
        <ClientStatementModal
          companyId={companyId}
          client={stmtClient}
          onClose={() => setStmtClient(null)}
        />
      )}
      {detailClient && (
        <ClientDetailPanel
          companyId={companyId}
          client={detailClient}
          settings={settingsMap[detailClient.id]}
          outstanding={outstandingMap[detailClient.id] || 0}
          advance={advanceMap[detailClient.id] || 0}
          onEdit={() => { setClientModal(detailClient); setDetailClient(null) }}
          onStatement={() => { setStmtClient(detailClient); setDetailClient(null) }}
          onClose={() => setDetailClient(null)}
        />
      )}
      {advanceClient && (
        <AdvanceModal
          companyId={companyId}
          client={advanceClient}
          onClose={() => setAdvanceClient(null)}
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
    vehicle_number:   existing?.vehicle_number   ?? '',
    vehicle_type:     existing?.vehicle_type     ?? 'Tipper (10-Wheeler)',
    owner_type:       existing?.owner_type       ?? 'client',
    client_id:        existing?.client_id        ?? '',
    equipment_id:     existing?.equipment_id     ?? '',
    transporter_name: existing?.transporter_name ?? '',
    billing_basis:    existing?.billing_basis    ?? 'fixed_capacity',
    capacity_tonnes:  existing?.capacity_tonnes  ?? '',
    capacity_uom:     existing?.capacity_uom     ?? 'tonnes',
    notes:            existing?.notes            ?? '',
    is_active:        existing?.is_active        ?? true,
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
        client_id:        form.owner_type !== 'own' && form.owner_type !== 'third_party' && form.client_id ? form.client_id : null,
        equipment_id:     form.owner_type === 'own' && form.equipment_id ? form.equipment_id : null,
        transporter_name: form.owner_type === 'third_party' ? (form.transporter_name.trim() || null) : null,
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
        <Field label="Owner Type">
          <select className={inp()} value={form.owner_type}
            onChange={e => set('owner_type', e.target.value)}>
            <option value="client">Client-owned Vehicle</option>
            <option value="own">Own Fleet Vehicle</option>
            <option value="third_party">Third-party / Hired Transport</option>
          </select>
        </Field>
      </div>

      {/* Client-owned: show usual client hint */}
      {form.owner_type === 'client' && (
        <Field label="Usual Client (auto-fill hint only — not restricted to one client)">
          <select className={inp()} value={form.client_id}
            onChange={e => set('client_id', e.target.value)}>
            <option value="">— None / Walk-in —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">This vehicle can still be used for any client's load.</p>
        </Field>
      )}

      {/* Own fleet: link to equipment register */}
      {form.owner_type === 'own' && (
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

      {/* Third-party: transport contractor name */}
      {form.owner_type === 'third_party' && (
        <Field label="Transporter / Contractor Name">
          <input className={inp()} value={form.transporter_name}
            onChange={e => set('transporter_name', e.target.value)}
            placeholder="e.g. Murugan Transport, SMS Logistics…" />
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
    ? vehicles.filter(v =>
        (filterClient === '__own'        && v.owner_type === 'own') ||
        (filterClient === '__third'      && v.owner_type === 'third_party') ||
        (filterClient === v.client_id))
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
          <option value="__third">Third-party / Hired</option>
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
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                v.owner_type === 'own' ? 'bg-emerald-500/10' : v.owner_type === 'third_party' ? 'bg-amber-500/10' : 'bg-primary-500/10'
              }`}>
                <Truck className={`w-5 h-5 ${
                  v.owner_type === 'own' ? 'text-emerald-400' : v.owner_type === 'third_party' ? 'text-amber-400' : 'text-primary-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-primary-300">{v.vehicle_number}</span>
                  <Badge label={v.vehicle_type} color="slate" />
                  {v.owner_type === 'own'         && <Badge label="Own Fleet"   color="green" />}
                  {v.owner_type === 'client'       && <Badge label="Client Vehicle" color="blue" />}
                  {v.owner_type === 'third_party'  && <Badge label="Third-party" color="amber" />}
                  {!v.is_active && <Badge label="Inactive" color="red" />}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {v.owner_type === 'client'      && v.clients      && <span className="mr-2">Usual client: <strong>{v.clients.display_name || v.clients.business_name}</strong></span>}
                  {v.owner_type === 'own'         && v.equipment?.name && <span className="mr-2">Fleet: <strong>{v.equipment.name}</strong></span>}
                  {v.owner_type === 'third_party' && v.transporter_name && <span className="mr-2">Transporter: <strong>{v.transporter_name}</strong></span>}
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

// ── Grade Form Modal (Add / Edit material grade) ──────────────────────────────
const GRADE_CATEGORIES = ['Sand', 'Jelly & Aggregate', 'GSB', 'WMM', 'Boulders', 'Dust & Rejects', 'Others']
const GRADE_UOM_OPTIONS = [
  { value: 'tonnes', label: 'Tonnes (T)' },
  { value: 'cum',    label: 'Cubic Metres (CUM)' },
  { value: 'units',  label: 'Units' },
  { value: 'bags',   label: 'Bags' },
  { value: 'trips',  label: 'Trips' },
]

function GradeFormModal({ companyId, existing, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    grade_name:       existing?.grade_name       || '',
    description:      existing?.description      || '',
    category:         existing?.category         || '',
    default_rate:     existing?.default_rate     ?? '',
    default_uom:      existing?.default_uom      || 'tonnes',
    hsn_code:         existing?.hsn_code         ?? '2517',
    default_gst_rate: existing?.default_gst_rate ?? 5,
    sort_order:       existing?.sort_order       ?? 0,
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
        category:         form.category           || null,
        default_rate:     form.default_rate !== '' ? Number(form.default_rate) : 0,
        default_uom:      form.default_uom        || 'tonnes',
        hsn_code:         form.hsn_code.trim()    || null,
        default_gst_rate: Number(form.default_gst_rate),
        sort_order:       Number(form.sort_order) || 0,
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className={inp()} value={form.category} onChange={e => set('category', e.target.value)}>
            <option value="">— None —</option>
            {GRADE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Display Order">
          <input type="number" className={inp()} value={form.sort_order}
            onChange={e => set('sort_order', e.target.value)}
            placeholder="0" min={0} />
        </Field>
      </div>

      <Field label="Description">
        <input className={inp()} value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Optional — e.g. Fine aggregate for plastering" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Default Rate (Rs. per unit)" required>
          <input type="number" className={inp()} value={form.default_rate}
            onChange={e => set('default_rate', e.target.value)}
            placeholder="e.g. 850.00" step="0.01" min="0" />
        </Field>
        <Field label="Billing Unit (UOM)">
          <select className={inp()} value={form.default_uom} onChange={e => set('default_uom', e.target.value)}>
            {GRADE_UOM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

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
        <p className="text-slate-500 pt-0.5">GST rate auto-applied on tax invoices. Non-tax invoices always show Rs.0 GST.</p>
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
const UOM_LABEL = { tonnes: 'T', cum: 'CUM', units: 'Units', bags: 'Bags', trips: 'Trips' }

function rateAge(ts) {
  if (!ts) return null
  const days = Math.floor((Date.now() - new Date(ts)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30)  return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

function MaterialsTab({ companyId }) {
  const [editGrade, setEditGrade] = useState(null)
  const [addOpen,   setAddOpen]   = useState(false)
  const [filterCat, setFilterCat] = useState('')

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

  // Group by category
  const filtered = filterCat ? grades.filter(g => (g.category || 'Others') === filterCat) : grades
  const categories = [...new Set(grades.map(g => g.category || 'Others'))]
  const grouped = categories.reduce((acc, cat) => {
    acc[cat] = filtered.filter(g => (g.category || 'Others') === cat)
    return acc
  }, {})
  // Also include ungrouped if no category filter
  const visibleCats = filterCat ? [filterCat] : categories

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-200">Materials & Grades</h3>
          <p className="text-xs text-slate-500">
            {grades.length} material{grades.length !== 1 ? 's' : ''} · HSN & GST auto-applied on tax invoices
          </p>
        </div>
        {categories.length > 1 && (
          <select
            className="rounded-lg border border-dark-600 bg-dark-700 px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
            value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
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

      {/* Grouped grade list */}
      {grades.length > 0 && (
        <div className="space-y-5">
          {visibleCats.map(cat => {
            const catGrades = grouped[cat] || []
            if (!catGrades.length) return null
            return (
              <div key={cat}>
                {/* Category header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-primary-400">{cat}</span>
                  <span className="text-[10px] text-dark-500">({catGrades.length})</span>
                  <div className="flex-1 h-px bg-dark-700" />
                </div>
                <div className="grid gap-2">
                  {catGrades.map(g => (
                    <div key={g.id}
                      className={`bg-dark-700 rounded-xl border border-dark-600 p-4 flex items-center gap-4 ${!g.is_active ? 'opacity-50' : ''}`}>
                      <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-primary-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-200">{g.grade_name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-dark-600 text-slate-400">
                            {UOM_LABEL[g.default_uom] || g.default_uom || 'T'}
                          </span>
                          {!g.is_active && <Badge label="Inactive" color="red" />}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          <span className="text-xs text-slate-500">
                            Rate: <strong className="text-emerald-400">Rs.{Number(g.default_rate || 0).toLocaleString('en-IN')}</strong>
                            {g.rate_revised_at && (
                              <span className="ml-1 text-slate-600">· {rateAge(g.rate_revised_at)}</span>
                            )}
                          </span>
                          <span className="text-xs text-slate-500">
                            HSN: <strong className="font-mono text-primary-300">{g.hsn_code || '—'}</strong>
                          </span>
                          <span className="text-xs text-slate-500">
                            GST: <strong className={Number(g.default_gst_rate) > 0 ? 'text-yellow-400' : 'text-slate-400'}>
                              {g.default_gst_rate ?? 0}%
                            </strong>
                          </span>
                          {g.description && <span className="text-xs text-slate-600 truncate max-w-[200px]">{g.description}</span>}
                        </div>
                      </div>
                      <button onClick={() => setEditGrade(g)}
                        className="flex-shrink-0 flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-all">
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {addOpen   && <GradeFormModal companyId={companyId} onClose={() => setAddOpen(false)} />}
      {editGrade && <GradeFormModal companyId={companyId} existing={editGrade} onClose={() => setEditGrade(null)} />}
    </div>
  )
}

// ── Outstanding & Aging Tab ───────────────────────────────────────────────────
const AGING_BUCKETS = [
  { key: '0-15',  label: '0–15d',  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { key: '16-30', label: '16–30d', color: 'text-yellow-400',  bg: 'bg-yellow-500/10'  },
  { key: '31-60', label: '31–60d', color: 'text-orange-400',  bg: 'bg-orange-500/10'  },
  { key: '60+',   label: '60+d',   color: 'text-red-400',     bg: 'bg-red-500/10'     },
]

function ageBucket(invDateStr) {
  const days = Math.floor((Date.now() - new Date(invDateStr)) / 86400000)
  if (days <= 15) return '0-15'
  if (days <= 30) return '16-30'
  if (days <= 60) return '31-60'
  return '60+'
}

function AgingTab({ companyId }) {
  const [expanded, setExpanded] = useState({})
  const toggle = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }))

  const { data: openInvoices = [], isLoading } = useQuery({
    queryKey: ['crusher-aging', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_invoices')
        .select('id, invoice_number, invoice_date, invoice_type, client_id, client_name, total_amount, balance, credit_due_date, status')
        .eq('company_id', companyId)
        .eq('payment_type', 'credit')
        .neq('status', 'void')
        .gt('balance', 0)
        .order('invoice_date', { ascending: true })
      return data || []
    },
  })

  const { data: creditLimits = {} } = useQuery({
    queryKey: ['crusher-credit-limits-aging', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_settings')
        .select('client_id, credit_limit')
        .eq('company_id', companyId)
        .gt('credit_limit', 0)
      const map = {}
      ;(data || []).forEach(r => { map[r.client_id] = Number(r.credit_limit) })
      return map
    },
  })

  // Group invoices by client
  const byClient = {}
  openInvoices.forEach(inv => {
    const key = inv.client_id || `walkin_${inv.client_name}`
    if (!byClient[key]) {
      byClient[key] = {
        client_id:   inv.client_id,
        client_name: inv.client_name || 'Walk-in',
        invoices:    [],
        total:       0,
        buckets:     { '0-15': 0, '16-30': 0, '31-60': 0, '60+': 0 },
      }
    }
    const bal = Number(inv.balance)
    byClient[key].invoices.push(inv)
    byClient[key].total += bal
    byClient[key].buckets[ageBucket(inv.invoice_date)] += bal
  })

  const clients = Object.values(byClient).sort((a, b) => b.total - a.total)
  const grandTotal = clients.reduce((s, c) => s + c.total, 0)
  const grandBuckets = { '0-15': 0, '16-30': 0, '31-60': 0, '60+': 0 }
  clients.forEach(c => AGING_BUCKETS.forEach(b => { grandBuckets[b.key] += c.buckets[b.key] }))

  const fmtC = n => n > 0 ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 })}` : '—'
  const fmtD = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

  if (isLoading) return (
    <div className="text-center py-16 text-slate-500 text-sm">
      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading outstanding…
    </div>
  )

  if (clients.length === 0) return (
    <div className="text-center py-16 space-y-3">
      <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
      <p className="text-sm text-slate-400">No outstanding credit invoices — all clear!</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Outstanding & Aging</h3>
          <p className="text-xs text-slate-500">
            {clients.length} client{clients.length !== 1 ? 's' : ''} · {openInvoices.length} open invoice{openInvoices.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Outstanding</p>
          <p className="text-lg font-bold text-red-400">₹{grandTotal.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Bucket summary cards */}
      <div className="grid grid-cols-4 gap-2">
        {AGING_BUCKETS.map(b => (
          <div key={b.key} className={`rounded-xl p-3 border border-dark-600 text-center ${b.bg}`}>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{b.label}</p>
            <p className={`text-sm font-bold ${b.color}`}>{fmtC(grandBuckets[b.key])}</p>
          </div>
        ))}
      </div>

      {/* Client rows */}
      <div className="space-y-2">
        {clients.map(c => {
          const key = c.client_id || c.client_name
          const isOpen = !!expanded[key]
          const limit = c.client_id ? (creditLimits[c.client_id] || 0) : 0
          const overLimit = limit > 0 && c.total > limit

          return (
            <div key={key} className="bg-dark-700 rounded-xl border border-dark-600 overflow-hidden">
              {/* Client header — click to expand */}
              <button
                onClick={() => toggle(key)}
                className="w-full text-left p-4 flex items-center gap-3 hover:bg-dark-600/40 transition-all"
              >
                <ChevronRight className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-sm font-semibold text-slate-100">{c.client_name}</span>
                    {overLimit && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                        <AlertCircle className="w-2.5 h-2.5" /> Over Limit
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500">{c.invoices.length} invoice{c.invoices.length !== 1 ? 's' : ''}</span>
                  </div>
                  {/* Per-bucket breakdown inline */}
                  <div className="flex gap-3 flex-wrap">
                    {AGING_BUCKETS.map(b => c.buckets[b.key] > 0 && (
                      <span key={b.key} className={`text-[11px] font-mono ${b.color}`}>
                        {b.label}: {fmtC(c.buckets[b.key])}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-sm font-bold text-red-400">{fmtC(c.total)}</p>
                  {limit > 0 && (
                    <p className="text-[10px] text-slate-500 mt-0.5">Limit: {fmtC(limit)}</p>
                  )}
                </div>
              </button>

              {/* Expanded — per-invoice breakdown */}
              {isOpen && (
                <div className="border-t border-dark-600">
                  {/* Column headers */}
                  <div className="px-4 py-1.5 grid grid-cols-[1fr_72px_72px_48px_80px] gap-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    <span>Invoice</span>
                    <span className="text-right">Inv. Date</span>
                    <span className="text-right">Due Date</span>
                    <span className="text-right">Age</span>
                    <span className="text-right">Balance</span>
                  </div>
                  {c.invoices.map(inv => {
                    const days      = Math.floor((Date.now() - new Date(inv.invoice_date)) / 86400000)
                    const bucket    = ageBucket(inv.invoice_date)
                    const bColor    = AGING_BUCKETS.find(b => b.key === bucket)?.color || 'text-slate-400'
                    const isPastDue = inv.credit_due_date && new Date(inv.credit_due_date) < new Date()
                    return (
                      <div key={inv.id}
                        className="px-4 py-2.5 grid grid-cols-[1fr_72px_72px_48px_80px] gap-2 items-center border-t border-dark-600/50 hover:bg-dark-600/20 transition-all">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono text-primary-400 truncate">{inv.invoice_number}</span>
                          <span className={`text-[10px] px-1 py-0.5 rounded border ${inv.invoice_type === 'tax' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-dark-600 border-dark-500 text-slate-500'}`}>
                            {inv.invoice_type === 'tax' ? 'GST' : 'Non-Tax'}
                          </span>
                        </div>
                        <span className="text-right text-[11px] text-slate-400">{fmtD(inv.invoice_date)}</span>
                        <span className={`text-right text-[11px] ${isPastDue ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                          {fmtD(inv.credit_due_date)}
                        </span>
                        <span className={`text-right text-[11px] font-mono font-semibold ${bColor}`}>{days}d</span>
                        <span className="text-right text-[11px] font-mono font-bold text-slate-100">{fmtC(Number(inv.balance))}</span>
                      </div>
                    )
                  })}
                  {/* Client subtotal */}
                  <div className="px-4 py-2 border-t border-dark-600 flex justify-between items-center">
                    <span className="text-[11px] text-slate-500">Client total</span>
                    <span className="text-sm font-bold text-red-400">{fmtC(c.total)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TAB_ORDER_KEY = 'crusher_tab_order_v1'

function loadTabOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || 'null')
    if (Array.isArray(saved)) {
      const allKeys = TABS.map(t => t.key)
      const valid   = saved.filter(k => allKeys.includes(k))
      const missing = allKeys.filter(k => !valid.includes(k))
      return [...valid, ...missing]
    }
  } catch {}
  return TABS.map(t => t.key)
}

export default function CrusherSalesPage() {
  const { companyId } = useAuth()
  const [tab,         setTab]         = useState('invoices')
  const [tabOrder,    setTabOrder]    = useState(loadTabOrder)
  const [customizing, setCustomizing] = useState(false)
  const [dragFrom,    setDragFrom]    = useState(null)
  const [dragOver,    setDragOver]    = useState(null)

  const orderedTabs = tabOrder.map(k => TABS.find(t => t.key === k)).filter(Boolean)

  const saveOrder = (next) => {
    setTabOrder(next)
    try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next)) } catch {}
  }

  const handleDrop = (toIdx) => {
    if (dragFrom === null || dragFrom === toIdx) { setDragFrom(null); setDragOver(null); return }
    const next = [...tabOrder]
    const [moved] = next.splice(dragFrom, 1)
    next.splice(toIdx, 0, moved)
    saveOrder(next)
    setDragFrom(null)
    setDragOver(null)
  }

  const resetOrder = () => {
    saveOrder(TABS.map(t => t.key))
    setCustomizing(false)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-dark-700 px-6 py-4">
        <h1 className="text-xl font-bold text-slate-100">Crusher Sales</h1>
        <p className="text-sm text-slate-400 mt-0.5">Vehicle-linked tonnage invoicing, client credit management, and material billing</p>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-dark-700 px-4">
        <div className="flex items-center gap-1 py-2">
          <nav className="flex gap-1 overflow-x-auto flex-1">
            {orderedTabs.map(t => {
              const Icon    = t.icon
              const isActive = tab === t.key
              return (
                <button key={t.key} onClick={() => !customizing && setTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0
                    ${isActive && !customizing ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'}
                    ${customizing ? 'cursor-default opacity-60' : ''}`}>
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              )
            })}
          </nav>
          {/* Customize button */}
          <button
            onClick={() => setCustomizing(v => !v)}
            title="Rearrange tabs"
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all ml-1
              ${customizing ? 'bg-primary-500/20 text-primary-400' : 'text-slate-500 hover:text-slate-300 hover:bg-dark-700'}`}>
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reorder panel */}
      {customizing && (
        <div className="flex-shrink-0 border-b border-dark-700 bg-dark-800 px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-primary-400 uppercase tracking-widest">Drag to rearrange tabs</p>
            <div className="flex gap-2">
              <button onClick={resetOrder} className="text-xs text-slate-400 hover:text-slate-200 underline">Reset to default</button>
              <button onClick={() => setCustomizing(false)}
                className="text-xs px-3 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-500 transition-all">
                Done
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {orderedTabs.map((t, i) => {
              const Icon = t.icon
              const isDragging = dragFrom === i
              const isTarget   = dragOver  === i
              return (
                <div
                  key={t.key}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={e => { e.preventDefault(); setDragOver(i) }}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null) }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-grab active:cursor-grabbing select-none transition-all
                    ${isDragging  ? 'opacity-40 scale-95 border-primary-500/50 bg-primary-500/10' :
                      isTarget    ? 'border-primary-400 bg-primary-400/10 text-primary-300' :
                                    'border-dark-600 bg-dark-700 text-slate-300 hover:border-primary-500/40'}`}>
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'tokens'    && <TokensTab     companyId={companyId} />}
        {tab === 'invoices'  && <InvoicesTab   companyId={companyId} />}
        {tab === 'aging'     && <AgingTab      companyId={companyId} />}
        {tab === 'clients'   && <ClientsTab    companyId={companyId} />}
        {tab === 'vehicles'  && <VehiclesTab   companyId={companyId} />}
        {tab === 'locations' && <LocationsTab  companyId={companyId} />}
        {tab === 'materials' && <MaterialsTab  companyId={companyId} />}
      </div>
    </div>
  )
}
