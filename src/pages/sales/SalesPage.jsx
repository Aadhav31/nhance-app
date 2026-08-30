import { useState, useMemo, useRef, useEffect } from 'react'
import { ClientPicker } from '../../components/shared/EntityPicker'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { lookupHsnSac } from '../../utils/hsnSacLookup'
import { nextDocNumber } from '../../utils/docNumbers'
import { UOM_LIST } from '../../utils/units'
import {
  Plus, X, Loader2, FileText, TrendingUp, Truck, RefreshCcw,
  ArrowDownCircle, ShoppingCart, ChevronRight, CheckCircle,
  Copy, Edit2, Trash2, Search, IndianRupee, Calendar, User,
  FileQuestion, Send, AlertTriangle, Building2, Phone, Mail,
  MapPin, BadgeCheck, Ban, FileDown, Sheet, ShieldOff,
  SlidersHorizontal, ChevronDown, Wrench,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import ClientsPage from '../clients/ClientsPage'
import {
  downloadInvoicePDF, downloadQuotePDF, downloadSOPDF,
  downloadDCPDF, downloadCNPDF, downloadPaymentReceivedPDF,
} from '../../lib/docPDF'
import { createVerification, voidVerification } from '../../lib/docVerify'
import PagePanel from '../../components/shared/PagePanel'
import {
  downloadInvoiceXLSX, downloadQuoteXLSX, downloadSOXLSX,
  downloadDCXLSX, downloadCNXLSX, downloadPaymentReceivedXLSX,
} from '../../lib/docXLSX'

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]
const inp = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${x}`
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—'

const STATUS_COLORS = {
  draft:               'bg-slate-500/10 text-slate-500 border-slate-400/50',
  sent:                'bg-blue-500/10 text-blue-400 border-blue-700/40',
  accepted:            'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
  rejected:            'bg-red-500/10 text-red-400 border-red-700/40',
  expired:             'bg-orange-500/10 text-orange-400 border-orange-700/40',
  confirmed:           'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
  partially_fulfilled: 'bg-yellow-500/10 text-yellow-400 border-yellow-700/40',
  fulfilled:           'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
  cancelled:           'bg-red-500/10 text-red-400 border-red-700/40',
  dispatched:          'bg-blue-500/10 text-blue-400 border-blue-700/40',
  delivered:           'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
  returned:            'bg-orange-500/10 text-orange-400 border-orange-700/40',
  paid:                'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
  partial:             'bg-yellow-500/10 text-yellow-400 border-yellow-700/40',
  overdue:             'bg-red-500/10 text-red-400 border-red-700/40',
  issued:              'bg-blue-500/10 text-blue-400 border-blue-700/40',
  applied:             'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
}

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || STATUS_COLORS.draft
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${cls}`}>
      {status?.replace(/_/g, ' ') || 'draft'}
    </span>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────
function SectionHead({ label }) {
  return <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
}

