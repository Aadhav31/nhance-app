import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { lookupHsnSac } from '../../utils/hsnSacLookup'
import {
  Plus, X, Loader2, FileText, TrendingUp, Truck, RefreshCcw,
  ArrowDownCircle, ShoppingCart, ChevronRight, CheckCircle,
  Copy, Edit2, Trash2, Search, IndianRupee, Calendar, User,
  FileQuestion, Send, AlertTriangle, Building2, Phone, Mail,
  MapPin, BadgeCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import ClientsPage from '../clients/ClientsPage'

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]
const inp = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${x}`
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—'

const STATUS_COLORS = {
  draft:               'bg-slate-700/50 text-slate-300 border-slate-600',
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
function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className={`bg-dark-800 rounded-xl border border-dark-700 shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} my-4`}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-dark-700">
          <div>
            <h2 className="text-base font-bold text-slate-100">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 shrink-0 mt-0.5"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">{children}</div>
        {footer && <div className="flex gap-3 px-6 pb-6 pt-0">{footer}</div>}
      </div>
    </div>
  )
}

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

const blankLine = () => ({ _id: Math.random().toString(36).slice(2), description: '', hsn_sac: '', quantity: 1, unit: 'hrs', rate: '', amount: 0, _gst_rate: null, _gst_desc: null })

const LINE_UNITS = ['unit','nos','hrs','days','kg','ton','m3','km','ls','set','mtr','sqm','sqft','cum','rmt','ltr']

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
      <div className="space-y-2">
        {lines.map(l => (
          <div key={l._id} className="bg-dark-700/40 rounded-xl p-2 space-y-1.5">
            {/* Row 1: HSN/SAC (tax only) + Description + Delete */}
            <div className="flex gap-1.5 items-center">
              {isTax && (
                <div className="relative w-28 shrink-0">
                  <input
                    className={`${inp()} text-xs font-mono uppercase pr-8`}
                    placeholder="HSN/SAC"
                    value={l.hsn_sac}
                    onChange={e => update(l._id, 'hsn_sac', e.target.value)}
                  />
                  {l._gst_rate != null && (
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {l._gst_rate}%
                    </span>
                  )}
                  {!l.hsn_sac.trim() && (
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-orange-500/80">*</span>
                  )}
                </div>
              )}
              <input
                className={`${inp()} flex-1 text-xs`}
                placeholder="Description of goods / services"
                value={l.description}
                onChange={e => update(l._id, 'description', e.target.value)}
              />
              <button type="button" onClick={() => setLines(p => p.length > 1 ? p.filter(x => x._id !== l._id) : p)}
                className="shrink-0 text-slate-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
            </div>
            {/* Row 2: Qty | Unit | Rate | Amount */}
            <div className="flex gap-1.5 items-center pl-0.5">
              <div className="w-16 shrink-0">
                <input className={`${inp()} text-xs text-center`} type="number" value={l.quantity} onChange={e => update(l._id, 'quantity', e.target.value)} min="0" step="0.01" />
              </div>
              <div className="w-20 shrink-0">
                <select className={`${inp()} text-xs`} value={l.unit} onChange={e => update(l._id, 'unit', e.target.value)}>
                  {LINE_UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <input className={`${inp()} text-xs text-right`} type="number" value={l.rate} onChange={e => update(l._id, 'rate', e.target.value)} placeholder="Rate (₹)" step="0.01" />
              </div>
              <div className="w-24 text-right shrink-0">
                <span className="text-xs font-semibold text-slate-200">{fmtINR(l.amount)}</span>
              </div>
            </div>
            {/* HSN/SAC description hint — only on tax docs */}
            {isTax && l._gst_desc && (
              <p className="text-[9px] text-slate-500 px-0.5 truncate">{l._gst_desc}</p>
            )}
          </div>
        ))}
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
function CreateInvoiceModal({ companyId, session, invoiceCount, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_name: '', client_address: '', client_gstin: '', project_name: '',
    invoice_date: todayStr(), due_date: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18,
    use_igst: false, discount_amount: 0, notes: '', terms: 'Payment due within 30 days.',
    is_tax_invoice: true,
  })
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const taxable  = subtotal - (parseFloat(form.discount_amount) || 0)
  const isTax    = form.is_tax_invoice !== false
  const cgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.cgst_rate) || 0) / 100 : 0
  const sgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.sgst_rate) || 0) / 100 : 0
  const igst_amt = (isTax && form.use_igst)  ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0
  const total    = taxable + cgst_amt + sgst_amt + igst_amt
  const invNum   = useMemo(() => `INV-${new Date().getFullYear()}-${String((invoiceCount || 0) + 1).padStart(3, '0')}`, [invoiceCount])

  const save = async (status) => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (isTax && !form.client_gstin.trim()) return toast.error('Client GSTIN is required for Tax Invoice')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      const id = crypto.randomUUID()
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
      const good = lines.filter(l => l.description.trim()).map((l, i) => ({
        invoice_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (good.length > 0) { const { error: le } = await supabase.from('invoice_line_items').insert(good); if (le) throw le }
      toast.success(`Invoice ${invNum} ${status === 'sent' ? 'created & sent' : 'saved as draft'}`)
      onSaved()
    } catch (e) { toast.error(e.message || 'Failed to save') } finally { setSaving(false) }
  }

  return (
    <Modal title={`New Invoice — ${invNum}`} onClose={onClose} wide
      footer={<>
        <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
        <button onClick={() => save('draft')} disabled={saving} className="flex-1 btn-secondary">Save Draft</button>
        <button onClick={() => save('sent')}  disabled={saving} className="flex-1 btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Mark Sent'}
        </button>
      </>}>
      <SectionHead label="Client Details" />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Client / Company Name *"><input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></Field></div>
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
    </Modal>
  )
}

function InvoicesTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

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

  const displayed = invoices.filter(i =>
    (filterStatus === 'all' || i.status === filterStatus) &&
    (!search || i.client_name?.toLowerCase().includes(search.toLowerCase()) ||
     i.invoice_number?.toLowerCase().includes(search.toLowerCase()))
  )

  const totalPaid     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const totalPending  = invoices.filter(i => !['paid','cancelled'].includes(i.status)).reduce((s, i) => s + Number(i.balance_due || 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-3">
          <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs"><span className="text-slate-500">Collected </span><span className="font-bold text-emerald-400">{fmtINR(totalPaid)}</span></div>
          <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs"><span className="text-slate-500">Pending </span><span className="font-bold text-orange-400">{fmtINR(totalPending)}</span></div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0"><Plus className="w-4 h-4" /> New Invoice</button>
      </div>
      <div className="px-4 py-2 flex gap-2 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input className={inp('pl-8 text-xs')} placeholder="Search client or invoice #…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['all','draft','sent','partial','paid','overdue'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`text-xs px-3 py-2 rounded-lg border capitalize transition-colors ${filterStatus === s ? 'bg-primary-600 border-primary-500 text-white' : 'border-dark-600 text-slate-400 hover:border-slate-500'}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : displayed.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><FileText className="w-10 h-10 text-slate-700" /><p>No invoices yet</p></div>
        : <div className="space-y-2 mt-1">
          {displayed.map(inv => (
            <div key={inv.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-mono text-slate-500">{inv.invoice_number}</p>
                    <StatusBadge status={inv.status} />
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
                <div className="flex gap-1.5">
                  {inv.status === 'draft' && <button onClick={() => updateStatus(inv.id, 'sent')} className="text-xs px-2 py-1 rounded-lg border border-blue-700/40 text-blue-400 hover:bg-blue-900/20"><Send className="w-3 h-3 inline mr-1" />Mark Sent</button>}
                  {inv.status === 'sent' && <button onClick={() => updateStatus(inv.id, 'paid')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20"><CheckCircle className="w-3 h-3 inline mr-1" />Mark Paid</button>}
                  {inv.status === 'overdue' && <button onClick={() => updateStatus(inv.id, 'paid')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20"><CheckCircle className="w-3 h-3 inline mr-1" />Mark Paid</button>}
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && <CreateInvoiceModal companyId={companyId} session={session} invoiceCount={invoices.length} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries(['sales_invoices', companyId]) }} />}
    </div>
  )
}

// ── QUOTES TAB ────────────────────────────────────────────────────────────────
function CreateQuoteModal({ companyId, session, count, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_name: '', client_address: '', client_gstin: '', project_name: '',
    quote_date: todayStr(), valid_until: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18,
    use_igst: false, discount_amount: 0, notes: '', terms: 'Quote valid for 30 days.',
    is_tax_invoice: true,
  })
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const taxable  = subtotal - (parseFloat(form.discount_amount) || 0)
  const isTax    = form.is_tax_invoice !== false
  const cgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.cgst_rate) || 0) / 100 : 0
  const sgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.sgst_rate) || 0) / 100 : 0
  const igst_amt = (isTax && form.use_igst)  ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0
  const total    = taxable + cgst_amt + sgst_amt + igst_amt
  const qNum     = useMemo(() => `QT-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`, [count])

  const save = async (status) => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (isTax && !form.client_gstin.trim()) return toast.error('Client GSTIN is required for Tax Quote')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      const id = crypto.randomUUID()
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
      const items = lines.filter(l => l.description.trim()).map((l, i) => ({
        quote_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (items.length > 0) { const { error: le } = await supabase.from('quote_line_items').insert(items); if (le) throw le }
      toast.success(`Quote ${qNum} ${status === 'sent' ? 'created & sent' : 'saved as draft'}`)
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={`New Quote — ${qNum}`} onClose={onClose} wide
      footer={<>
        <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
        <button onClick={() => save('draft')} disabled={saving} className="flex-1 btn-secondary">Save Draft</button>
        <button onClick={() => save('sent')}  disabled={saving} className="flex-1 btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Send'}
        </button>
      </>}>
      <SectionHead label="Client Details" />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Client / Company Name *"><input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></Field></div>
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
    </Modal>
  )
}

function QuotesTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
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
                    <p className="text-xs font-mono text-slate-500">{q.quote_number}</p>
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
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {q.status === 'draft' && <button onClick={() => updateStatus(q.id, 'sent')} className="text-xs px-2 py-1 rounded-lg border border-blue-700/40 text-blue-400 hover:bg-blue-900/20">Mark Sent</button>}
                  {(q.status === 'sent' || q.status === 'draft') && <>
                    <button onClick={() => updateStatus(q.id, 'accepted')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20">Accept</button>
                    <button onClick={() => updateStatus(q.id, 'rejected')} className="text-xs px-2 py-1 rounded-lg border border-red-700/40 text-red-400 hover:bg-red-900/20">Reject</button>
                  </>}
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && <CreateQuoteModal companyId={companyId} session={session} count={quotes.length} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries(['quotes', companyId]) }} />}
    </div>
  )
}

