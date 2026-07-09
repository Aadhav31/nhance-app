import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { generateInvoicePDF } from '../../lib/invoicePDF'
import {
  Receipt, Plus, X, Loader2, Trash2, Pencil,
  TrendingUp, TrendingDown, Clock, Search, Banknote,
  ArrowUpCircle, ArrowDownCircle, ChevronRight, ChevronDown,
  Link, Copy, ExternalLink, Share2, Bell, AlertTriangle, CheckCircle2,
  Download, FileText, FileSpreadsheet, ToggleLeft, ToggleRight, CalendarRange,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
// Accounts Expenses = financial / overhead expenses only.
// Field operational expenses → Field Expenses module (APK/web, synced here with 📱 badge)
// Purchase of materials / equipment / maintenance → Purchase module
const EXPENSE_CATS = [
  { value: 'salary',   label: 'Salary & Wages',         icon: '💼' },
  { value: 'emi',      label: 'EMI Payment',            icon: '🏦' },
  { value: 'interest', label: 'Interest / Finance',     icon: '📈' },
  { value: 'rent',     label: 'Rent',                   icon: '🏢' },
  { value: 'insurance',label: 'Insurance',              icon: '🛡'  },
  { value: 'admin',    label: 'Admin & Office',         icon: '📋' },
  { value: 'misc',     label: 'Miscellaneous',          icon: '📦' },
]

const PAYMENT_MODES = ['cash', 'bank', 'upi', 'cheque']
const UNITS = ['hrs', 'days', 'trips', 'LS', 'nos', 'mt', 'km']

const INV_STATUS = {
  draft:     { label: 'Draft',     cls: 'bg-slate-500/20 text-slate-400 border-slate-600' },
  sent:      { label: 'Sent',      cls: 'bg-blue-500/20 text-blue-400 border-blue-700' },
  partial:   { label: 'Partial',   cls: 'bg-amber-500/20 text-amber-400 border-amber-700' },
  paid:      { label: 'Paid',      cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-700' },
  overdue:   { label: 'Overdue',   cls: 'bg-red-500/20 text-red-400 border-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-500/20 text-gray-500 border-gray-600' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt  = (n) => n == null || isNaN(n)
  ? '₹0'
  : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtDate = (d) => { try { return format(parseISO(d), 'dd MMM yyyy') } catch { return d || '—' } }
const today = () => new Date().toISOString().split('T')[0]
const inp = (extra = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${extra}`

const curMonth = () => new Date().toISOString().slice(0, 7)
const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className={`bg-dark-800 rounded-xl border border-dark-700 shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} my-4`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
          <h2 className="text-base font-bold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Invoice Modal
// ─────────────────────────────────────────────────────────────────────────────
const blankLine = () => ({
  _id: Math.random().toString(36).slice(2),
  description: '', item_code: '', sac_hsn_code: '',
  quantity: 1, unit: 'hrs', rate: '', amount: 0, equipment_id: '',
})

function CreateInvoiceModal({ companyId, session, invoiceCount, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [form, setForm] = useState({
    client_name: '', client_address: '', client_gstin: '',
    project_name: '', invoice_date: today(), due_date: '',
    // GST supply details
    work_order_number: '', work_order_date: '',
    work_done_from: '', work_done_to: '',
    nature_of_supply: '', place_of_supply: '', place_of_supply_address: '',
    cgst_rate: 9, sgst_rate: 9, igst_rate: 18, use_igst: false,
    discount_amount: 0, notes: '', terms: 'Payment due within 30 days.',
  })
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Registered clients for auto-fill
  const { data: clientList = [], error: clientFetchError } = useQuery({
    queryKey: ['clients_invoice_picker', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, display_name, business_name, gstin, registered_address, city, state, pincode, payment_terms')
        .eq('company_id', companyId)
        .order('business_name')   // business_name is always NOT NULL
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  // Auto-fill invoice fields from a selected client
  const applyClient = (client) => {
    if (!client) return
    const name = client.display_name || client.business_name || ''
    const addrParts = [client.registered_address, client.city, client.state, client.pincode].filter(Boolean)
    const address = addrParts.join(', ')
    // Determine due date from payment_terms (e.g. "Net 30")
    let dueDate = ''
    if (client.payment_terms) {
      const days = parseInt(client.payment_terms.replace(/\D/g, ''), 10)
      if (!isNaN(days) && days > 0) {
        const d = new Date(); d.setDate(d.getDate() + days)
        dueDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      }
    }
    setForm(p => ({
      ...p,
      client_name:             name,
      client_address:          address,
      client_gstin:            client.gstin || '',
      place_of_supply:         client.state || '',
      place_of_supply_address: address,
      due_date:                dueDate || p.due_date,
    }))
    setClientSearch('')
  }

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clientList.slice(0, 10)
    return clientList.filter(c => {
      const name = (c.display_name || c.business_name || '').toLowerCase()
      const gstin = (c.gstin || '').toLowerCase()
      return name.includes(q) || gstin.includes(q)
    }).slice(0, 10)
  }, [clientList, clientSearch])

  // Equipment list for line item linking
  const { data: equipList = [] } = useQuery({
    queryKey: ['equip_list_invoice', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id, name, equipment_number, category')
        .eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const updateLine = (id, key, val) => {
    setLines(prev => prev.map(l => {
      if (l._id !== id) return l
      const upd = { ...l, [key]: val }
      if (key === 'quantity' || key === 'rate') {
        upd.amount = (parseFloat(upd.quantity) || 0) * (parseFloat(upd.rate) || 0)
      }
      return upd
    }))
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const taxable  = useMemo(() => subtotal - (parseFloat(form.discount_amount) || 0), [subtotal, form.discount_amount])
  const cgst_amt = useMemo(() => form.use_igst ? 0 : taxable * (parseFloat(form.cgst_rate) || 0) / 100, [taxable, form.cgst_rate, form.use_igst])
  const sgst_amt = useMemo(() => form.use_igst ? 0 : taxable * (parseFloat(form.sgst_rate) || 0) / 100, [taxable, form.sgst_rate, form.use_igst])
  const igst_amt = useMemo(() => form.use_igst ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0, [taxable, form.igst_rate, form.use_igst])
  const total    = useMemo(() => taxable + cgst_amt + sgst_amt + igst_amt, [taxable, cgst_amt, sgst_amt, igst_amt])
  const invNum   = useMemo(() => `INV-${new Date().getFullYear()}-${String((invoiceCount || 0) + 1).padStart(3, '0')}`, [invoiceCount])

  const handleSave = async (status = 'draft') => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      // Generate UUID client-side so we never need to read it back (avoids RLS SELECT issues)
      const invoiceId = crypto.randomUUID()

      const invGSTRate = form.use_igst
        ? parseFloat(form.igst_rate)
        : (parseFloat(form.cgst_rate) + parseFloat(form.sgst_rate))

      const { error: invErr } = await supabase.from('client_invoices').insert({
        id: invoiceId,
        company_id: companyId, invoice_number: invNum,
        invoice_date: form.invoice_date, due_date: form.due_date || null,
        client_name: form.client_name.trim(),
        client_address: form.client_address.trim() || null,
        client_gstin: form.client_gstin.trim() || null,
        project_name: form.project_name.trim() || null,
        work_order_number:       form.work_order_number.trim() || null,
        work_order_date:         form.work_order_date || null,
        work_done_from:          form.work_done_from || null,
        work_done_to:            form.work_done_to || null,
        nature_of_supply:        form.nature_of_supply.trim() || null,
        place_of_supply:         form.place_of_supply.trim() || null,
        place_of_supply_address: form.place_of_supply_address.trim() || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate),
        sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
        igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, paid_amount: 0, balance_due: total,
        status, notes: form.notes.trim() || null, terms: form.terms.trim() || null,
        created_by: session.user.id,
      })
      if (invErr) throw invErr

      const linePayload = lines.filter(l => l.description.trim()).map((l, i) => ({
        invoice_id:   invoiceId,   // use our known UUID directly — no dependency on newInv
        company_id:   companyId,
        description:  l.description.trim(),
        item_code:    l.item_code?.trim() || null,
        sac_hsn_code: l.sac_hsn_code?.trim() || null,
        gst_rate:     invGSTRate,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
        equipment_id: l.equipment_id || null,
      }))
      if (linePayload.length > 0) {
        const { error: le } = await supabase.from('invoice_line_items').insert(linePayload)
        if (le) throw le
      }
      toast.success(`Invoice ${invNum} ${status === 'sent' ? 'created & marked sent' : 'saved as draft'}`)
      onSaved()
    } catch (e) { toast.error(e.message || 'Failed to save invoice')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`New Invoice — ${invNum}`} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Client Picker — select from registered clients */}
        {/* Client Picker — always visible */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Select Registered Client</p>
          {clientFetchError ? (
            <div className="bg-red-500/10 border border-red-700/50 rounded-xl px-4 py-3 text-xs text-red-400">
              Could not load clients: {clientFetchError.message}
            </div>
          ) : clientList.length === 0 ? (
            <div className="bg-dark-700/50 border border-dark-600 rounded-xl px-4 py-3 text-xs text-slate-400">
              No clients registered yet. Go to the <span className="text-primary-400 font-semibold">Clients</span> module to add your clients — they'll appear here for one-click auto-fill.
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  className={inp('pl-8 text-sm')}
                  placeholder={`Search from ${clientList.length} registered client${clientList.length > 1 ? 's' : ''}…`}
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                />
              </div>
              {clientSearch.trim() && (
                <div className="mt-1 bg-dark-700 border border-dark-600 rounded-xl overflow-hidden shadow-xl">
                  {filteredClients.length > 0 ? filteredClients.map(c => {
                    const name = c.display_name || c.business_name || ''
                    const addrShort = [c.city, c.state].filter(Boolean).join(', ')
                    return (
                      <button key={c.id} onClick={() => applyClient(c)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-dark-600 transition-colors text-left border-b border-dark-600 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{name}</p>
                          <p className="text-xs text-slate-500">{addrShort}{c.gstin ? ` · GSTIN: ${c.gstin}` : ''}</p>
                        </div>
                        <span className="text-[10px] text-primary-400 font-semibold mt-1 shrink-0">Select →</span>
                      </button>
                    )
                  }) : (
                    <p className="px-4 py-3 text-xs text-slate-500">No client matches "{clientSearch}"</p>
                  )}
                </div>
              )}
              {!clientSearch && !form.client_name && (
                <p className="text-xs text-slate-500 mt-1.5">Start typing to search and auto-fill client details below.</p>
              )}
              {form.client_name && !clientSearch && (
                <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Client details filled — edit below if needed
                </p>
              )}
            </>
          )}
        </div>

        {/* Client details */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Client Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Client / Company Name *</label>
              <input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} placeholder="e.g. Infra Builders Pvt Ltd" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Client Address</label>
              <input className={inp()} value={form.client_address} onChange={e => setF('client_address', e.target.value)} placeholder="Full billing address" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Client GSTIN</label>
              <input className={inp()} value={form.client_gstin} onChange={e => setF('client_gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Invoice Date</label>
              <input type="date" className={inp()} value={form.invoice_date} onChange={e => setF('invoice_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
              <input type="date" className={inp()} value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Project Reference</label>
              <input className={inp()} value={form.project_name} onChange={e => setF('project_name', e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </div>

        {/* Invoice & Supply Details */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Work Order & Supply Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Work Order No.</label>
              <input className={inp()} value={form.work_order_number} onChange={e => setF('work_order_number', e.target.value)} placeholder="e.g. WO/2026/001" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Work Order Date</label>
              <input type="date" className={inp()} value={form.work_order_date} onChange={e => setF('work_order_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Work Done From</label>
              <input type="date" className={inp()} value={form.work_done_from} onChange={e => setF('work_done_from', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Work Done To</label>
              <input type="date" className={inp()} value={form.work_done_to} onChange={e => setF('work_done_to', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Nature of Supply</label>
              <input className={inp()} value={form.nature_of_supply} onChange={e => setF('nature_of_supply', e.target.value)} placeholder="e.g. Hiring of Backhoe Loader with Operator" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Place of Supply (State)</label>
              <input className={inp()} value={form.place_of_supply} onChange={e => setF('place_of_supply', e.target.value)} placeholder="e.g. Tamil Nadu" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Place of Supply Address</label>
              <input className={inp()} value={form.place_of_supply_address} onChange={e => setF('place_of_supply_address', e.target.value)} placeholder="Site / project address" />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Line Items</p>
            <button onClick={() => setLines(p => [...p, blankLine()])}
              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>
          <div className="space-y-2">
            <div className="hidden lg:grid grid-cols-12 gap-2 text-[10px] text-slate-500 font-bold uppercase px-1">
              <div className="col-span-4">Description</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-1">Unit</div>
              <div className="col-span-2">Rate (₹)</div>
              <div className="col-span-1 text-right">Amount</div>
              <div className="col-span-2" />
            </div>
            {lines.map(l => (
              <div key={l._id} className="space-y-1 bg-dark-700/30 rounded-lg p-2">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <input className={inp('text-xs')} value={l.description}
                      onChange={e => updateLine(l._id, 'description', e.target.value)} placeholder="Service description…" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" className={inp('text-xs')} value={l.quantity}
                      onChange={e => updateLine(l._id, 'quantity', e.target.value)} min="0" step="0.5" />
                  </div>
                  <div className="col-span-1">
                    <select className={inp('text-xs')} value={l.unit} onChange={e => updateLine(l._id, 'unit', e.target.value)}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input type="number" className={inp('text-xs')} value={l.rate}
                      onChange={e => updateLine(l._id, 'rate', e.target.value)} placeholder="0" min="0" />
                  </div>
                  <div className="col-span-1 text-right text-xs text-slate-300 font-mono">{fmt(l.amount)}</div>
                  <div className="col-span-2 flex justify-end">
                    <button onClick={() => lines.length > 1 && setLines(p => p.filter(x => x._id !== l._id))}
                      className="text-slate-600 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* Item code + SAC/HSN + Equipment — secondary row */}
                <div className="grid grid-cols-3 gap-2">
                  <input className="bg-dark-800 border border-dark-600 rounded-lg px-2 py-1 text-[10px] text-slate-400 focus:outline-none focus:border-primary-500"
                    value={l.item_code} onChange={e => updateLine(l._id, 'item_code', e.target.value)} placeholder="Item code (optional)" />
                  <input className="bg-dark-800 border border-dark-600 rounded-lg px-2 py-1 text-[10px] text-slate-400 focus:outline-none focus:border-primary-500"
                    value={l.sac_hsn_code} onChange={e => updateLine(l._id, 'sac_hsn_code', e.target.value)} placeholder="SAC / HSN code" />
                  {equipList.length > 0 && (
                    <select className="bg-dark-800 border border-dark-600 rounded-lg px-2 py-1 text-[10px] text-slate-400 focus:outline-none focus:border-primary-500"
                      value={l.equipment_id || ''} onChange={e => updateLine(l._id, 'equipment_id', e.target.value)}>
                      <option value="">— Link equipment —</option>
                      {equipList.map(eq => (
                        <option key={eq.id} value={eq.id}>
                          {eq.equipment_number ? `${eq.equipment_number} · ` : ''}{eq.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GST + Totals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tax</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.use_igst} onChange={e => setF('use_igst', e.target.checked)} className="rounded" />
              <span className="text-xs text-slate-300">Use IGST (interstate supply)</span>
            </label>
            {form.use_igst ? (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">IGST Rate (%)</label>
                <input type="number" className={inp()} value={form.igst_rate} onChange={e => setF('igst_rate', e.target.value)} min="0" max="28" step="0.5" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">CGST (%)</label>
                  <input type="number" className={inp()} value={form.cgst_rate} onChange={e => setF('cgst_rate', e.target.value)} min="0" max="14" step="0.5" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">SGST (%)</label>
                  <input type="number" className={inp()} value={form.sgst_rate} onChange={e => setF('sgst_rate', e.target.value)} min="0" max="14" step="0.5" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Discount (₹)</label>
              <input type="number" className={inp()} value={form.discount_amount} onChange={e => setF('discount_amount', e.target.value)} min="0" />
            </div>
          </div>
          <div className="bg-dark-700 rounded-xl p-4 space-y-2.5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Summary</p>
            <Row label="Subtotal" val={fmt(subtotal)} />
            {parseFloat(form.discount_amount) > 0 && <Row label="Discount" val={`− ${fmt(form.discount_amount)}`} cls="text-red-400" />}
            <Row label="Taxable" val={fmt(taxable)} />
            {form.use_igst
              ? <Row label={`IGST (${form.igst_rate}%)`} val={fmt(igst_amt)} cls="text-slate-400" />
              : <>
                  <Row label={`CGST (${form.cgst_rate}%)`} val={fmt(cgst_amt)} cls="text-slate-400" />
                  <Row label={`SGST (${form.sgst_rate}%)`} val={fmt(sgst_amt)} cls="text-slate-400" />
                </>
            }
            <div className="border-t border-dark-600 pt-2.5 flex justify-between font-bold text-base text-slate-100">
              <span>Total</span>
              <span className="font-mono text-emerald-400">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Notes / Terms */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <textarea className={inp('h-16 resize-none')} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Any special instructions…" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Terms & Conditions</label>
            <textarea className={inp('h-16 resize-none')} value={form.terms} onChange={e => setF('terms', e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-dark-700">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={() => handleSave('draft')} disabled={saving} className="btn-ghost flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Draft'}
          </button>
          <button onClick={() => handleSave('sent')} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Mark Sent'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Invoice Modal
// ─────────────────────────────────────────────────────────────────────────────
function EditInvoiceModal({ invoice, companyId, session, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [loadingLines, setLoadingLines] = useState(true)
  const [clientSearch, setClientSearch] = useState('')
  const [form, setForm] = useState({
    client_name:             invoice.client_name || '',
    client_address:          invoice.client_address || '',
    client_gstin:            invoice.client_gstin || '',
    project_name:            invoice.project_name || '',
    invoice_date:            invoice.invoice_date || today(),
    due_date:                invoice.due_date || '',
    work_order_number:       invoice.work_order_number || '',
    work_order_date:         invoice.work_order_date || '',
    work_done_from:          invoice.work_done_from || '',
    work_done_to:            invoice.work_done_to || '',
    nature_of_supply:        invoice.nature_of_supply || '',
    place_of_supply:         invoice.place_of_supply || '',
    place_of_supply_address: invoice.place_of_supply_address || '',
    cgst_rate:               invoice.cgst_rate ?? 9,
    sgst_rate:               invoice.sgst_rate ?? 9,
    igst_rate:               invoice.igst_rate ?? 18,
    use_igst:                (invoice.igst_rate > 0 && !invoice.cgst_rate),
    discount_amount:         invoice.discount_amount || 0,
    notes:                   invoice.notes || '',
    terms:                   invoice.terms || 'Payment due within 30 days.',
  })
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Registered clients for re-selecting / changing client
  const { data: clientList = [] } = useQuery({
    queryKey: ['clients_invoice_picker', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, display_name, business_name, gstin, registered_address, city, state, pincode, payment_terms')
        .eq('company_id', companyId)
        .order('business_name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const applyClientEdit = (client) => {
    if (!client) return
    const name = client.display_name || client.business_name || ''
    const addrParts = [client.registered_address, client.city, client.state, client.pincode].filter(Boolean)
    const address = addrParts.join(', ')
    setForm(p => ({
      ...p,
      client_name:             name,
      client_address:          address,
      client_gstin:            client.gstin || '',
      place_of_supply:         client.state || '',
      place_of_supply_address: address,
    }))
    setClientSearch('')
  }

  const filteredClientsEdit = useMemo(() => {
    if (!clientSearch.trim()) return clientList.slice(0, 8)
    const q = clientSearch.toLowerCase()
    return clientList.filter(c =>
      (c.display_name || c.business_name || '').toLowerCase().includes(q) ||
      (c.gstin || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [clientList, clientSearch])

  // Equipment list for line item linking
  const { data: equipList = [] } = useQuery({
    queryKey: ['equip_list_invoice', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id, name, equipment_number, category')
        .eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Load existing line items
  useEffect(() => {
    supabase.from('invoice_line_items')
      .select('*').eq('invoice_id', invoice.id).order('sort_order')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLines(data.map(l => ({
            _id: l.id, description: l.description,
            item_code: l.item_code || '', sac_hsn_code: l.sac_hsn_code || '',
            quantity: l.quantity, unit: l.unit, rate: l.rate, amount: l.amount,
            equipment_id: l.equipment_id || '',
          })))
        }
        setLoadingLines(false)
      })
  }, [invoice.id])

  const updateLine = (id, key, val) => {
    setLines(prev => prev.map(l => {
      if (l._id !== id) return l
      const upd = { ...l, [key]: val }
      if (key === 'quantity' || key === 'rate') {
        upd.amount = (parseFloat(upd.quantity) || 0) * (parseFloat(upd.rate) || 0)
      }
      return upd
    }))
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const taxable  = useMemo(() => subtotal - (parseFloat(form.discount_amount) || 0), [subtotal, form.discount_amount])
  const cgst_amt = useMemo(() => form.use_igst ? 0 : taxable * (parseFloat(form.cgst_rate) || 0) / 100, [taxable, form.cgst_rate, form.use_igst])
  const sgst_amt = useMemo(() => form.use_igst ? 0 : taxable * (parseFloat(form.sgst_rate) || 0) / 100, [taxable, form.sgst_rate, form.use_igst])
  const igst_amt = useMemo(() => form.use_igst ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0, [taxable, form.igst_rate, form.use_igst])
  const total    = useMemo(() => taxable + cgst_amt + sgst_amt + igst_amt, [taxable, cgst_amt, sgst_amt, igst_amt])

  const handleSave = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      // Update invoice header
      const newBalance = Math.max(0, total - (invoice.paid_amount || 0))
      const editGSTRate = form.use_igst
        ? parseFloat(form.igst_rate)
        : (parseFloat(form.cgst_rate) + parseFloat(form.sgst_rate))

      const { error: invErr } = await supabase.from('client_invoices').update({
        invoice_date:    form.invoice_date,
        due_date:        form.due_date || null,
        client_name:     form.client_name.trim(),
        client_address:  form.client_address.trim() || null,
        client_gstin:    form.client_gstin.trim() || null,
        project_name:    form.project_name.trim() || null,
        work_order_number:       form.work_order_number.trim() || null,
        work_order_date:         form.work_order_date || null,
        work_done_from:          form.work_done_from || null,
        work_done_to:            form.work_done_to || null,
        nature_of_supply:        form.nature_of_supply.trim() || null,
        place_of_supply:         form.place_of_supply.trim() || null,
        place_of_supply_address: form.place_of_supply_address.trim() || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate),
        sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
        igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, balance_due: newBalance,
        notes: form.notes.trim() || null, terms: form.terms.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', invoice.id)
      if (invErr) throw invErr

      // Replace line items: delete old, insert new
      await supabase.from('invoice_line_items').delete().eq('invoice_id', invoice.id)
      const linePayload = lines.filter(l => l.description.trim()).map((l, i) => ({
        invoice_id:   invoice.id,
        company_id:   companyId,
        description:  l.description.trim(),
        item_code:    l.item_code?.trim() || null,
        sac_hsn_code: l.sac_hsn_code?.trim() || null,
        gst_rate:     editGSTRate,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
        equipment_id: l.equipment_id || null,
      }))
      if (linePayload.length > 0) {
        const { error: le } = await supabase.from('invoice_line_items').insert(linePayload)
        if (le) throw le
      }
      toast.success(`Invoice ${invoice.invoice_number} updated`)
      onSaved()
    } catch (e) { toast.error(e.message || 'Failed to update invoice')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Edit Invoice — ${invoice.invoice_number}`} onClose={onClose} wide>
      {loadingLines ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
      ) : (
        <div className="space-y-5">
          {/* Client Picker — always visible in edit */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Change Client</p>
            {clientList.length === 0 ? (
              <div className="bg-dark-700/50 border border-dark-600 rounded-xl px-4 py-3 text-xs text-slate-500">
                No registered clients found. Add clients in the <span className="text-primary-400 font-semibold">Clients</span> module.
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  <input
                    className={inp('pl-8 text-sm')}
                    placeholder={`Search from ${clientList.length} registered client${clientList.length > 1 ? 's' : ''} to update…`}
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                  />
                </div>
                {clientSearch.trim() && (
                  <div className="mt-1 bg-dark-700 border border-dark-600 rounded-xl overflow-hidden shadow-xl">
                    {filteredClientsEdit.length > 0 ? filteredClientsEdit.map(c => {
                      const name = c.display_name || c.business_name || ''
                      const addrShort = [c.city, c.state].filter(Boolean).join(', ')
                      return (
                        <button key={c.id} onClick={() => applyClientEdit(c)}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-dark-600 transition-colors text-left border-b border-dark-600 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-100 truncate">{name}</p>
                            <p className="text-xs text-slate-500">{addrShort}{c.gstin ? ` · GSTIN: ${c.gstin}` : ''}</p>
                          </div>
                          <span className="text-[10px] text-primary-400 font-semibold mt-1 shrink-0">Select →</span>
                        </button>
                      )
                    }) : (
                      <p className="px-4 py-3 text-xs text-slate-500">No client matches "{clientSearch}"</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Client details */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Client Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1 block">Client / Company Name *</label>
                <input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1 block">Client Address</label>
                <input className={inp()} value={form.client_address} onChange={e => setF('client_address', e.target.value)} placeholder="Full billing address" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Client GSTIN</label>
                <input className={inp()} value={form.client_gstin} onChange={e => setF('client_gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Invoice Date</label>
                <input type="date" className={inp()} value={form.invoice_date} onChange={e => setF('invoice_date', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
                <input type="date" className={inp()} value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Project Reference</label>
                <input className={inp()} value={form.project_name} onChange={e => setF('project_name', e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </div>

          {/* Work Order & Supply Details */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Work Order & Supply Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Work Order No.</label>
                <input className={inp()} value={form.work_order_number} onChange={e => setF('work_order_number', e.target.value)} placeholder="e.g. WO/2026/001" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Work Order Date</label>
                <input type="date" className={inp()} value={form.work_order_date} onChange={e => setF('work_order_date', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Work Done From</label>
                <input type="date" className={inp()} value={form.work_done_from} onChange={e => setF('work_done_from', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Work Done To</label>
                <input type="date" className={inp()} value={form.work_done_to} onChange={e => setF('work_done_to', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1 block">Nature of Supply</label>
                <input className={inp()} value={form.nature_of_supply} onChange={e => setF('nature_of_supply', e.target.value)} placeholder="e.g. Hiring of Backhoe Loader with Operator" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Place of Supply (State)</label>
                <input className={inp()} value={form.place_of_supply} onChange={e => setF('place_of_supply', e.target.value)} placeholder="e.g. Tamil Nadu" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Place of Supply Address</label>
                <input className={inp()} value={form.place_of_supply_address} onChange={e => setF('place_of_supply_address', e.target.value)} placeholder="Site / project address" />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Line Items</p>
              <button onClick={() => setLines(p => [...p, blankLine()])}
                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>
            <div className="space-y-2">
              <div className="hidden lg:grid grid-cols-12 gap-2 text-[10px] text-slate-500 font-bold uppercase px-1">
                <div className="col-span-4">Description</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-1">Unit</div>
                <div className="col-span-2">Rate (₹)</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-2" />
              </div>
              {lines.map(l => (
                <div key={l._id} className="space-y-1 bg-dark-700/30 rounded-lg p-2">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <input className={inp('text-xs')} value={l.description}
                        onChange={e => updateLine(l._id, 'description', e.target.value)} placeholder="Service description…" />
                    </div>
                    <div className="col-span-2">
                      <input type="number" className={inp('text-xs')} value={l.quantity}
                        onChange={e => updateLine(l._id, 'quantity', e.target.value)} min="0" step="0.5" />
                    </div>
                    <div className="col-span-1">
                      <select className={inp('text-xs')} value={l.unit} onChange={e => updateLine(l._id, 'unit', e.target.value)}>
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input type="number" className={inp('text-xs')} value={l.rate}
                        onChange={e => updateLine(l._id, 'rate', e.target.value)} placeholder="0" min="0" />
                    </div>
                    <div className="col-span-1 text-right text-xs text-slate-300 font-mono">{fmt(l.amount)}</div>
                    <div className="col-span-2 flex justify-end">
                      <button onClick={() => lines.length > 1 && setLines(p => p.filter(x => x._id !== l._id))}
                        className="text-slate-600 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input className="bg-dark-800 border border-dark-600 rounded-lg px-2 py-1 text-[10px] text-slate-400 focus:outline-none focus:border-primary-500"
                      value={l.item_code} onChange={e => updateLine(l._id, 'item_code', e.target.value)} placeholder="Item code (optional)" />
                    <input className="bg-dark-800 border border-dark-600 rounded-lg px-2 py-1 text-[10px] text-slate-400 focus:outline-none focus:border-primary-500"
                      value={l.sac_hsn_code} onChange={e => updateLine(l._id, 'sac_hsn_code', e.target.value)} placeholder="SAC / HSN code" />
                    {equipList.length > 0 && (
                      <select className="bg-dark-800 border border-dark-600 rounded-lg px-2 py-1 text-[10px] text-slate-400 focus:outline-none focus:border-primary-500"
                        value={l.equipment_id || ''} onChange={e => updateLine(l._id, 'equipment_id', e.target.value)}>
                        <option value="">— Link equipment —</option>
                        {equipList.map(eq => (
                          <option key={eq.id} value={eq.id}>
                            {eq.equipment_number ? `${eq.equipment_number} · ` : ''}{eq.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GST + Totals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tax</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.use_igst} onChange={e => setF('use_igst', e.target.checked)} className="rounded" />
                <span className="text-xs text-slate-300">Use IGST (interstate supply)</span>
              </label>
              {form.use_igst ? (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">IGST Rate (%)</label>
                  <input type="number" className={inp()} value={form.igst_rate} onChange={e => setF('igst_rate', e.target.value)} min="0" max="28" step="0.5" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">CGST (%)</label>
                    <input type="number" className={inp()} value={form.cgst_rate} onChange={e => setF('cgst_rate', e.target.value)} min="0" max="14" step="0.5" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">SGST (%)</label>
                    <input type="number" className={inp()} value={form.sgst_rate} onChange={e => setF('sgst_rate', e.target.value)} min="0" max="14" step="0.5" />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Discount (₹)</label>
                <input type="number" className={inp()} value={form.discount_amount} onChange={e => setF('discount_amount', e.target.value)} min="0" />
              </div>
            </div>
            <div className="bg-dark-700 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Summary</p>
              <Row label="Subtotal" val={fmt(subtotal)} />
              {parseFloat(form.discount_amount) > 0 && <Row label="Discount" val={`− ${fmt(form.discount_amount)}`} cls="text-red-400" />}
              <Row label="Taxable" val={fmt(taxable)} />
              {form.use_igst
                ? <Row label={`IGST (${form.igst_rate}%)`} val={fmt(igst_amt)} cls="text-slate-400" />
                : <>
                    <Row label={`CGST (${form.cgst_rate}%)`} val={fmt(cgst_amt)} cls="text-slate-400" />
                    <Row label={`SGST (${form.sgst_rate}%)`} val={fmt(sgst_amt)} cls="text-slate-400" />
                  </>
              }
              {invoice.paid_amount > 0 && <Row label="Already Paid" val={fmt(invoice.paid_amount)} cls="text-emerald-400" />}
              <div className="border-t border-dark-600 pt-2.5 flex justify-between font-bold text-base text-slate-100">
                <span>Total</span>
                <span className="font-mono text-emerald-400">{fmt(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes / Terms */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <textarea className={inp('h-16 resize-none')} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Any special instructions…" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Terms & Conditions</label>
              <textarea className={inp('h-16 resize-none')} value={form.terms} onChange={e => setF('terms', e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-dark-700">
            <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Payment Modal
// ─────────────────────────────────────────────────────────────────────────────
function RecordPaymentModal({ invoice, companyId, session, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    payment_date: today(), amount: invoice.balance_due,
    payment_mode: 'bank', bank_reference: '', notes: '',
  })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) return toast.error('Enter payment amount')
    if (amount > invoice.balance_due + 0.01) return toast.error(`Exceeds balance due (${fmt(invoice.balance_due)})`)
    setSaving(true)
    try {
      const { data: txn, error: te } = await supabase.from('account_transactions').insert({
        company_id: companyId, txn_date: form.payment_date, type: 'income',
        description: `Payment received — ${invoice.invoice_number} (${invoice.client_name})`,
        amount, payment_mode: form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        reference_type: 'invoice', reference_id: invoice.id,
        notes: form.notes.trim() || null, created_by: session.user.id,
      }).select().single()
      if (te) throw te

      await supabase.from('invoice_payments').insert({
        invoice_id: invoice.id, company_id: companyId,
        payment_date: form.payment_date, amount, payment_mode: form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        notes: form.notes.trim() || null,
        transaction_id: txn.id, created_by: session.user.id,
      })

      const newPaid    = (invoice.paid_amount || 0) + amount
      const newBalance = Math.max(0, invoice.total_amount - newPaid)
      const newStatus  = newBalance < 0.01 ? 'paid' : newPaid > 0 ? 'partial' : invoice.status
      await supabase.from('client_invoices').update({
        paid_amount: newPaid, balance_due: newBalance,
        status: newStatus, updated_at: new Date().toISOString(),
      }).eq('id', invoice.id)

      toast.success('Payment recorded')
      onSaved()
    } catch (e) { toast.error(e.message || 'Failed to record payment')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Record Payment — ${invoice.invoice_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-dark-700 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-500">Client</p><p className="text-slate-200 font-medium">{invoice.client_name}</p></div>
          <div><p className="text-xs text-slate-500">Total</p><p className="font-mono font-bold text-slate-100">{fmt(invoice.total_amount)}</p></div>
          <div><p className="text-xs text-slate-500">Paid So Far</p><p className="font-mono text-emerald-400">{fmt(invoice.paid_amount)}</p></div>
          <div><p className="text-xs text-slate-500">Balance Due</p><p className="font-mono font-bold text-amber-400">{fmt(invoice.balance_due)}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Payment Date</label>
            <input type="date" className={inp()} value={form.payment_date} onChange={e => setF('payment_date', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount Received (₹)</label>
            <input type="number" className={inp()} value={form.amount} onChange={e => setF('amount', e.target.value)} min="0" step="0.01" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Payment Mode</label>
            <select className={inp()} value={form.payment_mode} onChange={e => setF('payment_mode', e.target.value)}>
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Reference (UTR / Cheque No)</label>
            <input className={inp()} value={form.bank_reference} onChange={e => setF('bank_reference', e.target.value)} placeholder="Optional" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <input className={inp()} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Record Payment'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Expense Modal
// ─────────────────────────────────────────────────────────────────────────────
function AddExpenseModal({ companyId, session, equipmentList, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    expense_date: today(), category: 'salary', description: '',
    vendor_name: '', amount: '', gst_amount: '',
    vendor_gstin: '', payment_mode: 'cash', bank_reference: '',
    equipment_id: '', notes: '',
  })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.description.trim()) return toast.error('Description required')
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const gst_amount = parseFloat(form.gst_amount) || 0
      const { data: exp, error: ee } = await supabase.from('expenses').insert({
        company_id: companyId, expense_date: form.expense_date,
        category: form.category, description: form.description.trim(),
        vendor_name: form.vendor_name.trim() || null,
        amount, gst_amount, total_amount: amount + gst_amount,
        vendor_gstin: form.vendor_gstin.trim() || null,
        payment_mode: form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        equipment_id: form.equipment_id || null,
        source: 'manual',
        created_by: session.user.id,
      }).select().single()
      if (ee) throw ee

      const { error: te } = await supabase.from('account_transactions').insert({
        company_id: companyId, txn_date: form.expense_date, type: 'expense',
        description: form.description.trim(), amount, gst_amount,
        payment_mode: form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        reference_type: 'expense', reference_id: exp.id,
        equipment_id: form.equipment_id || null,
        notes: form.notes.trim() || null, created_by: session.user.id,
      })
      if (te) throw te

      toast.success('Expense recorded')
      onSaved()
    } catch (e) { toast.error(e.message || 'Failed to save expense')
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Add Expense" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date</label>
            <input type="date" className={inp()} value={form.expense_date} onChange={e => setF('expense_date', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Category</label>
            <select className={inp()} value={form.category} onChange={e => setF('category', e.target.value)}>
              {EXPENSE_CATS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Description *</label>
            <input className={inp()} value={form.description} onChange={e => setF('description', e.target.value)} placeholder="e.g. HSD purchase for JCB 3DX — 150 litres" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vendor / Supplier</label>
            <input className={inp()} value={form.vendor_name} onChange={e => setF('vendor_name', e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vendor GSTIN</label>
            <input className={inp()} value={form.vendor_gstin} onChange={e => setF('vendor_gstin', e.target.value.toUpperCase())} placeholder="For input credit" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount (₹) *</label>
            <input type="number" className={inp()} value={form.amount} onChange={e => setF('amount', e.target.value)} min="0" step="0.01" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">GST Amount (₹)</label>
            <input type="number" className={inp()} value={form.gst_amount} onChange={e => setF('gst_amount', e.target.value)} min="0" step="0.01" placeholder="Input tax credit" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Payment Mode</label>
            <select className={inp()} value={form.payment_mode} onChange={e => setF('payment_mode', e.target.value)}>
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Bill / Ref No</label>
            <input className={inp()} value={form.bank_reference} onChange={e => setF('bank_reference', e.target.value)} placeholder="Optional" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Equipment (optional — for cost tracking)</label>
            <select className={inp()} value={form.equipment_id} onChange={e => setF('equipment_id', e.target.value)}>
              <option value="">— No specific equipment —</option>
              {(equipmentList || []).map(eq => (
                <option key={eq.id} value={eq.id}>{eq.name}{eq.equipment_number ? ` (${eq.equipment_number})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <input className={inp()} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Expense'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny helper — row in summary box
// ─────────────────────────────────────────────────────────────────────────────
function Row({ label, val, cls = 'text-slate-300' }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${cls}`}>{val}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Tab
// ─────────────────────────────────────────────────────────────────────────────
function DashboardTab({ companyId, onNavigate }) {
  const thisMonth = useMemo(() => {
    const now = new Date()
    return {
      from: format(startOfMonth(now), 'yyyy-MM-dd'),
      to:   format(endOfMonth(now), 'yyyy-MM-dd'),
      label: format(now, 'MMMM yyyy'),
    }
  }, [])

  const { data: txns = [] } = useQuery({
    queryKey: ['acct_txns_dash', companyId, thisMonth.from],
    queryFn: async () => {
      const { data, error } = await supabase.from('account_transactions')
        .select('*').eq('company_id', companyId)
        .gte('txn_date', thisMonth.from).lte('txn_date', thisMonth.to)
        .order('txn_date', { ascending: false })
      if (error) throw error; return data
    },
    enabled: !!companyId,
  })

  const { data: outstanding = [] } = useQuery({
    queryKey: ['acct_outstanding', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_invoices')
        .select('id, invoice_number, client_name, balance_due, due_date, status')
        .eq('company_id', companyId).in('status', ['sent', 'partial', 'overdue'])
        .order('due_date', { ascending: true })
      if (error) throw error; return data
    },
    enabled: !!companyId,
  })

  const { data: expData = [] } = useQuery({
    queryKey: ['acct_exp_dash', companyId, thisMonth.from],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses')
        .select('category, amount').eq('company_id', companyId)
        .gte('expense_date', thisMonth.from).lte('expense_date', thisMonth.to)
        .in('category', ['salary','emi','interest','rent','insurance','admin','misc'])
      if (error) throw error; return data
    },
    enabled: !!companyId,
  })

  const income  = useMemo(() => txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [txns])
  const expense = useMemo(() => txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [txns])
  const netPL   = income - expense
  const totalOU = useMemo(() => outstanding.reduce((s, i) => s + i.balance_due, 0), [outstanding])

  const catBreakdown = useMemo(() => {
    const map = {}
    expData.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expData])

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <h2 className="text-base font-bold text-slate-100">Overview — {thisMonth.label}</h2>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Income', val: income, icon: <ArrowUpCircle className="w-4 h-4 text-emerald-400" />, cls: 'border-emerald-700/30', valCls: 'text-emerald-400' },
          { label: 'Expenses', val: expense, icon: <ArrowDownCircle className="w-4 h-4 text-red-400" />, cls: 'border-red-700/30', valCls: 'text-red-400' },
          { label: 'Net P&L', val: Math.abs(netPL), icon: netPL >= 0 ? <TrendingUp className="w-4 h-4 text-primary-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />, cls: netPL >= 0 ? 'border-primary-700/30' : 'border-red-700/30', valCls: netPL >= 0 ? 'text-primary-400' : 'text-red-400', note: netPL < 0 ? '(loss)' : '' },
          { label: 'Outstanding', val: totalOU, icon: <Clock className="w-4 h-4 text-amber-400" />, cls: 'border-amber-700/30', valCls: 'text-amber-400', note: `${outstanding.length} invoice${outstanding.length !== 1 ? 's' : ''}` },
        ].map((c, i) => (
          <div key={i} className={`bg-dark-800 rounded-xl p-4 border ${c.cls}`}>
            <div className="flex items-center gap-2 mb-2">
              {c.icon}
              <span className="text-xs text-slate-400">{c.label}</span>
            </div>
            <p className={`text-xl font-bold font-mono ${c.valCls}`}>{fmt(c.val)}{c.note && <span className="text-xs ml-1 font-normal">{c.note}</span>}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outstanding */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300">Pending Collections</h3>
            <button onClick={() => onNavigate('invoices')} className="text-xs text-primary-400 hover:text-primary-300">View all →</button>
          </div>
          {outstanding.length === 0
            ? <p className="text-xs text-slate-500 text-center py-4">No outstanding invoices 🎉</p>
            : outstanding.slice(0, 5).map(inv => {
                const overdue = inv.due_date && inv.due_date < today()
                return (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b border-dark-700 last:border-0">
                    <div>
                      <p className="text-sm text-slate-200 font-medium">{inv.client_name}</p>
                      <p className="text-xs text-slate-500">
                        {inv.invoice_number}
                        {inv.due_date && <span className={overdue ? ' text-red-400' : ''}> · {overdue ? '⚠ Overdue' : `Due ${fmtDate(inv.due_date)}`}</span>}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-bold text-amber-400">{fmt(inv.balance_due)}</p>
                  </div>
                )
              })
          }
        </div>

        {/* Expense breakdown */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300">Expense Breakdown</h3>
            <button onClick={() => onNavigate('expenses')} className="text-xs text-primary-400 hover:text-primary-300">View all →</button>
          </div>
          {catBreakdown.length === 0
            ? <p className="text-xs text-slate-500 text-center py-4">No expenses recorded this month</p>
            : catBreakdown.slice(0, 6).map(([cat, amt]) => {
                const ci = EXPENSE_CATS.find(c => c.value === cat) || { icon: '📦', label: cat }
                const pct = expense > 0 ? (amt / expense) * 100 : 0
                return (
                  <div key={cat} className="mb-2">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-300">{ci.icon} {ci.label}</span>
                      <span className="font-mono text-slate-200 text-xs">{fmt(amt)}</span>
                    </div>
                    <div className="w-full bg-dark-700 rounded-full h-1.5">
                      <div className="bg-primary-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300">Recent Transactions</h3>
          <button onClick={() => onNavigate('ledger')} className="text-xs text-primary-400 hover:text-primary-300">View ledger →</button>
        </div>
        {txns.length === 0
          ? <p className="text-xs text-slate-500 text-center py-4">No transactions this month. Start by raising an invoice or adding an expense.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-dark-700">
                    <th className="text-left pb-2 font-semibold">Date</th>
                    <th className="text-left pb-2 font-semibold">Description</th>
                    <th className="text-left pb-2 font-semibold">Mode</th>
                    <th className="text-right pb-2 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.slice(0, 8).map(t => (
                    <tr key={t.id} className="border-b border-dark-700/50 last:border-0">
                      <td className="py-2 text-slate-400 whitespace-nowrap">{fmtDate(t.txn_date)}</td>
                      <td className="py-2 text-slate-300 max-w-[200px]"><span className="truncate block">{t.description}</span></td>
                      <td className="py-2 text-slate-500 capitalize">{t.payment_mode || '—'}</td>
                      <td className={`py-2 text-right font-mono font-bold ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.type === 'income' ? '+' : '−'}{fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices Tab
// ─────────────────────────────────────────────────────────────────────────────
function InvoicesTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company } = useAuth()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [payTarget, setPayTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [generatingLink, setGeneratingLink] = useState(null) // invoice id being processed
  const [downloadingId, setDownloadingId] = useState(null)

  // ── Download GST-compliant PDF ────────────────────────────────────────────
  const handleDownloadPDF = async (inv) => {
    setDownloadingId(inv.id)
    try {
      const { data: lineItems, error } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', inv.id)
        .order('sort_order')
      if (error) throw error
      generateInvoicePDF(inv, lineItems || [], company)
    } catch (e) {
      toast.error(e.message || 'Failed to generate PDF')
    } finally {
      setDownloadingId(null)
    }
  }

  // ── Generate Razorpay payment link ────────────────────────────────────────
  const generatePaymentLink = async (inv) => {
    setGeneratingLink(inv.id)
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-link', {
        body: { invoice_id: inv.id },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Failed to create link')
      toast.success('Payment link ready — copy and send to client')
      qc.invalidateQueries({ queryKey: ['client_invoices', companyId] })
    } catch (e) {
      toast.error(e.message || 'Could not generate payment link')
    } finally {
      setGeneratingLink(null)
    }
  }

  const copyLink = (url) => {
    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  const shareWhatsApp = (inv) => {
    const msg = encodeURIComponent(
      `Hi, please find the payment link for ${inv.invoice_number}:\n${inv.payment_link_url}\n\nAmount due: ₹${Number(inv.balance_due).toLocaleString('en-IN')}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['client_invoices', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_invoices').select('*')
        .eq('company_id', companyId).order('invoice_date', { ascending: false })
      if (error) throw error; return data
    },
    enabled: !!companyId,
  })

  // Company payment info for UPI QR + bank details on invoices
  const { data: paymentInfo } = useQuery({
    queryKey: ['company_payment_info', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('companies')
        .select('upi_id, bank_account_name, bank_account_number, bank_ifsc, bank_name')
        .eq('id', companyId).single()
      return data || {}
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return inv.client_name.toLowerCase().includes(q)
        || inv.invoice_number.toLowerCase().includes(q)
        || (inv.project_name || '').toLowerCase().includes(q)
    }
    return true
  }), [invoices, statusFilter, search])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['client_invoices', companyId] })
    qc.invalidateQueries({ queryKey: ['acct_txns_dash'] })
    qc.invalidateQueries({ queryKey: ['acct_outstanding'] })
  }

  const handleStatus = async (id, s) => {
    const { error } = await supabase.from('client_invoices').update({ status: s, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success(`Marked as ${s}`); refresh() }
  }

  const handleDeleteInvoice = async (inv) => {
    if (inv.paid_amount > 0) {
      toast.error('Cannot delete — payments have been recorded against this invoice. Cancel it instead.')
      return
    }
    if (!window.confirm(`Delete invoice ${inv.invoice_number} for ${inv.client_name}? This cannot be undone.`)) return
    await supabase.from('invoice_line_items').delete().eq('invoice_id', inv.id)
    await supabase.from('client_invoices').delete().eq('id', inv.id)
    toast.success('Invoice deleted')
    setExpandedId(null)
    refresh()
  }

  const STATUS_FILTERS = ['all', 'draft', 'sent', 'partial', 'overdue', 'paid', 'cancelled']

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-dark-700 flex-shrink-0">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
            placeholder="Search client, invoice #…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm whitespace-nowrap">
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      <div className="flex gap-1 px-4 py-2 border-b border-dark-700 overflow-x-auto flex-shrink-0">
        {STATUS_FILTERS.map(s => {
          const info = s === 'all' ? { label: 'All' } : INV_STATUS[s]
          const count = s === 'all' ? invoices.length : invoices.filter(i => i.status === s).length
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${statusFilter === s ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'}`}>
              {info?.label || s}{count > 0 && <span className="ml-1 opacity-60">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading
          ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
          : filtered.length === 0
            ? <div className="text-center py-12 text-slate-500 text-sm">No invoices{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}. Click "New Invoice" to create one.</div>
            : filtered.map(inv => {
                const status = INV_STATUS[inv.status] || INV_STATUS.draft
                const isExp = expandedId === inv.id
                return (
                  <div key={inv.id} className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
                    <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-dark-700/30 transition-colors"
                      onClick={() => setExpandedId(isExp ? null : inv.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-xs text-slate-400">{inv.invoice_number}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${status.cls}`}>{status.label}</span>
                          {inv.project_name && <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{inv.project_name}</span>}
                        </div>
                        <p className="text-sm font-semibold text-slate-200 truncate">{inv.client_name}</p>
                        <p className="text-xs text-slate-500">{fmtDate(inv.invoice_date)}{inv.due_date && ` · Due ${fmtDate(inv.due_date)}`}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-bold font-mono text-slate-100">{fmt(inv.total_amount)}</p>
                        {inv.balance_due > 0.01
                          ? <p className="text-xs text-amber-400 font-mono">Balance: {fmt(inv.balance_due)}</p>
                          : <p className="text-xs text-emerald-400">✓ Paid</p>
                        }
                      </div>
                      {isExp ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                    </div>

                    {isExp && (
                      <div className="border-t border-dark-700 bg-dark-700/20 px-4 py-3">
                        <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                          <div><p className="text-slate-500">Subtotal</p><p className="text-slate-300 font-mono">{fmt(inv.subtotal)}</p></div>
                          <div><p className="text-slate-500">GST</p><p className="text-slate-300 font-mono">{fmt((inv.cgst_amount || 0) + (inv.sgst_amount || 0) + (inv.igst_amount || 0))}</p></div>
                          <div><p className="text-slate-500">Total</p><p className="text-slate-100 font-mono font-bold">{fmt(inv.total_amount)}</p></div>
                          <div><p className="text-slate-500">Paid</p><p className="text-emerald-400 font-mono">{fmt(inv.paid_amount)}</p></div>
                          <div><p className="text-slate-500">Balance</p><p className="text-amber-400 font-mono font-bold">{fmt(inv.balance_due)}</p></div>
                          {inv.client_gstin && <div><p className="text-slate-500">GSTIN</p><p className="text-slate-300">{inv.client_gstin}</p></div>}
                        </div>
                        {inv.notes && <p className="text-xs text-slate-400 mb-3 bg-dark-700 rounded-lg px-3 py-2">📝 {inv.notes}</p>}
                        <div className="flex gap-2 flex-wrap">
                          {/* Download GST Invoice PDF */}
                          <button
                            onClick={() => handleDownloadPDF(inv)}
                            disabled={downloadingId === inv.id}
                            className="btn-ghost text-xs py-1.5 border-emerald-700/50 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50">
                            {downloadingId === inv.id
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                              : <><Download className="w-3.5 h-3.5" /> Download PDF</>
                            }
                          </button>
                          {inv.status === 'draft' && (
                            <button onClick={() => handleStatus(inv.id, 'sent')} className="btn-ghost text-xs py-1.5 border-blue-700 text-blue-400 hover:bg-blue-500/10">
                              Mark as Sent
                            </button>
                          )}
                          {['sent', 'partial', 'overdue'].includes(inv.status) && (
                            <button onClick={() => setPayTarget(inv)} className="btn-primary text-xs py-1.5">
                              <Banknote className="w-3.5 h-3.5" /> Record Payment
                            </button>
                          )}
                          {!['paid', 'cancelled'].includes(inv.status) && (
                            <button onClick={() => setEditTarget(inv)} className="btn-ghost text-xs py-1.5 text-primary-400 hover:bg-primary-500/10">
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                          )}
                          {!['cancelled', 'paid'].includes(inv.status) && (
                            <button onClick={() => handleStatus(inv.id, 'cancelled')} className="btn-ghost text-xs py-1.5 text-red-400 hover:bg-red-500/10">
                              Cancel Invoice
                            </button>
                          )}
                          {['draft', 'cancelled'].includes(inv.status) && (
                            <button onClick={() => handleDeleteInvoice(inv)} className="btn-ghost text-xs py-1.5 text-red-500 hover:bg-red-500/10">
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          )}
                        </div>

                        {/* ── UPI QR + Bank Details ── */}
                        {(paymentInfo?.upi_id || paymentInfo?.bank_account_number) && ['sent','partial','overdue'].includes(inv.status) && (
                          <div className="mt-3 pt-3 border-t border-dark-600">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                              Pay Directly — 0% Fee
                            </p>
                            <div className="flex gap-3 items-start flex-wrap">
                              {paymentInfo.upi_id && (
                                <div className="flex items-start gap-3 bg-dark-700/60 rounded-xl p-3 flex-1 min-w-[200px]">
                                  <div className="shrink-0 bg-white p-1.5 rounded-lg">
                                    <img
                                      src={`https://chart.googleapis.com/chart?chs=80x80&cht=qr&chl=${encodeURIComponent(`upi://pay?pa=${encodeURIComponent(paymentInfo.upi_id)}&pn=${encodeURIComponent(paymentInfo.bank_account_name || '')}&am=${inv.balance_due}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`)}&choe=UTF-8`}
                                      alt="UPI QR" className="w-16 h-16"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-semibold text-emerald-400 mb-1">Scan & Pay via UPI</p>
                                    <p className="text-[11px] text-slate-300 font-mono">{paymentInfo.upi_id}</p>
                                    <p className="text-[11px] text-slate-500 mt-1">GPay · PhonePe · BHIM · any UPI app</p>
                                    <p className="text-[11px] text-amber-400 font-semibold mt-1">₹{Number(inv.balance_due).toLocaleString('en-IN')}</p>
                                  </div>
                                </div>
                              )}
                              {paymentInfo.bank_account_number && (
                                <div className="bg-dark-700/60 rounded-xl p-3 flex-1 min-w-[180px] space-y-1">
                                  <p className="text-[10px] font-semibold text-blue-400 mb-1.5">NEFT / RTGS Transfer</p>
                                  {paymentInfo.bank_account_name && <p className="text-[11px] text-slate-300"><span className="text-slate-500">Name: </span>{paymentInfo.bank_account_name}</p>}
                                  <p className="text-[11px] text-slate-300"><span className="text-slate-500">A/C: </span>{paymentInfo.bank_account_number}</p>
                                  <p className="text-[11px] text-slate-300"><span className="text-slate-500">IFSC: </span>{paymentInfo.bank_ifsc}</p>
                                  {paymentInfo.bank_name && <p className="text-[11px] text-slate-300"><span className="text-slate-500">Bank: </span>{paymentInfo.bank_name}</p>}
                                  <p className="text-[11px] text-slate-500 mt-1">Ref: {inv.invoice_number}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Razorpay Payment Link Section ── */}
                        {['sent', 'partial', 'overdue'].includes(inv.status) && (
                          <div className="mt-3 pt-3 border-t border-dark-600">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                              Online UPI Payment Link (Razorpay)
                            </p>
                            {inv.payment_link_url ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 bg-dark-700 rounded-lg px-3 py-2">
                                  <Link className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                  <span className="text-xs text-slate-300 font-mono flex-1 truncate">{inv.payment_link_url}</span>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => copyLink(inv.payment_link_url)}
                                    className="btn-ghost text-xs py-1.5 flex-1 border-emerald-700/50 text-emerald-400 hover:bg-emerald-500/10">
                                    <Copy className="w-3.5 h-3.5" /> Copy Link
                                  </button>
                                  <button
                                    onClick={() => shareWhatsApp(inv)}
                                    className="btn-ghost text-xs py-1.5 flex-1 border-green-700/50 text-green-400 hover:bg-green-500/10">
                                    <Share2 className="w-3.5 h-3.5" /> WhatsApp
                                  </button>
                                  <a
                                    href={inv.payment_link_url} target="_blank" rel="noopener noreferrer"
                                    className="btn-ghost text-xs py-1.5 flex-1 text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1">
                                    <ExternalLink className="w-3.5 h-3.5" /> Preview
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => generatePaymentLink(inv)}
                                disabled={generatingLink === inv.id}
                                className="w-full btn-ghost text-xs py-2 border-primary-700/50 text-primary-400 hover:bg-primary-500/10 disabled:opacity-50">
                                {generatingLink === inv.id
                                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating link…</>
                                  : <><Link className="w-3.5 h-3.5" /> Generate Razorpay Payment Link — client pays online</>
                                }
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
        }
      </div>

      {showCreate && (
        <CreateInvoiceModal companyId={companyId} session={session} invoiceCount={invoices.length}
          onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refresh() }} />
      )}
      {editTarget && (
        <EditInvoiceModal invoice={editTarget} companyId={companyId} session={session}
          onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); refresh() }} />
      )}
      {payTarget && (
        <RecordPaymentModal invoice={payTarget} companyId={companyId} session={session}
          onClose={() => setPayTarget(null)} onSaved={() => { setPayTarget(null); refresh() }} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Expense Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function ExpenseDetailModal({ exp, equipmentList, onClose, onEdit, onDelete }) {
  const ci = EXPENSE_CATS.find(c => c.value === exp.category) || { icon: '📦', label: exp.category }
  const isField = exp.source === 'field_expense'

  const Row = ({ label, value }) => value ? (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-dark-700/60 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs text-slate-200 text-right">{value}</span>
    </div>
  ) : null

  return (
    <Modal title="Expense Details" onClose={onClose}>
      <div className="space-y-4">
        {/* Header */}
        <div className={`rounded-xl p-4 flex items-center gap-4 ${isField ? 'bg-blue-900/20 border border-blue-700/30' : 'bg-dark-700'}`}>
          <div className="text-4xl">{ci.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-slate-100">{exp.description}</p>
              {isField && (
                <span className="text-[10px] font-bold bg-blue-900/40 border border-blue-700/50 text-blue-400 px-1.5 py-0.5 rounded-md">
                  📱 Field Exp
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{ci.label} · {fmtDate(exp.expense_date)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-mono font-bold text-red-400">{fmt(exp.amount)}</p>
            {exp.gst_amount > 0 && <p className="text-xs text-slate-500">+{fmt(exp.gst_amount)} GST</p>}
          </div>
        </div>

        {/* Details */}
        <div className="bg-dark-700/50 rounded-xl px-4">
          <Row label="Date"          value={fmtDate(exp.expense_date)} />
          <Row label="Category"      value={`${ci.icon} ${ci.label}`} />
          <Row label="Vendor / Payee" value={exp.vendor_name} />
          <Row label="Payment Mode"  value={exp.payment_mode ? exp.payment_mode.charAt(0).toUpperCase() + exp.payment_mode.slice(1) : null} />
          <Row label="Bill / Ref No" value={exp.bank_reference} />
          <Row label="Equipment"     value={exp.equipment?.name ? `${exp.equipment.name}${exp.equipment.equipment_number ? ` · ${exp.equipment.equipment_number}` : ''}` : null} />
          <Row label="Total Amount"  value={fmt(exp.total_amount || exp.amount)} />
          {exp.gst_amount > 0 && <Row label="GST Amount" value={fmt(exp.gst_amount)} />}
          <Row label="Notes"         value={exp.notes} />
          <Row label="Source"        value={isField ? 'Recorded via Field Expenses / APK' : 'Manually entered'} />
          {exp.created_at && <Row label="Created" value={(() => { try { return format(new Date(exp.created_at), 'dd MMM yyyy, hh:mm a') } catch { return exp.created_at } })()} />}
        </div>

        {isField && (
          <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg px-3 py-2 text-xs text-blue-400">
            This expense was recorded via the Field Expenses module. To edit it, go to Field Expenses and update it there — changes will reflect here automatically.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Close</button>
          {!isField && (
            <>
              <button onClick={onDelete}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-900/20 border border-red-800/40 text-red-400 hover:bg-red-900/40 text-sm font-semibold transition-colors">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
              <button onClick={onEdit}
                className="btn-primary flex-1 flex items-center gap-1.5">
                <Pencil className="w-4 h-4" /> Edit
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Expense Modal
// ─────────────────────────────────────────────────────────────────────────────
function EditExpenseModal({ exp, companyId, equipmentList, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    expense_date:  exp.expense_date || today(),
    category:      exp.category || 'fuel',
    description:   exp.description || '',
    vendor_name:   exp.vendor_name || '',
    amount:        String(exp.amount || ''),
    gst_amount:    String(exp.gst_amount || ''),
    payment_mode:  exp.payment_mode || 'cash',
    bank_reference: exp.bank_reference || '',
    equipment_id:  exp.equipment_id || '',
    notes:         exp.notes || '',
  })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.description.trim()) return toast.error('Description required')
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const gst_amount = parseFloat(form.gst_amount) || 0
      const total_amount = amount + gst_amount

      // Update expenses record
      const { error: ee } = await supabase.from('expenses').update({
        expense_date:   form.expense_date,
        category:       form.category,
        description:    form.description.trim(),
        vendor_name:    form.vendor_name.trim() || null,
        amount,
        gst_amount,
        total_amount,
        payment_mode:   form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        equipment_id:   form.equipment_id || null,
        notes:          form.notes.trim() || null,
      }).eq('id', exp.id)
      if (ee) throw ee

      // Also update the linked account_transaction
      await supabase.from('account_transactions').update({
        txn_date:       form.expense_date,
        description:    form.description.trim(),
        amount,
        gst_amount,
        payment_mode:   form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        equipment_id:   form.equipment_id || null,
        notes:          form.notes.trim() || null,
      }).eq('reference_type', 'expense').eq('reference_id', exp.id)

      toast.success('Expense updated')
      onSaved()
    } catch (e) {
      toast.error(e.message || 'Failed to update')
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Edit Expense" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date</label>
            <input type="date" className={inp()} value={form.expense_date} onChange={e => setF('expense_date', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Category</label>
            <select className={inp()} value={form.category} onChange={e => setF('category', e.target.value)}>
              {EXPENSE_CATS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Description *</label>
            <input className={inp()} value={form.description} onChange={e => setF('description', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vendor / Supplier</label>
            <input className={inp()} value={form.vendor_name} onChange={e => setF('vendor_name', e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount (₹) *</label>
            <input type="number" className={inp()} value={form.amount} onChange={e => setF('amount', e.target.value)} min="0" step="0.01" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">GST Amount (₹)</label>
            <input type="number" className={inp()} value={form.gst_amount} onChange={e => setF('gst_amount', e.target.value)} min="0" step="0.01" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Payment Mode</label>
            <select className={inp()} value={form.payment_mode} onChange={e => setF('payment_mode', e.target.value)}>
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Bill / Ref No</label>
            <input className={inp()} value={form.bank_reference} onChange={e => setF('bank_reference', e.target.value)} placeholder="Optional" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Equipment (optional)</label>
            <select className={inp()} value={form.equipment_id} onChange={e => setF('equipment_id', e.target.value)}>
              <option value="">— No specific equipment —</option>
              {(equipmentList || []).map(eq => (
                <option key={eq.id} value={eq.id}>{eq.name}{eq.equipment_number ? ` (${eq.equipment_number})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <input className={inp()} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Expenses Tab
// ─────────────────────────────────────────────────────────────────────────────
function ExpensesTab({ companyId, session, equipmentList }) {
  const qc = useQueryClient()
  const [catFilter, setCatFilter] = useState('all')
  const [month, setMonth] = useState(curMonth())
  const [showAdd, setShowAdd] = useState(false)
  const [detailExp, setDetailExp] = useState(null)
  const [editExp, setEditExp] = useState(null)

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', companyId, month],
    queryFn: async () => {
      const { from, to } = monthRange(month)
      const { data, error } = await supabase.from('expenses')
        .select('*, equipment:equipment_id(name, equipment_number)')
        .eq('company_id', companyId)
        .gte('expense_date', from).lte('expense_date', to)
        .in('category', ['salary','emi','interest','rent','insurance','admin','misc'])
        .order('expense_date', { ascending: false })
      if (error) throw error; return data
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => catFilter === 'all' ? expenses : expenses.filter(e => e.category === catFilter), [expenses, catFilter])
  const totalFiltered = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])
  const catTotals = useMemo(() => {
    const map = {}
    expenses.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount })
    return map
  }, [expenses])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['expenses', companyId] })
    qc.invalidateQueries({ queryKey: ['acct_txns_dash'] })
    qc.invalidateQueries({ queryKey: ['acct_exp_dash'] })
  }

  const handleDelete = async (exp) => {
    if (exp.source === 'field_expense') {
      toast('This expense was recorded from the Field Expenses module.\nTo delete it, go to Field Expenses → find the entry → delete it there.\nThis keeps your accounting and field records in sync.', {
        duration: 6000,
        icon: '⚠️',
      })
      return
    }
    if (!window.confirm('Delete this expense? This will also remove the ledger entry.')) return
    // Delete the linked account_transactions row first, then the expense
    await supabase.from('account_transactions')
      .delete()
      .eq('reference_type', 'expense')
      .eq('reference_id', exp.id)
    await supabase.from('expenses').delete().eq('id', exp.id)
    toast.success('Deleted'); refresh()
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-dark-700 flex-shrink-0">
        <input type="month" className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
          value={month} onChange={e => setMonth(e.target.value)} />
        <span className="text-sm text-slate-400">
          Total: <span className="font-mono font-bold text-red-400">{fmt(totalFiltered)}</span>
        </span>
        <div className="flex-1" />
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm whitespace-nowrap">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      <div className="flex gap-1 px-4 py-2 border-b border-dark-700 overflow-x-auto flex-shrink-0">
        <button onClick={() => setCatFilter('all')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${catFilter === 'all' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'}`}>
          All {expenses.length > 0 && <span className="opacity-60">{expenses.length}</span>}
        </button>
        {EXPENSE_CATS.filter(c => catTotals[c.value]).map(c => (
          <button key={c.value} onClick={() => setCatFilter(c.value)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${catFilter === c.value ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'}`}>
            {c.icon} {c.label}
            <span className="ml-1 opacity-60 font-mono">{fmt(catTotals[c.value])}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading
          ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
          : filtered.length === 0
            ? <div className="text-center py-12 text-slate-500 text-sm">No expenses for this period. Click "Add Expense" to record one.</div>
            : filtered.map(exp => {
                const ci = EXPENSE_CATS.find(c => c.value === exp.category) || { icon: '📦', label: exp.category }
                return (
                  <div key={exp.id}
                    onClick={() => setDetailExp(exp)}
                    className={`bg-dark-800 rounded-xl border p-4 flex items-start gap-3 cursor-pointer hover:border-primary-600/50 transition-colors ${exp.source === 'field_expense' ? 'border-blue-700/40 hover:border-blue-500/60' : 'border-dark-700'}`}>
                    <div className="text-2xl mt-0.5">{ci.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-200">{exp.description}</p>
                            {exp.source === 'field_expense' && (
                              <span className="text-[10px] font-bold bg-blue-900/40 border border-blue-700/50 text-blue-400 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                                📱 Field Exp
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {fmtDate(exp.expense_date)}
                            {exp.vendor_name && ` · ${exp.vendor_name}`}
                            {exp.equipment?.name && ` · ${exp.equipment.name}`}
                            {exp.payment_mode && ` · ${exp.payment_mode.charAt(0).toUpperCase() + exp.payment_mode.slice(1)}`}
                          </p>
                          {exp.bank_reference && <p className="text-xs text-slate-600 mt-0.5">Ref: {exp.bank_reference}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono font-bold text-red-400 text-base">{fmt(exp.amount)}</p>
                          {exp.gst_amount > 0 && <p className="text-[10px] text-slate-500">GST: {fmt(exp.gst_amount)}</p>}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 mt-1 shrink-0" />
                  </div>
                )
              })
        }
      </div>

      {showAdd && (
        <AddExpenseModal companyId={companyId} session={session} equipmentList={equipmentList}
          onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refresh() }} />
      )}

      {detailExp && !editExp && (
        <ExpenseDetailModal
          exp={detailExp}
          equipmentList={equipmentList}
          onClose={() => setDetailExp(null)}
          onEdit={() => setEditExp(detailExp)}
          onDelete={() => { handleDelete(detailExp); setDetailExp(null) }}
        />
      )}

      {editExp && (
        <EditExpenseModal
          exp={editExp}
          companyId={companyId}
          equipmentList={equipmentList}
          onClose={() => setEditExp(null)}
          onSaved={() => { setEditExp(null); setDetailExp(null); refresh() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Tab (all transactions)
// ─────────────────────────────────────────────────────────────────────────────
// ── Ledger export helpers ─────────────────────────────────────────────────────
const fmtINRLedger = n =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDateShort = d => {
  if (!d) return '—'
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
}

const tallyDate = d => {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}`
}

const tallyLedgerName = (txn) => {
  const CAT_MAP = {
    salary: 'Salary Expenses', emi: 'EMI / Loan Repayment', rent: 'Rent Expenses',
    insurance: 'Insurance Expenses', interest: 'Interest & Finance Charges',
    admin: 'Administrative Expenses', misc: 'Miscellaneous Expenses',
    fuel: 'Fuel Expenses', food: 'Food & Catering', travel: 'Travel Expenses',
    accommodation: 'Accommodation Expenses', medical: 'Medical Expenses',
    site_allowance: 'Site Allowance', spares_purchase: 'Spares & Parts',
    repairs_maintenance: 'Repairs & Maintenance', invoice_payment: 'Creditors',
    other: 'Miscellaneous Expenses',
  }
  if (txn.type === 'income') return CAT_MAP[txn.reference_type] || 'Sales / Income'
  return CAT_MAP[txn.reference_type] || 'General Expenses'
}

const paymentLedgerName = (mode) => {
  const MAP = { cash: 'Cash', upi: 'UPI Payable', bank_transfer: 'Bank Account', cheque: 'Bank Account', card: 'Bank Account' }
  return MAP[mode] || 'Cash'
}

function generateTallyXML(txns, company) {
  const vouchers = txns.map(t => {
    const vchType = t.type === 'income' ? 'Receipt' : 'Payment'
    const isIncome = t.type === 'income'
    const amt = Math.abs(Number(t.amount || 0))
    const ledger = tallyLedgerName(t)
    const payLedger = paymentLedgerName(t.payment_mode)
    return `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER REMOTEID="${t.id}" VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate(t.txn_date)}</DATE>
            <NARRATION>${(t.description || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</NARRATION>
            <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${t.bank_reference || t.id.slice(0,8).toUpperCase()}</VOUCHERNUMBER>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${isIncome ? payLedger : ledger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${isIncome ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${isIncome ? amt : -amt}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${isIncome ? ledger : payLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${isIncome ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${isIncome ? -amt : amt}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${(company?.name || '').replace(/&/g,'&amp;')}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

function generateCSV(txns, company, fromDate, toDate) {
  const header = [
    `"${company?.name || 'Company'}"`, '', '', '', '', '',
    `"Period: ${fromDate} to ${toDate}"`,
  ].join(',')
  const cols = ['Date','Description','Type','Category','Payment Mode','Reference','Amount (INR)']
  const rows = txns.map(t => [
    fmtDateShort(t.txn_date),
    `"${(t.description || '').replace(/"/g,'""')}"`,
    t.type === 'income' ? 'Income' : 'Expense',
    t.reference_type || 'manual',
    t.payment_mode || '',
    t.bank_reference || '',
    (t.type === 'income' ? '' : '-') + fmtINRLedger(t.amount),
  ].join(','))
  return [header, cols.join(','), ...rows].join('\n')
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Period presets (Indian financial year: Apr 1 – Mar 31) ───────────────────
function getLedgerPresets() {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()  // 0-indexed
  // Use LOCAL date parts — toISOString() converts to UTC and shifts the date in IST (UTC+5:30)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const today = iso(now)

  // FY: Apr 1 – Mar 31; if month < 3 (Jan-Mar) we're in previous calendar year's FY
  const fyY     = m >= 3 ? y : y - 1
  const fyStart = iso(new Date(fyY,     3, 1))
  const fyEnd   = iso(new Date(fyY + 1, 2, 31))
  const pfyStart= iso(new Date(fyY - 1, 3, 1))
  const pfyEnd  = iso(new Date(fyY,     2, 31))

  // Current quarter (FY basis): Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
  let qS, qE, pqS, pqE
  if (m >= 3 && m <= 5)       { qS=new Date(y,3,1);  qE=new Date(y,5,30);  pqS=new Date(y,0,1);   pqE=new Date(y,2,31)  }
  else if (m >= 6 && m <= 8)  { qS=new Date(y,6,1);  qE=new Date(y,8,30);  pqS=new Date(y,3,1);   pqE=new Date(y,5,30)  }
  else if (m >= 9 && m <= 11) { qS=new Date(y,9,1);  qE=new Date(y,11,31); pqS=new Date(y,6,1);   pqE=new Date(y,8,30)  }
  else                         { qS=new Date(y,0,1);  qE=new Date(y,2,31);  pqS=new Date(y-1,9,1); pqE=new Date(y-1,11,31) }

  // Last month
  const lmStart = iso(new Date(y, m - 1, 1))
  const lmEnd   = iso(new Date(y, m, 0))

  return [
    { label: 'This Month', from: iso(new Date(y, m, 1)),  to: today     },
    { label: 'Last Month', from: lmStart,                 to: lmEnd     },
    { label: 'This Qtr',   from: iso(qS),                 to: iso(qE)   },
    { label: 'Last Qtr',   from: iso(pqS),                to: iso(pqE)  },
    { label: 'This FY',    from: fyStart,                  to: today     },
    { label: 'Last FY',    from: pfyStart,                 to: pfyEnd    },
  ]
}

// ── LedgerTab ─────────────────────────────────────────────────────────────────
function LedgerTab({ companyId }) {
  const _today    = new Date()
  const _isoLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const firstDay  = _isoLocal(new Date(_today.getFullYear(), _today.getMonth(), 1))
  const todayISO  = _isoLocal(_today)

  const [fromDate, setFromDate]   = useState(firstDay)
  const [toDate,   setToDate]     = useState(todayISO)
  const [typeFilter, setTypeFilter] = useState('all')
  const [search,   setSearch]     = useState('')
  const [detailed, setDetailed]   = useState(true)
  const [exporting, setExporting] = useState(null)
  const [showExport, setShowExport] = useState(false)

  // Company info — comes from AuthContext (already fetched at login, always available)
  const { company } = useAuth()

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ['acct_txns_ledger', companyId, fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('account_transactions').select('*')
        .eq('company_id', companyId)
        .gte('txn_date', fromDate).lte('txn_date', toDate)
        .order('txn_date', { ascending: true })
      if (error) throw error
      const rows = data || []
      // Enrich expense rows with actual sub-category from the expenses table
      const expIds = rows.filter(t => t.reference_type === 'expense' && t.reference_id).map(t => t.reference_id)
      if (expIds.length > 0) {
        const { data: cats } = await supabase.from('expenses').select('id, category').in('id', expIds)
        const catMap = Object.fromEntries((cats || []).map(e => [e.id, e.category]))
        return rows.map(t => ({
          ...t,
          expense_category: t.reference_type === 'expense' ? (catMap[t.reference_id] || null) : null,
        }))
      }
      return rows
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => txns.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (t.description || '').toLowerCase().includes(q) || (t.bank_reference || '').toLowerCase().includes(q)
    }
    return true
  }), [txns, typeFilter, search])

  const income  = useMemo(() => filtered.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), [filtered])
  const expense = useMemo(() => filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0), [filtered])

  // Category label helper
  const catLabel = (t) => {
    if (t.expense_category) return t.expense_category.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
    if (t.reference_type === 'invoice_payment') return 'Invoice Payment'
    if (t.reference_type === 'income') return 'Income'
    return (t.reference_type || 'manual').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  // Summary: group by actual expense category
  const summary = useMemo(() => {
    const map = {}
    filtered.forEach(t => {
      const cat = t.expense_category || t.reference_type || 'manual'
      const key = `${t.type}__${cat}`
      if (!map[key]) map[key] = { type: t.type, category: cat, total: 0, count: 0 }
      map[key].total += Number(t.amount); map[key].count++
    })
    return Object.values(map).sort((a,b) => b.total - a.total)
  }, [filtered])

  const presets = getLedgerPresets()
  const activePreset = presets.find(p => p.from === fromDate && p.to === toDate)?.label || null

  const applyPreset = (p) => { setFromDate(p.from); setToDate(p.to) }

  const periodLabel = `${fmtDateShort(fromDate)} – ${fmtDateShort(toDate)}`

  // ── Export functions ──────────────────────────────────────────────────────
  const exportPDF = async () => {
    setExporting('pdf')
    try {
      // company comes from useAuth() — always populated after login
      const coName    = company?.name    || ''
      const coAddress = company?.address || ''
      const coGST     = company?.gstin   || ''
      const coPhone   = company?.phone   || ''
      const coEmail   = company?.email   || ''

      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      // Landscape for detailed view (7 columns), portrait for summary (4 columns)
      const orientation = detailed ? 'landscape' : 'portrait'
      const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()
      const H = doc.internal.pageSize.getHeight()
      const M = 10   // 10 mm margin all sides

      // ─── HEADER ────────────────────────────────────────────────────────────
      // Top dark band
      doc.setFillColor(17, 24, 39)   // near-black
      doc.rect(0, 0, W, 30, 'F')

      // Company name — white, bold
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(255, 255, 255)
      doc.text(coName || 'Your Company', M, 12)

      // Company details — light grey under name
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(180, 188, 200)
      const details = [coAddress, coGST ? `GSTIN: ${coGST}` : '', coPhone ? `Ph: ${coPhone}` : '', coEmail]
        .filter(Boolean).join('   ·   ')
      if (details) doc.text(details, M, 20, { maxWidth: W / 2 - M })

      // Right side: title + period
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(96, 165, 250)   // blue-400
      doc.text('ACCOUNT LEDGER', W - M, 12, { align: 'right' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(180, 188, 200)
      doc.text(`Period : ${periodLabel}`, W - M, 20, { align: 'right' })
      doc.text(`Generated : ${new Date().toLocaleString('en-IN')}`, W - M, 26, { align: 'right' })

      // ─── SUMMARY ROW ───────────────────────────────────────────────────────
      doc.setFillColor(243, 244, 246)   // pale grey
      doc.rect(M, 34, W - 2 * M, 10, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8)

      const colW  = (W - 2 * M) / 3
      // Credit
      doc.setTextColor(22, 163, 74)
      doc.text(`Total Credit (Income) :  ₹${fmtINRLedger(income)}`, M + 3, 40.5)
      // Debit
      doc.setTextColor(220, 38, 38)
      doc.text(`Total Debit (Expense) :  ₹${fmtINRLedger(expense)}`, M + colW + 3, 40.5)
      // Net
      const isPos = income - expense >= 0
      doc.setTextColor(isPos ? 22 : 220, isPos ? 163 : 38, isPos ? 74 : 38)
      doc.text(
        `Net Balance :  ₹${fmtINRLedger(Math.abs(income - expense))} ${isPos ? 'Cr' : 'Dr'}`,
        M + 2 * colW + 3, 40.5
      )

      // ─── TABLE ─────────────────────────────────────────────────────────────
      const baseStyles = {
        fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
        overflow: 'ellipsize', textColor: [30, 30, 30],
        lineColor: [220, 220, 220], lineWidth: 0.2,
      }
      const headSt = {
        fillColor: [229, 231, 235], textColor: [15, 23, 42],
        fontStyle: 'bold', fontSize: 8.5, halign: 'left',
      }

      if (!detailed) {
        autoTable(doc, {
          startY: 47,
          margin: { left: M, right: M },
          head: [['Type', 'Category', 'Txns', 'Amount (₹)']],
          body: summary.map(s => [
            s.type === 'income' ? 'Income' : 'Expense',
            s.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            String(s.count),
            fmtINRLedger(s.total),
          ]),
          styles: baseStyles,
          headStyles: headSt,
          alternateRowStyles: { fillColor: [249, 250, 251] },
          bodyStyles:         { fillColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 26 },
            2: { halign: 'center', cellWidth: 18 },
            3: { halign: 'right',  fontStyle: 'bold', cellWidth: 36 },
          },
          didParseCell: (d) => {
            if (d.section !== 'body') return
            const s = summary[d.row.index]
            if (!s) return
            const clr = s.type === 'income' ? [22,163,74] : [220,38,38]
            if (d.column.index === 0 || d.column.index === 3) d.cell.styles.textColor = clr
          },
        })
      } else {
        autoTable(doc, {
          startY: 47,
          margin: { left: M, right: M },
          head: [['Date', 'Description', 'Expense Category', 'Mode', 'Ref / Voucher', 'Debit (₹)', 'Credit (₹)']],
          body: filtered.map(t => [
            fmtDateShort(t.txn_date),
            t.description || '',
            // Actual expense sub-category (salary / fuel / travel etc.) — not just "expense"
            t.expense_category
              ? t.expense_category.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
              : (t.reference_type === 'invoice_payment' ? 'Invoice Payment'
                : t.type === 'income' ? 'Income'
                : (t.reference_type || '').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())),
            (t.payment_mode || '—').toUpperCase(),
            t.bank_reference || '—',
            t.type === 'expense' ? fmtINRLedger(t.amount) : '',
            t.type === 'income'  ? fmtINRLedger(t.amount) : '',
          ]),
          // ── Column totals in the footer row ──
          foot: [['', '', '', '', 'TOTAL', fmtINRLedger(expense), fmtINRLedger(income)]],
          showFoot: 'lastPage',
          styles: baseStyles,
          headStyles: headSt,
          footStyles: {
            fillColor: [229, 231, 235], textColor: [15, 23, 42],
            fontStyle: 'bold', fontSize: 8.5,
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          bodyStyles:         { fillColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 22 },
            2: { cellWidth: 34 },
            3: { cellWidth: 16, halign: 'center' },
            4: { cellWidth: 26 },
            5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
            6: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
          },
          didParseCell: (d) => {
            if (d.section === 'body') {
              if (d.column.index === 5 && d.cell.raw) d.cell.styles.textColor = [220, 38, 38]
              if (d.column.index === 6 && d.cell.raw) d.cell.styles.textColor = [22, 163, 74]
            }
            if (d.section === 'foot') {
              if (d.column.index === 5) d.cell.styles.textColor = [220, 38, 38]
              if (d.column.index === 6) d.cell.styles.textColor = [22, 163, 74]
              d.cell.styles.halign = d.column.index >= 5 ? 'right' : 'left'
            }
          },
        })

        // ── Summary block — LEFT side, one line each ──────────────────────────
        const tY = doc.lastAutoTable.finalY + 6
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.2)
        doc.line(M, tY - 2, M + 90, tY - 2)   // short line only under summary

        doc.setFont('helvetica', 'bold'); doc.setFontSize(9)

        doc.setTextColor(220, 38, 38)
        doc.text(`Total Debit (Expense)  :   ₹${fmtINRLedger(expense)}`, M + 2, tY + 5)

        doc.setTextColor(22, 163, 74)
        doc.text(`Total Credit (Income)  :   ₹${fmtINRLedger(income)}`, M + 2, tY + 13)

        const netPos = income - expense >= 0
        doc.setTextColor(netPos ? 22 : 220, netPos ? 163 : 38, netPos ? 74 : 38)
        doc.text(
          `Net Balance               :   ₹${fmtINRLedger(Math.abs(income - expense))} ${netPos ? 'Cr' : 'Dr'}`,
          M + 2, tY + 21
        )
      }

      // ─── PAGE FOOTER ────────────────────────────────────────────────────────
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150)
        doc.text(coName, M, H - 5)
        doc.text(`Page ${i} of ${pageCount}`, W / 2, H - 5, { align: 'center' })
        doc.text(`Period: ${periodLabel}`, W - M, H - 5, { align: 'right' })
        // footer line
        doc.setDrawColor(220,220,220); doc.setLineWidth(0.2)
        doc.line(M, H - 8, W - M, H - 8)
      }

      doc.save(`Ledger_${coName || 'Nhance'}_${fromDate}_${toDate}.pdf`)
      toast.success('PDF downloaded')
    } catch (e) { console.error(e); toast.error('PDF export failed') }
    finally { setExporting(null); setShowExport(false) }
  }

  const exportExcel = async () => {
    setExporting('excel')
    try {
      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()

      // Info sheet
      const infoData = [
        ['Company', company?.name || ''],
        ['Address', company?.address || ''],
        ['GSTIN', company?.gstin || ''],
        ['Phone', company?.phone || ''],
        ['Period', periodLabel],
        ['Generated', new Date().toLocaleString('en-IN')],
        [],
        ['Total Income', income],
        ['Total Expense', expense],
        ['Net', income - expense],
      ]
      const wsInfo = XLSX.utils.aoa_to_sheet(infoData)
      XLSX.utils.book_append_sheet(wb, wsInfo, 'Summary Info')

      if (detailed) {
        // Detailed sheet
        const rows = [
          ['Date','Description','Type','Category','Payment Mode','Reference','Debit','Credit','Balance'],
        ]
        let balance = 0
        filtered.forEach(t => {
          const dr = t.type === 'expense' ? Number(t.amount) : 0
          const cr = t.type === 'income'  ? Number(t.amount) : 0
          balance += cr - dr
          rows.push([
            fmtDateShort(t.txn_date), t.description || '', t.type,
            t.reference_type || 'manual', t.payment_mode || '', t.bank_reference || '',
            dr || '', cr || '', balance,
          ])
        })
        rows.push(['','','','','','','Total Debit →', expense, ''])
        rows.push(['','','','','','','Total Credit →', '', income])
        const ws = XLSX.utils.aoa_to_sheet(rows)
        ws['!cols'] = [{ wch:12 },{ wch:40 },{ wch:10 },{ wch:18 },{ wch:14 },{ wch:18 },{ wch:14 },{ wch:14 },{ wch:14 }]
        XLSX.utils.book_append_sheet(wb, ws, 'Ledger Detail')
      }

      // Summary sheet
      const sumRows = [['Type','Category','Count','Amount']]
      summary.forEach(s => sumRows.push([
        s.type === 'income' ? 'Income' : 'Expense', s.category, s.count,
        s.type === 'income' ? s.total : -s.total,
      ]))
      const wsSum = XLSX.utils.aoa_to_sheet(sumRows)
      wsSum['!cols'] = [{ wch:10 },{ wch:24 },{ wch:8 },{ wch:14 }]
      XLSX.utils.book_append_sheet(wb, wsSum, 'Category Summary')

      XLSX.writeFile(wb, `Ledger_${company?.name || 'Nhance'}_${fromDate}_${toDate}.xlsx`)
      toast.success('Excel downloaded')
    } catch (e) { console.error(e); toast.error('Excel export failed') }
    finally { setExporting(null); setShowExport(false) }
  }

  const exportTally = () => {
    setExporting('tally')
    try {
      const xml = generateTallyXML(filtered, company)
      downloadFile(xml, `Tally_${company?.name || 'Nhance'}_${fromDate}_${toDate}.xml`, 'application/xml')
      toast.success('Tally XML downloaded — import via Gateway of Tally → Import Data → Vouchers')
    } catch (e) { console.error(e); toast.error('Tally export failed') }
    finally { setExporting(null); setShowExport(false) }
  }

  const exportCSV = () => {
    setExporting('csv')
    try {
      const csv = generateCSV(filtered, company, fromDate, toDate)
      downloadFile(csv, `Ledger_${company?.name || 'Nhance'}_${fromDate}_${toDate}.csv`, 'text/csv')
      toast.success('CSV downloaded')
    } catch (e) { console.error(e); toast.error('CSV export failed') }
    finally { setExporting(null); setShowExport(false) }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top controls ───────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-dark-700 flex-shrink-0 space-y-3">

        {/* Row 1: Date range + type filter */}
        {/* Row 1: Period presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <CalendarRange className="w-4 h-4 text-slate-500 shrink-0 mr-1" />
          {presets.map(p => (
            <button key={p.label} onClick={() => applyPreset(p)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                activePreset === p.label
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-slate-200 hover:border-dark-500'
              }`}>
              {p.label}
            </button>
          ))}
          <span className="text-dark-600 text-xs mx-1">|</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-primary-500" />
          <span className="text-slate-500 text-xs">–</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-primary-500" />
        </div>

        {/* Row 2: Type filter + search + toggles + summary + export */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {['all','income','expense'].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${typeFilter === t ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'}`}>
                {t === 'all' ? 'All' : t === 'income' ? '📈 Income' : '📉 Expense'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input className="bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 w-44"
              placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Detailed toggle */}
          <button onClick={() => setDetailed(d => !d)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-600 text-xs font-semibold transition-all hover:border-primary-500"
            title="Toggle detailed/summary view">
            {detailed
              ? <ToggleRight className="w-4 h-4 text-primary-400" />
              : <ToggleLeft  className="w-4 h-4 text-slate-500" />}
            <span className={detailed ? 'text-primary-400' : 'text-slate-400'}>
              {detailed ? 'Detailed' : 'Summary'}
            </span>
          </button>

          {/* Net summary */}
          <div className="flex gap-4 text-xs ml-auto flex-wrap">
            <span className="text-slate-400">In: <span className="text-emerald-400 font-mono font-bold">{fmt(income)}</span></span>
            <span className="text-slate-400">Out: <span className="text-red-400 font-mono font-bold">{fmt(expense)}</span></span>
            <span className={`font-mono font-bold text-xs ${income - expense >= 0 ? 'text-primary-400' : 'text-red-400'}`}>
              Net: {fmt(Math.abs(income - expense))} {income - expense >= 0 ? 'Cr' : 'Dr'}
            </span>
          </div>

          {/* Export dropdown */}
          <div className="relative">
            <button onClick={() => setShowExport(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-all">
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-52 py-1">
                <p className="px-3 py-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wide border-b border-dark-700">
                  {filtered.length} transactions · {periodLabel}
                </p>
                {[
                  { key:'pdf',   icon:'📄', label:'PDF Report',     sub:'Formatted, printable',   fn: exportPDF   },
                  { key:'excel', icon:'📊', label:'Excel (.xlsx)',   sub:'Multi-sheet workbook',   fn: exportExcel },
                  { key:'tally', icon:'🔷', label:'Tally XML',       sub:'Import into Tally ERP',  fn: exportTally },
                  { key:'csv',   icon:'📋', label:'CSV',             sub:'Universal spreadsheet',  fn: exportCSV   },
                ].map(({ key, icon, label, sub, fn }) => (
                  <button key={key} onClick={fn} disabled={!!exporting}
                    className="w-full text-left px-3 py-2.5 hover:bg-dark-700 flex items-center gap-3 transition-colors disabled:opacity-50">
                    <span className="text-base">{icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        {exporting === key ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
                        {label}
                      </p>
                      <p className="text-[11px] text-slate-500">{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" onClick={() => showExport && setShowExport(false)}>
        {isLoading
          ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
          : filtered.length === 0
            ? <div className="text-center py-12 text-slate-500 text-sm">No transactions for this period</div>
            : !detailed
              /* ── Summary view ── */
              ? (
                <div className="p-4 space-y-2">
                  {['income','expense'].map(type => {
                    const rows = summary.filter(s => s.type === type)
                    if (!rows.length) return null
                    const total = rows.reduce((s,r) => s + r.total, 0)
                    return (
                      <div key={type} className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                        <div className={`px-4 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide ${type === 'income' ? 'bg-emerald-900/30 text-emerald-400 border-b border-emerald-800/40' : 'bg-red-900/30 text-red-400 border-b border-red-800/40'}`}>
                          <span>{type === 'income' ? '📈 Income' : '📉 Expense'}</span>
                          <span className="font-mono">{fmt(total)}</span>
                        </div>
                        {rows.map(r => (
                          <div key={r.category} className="px-4 py-2.5 flex items-center justify-between border-b border-dark-700/50 last:border-0">
                            <div>
                              <p className="text-sm text-slate-200 capitalize">{r.category.replace(/_/g,' ')}</p>
                              <p className="text-[11px] text-slate-500">{r.count} transaction{r.count !== 1 ? 's' : ''}</p>
                            </div>
                            <span className={`font-mono font-bold text-sm ${type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {fmt(r.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
              /* ── Detailed view ── */
              : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-dark-900 z-10">
                    <tr className="text-slate-500 border-b border-dark-700">
                      <th className="text-left px-4 py-3 font-semibold">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Description</th>
                      <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Category</th>
                      <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Mode</th>
                      <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Reference</th>
                      <th className="text-right px-4 py-3 font-semibold text-red-400">Debit</th>
                      <th className="text-right px-4 py-3 font-semibold text-emerald-400">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => (
                      <tr key={t.id} className="border-b border-dark-700/50 hover:bg-dark-800 transition-colors">
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtDateShort(t.txn_date)}</td>
                        <td className="px-4 py-3 text-slate-300 max-w-[200px]"><span className="truncate block">{t.description}</span></td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-slate-300 font-medium whitespace-nowrap">
                            {catLabel(t)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 uppercase text-xs hidden md:table-cell">{t.payment_mode || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{t.bank_reference || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-red-400 whitespace-nowrap">
                          {t.type === 'expense' ? fmt(t.amount) : ''}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                          {t.type === 'income' ? fmt(t.amount) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-dark-900 border-t-2 border-dark-600">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-xs font-bold text-slate-400">
                        {filtered.length} transactions · {periodLabel}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-red-400">{fmt(expense)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{fmt(income)}</td>
                    </tr>
                  </tfoot>
                </table>
              )
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AccountsPage — main export
// ─────────────────────────────────────────────────────────────────────────────
// ── Fixed Expenses ────────────────────────────────────────────────────────────
const FIXED_CATS = [
  { value: 'salary',    label: 'Salary',            icon: '👤' },
  { value: 'emi',       label: 'EMI / Loan',        icon: '🏦' },
  { value: 'rent',      label: 'Rent',              icon: '🏠' },
  { value: 'insurance', label: 'Insurance',         icon: '🛡️' },
  { value: 'interest',  label: 'Interest / Finance',icon: '📈' },
  { value: 'admin',     label: 'Admin / Office',    icon: '📋' },
  { value: 'misc',      label: 'Miscellaneous',     icon: '📦' },
]
const daySuffix = n => n === 1 || n === 21 || n === 31 ? 'st' : n === 2 || n === 22 ? 'nd' : n === 3 || n === 23 ? 'rd' : 'th'
const PAY_MODES_FE = ['cash', 'bank_transfer', 'upi', 'cheque', 'card']
const PAY_LABELS_FE = { cash: 'Cash', bank_transfer: 'Bank Transfer', upi: 'UPI', cheque: 'Cheque', card: 'Card' }

const RECURRENCE_TYPES = [
  { value: 'monthly',     label: 'Monthly',     desc: 'Every month on a fixed day' },
  { value: 'quarterly',   label: 'Quarterly',   desc: 'Every 3 months from start date' },
  { value: 'half_yearly', label: 'Half-Yearly', desc: 'Every 6 months from start date' },
  { value: 'yearly',      label: 'Yearly',      desc: 'Once a year on anniversary' },
  { value: 'custom_days', label: 'Custom',      desc: 'Recurring every N days' },
]
const recurrenceLabel = (t) => {
  if (!t) return 'Monthly'
  if (t.recurrence_type === 'monthly' || !t.recurrence_type) return `Every month · day ${t.due_day}`
  if (t.recurrence_type === 'quarterly')   return `Quarterly from ${t.start_date || '—'}`
  if (t.recurrence_type === 'half_yearly') return `Half-yearly from ${t.start_date || '—'}`
  if (t.recurrence_type === 'yearly')      return `Yearly on ${t.start_date || '—'}`
  if (t.recurrence_type === 'custom_days') return `Every ${t.recurrence_days || '?'} days from ${t.start_date || '—'}`
  return ''
}

// Given a template and a target month (year, month 1-12), returns the ISO due date
// or null if no occurrence falls in that month
function computeDueDate(template, year, month) {
  const maxDay = new Date(year, month, 0).getDate()
  const { recurrence_type, due_day, start_date, recurrence_days } = template

  if (!recurrence_type || recurrence_type === 'monthly') {
    const d = Math.min(due_day || 1, maxDay)
    return `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }

  if (!start_date) return null
  const sd = new Date(start_date + 'T00:00:00')
  const sdY = sd.getFullYear(), sdM = sd.getMonth() + 1, sdD = sd.getDate()
  const monthsDiff = (year - sdY) * 12 + (month - sdM)
  if (monthsDiff < 0) return null

  if (recurrence_type === 'quarterly') {
    if (monthsDiff % 3 !== 0) return null
    return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(sdD, maxDay)).padStart(2,'0')}`
  }
  if (recurrence_type === 'half_yearly') {
    if (monthsDiff % 6 !== 0) return null
    return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(sdD, maxDay)).padStart(2,'0')}`
  }
  if (recurrence_type === 'yearly') {
    if (sdM !== month) return null
    return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(sdD, maxDay)).padStart(2,'0')}`
  }
  if (recurrence_type === 'custom_days' && recurrence_days > 0) {
    const startMs    = sd.getTime()
    const monthStart = new Date(year, month - 1, 1).getTime()
    const monthEnd   = new Date(year, month, 0).getTime()
    const intMs      = recurrence_days * 86400000
    if (startMs > monthEnd) return null
    if (startMs >= monthStart) return start_date  // start itself is in this month
    const occ = Math.ceil((monthStart - startMs) / intMs)
    const occDate = new Date(startMs + occ * intMs)
    if (occDate.getTime() <= monthEnd)
      return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(occDate.getDate(), maxDay)).padStart(2,'0')}`
    return null
  }
  return null
}

// ── Template Modal (Add / Edit) ───────────────────────────────────────────────
function FixedExpenseTemplateModal({ companyId, template, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name:            template?.name || '',
    category:        template?.category || 'emi',
    amount:          template?.amount ? String(template.amount) : '',
    recurrence_type: template?.recurrence_type || 'monthly',
    due_day:         template?.due_day ? String(template.due_day) : '1',
    start_date:      template?.start_date || '',
    recurrence_days: template?.recurrence_days ? String(template.recurrence_days) : '',
    payee_name:      template?.payee_name || '',
    employee_id:     template?.employee_id || '',
    description:     template?.description || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: employees = [] } = useQuery({
    queryKey: ['fe_emp_all', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id, name, employee_number')
        .eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // When selecting employee for salary, auto-fill name then fetch salary structure
  const onEmpChange = async (empId) => {
    set('employee_id', empId)
    const emp = employees.find(e => e.id === empId)
    if (emp) {
      set('name', `Salary – ${emp.name}`)
      set('payee_name', emp.name)
      // Fetch latest salary from hr_salary_structure
      const { data: sal } = await supabase.from('hr_salary_structure')
        .select('basic_salary, hra, special_allowance, other_allowance')
        .eq('employee_id', empId)
        .order('effective_from', { ascending: false })
        .limit(1).maybeSingle()
      if (sal) {
        const gross = (Number(sal.basic_salary || 0) + Number(sal.hra || 0) +
          Number(sal.special_allowance || 0) + Number(sal.other_allowance || 0))
        set('amount', String(gross || ''))
      }
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Enter a name')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount')
    if (form.recurrence_type === 'monthly' && (+form.due_day < 1 || +form.due_day > 31))
      return toast.error('Due day must be 1–31')
    if (form.recurrence_type !== 'monthly' && !form.start_date)
      return toast.error('Select a start date')
    if (form.recurrence_type === 'custom_days' && +form.recurrence_days < 1)
      return toast.error('Enter number of days (≥ 1)')

    setSaving(true)
    try {
      const payload = {
        company_id:      companyId,
        name:            form.name.trim(),
        category:        form.category,
        amount:          parseFloat(form.amount),
        recurrence_type: form.recurrence_type,
        due_day:         form.recurrence_type === 'monthly' ? parseInt(form.due_day) : null,
        start_date:      form.recurrence_type !== 'monthly' ? form.start_date : null,
        recurrence_days: form.recurrence_type === 'custom_days' ? parseInt(form.recurrence_days) : null,
        payee_name:      form.payee_name.trim() || null,
        employee_id:     form.category === 'salary' && form.employee_id ? form.employee_id : null,
        description:     form.description.trim() || null,
        is_active:       true,
      }
      const { error } = template
        ? await supabase.from('fixed_expenses').update(payload).eq('id', template.id)
        : await supabase.from('fixed_expenses').insert(payload)
      if (error) throw error
      toast.success(template ? 'Template updated' : 'Fixed expense added')
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md bg-dark-800 border border-dark-700 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="shrink-0 px-5 py-4 border-b border-dark-700 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-100">{template ? 'Edit Fixed Expense' : 'Add Fixed Expense'}</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Category */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Category *</label>
            <div className="grid grid-cols-2 gap-2">
              {FIXED_CATS.map(c => (
                <button key={c.value} type="button" onClick={() => { set('category', c.value); if (c.value !== 'salary') set('employee_id', '') }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs text-left transition-all ${form.category === c.value ? 'bg-primary-600/20 border-primary-500 text-primary-300 font-semibold' : 'bg-dark-700 border-dark-600 text-slate-400 hover:border-dark-500'}`}>
                  <span>{c.icon}</span>{c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Employee picker (salary only) */}
          {form.category === 'salary' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Select Employee *</label>
              <select className={inp()} value={form.employee_id} onChange={e => onEmpChange(e.target.value)}>
                <option value="">— Pick employee —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
              </select>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Name / Label *</label>
            <input className={inp()} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. HDFC Car Loan EMI" />
          </div>

          {/* Payee */}
          {form.category !== 'salary' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Payee / Lender / Landlord</label>
              <input className={inp()} value={form.payee_name} onChange={e => set('payee_name', e.target.value)} placeholder="Bank / vendor name" />
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount (₹) *</label>
            <input className={inp()} type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
          </div>

          {/* Recurrence type */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Recurrence *</label>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {RECURRENCE_TYPES.map(r => (
                <button key={r.value} type="button" onClick={() => set('recurrence_type', r.value)}
                  className={`py-2 px-1 rounded-lg border text-[11px] font-semibold text-center transition-all ${form.recurrence_type === r.value ? 'bg-primary-600/20 border-primary-500 text-primary-300' : 'bg-dark-700 border-dark-600 text-slate-400 hover:border-dark-500'}`}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* Monthly: due day */}
            {form.recurrence_type === 'monthly' && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Due Day of Month *</label>
                <input className={inp()} type="number" min="1" max="31" value={form.due_day}
                  onChange={e => set('due_day', e.target.value)} placeholder="1 – 31" />
              </div>
            )}

            {/* Non-monthly: start date */}
            {form.recurrence_type !== 'monthly' && (
              <div className={`grid gap-3 ${form.recurrence_type === 'custom_days' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    {form.recurrence_type === 'yearly' ? 'Anniversary Date *' : 'Start Date *'}
                  </label>
                  <input type="date" className={inp()} value={form.start_date}
                    onChange={e => set('start_date', e.target.value)} />
                </div>
                {form.recurrence_type === 'custom_days' && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Every N Days *</label>
                    <input className={inp()} type="number" min="1" value={form.recurrence_days}
                      onChange={e => set('recurrence_days', e.target.value)} placeholder="e.g. 45" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
            <input className={inp()} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Loan account, policy number, etc." />
          </div>
        </div>
        <div className="shrink-0 px-5 py-4 border-t border-dark-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-dark-600 text-slate-400 text-sm font-semibold hover:bg-dark-700">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {template ? 'Save Changes' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mark as Paid Modal ────────────────────────────────────────────────────────
function MarkPaidModal({ companyId, payment, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  const [form, setForm] = useState({
    paid_date:       todayStr(),
    paid_amount:     String(payment.amount),
    payment_mode:    'bank_transfer',
    transaction_ref: '',
    notes:           '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const fe = payment.fixed_expenses

  const handlePay = async () => {
    if (!form.paid_amount || parseFloat(form.paid_amount) <= 0) return toast.error('Enter amount')
    setSaving(true)
    try {
      const amt = parseFloat(form.paid_amount)

      // 1. Mark instance as paid
      const { error: pe } = await supabase.from('fixed_expense_payments').update({
        status:          'paid',
        paid_date:       form.paid_date,
        paid_amount:     amt,
        payment_mode:    form.payment_mode,
        transaction_ref: form.transaction_ref || null,
        notes:           form.notes || null,
        updated_at:      new Date().toISOString(),
      }).eq('id', payment.id)
      if (pe) throw pe

      // 2. Write to expenses ledger
      const { data: exp, error: ee } = await supabase.from('expenses').insert({
        company_id:    companyId,
        expense_date:  form.paid_date,
        category:      fe?.category || 'misc',
        description:   fe?.name || 'Fixed expense',
        vendor_name:   fe?.payee_name || null,
        amount:        amt,
        total_amount:  amt,
        payment_mode:  form.payment_mode,
        bank_reference:form.transaction_ref || null,
        source:        'manual',
      }).select('id').single()
      if (ee) throw ee

      // 3. Write to account_transactions for P&L
      const { error: te } = await supabase.from('account_transactions').insert({
        company_id:      companyId,
        txn_date:        form.paid_date,
        type:            'expense',
        description:     `${fe?.name || 'Fixed expense'} – ${payment.period_month}`,
        amount:          amt,
        payment_mode:    form.payment_mode,
        bank_reference:  form.transaction_ref || null,
        reference_type:  'fixed_expense',
        reference_id:    exp?.id || null,
      })
      if (te) throw te

      toast.success(`${fe?.name || 'Payment'} marked as paid`)
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-sm bg-dark-800 border border-dark-700 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col">
        <div className="shrink-0 px-5 py-4 border-b border-dark-700 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-100">Mark as Paid</p>
            <p className="text-xs text-slate-500">{fe?.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Payment Date</label>
              <input type="date" className={inp()} value={form.paid_date} onChange={e => set('paid_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Amount (₹)</label>
              <input type="number" className={inp()} value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Payment Mode</label>
            <div className="flex gap-1.5 flex-wrap">
              {PAY_MODES_FE.map(m => (
                <button key={m} type="button" onClick={() => set('payment_mode', m)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${form.payment_mode === m ? 'bg-primary-600 text-white' : 'bg-dark-700 border border-dark-600 text-slate-400'}`}>
                  {PAY_LABELS_FE[m]}
                </button>
              ))}
            </div>
          </div>
          {form.payment_mode !== 'cash' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">UTR / Reference</label>
              <input className={inp()} value={form.transaction_ref} onChange={e => set('transaction_ref', e.target.value)} placeholder="Transaction ID / cheque no." />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <input className={inp()} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="shrink-0 px-5 py-4 border-t border-dark-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-dark-600 text-slate-400 text-sm font-semibold hover:bg-dark-700">Cancel</button>
          <button onClick={handlePay} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Fixed Expenses Tab ────────────────────────────────────────────────────────
function FixedExpensesTab({ companyId }) {
  const qc = useQueryClient()
  const [view, setView] = useState('monthly')         // 'monthly' | 'templates'
  const [showAdd, setShowAdd] = useState(false)
  const [editTpl, setEditTpl] = useState(null)
  const [payModal, setPayModal] = useState(null)

  const now        = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const warnDate   = new Date(now); warnDate.setDate(warnDate.getDate() + 3)
  const todayDate  = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Load active templates
  const { data: templates = [] } = useQuery({
    queryKey: ['fixed_expenses', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('fixed_expenses')
        .select('*, hr_employees(name, employee_number)')
        .eq('company_id', companyId).eq('is_active', true).order('category').order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Load this month's payment instances
  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ['fixed_expense_payments', companyId, currentMonth],
    queryFn: async () => {
      const { data } = await supabase.from('fixed_expense_payments')
        .select('*, fixed_expenses(name, category, payee_name, description, hr_employees(name))')
        .eq('company_id', companyId).eq('period_month', currentMonth).order('due_date')
      return data || []
    },
    enabled: !!companyId,
  })

  // Auto-generate instances for current month when templates change
  useEffect(() => {
    if (!companyId || templates.length === 0) return
    const year  = now.getFullYear()
    const month = now.getMonth() + 1
    const maxDay = new Date(year, month, 0).getDate()

    const toCreate = templates
      .filter(t => !payments.find(p => p.fixed_expense_id === t.id))
      .map(t => {
        const dueDate = computeDueDate(t, year, month)
        if (!dueDate) return null   // not due this month (quarterly/yearly etc.)
        return {
          fixed_expense_id: t.id,
          company_id:       companyId,
          due_date:         dueDate,
          period_month:     currentMonth,
          amount:           t.amount,
          status:           'pending',
        }
      })
      .filter(Boolean)

    if (toCreate.length > 0) {
      supabase.from('fixed_expense_payments')
        .upsert(toCreate, { onConflict: 'fixed_expense_id,period_month' })
        .then(() => refetchPayments())
    }
  }, [templates, companyId]) // eslint-disable-line

  const deleteTemplate = async (id) => {
    if (!confirm('Delete this fixed expense? Future months will not be generated.')) return
    await supabase.from('fixed_expenses').update({ is_active: false }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['fixed_expenses', companyId] })
    toast.success('Removed')
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const pending   = payments.filter(p => p.status === 'pending')
  const paid      = payments.filter(p => p.status === 'paid')
  const overdue   = pending.filter(p => new Date(p.due_date) < todayDate)
  const dueSoon   = pending.filter(p => { const d = new Date(p.due_date); return d >= todayDate && d <= warnDate })
  const totalDue  = pending.reduce((s, p) => s + Number(p.amount), 0)
  const totalPaid = paid.reduce((s, p) => s + Number(p.paid_amount || p.amount), 0)

  const catIcon = (cat) => FIXED_CATS.find(c => c.value === cat)?.icon || '📦'

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Alert banner */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div className={`rounded-xl border p-4 flex gap-3 ${overdue.length > 0 ? 'bg-red-950/40 border-red-700' : 'bg-amber-950/40 border-amber-700'}`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${overdue.length > 0 ? 'text-red-400' : 'text-amber-400'}`} />
          <div className="space-y-0.5">
            {overdue.length > 0 && (
              <p className="text-sm font-bold text-red-300">
                {overdue.length} overdue payment{overdue.length > 1 ? 's' : ''} — {fmt(overdue.reduce((s,p)=>s+Number(p.amount),0))} pending
              </p>
            )}
            {dueSoon.length > 0 && (
              <p className="text-sm font-semibold text-amber-300">
                {dueSoon.length} payment{dueSoon.length > 1 ? 's' : ''} due within 3 days — {fmt(dueSoon.reduce((s,p)=>s+Number(p.amount),0))}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">Review and mark paid in "This Month" view below</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Due</p>
          <p className="text-base font-black text-red-400">{fmt(totalDue)}</p>
          <p className="text-[10px] text-slate-600">{pending.length} pending</p>
        </div>
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Paid</p>
          <p className="text-base font-black text-emerald-400">{fmt(totalPaid)}</p>
          <p className="text-[10px] text-slate-600">{paid.length} done</p>
        </div>
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Overdue</p>
          <p className={`text-base font-black ${overdue.length > 0 ? 'text-red-400' : 'text-slate-500'}`}>{overdue.length}</p>
          <p className="text-[10px] text-slate-600">items</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 bg-dark-800 border border-dark-700 rounded-xl p-1">
        {[['monthly','📅 This Month'],['templates','⚙️ Templates']].map(([v,l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${view === v ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── MONTHLY VIEW ── */}
      {view === 'monthly' && (
        <div className="space-y-2">
          {payments.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Bell className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No fixed expenses this month.</p>
              <p className="text-xs mt-1">Add templates in the Templates tab.</p>
            </div>
          )}
          {payments.map(p => {
            const fe       = p.fixed_expenses
            const isOverdue = p.status === 'pending' && new Date(p.due_date) < todayDate
            const isSoon    = p.status === 'pending' && new Date(p.due_date) >= todayDate && new Date(p.due_date) <= warnDate
            const daysLate  = isOverdue ? Math.floor((todayDate - new Date(p.due_date)) / 86400000) : 0
            return (
              <div key={p.id}
                className={`bg-dark-800 border rounded-xl p-3.5 ${isOverdue ? 'border-red-700/60' : isSoon ? 'border-amber-700/60' : p.status === 'paid' ? 'border-emerald-800/40' : 'border-dark-700'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{catIcon(fe?.category)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{fe?.name}</p>
                    <p className="text-xs text-slate-500">
                      Due {fmtDate(p.due_date)}
                      {(fe?.payee_name || fe?.hr_employees?.name) && ` · ${fe?.payee_name || fe?.hr_employees?.name}`}
                    </p>
                    {isOverdue  && <p className="text-xs text-red-400 font-semibold mt-0.5">⚠ Overdue by {daysLate} day{daysLate !== 1 ? 's' : ''}</p>}
                    {isSoon     && <p className="text-xs text-amber-400 font-semibold mt-0.5">⏰ Due soon</p>}
                    {p.status === 'paid' && <p className="text-xs text-emerald-400 mt-0.5">✓ Paid {fmtDate(p.paid_date)} · {fmt(p.paid_amount)} · {PAY_LABELS_FE[p.payment_mode] || p.payment_mode}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-100">{fmt(p.amount)}</p>
                    {p.status === 'pending' && (
                      <button onClick={() => setPayModal(p)}
                        className="mt-1.5 px-3 py-1 bg-primary-600 hover:bg-primary-500 text-white text-[10px] font-bold rounded-lg transition-colors">
                        Mark Paid
                      </button>
                    )}
                    {p.status === 'paid' && (
                      <span className="mt-1.5 inline-block px-2 py-0.5 bg-emerald-900/30 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-800">PAID</span>
                    )}
                  </div>
                </div>
                {p.notes && <p className="text-xs text-slate-600 mt-2 pl-9">{p.notes}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── TEMPLATES VIEW ── */}
      {view === 'templates' && (
        <div className="space-y-3">
          <button onClick={() => setShowAdd(true)}
            className="w-full py-3 rounded-xl border border-dashed border-primary-500/40 text-primary-400 text-sm font-semibold hover:bg-primary-600/10 flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Add Fixed Expense
          </button>

          {/* Group by category */}
          {FIXED_CATS.map(cat => {
            const items = templates.filter(t => t.category === cat.value)
            if (items.length === 0) return null
            return (
              <div key={cat.value}>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <span>{cat.icon}</span> {cat.label}
                </p>
                <div className="space-y-2">
                  {items.map(t => (
                    <div key={t.id} className="bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{t.name}</p>
                        <p className="text-xs text-slate-500">
                          {recurrenceLabel(t)}
                          {(t.payee_name || t.hr_employees?.name) ? ` · ${t.payee_name || t.hr_employees?.name}` : ''}
                          {t.description ? ` · ${t.description}` : ''}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-slate-100 shrink-0">{fmt(t.amount)}</p>
                      <button onClick={() => setEditTpl(t)} className="text-slate-500 hover:text-slate-300 p-1">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteTemplate(t.id)} className="text-slate-500 hover:text-red-400 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {templates.length === 0 && (
            <p className="text-center text-slate-500 text-sm py-8">No fixed expenses set up yet</p>
          )}
        </div>
      )}

      {/* Modals */}
      {(showAdd || editTpl) && (
        <FixedExpenseTemplateModal
          companyId={companyId}
          template={editTpl}
          onClose={() => { setShowAdd(false); setEditTpl(null) }}
          onSaved={() => {
            setShowAdd(false); setEditTpl(null)
            qc.invalidateQueries({ queryKey: ['fixed_expenses', companyId] })
            qc.invalidateQueries({ queryKey: ['fixed_expense_payments', companyId, currentMonth] })
          }}
        />
      )}
      {payModal && (
        <MarkPaidModal
          companyId={companyId}
          payment={payModal}
          onClose={() => setPayModal(null)}
          onSaved={() => {
            setPayModal(null)
            qc.invalidateQueries({ queryKey: ['fixed_expense_payments', companyId, currentMonth] })
            qc.invalidateQueries({ queryKey: ['acct_dashboard', companyId] })
          }}
        />
      )}
    </div>
  )
}

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'invoices',  label: 'Invoices',  icon: '📄' },
  { key: 'expenses',  label: 'Expenses',  icon: '💸' },
  { key: 'fixed',     label: 'Fixed',     icon: '📌' },
  { key: 'ledger',    label: 'Ledger',    icon: '📒' },
]

export default function AccountsPage() {
  const { companyId, session } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [alertDismissed, setAlertDismissed] = useState(false)

  // Equipment list — shared across tabs (expense tagging)
  const { data: equipmentList = [] } = useQuery({
    queryKey: ['equipment_list_accts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment').select('id, name, equipment_number')
        .eq('company_id', companyId).eq('status', 'active').order('name')
      if (error) throw error; return data
    },
    enabled: !!companyId,
  })

  // Fixed expense alert — overdue or due within 3 days
  const alertCutoff = new Date(); alertCutoff.setDate(alertCutoff.getDate() + 3)
  const alertCutoffStr = `${alertCutoff.getFullYear()}-${String(alertCutoff.getMonth()+1).padStart(2,'0')}-${String(alertCutoff.getDate()).padStart(2,'0')}`
  const { data: alertItems = [] } = useQuery({
    queryKey: ['fixed_alert', companyId, alertCutoffStr],
    queryFn: async () => {
      const { data } = await supabase.from('fixed_expense_payments')
        .select('id, due_date, amount, status, fixed_expenses(name)')
        .eq('company_id', companyId).eq('status', 'pending')
        .lte('due_date', alertCutoffStr).order('due_date')
      return data || []
    },
    enabled: !!companyId,
    refetchOnWindowFocus: true,
  })

  const todayStr2 = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`
  const overdueAlerts = alertItems.filter(a => a.due_date < todayStr2)
  const soonAlerts    = alertItems.filter(a => a.due_date >= todayStr2)
  const showAlert     = alertItems.length > 0 && !alertDismissed

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dark-900">
      {/* Page header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-dark-700 flex-shrink-0">
        <Receipt className="w-5 h-5 text-primary-400" />
        <h1 className="text-base font-bold text-slate-100">Accounts</h1>
        {alertItems.length > 0 && (
          <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {alertItems.length}
          </span>
        )}
        <div className="flex-1" />
        {/* Tabs */}
        <div className="flex gap-1 bg-dark-800 rounded-xl p-1 border border-dark-700">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === t.key ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'}`}>
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Fixed expense alert banner */}
      {showAlert && (
        <div className={`shrink-0 flex items-start gap-3 px-4 py-3 border-b ${overdueAlerts.length > 0 ? 'bg-red-950/40 border-red-800' : 'bg-amber-950/40 border-amber-800'}`}>
          <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${overdueAlerts.length > 0 ? 'text-red-400' : 'text-amber-400'}`} />
          <div className="flex-1 min-w-0">
            {overdueAlerts.length > 0 && (
              <p className="text-xs font-bold text-red-300">
                {overdueAlerts.length} overdue fixed expense{overdueAlerts.length > 1 ? 's' : ''}: {overdueAlerts.map(a => a.fixed_expenses?.name).join(', ')}
              </p>
            )}
            {soonAlerts.length > 0 && (
              <p className="text-xs text-amber-300">
                Due within 3 days: {soonAlerts.map(a => a.fixed_expenses?.name).join(', ')}
              </p>
            )}
            <button onClick={() => setActiveTab('fixed')} className="text-[11px] text-primary-400 hover:text-primary-300 underline mt-0.5">
              Review in Fixed Expenses →
            </button>
          </div>
          <button onClick={() => setAlertDismissed(true)} className="text-slate-500 hover:text-slate-300 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'dashboard' && <DashboardTab companyId={companyId} onNavigate={setActiveTab} />}
        {activeTab === 'invoices'  && <InvoicesTab  companyId={companyId} session={session} />}
        {activeTab === 'expenses'  && <ExpensesTab  companyId={companyId} session={session} equipmentList={equipmentList} />}
        {activeTab === 'fixed'     && <FixedExpensesTab companyId={companyId} />}
        {activeTab === 'ledger'    && <LedgerTab    companyId={companyId} />}
      </div>
    </div>
  )
}
