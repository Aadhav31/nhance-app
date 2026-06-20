import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Receipt, Plus, X, Loader2, Trash2, Pencil,
  TrendingUp, TrendingDown, Clock, Search, Banknote,
  ArrowUpCircle, ArrowDownCircle, ChevronRight, ChevronDown,
  Link, Copy, ExternalLink, Share2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const EXPENSE_CATS = [
  { value: 'fuel',      label: 'Fuel & HSD',           icon: '⛽' },
  { value: 'repair',    label: 'Repair & Maintenance',  icon: '🔧' },
  { value: 'tyre',      label: 'Tyres & Spares',        icon: '🔩' },
  { value: 'wages',     label: 'Operator Wages',        icon: '👷' },
  { value: 'insurance', label: 'Insurance',             icon: '🛡'  },
  { value: 'admin',     label: 'Admin & Office',        icon: '📋' },
  { value: 'vehicle',   label: 'Vehicle Running',       icon: '🚗' },
  { value: 'salary',    label: 'Staff Salary',          icon: '💼' },
  { value: 'bank',      label: 'Bank Charges',          icon: '🏦' },
  { value: 'other',     label: 'Miscellaneous',         icon: '📦' },
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
  description: '', quantity: 1, unit: 'hrs', rate: '', amount: 0,
})

