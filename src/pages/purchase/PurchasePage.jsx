import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { lookupHsnSac } from '../../utils/hsnSacLookup'
import {
  Plus, X, Loader2, ShoppingCart, FileText, Building, CreditCard,
  ArrowUpCircle, RefreshCcw, Wallet, Search, ChevronRight,
  CheckCircle, User, Phone, Mail, MapPin, Hash,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]
const inp = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${x}`
const fmtINR  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—'

const STATUS_COLORS = {
  draft:               'bg-slate-700/50 text-slate-300 border-slate-600',
  sent:                'bg-blue-500/10 text-blue-400 border-blue-700/40',
  pending:             'bg-yellow-500/10 text-yellow-400 border-yellow-700/40',
  paid:                'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
  partial:             'bg-yellow-500/10 text-yellow-400 border-yellow-700/40',
  overdue:             'bg-red-500/10 text-red-400 border-red-700/40',
  cancelled:           'bg-red-500/10 text-red-400 border-red-700/40',
  confirmed:           'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
  partially_received:  'bg-yellow-500/10 text-yellow-400 border-yellow-700/40',
  received:            'bg-emerald-500/10 text-emerald-400 border-emerald-700/40',
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

const blankLine = () => ({ _id: Math.random().toString(36).slice(2), description: '', hsn_sac: '', quantity: 1, unit: 'nos', rate: '', amount: 0, _gst_rate: null, _gst_desc: null, _hsn_open: false })

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
      {/* Column headers */}
      <div className="flex gap-2 items-center px-1 mb-1">
        <div className="flex-1 min-w-0 text-[10px] text-slate-500 uppercase tracking-wide">Description</div>
        <div className="w-16 text-[10px] text-slate-500 uppercase tracking-wide text-center shrink-0">Qty</div>
        <div className="w-20 text-[10px] text-slate-500 uppercase tracking-wide shrink-0">Unit</div>
        <div className="w-24 text-[10px] text-slate-500 uppercase tracking-wide text-right shrink-0">Rate</div>
        <div className="w-20 text-[10px] text-slate-500 uppercase tracking-wide text-right shrink-0">Amt</div>
        <div className="w-5 shrink-0" />
      </div>
      <div className="space-y-1.5">
        {lines.map(l => {
          const hsnFilled = l.hsn_sac.trim().length > 0
          const showInput = isTax && (l._hsn_open || hsnFilled)
          return (
            <div key={l._id} className="flex gap-2 items-start bg-dark-700/40 rounded-xl p-2">
              {/* Description col with HSN below */}
              <div className="flex-1 min-w-0">
                <textarea
                  rows={1}
                  className={`${inp()} text-xs w-full resize-none leading-snug`}
                  style={{ overflow: 'hidden' }}
                  placeholder="Description of goods / services"
                  value={l.description}
                  onChange={e => {
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                    update(l._id, 'description', e.target.value)
                  }}
                />
                {/* HSN/SAC collapsible — only on tax docs */}
                {isTax && (
                  <div className="mt-1">
                    {!showInput ? (
                      <button type="button" onClick={() => toggleHsn(l._id)}
                        className="text-[10px] text-primary-400/70 hover:text-primary-300 transition-colors">
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
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-emerald-900/60 text-emerald-400 px-1.5 py-0.5 rounded-full">
                              {l._gst_rate}%
                            </span>
                          )}
                          <button type="button" onClick={() => clearHsn(l._id)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {l._gst_desc && (
                          <span className="text-[9px] text-slate-500 truncate flex-1">{l._gst_desc}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Qty */}
              <div className="w-16 shrink-0">
                <input className={`${inp()} text-xs text-center px-2`} type="number" value={l.quantity} onChange={e => update(l._id, 'quantity', e.target.value)} min="0" step="0.01" />
              </div>
              {/* Unit */}
              <div className="w-20 shrink-0">
                <select className={`${inp()} text-xs px-2`} value={l.unit} onChange={e => update(l._id, 'unit', e.target.value)}>
                  {LINE_UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              {/* Rate */}
              <div className="w-24 shrink-0">
                <input className={`${inp()} text-xs text-right px-2`} type="number" value={l.rate} onChange={e => update(l._id, 'rate', e.target.value)} placeholder="0.00" step="0.01" />
              </div>
              {/* Amount */}
              <div className="w-20 shrink-0 text-right">
                <span className="text-xs font-semibold text-slate-200">{fmtINR(l.amount)}</span>
              </div>
              {/* Delete */}
              <button type="button" onClick={() => setLines(p => p.length > 1 ? p.filter(x => x._id !== l._id) : p)}
                className="shrink-0 text-slate-600 hover:text-red-400 pt-1.5"><X className="w-3.5 h-3.5" /></button>
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

// Reusable Tax/Non-Tax toggle (mirrors SalesPage)
function TaxTypeToggle({ isTax, onToggle, label = 'Bill' }) {
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

function TaxSummary({ subtotal, form, setF }) {
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
              Use IGST (interstate)
            </label>
            {!form.use_igst ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="CGST (%)"><input type="number" className={inp()} value={form.cgst_rate} onChange={e => setF('cgst_rate', e.target.value)} /></Field>
                <Field label="SGST (%)"><input type="number" className={inp()} value={form.sgst_rate} onChange={e => setF('sgst_rate', e.target.value)} /></Field>
              </div>
            ) : (
              <Field label="IGST (%)"><input type="number" className={inp()} value={form.igst_rate} onChange={e => setF('igst_rate', e.target.value)} /></Field>
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
          <span className="text-slate-200">Total</span><span className="text-primary-400">{fmtINR(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Helper: compute bill total from form ──────────────────────────────────────
function calcTotal(form, subtotal) {
  const isTax    = form.is_tax_invoice !== false
  const taxable  = subtotal - (parseFloat(form.discount_amount) || 0)
  const cgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.cgst_rate) || 0) / 100 : 0
  const sgst_amt = (isTax && !form.use_igst) ? taxable * (parseFloat(form.sgst_rate) || 0) / 100 : 0
  const igst_amt = (isTax && form.use_igst)  ? taxable * (parseFloat(form.igst_rate) || 0) / 100 : 0
  return { taxable, cgst_amt, sgst_amt, igst_amt, total: taxable + cgst_amt + sgst_amt + igst_amt }
}

// ── VENDORS TAB ───────────────────────────────────────────────────────────────
function VendorsTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({
    vendor_name: '', vendor_code: '', category: 'general', gstin: '',
    contact_name: '', contact_phone: '', contact_email: '',
    address: '', bank_name: '', bank_account: '', bank_ifsc: '', notes: '',
  })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('*').eq('company_id', companyId).order('vendor_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const save = async () => {
    if (!form.vendor_name.trim()) return toast.error('Vendor name required')
    setSaving(true)
    try {
      const { error } = await supabase.from('vendors').insert({
        company_id: companyId, vendor_name: form.vendor_name.trim(),
        vendor_code: form.vendor_code.trim() || null, category: form.category,
        gstin: form.gstin.trim() || null, contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim() || null, contact_email: form.contact_email.trim() || null,
        address: form.address.trim() || null, bank_name: form.bank_name.trim() || null,
        bank_account: form.bank_account.trim() || null, bank_ifsc: form.bank_ifsc.trim() || null,
        notes: form.notes.trim() || null, created_by: session.user.id,
      })
      if (error) throw error
      toast.success('Vendor added')
      setShowCreate(false)
      setForm({ vendor_name: '', vendor_code: '', category: 'general', gstin: '', contact_name: '', contact_phone: '', contact_email: '', address: '', bank_name: '', bank_account: '', bank_ifsc: '', notes: '' })
      qc.invalidateQueries(['vendors', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const CATEGORIES = ['general','fuel_supplier','spare_parts','tyres','lubricants','civil','electrical','subcontractor','transport','misc']

  const displayed = vendors.filter(v =>
    !search || v.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.category?.toLowerCase().includes(search.toLowerCase()) ||
    v.contact_phone?.includes(search)
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input className={inp('pl-8 text-xs')} placeholder="Search vendors…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0"><Plus className="w-4 h-4" /> Add Vendor</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : displayed.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><Building className="w-10 h-10 text-slate-700" /><p>No vendors yet</p></div>
        : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {displayed.map(v => (
            <button key={v.id} onClick={() => setSelected(v)}
              className="bg-dark-800 border border-dark-700 hover:border-primary-700/50 rounded-xl p-4 text-left transition-colors group">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{v.vendor_name}</p>
                  {v.vendor_code && <p className="text-xs font-mono text-slate-500">{v.vendor_code}</p>}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-slate-400 mt-1 inline-block capitalize">{v.category?.replace(/_/g, ' ')}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0 mt-1" />
              </div>
              {v.contact_phone && <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Phone className="w-3 h-3" />{v.contact_phone}</p>}
              {v.gstin && <p className="text-xs text-slate-500 flex items-center gap-1"><Hash className="w-3 h-3" />GSTIN: {v.gstin}</p>}
            </button>
          ))}
        </div>}
      </div>

      {/* Vendor Detail Modal */}
      {selected && (
        <Modal title={selected.vendor_name} subtitle={selected.category?.replace(/_/g,' ')} onClose={() => setSelected(null)}>
          <div className="grid grid-cols-2 gap-4">
            {selected.contact_name && <div><p className="text-xs text-slate-500 mb-0.5">Contact</p><p className="text-sm text-slate-100 flex items-center gap-1"><User className="w-3.5 h-3.5" />{selected.contact_name}</p></div>}
            {selected.contact_phone && <div><p className="text-xs text-slate-500 mb-0.5">Phone</p><p className="text-sm text-slate-100 flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selected.contact_phone}</p></div>}
            {selected.contact_email && <div className="col-span-2"><p className="text-xs text-slate-500 mb-0.5">Email</p><p className="text-sm text-slate-100 flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{selected.contact_email}</p></div>}
            {selected.gstin && <div><p className="text-xs text-slate-500 mb-0.5">GSTIN</p><p className="text-sm font-mono text-slate-100">{selected.gstin}</p></div>}
            {selected.address && <div className="col-span-2"><p className="text-xs text-slate-500 mb-0.5">Address</p><p className="text-sm text-slate-100">{selected.address}</p></div>}
          </div>
          {(selected.bank_name || selected.bank_account) && (
            <>
              <div className="border-t border-dark-700 pt-4"><SectionHead label="Bank Details" /></div>
              <div className="grid grid-cols-2 gap-3">
                {selected.bank_name && <div><p className="text-xs text-slate-500">Bank</p><p className="text-sm text-slate-100">{selected.bank_name}</p></div>}
                {selected.bank_account && <div><p className="text-xs text-slate-500">Account</p><p className="text-sm font-mono text-slate-100">{selected.bank_account}</p></div>}
                {selected.bank_ifsc && <div><p className="text-xs text-slate-500">IFSC</p><p className="text-sm font-mono text-slate-100">{selected.bank_ifsc}</p></div>}
              </div>
            </>
          )}
          {selected.notes && <div className="bg-dark-700 rounded-xl p-3"><p className="text-xs text-slate-500 mb-1">Notes</p><p className="text-sm text-slate-300">{selected.notes}</p></div>}
        </Modal>
      )}

      {showCreate && (
        <Modal title="Add Vendor" onClose={() => setShowCreate(false)}
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Vendor'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Vendor Name *"><input className={inp()} value={form.vendor_name} onChange={e => setF('vendor_name', e.target.value)} /></Field></div>
            <Field label="Vendor Code"><input className={inp()} value={form.vendor_code} onChange={e => setF('vendor_code', e.target.value)} placeholder="V-001" /></Field>
            <Field label="Category">
              <select className={inp()} value={form.category} onChange={e => setF('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="GSTIN"><input className={inp()} value={form.gstin} onChange={e => setF('gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" /></Field></div>
          </div>
          <SectionHead label="Contact" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Name"><input className={inp()} value={form.contact_name} onChange={e => setF('contact_name', e.target.value)} /></Field>
            <Field label="Phone"><input className={inp()} value={form.contact_phone} onChange={e => setF('contact_phone', e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Email"><input type="email" className={inp()} value={form.contact_email} onChange={e => setF('contact_email', e.target.value)} /></Field></div>
            <div className="col-span-2"><Field label="Address"><textarea className={inp()} rows={2} value={form.address} onChange={e => setF('address', e.target.value)} /></Field></div>
          </div>
          <SectionHead label="Bank Details (optional)" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank Name"><input className={inp()} value={form.bank_name} onChange={e => setF('bank_name', e.target.value)} /></Field>
            <Field label="Account Number"><input className={inp()} value={form.bank_account} onChange={e => setF('bank_account', e.target.value)} /></Field>
            <Field label="IFSC Code"><input className={inp()} value={form.bank_ifsc} onChange={e => setF('bank_ifsc', e.target.value)} /></Field>
          </div>
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── EXPENSES TAB ──────────────────────────────────────────────────────────────
function ExpensesTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ description: '', amount: '', expense_date: todayStr(), category: 'operational', vendor_id: '', payment_mode: 'cash', reference: '', notes: '' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('account_transactions').select('*')
        .eq('company_id', companyId).eq('type', 'expense').order('transaction_date', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, vendor_name').eq('company_id', companyId).order('vendor_name')
      return data || []
    },
    enabled: !!companyId && showCreate,
  })

  const CATEGORIES = ['fuel','lubricants','tyres','spare_parts','maintenance','labour','rental','transport','site','admin','misc','operational']
  const MODES = ['cash','bank','upi','cheque','neft','rtgs']

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)

  const save = async () => {
    if (!form.description.trim()) return toast.error('Description required')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const { error } = await supabase.from('account_transactions').insert({
        company_id: companyId, type: 'expense',
        description: form.description.trim(), amount: parseFloat(form.amount),
        transaction_date: form.expense_date, category: form.category,
        payment_mode: form.payment_mode, reference_number: form.reference || null,
        vendor_id: form.vendor_id || null, notes: form.notes || null,
        created_by: session.user.id,
      })
      if (error) throw error
      toast.success('Expense recorded')
      setShowCreate(false)
      setForm({ description: '', amount: '', expense_date: todayStr(), category: 'operational', vendor_id: '', payment_mode: 'cash', reference: '', notes: '' })
      qc.invalidateQueries(['expenses', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs"><span className="text-slate-500">Total Spent </span><span className="font-bold text-red-400">{fmtINR(totalExpenses)}</span></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Expense</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : expenses.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><Wallet className="w-10 h-10 text-slate-700" /><p>No expenses recorded</p></div>
        : <div className="space-y-2">
          {expenses.map(e => (
            <div key={e.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-100 text-sm">{e.description}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fmtDate(e.transaction_date)} · <span className="capitalize">{e.category?.replace(/_/g,' ')}</span>
                  {e.payment_mode ? ` · ${e.payment_mode.toUpperCase()}` : ''}
                </p>
              </div>
              <p className="text-lg font-black text-red-400 shrink-0">{fmtINR(e.amount)}</p>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title="Add Expense" onClose={() => setShowCreate(false)}
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Expense'}</button></>}>
          <Field label="Description *"><input className={inp()} value={form.description} onChange={e => setF('description', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *"><input type="number" className={inp()} value={form.amount} onChange={e => setF('amount', e.target.value)} step="0.01" /></Field>
            <Field label="Date"><input type="date" className={inp()} value={form.expense_date} onChange={e => setF('expense_date', e.target.value)} /></Field>
            <Field label="Category">
              <select className={inp()} value={form.category} onChange={e => setF('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
              </select>
            </Field>
            <Field label="Payment Mode">
              <select className={inp()} value={form.payment_mode} onChange={e => setF('payment_mode', e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </Field>
            {vendors.length > 0 && <div className="col-span-2"><Field label="Vendor (optional)">
              <select className={inp()} value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)}>
                <option value="">-- Select vendor --</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
            </Field></div>}
            <div className="col-span-2"><Field label="Reference No."><input className={inp()} value={form.reference} onChange={e => setF('reference', e.target.value)} placeholder="Bill / receipt no." /></Field></div>
          </div>
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── BILLS TAB ─────────────────────────────────────────────────────────────────
function BillsTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankForm = () => ({ vendor_id: '', vendor_gstin: '', bill_date: todayStr(), due_date: '', bill_ref: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18, use_igst: false, discount_amount: 0, notes: '', is_tax_invoice: true })
  const [form, setForm] = useState(blankForm())
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bills').select('*, vendors(vendor_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, vendor_name, gstin').eq('company_id', companyId).order('vendor_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const blNum = useMemo(() => `BL-${new Date().getFullYear()}-${String((bills.length || 0) + 1).padStart(3, '0')}`, [bills.length])

  const isTax = form.is_tax_invoice !== false

  const save = async () => {
    if (!form.vendor_id) return toast.error('Select a vendor')
    if (isTax && !form.vendor_gstin.trim()) return toast.error('Vendor GSTIN is required for Tax Bill')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      const id = crypto.randomUUID()
      const { taxable, cgst_amt, sgst_amt, igst_amt, total } = calcTotal(form, subtotal)
      const vendor = vendors.find(v => v.id === form.vendor_id)
      const { error } = await supabase.from('bills').insert({
        id, company_id: companyId, bill_number: blNum,
        vendor_id: form.vendor_id, vendor_name: vendor?.vendor_name || '',
        bill_date: form.bill_date, due_date: form.due_date || null,
        bill_ref: form.bill_ref || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate), sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
        igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, paid_amount: 0, balance_due: total,
        status: 'pending', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = lines.filter(l => l.description.trim()).map((l, i) => ({
        bill_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (items.length > 0) { const { error: le } = await supabase.from('bill_line_items').insert(items); if (le) throw le }
      toast.success(`Bill ${blNum} created`)
      setShowCreate(false)
      setForm(blankForm())
      setLines([blankLine()])
      qc.invalidateQueries(['bills', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const updateStatus = async (id, status) => {
    await supabase.from('bills').update({ status }).eq('id', id)
    qc.invalidateQueries(['bills', companyId])
    toast.success(`Bill marked ${status}`)
  }

  const totalPending = bills.filter(b => b.status !== 'paid' && b.status !== 'cancelled').reduce((s, b) => s + Number(b.balance_due || 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs"><span className="text-slate-500">Payable </span><span className="font-bold text-orange-400">{fmtINR(totalPending)}</span></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Bill</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : bills.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><FileText className="w-10 h-10 text-slate-700" /><p>No bills yet</p></div>
        : <div className="space-y-2">
          {bills.map(b => (
            <div key={b.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center flex-wrap">
                    <p className="text-xs font-mono text-slate-500">{b.bill_number}</p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{b.vendor_name || b.vendors?.vendor_name}</p>
                  {b.bill_ref && <p className="text-xs text-slate-500">Ref: {b.bill_ref}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-slate-100">{fmtINR(b.total_amount)}</p>
                  {b.paid_amount > 0 && <p className="text-xs text-emerald-400">Paid {fmtINR(b.paid_amount)}</p>}
                  {b.balance_due > 0 && <p className="text-xs text-orange-400">Due {fmtINR(b.balance_due)}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{fmtDate(b.bill_date)}{b.due_date ? ` · Due ${fmtDate(b.due_date)}` : ''}</p>
                {b.status === 'pending' && <button onClick={() => updateStatus(b.id, 'paid')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20"><CheckCircle className="w-3 h-3 inline mr-1" />Mark Paid</button>}
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={`New Bill — ${blNum}`} onClose={() => setShowCreate(false)} wide
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Bill'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Vendor *">
                <select className={inp()} value={form.vendor_id} onChange={e => {
                  const v = vendors.find(x => x.id === e.target.value)
                  setForm(p => ({ ...p, vendor_id: e.target.value, vendor_gstin: v?.gstin || '' }))
                }}>
                  <option value="">-- Select vendor --</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                </select>
              </Field>
            </div>
            <TaxTypeToggle isTax={isTax} onToggle={v => setF('is_tax_invoice', v)} label="Bill" />
            {isTax && (
              <div className="col-span-2">
                <Field label="Vendor GSTIN *">
                  <input className={inp()} value={form.vendor_gstin} onChange={e => setF('vendor_gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
                </Field>
              </div>
            )}
            <Field label="Bill Date"><input type="date" className={inp()} value={form.bill_date} onChange={e => setF('bill_date', e.target.value)} /></Field>
            <Field label="Due Date"><input type="date" className={inp()} value={form.due_date} onChange={e => setF('due_date', e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Vendor Bill / Reference No."><input className={inp()} value={form.bill_ref} onChange={e => setF('bill_ref', e.target.value)} /></Field></div>
          </div>
          <LineItemsEditor lines={lines} setLines={setLines} isTax={isTax}
            onGstRate={r => { setF('cgst_rate', r.cgst); setF('sgst_rate', r.sgst); setF('igst_rate', r.igst) }} />
          <TaxSummary subtotal={subtotal} form={form} setF={setF} />
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── PURCHASE ORDERS TAB ───────────────────────────────────────────────────────
function PurchaseOrdersTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankForm = () => ({ vendor_id: '', vendor_gstin: '', po_date: todayStr(), expected_delivery: '', delivery_address: '', notes: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 18, use_igst: false, discount_amount: 0, is_tax_invoice: true })
  const [form, setForm] = useState(blankForm())
  const [lines, setLines] = useState([blankLine()])
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ['purchase_orders', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_orders').select('*, vendors(vendor_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, vendor_name, gstin').eq('company_id', companyId).order('vendor_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines])
  const poNum = useMemo(() => `PO-${new Date().getFullYear()}-${String((pos.length || 0) + 1).padStart(3, '0')}`, [pos.length])

  const isTax = form.is_tax_invoice !== false

  const save = async () => {
    if (!form.vendor_id) return toast.error('Select a vendor')
    if (isTax && !form.vendor_gstin.trim()) return toast.error('Vendor GSTIN is required for Tax PO')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      const id = crypto.randomUUID()
      const { taxable, cgst_amt, sgst_amt, igst_amt, total } = calcTotal(form, subtotal)
      const vendor = vendors.find(v => v.id === form.vendor_id)
      const { error } = await supabase.from('purchase_orders').insert({
        id, company_id: companyId, po_number: poNum,
        vendor_id: form.vendor_id, vendor_name: vendor?.vendor_name || '',
        po_date: form.po_date, expected_delivery: form.expected_delivery || null,
        delivery_address: form.delivery_address || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: form.use_igst ? 0 : parseFloat(form.cgst_rate), sgst_rate: form.use_igst ? 0 : parseFloat(form.sgst_rate),
        igst_rate: form.use_igst ? parseFloat(form.igst_rate) : 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, status: 'confirmed', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = lines.filter(l => l.description.trim()).map((l, i) => ({
        po_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (items.length > 0) { const { error: le } = await supabase.from('po_line_items').insert(items); if (le) throw le }
      toast.success(`Purchase Order ${poNum} created`)
      setShowCreate(false)
      setForm(blankForm())
      setLines([blankLine()])
      qc.invalidateQueries(['purchase_orders', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const updateStatus = async (id, status) => {
    await supabase.from('purchase_orders').update({ status }).eq('id', id)
    qc.invalidateQueries(['purchase_orders', companyId])
    toast.success(`PO ${status}`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{pos.length} purchase orders</span>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New PO</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : pos.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ShoppingCart className="w-10 h-10 text-slate-700" /><p>No purchase orders yet</p></div>
        : <div className="space-y-2">
          {pos.map(p => (
            <div key={p.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center"><p className="text-xs font-mono text-slate-500">{p.po_number}</p><StatusBadge status={p.status} /></div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{p.vendor_name || p.vendors?.vendor_name}</p>
                  {p.expected_delivery && <p className="text-xs text-slate-500">Delivery: {fmtDate(p.expected_delivery)}</p>}
                </div>
                <p className="text-lg font-black text-slate-100 shrink-0">{fmtINR(p.total_amount)}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{fmtDate(p.po_date)}</p>
                {p.status === 'confirmed' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => updateStatus(p.id, 'partially_received')} className="text-xs px-2 py-1 rounded-lg border border-yellow-700/40 text-yellow-400 hover:bg-yellow-900/20">Partial Receipt</button>
                    <button onClick={() => updateStatus(p.id, 'received')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20">Received</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={`New Purchase Order — ${poNum}`} onClose={() => setShowCreate(false)} wide
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create PO'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Vendor *">
              <select className={inp()} value={form.vendor_id} onChange={e => {
                const v = vendors.find(x => x.id === e.target.value)
                setForm(p => ({ ...p, vendor_id: e.target.value, vendor_gstin: v?.gstin || '' }))
              }}>
                <option value="">-- Select vendor --</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
            </Field></div>
            <TaxTypeToggle isTax={isTax} onToggle={v => setF('is_tax_invoice', v)} label="PO" />
            {isTax && (
              <div className="col-span-2">
                <Field label="Vendor GSTIN *">
                  <input className={inp()} value={form.vendor_gstin} onChange={e => setF('vendor_gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
                </Field>
              </div>
            )}
            <Field label="PO Date"><input type="date" className={inp()} value={form.po_date} onChange={e => setF('po_date', e.target.value)} /></Field>
            <Field label="Expected Delivery"><input type="date" className={inp()} value={form.expected_delivery} onChange={e => setF('expected_delivery', e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Delivery Address"><input className={inp()} value={form.delivery_address} onChange={e => setF('delivery_address', e.target.value)} /></Field></div>
          </div>
          <LineItemsEditor lines={lines} setLines={setLines} isTax={isTax}
            onGstRate={r => { setF('cgst_rate', r.cgst); setF('sgst_rate', r.sgst); setF('igst_rate', r.igst) }} />
          <TaxSummary subtotal={subtotal} form={form} setF={setF} />
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── VENDOR CREDITS TAB ────────────────────────────────────────────────────────
function VendorCreditsTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ vendor_id: '', cn_date: todayStr(), reason: '', amount: '', notes: '' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ['vendor_credits', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendor_credits').select('*, vendors(vendor_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, vendor_name').eq('company_id', companyId).order('vendor_name')
      return data || []
    },
    enabled: !!companyId && showCreate,
  })

  const vcNum = `VC-${new Date().getFullYear()}-${String((credits.length || 0) + 1).padStart(3, '0')}`

  const save = async () => {
    if (!form.vendor_id) return toast.error('Select a vendor')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const vendor = vendors.find(v => v.id === form.vendor_id)
      const { error } = await supabase.from('vendor_credits').insert({
        company_id: companyId, vc_number: vcNum, vendor_id: form.vendor_id,
        vendor_name: vendor?.vendor_name || '', cn_date: form.cn_date,
        reason: form.reason || null, total_amount: parseFloat(form.amount),
        status: 'issued', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      toast.success(`Vendor Credit ${vcNum} issued`)
      setShowCreate(false)
      qc.invalidateQueries(['vendor_credits', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{credits.length} vendor credits</span>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Vendor Credit</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : credits.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><RefreshCcw className="w-10 h-10 text-slate-700" /><p>No vendor credits yet</p></div>
        : <div className="space-y-2">
          {credits.map(vc => (
            <div key={vc.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="flex gap-2 items-center"><p className="text-xs font-mono text-slate-500">{vc.vc_number}</p><StatusBadge status={vc.status} /></div>
                <p className="font-semibold text-slate-100 text-sm mt-0.5">{vc.vendor_name || vc.vendors?.vendor_name}</p>
                {vc.reason && <p className="text-xs text-slate-500">{vc.reason}</p>}
                <p className="text-xs text-slate-500">{fmtDate(vc.cn_date)}</p>
              </div>
              <p className="text-lg font-black text-emerald-400 shrink-0">+{fmtINR(vc.total_amount)}</p>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={`New Vendor Credit — ${vcNum}`} onClose={() => setShowCreate(false)}
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Issue Credit'}</button></>}>
          <Field label="Vendor *">
            <select className={inp()} value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)}>
              <option value="">-- Select vendor --</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *"><input type="number" className={inp()} value={form.amount} onChange={e => setF('amount', e.target.value)} step="0.01" /></Field>
            <Field label="Date"><input type="date" className={inp()} value={form.cn_date} onChange={e => setF('cn_date', e.target.value)} /></Field>
          </div>
          <Field label="Reason"><input className={inp()} value={form.reason} onChange={e => setF('reason', e.target.value)} placeholder="Excess payment, goods returned, etc." /></Field>
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── PAYMENTS MADE TAB ─────────────────────────────────────────────────────────
function PaymentsMadeTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ vendor_id: '', amount: '', payment_date: todayStr(), payment_mode: 'bank', bank_reference: '', notes: '' })
  const [billId, setBillId] = useState('')
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments_made', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('payments_made').select('*, vendors(vendor_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, vendor_name').eq('company_id', companyId).order('vendor_name')
      return data || []
    },
    enabled: !!companyId && showCreate,
  })

  const { data: openBills = [] } = useQuery({
    queryKey: ['open_bills', companyId, form.vendor_id],
    queryFn: async () => {
      const { data } = await supabase.from('bills').select('id, bill_number, balance_due').eq('company_id', companyId).eq('vendor_id', form.vendor_id).in('status', ['pending','partial']).order('bill_date')
      return data || []
    },
    enabled: !!companyId && !!form.vendor_id && showCreate,
  })

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const pmNum = `PM-${new Date().getFullYear()}-${String((payments.length || 0) + 1).padStart(3, '0')}`
  const MODES = ['cash','bank','upi','cheque','neft','rtgs']

  const save = async () => {
    if (!form.vendor_id) return toast.error('Select a vendor')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const vendor = vendors.find(v => v.id === form.vendor_id)
      const { error } = await supabase.from('payments_made').insert({
        company_id: companyId, payment_number: pmNum,
        payment_date: form.payment_date, vendor_id: form.vendor_id,
        vendor_name: vendor?.vendor_name || '', bill_id: billId || null,
        amount: parseFloat(form.amount), payment_mode: form.payment_mode,
        bank_reference: form.bank_reference || null, notes: form.notes || null,
        created_by: session.user.id,
      })
      if (error) throw error
      toast.success(`Payment ${pmNum} recorded — ${fmtINR(form.amount)}`)
      setShowCreate(false)
      setForm({ vendor_id: '', amount: '', payment_date: todayStr(), payment_mode: 'bank', bank_reference: '', notes: '' })
      setBillId('')
      qc.invalidateQueries(['payments_made', companyId])
      qc.invalidateQueries(['bills', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs"><span className="text-slate-500">Total Paid Out </span><span className="font-bold text-red-400">{fmtINR(totalPaid)}</span></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Record Payment</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : payments.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ArrowUpCircle className="w-10 h-10 text-slate-700" /><p>No payments made yet</p></div>
        : <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-500">{p.payment_number}</p>
                <p className="font-semibold text-slate-100 text-sm">{p.vendor_name || p.vendors?.vendor_name}</p>
                <p className="text-xs text-slate-500">{fmtDate(p.payment_date)} · {p.payment_mode?.toUpperCase()}{p.bank_reference ? ` · ${p.bank_reference}` : ''}</p>
              </div>
              <p className="text-xl font-black text-red-400 shrink-0">{fmtINR(p.amount)}</p>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={`Record Payment — ${pmNum}`} onClose={() => setShowCreate(false)}
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Record Payment'}</button></>}>
          <Field label="Vendor *">
            <select className={inp()} value={form.vendor_id} onChange={e => { setF('vendor_id', e.target.value); setBillId('') }}>
              <option value="">-- Select vendor --</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </Field>
          {openBills.length > 0 && <Field label="Link to Bill (optional)">
            <select className={inp()} value={billId} onChange={e => setBillId(e.target.value)}>
              <option value="">-- Select bill --</option>
              {openBills.map(b => <option key={b.id} value={b.id}>{b.bill_number} · Due {fmtINR(b.balance_due)}</option>)}
            </select>
          </Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *"><input type="number" className={inp()} value={form.amount} onChange={e => setF('amount', e.target.value)} step="0.01" /></Field>
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

// ── MAIN PURCHASE PAGE ────────────────────────────────────────────────────────
export default function PurchasePage() {
  const { companyId, session } = useAuth()
  const [activeTab, setActiveTab] = useState('vendors')

  const tabs = [
    { id: 'vendors',  label: 'Vendors',          icon: Building },
    { id: 'expenses', label: 'Expenses',          icon: Wallet },
    { id: 'bills',    label: 'Bills',             icon: FileText },
    { id: 'pos',      label: 'Purchase Orders',   icon: ShoppingCart },
    { id: 'vcredits', label: 'Vendor Credits',    icon: RefreshCcw },
    { id: 'payments', label: 'Payments Made',     icon: ArrowUpCircle },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 shrink-0 border-b border-dark-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-700/40 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Purchase</h1>
            <p className="text-xs text-slate-500">Vendors · Bills · Expenses · Payments</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.id ? 'border-orange-500 text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'vendors'  && <VendorsTab  companyId={companyId} session={session} />}
        {activeTab === 'expenses' && <ExpensesTab companyId={companyId} session={session} />}
        {activeTab === 'bills'    && <BillsTab    companyId={companyId} session={session} />}
        {activeTab === 'pos'      && <PurchaseOrdersTab companyId={companyId} session={session} />}
        {activeTab === 'vcredits' && <VendorCreditsTab  companyId={companyId} session={session} />}
        {activeTab === 'payments' && <PaymentsMadeTab   companyId={companyId} session={session} />}
      </div>
    </div>
  )
}