function Field({ label, children, required }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

const blankLine = () => ({ _id: Math.random().toString(36).slice(2), description: '', hsn_sac: '', quantity: 1, unit: 'hrs', rate: '', amount: 0, _gst_rate: null, _gst_desc: null, _hsn_open: false })

const LINE_UNITS = UOM_LIST

function LineItemsEditor({ lines, setLines, onGstRate, isTax }) {
  const update = (id, key, val) => setLines(p => p.map(l => {
    if (l._id !== id) return l
    const u = { ...l, [key]: val }
    if (key === 'quantity' || key === 'rate') u.amount = (parseFloat(u.quantity) || 0) * (parseFloat(u.rate) || 0)
    if (key === 'hsn_sac') {
      const found = lookupHsnSac(val)
      u._gst_rate = found ? found.gst : null
      u._gst_desc = found ? found.desc : null
      if (found && onGstRate) onGstRate(found)
    }
    return u
  }))
  const toggleHsn = (id) => setLines(p => p.map(l => l._id === id ? { ...l, _hsn_open: !l._hsn_open } : l))
  const clearHsn  = (id) => setLines(p => p.map(l => l._id === id ? { ...l, hsn_sac: '', _gst_rate: null, _gst_desc: null, _hsn_open: false } : l))
  const total = lines.reduce((s, l) => s + (l.amount || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionHead label="Line Items" />
        <button type="button" onClick={() => setLines(p => [...p, blankLine()])}
          className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Row
        </button>
      </div>
      <div className="space-y-1.5">
        {/* Column headers */}
        <div className="flex gap-2 text-[9px] text-slate-500 uppercase tracking-wide px-1">
          <span className="flex-1 min-w-0">Description</span>
          <span className="w-16 text-center shrink-0">Qty</span>
          <span className="w-20 shrink-0">Unit</span>
          <span className="w-24 text-right shrink-0">Rate (₹)</span>
          <span className="w-20 text-right shrink-0">Amt</span>
          <span className="w-5 shrink-0" />
        </div>
        {lines.map(l => {
          const hsnFilled = l.hsn_sac.trim().length > 0
          const showInput = isTax && (l._hsn_open || hsnFilled)
          return (
            <div key={l._id} className="bg-dark-700/40 rounded-xl px-2 py-1.5">
              <div className="flex gap-2 items-start">
                {/* Description + HSN link stacked */}
                <div className="flex-1 min-w-0">
                  <textarea
                    rows={1}
                    className={`${inp()} text-xs resize-none leading-snug w-full`}
                    style={{ overflow: 'hidden' }}
                    placeholder="Description of goods / services"
                    value={l.description}
                    onChange={e => {
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                      update(l._id, 'description', e.target.value)
                    }}
                  />
                  {isTax && (
                    <div className="mt-0.5">
                      {!showInput ? (
                        <button type="button" onClick={() => toggleHsn(l._id)}
                          className="text-[10px] text-primary-400/60 hover:text-primary-300 transition-colors">
                          + Add HSN / SAC code
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="relative w-32 shrink-0">
                            <input
                              autoFocus={l._hsn_open && !hsnFilled}
                              className={`${inp()} text-xs font-mono uppercase py-1 pr-10`}
                              placeholder="e.g. 997313"
                              value={l.hsn_sac}
                              onChange={e => update(l._id, 'hsn_sac', e.target.value)}
                            />
                            {l._gst_rate != null && (
                              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-emerald-900/60 text-emerald-400 px-1 py-0.5 rounded-full">
                                {l._gst_rate}%
                              </span>
                            )}
                            <button type="button" onClick={() => clearHsn(l._id)}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {l._gst_desc && <span className="text-[9px] text-slate-500 truncate">{l._gst_desc}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="w-16 shrink-0">
                  <input className={`${inp('text-xs text-center px-2')}`} type="number" value={l.quantity} onChange={e => update(l._id, 'quantity', e.target.value)} min="0" step="0.01" />
                </div>
                <div className="w-20 shrink-0">
                  <select className={`${inp('text-xs px-2')}`} value={l.unit} onChange={e => update(l._id, 'unit', e.target.value)}>
                    {LINE_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="w-24 shrink-0">
                  <input className={`${inp('text-xs text-right px-2')}`} type="number" value={l.rate} onChange={e => update(l._id, 'rate', e.target.value)} placeholder="0.00" step="0.01" />
                </div>
                <div className="w-20 shrink-0 text-right">
                  <span className="text-xs font-semibold text-slate-200">{fmtINR(l.amount)}</span>
                </div>
                <button type="button" onClick={() => setLines(p => p.length > 1 ? p.filter(x => x._id !== l._id) : p)}
                  className="shrink-0 text-slate-600 hover:text-red-400 pt-1.5"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-end mt-2 text-xs text-slate-400">
        Subtotal: <span className="font-bold text-slate-200 ml-1">{fmtINR(total)}</span>
      </div>
    </div>
  )
}

// Reusable Tax/Non-Tax toggle — placed right below client name in each form
function TaxTypeToggle({ isTax, onToggle, label = 'Invoice' }) {
  return (
    <div className="col-span-2">
      <div className="flex rounded-xl border border-dark-600 overflow-hidden">
        <button type="button" onClick={() => onToggle(true)}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${isTax ? 'bg-primary-600 text-white' : 'bg-transparent text-slate-400 hover:text-slate-200'}`}>
          Tax {label} (with GST)
        </button>
        <button type="button" onClick={() => onToggle(false)}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${!isTax ? 'bg-dark-600 text-slate-200' : 'bg-transparent text-slate-400 hover:text-slate-200'}`}>
          Non-Tax {label}
        </button>
      </div>
    </div>
  )
}

function TaxSection({ form, setF, subtotal }) {
  const isTax    = form.is_tax_invoice !== false
  const discount = parseFloat(form.discount_amount) || 0
  const taxable  = subtotal - discount
  const cgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.cgst_rate) || 0) / 100 : 0
  const sgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.sgst_rate) || 0) / 100 : 0
  const igst_amt = (isTax && form.use_igst)  ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0
  const total    = taxable + cgst_amt + sgst_amt + igst_amt
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-3">
        {isTax ? (
          <>
            <SectionHead label="GST" />
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.use_igst} onChange={e => setF('use_igst', e.target.checked)} className="rounded" />
              Use IGST (interstate supply)
            </label>
            {!form.use_igst ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="CGST (%)"><input type="number" className={inp()} value={form.cgst_rate} onChange={e => setF('cgst_rate', e.target.value)} step="0.01" /></Field>
                <Field label="SGST (%)"><input type="number" className={inp()} value={form.sgst_rate} onChange={e => setF('sgst_rate', e.target.value)} step="0.01" /></Field>
              </div>
            ) : (
              <Field label="IGST (%)"><input type="number" className={inp()} value={form.igst_rate} onChange={e => setF('igst_rate', e.target.value)} step="0.01" /></Field>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-500 italic pt-1">No GST — totals are pre-tax only.</p>
        )}
        <Field label="Discount (₹)"><input type="number" className={inp()} value={form.discount_amount} onChange={e => setF('discount_amount', e.target.value)} /></Field>
      </div>
      <div className="bg-dark-700 rounded-xl p-4 space-y-2 self-start">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Summary</p>
        <div className="flex justify-between text-xs text-slate-400"><span>Subtotal</span><span>{fmtINR(subtotal)}</span></div>
        {discount > 0 && <div className="flex justify-between text-xs text-slate-400"><span>Discount</span><span>-{fmtINR(discount)}</span></div>}
        {isTax && (form.use_igst
          ? <div className="flex justify-between text-xs text-slate-400"><span>IGST</span><span>{fmtINR(igst_amt)}</span></div>
          : <>
              <div className="flex justify-between text-xs text-slate-400"><span>CGST</span><span>{fmtINR(cgst_amt)}</span></div>
              <div className="flex justify-between text-xs text-slate-400"><span>SGST</span><span>{fmtINR(sgst_amt)}</span></div>
            </>
        )}
        {!isTax && <div className="flex justify-between text-xs text-slate-500 italic"><span>GST</span><span>Nil</span></div>}
        <div className="border-t border-dark-600 pt-2 flex justify-between text-sm font-bold">
          <span className="text-slate-200">Total</span>
          <span className="text-primary-400">{fmtINR(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ── INVOICES TAB ──────────────────────────────────────────────────────────────
function CreateInvoiceModal({ companyId, session, onClose, onSaved, initialDoc = null }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => initialDoc ? {
    client_name: initialDoc.client_name || '',
    client_address: initialDoc.client_address || '',
    client_gstin: initialDoc.client_gstin || '',
    project_name: initialDoc.project_name || '',
    invoice_date: initialDoc.invoice_date || todayStr(),
    due_date: initialDoc.due_date || '',
    cgst_rate: initialDoc.cgst_rate ?? 9,
    sgst_rate: initialDoc.sgst_rate ?? 9,
    igst_rate: initialDoc.igst_rate ?? 18,
    use_igst: (initialDoc.igst_rate || 0) > 0,
    discount_amount: initialDoc.discount_amount || 0,
    notes: initialDoc.notes || '',
    terms: initialDoc.terms || 'Payment due within 30 days.',
    is_tax_invoice: initialDoc.is_tax_invoice !== false,
  } : {
    client_name: '', client_address: '', client_gstin: '', project_name: '',
    invoice_date: todayStr(), due_date: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18,
    use_igst: false, discount_amount: 0, notes: '', terms: 'Payment due within 30 days.',
    is_tax_invoice: true,
  })
  const [lines, setLines] = useState(() => initialDoc?._lines?.length ? initialDoc._lines.map(l => ({
    _id: Math.random().toString(36).slice(2), description: l.description || '',
    hsn_sac: l.hsn_sac || '', quantity: l.quantity || 1, unit: l.unit || 'hrs',
    rate: String(l.rate || ''), amount: l.amount || 0,
    _gst_rate: null, _gst_desc: null, _hsn_open: false,
  })) : [blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const taxable  = subtotal - (parseFloat(form.discount_amount) || 0)
  const isTax    = form.is_tax_invoice !== false
  const cgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.cgst_rate) || 0) / 100 : 0
  const sgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.sgst_rate) || 0) / 100 : 0
  const igst_amt = (isTax && form.use_igst)  ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0
  const total    = taxable + cgst_amt + sgst_amt + igst_amt

  const save = async (status) => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (isTax && !form.client_gstin.trim()) return toast.error('Client GSTIN is required for Tax Invoice')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      const lineItems = lines.filter(l => l.description.trim()).map((l, i) => ({
        description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (initialDoc) {
        // ── UPDATE ──
        const { error } = await supabase.from('client_invoices').update({
          invoice_date: form.invoice_date, due_date: form.due_date || null,
          client_name: form.client_name.trim(), client_address: form.client_address.trim() || null,
          client_gstin: form.client_gstin.trim() || null, project_name: form.project_name.trim() || null,
          subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
          cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate),
          sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
          igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
          cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
          total_amount: total, balance_due: Math.max(0, total - (Number(initialDoc.paid_amount) || 0)),
          notes: form.notes.trim() || null, terms: form.terms.trim() || null,
        }).eq('id', initialDoc.id)
        if (error) throw error
        await supabase.from('invoice_line_items').delete().eq('invoice_id', initialDoc.id)
        const updItems = lineItems.map(l => ({ ...l, invoice_id: initialDoc.id }))
        if (updItems.length > 0) { const { error: le } = await supabase.from('invoice_line_items').insert(updItems); if (le) throw le }
        toast.success(`Invoice ${initialDoc.invoice_number} updated`)
        onSaved(); return
      }
      // ── CREATE ──
      const id = crypto.randomUUID()
      const invNum = await nextDocNumber(companyId, 'invoice').catch(() => `INV-${Date.now()}`)
      const { error } = await supabase.from('client_invoices').insert({
        id, company_id: companyId, invoice_number: invNum,
        invoice_date: form.invoice_date, due_date: form.due_date || null,
        client_name: form.client_name.trim(), client_address: form.client_address.trim() || null,
        client_gstin: form.client_gstin.trim() || null, project_name: form.project_name.trim() || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate), sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
        igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, paid_amount: 0, balance_due: total, status,
        notes: form.notes.trim() || null, terms: form.terms.trim() || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = lineItems.map(l => ({ ...l, invoice_id: id }))
      if (items.length > 0) { const { error: le } = await supabase.from('invoice_line_items').insert(items); if (le) throw le }
      toast.success(`Invoice ${invNum} ${status === 'sent' ? 'created & sent' : 'saved as draft'}`)
      onSaved()
    } catch (e) { toast.error(e.message || 'Failed to save') } finally { setSaving(false) }
  }

  return (
    <PagePanel title={initialDoc ? `Edit Invoice · ${initialDoc.invoice_number}` : 'New Invoice'} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
        {!initialDoc && <button onClick={() => save('draft')} disabled={saving} className="flex-1 btn-secondary">Save Draft</button>}
        <button onClick={() => save(initialDoc ? initialDoc.status : 'sent')} disabled={saving} className="flex-1 btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : initialDoc ? 'Update Invoice' : 'Save & Mark Sent'}
        </button>
      </>}>
      <div className="space-y-5">
      <SectionHead label="Client Details" />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Client / Company Name *"><ClientPicker companyId={companyId} value={form.client_name} onChange={n => setF('client_name', n)} onSelect={c => setForm(p => ({ ...p, client_name: c.name, client_gstin: c.gstin || p.client_gstin, client_address: c.address || p.client_address }))} className={inp()} /></Field></div>
        <TaxTypeToggle isTax={isTax} onToggle={v => setF('is_tax_invoice', v)} label="Invoice" />
        {isTax && (
          <div className="col-span-2">
            <Field label="Client GSTIN *">
              <input className={inp()} value={form.client_gstin} onChange={e => setF('client_gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
            </Field>
          </div>
        )}
        <Field label="Project / Work Order"><input className={inp()} value={form.project_name} onChange={e => setF('project_name', e.target.value)} /></Field>
        <Field label="Invoice Date"><input type="date" className={inp()} value={form.invoice_date} onChange={e => setF('invoice_date', e.target.value)} /></Field>
        <Field label="Due Date"><input type="date" className={inp()} value={form.due_date} onChange={e => setF('due_date', e.target.value)} /></Field>
      </div>
      <LineItemsEditor lines={lines} setLines={setLines} isTax={isTax}
        onGstRate={r => { setF('cgst_rate', r.cgst); setF('sgst_rate', r.sgst); setF('igst_rate', r.igst) }} />
      <TaxSection form={form} setF={setF} subtotal={subtotal} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        <Field label="Terms & Conditions"><textarea className={inp()} rows={2} value={form.terms} onChange={e => setF('terms', e.target.value)} /></Field>
      </div>
      </div>
    </PagePanel>
  )
}

function InvoicesTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [editingDoc, setEditingDoc] = useState(null)
  const [search, setSearch] = useState('')
  // ── Filter panel state ─────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false)
  const filterRef = useRef(null)
  const [filterClient,   setFilterClient]   = useState('')
  const [filterProject,  setFilterProject]  = useState('')
  const [filterEquipId,  setFilterEquipId]  = useState('')
  const [filterDateMode, setFilterDateMode] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo,   setFilterDateTo]   = useState('')
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterType,     setFilterType]     = useState('all')
  const [filterConverted,setFilterConverted]= useState(false)

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilters) return
    const handler = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilters(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilters])

  // ── Invoice detail view ────────────────────────────────────────────────────
  const [viewingInv, setViewingInv]   = useState(null)
  const [viewingLines, setViewingLines] = useState([])
  const [viewLoading, setViewLoading]  = useState(false)

  const openView = async (inv) => {
    setViewingInv(inv)
    setViewLoading(true)
    try {
      const { data: ld } = await supabase.from('invoice_line_items').select('*').eq('invoice_id', inv.id).order('sort_order')
      setViewingLines(ld || [])
    } catch (_) {}
    setViewLoading(false)
  }

  const closeView = () => { setViewingInv(null); setViewingLines([]) }

  const dlPDF = async (inv) => {
    try {
      const { data: ld } = await supabase.from('invoice_line_items').select('*').eq('invoice_id', inv.id).order('sort_order')
      const verifyUrl = await createVerification(supabase, companyId, { docType: 'invoice', docNumber: inv.invoice_number, docDate: inv.invoice_date, partyName: inv.client_name, amount: inv.total_amount , companyName: company?.name || null, issuedByName: userProfile?.full_name || null })
      await downloadInvoicePDF(inv, ld || [], company, verifyUrl)
    } catch(e) { toast.error(e.message) }
  }
  const dlXLSX = async (inv) => {
    try {
      const { data: ld } = await supabase.from('invoice_line_items').select('*').eq('invoice_id', inv.id).order('sort_order')
      downloadInvoiceXLSX(inv, ld || [], company)
    } catch(e) { toast.error(e.message) }
  }
  const voidQR = async (inv) => {
    if (!window.confirm(`Void QR code for ${inv.invoice_number}?\nAny printed copy will immediately show as invalid on the verification page.`)) return
    const r = await voidVerification(supabase, companyId, { docType: 'invoice', docNumber: inv.invoice_number })
    if (!r || r.count === 0) toast('No active QR found for this invoice.', { icon: 'ℹ️' })
    else toast.success(`QR voided — ${inv.invoice_number} printed copies now show as invalid`)
  }

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['sales_invoices', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices').select('*')
        .eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const updateStatus = async (id, status) => {
    await supabase.from('client_invoices').update({ status }).eq('id', id)
    qc.invalidateQueries(['sales_invoices', companyId])
    toast.success(`Marked as ${status}`)
  }

  const openEdit = async (inv) => {
    const { data: ld } = await supabase.from('invoice_line_items').select('*').eq('invoice_id', inv.id).order('sort_order')
    setEditingDoc({ ...inv, _lines: ld || [] })
  }

  const deleteInvoice = async (inv) => {
    if (Number(inv.paid_amount) > 0) return toast.error('Cannot delete a paid invoice. Void it instead.')
    if (!window.confirm(`Delete Invoice ${inv.invoice_number}?`)) return
    try {
      await supabase.from('invoice_line_items').delete().eq('invoice_id', inv.id)
      const { error } = await supabase.from('client_invoices').delete().eq('id', inv.id)
      if (error) throw error
      toast.success(`Invoice ${inv.invoice_number} deleted`)
      qc.invalidateQueries(['sales_invoices', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const voidInvoice = async (inv) => {
    if (!window.confirm(`Void Invoice ${inv.invoice_number}?`)) return
    const { error } = await supabase.from('client_invoices').update({ status: 'cancelled' }).eq('id', inv.id)
    if (error) return toast.error(error.message)
    toast.success(`Invoice ${inv.invoice_number} voided`)
    qc.invalidateQueries(['sales_invoices', companyId])
  }

  // ── Derived filter options ─────────────────────────────────────────────────
  const clientOptions  = useMemo(() => [...new Set(invoices.map(i => i.client_name).filter(Boolean))].sort(), [invoices])
  const projectOptions = useMemo(() => [...new Set(invoices.map(i => i.project_name).filter(Boolean))].sort(), [invoices])
  const equipOptions   = useMemo(() => {
    const map = {}
    invoices.forEach(i => { if (i.inv_equipment_id && i.equipment_name) map[i.inv_equipment_id] = i.equipment_name })
    return Object.entries(map).map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name))
  }, [invoices])

  // Date range from mode
  const { rangeFrom, rangeTo } = useMemo(() => {
    const now = new Date()
    if (filterDateMode === 'this_month')  return { rangeFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], rangeTo: new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0] }
    if (filterDateMode === 'last_month')  return { rangeFrom: new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString().split('T')[0], rangeTo: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0] }
    if (filterDateMode === 'this_quarter'){
      const q = Math.floor(now.getMonth()/3)
      return { rangeFrom: new Date(now.getFullYear(), q*3, 1).toISOString().split('T')[0], rangeTo: new Date(now.getFullYear(), q*3+3, 0).toISOString().split('T')[0] }
    }
    if (filterDateMode === 'custom') return { rangeFrom: filterDateFrom, rangeTo: filterDateTo }
    return { rangeFrom: '', rangeTo: '' }
  }, [filterDateMode, filterDateFrom, filterDateTo])

  // Active filter count (for badge)
  const activeFilterCount = [
    filterClient, filterProject, filterEquipId,
    filterDateMode !== 'all' ? filterDateMode : '',
    filterStatus !== 'all' ? filterStatus : '',
    filterType   !== 'all' ? filterType   : '',
    filterConverted ? 'c' : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setFilterClient(''); setFilterProject(''); setFilterEquipId('')
    setFilterDateMode('all'); setFilterDateFrom(''); setFilterDateTo('')
    setFilterStatus('all'); setFilterType('all'); setFilterConverted(false)
  }

  const displayed = invoices.filter(i => {
    if (search) { const q = search.toLowerCase(); if (!i.client_name?.toLowerCase().includes(q) && !i.invoice_number?.toLowerCase().includes(q)) return false }
    if (filterClient  && i.client_name  !== filterClient)  return false
    if (filterProject && i.project_name !== filterProject) return false
    if (filterEquipId && i.inv_equipment_id !== filterEquipId) return false
    if (filterStatus !== 'all') {
      if (filterStatus === 'unpaid') { if (['paid','cancelled'].includes(i.status)) return false }
      else if (i.status !== filterStatus) return false
    }
    if (filterType !== 'all' && i.invoice_type !== filterType) return false
    if (filterConverted && !i.converted_from_id) return false
    const d = i.invoice_date || ''
    if (rangeFrom && d < rangeFrom) return false
    if (rangeTo   && d > rangeTo)   return false
    return true
  })

  const totalPaid     = invoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
  const totalPending  = invoices.filter(i => !['paid','cancelled'].includes(i.status)).reduce((s, i) => s + Number(i.balance_due || 0), 0)

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center gap-3">
        {/* Stats */}
        <div className="flex gap-2 flex-1">
          <div className="bg-dark-800 rounded-lg px-3 py-1.5 text-xs"><span className="text-slate-500">Collected </span><span className="font-bold text-emerald-400">{fmtINR(totalPaid)}</span></div>
          <div className="bg-dark-800 rounded-lg px-3 py-1.5 text-xs"><span className="text-slate-500">Pending </span><span className="font-bold text-orange-400">{fmtINR(totalPending)}</span></div>
        </div>
        {/* Search + Filter + New */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input className={inp('pl-8 text-xs w-48')} placeholder="Search client or #…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* Filter button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilters(p => !p)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'bg-primary-600/20 border-primary-500 text-primary-300'
                  : 'border-dark-600 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter popover */}
            {showFilters && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
                  <span className="text-sm font-semibold text-slate-100">Filters</span>
                  <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && (
                      <button onClick={clearFilters} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">Clear all</button>
                    )}
                    <button onClick={() => setShowFilters(false)} className="p-1 rounded text-slate-500 hover:text-slate-200">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">

                  {/* Client */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Client</label>
                    <select className={inp('text-xs w-full')} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
                      <option value="">All Clients</option>
                      {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Project */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Project</label>
                    <select className={inp('text-xs w-full')} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
                      <option value="">All Projects</option>
                      {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {/* Equipment */}
                  {equipOptions.length > 0 && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Equipment</label>
                      <select className={inp('text-xs w-full')} value={filterEquipId} onChange={e => setFilterEquipId(e.target.value)}>
                        <option value="">All Equipment</option>
                        {equipOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Date */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Date</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[['all','All Time'],['this_month','This Month'],['last_month','Last Month'],['this_quarter','This Quarter'],['custom','Custom']].map(([v,l]) => (
                        <button key={v} onClick={() => setFilterDateMode(v)}
                          className={`text-xs py-1.5 rounded-lg border text-center transition-colors ${filterDateMode === v ? 'bg-primary-600 border-primary-500 text-white' : 'border-dark-600 text-slate-400 hover:border-slate-500'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {filterDateMode === 'custom' && (
                      <div className="mt-2 flex gap-2">
                        <div className="flex-1"><p className="text-[10px] text-slate-500 mb-1">From</p><input type="date" className={inp('text-xs w-full')} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} /></div>
                        <div className="flex-1"><p className="text-[10px] text-slate-500 mb-1">To</p><input type="date" className={inp('text-xs w-full')} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} /></div>
                      </div>
                    )}
                  </div>

                  {/* Payment Status */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Payment Status</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[['all','All'],['paid','Paid'],['unpaid','Unpaid'],['partial','Partial'],['overdue','Overdue'],['sent','Sent'],['draft','Draft'],['cancelled','Cancelled']].map(([v,l]) => (
                        <button key={v} onClick={() => setFilterStatus(v)}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${filterStatus === v ? 'bg-primary-600 border-primary-500 text-white' : 'border-dark-600 text-slate-400 hover:border-slate-500'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Invoice Type */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Invoice Type</label>
                    <div className="flex gap-1.5">
                      {[['all','All'],['tax_invoice','Tax Invoice'],['proforma','Proforma']].map(([v,l]) => (
                        <button key={v} onClick={() => setFilterType(v)}
                          className={`flex-1 text-xs py-1.5 rounded-lg border text-center transition-colors ${filterType === v ? 'bg-primary-600 border-primary-500 text-white' : 'border-dark-600 text-slate-400 hover:border-slate-500'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Converted Proforma */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-xs font-medium text-slate-300">Converted Proformas Only</p>
                      <p className="text-[10px] text-slate-500">Show invoices converted from proforma</p>
                    </div>
                    <button
                      onClick={() => setFilterConverted(p => !p)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${filterConverted ? 'bg-primary-500' : 'bg-dark-600'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${filterConverted ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>

                </div>

                {/* Footer: result count */}
                <div className="px-4 py-2.5 border-t border-dark-700 bg-dark-900/40">
                  <p className="text-xs text-slate-500 text-center">{displayed.length} invoice{displayed.length !== 1 ? 's' : ''} match{displayed.length === 1 ? 'es' : ''}</p>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0 text-xs"><Plus className="w-3.5 h-3.5" /> New Invoice</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : displayed.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><FileText className="w-10 h-10 text-slate-700" /><p>No invoices yet</p></div>
        : <div className="space-y-2 mt-1">
          {displayed.map(inv => (
            <div key={inv.id}
              className="bg-dark-800 border border-dark-700 rounded-xl p-4 cursor-pointer hover:border-dark-500 hover:bg-dark-750 transition-colors group"
              onClick={() => openView(inv)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-mono text-primary-500">{inv.invoice_number}</p>
                    <StatusBadge status={inv.status} />
                    {inv.invoice_type === 'proforma' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-400 border border-violet-800/40">Proforma</span>}
                  </div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5 truncate">{inv.client_name}</p>
                  {inv.project_name && <p className="text-xs text-slate-500">{inv.project_name}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-slate-100">{fmtINR(inv.total_amount)}</p>
                  {inv.paid_amount > 0 && <p className="text-xs text-emerald-400">Paid {fmtINR(inv.paid_amount)}</p>}
                  {inv.balance_due > 0 && <p className="text-xs text-orange-400">Due {fmtINR(inv.balance_due)}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{fmtDate(inv.invoice_date)}{inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ''}</p>
                <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                  {inv.status === 'draft' && <button onClick={() => updateStatus(inv.id, 'sent')} className="text-xs px-2 py-1 rounded-lg border border-blue-700/40 text-blue-400 hover:bg-blue-900/20"><Send className="w-3 h-3 inline mr-1" />Mark Sent</button>}
                  {inv.status === 'sent' && <button onClick={() => updateStatus(inv.id, 'paid')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20"><CheckCircle className="w-3 h-3 inline mr-1" />Mark Paid</button>}
                  {inv.status === 'overdue' && <button onClick={() => updateStatus(inv.id, 'paid')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20"><CheckCircle className="w-3 h-3 inline mr-1" />Mark Paid</button>}
                  {!['paid','cancelled'].includes(inv.status) && <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>}
                  {!['paid','cancelled'].includes(inv.status) && <button onClick={() => voidInvoice(inv)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-900/20" title="Void"><Ban className="w-3.5 h-3.5" /></button>}
                  {inv.status !== 'paid' && <button onClick={() => deleteInvoice(inv)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => voidQR(inv)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20" title="Void QR Code"><ShieldOff className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlPDF(inv)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlXLSX(inv)} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {(showCreate || editingDoc) && <CreateInvoiceModal companyId={companyId} session={session} initialDoc={editingDoc} onClose={() => { setShowCreate(false); setEditingDoc(null) }} onSaved={() => { setShowCreate(false); setEditingDoc(null); qc.invalidateQueries(['sales_invoices', companyId]) }} />}

      {/* ── Invoice Detail Drawer ────────────────────────────────────────────── */}
      {viewingInv && (
        <div className="fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={closeView} />
          {/* Panel */}
          <div className="w-full max-w-xl bg-dark-900 border-l border-dark-700 flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-dark-800 flex items-start justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-primary-400">{viewingInv.invoice_number}</span>
                  <StatusBadge status={viewingInv.status} />
                  {viewingInv.invoice_type === 'proforma' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-400 border border-violet-800/40">Proforma</span>}
                </div>
                <p className="text-base font-bold text-slate-100 mt-1">{viewingInv.client_name}</p>
                {viewingInv.client_address && <p className="text-xs text-slate-500 mt-0.5">{viewingInv.client_address}</p>}
                {viewingInv.client_gstin && <p className="text-xs text-slate-500">GSTIN: {viewingInv.client_gstin}</p>}
              </div>
              <button onClick={closeView} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-dark-700 shrink-0"><X className="w-4 h-4" /></button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {viewLoading
                ? <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
                : <>
                  {/* Meta row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-dark-800 rounded-lg p-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Invoice Date</p>
                      <p className="text-sm font-semibold text-slate-100">{fmtDate(viewingInv.invoice_date)}</p>
                    </div>
                    <div className="bg-dark-800 rounded-lg p-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Due Date</p>
                      <p className="text-sm font-semibold text-slate-100">{viewingInv.due_date ? fmtDate(viewingInv.due_date) : '—'}</p>
                    </div>
                    {viewingInv.project_name && (
                      <div className="bg-dark-800 rounded-lg p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Project</p>
                        <p className="text-sm font-semibold text-slate-100 truncate">{viewingInv.project_name}</p>
                      </div>
                    )}
                    {viewingInv.inv_equipment_id && (
                      <div className="bg-dark-800 rounded-lg p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Equipment</p>
                        <p className="text-sm font-semibold text-amber-400">Linked</p>
                      </div>
                    )}
                  </div>

                  {/* Line items */}
                  {viewingLines.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Line Items</p>
                      <div className="rounded-xl overflow-hidden border border-dark-700">
                        <table className="w-full text-xs">
                          <thead className="bg-dark-800">
                            <tr>
                              <th className="text-left px-3 py-2 text-slate-500 font-medium">Description</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">Qty</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">Rate</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-dark-700">
                            {viewingLines.map((l, i) => (
                              <tr key={i} className="bg-dark-900">
                                <td className="px-3 py-2 text-slate-200">
                                  {l.description}
                                  {l.hsn_sac && <span className="ml-1 text-slate-600 text-[10px]">HSN {l.hsn_sac}</span>}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-400">{l.quantity} {l.unit}</td>
                                <td className="px-3 py-2 text-right text-slate-400">{fmtINR(l.rate)}</td>
                                <td className="px-3 py-2 text-right text-slate-100 font-medium">{fmtINR(l.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Tax & totals */}
                  <div className="bg-dark-800 rounded-xl p-4 space-y-2">
                    {viewingInv.discount_amount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Subtotal</span><span className="text-slate-300">{fmtINR(viewingInv.subtotal_amount || viewingInv.total_amount)}</span>
                      </div>
                    )}
                    {viewingInv.discount_amount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Discount</span><span className="text-red-400">− {fmtINR(viewingInv.discount_amount)}</span>
                      </div>
                    )}
                    {viewingInv.cgst_amount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">CGST ({viewingInv.cgst_rate}%)</span><span className="text-slate-300">{fmtINR(viewingInv.cgst_amount)}</span>
                      </div>
                    )}
                    {viewingInv.sgst_amount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">SGST ({viewingInv.sgst_rate}%)</span><span className="text-slate-300">{fmtINR(viewingInv.sgst_amount)}</span>
                      </div>
                    )}
                    {viewingInv.igst_amount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">IGST ({viewingInv.igst_rate}%)</span><span className="text-slate-300">{fmtINR(viewingInv.igst_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-dark-700">
                      <span className="text-sm font-bold text-slate-200">Total</span>
                      <span className="text-sm font-black text-slate-100">{fmtINR(viewingInv.total_amount)}</span>
                    </div>
                    {viewingInv.paid_amount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Paid</span><span className="text-emerald-400 font-semibold">{fmtINR(viewingInv.paid_amount)}</span>
                      </div>
                    )}
                    {viewingInv.balance_due > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Balance Due</span><span className="text-orange-400 font-semibold">{fmtINR(viewingInv.balance_due)}</span>
                      </div>
                    )}
                  </div>

                  {viewingInv.notes && (
                    <div className="bg-dark-800 rounded-xl p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Notes</p>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap">{viewingInv.notes}</p>
                    </div>
                  )}
                  {viewingInv.terms && (
                    <div className="bg-dark-800 rounded-xl p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Terms</p>
                      <p className="text-xs text-slate-400 whitespace-pre-wrap">{viewingInv.terms}</p>
                    </div>
                  )}
                </>
              }
            </div>

            {/* Footer actions */}
            <div className="px-5 py-3 border-t border-dark-800 shrink-0 flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
              {viewingInv.status === 'draft'   && <button onClick={() => { updateStatus(viewingInv.id, 'sent');   setViewingInv(p => ({...p, status:'sent'})) }} className="flex-1 btn-ghost text-xs border-blue-700/40 text-blue-400"><Send className="w-3.5 h-3.5" /> Mark Sent</button>}
              {['sent','overdue'].includes(viewingInv.status) && <button onClick={() => { updateStatus(viewingInv.id, 'paid'); setViewingInv(p => ({...p, status:'paid'})) }} className="flex-1 btn-ghost text-xs border-emerald-700/40 text-emerald-400"><CheckCircle className="w-3.5 h-3.5" /> Mark Paid</button>}
              {!['paid','cancelled'].includes(viewingInv.status) && <button onClick={() => { closeView(); openEdit(viewingInv) }} className="flex-1 btn-ghost text-xs"><Edit2 className="w-3.5 h-3.5" /> Edit</button>}
              <button onClick={() => dlPDF(viewingInv)} className="flex-1 btn-ghost text-xs text-emerald-400"><FileDown className="w-3.5 h-3.5" /> PDF</button>
              <button onClick={() => dlXLSX(viewingInv)} className="flex-1 btn-ghost text-xs text-teal-400"><Sheet className="w-3.5 h-3.5" /> Excel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── QUOTES TAB ────────────────────────────────────────────────────────────────
function CreateQuoteModal({ companyId, session, onClose, onSaved, initialDoc = null }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => initialDoc ? {
    client_name: initialDoc.client_name || '',
    client_address: initialDoc.client_address || '',
    client_gstin: initialDoc.client_gstin || '',
    project_name: initialDoc.project_name || '',
    quote_date: initialDoc.quote_date || todayStr(),
    valid_until: initialDoc.valid_until || '',
    cgst_rate: initialDoc.cgst_rate ?? 9,
    sgst_rate: initialDoc.sgst_rate ?? 9,
    igst_rate: initialDoc.igst_rate ?? 18,
    use_igst: (initialDoc.igst_rate || 0) > 0,
    discount_amount: initialDoc.discount_amount || 0,
    notes: initialDoc.notes || '',
    terms: initialDoc.terms || 'Quote valid for 30 days.',
    is_tax_invoice: initialDoc.is_tax_invoice !== false,
  } : {
    client_name: '', client_address: '', client_gstin: '', project_name: '',
    quote_date: todayStr(), valid_until: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18,
    use_igst: false, discount_amount: 0, notes: '', terms: 'Quote valid for 30 days.',
    is_tax_invoice: true,
  })
  const [lines, setLines] = useState(() => initialDoc?._lines?.length ? initialDoc._lines.map(l => ({
    _id: Math.random().toString(36).slice(2), description: l.description || '',
    hsn_sac: l.hsn_sac || '', quantity: l.quantity || 1, unit: l.unit || 'hrs',
    rate: String(l.rate || ''), amount: l.amount || 0,
    _gst_rate: null, _gst_desc: null, _hsn_open: false,
  })) : [blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const taxable  = subtotal - (parseFloat(form.discount_amount) || 0)
  const isTax    = form.is_tax_invoice !== false
  const cgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.cgst_rate) || 0) / 100 : 0
  const sgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.sgst_rate) || 0) / 100 : 0
  const igst_amt = (isTax && form.use_igst)  ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0
  const total    = taxable + cgst_amt + sgst_amt + igst_amt

  const save = async (status) => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (isTax && !form.client_gstin.trim()) return toast.error('Client GSTIN is required for Tax Quote')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      const lineItems = lines.filter(l => l.description.trim()).map((l, i) => ({
        description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (initialDoc) {
        // ── UPDATE ──
        const { error } = await supabase.from('quotes').update({
          quote_date: form.quote_date, valid_until: form.valid_until || null,
          client_name: form.client_name.trim(), client_address: form.client_address.trim() || null,
          client_gstin: form.client_gstin.trim() || null, project_name: form.project_name.trim() || null,
          subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
          cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate),
          sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
          igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
          cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
          total_amount: total, notes: form.notes || null, terms: form.terms || null,
        }).eq('id', initialDoc.id)
        if (error) throw error
        await supabase.from('quote_line_items').delete().eq('quote_id', initialDoc.id)
        const updItems = lineItems.map(l => ({ ...l, quote_id: initialDoc.id }))
        if (updItems.length > 0) { const { error: le } = await supabase.from('quote_line_items').insert(updItems); if (le) throw le }
        toast.success(`Quote ${initialDoc.quote_number} updated`)
        onSaved(); return
      }
      // ── CREATE ──
      const id = crypto.randomUUID()
      const qNum = await nextDocNumber(companyId, 'quote').catch(() => `QT-${Date.now()}`)
      const { error } = await supabase.from('quotes').insert({
        id, company_id: companyId, quote_number: qNum,
        quote_date: form.quote_date, valid_until: form.valid_until || null,
        client_name: form.client_name.trim(), client_address: form.client_address.trim() || null,
        client_gstin: form.client_gstin.trim() || null, project_name: form.project_name.trim() || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate), sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
        igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, status, notes: form.notes || null, terms: form.terms || null,
        created_by: session.user.id,
      })
      if (error) throw error
      const items = lineItems.map(l => ({ ...l, quote_id: id }))
      if (items.length > 0) { const { error: le } = await supabase.from('quote_line_items').insert(items); if (le) throw le }
      toast.success(`Quote ${qNum} ${status === 'sent' ? 'created & sent' : 'saved as draft'}`)
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <PagePanel title={initialDoc ? `Edit Quote · ${initialDoc.quote_number}` : 'New Quote'} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
        {!initialDoc && <button onClick={() => save('draft')} disabled={saving} className="flex-1 btn-secondary">Save Draft</button>}
        <button onClick={() => save(initialDoc ? initialDoc.status : 'sent')} disabled={saving} className="flex-1 btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : initialDoc ? 'Update Quote' : 'Save & Send'}
        </button>
      </>}>
      <div className="space-y-5">
      <SectionHead label="Client Details" />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Client / Company Name *"><ClientPicker companyId={companyId} value={form.client_name} onChange={n => setF('client_name', n)} onSelect={c => setForm(p => ({ ...p, client_name: c.name, client_gstin: c.gstin || p.client_gstin }))} className={inp()} /></Field></div>
        <TaxTypeToggle isTax={isTax} onToggle={v => setF('is_tax_invoice', v)} label="Quote" />
        {isTax && (
          <div className="col-span-2">
            <Field label="Client GSTIN *">
              <input className={inp()} value={form.client_gstin} onChange={e => setF('client_gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
            </Field>
          </div>
        )}
        <Field label="Project / Work Order"><input className={inp()} value={form.project_name} onChange={e => setF('project_name', e.target.value)} /></Field>
        <Field label="Quote Date"><input type="date" className={inp()} value={form.quote_date} onChange={e => setF('quote_date', e.target.value)} /></Field>
        <Field label="Valid Until"><input type="date" className={inp()} value={form.valid_until} onChange={e => setF('valid_until', e.target.value)} /></Field>
      </div>
      <LineItemsEditor lines={lines} setLines={setLines} isTax={isTax}
        onGstRate={r => { setF('cgst_rate', r.cgst); setF('sgst_rate', r.sgst); setF('igst_rate', r.igst) }} />
      <TaxSection form={form} setF={setF} subtotal={subtotal} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        <Field label="Terms & Conditions"><textarea className={inp()} rows={2} value={form.terms} onChange={e => setF('terms', e.target.value)} /></Field>
      </div>
      </div>
    </PagePanel>
  )
}

function QuotesTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [editingDoc, setEditingDoc] = useState(null)
  const [search, setSearch] = useState('')

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('quotes').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const updateStatus = async (id, status) => {
    await supabase.from('quotes').update({ status }).eq('id', id)
    qc.invalidateQueries(['quotes', companyId])
    toast.success(`Quote ${status}`)
  }

  const openEdit = async (q) => {
    const { data: ld } = await supabase.from('quote_line_items').select('*').eq('quote_id', q.id).order('sort_order')
    setEditingDoc({ ...q, _lines: ld || [] })
  }

  const dlPDF = async (q) => {
    try {
      const { data: ld } = await supabase.from('quote_line_items').select('*').eq('quote_id', q.id).order('sort_order')
      const verifyUrl = await createVerification(supabase, companyId, { docType: 'quote', docNumber: q.quote_number, docDate: q.quote_date, partyName: q.client_name, amount: q.total_amount , companyName: company?.name || null, issuedByName: userProfile?.full_name || null })
      await downloadQuotePDF(q, ld || [], company, verifyUrl)
    } catch(e) { toast.error(e.message) }
  }
  const dlXLSX = async (q) => {
    try {
      const { data: ld } = await supabase.from('quote_line_items').select('*').eq('quote_id', q.id).order('sort_order')
      downloadQuoteXLSX(q, ld || [], company)
    } catch(e) { toast.error(e.message) }
  }
  const voidQR = async (q) => {
    if (!window.confirm(`Void QR code for ${q.quote_number}?\nAny printed copy will immediately show as invalid.`)) return
    const r = await voidVerification(supabase, companyId, { docType: 'quote', docNumber: q.quote_number })
    if (!r || r.count === 0) toast('No active QR found.', { icon: 'ℹ️' })
    else toast.success(`QR voided — ${q.quote_number} printed copies now show as invalid`)
  }

  const deleteQuote = async (q) => {
    if (!window.confirm(`Delete Quote ${q.quote_number}?`)) return
    try {
      await supabase.from('quote_line_items').delete().eq('quote_id', q.id)
      const { error } = await supabase.from('quotes').delete().eq('id', q.id)
      if (error) throw error
      toast.success(`Quote ${q.quote_number} deleted`)
      qc.invalidateQueries(['quotes', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const voidQuote = async (q) => {
    if (!window.confirm(`Void Quote ${q.quote_number}?`)) return
    const { error } = await supabase.from('quotes').update({ status: 'rejected' }).eq('id', q.id)
    if (error) return toast.error(error.message)
    toast.success(`Quote ${q.quote_number} voided`)
    qc.invalidateQueries(['quotes', companyId])
  }

  const displayed = quotes.filter(q => !search || q.client_name?.toLowerCase().includes(search.toLowerCase()) || q.quote_number?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between gap-3">
        <div className="flex gap-3 text-xs">
          <span className="bg-dark-800 rounded-xl px-3 py-2"><span className="text-slate-500">Total </span><span className="font-bold text-slate-200">{quotes.length}</span></span>
          <span className="bg-dark-800 rounded-xl px-3 py-2"><span className="text-slate-500">Accepted </span><span className="font-bold text-emerald-400">{quotes.filter(q => q.status === 'accepted').length}</span></span>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0"><Plus className="w-4 h-4" /> New Quote</button>
      </div>
      <div className="px-4 py-2 shrink-0">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" /><input className={inp('pl-8 text-xs')} placeholder="Search client or quote #…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : displayed.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><FileQuestion className="w-10 h-10 text-slate-700" /><p>No quotes yet</p></div>
        : <div className="space-y-2 mt-1">
          {displayed.map(q => (
            <div key={q.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-mono text-primary-500">{q.quote_number}</p>
                    <StatusBadge status={q.status} />
                  </div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5 truncate">{q.client_name}</p>
                  {q.project_name && <p className="text-xs text-slate-500">{q.project_name}</p>}
                  {q.valid_until && <p className="text-xs text-slate-500">Valid until {fmtDate(q.valid_until)}</p>}
                </div>
                <p className="text-lg font-black text-slate-100 shrink-0">{fmtINR(q.total_amount)}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{fmtDate(q.quote_date)}</p>
                <div className="flex gap-1 items-center flex-wrap justify-end">
                  {q.status === 'draft' && <button onClick={() => updateStatus(q.id, 'sent')} className="text-xs px-2 py-1 rounded-lg border border-blue-700/40 text-blue-400 hover:bg-blue-900/20">Mark Sent</button>}
                  {(q.status === 'sent' || q.status === 'draft') && <>
                    <button onClick={() => updateStatus(q.id, 'accepted')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20">Accept</button>
                    <button onClick={() => updateStatus(q.id, 'rejected')} className="text-xs px-2 py-1 rounded-lg border border-red-700/40 text-red-400 hover:bg-red-900/20">Reject</button>
                  </>}
                  {!['accepted','rejected'].includes(q.status) && <button onClick={() => openEdit(q)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>}
                  {!['accepted','rejected'].includes(q.status) && <button onClick={() => voidQuote(q)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-900/20" title="Void"><Ban className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => deleteQuote(q)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => voidQR(q)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20" title="Void QR Code"><ShieldOff className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlPDF(q)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlXLSX(q)} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {(showCreate || editingDoc) && <CreateQuoteModal companyId={companyId} session={session} initialDoc={editingDoc} onClose={() => { setShowCreate(false); setEditingDoc(null) }} onSaved={() => { setShowCreate(false); setEditingDoc(null); qc.invalidateQueries(['quotes', companyId]) }} />}
    </div>
  )
}

// ── SALES ORDERS TAB ──────────────────────────────────────────────────────────
function SalesOrdersTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankSOForm = () => ({ client_name: '', client_gstin: '', project_name: '', so_date: todayStr(), expected_delivery: '', notes: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18, use_igst: false, discount_amount: 0, is_tax_invoice: true })
  const [form, setForm] = useState(blankSOForm())
  const [lines, setLines] = useState([blankLine()])
  const [editing, setEditing] = useState(null)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const closeModal = () => { setShowCreate(false); setEditing(null); setForm(blankSOForm()); setLines([blankLine()]) }
  const openCreate = () => { setEditing(null); setForm(blankSOForm()); setLines([blankLine()]); setShowCreate(true) }

  const openEdit = async (o) => {
    const { data: ld } = await supabase.from('so_line_items').select('*').eq('so_id', o.id).order('sort_order')
    setEditing(o)
    setForm({ client_name: o.client_name || '', client_gstin: o.client_gstin || '', project_name: o.project_name || '', so_date: o.so_date || todayStr(), expected_delivery: o.expected_delivery || '', notes: o.notes || '', cgst_rate: o.cgst_rate ?? 9, sgst_rate: o.sgst_rate ?? 9, igst_rate: o.igst_rate ?? 18, use_igst: (o.igst_rate || 0) > 0, discount_amount: o.discount_amount || 0, is_tax_invoice: o.is_tax_invoice !== false })
    setLines(ld?.map(l => ({ _id: Math.random().toString(36).slice(2), description: l.description || '', hsn_sac: l.hsn_sac || '', quantity: l.quantity || 1, unit: l.unit || 'hrs', rate: String(l.rate || ''), amount: l.amount || 0, _gst_rate: null, _gst_desc: null, _hsn_open: false })) || [blankLine()])
    setShowCreate(true)
  }

  const dlPDFso = async (o) => {
    try { const { data: ld } = await supabase.from('so_line_items').select('*').eq('so_id', o.id).order('sort_order'); const verifyUrl = await createVerification(supabase, companyId, { docType: 'so', docNumber: o.so_number, docDate: o.so_date, partyName: o.client_name, amount: o.total_amount , companyName: company?.name || null, issuedByName: userProfile?.full_name || null }); await downloadSOPDF(o, ld||[], company, verifyUrl) } catch(e) { toast.error(e.message) }
  }
  const dlXLSXso = async (o) => {
    try { const { data: ld } = await supabase.from('so_line_items').select('*').eq('so_id', o.id).order('sort_order'); downloadSOXLSX(o, ld||[], company) } catch(e) { toast.error(e.message) }
  }
  const voidQRso = async (o) => {
    if (!window.confirm(`Void QR code for ${o.so_number}?\nAny printed copy will immediately show as invalid.`)) return
    const r = await voidVerification(supabase, companyId, { docType: 'so', docNumber: o.so_number })
    if (!r || r.count === 0) toast('No active QR found.', { icon: 'ℹ️' })
    else toast.success(`QR voided — ${o.so_number} printed copies now show as invalid`)
  }

  const deleteSO = async (o) => {
    if (!window.confirm(`Delete Sales Order ${o.so_number}?`)) return
    try {
      await supabase.from('so_line_items').delete().eq('so_id', o.id)
      const { error } = await supabase.from('sales_orders').delete().eq('id', o.id)
      if (error) throw error
      toast.success(`SO ${o.so_number} deleted`); qc.invalidateQueries(['sales_orders', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const voidSO = async (o) => {
    if (!window.confirm(`Void Sales Order ${o.so_number}?`)) return
    const { error } = await supabase.from('sales_orders').update({ status: 'cancelled' }).eq('id', o.id)
    if (error) return toast.error(error.message)
    toast.success(`SO ${o.so_number} voided`); qc.invalidateQueries(['sales_orders', companyId])
  }

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['sales_orders', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])

  const save = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (form.is_tax_invoice !== false && !form.client_gstin?.trim()) return toast.error('Client GSTIN is required for Tax Sales Order')
    setSaving(true)
    try {
      const taxable = subtotal - (parseFloat(form.discount_amount) || 0)
      const isTax = form.is_tax_invoice !== false
      const cgst = (isTax && !form.use_igst) ? taxable * (parseFloat(form.cgst_rate) || 0) / 100 : 0
      const sgst = (isTax && !form.use_igst) ? taxable * (parseFloat(form.sgst_rate) || 0) / 100 : 0
      const igst = (isTax && form.use_igst)  ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0
      const total = taxable + cgst + sgst + igst
      const validLines = lines.filter(l => l.description.trim())

      if (editing) {
        const { error } = await supabase.from('sales_orders').update({
          so_date: form.so_date, expected_delivery: form.expected_delivery || null,
          client_name: form.client_name.trim(), project_name: form.project_name || null,
          subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
          cgst_rate: parseFloat(form.cgst_rate), sgst_rate: parseFloat(form.sgst_rate), igst_rate: parseFloat(form.igst_rate),
          cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
          total_amount: total, notes: form.notes || null,
        }).eq('id', editing.id)
        if (error) throw error
        await supabase.from('so_line_items').delete().eq('so_id', editing.id)
        const updItems = validLines.map((l, i) => ({ so_id: editing.id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null, quantity: parseFloat(l.quantity) || 1, unit: l.unit, rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i }))
        if (updItems.length > 0) { const { error: le } = await supabase.from('so_line_items').insert(updItems); if (le) throw le }
        toast.success(`SO ${editing.so_number} updated`)
        closeModal(); qc.invalidateQueries(['sales_orders', companyId]); return
      }

      const id = crypto.randomUUID()
      const soNum = await nextDocNumber(companyId, 'sales_order').catch(() => `SO-${Date.now()}`)
      const { error } = await supabase.from('sales_orders').insert({
        id, company_id: companyId, so_number: soNum,
        so_date: form.so_date, expected_delivery: form.expected_delivery || null,
        client_name: form.client_name.trim(), project_name: form.project_name || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: parseFloat(form.cgst_rate), sgst_rate: parseFloat(form.sgst_rate), igst_rate: parseFloat(form.igst_rate),
        cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
        total_amount: total, status: 'confirmed', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = validLines.map((l, i) => ({ so_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null, quantity: parseFloat(l.quantity) || 1, unit: l.unit, rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i }))
      if (items.length > 0) { const { error: le } = await supabase.from('so_line_items').insert(items); if (le) throw le }
      toast.success(`Sales Order ${soNum} created`)
      closeModal(); qc.invalidateQueries(['sales_orders', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const updateStatus = async (id, status) => {
    await supabase.from('sales_orders').update({ status }).eq('id', id)
    qc.invalidateQueries(['sales_orders', companyId])
    toast.success(`Sales Order ${status}`)
  }

  const STATUS_OPTS = ['confirmed','partially_fulfilled','fulfilled','cancelled']

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="text-xs bg-dark-800 rounded-xl px-3 py-2"><span className="text-slate-500">Total SOs </span><span className="font-bold text-slate-200">{orders.length}</span></div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> New Sales Order</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : orders.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ShoppingCart className="w-10 h-10 text-slate-700" /><p>No sales orders yet</p></div>
        : <div className="space-y-2">
          {orders.map(o => (
            <div key={o.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center flex-wrap">
                    <p className="text-xs font-mono text-primary-500">{o.so_number}</p>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{o.client_name}</p>
                  {o.project_name && <p className="text-xs text-slate-500">{o.project_name}</p>}
                  {o.expected_delivery && <p className="text-xs text-slate-500">Delivery: {fmtDate(o.expected_delivery)}</p>}
                </div>
                <p className="text-lg font-black text-slate-100 shrink-0">{fmtINR(o.total_amount)}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{fmtDate(o.so_date)}</p>
                <div className="flex items-center gap-1">
                  {o.status !== 'fulfilled' && o.status !== 'cancelled' && (
                    <select value={o.status} onChange={e => updateStatus(o.id, e.target.value)}
                      className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-slate-300">
                      {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                    </select>
                  )}
                  {!['fulfilled','cancelled'].includes(o.status) && <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>}
                  {!['fulfilled','cancelled'].includes(o.status) && <button onClick={() => voidSO(o)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-900/20" title="Void"><Ban className="w-3.5 h-3.5" /></button>}
                  {o.status !== 'fulfilled' && <button onClick={() => deleteSO(o)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => voidQRso(o)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20" title="Void QR Code"><ShieldOff className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlPDFso(o)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlXLSXso(o)} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <PagePanel title={editing ? `Edit SO · ${editing.so_number}` : 'New Sales Order'} onClose={closeModal}
          footer={<><button onClick={closeModal} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update SO' : 'Create Sales Order'}</button></>}>
          <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Client Name *"><ClientPicker companyId={companyId} value={form.client_name} onChange={n => setF('client_name', n)} onSelect={c => setForm(p => ({ ...p, client_name: c.name, client_gstin: c.gstin || p.client_gstin }))} className={inp()} /></Field></div>
            <TaxTypeToggle isTax={form.is_tax_invoice !== false} onToggle={v => setF('is_tax_invoice', v)} label="Sales Order" />
            {form.is_tax_invoice !== false && (
              <div className="col-span-2">
                <Field label="Client GSTIN *">
                  <input className={inp()} value={form.client_gstin} onChange={e => setF('client_gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
                </Field>
              </div>
            )}
            <Field label="Project"><input className={inp()} value={form.project_name} onChange={e => setF('project_name', e.target.value)} /></Field>
            <Field label="SO Date"><input type="date" className={inp()} value={form.so_date} onChange={e => setF('so_date', e.target.value)} /></Field>
            <Field label="Expected Delivery"><input type="date" className={inp()} value={form.expected_delivery} onChange={e => setF('expected_delivery', e.target.value)} /></Field>
          </div>
          <LineItemsEditor lines={lines} setLines={setLines} isTax={form.is_tax_invoice !== false}
            onGstRate={r => { setF('cgst_rate', r.cgst); setF('sgst_rate', r.sgst); setF('igst_rate', r.igst) }} />
          <TaxSection form={form} setF={setF} subtotal={subtotal} />
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
          </div>
        </PagePanel>
      )}
    </div>
  )
}

// ── DELIVERY CHALLANS TAB ─────────────────────────────────────────────────────
function DeliveryChallansTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankDCForm = () => ({ client_name: '', delivery_address: '', vehicle_number: '', driver_name: '', dc_date: todayStr(), notes: '' })
  const [form, setForm] = useState(blankDCForm())
  const [lines, setLines] = useState([{ _id: Math.random().toString(36).slice(2), description: '', quantity: 1, unit: 'nos' }])
  const [editing, setEditing] = useState(null)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const closeModal = () => { setShowCreate(false); setEditing(null); setForm(blankDCForm()); setLines([{ _id: Math.random().toString(36).slice(2), description: '', quantity: 1, unit: 'nos' }]) }
  const openCreate = () => { setEditing(null); setForm(blankDCForm()); setLines([{ _id: Math.random().toString(36).slice(2), description: '', quantity: 1, unit: 'nos' }]); setShowCreate(true) }

  const openEdit = async (dc) => {
    const { data: ld } = await supabase.from('dc_line_items').select('*').eq('dc_id', dc.id).order('sort_order')
    setEditing(dc)
    setForm({ client_name: dc.client_name || '', delivery_address: dc.delivery_address || '', vehicle_number: dc.vehicle_number || '', driver_name: dc.driver_name || '', dc_date: dc.dc_date || todayStr(), notes: dc.notes || '' })
    setLines(ld?.map(l => ({ _id: Math.random().toString(36).slice(2), description: l.description || '', quantity: l.quantity || 1, unit: l.unit || 'nos' })) || [{ _id: Math.random().toString(36).slice(2), description: '', quantity: 1, unit: 'nos' }])
    setShowCreate(true)
  }

  const dlPDFdc = async (dc) => {
    try { const { data: ld } = await supabase.from('dc_line_items').select('*').eq('dc_id', dc.id).order('sort_order'); const verifyUrl = await createVerification(supabase, companyId, { docType: 'dc', docNumber: dc.dc_number, docDate: dc.dc_date, partyName: dc.client_name, amount: null , companyName: company?.name || null, issuedByName: userProfile?.full_name || null }); await downloadDCPDF(dc, ld||[], company, verifyUrl) } catch(e) { toast.error(e.message) }
  }
  const dlXLSXdc = async (dc) => {
    try { const { data: ld } = await supabase.from('dc_line_items').select('*').eq('dc_id', dc.id).order('sort_order'); downloadDCXLSX(dc, ld||[], company) } catch(e) { toast.error(e.message) }
  }
  const voidQRdc = async (dc) => {
    if (!window.confirm(`Void QR code for ${dc.dc_number}?\nAny printed copy will immediately show as invalid.`)) return
    const r = await voidVerification(supabase, companyId, { docType: 'dc', docNumber: dc.dc_number })
    if (!r || r.count === 0) toast('No active QR found.', { icon: 'ℹ️' })
    else toast.success(`QR voided — ${dc.dc_number} printed copies now show as invalid`)
  }

  const deleteDC = async (dc) => {
    if (!window.confirm(`Delete Challan ${dc.dc_number}?`)) return
    try {
      await supabase.from('dc_line_items').delete().eq('dc_id', dc.id)
      const { error } = await supabase.from('delivery_challans').delete().eq('id', dc.id)
      if (error) throw error
      toast.success(`Challan ${dc.dc_number} deleted`); qc.invalidateQueries(['delivery_challans', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const voidDC = async (dc) => {
    if (!window.confirm(`Void Challan ${dc.dc_number}?`)) return
    const { error } = await supabase.from('delivery_challans').update({ status: 'returned' }).eq('id', dc.id)
    if (error) return toast.error(error.message)
    toast.success(`Challan ${dc.dc_number} voided`); qc.invalidateQueries(['delivery_challans', companyId])
  }

  const { data: challans = [], isLoading } = useQuery({
    queryKey: ['delivery_challans', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('delivery_challans').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const updateLine = (id, key, val) => setLines(p => p.map(l => l._id === id ? { ...l, [key]: val } : l))

  const save = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    setSaving(true)
    try {
      const validLines = lines.filter(l => l.description.trim())
      if (editing) {
        const { error } = await supabase.from('delivery_challans').update({
          dc_date: form.dc_date, client_name: form.client_name.trim(),
          delivery_address: form.delivery_address || null, vehicle_number: form.vehicle_number || null,
          driver_name: form.driver_name || null, notes: form.notes || null,
        }).eq('id', editing.id)
        if (error) throw error
        await supabase.from('dc_line_items').delete().eq('dc_id', editing.id)
        const updItems = validLines.map((l, i) => ({ dc_id: editing.id, description: l.description.trim(), quantity: parseFloat(l.quantity) || 1, unit: l.unit, sort_order: i }))
        if (updItems.length > 0) { const { error: le } = await supabase.from('dc_line_items').insert(updItems); if (le) throw le }
        toast.success(`Challan ${editing.dc_number} updated`)
        closeModal(); qc.invalidateQueries(['delivery_challans', companyId]); return
      }
      const id = crypto.randomUUID()
      const dcNum = await nextDocNumber(companyId, 'challan').catch(() => `DC-${Date.now()}`)
      const { error } = await supabase.from('delivery_challans').insert({
        id, company_id: companyId, dc_number: dcNum, dc_date: form.dc_date,
        client_name: form.client_name.trim(), delivery_address: form.delivery_address || null,
        vehicle_number: form.vehicle_number || null, driver_name: form.driver_name || null,
        status: 'dispatched', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = validLines.map((l, i) => ({ dc_id: id, description: l.description.trim(), quantity: parseFloat(l.quantity) || 1, unit: l.unit, sort_order: i }))
      if (items.length > 0) { const { error: le } = await supabase.from('dc_line_items').insert(items); if (le) throw le }
      toast.success(`Delivery Challan ${dcNum} created`)
      closeModal(); qc.invalidateQueries(['delivery_challans', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const updateStatus = async (id, status) => {
    await supabase.from('delivery_challans').update({ status }).eq('id', id)
    qc.invalidateQueries(['delivery_challans', companyId])
    toast.success(`Challan marked ${status}`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{challans.length} challans</span>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> New Challan</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : challans.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><Truck className="w-10 h-10 text-slate-700" /><p>No delivery challans yet</p></div>
        : <div className="space-y-2">
          {challans.map(dc => (
            <div key={dc.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center"><p className="text-xs font-mono text-primary-500">{dc.dc_number}</p><StatusBadge status={dc.status} /></div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{dc.client_name}</p>
                  {dc.vehicle_number && <p className="text-xs text-slate-500">🚛 {dc.vehicle_number}{dc.driver_name ? ` · ${dc.driver_name}` : ''}</p>}
                  {dc.delivery_address && <p className="text-xs text-slate-500 mt-0.5">📍 {dc.delivery_address.slice(0, 60)}</p>}
                </div>
                <p className="text-xs text-slate-500 shrink-0">{fmtDate(dc.dc_date)}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex gap-1.5">
                  {dc.status === 'dispatched' && <>
                    <button onClick={() => updateStatus(dc.id, 'delivered')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20">Mark Delivered</button>
                    <button onClick={() => updateStatus(dc.id, 'returned')} className="text-xs px-2 py-1 rounded-lg border border-orange-700/40 text-orange-400 hover:bg-orange-900/20">Mark Returned</button>
                  </>}
                </div>
                <div className="flex gap-1">
                  {dc.status === 'dispatched' && <button onClick={() => openEdit(dc)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>}
                  {dc.status === 'dispatched' && <button onClick={() => voidDC(dc)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-900/20" title="Void"><Ban className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => deleteDC(dc)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => voidQRdc(dc)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20" title="Void QR Code"><ShieldOff className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlPDFdc(dc)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlXLSXdc(dc)} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <PagePanel title={editing ? `Edit Challan · ${editing.dc_number}` : 'New Delivery Challan'} onClose={closeModal}
          footer={<><button onClick={closeModal} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update Challan' : 'Create & Dispatch'}</button></>}>
          <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Client Name *"><ClientPicker companyId={companyId} value={form.client_name} onChange={n => setF('client_name', n)} onSelect={c => setForm(p => ({ ...p, client_name: c.name, delivery_address: c.address || p.delivery_address }))} className={inp()} /></Field></div>
            <Field label="Delivery Address"><input className={inp()} value={form.delivery_address} onChange={e => setF('delivery_address', e.target.value)} /></Field>
            <Field label="DC Date"><input type="date" className={inp()} value={form.dc_date} onChange={e => setF('dc_date', e.target.value)} /></Field>
            <Field label="Vehicle Number"><input className={inp()} value={form.vehicle_number} onChange={e => setF('vehicle_number', e.target.value)} placeholder="TN 01 AB 1234" /></Field>
            <Field label="Driver Name"><input className={inp()} value={form.driver_name} onChange={e => setF('driver_name', e.target.value)} /></Field>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2"><SectionHead label="Items" /><button type="button" onClick={() => setLines(p => [...p, { _id: Math.random().toString(36).slice(2), description: '', quantity: 1, unit: 'nos' }])} className="text-xs text-primary-400"><Plus className="w-3.5 h-3.5 inline" /> Add Row</button></div>
            <div className="space-y-2">
              {lines.map(l => (
                <div key={l._id} className="grid grid-cols-12 gap-1 items-center">
                  <input className={`${inp()} col-span-6 text-xs`} placeholder="Description" value={l.description} onChange={e => updateLine(l._id, 'description', e.target.value)} />
                  <input className={`${inp()} col-span-2 text-xs text-center`} type="number" value={l.quantity} onChange={e => updateLine(l._id, 'quantity', e.target.value)} min="0" />
                  <select className={`${inp()} col-span-3 text-xs`} value={l.unit} onChange={e => updateLine(l._id, 'unit', e.target.value)}>
                    {['unit','nos','kg','ton','m3','ls','set'].map(u => <option key={u}>{u}</option>)}
                  </select>
                  <button type="button" onClick={() => setLines(p => p.length > 1 ? p.filter(x => x._id !== l._id) : p)} className="col-span-1 flex justify-center text-slate-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
          </div>
        </PagePanel>
      )}
    </div>
  )
}

// ── CREDIT NOTES TAB ──────────────────────────────────────────────────────────
function CreditNotesTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankCNForm = () => ({ client_name: '', client_gstin: '', reason: '', cn_date: todayStr(), cgst_rate: 9, sgst_rate: 9, notes: '', use_igst: false, igst_rate: 18, is_tax_invoice: true })
  const [form, setForm] = useState(blankCNForm())
  const [lines, setLines] = useState([blankLine()])
  const [editing, setEditing] = useState(null)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const closeModal = () => { setShowCreate(false); setEditing(null); setForm(blankCNForm()); setLines([blankLine()]) }
  const openCreate = () => { setEditing(null); setForm(blankCNForm()); setLines([blankLine()]); setShowCreate(true) }

  const openEdit = async (cn) => {
    const { data: ld } = await supabase.from('cn_line_items').select('*').eq('cn_id', cn.id).order('sort_order')
    setEditing(cn)
    setForm({ client_name: cn.client_name || '', client_gstin: cn.client_gstin || '', reason: cn.reason || '', cn_date: cn.cn_date || todayStr(), cgst_rate: cn.cgst_rate ?? 9, sgst_rate: cn.sgst_rate ?? 9, notes: cn.notes || '', use_igst: (cn.igst_rate || 0) > 0, igst_rate: cn.igst_rate ?? 18, is_tax_invoice: cn.is_tax_invoice !== false })
    setLines(ld?.map(l => ({ _id: Math.random().toString(36).slice(2), description: l.description || '', hsn_sac: l.hsn_sac || '', quantity: l.quantity || 1, unit: l.unit || 'hrs', rate: String(l.rate || ''), amount: l.amount || 0, _gst_rate: null, _gst_desc: null, _hsn_open: false })) || [blankLine()])
    setShowCreate(true)
  }

  const dlPDFcn = async (cn) => {
    try { const { data: ld } = await supabase.from('cn_line_items').select('*').eq('cn_id', cn.id).order('sort_order'); const verifyUrl = await createVerification(supabase, companyId, { docType: 'cn', docNumber: cn.cn_number, docDate: cn.cn_date, partyName: cn.client_name, amount: cn.total_amount , companyName: company?.name || null, issuedByName: userProfile?.full_name || null }); await downloadCNPDF(cn, ld||[], company, verifyUrl) } catch(e) { toast.error(e.message) }
  }
  const dlXLSXcn = async (cn) => {
    try { const { data: ld } = await supabase.from('cn_line_items').select('*').eq('cn_id', cn.id).order('sort_order'); downloadCNXLSX(cn, ld||[], company) } catch(e) { toast.error(e.message) }
  }
  const voidQRcn = async (cn) => {
    if (!window.confirm(`Void QR code for ${cn.cn_number}?\nAny printed copy will immediately show as invalid.`)) return
    const r = await voidVerification(supabase, companyId, { docType: 'cn', docNumber: cn.cn_number })
    if (!r || r.count === 0) toast('No active QR found.', { icon: 'ℹ️' })
    else toast.success(`QR voided — ${cn.cn_number} printed copies now show as invalid`)
  }

  const deleteCN = async (cn) => {
    if (!window.confirm(`Delete Credit Note ${cn.cn_number}?`)) return
    try {
      await supabase.from('cn_line_items').delete().eq('cn_id', cn.id)
      const { error } = await supabase.from('credit_notes').delete().eq('id', cn.id)
      if (error) throw error
      toast.success(`Credit Note ${cn.cn_number} deleted`); qc.invalidateQueries(['credit_notes', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const voidCN = async (cn) => {
    if (!window.confirm(`Void Credit Note ${cn.cn_number}?`)) return
    const { error } = await supabase.from('credit_notes').update({ status: 'cancelled' }).eq('id', cn.id)
    if (error) return toast.error(error.message)
    toast.success(`Credit Note ${cn.cn_number} voided`); qc.invalidateQueries(['credit_notes', companyId])
  }

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['credit_notes', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('credit_notes').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const isTaxCN  = form.is_tax_invoice !== false
  const cgst_amt = (isTaxCN && !form.use_igst) ? subtotal * (parseFloat(form.cgst_rate) || 0) / 100 : 0
  const sgst_amt = (isTaxCN && !form.use_igst) ? subtotal * (parseFloat(form.sgst_rate) || 0) / 100 : 0
  const igst_amt = (isTaxCN && form.use_igst)  ? subtotal * (parseFloat(form.igst_rate) || 0) / 100 : 0
  const total    = subtotal + cgst_amt + sgst_amt + igst_amt

  const save = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    setSaving(true)
    try {
      const validLines = lines.filter(l => l.description.trim())
      if (editing) {
        const { error } = await supabase.from('credit_notes').update({
          cn_date: form.cn_date, client_name: form.client_name.trim(), reason: form.reason || null,
          subtotal, cgst_rate: parseFloat(form.cgst_rate), sgst_rate: parseFloat(form.sgst_rate), igst_rate: parseFloat(form.igst_rate),
          cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
          total_amount: total, notes: form.notes || null,
        }).eq('id', editing.id)
        if (error) throw error
        await supabase.from('cn_line_items').delete().eq('cn_id', editing.id)
        const updItems = validLines.map((l, i) => ({ cn_id: editing.id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null, quantity: parseFloat(l.quantity) || 1, unit: l.unit, rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i }))
        if (updItems.length > 0) { const { error: le } = await supabase.from('cn_line_items').insert(updItems); if (le) throw le }
        toast.success(`Credit Note ${editing.cn_number} updated`)
        closeModal(); qc.invalidateQueries(['credit_notes', companyId]); return
      }
      const id = crypto.randomUUID()
      const cnNum = await nextDocNumber(companyId, 'credit_note').catch(() => `CN-${Date.now()}`)
      const { error } = await supabase.from('credit_notes').insert({
        id, company_id: companyId, cn_number: cnNum, cn_date: form.cn_date,
        client_name: form.client_name.trim(), reason: form.reason || null,
        subtotal, cgst_rate: parseFloat(form.cgst_rate), sgst_rate: parseFloat(form.sgst_rate), igst_rate: parseFloat(form.igst_rate),
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, status: 'issued', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = validLines.map((l, i) => ({ cn_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null, quantity: parseFloat(l.quantity) || 1, unit: l.unit, rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i }))
      if (items.length > 0) { const { error: le } = await supabase.from('cn_line_items').insert(items); if (le) throw le }
      toast.success(`Credit Note ${cnNum} issued`)
      closeModal(); qc.invalidateQueries(['credit_notes', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{notes.length} credit notes</span>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> New Credit Note</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : notes.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><RefreshCcw className="w-10 h-10 text-slate-700" /><p>No credit notes yet</p></div>
        : <div className="space-y-2">
          {notes.map(cn => (
            <div key={cn.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex gap-2 items-center"><p className="text-xs font-mono text-primary-500">{cn.cn_number}</p><StatusBadge status={cn.status} /></div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{cn.client_name}</p>
                  {cn.reason && <p className="text-xs text-slate-500 mt-0.5">Reason: {cn.reason}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-red-400">-{fmtINR(cn.total_amount)}</p>
                  <p className="text-xs text-slate-500">{fmtDate(cn.cn_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-dark-700">
                {cn.status !== 'cancelled' && <button onClick={() => openEdit(cn)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>}
                {cn.status !== 'cancelled' && <button onClick={() => voidCN(cn)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-900/20" title="Void"><Ban className="w-3.5 h-3.5" /></button>}
                <button onClick={() => deleteCN(cn)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => voidQRcn(cn)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20" title="Void QR Code"><ShieldOff className="w-3.5 h-3.5" /></button>
                <button onClick={() => dlPDFcn(cn)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => dlXLSXcn(cn)} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {(showCreate || editing) && (
        <PagePanel title={editing ? `Edit Credit Note · ${editing.cn_number}` : 'New Credit Note'} onClose={closeModal}
          footer={<><button onClick={closeModal} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update Credit Note' : 'Issue Credit Note'}</button></>}>
          <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Client Name *"><ClientPicker companyId={companyId} value={form.client_name} onChange={n => setF('client_name', n)} onSelect={c => setForm(p => ({ ...p, client_name: c.name, client_gstin: c.gstin || p.client_gstin }))} className={inp()} /></Field></div>
            <TaxTypeToggle isTax={isTaxCN} onToggle={v => setF('is_tax_invoice', v)} label="Credit Note" />
            {isTaxCN && (
              <div className="col-span-2">
                <Field label="Client GSTIN *">
                  <input className={inp()} value={form.client_gstin} onChange={e => setF('client_gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
                </Field>
              </div>
            )}
            <Field label="CN Date"><input type="date" className={inp()} value={form.cn_date} onChange={e => setF('cn_date', e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Reason for Credit Note"><input className={inp()} value={form.reason} onChange={e => setF('reason', e.target.value)} placeholder="Excess billing, goods returned, etc." /></Field></div>
          </div>
          <LineItemsEditor lines={lines} setLines={setLines} isTax={isTaxCN}
            onGstRate={r => { setF('cgst_rate', r.cgst); setF('sgst_rate', r.sgst); setF('igst_rate', r.igst) }} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              {isTaxCN && <>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="checkbox" checked={form.use_igst} onChange={e => setF('use_igst', e.target.checked)} />Use IGST</label>
                {!form.use_igst ? <div className="grid grid-cols-2 gap-2"><Field label="CGST %"><input type="number" className={inp()} value={form.cgst_rate} onChange={e => setF('cgst_rate', e.target.value)} /></Field><Field label="SGST %"><input type="number" className={inp()} value={form.sgst_rate} onChange={e => setF('sgst_rate', e.target.value)} /></Field></div>
                : <Field label="IGST %"><input type="number" className={inp()} value={form.igst_rate} onChange={e => setF('igst_rate', e.target.value)} /></Field>}
              </>}
              {!isTaxCN && <p className="text-xs text-slate-500 italic">No GST applicable</p>}
            </div>
            <div className="bg-dark-700 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{fmtINR(subtotal)}</span></div>
              {isTaxCN && <div className="flex justify-between text-slate-400"><span>Tax</span><span>{fmtINR(cgst_amt + sgst_amt + igst_amt)}</span></div>}
              {!isTaxCN && <div className="flex justify-between text-slate-500 italic"><span>GST</span><span>Nil</span></div>}
              <div className="flex justify-between font-bold text-red-400 border-t border-dark-600 pt-1"><span>Credit Total</span><span>-{fmtINR(total)}</span></div>
            </div>
          </div>
          </div>
        </PagePanel>
      )}
    </div>
  )
}

// ── PAYMENTS RECEIVED TAB ─────────────────────────────────────────────────────
function PaymentsReceivedTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankPRForm = () => ({ client_name: '', amount: '', payment_date: todayStr(), payment_mode: 'bank', bank_reference: '', notes: '' })
  const [form, setForm] = useState(blankPRForm())
  const [editing, setEditing] = useState(null)
  const [linkedInv, setLinkedInv] = useState(null) // carries project/equipment context from selected invoice
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const closeModal = () => { setShowCreate(false); setEditing(null); setForm(blankPRForm()); setInvoiceId(''); setLinkedInv(null) }
  const openCreate = () => { setEditing(null); setForm(blankPRForm()); setInvoiceId(''); setLinkedInv(null); setShowCreate(true) }
  const openEdit = (p) => {
    setEditing(p)
    setForm({ client_name: p.client_name || '', amount: String(p.amount || ''), payment_date: p.payment_date || todayStr(), payment_mode: p.payment_mode || 'bank', bank_reference: p.bank_reference || '', notes: p.notes || '' })
    setInvoiceId(p.invoice_id || '')
    setLinkedInv(p.project_id || p.inv_equipment_id
      ? { project_id: p.project_id, inv_equipment_id: p.inv_equipment_id, project_name: p.project_name }
      : null)
    setShowCreate(true)
  }
  const deletePayment = async (p) => {
    if (!window.confirm(`Delete Payment ${p.payment_number}?`)) return
    try {
      // Remove ledger entry first
      await supabase.from('account_transactions').delete().eq('reference_type', 'payment_received').eq('reference_id', p.id)
      const { error } = await supabase.from('payments_received').delete().eq('id', p.id)
      if (error) throw error
      // Re-sync the linked invoice (paid_amount may drop back)
      if (p.invoice_id) await syncInvoice(p.invoice_id)
      toast.success(`Payment ${p.payment_number} deleted`)
      qc.invalidateQueries(['payments_received', companyId])
      qc.invalidateQueries(['sales_invoices', companyId])
      qc.invalidateQueries(['dash_invoices', companyId])
      qc.invalidateQueries(['ledger', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments_received', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('payments_received').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices_for_payment', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices').select('id, invoice_number, client_name, balance_due, project_id, inv_equipment_id, project_name').eq('company_id', companyId).in('status', ['sent','partial','overdue']).order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!companyId && showCreate,
  })

  const [invoiceId, setInvoiceId] = useState('')
  const totalReceived = payments.reduce((s, p) => s + Number(p.amount || 0), 0)

  // ── Sync paid_amount / balance_due / status back onto the invoice ─────────
  const syncInvoice = async (invId) => {
    if (!invId) return
    const { data: allPmts } = await supabase
      .from('payments_received').select('amount').eq('invoice_id', invId)
    const totalPaid = (allPmts || []).reduce((s, p) => s + Number(p.amount || 0), 0)
    const { data: inv } = await supabase
      .from('client_invoices').select('total_amount, due_date').eq('id', invId).single()
    if (!inv) return
    const balanceDue = Math.max(0, inv.total_amount - totalPaid)
    const today = new Date().toISOString().split('T')[0]
    const status = balanceDue <= 0 ? 'paid'
      : totalPaid > 0 ? 'partial'
      : inv.due_date && inv.due_date < today ? 'overdue'
      : 'sent'
    await supabase.from('client_invoices')
      .update({ paid_amount: totalPaid, balance_due: balanceDue, status })
      .eq('id', invId)
  }

  const save = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const amt    = parseFloat(form.amount)
      // Context automatically pulled from the linked invoice
      const projId   = invoiceId ? (linkedInv?.project_id       || null) : null
      const equipId  = invoiceId ? (linkedInv?.inv_equipment_id || null) : null
      const projName = invoiceId ? (linkedInv?.project_name     || null) : null
      if (editing) {
        const { error } = await supabase.from('payments_received').update({
          payment_date: form.payment_date, invoice_id: invoiceId || null,
          client_name: form.client_name.trim(), amount: amt,
          payment_mode: form.payment_mode, bank_reference: form.bank_reference || null,
          notes: form.notes || null,
          project_id: projId, inv_equipment_id: equipId, project_name: projName,
        }).eq('id', editing.id)
        if (error) throw error
        // Keep ledger in sync
        await supabase.from('account_transactions').update({
          txn_date: form.payment_date, amount: amt,
          description: `Payment received — ${editing.payment_number} (${form.client_name.trim()})`,
          payment_mode: form.payment_mode, bank_reference: form.bank_reference || null,
          notes: form.notes || null,
          project_id: projId, inv_equipment_id: equipId,
        }).eq('reference_type', 'payment_received').eq('reference_id', editing.id)
        // Sync the invoice's paid_amount / balance / status
        const prevInvId = editing.invoice_id
        const newInvId  = invoiceId || null
        await syncInvoice(newInvId)
        if (prevInvId && prevInvId !== newInvId) await syncInvoice(prevInvId) // re-link edge-case
        toast.success(`Payment ${editing.payment_number} updated`)
        closeModal()
        qc.invalidateQueries(['payments_received', companyId])
        qc.invalidateQueries(['sales_invoices', companyId])
        qc.invalidateQueries(['dash_invoices', companyId])
        qc.invalidateQueries(['ledger', companyId])
        return
      }
      const prNum = await nextDocNumber(companyId, 'payment_recv').catch(() => `PR-${Date.now()}`)
      const { data: pr, error } = await supabase.from('payments_received').insert({
        company_id: companyId, payment_number: prNum,
        payment_date: form.payment_date, invoice_id: invoiceId || null,
        client_name: form.client_name.trim(), amount: amt,
        payment_mode: form.payment_mode, bank_reference: form.bank_reference || null,
        notes: form.notes || null, created_by: session.user.id,
        project_id: projId, inv_equipment_id: equipId, project_name: projName,
      }).select().single()
      if (error) throw error
      // Write to ledger immediately
      await supabase.from('account_transactions').insert({
        company_id: companyId, txn_date: form.payment_date, type: 'income',
        description: `Payment received — ${prNum} (${form.client_name.trim()})`,
        amount: amt, payment_mode: form.payment_mode,
        bank_reference: form.bank_reference || null,
        reference_type: 'payment_received', reference_id: pr.id,
        notes: form.notes || null, created_by: session.user.id,
        project_id: projId, inv_equipment_id: equipId,
      })
      // Sync the invoice's paid_amount / balance / status
      await syncInvoice(invoiceId || null)
      toast.success(`Payment ${prNum} recorded — ${fmtINR(form.amount)}`)
      closeModal()
      qc.invalidateQueries(['payments_received', companyId])
      qc.invalidateQueries(['sales_invoices', companyId])
      qc.invalidateQueries(['dash_invoices', companyId])
      qc.invalidateQueries(['ledger', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const MODES = ['cash','bank','upi','cheque','neft','rtgs']

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs"><span className="text-slate-500">Total Received </span><span className="font-bold text-emerald-400">{fmtINR(totalReceived)}</span></div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Record Payment</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : payments.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ArrowDownCircle className="w-10 h-10 text-slate-700" /><p>No payments recorded yet</p></div>
        : <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-primary-500">{p.payment_number}</p>
                  <p className="font-semibold text-slate-100 text-sm">{p.client_name}</p>
                  <p className="text-xs text-slate-500">{fmtDate(p.payment_date)} · {p.payment_mode?.toUpperCase()}{p.bank_reference ? ` · ${p.bank_reference}` : ''}</p>
                  {(p.project_name || p.inv_equipment_id) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.project_name && <span className="text-[11px] text-teal-400">📍 {p.project_name}</span>}
                      {p.inv_equipment_id && <span className="text-[11px] text-amber-400">🚧 Equipment</span>}
                    </div>
                  )}
                </div>
                <p className="text-xl font-black text-emerald-400 shrink-0">{fmtINR(p.amount)}</p>
              </div>
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-dark-700">
                <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => deletePayment(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => { downloadPaymentReceivedPDF(p, company) }} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => { downloadPaymentReceivedXLSX(p, company) }} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {(showCreate || editing) && (
        <PagePanel title={editing ? `Edit Payment · ${editing.payment_number}` : 'Record Payment'} onClose={closeModal}
          footer={<><button onClick={closeModal} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update Payment' : 'Record Payment'}</button></>}>
          <div className="space-y-5">
          <Field label="Client Name *"><ClientPicker companyId={companyId} value={form.client_name} onChange={n => setF('client_name', n)} onSelect={c => setF('client_name', c.name)} placeholder="Who paid?" className={inp()} /></Field>
          {invoices.length > 0 && <Field label="Link to Invoice (optional)">
            <select className={inp()} value={invoiceId} onChange={e => {
              const id = e.target.value
              setInvoiceId(id)
              const inv = invoices.find(i => i.id === id)
              if (inv) {
                setF('client_name', inv.client_name)
                setLinkedInv((inv.project_id || inv.inv_equipment_id || inv.project_name) ? inv : null)
              } else {
                setLinkedInv(null)
              }
            }}>
              <option value="">-- Select invoice --</option>
              {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} · {i.client_name} · Due {fmtINR(i.balance_due)}</option>)}
            </select>
            {linkedInv && (linkedInv.project_name || linkedInv.inv_equipment_id) && (
              <div className="flex items-center gap-3 mt-1.5 text-xs">
                {linkedInv.project_name && <span className="text-teal-400 flex items-center gap-1">📍 {linkedInv.project_name}</span>}
                {linkedInv.inv_equipment_id && <span className="text-amber-400 flex items-center gap-1">🚧 Equipment linked</span>}
              </div>
            )}
          </Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *"><input type="number" className={inp()} value={form.amount} onChange={e => setF('amount', e.target.value)} placeholder="0" step="0.01" /></Field>
            <Field label="Payment Date"><input type="date" className={inp()} value={form.payment_date} onChange={e => setF('payment_date', e.target.value)} /></Field>
            <Field label="Payment Mode">
              <select className={inp()} value={form.payment_mode} onChange={e => setF('payment_mode', e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </Field>
            <Field label="Reference / Cheque No."><input className={inp()} value={form.bank_reference} onChange={e => setF('bank_reference', e.target.value)} /></Field>
          </div>
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
          </div>
        </PagePanel>
      )}
    </div>
  )
}

// ── MAIN SALES PAGE ───────────────────────────────────────────────────────────
export default function SalesPage({ onNavigate }) {
  const { companyId, session, industryType } = useAuth()
  const [activeTab, setActiveTab] = useState('clients')

  const tabs = [
    { id: 'clients',   label: 'Clients',            icon: Building2 },
    { id: 'invoices',  label: 'Invoices',            icon: FileText },
    { id: 'quotes',    label: 'Quotes',              icon: FileQuestion },
    { id: 'orders',    label: 'Sales Orders',        icon: ShoppingCart },
    { id: 'challans',  label: 'Delivery Challans',   icon: Truck },
    { id: 'credit',    label: 'Credit Notes',        icon: RefreshCcw },
    { id: 'payments',  label: 'Payments Received',   icon: ArrowDownCircle },
  ].filter(t => {
    // equipment_rental has a dedicated Clients nav item — hide the Clients tab here to avoid duplication
    if (industryType === 'equipment_rental' && t.id === 'clients') return false
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 shrink-0 border-b border-dark-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-700/40 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Sales</h1>
            <p className="text-xs text-slate-500">Clients · Invoices · Quotes · Orders · Collections</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.id ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'clients'  && <ClientsPage embedded />}
        {activeTab === 'invoices' && <InvoicesTab companyId={companyId} session={session} />}
        {activeTab === 'quotes'   && <QuotesTab   companyId={companyId} session={session} />}
        {activeTab === 'orders'   && <SalesOrdersTab companyId={companyId} session={session} />}
        {activeTab === 'challans' && <DeliveryChallansTab companyId={companyId} session={session} />}
        {activeTab === 'credit'   && <CreditNotesTab companyId={companyId} session={session} />}
        {activeTab === 'payments' && <PaymentsReceivedTab companyId={companyId} session={session} />}
      </div>
    </div>
  )
}