function CreateInvoiceModal({ companyId, session, invoiceCount, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_name: '', client_address: '', client_gstin: '',
    project_name: '', invoice_date: today(), due_date: '',
    cgst_rate: 9, sgst_rate: 9, igst_rate: 18, use_igst: false,
    discount_amount: 0, notes: '', terms: 'Payment due within 30 days.',
  })
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

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
      const { data: inv, error: invErr } = await supabase.from('client_invoices').insert({
        company_id: companyId, invoice_number: invNum,
        invoice_date: form.invoice_date, due_date: form.due_date || null,
        client_name: form.client_name.trim(),
        client_address: form.client_address.trim() || null,
        client_gstin: form.client_gstin.trim() || null,
        project_name: form.project_name.trim() || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate),
        sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
        igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, paid_amount: 0, balance_due: total,
        status, notes: form.notes.trim() || null, terms: form.terms.trim() || null,
        created_by: session.user.id,
      }).select('id').single()
      if (invErr) throw invErr

      // If RLS blocks the returning select, fetch the invoice by number
      let invoiceId = inv?.id
      if (!invoiceId) {
        const { data: fetched } = await supabase.from('client_invoices')
          .select('id').eq('invoice_number', invNum).eq('company_id', companyId).single()
        invoiceId = fetched?.id
      }
      if (!invoiceId) throw new Error('Invoice saved but could not retrieve ID — please refresh and check.')

      const linePayload = lines.filter(l => l.description.trim()).map((l, i) => ({
        invoice_id: invoiceId, company_id: companyId, description: l.description.trim(),
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
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
        {/* Client details */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Client Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Client / Company Name *</label>
              <input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} placeholder="e.g. Infra Builders Pvt Ltd" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Client GSTIN</label>
              <input className={inp()} value={form.client_gstin} onChange={e => setF('client_gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Project / Work Order</label>
              <input className={inp()} value={form.project_name} onChange={e => setF('project_name', e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Invoice Date</label>
              <input type="date" className={inp()} value={form.invoice_date} onChange={e => setF('invoice_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
              <input type="date" className={inp()} value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
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
              <div className="col-span-5">Description</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-1">Unit</div>
              <div className="col-span-2">Rate (₹)</div>
              <div className="col-span-1 text-right">Amount</div>
              <div className="col-span-1" />
            </div>
            {lines.map(l => (
              <div key={l._id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
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
                <div className="col-span-1 text-right">
                  <button onClick={() => lines.length > 1 && setLines(p => p.filter(x => x._id !== l._id))}
                    className="text-slate-600 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
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
  const [form, setForm] = useState({
    client_name:     invoice.client_name || '',
    client_address:  invoice.client_address || '',
    client_gstin:    invoice.client_gstin || '',
    project_name:    invoice.project_name || '',
    invoice_date:    invoice.invoice_date || today(),
    due_date:        invoice.due_date || '',
    cgst_rate:       invoice.cgst_rate ?? 9,
    sgst_rate:       invoice.sgst_rate ?? 9,
    igst_rate:       invoice.igst_rate ?? 18,
    use_igst:        (invoice.igst_rate > 0 && !invoice.cgst_rate),
    discount_amount: invoice.discount_amount || 0,
    notes:           invoice.notes || '',
    terms:           invoice.terms || 'Payment due within 30 days.',
  })
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Load existing line items
  useState(() => {
    supabase.from('invoice_line_items')
      .select('*').eq('invoice_id', invoice.id).order('sort_order')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLines(data.map(l => ({
            _id: l.id, description: l.description,
            quantity: l.quantity, unit: l.unit, rate: l.rate, amount: l.amount,
          })))
        }
        setLoadingLines(false)
      })
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

  const handleSave = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      // Update invoice header
      const newBalance = Math.max(0, total - (invoice.paid_amount || 0))
      const { error: invErr } = await supabase.from('client_invoices').update({
        invoice_date:    form.invoice_date,
        due_date:        form.due_date || null,
        client_name:     form.client_name.trim(),
        client_address:  form.client_address.trim() || null,
        client_gstin:    form.client_gstin.trim() || null,
        project_name:    form.project_name.trim() || null,
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
        invoice_id: invoice.id, company_id: companyId, description: l.description.trim(),
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
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
          {/* Client details */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Client Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1 block">Client / Company Name *</label>
                <input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Client GSTIN</label>
                <input className={inp()} value={form.client_gstin} onChange={e => setF('client_gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Project / Work Order</label>
                <input className={inp()} value={form.project_name} onChange={e => setF('project_name', e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Invoice Date</label>
                <input type="date" className={inp()} value={form.invoice_date} onChange={e => setF('invoice_date', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
                <input type="date" className={inp()} value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
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
                <div className="col-span-5">Description</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-1">Unit</div>
                <div className="col-span-2">Rate (₹)</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-1" />
              </div>
              {lines.map(l => (
                <div key={l._id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
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
                  <div className="col-span-1 text-right">
                    <button onClick={() => lines.length > 1 && setLines(p => p.filter(x => x._id !== l._id))}
                      className="text-slate-600 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
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
    expense_date: today(), category: 'fuel', description: '',
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
        amount, gst_amount, vendor_gstin: form.vendor_gstin.trim() || null,
        payment_mode: form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        equipment_id: form.equipment_id || null, created_by: session.user.id,
      }).select().single()
      if (ee) throw ee

      const { data: txn, error: te } = await supabase.from('account_transactions').insert({
        company_id: companyId, txn_date: form.expense_date, type: 'expense',
        description: form.description.trim(), amount, gst_amount,
        payment_mode: form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        reference_type: 'expense', reference_id: exp.id,
        equipment_id: form.equipment_id || null,
        notes: form.notes.trim() || null, created_by: session.user.id,
      }).select().single()
      if (te) throw te

      await supabase.from('expenses').update({ transaction_id: txn.id }).eq('id', exp.id)
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
                <option key={eq.id} value={eq.id}>{eq.name}{eq.reg_number ? ` (${eq.reg_number})` : ''}</option>
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [payTarget, setPayTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [generatingLink, setGeneratingLink] = useState(null) // invoice id being processed

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

                        {/* ── Razorpay Payment Link Section ── */}
                        {['sent', 'partial', 'overdue'].includes(inv.status) && (
                          <div className="mt-3 pt-3 border-t border-dark-600">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                              Online Payment Link (Razorpay)
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
// Expenses Tab
// ─────────────────────────────────────────────────────────────────────────────
function ExpensesTab({ companyId, session, equipmentList }) {
  const qc = useQueryClient()
  const [catFilter, setCatFilter] = useState('all')
  const [month, setMonth] = useState(curMonth())
  const [showAdd, setShowAdd] = useState(false)

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', companyId, month],
    queryFn: async () => {
      const { from, to } = monthRange(month)
      const { data, error } = await supabase.from('expenses')
        .select('*, equipment:equipment_id(name, reg_number)')
        .eq('company_id', companyId).gte('expense_date', from).lte('expense_date', to)
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

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense? This will also remove the ledger entry.')) return
    await supabase.from('expenses').delete().eq('id', id)
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
                  <div key={exp.id} className="bg-dark-800 rounded-xl border border-dark-700 p-4 flex items-start gap-3">
                    <div className="text-2xl mt-0.5">{ci.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-200">{exp.description}</p>
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
                    <button onClick={() => handleDelete(exp.id)} className="text-slate-600 hover:text-red-400 transition-colors mt-0.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })
        }
      </div>

      {showAdd && (
        <AddExpenseModal companyId={companyId} session={session} equipmentList={equipmentList}
          onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refresh() }} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Tab (all transactions)
// ─────────────────────────────────────────────────────────────────────────────
function LedgerTab({ companyId }) {
  const [month, setMonth] = useState(curMonth())
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ['acct_txns_ledger', companyId, month],
    queryFn: async () => {
      const { from, to } = monthRange(month)
      const { data, error } = await supabase.from('account_transactions').select('*')
        .eq('company_id', companyId).gte('txn_date', from).lte('txn_date', to)
        .order('txn_date', { ascending: false })
      if (error) throw error; return data
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => txns.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return t.description.toLowerCase().includes(q) || (t.bank_reference || '').toLowerCase().includes(q)
    }
    return true
  }), [txns, typeFilter, search])

  const income  = useMemo(() => txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [txns])
  const expense = useMemo(() => txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [txns])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-dark-700 flex-shrink-0 flex-wrap gap-y-2">
        <input type="month" className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
          value={month} onChange={e => setMonth(e.target.value)} />
        <div className="flex gap-1">
          {['all', 'income', 'expense'].map(t => (
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
        <div className="flex-1 flex justify-end gap-4 text-xs flex-wrap">
          <span className="text-slate-400">In: <span className="text-emerald-400 font-mono font-bold">{fmt(income)}</span></span>
          <span className="text-slate-400">Out: <span className="text-red-400 font-mono font-bold">{fmt(expense)}</span></span>
          <span className="text-slate-400">Net: <span className={`font-mono font-bold ${income - expense >= 0 ? 'text-primary-400' : 'text-red-400'}`}>{fmt(Math.abs(income - expense))}</span></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading
          ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
          : filtered.length === 0
            ? <div className="text-center py-12 text-slate-500 text-sm">No transactions for this period</div>
            : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-dark-900 z-10">
                  <tr className="text-slate-500 border-b border-dark-700">
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Description</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Source</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Mode</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Ref</th>
                    <th className="text-right px-4 py-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} className="border-b border-dark-700/50 hover:bg-dark-800 transition-colors">
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtDate(t.txn_date)}</td>
                      <td className="px-4 py-3 text-slate-300 max-w-[220px]"><span className="truncate block">{t.description}</span></td>
                      <td className="px-4 py-3 text-slate-500 capitalize hidden md:table-cell">{t.reference_type || 'manual'}</td>
                      <td className="px-4 py-3 text-slate-500 capitalize hidden md:table-cell">{t.payment_mode || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{t.bank_reference || '—'}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold whitespace-nowrap ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.type === 'income' ? '+' : '−'}{fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
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
const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'invoices',  label: 'Invoices',  icon: '📄' },
  { key: 'expenses',  label: 'Expenses',  icon: '💸' },
  { key: 'ledger',    label: 'Ledger',    icon: '📒' },
]

export default function AccountsPage() {
  const { companyId, session } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')

  // Equipment list — shared across tabs (expense tagging)
  const { data: equipmentList = [] } = useQuery({
    queryKey: ['equipment_list_accts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment').select('id, name, reg_number')
        .eq('company_id', companyId).eq('status', 'active').order('name')
      if (error) throw error; return data
    },
    enabled: !!companyId,
  })

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dark-900">
      {/* Page header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-dark-700 flex-shrink-0">
        <Receipt className="w-5 h-5 text-primary-400" />
        <h1 className="text-base font-bold text-slate-100">Accounts</h1>
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

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'dashboard' && <DashboardTab companyId={companyId} onNavigate={setActiveTab} />}
        {activeTab === 'invoices'  && <InvoicesTab  companyId={companyId} session={session} />}
        {activeTab === 'expenses'  && <ExpensesTab  companyId={companyId} session={session} equipmentList={equipmentList} />}
        {activeTab === 'ledger'    && <LedgerTab    companyId={companyId} />}
      </div>
    </div>
  )
}