// ── SALES ORDERS TAB ──────────────────────────────────────────────────────────
function SalesOrdersTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ client_name: '', client_gstin: '', project_name: '', so_date: todayStr(), expected_delivery: '', notes: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18, use_igst: false, discount_amount: 0, is_tax_invoice: true })
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['sales_orders', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const soNum = useMemo(() => `SO-${new Date().getFullYear()}-${String((orders.length || 0) + 1).padStart(3, '0')}`, [orders.length])

  const save = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (form.is_tax_invoice !== false && !form.client_gstin?.trim()) return toast.error('Client GSTIN is required for Tax Sales Order')
    setSaving(true)
    try {
      const id = crypto.randomUUID()
      const taxable = subtotal - (parseFloat(form.discount_amount) || 0)
      const isTax = form.is_tax_invoice !== false
      const cgst = (isTax && !form.use_igst) ? taxable * (parseFloat(form.cgst_rate) || 0) / 100 : 0
      const sgst = (isTax && !form.use_igst) ? taxable * (parseFloat(form.sgst_rate) || 0) / 100 : 0
      const igst = (isTax && form.use_igst)  ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0
      const total = taxable + cgst + sgst + igst
      const { error } = await supabase.from('sales_orders').insert({
        id, company_id: companyId, so_number: soNum,
        so_date: form.so_date, expected_delivery: form.expected_delivery || null,
        client_name: form.client_name.trim(), project_name: form.project_name || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: parseFloat(form.cgst_rate), sgst_rate: parseFloat(form.sgst_rate),
        igst_rate: parseFloat(form.igst_rate),
        cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
        total_amount: total, status: 'confirmed', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = lines.filter(l => l.description.trim()).map((l, i) => ({
        so_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (items.length > 0) { const { error: le } = await supabase.from('so_line_items').insert(items); if (le) throw le }
      toast.success(`Sales Order ${soNum} created`)
      setShowCreate(false)
      setForm({ client_name: '', client_gstin: '', project_name: '', so_date: todayStr(), expected_delivery: '', notes: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18, use_igst: false, discount_amount: 0, is_tax_invoice: true })
      setLines([blankLine()])
      qc.invalidateQueries(['sales_orders', companyId])
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
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Sales Order</button>
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
                    <p className="text-xs font-mono text-slate-500">{o.so_number}</p>
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
                {o.status !== 'fulfilled' && o.status !== 'cancelled' && (
                  <select value={o.status} onChange={e => updateStatus(o.id, e.target.value)}
                    className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-slate-300">
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={`New Sales Order — ${soNum}`} onClose={() => setShowCreate(false)} wide
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Sales Order'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Client Name *"><input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></Field></div>
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
        </Modal>
      )}
    </div>
  )
}

// ── DELIVERY CHALLANS TAB ─────────────────────────────────────────────────────
function DeliveryChallansTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ client_name: '', delivery_address: '', vehicle_number: '', driver_name: '', dc_date: todayStr(), notes: '' })
  const [lines, setLines] = useState([{ _id: Math.random().toString(36).slice(2), description: '', quantity: 1, unit: 'nos' }])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: challans = [], isLoading } = useQuery({
    queryKey: ['delivery_challans', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('delivery_challans').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const dcNum = `DC-${new Date().getFullYear()}-${String((challans.length || 0) + 1).padStart(3, '0')}`

  const updateLine = (id, key, val) => setLines(p => p.map(l => l._id === id ? { ...l, [key]: val } : l))

  const save = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    setSaving(true)
    try {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('delivery_challans').insert({
        id, company_id: companyId, dc_number: dcNum, dc_date: form.dc_date,
        client_name: form.client_name.trim(), delivery_address: form.delivery_address || null,
        vehicle_number: form.vehicle_number || null, driver_name: form.driver_name || null,
        status: 'dispatched', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = lines.filter(l => l.description.trim()).map((l, i) => ({
        dc_id: id, description: l.description.trim(), quantity: parseFloat(l.quantity) || 1, unit: l.unit, sort_order: i,
      }))
      if (items.length > 0) { const { error: le } = await supabase.from('dc_line_items').insert(items); if (le) throw le }
      toast.success(`Delivery Challan ${dcNum} created`)
      setShowCreate(false)
      qc.invalidateQueries(['delivery_challans', companyId])
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
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Challan</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : challans.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><Truck className="w-10 h-10 text-slate-700" /><p>No delivery challans yet</p></div>
        : <div className="space-y-2">
          {challans.map(dc => (
            <div key={dc.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center"><p className="text-xs font-mono text-slate-500">{dc.dc_number}</p><StatusBadge status={dc.status} /></div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{dc.client_name}</p>
                  {dc.vehicle_number && <p className="text-xs text-slate-500">🚛 {dc.vehicle_number}{dc.driver_name ? ` · ${dc.driver_name}` : ''}</p>}
                  {dc.delivery_address && <p className="text-xs text-slate-500 mt-0.5">📍 {dc.delivery_address.slice(0, 60)}</p>}
                </div>
                <p className="text-xs text-slate-500 shrink-0">{fmtDate(dc.dc_date)}</p>
              </div>
              {dc.status === 'dispatched' && (
                <div className="flex gap-2 mt-3 justify-end">
                  <button onClick={() => updateStatus(dc.id, 'delivered')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20">Mark Delivered</button>
                  <button onClick={() => updateStatus(dc.id, 'returned')} className="text-xs px-2 py-1 rounded-lg border border-orange-700/40 text-orange-400 hover:bg-orange-900/20">Mark Returned</button>
                </div>
              )}
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={`New Delivery Challan — ${dcNum}`} onClose={() => setShowCreate(false)}
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create & Dispatch'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Client Name *"><input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></Field></div>
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
                    {['nos','kg','ton','m3','ls','set'].map(u => <option key={u}>{u}</option>)}
                  </select>
                  <button type="button" onClick={() => setLines(p => p.length > 1 ? p.filter(x => x._id !== l._id) : p)} className="col-span-1 flex justify-center text-slate-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── CREDIT NOTES TAB ──────────────────────────────────────────────────────────
function CreditNotesTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ client_name: '', client_gstin: '', reason: '', cn_date: todayStr(), cgst_rate: 9, sgst_rate: 9, notes: '', use_igst: false, igst_rate: 18, is_tax_invoice: true })
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

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
  const cnNum    = `CN-${new Date().getFullYear()}-${String((notes.length || 0) + 1).padStart(3, '0')}`

  const save = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    setSaving(true)
    try {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('credit_notes').insert({
        id, company_id: companyId, cn_number: cnNum, cn_date: form.cn_date,
        client_name: form.client_name.trim(), reason: form.reason || null,
        subtotal, cgst_rate: parseFloat(form.cgst_rate), sgst_rate: parseFloat(form.sgst_rate), igst_rate: parseFloat(form.igst_rate),
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, status: 'issued', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = lines.filter(l => l.description.trim()).map((l, i) => ({
        cn_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (items.length > 0) { const { error: le } = await supabase.from('cn_line_items').insert(items); if (le) throw le }
      toast.success(`Credit Note ${cnNum} issued`)
      setShowCreate(false)
      qc.invalidateQueries(['credit_notes', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{notes.length} credit notes</span>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Credit Note</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : notes.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><RefreshCcw className="w-10 h-10 text-slate-700" /><p>No credit notes yet</p></div>
        : <div className="space-y-2">
          {notes.map(cn => (
            <div key={cn.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex gap-2 items-center"><p className="text-xs font-mono text-slate-500">{cn.cn_number}</p><StatusBadge status={cn.status} /></div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{cn.client_name}</p>
                  {cn.reason && <p className="text-xs text-slate-500 mt-0.5">Reason: {cn.reason}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-red-400">-{fmtINR(cn.total_amount)}</p>
                  <p className="text-xs text-slate-500">{fmtDate(cn.cn_date)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={`New Credit Note — ${cnNum}`} onClose={() => setShowCreate(false)} wide
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Issue Credit Note'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Client Name *"><input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} /></Field></div>
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
        </Modal>
      )}
    </div>
  )
}

// ── PAYMENTS RECEIVED TAB ─────────────────────────────────────────────────────
function PaymentsReceivedTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ client_name: '', amount: '', payment_date: todayStr(), payment_mode: 'bank', bank_reference: '', notes: '' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

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
      const { data } = await supabase.from('client_invoices').select('id, invoice_number, client_name, balance_due').eq('company_id', companyId).in('status', ['sent','partial','overdue']).order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!companyId && showCreate,
  })

  const [invoiceId, setInvoiceId] = useState('')
  const totalReceived = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const prNum = `PR-${new Date().getFullYear()}-${String((payments.length || 0) + 1).padStart(3, '0')}`

  const save = async () => {
    if (!form.client_name.trim()) return toast.error('Client name required')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const { error } = await supabase.from('payments_received').insert({
        company_id: companyId, payment_number: prNum,
        payment_date: form.payment_date, invoice_id: invoiceId || null,
        client_name: form.client_name.trim(), amount: parseFloat(form.amount),
        payment_mode: form.payment_mode, bank_reference: form.bank_reference || null,
        notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      toast.success(`Payment ${prNum} recorded — ${fmtINR(form.amount)}`)
      setShowCreate(false)
      setForm({ client_name: '', amount: '', payment_date: todayStr(), payment_mode: 'bank', bank_reference: '', notes: '' })
      setInvoiceId('')
      qc.invalidateQueries(['payments_received', companyId])
      qc.invalidateQueries(['sales_invoices', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const MODES = ['cash','bank','upi','cheque','neft','rtgs']

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs"><span className="text-slate-500">Total Received </span><span className="font-bold text-emerald-400">{fmtINR(totalReceived)}</span></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Record Payment</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : payments.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ArrowDownCircle className="w-10 h-10 text-slate-700" /><p>No payments recorded yet</p></div>
        : <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-500">{p.payment_number}</p>
                <p className="font-semibold text-slate-100 text-sm">{p.client_name}</p>
                <p className="text-xs text-slate-500">{fmtDate(p.payment_date)} · {p.payment_mode?.toUpperCase()}{p.bank_reference ? ` · ${p.bank_reference}` : ''}</p>
              </div>
              <p className="text-xl font-black text-emerald-400">{fmtINR(p.amount)}</p>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={`Record Payment — ${prNum}`} onClose={() => setShowCreate(false)}
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Record Payment'}</button></>}>
          <Field label="Client Name *"><input className={inp()} value={form.client_name} onChange={e => setF('client_name', e.target.value)} placeholder="Who paid?" /></Field>
          {invoices.length > 0 && <Field label="Link to Invoice (optional)">
            <select className={inp()} value={invoiceId} onChange={e => { setInvoiceId(e.target.value); const inv = invoices.find(i => i.id === e.target.value); if (inv) setF('client_name', inv.client_name) }}>
              <option value="">-- Select invoice --</option>
              {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} · {i.client_name} · Due {fmtINR(i.balance_due)}</option>)}
            </select>
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
        </Modal>
      )}
    </div>
  )
}

// ── MAIN SALES PAGE ───────────────────────────────────────────────────────────
export default function SalesPage() {
  const { companyId, session } = useAuth()
  const [activeTab, setActiveTab] = useState('clients')

  const tabs = [
    { id: 'clients',   label: 'Clients',            icon: Building2 },
    { id: 'invoices',  label: 'Invoices',            icon: FileText },
    { id: 'quotes',    label: 'Quotes',              icon: FileQuestion },
    { id: 'orders',    label: 'Sales Orders',        icon: ShoppingCart },
    { id: 'challans',  label: 'Delivery Challans',   icon: Truck },
    { id: 'credit',    label: 'Credit Notes',        icon: RefreshCcw },
    { id: 'payments',  label: 'Payments Received',   icon: ArrowDownCircle },
  ]

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
