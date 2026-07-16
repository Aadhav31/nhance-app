import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { lookupHsnSac } from '../../utils/hsnSacLookup'
import { nextDocNumber } from '../../utils/docNumbers'
import {
  Plus, X, Loader2, ShoppingCart, FileText, Building, CreditCard,
  ArrowUpCircle, RefreshCcw, Wallet, Search, ChevronRight,
  CheckCircle, User, Phone, Mail, MapPin, Hash, Upload, ExternalLink,
  Pencil, Trash2, Ban, FileDown, Sheet, ShieldOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  downloadBillPDF, downloadPOPDF, downloadVendorCreditPDF, downloadPaymentMadePDF,
} from '../../lib/docPDF'
import { createVerification, voidVerification } from '../../lib/docVerify'
import {
  downloadBillXLSX, downloadPOXLSX, downloadPaymentMadeXLSX,
} from '../../lib/docXLSX'

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]
const inp = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${x}`
const fmtINR  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—'

const STATUS_COLORS = {
  draft:               'bg-slate-500/10 text-slate-500 border-slate-400/50',
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

const blankLine = () => ({ _id: Math.random().toString(36).slice(2), description: '', hsn_sac: '', quantity: 1, unit: 'nos', rate: '', amount: 0, gst_rate: null, _gst_desc: null, _hsn_open: false })

const INV_CATEGORIES = [
  { value: 'raw_material',  label: 'Raw Material' },
  { value: 'spare_part',   label: 'Spare Part' },
  { value: 'lubricant',    label: 'Lubricant' },
  { value: 'tool',         label: 'Tool & Equipment' },
  { value: 'finished_good',label: 'Finished Good' },
  { value: 'consumable',   label: 'Consumable' },
]

const LINE_UNITS = ['unit','nos','hrs','days','kg','ton','m3','km','ls','set','mtr','sqm','sqft','cum','rmt','ltr']

function LineItemsEditor({ lines, setLines, isTax }) {
  const update = (id, key, val) => setLines(p => p.map(l => {
    if (l._id !== id) return l
    const u = { ...l, [key]: val }
    if (key === 'quantity' || key === 'rate') u.amount = (parseFloat(u.quantity) || 0) * (parseFloat(u.rate) || 0)
    if (key === 'hsn_sac') {
      const found = lookupHsnSac(val)
      // Auto-fill rate from HSN lookup; keep existing manual rate if no match
      if (found) { u.gst_rate = found.gst; u._gst_desc = found.desc }
      else { u._gst_desc = null }
    }
    return u
  }))
  const toggleHsn = (id) => setLines(p => p.map(l => l._id === id ? { ...l, _hsn_open: !l._hsn_open } : l))
  const clearHsn  = (id) => setLines(p => p.map(l => l._id === id ? { ...l, hsn_sac: '', gst_rate: null, _gst_desc: null, _hsn_open: false } : l))
  const setLineGst = (id, val) => setLines(p => p.map(l => l._id === id ? { ...l, gst_rate: val === '' ? null : parseFloat(val) } : l))
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
          const showHsn   = isTax && (l._hsn_open || hsnFilled)
          return (
            <div key={l._id} className="flex gap-2 items-start bg-dark-700/40 rounded-xl p-2">
              {/* Description col */}
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

                {/* HSN/SAC + per-line GST rate row */}
                {isTax && (
                  <div className="mt-1">
                    {!showHsn ? (
                      <button type="button" onClick={() => toggleHsn(l._id)}
                        className="text-[10px] text-primary-400/70 hover:text-primary-300 transition-colors">
                        + Add HSN / SAC code
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* HSN input */}
                        <div className="relative shrink-0">
                          <input
                            autoFocus={l._hsn_open && !hsnFilled}
                            className={`${inp()} text-xs font-mono uppercase py-1 pr-6 w-28`}
                            placeholder="e.g. 997313"
                            value={l.hsn_sac}
                            onChange={e => update(l._id, 'hsn_sac', e.target.value)}
                          />
                          <button type="button" onClick={() => clearHsn(l._id)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {/* Per-line GST rate — auto-filled from HSN, manually editable */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <input
                            type="number" min="0" max="100" step="0.01"
                            className={`${inp()} text-xs text-center py-1 w-14`}
                            placeholder="GST%"
                            value={l.gst_rate ?? ''}
                            onChange={e => setLineGst(l._id, e.target.value)}
                          />
                          <span className="text-[10px] text-slate-500">%</span>
                        </div>
                        {l._gst_desc && <span className="text-[9px] text-slate-500 truncate max-w-[120px]">{l._gst_desc}</span>}
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

function TaxSummary({ lines, form, setF }) {
  const isTax    = form.is_tax_invoice !== false
  const useIgst  = !!form.use_igst
  const { subtotal, taxable: _taxable, cgst_amt, sgst_amt, igst_amt, total, slabs } = calcTotalFromLines(form, lines)
  const discount = parseFloat(form.discount_amount) || 0

  // Slab rows sorted ascending, excluding 0% (no-tax lines) from display
  const slabEntries = Object.entries(slabs)
    .filter(([r]) => parseFloat(r) > 0)
    .sort(([a], [b]) => parseFloat(a) - parseFloat(b))

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-3">
        {isTax ? (
          <>
            <SectionHead label="GST" />
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={useIgst} onChange={e => setF('use_igst', e.target.checked)} className="rounded" />
              Use IGST (interstate)
            </label>

            {/* Per-slab breakdown table */}
            {slabEntries.length > 0 ? (
              <div className="rounded-lg border border-dark-600 overflow-hidden text-[10px]">
                <div className="grid grid-cols-4 gap-0 bg-dark-700/60 px-2 py-1 text-[9px] text-slate-500 font-semibold uppercase tracking-wider">
                  <span>Slab</span>
                  <span className="text-right">Taxable</span>
                  <span className="text-right">{useIgst ? 'IGST' : 'CGST'}</span>
                  {!useIgst && <span className="text-right">SGST</span>}
                  {useIgst && <span />}
                </div>
                {slabEntries.map(([rate, s]) => (
                  <div key={rate} className="grid grid-cols-4 gap-0 px-2 py-1.5 border-t border-dark-700/50">
                    <span className="font-bold text-primary-400">{rate}%</span>
                    <span className="text-right text-slate-400">{fmtINR(s.taxable)}</span>
                    <span className="text-right text-slate-300">{fmtINR(useIgst ? s.igst : s.cgst)}</span>
                    <span className="text-right text-slate-300">{useIgst ? '' : fmtINR(s.sgst)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">Enter HSN/SAC codes with GST% on line items to auto-calculate per-slab tax.</p>
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
        {isTax && (useIgst
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

// ── Helper: compute bill total per-slab from line items ───────────────────────
// Groups lines by their individual GST rate, computes CGST+SGST (or IGST) per slab.
// Returns { subtotal, taxable, cgst_amt, sgst_amt, igst_amt, total, slabs }
// slabs = { '18': { taxable, cgst, sgst, igst }, ... }
function calcTotalFromLines(form, lines) {
  const isTax    = form.is_tax_invoice !== false
  const useIgst  = !!form.use_igst
  const discount = parseFloat(form.discount_amount) || 0
  const subtotal = lines.reduce((s, l) => s + (l.amount || 0), 0)
  const discRatio = subtotal > 0 ? discount / subtotal : 0

  let totalCgst = 0, totalSgst = 0, totalIgst = 0
  const slabs = {}   // { rate: { taxable, cgst, sgst, igst } }

  if (isTax) {
    lines.forEach(l => {
      const lineAmt = (l.amount || 0) * (1 - discRatio)  // proportional discount
      const rate    = parseFloat(l.gst_rate) || 0
      if (!slabs[rate]) slabs[rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
      slabs[rate].taxable += lineAmt
      if (rate > 0) {
        if (useIgst) {
          const igst = lineAmt * rate / 100
          slabs[rate].igst += igst; totalIgst += igst
        } else {
          const half = rate / 2
          const cgst = lineAmt * half / 100
          slabs[rate].cgst += cgst; slabs[rate].sgst += cgst
          totalCgst += cgst; totalSgst += cgst
        }
      }
    })
  }

  const taxable = subtotal - discount
  const total   = taxable + totalCgst + totalSgst + totalIgst
  return { subtotal, taxable, cgst_amt: totalCgst, sgst_amt: totalSgst, igst_amt: totalIgst, total, slabs }
}

// ── Indian banks with account number digit hints ──────────────────────────────
const INDIAN_BANKS = [
  { name: 'State Bank of India', digits: 11 },
  { name: 'Bank of Baroda', digits: 14 },
  { name: 'Bank of India', digits: 15 },
  { name: 'Punjab National Bank', digits: 16 },
  { name: 'Canara Bank', digits: 13 },
  { name: 'Union Bank of India', digits: 15 },
  { name: 'Indian Bank', digits: 15 },
  { name: 'Central Bank of India', digits: 10 },
  { name: 'Indian Overseas Bank', digits: 15 },
  { name: 'Bank of Maharashtra', digits: 16 },
  { name: 'UCO Bank', digits: 16 },
  { name: 'Punjab & Sind Bank', digits: 12 },
  { name: 'HDFC Bank', digits: 14 },
  { name: 'ICICI Bank', digits: 12 },
  { name: 'Axis Bank', digits: 15 },
  { name: 'Kotak Mahindra Bank', digits: 16 },
  { name: 'Yes Bank', digits: 16 },
  { name: 'IndusInd Bank', digits: 15 },
  { name: 'IDBI Bank', digits: 16 },
  { name: 'IDFC First Bank', digits: 14 },
  { name: 'Federal Bank', digits: 14 },
  { name: 'South Indian Bank', digits: 16 },
  { name: 'Karnataka Bank', digits: 16 },
  { name: 'City Union Bank', digits: 14 },
  { name: 'Karur Vysya Bank', digits: 16 },
  { name: 'RBL Bank', digits: 12 },
  { name: 'Bandhan Bank', digits: 17 },
  { name: 'AU Small Finance Bank', digits: 14 },
  { name: 'Ujjivan Small Finance Bank', digits: 14 },
  { name: 'Tamilnad Mercantile Bank', digits: 15 },
  { name: 'DCB Bank', digits: 14 },
  { name: 'Catholic Syrian Bank', digits: 14 },
  { name: 'Dhanlaxmi Bank', digits: 16 },
  { name: 'Nainital Bank', digits: 11 },
  { name: 'Saraswat Bank', digits: 15 },
  { name: 'Equitas Small Finance Bank', digits: 14 },
  { name: 'Jana Small Finance Bank', digits: 14 },
  { name: 'Other', digits: null },
]

const BLANK_VENDOR = {
  name: '', vendor_code: '', category: 'general', gstin: '',
  contact_name: '', contact_phone: '', contact_email: '',
  address: '', bank_name: '', bank_account_name: '', bank_account: '', bank_ifsc: '', notes: '',
}

const VENDOR_DOCS = [
  { key: 'aadhar',   label: 'Aadhaar Card',       urlKey: 'aadhar_url',   accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'pan',      label: 'PAN Card',            urlKey: 'pan_url',      accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'cheque',   label: 'Cancelled Cheque',    urlKey: 'cheque_url',   accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'gst_cert', label: 'GST Certificate',     urlKey: 'gst_cert_url', accept: '.pdf,.jpg,.jpeg,.png' },
]

// ── VENDORS TAB ───────────────────────────────────────────────────────────────
function VendorsTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(BLANK_VENDOR)
  const [docs, setDocs] = useState({ aadhar: null, pan: null, cheque: null, gst_cert: null })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('*').eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const openCreate = () => {
    setForm(BLANK_VENDOR)
    setDocs({ aadhar: null, pan: null, cheque: null, gst_cert: null })
    setEditMode(false)
    setShowCreate(true)
  }

  const openEdit = (vendor) => {
    setForm({
      id:                vendor.id,
      name:              vendor.name              || '',
      vendor_code:       vendor.vendor_code       || '',
      category:          vendor.category          || 'general',
      gstin:             vendor.gstin             || '',
      contact_name:      vendor.contact_name      || '',
      contact_phone:     vendor.contact_phone     || '',
      contact_email:     vendor.contact_email     || '',
      address:           vendor.address           || '',
      bank_name:         vendor.bank_name         || '',
      bank_account_name: vendor.bank_account_name || '',
      bank_account:      vendor.bank_account      || '',
      bank_ifsc:         vendor.bank_ifsc         || '',
      notes:             vendor.notes             || '',
    })
    setDocs({ aadhar: null, pan: null, cheque: null, gst_cert: null })
    setEditMode(true)
    setSelected(null)
    setShowCreate(true)
  }

  const deleteVendor = async (vendor) => {
    if (!window.confirm(`Delete vendor "${vendor.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('vendors').delete().eq('id', vendor.id)
      if (error) throw error
      toast.success('Vendor deleted')
      setSelected(null)
      qc.invalidateQueries(['vendors', companyId])
    } catch (e) { toast.error(e.message) } finally { setDeleting(false) }
  }

  const selectedBank = INDIAN_BANKS.find(b => b.name === form.bank_name)

  const uploadVendorDoc = async (file, docKey, vendorCode) => {
    const ext = file.name.split('.').pop()
    const path = `vendor-docs/${companyId}/${vendorCode}/${docKey}.${ext}`
    const { error } = await supabase.storage.from('nhance-photos').upload(path, file, { upsert: true })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('nhance-photos').getPublicUrl(path)
    return publicUrl
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error('Vendor name required')
    if (form.bank_account.trim() && selectedBank?.digits) {
      const len = form.bank_account.trim().length
      if (len !== selectedBank.digits) {
        return toast.error(`${form.bank_name} account numbers are ${selectedBank.digits} digits (you entered ${len})`)
      }
    }
    setSaving(true)
    try {
      const vendorCode = form.vendor_code.trim() || (!editMode ? await nextDocNumber(companyId, 'vendor').catch(() => '') : '')
      // Upload any newly attached documents
      const docUrls = {}
      for (const d of VENDOR_DOCS) {
        if (docs[d.key]) {
          docUrls[d.urlKey] = await uploadVendorDoc(docs[d.key], d.key, vendorCode || form.vendor_code)
        }
      }
      const payload = {
        name: form.name.trim(),
        category: form.category,
        gstin: form.gstin.trim() || null,
        contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        address: form.address.trim() || null,
        bank_name: form.bank_name || null,
        bank_account_name: form.bank_account_name.trim() || null,
        bank_account: form.bank_account.trim() || null,
        bank_ifsc: form.bank_ifsc.trim().toUpperCase() || null,
        notes: form.notes.trim() || null,
        ...docUrls,
      }

      if (editMode) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', form.id)
        if (error) throw error
        toast.success('Vendor updated')
      } else {
        const { error } = await supabase.from('vendors').insert({
          company_id: companyId, vendor_code: vendorCode || null,
          created_by: session.user.id, ...payload,
        })
        if (error) throw error
        toast.success('Vendor added')
      }

      setShowCreate(false)
      setEditMode(false)
      setForm(BLANK_VENDOR)
      setDocs({ aadhar: null, pan: null, cheque: null, gst_cert: null })
      qc.invalidateQueries(['vendors', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const CATEGORIES = ['general','fuel_supplier','spare_parts','tyres','lubricants','civil','electrical','subcontractor','transport','misc']

  const displayed = vendors.filter(v =>
    !search || v.name?.toLowerCase().includes(search.toLowerCase()) ||
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
        <button onClick={openCreate} className="btn-primary shrink-0"><Plus className="w-4 h-4" /> Add Vendor</button>
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
                  <p className="font-semibold text-slate-100 truncate">{v.name}</p>
                  {v.vendor_code && <p className="text-xs font-mono text-primary-500">{v.vendor_code}</p>}
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
        <Modal
          title={selected.name}
          subtitle={selected.category?.replace(/_/g,' ')}
          onClose={() => setSelected(null)}
          footer={
            <div className="flex gap-2 w-full">
              <button onClick={() => deleteVendor(selected)} disabled={deleting}
                className="flex-1 btn-ghost text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-800/40">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
              </button>
              <button onClick={() => openEdit(selected)} className="flex-1 btn-primary">
                Edit
              </button>
            </div>
          }
        >
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
                {selected.bank_name && <div className="col-span-2"><p className="text-xs text-slate-500">Bank</p><p className="text-sm text-slate-100">{selected.bank_name}</p></div>}
                {selected.bank_account_name && <div className="col-span-2"><p className="text-xs text-slate-500">Account Holder</p><p className="text-sm text-slate-100">{selected.bank_account_name}</p></div>}
                {selected.bank_account && <div><p className="text-xs text-slate-500">Account No.</p><p className="text-sm font-mono text-slate-100">{selected.bank_account}</p></div>}
                {selected.bank_ifsc && <div><p className="text-xs text-slate-500">IFSC</p><p className="text-sm font-mono text-slate-100">{selected.bank_ifsc}</p></div>}
              </div>
            </>
          )}
          {selected.notes && <div className="bg-dark-700 rounded-xl p-3"><p className="text-xs text-slate-500 mb-1">Notes</p><p className="text-sm text-slate-300">{selected.notes}</p></div>}
          {VENDOR_DOCS.some(d => selected[d.urlKey]) && (
            <>
              <div className="border-t border-dark-700 pt-4"><SectionHead label="Documents" /></div>
              <div className="grid grid-cols-2 gap-2">
                {VENDOR_DOCS.filter(d => selected[d.urlKey]).map(d => (
                  <a key={d.key} href={selected[d.urlKey]} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg px-3 py-2 transition-colors group">
                    <FileText className="w-4 h-4 text-primary-400 shrink-0" />
                    <span className="text-xs text-slate-300 group-hover:text-slate-100 truncate">{d.label}</span>
                    <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-slate-400 shrink-0 ml-auto" />
                  </a>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {showCreate && (
        <Modal title={editMode ? 'Edit Vendor' : 'Add Vendor'} onClose={() => { setShowCreate(false); setEditMode(false) }}
          footer={<><button onClick={() => { setShowCreate(false); setEditMode(false) }} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editMode ? 'Save Changes' : 'Add Vendor'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Vendor Name *"><input className={inp()} value={form.name} onChange={e => setF('name', e.target.value)} /></Field></div>
            <Field label="Vendor Code">
              <input className={inp('font-mono bg-dark-700 text-slate-400 cursor-not-allowed')} value={form.vendor_code || (editMode ? '' : 'Auto-generated')} readOnly />
            </Field>
            <Field label="Category">
              <select className={inp()} value={form.category} onChange={e => setF('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="GSTIN"><input className={inp()} value={form.gstin} onChange={e => setF('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} /></Field></div>
          </div>
          <SectionHead label="Contact" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Name"><input className={inp()} value={form.contact_name} onChange={e => setF('contact_name', e.target.value)} /></Field>
            <Field label="Phone"><input className={inp()} value={form.contact_phone} onChange={e => setF('contact_phone', e.target.value)} maxLength={10} /></Field>
            <div className="col-span-2"><Field label="Email"><input type="email" className={inp()} value={form.contact_email} onChange={e => setF('contact_email', e.target.value)} /></Field></div>
            <div className="col-span-2"><Field label="Address"><textarea className={inp()} rows={2} value={form.address} onChange={e => setF('address', e.target.value)} /></Field></div>
          </div>
          <SectionHead label="Bank Details (optional)" />
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Bank Name">
                <select className={inp()} value={form.bank_name} onChange={e => { setF('bank_name', e.target.value); setF('bank_account', '') }}>
                  <option value="">Select bank…</option>
                  {INDIAN_BANKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Account Holder Name">
                <input className={inp()} value={form.bank_account_name} onChange={e => setF('bank_account_name', e.target.value)} placeholder="Name as per bank records" />
              </Field>
            </div>
            <Field label={selectedBank?.digits ? `Account Number (${selectedBank.digits} digits)` : 'Account Number'}>
              <input className={inp('font-mono')} value={form.bank_account}
                onChange={e => setF('bank_account', e.target.value.replace(/\D/g, ''))}
                placeholder={selectedBank?.digits ? `${selectedBank.digits}-digit number` : 'Account number'}
                maxLength={selectedBank?.digits || 18}
              />
            </Field>
            <Field label="IFSC Code">
              <input className={inp('font-mono')} value={form.bank_ifsc}
                onChange={e => setF('bank_ifsc', e.target.value.toUpperCase())}
                placeholder="HDFC0001234" maxLength={11}
              />
            </Field>
          </div>
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
          <SectionHead label="Documents" />
          <div className="grid grid-cols-2 gap-3">
            {VENDOR_DOCS.map(d => {
              const file = docs[d.key]
              return (
                <div key={d.key}>
                  <p className="text-xs text-slate-400 mb-1">{d.label}</p>
                  {file ? (
                    <div className="flex items-center gap-2 bg-dark-700 border border-emerald-700/40 rounded-lg px-3 py-2">
                      <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs text-slate-300 truncate flex-1">{file.name}</span>
                      <button type="button" onClick={() => setDocs(p => ({ ...p, [d.key]: null }))}
                        className="text-slate-500 hover:text-red-400 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 bg-dark-700 border border-dashed border-dark-600 hover:border-primary-600 rounded-lg px-3 py-2 cursor-pointer transition-colors group">
                      <Upload className="w-4 h-4 text-slate-500 group-hover:text-primary-400 shrink-0" />
                      <span className="text-xs text-slate-500 group-hover:text-slate-300">Upload file</span>
                      <input type="file" accept={d.accept} className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) setDocs(p => ({ ...p, [d.key]: f })) }} />
                    </label>
                  )}
                </div>
              )
            })}
          </div>
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
  const [form, setForm] = useState({ description: '', amount: '', expense_date: todayStr(), category: 'spares', vendor_id: '', payment_mode: 'cash', reference: '', notes: '' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const [editing, setEditing] = useState(null)   // { _kind, _raw }
  const [editForm, setEditForm] = useState({})
  const setEF = (k, v) => setEditForm(p => ({ ...p, [k]: v }))

  // Direct purchase expenses (manually recorded)
  const { data: expenses = [], isLoading: loadingExp } = useQuery({
    queryKey: ['purchase_expenses', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*')
        .eq('company_id', companyId).eq('source', 'purchase')
        .order('expense_date', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  // Bill payments (payments_made linked to bills)
  const { data: billPayments = [], isLoading: loadingPay } = useQuery({
    queryKey: ['purchase_bill_payments', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('payments_made')
        .select('id, payment_number, payment_date, vendor_name, amount, payment_mode, bank_reference, bill_id, bills(bill_number, total_amount)')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name').eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId && showCreate,
  })

  const CATEGORIES = [
    { value: 'equipment_purchase', label: 'Equipment Purchase' },
    { value: 'spares',             label: 'Spares & Parts' },
    { value: 'lubricants',         label: 'Lubricants & Oil' },
    { value: 'maintenance_service',label: 'Maintenance / Service' },
    { value: 'invoice_payment',    label: 'Invoice Payment' },
    { value: 'other',              label: 'Other' },
  ]
  const MODES = ['cash','bank','upi','cheque','neft','rtgs']

  // Merge and sort both streams by date descending
  const allEntries = useMemo(() => {
    const expRows = expenses.map(e => ({
      _key: `exp-${e.id}`, _kind: 'expense', _raw: e,
      date: e.expense_date, label: e.description,
      sub: e.category?.replace(/_/g, ' '),
      vendor: e.vendor_name, mode: e.payment_mode,
      ref: e.bill_number || e.bank_reference,
      amount: Number(e.amount || 0),
    }))
    const payRows = billPayments.map(p => ({
      _key: `pay-${p.id}`, _kind: 'payment', _raw: p,
      date: p.payment_date, label: `Payment — ${p.vendor_name || ''}`,
      sub: p.bills?.bill_number ? `Bill ${p.bills.bill_number}` : 'Bill Payment',
      vendor: p.vendor_name, mode: p.payment_mode,
      ref: p.payment_number,
      amount: Number(p.amount || 0),
    }))
    return [...expRows, ...payRows].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [expenses, billPayments])

  const totalSpent = allEntries.reduce((s, e) => s + e.amount, 0)
  const isLoading  = loadingExp || loadingPay

  const save = async () => {
    if (!form.description.trim()) return toast.error('Description required')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const amt = parseFloat(form.amount)
      const { data: exp, error: ee } = await supabase.from('expenses').insert({
        company_id:    companyId,
        expense_date:  form.expense_date,
        category:      form.category,
        description:   form.description.trim(),
        amount:        amt,
        total_amount:  amt,
        gst_amount:    0,
        payment_mode:  form.payment_mode,
        bank_reference: form.reference || null,
        vendor_name:   null,
        source:        'purchase',
        created_by:    session.user.id,
      }).select('id').single()
      if (ee) throw ee

      await supabase.from('account_transactions').insert({
        company_id:     companyId, type: 'expense',
        description:    form.description.trim(),
        amount:         amt, gst_amount: 0,
        txn_date:       form.expense_date,
        payment_mode:   form.payment_mode,
        bank_reference: form.reference || null,
        reference_type: 'expense', reference_id: exp.id,
        notes:          form.notes || null, created_by: session.user.id,
      })

      toast.success('Expense recorded')
      setShowCreate(false)
      setForm({ description: '', amount: '', expense_date: todayStr(), category: 'spares', vendor_id: '', payment_mode: 'cash', reference: '', notes: '' })
      qc.invalidateQueries(['purchase_expenses', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const openEdit = (entry) => {
    setEditing(entry)
    if (entry._kind === 'expense') {
      const e = entry._raw
      setEditForm({ description: e.description || '', amount: String(e.amount || ''), expense_date: e.expense_date || todayStr(), category: e.category || 'spares', payment_mode: e.payment_mode || 'cash', reference: e.bank_reference || '' })
    } else {
      const p = entry._raw
      setEditForm({ description: entry.label, amount: String(p.amount || ''), expense_date: p.payment_date || todayStr(), payment_mode: p.payment_mode || 'cash', reference: p.bank_reference || '' })
    }
  }

  const saveEdit = async () => {
    if (!editForm.amount || parseFloat(editForm.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const amt = parseFloat(editForm.amount)
      if (editing._kind === 'expense') {
        await supabase.from('expenses').update({
          expense_date: editForm.expense_date, category: editForm.category,
          description: editForm.description.trim(), amount: amt, total_amount: amt,
          payment_mode: editForm.payment_mode, bank_reference: editForm.reference || null,
        }).eq('id', editing._raw.id)
        await supabase.from('account_transactions').update({
          description: editForm.description.trim(), amount: amt,
          txn_date: editForm.expense_date, payment_mode: editForm.payment_mode,
          bank_reference: editForm.reference || null,
        }).eq('reference_id', editing._raw.id).eq('reference_type', 'expense')
        qc.invalidateQueries(['purchase_expenses', companyId])
      } else {
        const p = editing._raw
        await supabase.from('payments_made').update({
          amount: amt, payment_date: editForm.expense_date,
          payment_mode: editForm.payment_mode, bank_reference: editForm.reference || null,
        }).eq('id', p.id)
        // Recalculate bill balance
        if (p.bill_id) {
          const { data: rem } = await supabase.from('payments_made').select('amount').eq('bill_id', p.bill_id)
          const totalPaid = (rem || []).reduce((s, r) => s + Number(r.amount), 0)
          const { data: bill } = await supabase.from('bills').select('total_amount').eq('id', p.bill_id).single()
          if (bill) {
            const balance = Math.max(0, bill.total_amount - totalPaid)
            await supabase.from('bills').update({
              paid_amount: totalPaid, balance_due: balance,
              status: totalPaid <= 0 ? 'pending' : balance <= 0 ? 'paid' : 'partial',
            }).eq('id', p.bill_id)
          }
        }
        qc.invalidateQueries(['purchase_bill_payments', companyId])
        qc.invalidateQueries(['bills', companyId])
      }
      toast.success('Updated')
      setEditing(null)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete "${entry.label}"? This cannot be undone.`)) return
    try {
      if (entry._kind === 'expense') {
        await supabase.from('account_transactions').delete().eq('reference_id', entry._raw.id).eq('reference_type', 'expense')
        await supabase.from('expenses').delete().eq('id', entry._raw.id)
        qc.invalidateQueries(['purchase_expenses', companyId])
      } else {
        const p = entry._raw
        await supabase.from('payments_made').delete().eq('id', p.id)
        if (p.bill_id) {
          const { data: rem } = await supabase.from('payments_made').select('amount').eq('bill_id', p.bill_id)
          const totalPaid = (rem || []).reduce((s, r) => s + Number(r.amount), 0)
          const { data: bill } = await supabase.from('bills').select('total_amount').eq('id', p.bill_id).single()
          if (bill) {
            const balance = Math.max(0, bill.total_amount - totalPaid)
            await supabase.from('bills').update({
              paid_amount: totalPaid, balance_due: balance,
              status: totalPaid <= 0 ? 'pending' : balance <= 0 ? 'paid' : 'partial',
            }).eq('id', p.bill_id)
          }
        }
        qc.invalidateQueries(['purchase_bill_payments', companyId])
        qc.invalidateQueries(['bills', companyId])
      }
      toast.success('Deleted')
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs">
          <span className="text-slate-500">Total Spent </span>
          <span className="font-bold text-red-400">{fmtINR(totalSpent)}</span>
          {billPayments.length > 0 && (
            <span className="text-slate-600 ml-2">
              (Direct: {fmtINR(expenses.reduce((s,e)=>s+Number(e.amount||0),0))} · Bills: {fmtINR(billPayments.reduce((s,p)=>s+Number(p.amount||0),0))})
            </span>
          )}
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Expense</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading
          ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
          : allEntries.length === 0
            ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><Wallet className="w-10 h-10 text-slate-700" /><p>No expenses recorded</p></div>
            : <div className="space-y-2">
              {allEntries.map(e => (
                <div key={e._key} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-100 text-sm truncate">{e.label}</p>
                      {e._kind === 'payment' && (
                        <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">BILL PMT</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {fmtDate(e.date)}
                      {e.sub && <> · <span className="capitalize">{e.sub}</span></>}
                      {e.mode && <> · {e.mode.toUpperCase()}</>}
                      {e.ref  && <> · <span className="text-primary-500">{e.ref}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <p className="text-lg font-black text-red-400 mr-2">{fmtINR(e.amount)}</p>
                    <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteEntry(e)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
        }
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
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field></div>}
            <div className="col-span-2"><Field label="Reference No."><input className={inp()} value={form.reference} onChange={e => setF('reference', e.target.value)} placeholder="Bill / receipt no." /></Field></div>
          </div>
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {editing && (
        <Modal
          title={editing._kind === 'expense' ? 'Edit Expense' : 'Edit Bill Payment'}
          onClose={() => setEditing(null)}
          footer={<><button onClick={() => setEditing(null)} className="flex-1 btn-ghost">Cancel</button><button onClick={saveEdit} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}</button></>}>
          {editing._kind === 'expense' && (
            <Field label="Description *"><input className={inp()} value={editForm.description} onChange={e => setEF('description', e.target.value)} /></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *"><input type="number" className={inp()} value={editForm.amount} onChange={e => setEF('amount', e.target.value)} step="0.01" /></Field>
            <Field label="Date"><input type="date" className={inp()} value={editForm.expense_date} onChange={e => setEF('expense_date', e.target.value)} /></Field>
            {editing._kind === 'expense' && (
              <Field label="Category">
                <select className={inp()} value={editForm.category} onChange={e => setEF('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Payment Mode">
              <select className={inp()} value={editForm.payment_mode} onChange={e => setEF('payment_mode', e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="Reference No."><input className={inp()} value={editForm.reference} onChange={e => setEF('reference', e.target.value)} placeholder="Bill / receipt no." /></Field></div>
          </div>
          {editing._kind === 'payment' && (
            <p className="text-[11px] text-slate-500 italic">Editing a bill payment will automatically recalculate the bill balance.</p>
          )}
        </Modal>
      )}
    </div>
  )
}

// ── BILLS TAB ─────────────────────────────────────────────────────────────────
function BillsTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankForm = () => ({ vendor_id: '', vendor_gstin: '', bill_date: todayStr(), due_date: '', bill_ref: '', use_igst: false, discount_amount: 0, notes: '', is_tax_invoice: true, payment_type: 'standard', credit_days: '30' })

  // Auto-compute due date from bill_date + credit_days
  const computeDueDate = (billDate, days) => {
    if (!billDate || !days) return ''
    const d = new Date(billDate); d.setDate(d.getDate() + parseInt(days) || 0)
    return d.toISOString().split('T')[0]
  }
  const [form, setForm] = useState(blankForm())
  const [lines, setLines] = useState([blankLine()])
  const [addToInv, setAddToInv] = useState(false)
  const [invCategory, setInvCategory] = useState('')
  const [invStore, setInvStore] = useState('')
  const [editing, setEditing] = useState(null)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const closeModal = () => {
    setShowCreate(false); setEditing(null); setForm(blankForm())
    setLines([blankLine()]); setAddToInv(false); setInvCategory(''); setInvStore('')
  }

  const openCreate = () => {
    setEditing(null); setForm(blankForm()); setLines([blankLine()])
    setAddToInv(false); setInvCategory(''); setInvStore(''); setShowCreate(true)
  }

  const openEdit = async (bill) => {
    const { data: ld } = await supabase.from('bill_line_items').select('*').eq('bill_id', bill.id).order('sort_order')
    setEditing(bill)
    setForm({
      vendor_id: bill.vendor_id || '', vendor_gstin: bill.vendor_gstin || '',
      bill_date: bill.bill_date || todayStr(), due_date: bill.due_date || '',
      bill_ref: bill.bill_ref || '',
      use_igst: (bill.igst_amount || 0) > 0, discount_amount: bill.discount_amount || 0,
      notes: bill.notes || '', is_tax_invoice: bill.is_tax_invoice !== false,
      payment_type: bill.payment_type === 'credit' ? 'credit' : 'standard',
      credit_days: String(bill.credit_days || 30),
    })
    setLines(ld?.map(l => {
      const found = l.hsn_sac ? lookupHsnSac(l.hsn_sac) : null
      return {
        _id: Math.random().toString(36).slice(2),
        description: l.description || '', hsn_sac: l.hsn_sac || '',
        quantity: String(l.quantity || 1), unit: l.unit || 'nos',
        rate: String(l.rate || 0), amount: l.amount || 0,
        gst_rate: found ? found.gst : null,
        _gst_desc: found ? found.desc : null, _hsn_open: false,
      }
    }) || [blankLine()])
    setShowCreate(true)
  }

  const dlPDFbill = async (b) => {
    try { const { data: ld } = await supabase.from('bill_line_items').select('*').eq('bill_id', b.id).order('sort_order'); const verifyUrl = await createVerification(supabase, companyId, { docType: 'bill', docNumber: b.bill_number, docDate: b.bill_date, partyName: b.vendor_name, amount: b.total_amount , companyName: company?.name || null, issuedByName: userProfile?.full_name || null }); await downloadBillPDF(b, ld||[], company, verifyUrl) } catch(e) { toast.error(e.message) }
  }
  const voidQRbill = async (b) => {
    if (!window.confirm(`Void QR code for ${b.bill_number}?\nAny printed copy will immediately show as invalid.`)) return
    const r = await voidVerification(supabase, companyId, { docType: 'bill', docNumber: b.bill_number })
    if (!r || r.count === 0) toast('No active QR found.', { icon: 'ℹ️' })
    else toast.success(`QR voided — ${b.bill_number} printed copies now show as invalid`)
  }
  const dlXLSXbill = async (b) => {
    try { const { data: ld } = await supabase.from('bill_line_items').select('*').eq('bill_id', b.id).order('sort_order'); downloadBillXLSX(b, ld||[], company) } catch(e) { toast.error(e.message) }
  }

  const deleteBill = async (bill) => {
    if (Number(bill.paid_amount) > 0) return toast.error('Cannot delete a paid bill. Void it instead.')
    if (!window.confirm(`Delete Bill ${bill.bill_number}? Stock movements will be reversed.`)) return
    try {
      await supabase.from('stock_transactions').delete().eq('bill_id', bill.id)
      await supabase.from('bill_line_items').delete().eq('bill_id', bill.id)
      const { error } = await supabase.from('bills').delete().eq('id', bill.id)
      if (error) throw error
      toast.success(`Bill ${bill.bill_number} deleted`)
      qc.invalidateQueries(['bills', companyId])
      qc.invalidateQueries(['inv_stock', companyId])
      qc.invalidateQueries(['stock_transactions', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const voidBill = async (bill) => {
    if (!window.confirm(`Void Bill ${bill.bill_number}? It will be marked cancelled.`)) return
    const { error } = await supabase.from('bills').update({ status: 'cancelled' }).eq('id', bill.id)
    if (error) return toast.error(error.message)
    toast.success(`Bill ${bill.bill_number} voided`)
    qc.invalidateQueries(['bills', companyId])
  }

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bills').select('*, vendors(name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name, gstin').eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Inventory items + stores for the inward-type link
  const { data: invItems = [] } = useQuery({
    queryKey: ['inv_items_active', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_items').select('id, item_name, item_code, unit, category').eq('company_id', companyId).eq('is_active', true).order('item_name')
      return data || []
    },
    enabled: !!companyId,
  })
  const { data: stores = [] } = useQuery({
    queryKey: ['stores_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stores').select('id, store_name').eq('company_id', companyId).eq('is_active', true).order('store_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const isTax = form.is_tax_invoice !== false

  const save = async () => {
    if (!form.vendor_id) return toast.error('Select a vendor')
    if (isTax && !form.vendor_gstin.trim()) return toast.error('Vendor GSTIN is required for Tax Bill')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    if (!editing && addToInv && !invCategory) return toast.error('Select an inventory category')
    if (!editing && addToInv && !invStore) return toast.error('Select a store / location')
    setSaving(true)
    try {
      const validLines = lines.filter(l => l.description.trim())
      const { subtotal, taxable, cgst_amt, sgst_amt, igst_amt, total } = calcTotalFromLines(form, validLines)
      const vendor = vendors.find(v => v.id === form.vendor_id)

      const isCredit   = form.payment_type === 'credit'
      const creditDays = parseInt(form.credit_days) || 30
      const dueDateVal = isCredit ? computeDueDate(form.bill_date, creditDays) : null

      if (editing) {
        // ── UPDATE ──
        const { error } = await supabase.from('bills').update({
          vendor_id: form.vendor_id, vendor_name: vendor?.name || '',
          bill_date: form.bill_date, due_date: dueDateVal || null,
          payment_type: form.payment_type, credit_days: isCredit ? creditDays : null,
          bill_ref: form.bill_ref || null,
          subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
          cgst_rate: 0, sgst_rate: 0, igst_rate: 0,
          cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
          total_amount: total, balance_due: Math.max(0, total - (Number(editing.paid_amount) || 0)),
          notes: form.notes || null,
        }).eq('id', editing.id)
        if (error) throw error
        await supabase.from('bill_line_items').delete().eq('bill_id', editing.id)
        const updItems = validLines.map((l, i) => ({
          bill_id: editing.id, description: l.description.trim(),
          hsn_sac: l.hsn_sac?.trim() || null,
          quantity: parseFloat(l.quantity) || 1, unit: l.unit,
          rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
        }))
        if (updItems.length > 0) { const { error: le } = await supabase.from('bill_line_items').insert(updItems); if (le) throw le }
        toast.success(`Bill ${editing.bill_number} updated`)
        closeModal()
        qc.invalidateQueries(['bills', companyId])
        return
      }

      // ── CREATE ──
      const id = crypto.randomUUID()
      const blNum = await nextDocNumber(companyId, 'bill').catch(() => `BL-${Date.now()}`)
      const { error } = await supabase.from('bills').insert({
        id, company_id: companyId, bill_number: blNum,
        vendor_id: form.vendor_id, vendor_name: vendor?.name || '',
        bill_date: form.bill_date, due_date: dueDateVal || null,
        payment_type: form.payment_type, credit_days: isCredit ? creditDays : null,
        bill_ref: form.bill_ref || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: 0, sgst_rate: 0, igst_rate: 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total,
        paid_amount: 0,
        balance_due: total,
        status: 'pending',
        notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error

      // Register in Issued Documents registry (non-blocking)
      createVerification(supabase, companyId, {
        docType: 'bill', docNumber: blNum, docDate: form.bill_date,
        partyName: vendor?.name || '', amount: total,
        companyName: company?.name || null, issuedByName: userProfile?.full_name || null,
      }).catch(() => {})

      // Save line items
      const items = validLines.map((l, i) => ({
        bill_id: id, description: l.description.trim(),
        hsn_sac: l.hsn_sac.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (items.length > 0) { const { error: le } = await supabase.from('bill_line_items').insert(items); if (le) throw le }

      // Auto-add to inventory if checkbox is checked
      if (addToInv && invCategory && invStore) {
        let invErrors = 0
        for (let i = 0; i < validLines.length; i++) {
          const l = validLines[i]
          const qty = parseFloat(l.quantity) || 0
          if (qty <= 0) continue
          try {
            // Find or create inventory item by name + category
            let itemId
            const { data: existing } = await supabase.from('inventory_items')
              .select('id').eq('company_id', companyId)
              .ilike('item_name', l.description.trim()).eq('category', invCategory).maybeSingle()
            if (existing) {
              itemId = existing.id
            } else {
              const itemCode = await nextDocNumber(companyId, 'inventory_item').catch(() => null)
              const { data: newItem, error: nie } = await supabase.from('inventory_items').insert({
                company_id: companyId, item_name: l.description.trim(),
                item_code: itemCode, category: invCategory,
                unit: l.unit, is_active: true, created_by: session.user.id,
              }).select('id').single()
              if (nie) { invErrors++; toast.error(`Item error: ${nie.message}`); continue }
              itemId = newItem.id
            }
            // Create stock transaction — triggers fn_update_inventory_stock
            await supabase.from('stock_transactions').insert({
              company_id: companyId,
              txn_number: `BILL-${blNum}-${String(i + 1).padStart(2, '0')}`,
              txn_type: 'in', txn_date: form.bill_date,
              item_id: itemId, store_id: invStore,
              quantity: qty, unit_cost: parseFloat(l.rate) || 0,
              total_cost: l.amount, vendor_id: form.vendor_id, bill_id: id,
              notes: `Auto-inward from Bill ${blNum}`, created_by: session.user.id,
            })
          } catch (err) { invErrors++; toast.error(`Inv error: ${err?.message || JSON.stringify(err)}`) }
        }
        if (invErrors > 0) toast.error(`Bill saved · ${invErrors} item(s) failed to add to inventory`)
        else toast.success(`Bill ${blNum} created · ${validLines.length} item(s) added to inventory`)
      } else {
        toast.success(`Bill ${blNum} created`)
      }

      closeModal()
      qc.invalidateQueries(['bills', companyId])
      qc.invalidateQueries(['inv_stock', companyId])
      qc.invalidateQueries(['stock_transactions', companyId])
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
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> New Bill</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : bills.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><FileText className="w-10 h-10 text-slate-700" /><p>No bills yet</p></div>
        : <div className="space-y-2">
          {bills.map(b => {
            const today      = new Date(); today.setHours(0,0,0,0)
            const dueD       = b.due_date ? new Date(b.due_date+'T00:00:00') : null
            const daysLeft   = dueD ? Math.ceil((dueD - today) / 86400000) : null
            const isCredit   = b.payment_type === 'credit'
            const isOverdue  = isCredit && dueD && dueD < today && !['paid','cancelled'].includes(b.status)
            const isDueSoon  = isCredit && daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && !['paid','cancelled'].includes(b.status)
            return (
            <div key={b.id} className={`bg-dark-800 border rounded-xl p-4 ${isOverdue ? 'border-red-700/60' : isDueSoon ? 'border-amber-700/60' : 'border-dark-700'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center flex-wrap">
                    <p className="text-xs font-mono text-primary-500">{b.bill_number}</p>
                    <StatusBadge status={b.status} />
                    {isCredit && <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-500/10 text-blue-400 border border-blue-700/40">🗓️ {b.credit_days}d Credit</span>}
                  </div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{b.vendor_name || b.vendors?.vendor_name}</p>
                  {b.bill_ref && <p className="text-xs text-slate-500">Ref: {b.bill_ref}</p>}
                  {/* Due date urgency line */}
                  {isCredit && dueD && !['paid','cancelled'].includes(b.status) && (
                    isOverdue
                      ? <p className="text-xs text-red-400 font-semibold mt-0.5">⚠ Overdue by {Math.abs(daysLeft)} day{Math.abs(daysLeft)!==1?'s':''} — {fmtINR(b.balance_due)} pending</p>
                      : isDueSoon
                        ? <p className="text-xs text-amber-400 font-semibold mt-0.5">⏰ Due in {daysLeft} day{daysLeft!==1?'s':''} — {fmtDate(b.due_date)}</p>
                        : <p className="text-xs text-slate-500 mt-0.5">Due {fmtDate(b.due_date)} · {daysLeft} days left</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-slate-100">{fmtINR(b.total_amount)}</p>
                  {b.paid_amount > 0 && <p className="text-xs text-emerald-400">Paid {fmtINR(b.paid_amount)}</p>}
                  {b.balance_due > 0 && <p className="text-xs text-orange-400">Balance {fmtINR(b.balance_due)}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{fmtDate(b.bill_date)}</p>
                <div className="flex items-center gap-1">
                  {b.status !== 'cancelled' && <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>}
                  {b.status !== 'cancelled' && <button onClick={() => voidBill(b)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-900/20" title="Void"><Ban className="w-3.5 h-3.5" /></button>}
                  {<button onClick={() => deleteBill(b)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => voidQRbill(b)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20" title="Void QR Code"><ShieldOff className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlPDFbill(b)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlXLSXbill(b)} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          )})}
        </div>}
      </div>
      {showCreate && (
        <Modal title={editing ? `Edit Bill · ${editing.bill_number}` : 'New Bill'} onClose={closeModal} wide
          footer={<><button onClick={closeModal} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update Bill' : 'Create Bill'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Vendor *">
                <select className={inp()} value={form.vendor_id} onChange={e => {
                  const v = vendors.find(x => x.id === e.target.value)
                  setForm(p => ({ ...p, vendor_id: e.target.value, vendor_gstin: v?.gstin || '' }))
                }}>
                  <option value="">-- Select vendor --</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
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

            {/* Credit checkbox */}
            <div className={`col-span-2 rounded-xl border p-3 transition-colors ${form.payment_type === 'credit' ? 'border-blue-700/50 bg-blue-500/5' : 'border-dark-700 bg-dark-800/40'}`}>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={form.payment_type === 'credit'}
                  onChange={e => setF('payment_type', e.target.checked ? 'credit' : 'standard')}
                  className="w-4 h-4 rounded accent-blue-500 cursor-pointer" />
                <span className="text-sm font-semibold text-slate-200">🗓️ Credit Bill</span>
                {form.payment_type === 'credit' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 font-medium">Active</span>}
              </label>
              <p className="text-[11px] text-slate-500 mt-1 ml-6">Check to set a credit period and track payment due date in Expense Planner.</p>
            </div>

            {/* Credit fields — shown only when checkbox is checked */}
            {form.payment_type === 'credit' && (
              <>
                <Field label="Credit Days">
                  <div className="flex gap-1.5">
                    {['15','30','45','60','90'].map(d => (
                      <button key={d} type="button" onClick={() => setF('credit_days', d)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                          form.credit_days === d ? 'bg-primary-600 border-primary-500 text-white' : 'border-dark-600 bg-dark-700 text-slate-400 hover:border-dark-500'
                        }`}>{d}</button>
                    ))}
                    <input type="number" min="1" max="365"
                      value={form.credit_days}
                      onChange={e => setF('credit_days', e.target.value)}
                      className={`${inp()} w-16 text-center`}
                      placeholder="days"
                    />
                  </div>
                </Field>
                <Field label="Due Date (auto)">
                  <div className={`${inp()} flex items-center gap-2 opacity-80`}>
                    <span className="text-slate-300 text-xs">
                      {computeDueDate(form.bill_date, form.credit_days)
                        ? new Date(computeDueDate(form.bill_date, form.credit_days)+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})
                        : '—'}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-500">
                      {form.credit_days && form.bill_date ? `${form.credit_days} days from bill date` : ''}
                    </span>
                  </div>
                </Field>
              </>
            )}
            <div className="col-span-2"><Field label="Vendor Bill / Reference No."><input className={inp()} value={form.bill_ref} onChange={e => setF('bill_ref', e.target.value)} /></Field></div>
          </div>
          <LineItemsEditor lines={lines} setLines={setLines} isTax={isTax} />

          {/* ── Add to Inventory (create only) ── */}
          {!editing && (
          <div className={`rounded-xl border p-3 transition-colors ${addToInv ? 'border-emerald-700/50 bg-emerald-500/5' : 'border-dark-700 bg-dark-800/40'}`}>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={addToInv} onChange={e => setAddToInv(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500 cursor-pointer" />
              <span className="text-sm font-semibold text-slate-200">Add material to inventory</span>
              {addToInv && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 font-medium">Active</span>}
            </label>
            {addToInv && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Material Category *">
                  <select className={inp()} value={invCategory} onChange={e => setInvCategory(e.target.value)}>
                    <option value="">Select category…</option>
                    {INV_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Store / Location *">
                  <select className={inp()} value={invStore} onChange={e => setInvStore(e.target.value)}>
                    <option value="">Select store…</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
                  </select>
                </Field>
                <div className="col-span-2 text-[11px] text-emerald-600/80 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  All line items will be auto-added to inventory on save under the selected category and store.
                </div>
              </div>
            )}
          </div>
          )}

          <TaxSummary lines={lines} form={form} setF={setF} />
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── PURCHASE ORDERS TAB ───────────────────────────────────────────────────────
function PurchaseOrdersTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankForm = () => ({ vendor_id: '', vendor_gstin: '', po_date: todayStr(), expected_delivery: '', delivery_address: '', notes: '', use_igst: false, discount_amount: 0, is_tax_invoice: true })
  const [form, setForm] = useState(blankForm())
  const [lines, setLines] = useState([blankLine()])
  const [editing, setEditing] = useState(null)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const closeModal = () => { setShowCreate(false); setEditing(null); setForm(blankForm()); setLines([blankLine()]) }

  const openCreate = () => { setEditing(null); setForm(blankForm()); setLines([blankLine()]); setShowCreate(true) }

  const openEdit = async (po) => {
    const { data: ld } = await supabase.from('po_line_items').select('*').eq('po_id', po.id).order('sort_order')
    setEditing(po)
    setForm({
      vendor_id: po.vendor_id || '', vendor_gstin: po.vendor_gstin || '',
      po_date: po.po_date || todayStr(), expected_delivery: po.expected_delivery || '',
      delivery_address: po.delivery_address || '', notes: po.notes || '',
      use_igst: (po.igst_amount || 0) > 0, discount_amount: po.discount_amount || 0,
      is_tax_invoice: po.is_tax_invoice !== false,
    })
    setLines(ld?.map(l => {
      const found = l.hsn_sac ? lookupHsnSac(l.hsn_sac) : null
      return {
        _id: Math.random().toString(36).slice(2),
        description: l.description || '', hsn_sac: l.hsn_sac || '',
        quantity: String(l.quantity || 1), unit: l.unit || 'nos',
        rate: String(l.rate || 0), amount: l.amount || 0,
        gst_rate: found ? found.gst : null,
        _gst_desc: found ? found.desc : null, _hsn_open: false,
      }
    }) || [blankLine()])
    setShowCreate(true)
  }

  const dlPDFpo = async (po) => {
    try { const { data: ld } = await supabase.from('po_line_items').select('*').eq('po_id', po.id).order('sort_order'); const verifyUrl = await createVerification(supabase, companyId, { docType: 'po', docNumber: po.po_number, docDate: po.po_date, partyName: po.vendor_name, amount: po.total_amount , companyName: company?.name || null, issuedByName: userProfile?.full_name || null }); await downloadPOPDF(po, ld||[], company, verifyUrl) } catch(e) { toast.error(e.message) }
  }
  const voidQRpo = async (po) => {
    if (!window.confirm(`Void QR code for ${po.po_number}?\nAny printed copy will immediately show as invalid.`)) return
    const r = await voidVerification(supabase, companyId, { docType: 'po', docNumber: po.po_number })
    if (!r || r.count === 0) toast('No active QR found.', { icon: 'ℹ️' })
    else toast.success(`QR voided — ${po.po_number} printed copies now show as invalid`)
  }
  const dlXLSXpo = async (po) => {
    try { const { data: ld } = await supabase.from('po_line_items').select('*').eq('po_id', po.id).order('sort_order'); downloadPOXLSX(po, ld||[], company) } catch(e) { toast.error(e.message) }
  }

  const deletePO = async (po) => {
    if (['received','partially_received'].includes(po.status)) return toast.error('Cannot delete a received PO. Void it instead.')
    if (!window.confirm(`Delete PO ${po.po_number}?`)) return
    try {
      await supabase.from('po_line_items').delete().eq('po_id', po.id)
      const { error } = await supabase.from('purchase_orders').delete().eq('id', po.id)
      if (error) throw error
      toast.success(`PO ${po.po_number} deleted`)
      qc.invalidateQueries(['purchase_orders', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const voidPO = async (po) => {
    if (!window.confirm(`Void PO ${po.po_number}?`)) return
    const { error } = await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', po.id)
    if (error) return toast.error(error.message)
    toast.success(`PO ${po.po_number} voided`)
    qc.invalidateQueries(['purchase_orders', companyId])
  }

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
      const { data } = await supabase.from('vendors').select('id, name, gstin').eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const isTax = form.is_tax_invoice !== false

  const save = async () => {
    if (!form.vendor_id) return toast.error('Select a vendor')
    if (isTax && !form.vendor_gstin.trim()) return toast.error('Vendor GSTIN is required for Tax PO')
    if (lines.every(l => !l.description.trim())) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      const validLines = lines.filter(l => l.description.trim())
      const { subtotal, taxable, cgst_amt, sgst_amt, igst_amt, total } = calcTotalFromLines(form, validLines)
      const vendor = vendors.find(v => v.id === form.vendor_id)

      if (editing) {
        // ── UPDATE ──
        const { error } = await supabase.from('purchase_orders').update({
          vendor_id: form.vendor_id, vendor_name: vendor?.name || '',
          po_date: form.po_date, expected_delivery: form.expected_delivery || null,
          delivery_address: form.delivery_address || null,
          subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
          cgst_rate: 0, sgst_rate: 0, igst_rate: 0,
          cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
          total_amount: total, notes: form.notes || null,
        }).eq('id', editing.id)
        if (error) throw error
        await supabase.from('po_line_items').delete().eq('po_id', editing.id)
        const updItems = validLines.map((l, i) => ({
          po_id: editing.id, description: l.description.trim(), hsn_sac: l.hsn_sac?.trim() || null,
          quantity: parseFloat(l.quantity) || 1, unit: l.unit,
          rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
        }))
        if (updItems.length > 0) { const { error: le } = await supabase.from('po_line_items').insert(updItems); if (le) throw le }
        toast.success(`PO ${editing.po_number} updated`)
        closeModal()
        qc.invalidateQueries(['purchase_orders', companyId])
        return
      }

      // ── CREATE ──
      const id = crypto.randomUUID()
      const poNum = await nextDocNumber(companyId, 'po').catch(() => `PO-${Date.now()}`)
      const { error } = await supabase.from('purchase_orders').insert({
        id, company_id: companyId, po_number: poNum,
        vendor_id: form.vendor_id, vendor_name: vendor?.name || '',
        po_date: form.po_date, expected_delivery: form.expected_delivery || null,
        delivery_address: form.delivery_address || null,
        subtotal, discount_amount: parseFloat(form.discount_amount) || 0, taxable_amount: taxable,
        cgst_rate: 0, sgst_rate: 0, igst_rate: 0,
        cgst_amount: cgst_amt, sgst_amount: sgst_amt, igst_amount: igst_amt,
        total_amount: total, status: 'confirmed', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      const items = validLines.map((l, i) => ({
        po_id: id, description: l.description.trim(), hsn_sac: l.hsn_sac.trim() || null,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit,
        rate: parseFloat(l.rate) || 0, amount: l.amount, sort_order: i,
      }))
      if (items.length > 0) { const { error: le } = await supabase.from('po_line_items').insert(items); if (le) throw le }
      toast.success(`Purchase Order ${poNum} created`)
      closeModal()
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
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> New PO</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : pos.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ShoppingCart className="w-10 h-10 text-slate-700" /><p>No purchase orders yet</p></div>
        : <div className="space-y-2">
          {pos.map(p => (
            <div key={p.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center"><p className="text-xs font-mono text-primary-500">{p.po_number}</p><StatusBadge status={p.status} /></div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{p.vendor_name || p.vendors?.vendor_name}</p>
                  {p.expected_delivery && <p className="text-xs text-slate-500">Delivery: {fmtDate(p.expected_delivery)}</p>}
                </div>
                <p className="text-lg font-black text-slate-100 shrink-0">{fmtINR(p.total_amount)}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{fmtDate(p.po_date)}</p>
                <div className="flex items-center gap-1">
                  {p.status === 'confirmed' && (
                    <>
                      <button onClick={() => updateStatus(p.id, 'partially_received')} className="text-xs px-2 py-1 rounded-lg border border-yellow-700/40 text-yellow-400 hover:bg-yellow-900/20">Partial Receipt</button>
                      <button onClick={() => updateStatus(p.id, 'received')} className="text-xs px-2 py-1 rounded-lg border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20">Received</button>
                    </>
                  )}
                  {!['received','cancelled'].includes(p.status) && <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>}
                  {!['received','cancelled'].includes(p.status) && <button onClick={() => voidPO(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-900/20" title="Void"><Ban className="w-3.5 h-3.5" /></button>}
                  {p.status !== 'received' && <button onClick={() => deletePO(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => voidQRpo(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20" title="Void QR Code"><ShieldOff className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlPDFpo(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => dlXLSXpo(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={editing ? `Edit PO · ${editing.po_number}` : 'New Purchase Order'} onClose={closeModal} wide
          footer={<><button onClick={closeModal} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update PO' : 'Create PO'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Vendor *">
              <select className={inp()} value={form.vendor_id} onChange={e => {
                const v = vendors.find(x => x.id === e.target.value)
                setForm(p => ({ ...p, vendor_id: e.target.value, vendor_gstin: v?.gstin || '' }))
              }}>
                <option value="">-- Select vendor --</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
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
          <LineItemsEditor lines={lines} setLines={setLines} isTax={isTax} />
          <TaxSummary lines={lines} form={form} setF={setF} />
          <Field label="Notes"><textarea className={inp()} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── VENDOR CREDITS TAB ────────────────────────────────────────────────────────
function VendorCreditsTab({ companyId, session }) {
  const qc = useQueryClient()
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ vendor_id: '', cn_date: todayStr(), reason: '', amount: '', notes: '' })
  const [editing, setEditing] = useState(null)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const closeModal = () => { setShowCreate(false); setEditing(null); setForm({ vendor_id: '', cn_date: todayStr(), reason: '', amount: '', notes: '' }) }

  const openCreate = () => { setEditing(null); setForm({ vendor_id: '', cn_date: todayStr(), reason: '', amount: '', notes: '' }); setShowCreate(true) }

  const openEdit = (vc) => {
    setEditing(vc)
    setForm({ vendor_id: vc.vendor_id || '', cn_date: vc.cn_date || todayStr(), reason: vc.reason || '', amount: String(vc.total_amount || ''), notes: vc.notes || '' })
    setShowCreate(true)
  }

  const dlPDFvc = async (vc) => { try { const verifyUrl = await createVerification(supabase, companyId, { docType: 'vendor_credit', docNumber: vc.vc_number, docDate: vc.cn_date, partyName: vc.vendor_name, amount: vc.total_amount , companyName: company?.name || null, issuedByName: userProfile?.full_name || null }); await downloadVendorCreditPDF(vc, company, verifyUrl) } catch(e) { toast.error(e.message) } }
  const voidQRvc = async (vc) => {
    if (!window.confirm(`Void QR code for ${vc.vc_number}?\nAny printed copy will immediately show as invalid.`)) return
    const r = await voidVerification(supabase, companyId, { docType: 'vc', docNumber: vc.vc_number })
    if (!r || r.count === 0) toast('No active QR found.', { icon: 'ℹ️' })
    else toast.success(`QR voided — ${vc.vc_number} printed copies now show as invalid`)
  }

  const deleteVC = async (vc) => {
    if (vc.status === 'applied') return toast.error('Cannot delete an applied credit. Void it instead.')
    if (!window.confirm(`Delete Vendor Credit ${vc.vc_number}?`)) return
    try {
      const { error } = await supabase.from('vendor_credits').delete().eq('id', vc.id)
      if (error) throw error
      toast.success(`Vendor Credit ${vc.vc_number} deleted`)
      qc.invalidateQueries(['vendor_credits', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const voidVC = async (vc) => {
    if (!window.confirm(`Void Vendor Credit ${vc.vc_number}?`)) return
    const { error } = await supabase.from('vendor_credits').update({ status: 'cancelled' }).eq('id', vc.id)
    if (error) return toast.error(error.message)
    toast.success(`Vendor Credit ${vc.vc_number} voided`)
    qc.invalidateQueries(['vendor_credits', companyId])
  }

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
      const { data } = await supabase.from('vendors').select('id, name').eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId && showCreate,
  })

  const save = async () => {
    if (!form.vendor_id) return toast.error('Select a vendor')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const vendor = vendors.find(v => v.id === form.vendor_id)
      if (editing) {
        const { error } = await supabase.from('vendor_credits').update({
          vendor_id: form.vendor_id, vendor_name: vendor?.name || '',
          cn_date: form.cn_date, reason: form.reason || null,
          total_amount: parseFloat(form.amount), notes: form.notes || null,
        }).eq('id', editing.id)
        if (error) throw error
        toast.success(`Vendor Credit ${editing.vc_number} updated`)
        closeModal(); qc.invalidateQueries(['vendor_credits', companyId])
        return
      }
      const vcNum = await nextDocNumber(companyId, 'vendor_credit').catch(() => `VC-${Date.now()}`)
      const { error } = await supabase.from('vendor_credits').insert({
        company_id: companyId, vc_number: vcNum, vendor_id: form.vendor_id,
        vendor_name: vendor?.name || '', cn_date: form.cn_date,
        reason: form.reason || null, total_amount: parseFloat(form.amount),
        status: 'issued', notes: form.notes || null, created_by: session.user.id,
      })
      if (error) throw error
      toast.success(`Vendor Credit ${vcNum} issued`)
      closeModal()
      qc.invalidateQueries(['vendor_credits', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{credits.length} vendor credits</span>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> New Vendor Credit</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : credits.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><RefreshCcw className="w-10 h-10 text-slate-700" /><p>No vendor credits yet</p></div>
        : <div className="space-y-2">
          {credits.map(vc => (
            <div key={vc.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex gap-2 items-center"><p className="text-xs font-mono text-primary-500">{vc.vc_number}</p><StatusBadge status={vc.status} /></div>
                  <p className="font-semibold text-slate-100 text-sm mt-0.5">{vc.vendor_name || vc.vendors?.vendor_name}</p>
                  {vc.reason && <p className="text-xs text-slate-500">{vc.reason}</p>}
                  <p className="text-xs text-slate-500">{fmtDate(vc.cn_date)}</p>
                </div>
                <p className="text-lg font-black text-emerald-400 shrink-0">+{fmtINR(vc.total_amount)}</p>
              </div>
              <div className="flex justify-end gap-1 mt-2">
                {vc.status !== 'cancelled' && <button onClick={() => openEdit(vc)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>}
                {vc.status !== 'cancelled' && <button onClick={() => voidVC(vc)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-900/20" title="Void"><Ban className="w-3.5 h-3.5" /></button>}
                <button onClick={() => deleteVC(vc)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => voidQRvc(vc)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20" title="Void QR Code"><ShieldOff className="w-3.5 h-3.5" /></button>
                <button onClick={() => dlPDFvc(vc)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={editing ? `Edit Vendor Credit · ${editing.vc_number}` : 'New Vendor Credit'} onClose={closeModal}
          footer={<><button onClick={closeModal} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update Credit' : 'Issue Credit'}</button></>}>
          <Field label="Vendor *">
            <select className={inp()} value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)}>
              <option value="">-- Select vendor --</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
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
  const { company, userProfile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ vendor_id: '', amount: '', payment_date: todayStr(), payment_mode: 'bank', bank_reference: '', notes: '' })
  const [billId, setBillId] = useState('')
  const [editing, setEditing] = useState(null)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const closeModal = () => { setShowCreate(false); setEditing(null); setForm({ vendor_id: '', amount: '', payment_date: todayStr(), payment_mode: 'bank', bank_reference: '', notes: '' }); setBillId('') }

  const openCreate = () => { setEditing(null); setForm({ vendor_id: '', amount: '', payment_date: todayStr(), payment_mode: 'bank', bank_reference: '', notes: '' }); setBillId(''); setShowCreate(true) }

  const openEdit = (p) => {
    setEditing(p)
    setForm({ vendor_id: p.vendor_id || '', amount: String(p.amount || ''), payment_date: p.payment_date || todayStr(), payment_mode: p.payment_mode || 'bank', bank_reference: p.bank_reference || '', notes: p.notes || '' })
    setBillId(p.bill_id || '')
    setShowCreate(true)
  }

  // Recompute bill balance from all payments — call after any create/update/delete
  const recomputeBillBalance = async (bId) => {
    if (!bId) return
    const [{ data: pays }, { data: bill }] = await Promise.all([
      supabase.from('payments_made').select('amount').eq('bill_id', bId),
      supabase.from('bills').select('total_amount').eq('id', bId).single(),
    ])
    const totalPaid = (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0)
    const balance   = Math.max(0, (bill?.total_amount || 0) - totalPaid)
    await supabase.from('bills').update({
      paid_amount: totalPaid,
      balance_due: balance,
      status: balance <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'pending',
    }).eq('id', bId)
  }

  const deletePayment = async (p) => {
    if (!window.confirm(`Delete Payment ${p.payment_number}?`)) return
    try {
      const linkedBillId = p.bill_id
      // Remove ledger entry first
      await supabase.from('account_transactions').delete().eq('reference_type', 'payment_made').eq('reference_id', p.id)
      const { error } = await supabase.from('payments_made').delete().eq('id', p.id)
      if (error) throw error
      // Revert bill balance if this payment was linked to a bill
      if (linkedBillId) await recomputeBillBalance(linkedBillId)
      toast.success(`Payment ${p.payment_number} deleted`)
      qc.invalidateQueries(['payments_made', companyId]); qc.invalidateQueries(['bills', companyId])
      qc.invalidateQueries(['ledger', companyId])
    } catch (e) { toast.error(e.message) }
  }

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments_made', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('payments_made').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name').eq('company_id', companyId).order('name')
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
  const MODES = ['cash','bank','upi','cheque','neft','rtgs']

  const save = async () => {
    if (!form.vendor_id) return toast.error('Select a vendor')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const amt = parseFloat(form.amount)
      const vendor = vendors.find(v => v.id === form.vendor_id)
      if (editing) {
        const prevBillId = editing.bill_id   // in case the bill link changed
        const { error } = await supabase.from('payments_made').update({
          vendor_id: form.vendor_id, vendor_name: vendor?.name || '',
          payment_date: form.payment_date, bill_id: billId || null,
          amount: amt, payment_mode: form.payment_mode,
          bank_reference: form.bank_reference || null, notes: form.notes || null,
        }).eq('id', editing.id)
        if (error) throw error
        // Keep ledger in sync
        await supabase.from('account_transactions').update({
          txn_date: form.payment_date, amount: amt,
          description: `Payment made — ${editing.payment_number} (${vendor?.name || ''})`,
          payment_mode: form.payment_mode, bank_reference: form.bank_reference || null,
          notes: form.notes || null,
        }).eq('reference_type', 'payment_made').eq('reference_id', editing.id)
        // Recompute bill balances (handles bill change, amount change)
        if (prevBillId)       await recomputeBillBalance(prevBillId)
        if (billId && billId !== prevBillId) await recomputeBillBalance(billId)
        toast.success(`Payment ${editing.payment_number} updated`)
        closeModal()
        qc.invalidateQueries(['payments_made', companyId]); qc.invalidateQueries(['bills', companyId])
        qc.invalidateQueries(['ledger', companyId])
        return
      }
      const pmNum = await nextDocNumber(companyId, 'payment_made').catch(() => `PM-${Date.now()}`)
      const { data: pm, error } = await supabase.from('payments_made').insert({
        company_id: companyId, payment_number: pmNum,
        payment_date: form.payment_date, vendor_id: form.vendor_id,
        vendor_name: vendor?.name || '', bill_id: billId || null,
        amount: amt, payment_mode: form.payment_mode,
        bank_reference: form.bank_reference || null, notes: form.notes || null,
        created_by: session.user.id,
      }).select().single()
      if (error) throw error
      // Write to ledger immediately
      await supabase.from('account_transactions').insert({
        company_id: companyId, txn_date: form.payment_date, type: 'expense',
        description: `Payment made — ${pmNum} (${vendor?.name || ''})`,
        amount: amt, payment_mode: form.payment_mode,
        bank_reference: form.bank_reference || null,
        reference_type: 'payment_made', reference_id: pm.id,
        notes: form.notes || null, created_by: session.user.id,
      })
      // Update linked bill's balance / status
      if (billId) await recomputeBillBalance(billId)
      toast.success(`Payment ${pmNum} recorded — ${fmtINR(form.amount)}`)
      closeModal()
      qc.invalidateQueries(['payments_made', companyId])
      qc.invalidateQueries(['bills', companyId])
      qc.invalidateQueries(['ledger', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="bg-dark-800 rounded-xl px-3 py-2 text-xs"><span className="text-slate-500">Total Paid Out </span><span className="font-bold text-red-400">{fmtINR(totalPaid)}</span></div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Record Payment</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : payments.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ArrowUpCircle className="w-10 h-10 text-slate-700" /><p>No payments made yet</p></div>
        : <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-primary-500">{p.payment_number}</p>
                  <p className="font-semibold text-slate-100 text-sm">{p.vendor_name || p.vendors?.vendor_name}</p>
                  <p className="text-xs text-slate-500">{fmtDate(p.payment_date)} · {p.payment_mode?.toUpperCase()}{p.bank_reference ? ` · ${p.bank_reference}` : ''}</p>
                </div>
                <p className="text-xl font-black text-red-400 shrink-0">{fmtINR(p.amount)}</p>
              </div>
              <div className="flex justify-end gap-1 mt-2">
                <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => deletePayment(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => { try { downloadPaymentMadePDF(p, company) } catch(e) { toast.error(e.message) } }} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20" title="Download PDF"><FileDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => { try { downloadPaymentMadeXLSX(p, company) } catch(e) { toast.error(e.message) } }} className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 hover:bg-teal-900/20" title="Export Excel"><Sheet className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>}
      </div>
      {showCreate && (
        <Modal title={editing ? `Edit Payment · ${editing.payment_number}` : 'Record Payment'} onClose={closeModal}
          footer={<><button onClick={closeModal} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update Payment' : 'Record Payment'}</button></>}>
          <Field label="Vendor *">
            <select className={inp()} value={form.vendor_id} onChange={e => { setF('vendor_id', e.target.value); setBillId('') }}>
              <option value="">-- Select vendor --</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
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
