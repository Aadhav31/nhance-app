import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  Search, Plus, Sheet, Loader2, ChevronDown, ChevronRight,
  Receipt, ShoppingCart, Users, Wrench, CreditCard, Lock,
  Pencil, Trash2, X, TrendingDown, ExternalLink, Image,
  Package, Fuel, Car, AlertCircle,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtINR  = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const today   = () => new Date().toISOString().split('T')[0]
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
const inp = (cls = '') => `w-full px-3 py-2 rounded-lg border border-dark-600 bg-dark-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${cls}`

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── type definitions ──────────────────────────────────────────────────────────
const TYPE_CFG = {
  field:       { label: 'Field Expense',  color: 'bg-emerald-500/15 text-emerald-300 border-emerald-700/50', dot: 'bg-emerald-400', Icon: Receipt },
  purchase:    { label: 'Purchase',       color: 'bg-blue-500/15 text-blue-300 border-blue-700/50',          dot: 'bg-blue-400',    Icon: ShoppingCart },
  payroll:     { label: 'Salary',         color: 'bg-purple-500/15 text-purple-300 border-purple-700/50',    dot: 'bg-purple-400',  Icon: Users },
  overhead:    { label: 'Overhead',       color: 'bg-orange-500/15 text-orange-300 border-orange-700/50',    dot: 'bg-orange-400',  Icon: Wrench },
  bill_payment:{ label: 'Bill Payment',   color: 'bg-cyan-500/15 text-cyan-300 border-cyan-700/50',          dot: 'bg-cyan-400',    Icon: CreditCard },
  fixed:       { label: 'Fixed Expense',  color: 'bg-yellow-500/15 text-yellow-300 border-yellow-700/50',    dot: 'bg-yellow-400',  Icon: Lock },
}

const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'field',       label: 'Field' },
  { key: 'purchase',    label: 'Purchase' },
  { key: 'payroll',     label: 'Salary' },
  { key: 'overhead',    label: 'Overhead' },
  { key: 'bill_payment',label: 'Bill Payments' },
  { key: 'fixed',       label: 'Fixed' },
]

const FIELD_CATS = {
  fuel:         { label: 'Fuel',         Icon: Fuel },
  maintenance:  { label: 'Maintenance',  Icon: Wrench },
  labor:        { label: 'Labour',       Icon: Users },
  lubricants:   { label: 'Lubricants',   Icon: Package },
  tyre:         { label: 'Tyre',         Icon: Car },
  spare_parts:  { label: 'Spare Parts',  Icon: Package },
  misc:         { label: 'Misc',         Icon: AlertCircle },
}

const MODES = ['cash','bank','upi','cheque','neft','rtgs']

// ── small shared components ───────────────────────────────────────────────────
function TypeBadge({ type }) {
  const c = TYPE_CFG[type] || TYPE_CFG.purchase
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${c.color}`}>
      <c.Icon className="w-2.5 h-2.5" />{c.label}
    </span>
  )
}

function ScopeBadge({ scope }) {
  if (!scope) return null
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
      scope === 'equipment' ? 'bg-blue-900/40 text-blue-300' : 'bg-slate-700 text-slate-400'
    }`}>
      {scope === 'equipment' ? 'Machine' : 'Admin'}
    </span>
  )
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="text-slate-500 text-xs w-28 shrink-0">{label}</span>
      <span className="text-slate-200 text-xs break-all">{value}</span>
    </div>
  )
}

// ── edit modal (purchase / overhead / manual) ─────────────────────────────────
function EditExpenseModal({ entry, onClose, onSaved }) {
  const [form, setForm] = useState({
    expense_date:   entry.date,
    description:    entry.raw.description || '',
    vendor_name:    entry.raw.vendor_name || '',
    amount:         String(entry.raw.amount || ''),
    gst_amount:     String(entry.raw.gst_amount || ''),
    payment_mode:   entry.raw.payment_mode || 'cash',
    bank_reference: entry.raw.bank_reference || '',
    category:       entry.raw.category || 'misc',
    expense_scope:  entry.raw.expense_scope || 'administrative',
    equipment_id:   entry.raw.equipment_id || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const { error } = await supabase.from('expenses').update({
        expense_date:   form.expense_date,
        description:    form.description.trim() || null,
        vendor_name:    form.vendor_name.trim()  || null,
        amount:         amt,
        total_amount:   amt,
        gst_amount:     parseFloat(form.gst_amount) || 0,
        payment_mode:   form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
        category:       form.category,
        expense_scope:  form.expense_scope,
        equipment_id:   form.expense_scope === 'equipment' ? (form.equipment_id || null) : null,
      }).eq('id', entry.source_id)
      if (error) throw error
      toast.success('Expense updated')
      onSaved()
      onClose()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-dark-700 sticky top-0 bg-dark-800">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-100 text-sm">Edit Expense</p>
            <TypeBadge type={entry.type} />
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-slate-400 mb-1">Date</p>
              <input type="date" className={inp()} value={form.expense_date} onChange={e => set('expense_date', e.target.value)} /></div>
            <div><p className="text-xs text-slate-400 mb-1">Amount (₹)</p>
              <input type="number" className={inp()} value={form.amount} onChange={e => set('amount', e.target.value)} step="0.01" /></div>
          </div>
          <div><p className="text-xs text-slate-400 mb-1">Vendor / Payee</p>
            <input className={inp()} value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} /></div>
          <div><p className="text-xs text-slate-400 mb-1">Description</p>
            <input className={inp()} value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-slate-400 mb-1">GST Amount (₹)</p>
              <input type="number" className={inp()} value={form.gst_amount} onChange={e => set('gst_amount', e.target.value)} step="0.01" /></div>
            <div><p className="text-xs text-slate-400 mb-1">Payment Mode</p>
              <select className={inp()} value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select></div>
          </div>
          <div><p className="text-xs text-slate-400 mb-1">Ref / Cheque / UTR</p>
            <input className={inp()} value={form.bank_reference} onChange={e => set('bank_reference', e.target.value)} /></div>
          <div className="flex gap-2">
            <button onClick={() => set('expense_scope','equipment')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${form.expense_scope==='equipment' ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'border-dark-600 text-slate-500'}`}>
              Machine
            </button>
            <button onClick={() => { set('expense_scope','administrative'); set('equipment_id','') }}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${form.expense_scope==='administrative' ? 'bg-slate-600/30 border-slate-500 text-slate-300' : 'border-dark-600 text-slate-500'}`}>
              Administrative
            </button>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t border-dark-700">
          <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── field expense edit modal ──────────────────────────────────────────────────
function EditFieldModal({ entry, onClose, onSaved }) {
  const [form, setForm] = useState({
    expense_date: entry.date,
    description:  entry.raw.description || '',
    payee_name:   entry.raw.payee_name  || '',
    amount:       String(entry.raw.amount || ''),
    payment_mode: entry.raw.payment_mode || 'cash',
    transaction_ref: entry.raw.transaction_ref || '',
    category:     entry.raw.category || 'misc',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const { error } = await supabase.from('field_expenses').update({
        expense_date:    form.expense_date,
        description:     form.description.trim() || null,
        payee_name:      form.payee_name.trim()  || null,
        amount:          amt,
        payment_mode:    form.payment_mode,
        transaction_ref: form.transaction_ref.trim() || null,
        category:        form.category,
      }).eq('id', entry.source_id)
      if (error) throw error
      // also sync to expenses
      await supabase.from('expenses').update({
        expense_date: form.expense_date,
        description:  form.description.trim() || form.payee_name.trim() || null,
        vendor_name:  form.payee_name.trim()  || null,
        amount:       amt,
        total_amount: amt,
        payment_mode: form.payment_mode,
        bank_reference: form.transaction_ref.trim() || null,
        category:     form.category,
      }).eq('field_expense_id', entry.source_id)
      toast.success('Field expense updated')
      onSaved()
      onClose()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-100 text-sm">Edit Field Expense</p>
            <TypeBadge type="field" />
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-slate-400 mb-1">Date</p>
              <input type="date" className={inp()} value={form.expense_date} onChange={e => set('expense_date', e.target.value)} /></div>
            <div><p className="text-xs text-slate-400 mb-1">Amount (₹)</p>
              <input type="number" className={inp()} value={form.amount} onChange={e => set('amount', e.target.value)} step="0.01" /></div>
          </div>
          <div><p className="text-xs text-slate-400 mb-1">Category</p>
            <select className={inp()} value={form.category} onChange={e => set('category', e.target.value)}>
              {Object.entries(FIELD_CATS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div><p className="text-xs text-slate-400 mb-1">Payee</p>
            <input className={inp()} value={form.payee_name} onChange={e => set('payee_name', e.target.value)} /></div>
          <div><p className="text-xs text-slate-400 mb-1">Description</p>
            <input className={inp()} value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-slate-400 mb-1">Payment Mode</p>
              <select className={inp()} value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select></div>
            <div><p className="text-xs text-slate-400 mb-1">Ref / UTR</p>
              <input className={inp()} value={form.transaction_ref} onChange={e => set('transaction_ref', e.target.value)} /></div>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t border-dark-700">
          <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── expanded detail panel ─────────────────────────────────────────────────────
function ExpandedDetail({ entry, onNavigate }) {
  const r = entry.raw
  const navLabel = {
    field:       'Open Field Expenses',
    purchase:    'Open Purchase',
    payroll:     'Open HR / Payroll',
    overhead:    'Open Accounts',
    bill_payment:'Open Purchase → Payments',
    fixed:       'Open Accounts → Fixed',
  }[entry.type]
  const navKey = {
    field: 'fieldexpense', purchase: 'purchase', payroll: 'hr',
    overhead: 'accounts', bill_payment: 'purchase', fixed: 'accounts',
  }[entry.type]

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="bg-dark-900/60 border border-dark-700 rounded-xl p-3 space-y-1.5">
        {/* Field-specific */}
        {entry.type === 'field' && (<>
          <DetailRow label="Equipment"    value={r.equipment_name} />
          <DetailRow label="Scope"        value={r.expense_scope === 'equipment' ? 'Machine' : 'Administrative'} />
          <DetailRow label="Category"     value={FIELD_CATS[r.category]?.label || r.category} />
          <DetailRow label="Payee"        value={r.payee_name} />
          <DetailRow label="Description"  value={r.description} />
          <DetailRow label="Payment Mode" value={r.payment_mode?.toUpperCase()} />
          <DetailRow label="Ref / UTR"    value={r.transaction_ref} />
          {r.bill_photo_url && (
            <div className="flex gap-2 items-center">
              <span className="text-slate-500 text-xs w-28">Bill Photo</span>
              <a href={r.bill_photo_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                <Image className="w-3 h-3" /> View
              </a>
            </div>
          )}
        </>)}

        {/* Purchase-specific */}
        {entry.type === 'purchase' && (<>
          <DetailRow label="Vendor"       value={r.vendor_name} />
          <DetailRow label="Bill No."     value={r.bill_number} />
          <DetailRow label="Description"  value={r.description} />
          <DetailRow label="Amount"       value={fmtINR(r.amount)} />
          <DetailRow label="GST"          value={r.gst_amount > 0 ? fmtINR(r.gst_amount) : null} />
          <DetailRow label="Total"        value={r.total_amount > r.amount ? fmtINR(r.total_amount) : null} />
          <DetailRow label="Payment Mode" value={r.payment_mode?.toUpperCase()} />
          <DetailRow label="Bank Ref"     value={r.bank_reference} />
          <DetailRow label="Item"         value={r.inv_item_name} />
          {r.inv_item_name && <DetailRow label="Qty / Unit" value={`${r.inv_quantity || ''} ${r.inv_unit || ''}`.trim()} />}
          {r.bill_photo_url && (
            <div className="flex gap-2 items-center">
              <span className="text-slate-500 text-xs w-28">Bill Photo</span>
              <a href={r.bill_photo_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                <Image className="w-3 h-3" /> View
              </a>
            </div>
          )}
        </>)}

        {/* Payroll-specific */}
        {entry.type === 'payroll' && (<>
          <DetailRow label="Employee"     value={r.vendor_name} />
          <DetailRow label="Description"  value={r.description} />
          <DetailRow label="Ref"          value={r.reference_number} />
          <DetailRow label="Equipment"    value={r.equipment_id ? '(linked)' : 'Administrative'} />
          <DetailRow label="Payment Mode" value={r.payment_mode?.toUpperCase()} />
        </>)}

        {/* Overhead-specific */}
        {entry.type === 'overhead' && (<>
          <DetailRow label="Vendor / Payee" value={r.vendor_name} />
          <DetailRow label="Description"  value={r.description} />
          <DetailRow label="Category"     value={r.category} />
          <DetailRow label="Scope"        value={r.expense_scope === 'equipment' ? 'Machine' : 'Administrative'} />
          <DetailRow label="Payment Mode" value={r.payment_mode?.toUpperCase()} />
          <DetailRow label="Bank Ref"     value={r.bank_reference} />
        </>)}

        {/* Bill Payment-specific */}
        {entry.type === 'bill_payment' && (<>
          <DetailRow label="Vendor"        value={r.vendor_name} />
          <DetailRow label="Payment No."   value={r.payment_number} />
          <DetailRow label="Bill No."      value={r.bills?.bill_number} />
          <DetailRow label="Bill Total"    value={r.bills?.total_amount ? fmtINR(r.bills.total_amount) : null} />
          <DetailRow label="Payment Mode"  value={r.payment_mode?.toUpperCase()} />
          <DetailRow label="Bank Ref"      value={r.bank_reference} />
          <DetailRow label="Notes"         value={r.notes} />
        </>)}

        {/* Fixed-specific */}
        {entry.type === 'fixed' && (<>
          <DetailRow label="Name"          value={r.fixed_expenses?.name} />
          <DetailRow label="Category"      value={r.fixed_expenses?.category} />
          <DetailRow label="Payee"         value={r.fixed_expenses?.payee_name} />
          <DetailRow label="Description"   value={r.fixed_expenses?.description} />
          <DetailRow label="Period"        value={r.period_month ? `${MONTHS_SHORT[(r.period_month % 100) - 1]} ${Math.floor(r.period_month / 100)}` : null} />
          <DetailRow label="Status"        value={r.status} />
          <DetailRow label="Paid Date"     value={r.paid_date ? fmtDate(r.paid_date) : null} />
          <DetailRow label="Due Date"      value={r.due_date ? fmtDate(r.due_date) : null} />
          <DetailRow label="Payment Mode"  value={r.payment_mode?.toUpperCase()} />
          <DetailRow label="Ref"           value={r.transaction_ref} />
        </>)}

        {/* Navigate to source */}
        {onNavigate && navKey && (
          <button onClick={() => onNavigate(navKey)}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors">
            <ExternalLink className="w-3 h-3" /> {navLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage({ onNavigate }) {
  const { companyId, session } = useAuth()
  const qc = useQueryClient()

  const [tab,       setTab]       = useState('all')
  const [search,    setSearch]    = useState('')
  const [dateFrom,  setFrom]      = useState(monthStart())
  const [dateTo,    setTo]        = useState(today())
  const [modeFilter,setMode]      = useState('')
  const [expanded,  setExpanded]  = useState(null)
  const [editing,   setEditing]   = useState(null)

  // ── queries ────────────────────────────────────────────────────────────────
  // 1. Field expenses — queried directly from field_expenses table
  const { data: fieldExpenses = [], isLoading: loadField } = useQuery({
    queryKey: ['fe_unified', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('field_expenses')
        .select('*')
        .eq('company_id', companyId)
        .order('expense_date', { ascending: false })
        .limit(500)
      return data || []
    },
    enabled: !!companyId,
  })

  // 2. Non-field expenses (purchase / payroll / manual/overhead)
  const { data: coreExpenses = [], isLoading: loadCore } = useQuery({
    queryKey: ['core_expenses_unified', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('expenses')
        .select('*')
        .eq('company_id', companyId)
        .is('field_expense_id', null)   // exclude synced field_expenses rows (they have this set)
        .order('expense_date', { ascending: false })
        .limit(500)
      return data || []
    },
    enabled: !!companyId,
  })

  // 3. Bill payments
  const { data: billPayments = [], isLoading: loadPay } = useQuery({
    queryKey: ['pay_unified', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('payments_made')
        .select('*, bills(bill_number, total_amount, vendor_name)')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: false })
        .limit(500)
      return data || []
    },
    enabled: !!companyId,
  })

  // 4. Fixed expense payments
  const { data: fixedPayments = [], isLoading: loadFixed } = useQuery({
    queryKey: ['fixed_unified', companyId],
    queryFn: async () => {
      // Get all fixed_expenses for this company, then their payments
      const { data: templates } = await supabase.from('fixed_expenses')
        .select('id')
        .eq('company_id', companyId)
      if (!templates?.length) return []
      const ids = templates.map(t => t.id)
      const { data } = await supabase.from('fixed_expense_payments')
        .select('*, fixed_expenses(name, category, payee_name, description, amount, frequency)')
        .in('fixed_expense_id', ids)
        .order('due_date', { ascending: false })
        .limit(300)
      return data || []
    },
    enabled: !!companyId,
  })

  const isLoading = loadField || loadCore || loadPay || loadFixed

  // ── normalise → unified entries ────────────────────────────────────────────
  const allEntries = useMemo(() => {
    const rows = []

    // Field expenses
    fieldExpenses.forEach(r => {
      rows.push({
        _key:      `fe-${r.id}`,
        source_id: r.id,
        type:      'field',
        date:      r.expense_date,
        amount:    Number(r.amount || 0),
        mode:      r.payment_mode || 'cash',
        // display fields
        title:     r.description || r.payee_name || FIELD_CATS[r.category]?.label || 'Field Expense',
        sub1:      r.payee_name,
        sub2:      r.equipment_name,
        ref:       r.transaction_ref,
        hasBillPhoto: !!r.bill_photo_url,
        scope:     r.expense_scope,
        catLabel:  FIELD_CATS[r.category]?.label,
        // actions
        canEdit:   true,
        canDelete: true,
        editModal: 'field',
        raw: r,
      })
    })

    // Core expenses (purchase / payroll / overhead)
    coreExpenses.forEach(r => {
      let type = 'overhead'
      if (r.source === 'purchase')  type = 'purchase'
      else if (r.source === 'payroll') type = 'payroll'
      // source === 'manual' → overhead

      rows.push({
        _key:      `exp-${r.id}`,
        source_id: r.id,
        type,
        date:      r.expense_date,
        amount:    Number(r.amount || 0),
        mode:      r.payment_mode || 'cash',
        title:     r.description || r.vendor_name || '—',
        sub1:      r.vendor_name,
        sub2:      type === 'purchase'
          ? (r.bill_number || r.inv_item_name)
          : type === 'payroll'
            ? r.reference_number
            : (r.equipment?.name || null),
        ref:       r.bank_reference || r.reference_number || r.bill_number,
        hasBillPhoto: !!r.bill_photo_url,
        scope:     r.expense_scope,
        catLabel:  r.category,
        canEdit:   type !== 'payroll',
        canDelete: type !== 'payroll',
        editModal: 'expense',
        raw: r,
      })
    })

    // Bill payments
    billPayments.forEach(r => {
      rows.push({
        _key:      `pm-${r.id}`,
        source_id: r.id,
        type:      'bill_payment',
        date:      r.payment_date,
        amount:    Number(r.amount || 0),
        mode:      r.payment_mode || 'cash',
        title:     r.bills?.bill_number ? `Bill ${r.bills.bill_number}` : 'Bill Payment',
        sub1:      r.vendor_name || r.bills?.vendor_name,
        sub2:      r.payment_number,
        ref:       r.payment_number,
        hasBillPhoto: false,
        scope:     null,
        canEdit:   false,
        canDelete: false,
        raw: r,
      })
    })

    // Fixed payments
    fixedPayments.forEach(r => {
      const fe = r.fixed_expenses
      rows.push({
        _key:      `fx-${r.id}`,
        source_id: r.id,
        type:      'fixed',
        date:      r.paid_date || r.due_date,
        amount:    Number(r.amount || 0),
        mode:      r.payment_mode || 'cash',
        title:     fe?.name || 'Fixed Expense',
        sub1:      fe?.payee_name,
        sub2:      fe?.category,
        ref:       null,
        hasBillPhoto: false,
        scope:     null,
        canEdit:   false,
        canDelete: false,
        raw: r,
      })
    })

    return rows.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [fieldExpenses, coreExpenses, billPayments, fixedPayments])

  // ── filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allEntries.filter(e => {
      if (tab !== 'all' && e.type !== tab) return false
      if (dateFrom && e.date < dateFrom) return false
      if (dateTo   && e.date > dateTo)   return false
      if (modeFilter && e.mode !== modeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (![e.title, e.sub1, e.sub2, e.ref].filter(Boolean).join(' ').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allEntries, tab, dateFrom, dateTo, modeFilter, search])

  // ── totals per type ─────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = {}
    Object.keys(TYPE_CFG).forEach(k => { t[k] = 0 })
    filtered.forEach(e => { t[e.type] = (t[e.type] || 0) + e.amount })
    return t
  }, [filtered])

  const grandTotal = filtered.reduce((s, e) => s + e.amount, 0)

  // ── delete ──────────────────────────────────────────────────────────────────
  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete ₹${entry.amount.toLocaleString('en-IN')} expense?`)) return
    try {
      if (entry.type === 'field') {
        // Delete field_expense + its synced expenses row
        await supabase.from('expenses').delete().eq('field_expense_id', entry.source_id)
        const { error } = await supabase.from('field_expenses').delete().eq('id', entry.source_id)
        if (error) throw error
        qc.invalidateQueries(['fe_unified', companyId])
      } else {
        const { error } = await supabase.from('expenses').delete().eq('id', entry.source_id)
        if (error) throw error
        qc.invalidateQueries(['core_expenses_unified', companyId])
      }
      toast.success('Deleted')
      setExpanded(null)
    } catch (e) { toast.error(e.message) }
  }

  // ── export ──────────────────────────────────────────────────────────────────
  const exportXLSX = () => {
    const rows = filtered.map(e => ({
      Date:          e.date,
      Type:          TYPE_CFG[e.type]?.label,
      Title:         e.title,
      Payee:         e.sub1 || '',
      Detail:        e.sub2 || '',
      'Amount (₹)':  e.amount,
      Mode:          e.mode?.toUpperCase(),
      Reference:     e.ref || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'All Expenses')
    XLSX.writeFile(wb, `Expenses_${dateFrom}_to_${dateTo}.xlsx`)
    toast.success('Excel downloaded')
  }

  const CREATE_OPTIONS = [
    { label: '+ Field Expense',      nav: 'fieldexpense' },
    { label: '+ Purchase Expense',   nav: 'purchase' },
    { label: '+ Salary / Payroll',   nav: 'hr' },
    { label: '+ Overhead / Manual',  nav: 'accounts' },
    { label: '+ Fixed Expense',      nav: 'accounts' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── header ── */}
      <div className="px-6 py-4 border-b border-dark-800 shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-600/20 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Expenses</h1>
              <p className="text-xs text-slate-500">All categories unified — field, purchase, payroll, overhead, bill payments, fixed</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportXLSX} className="btn-ghost text-xs gap-1.5">
              <Sheet className="w-3.5 h-3.5" /> Export Excel
            </button>
            <div className="relative group">
              <button className="btn-primary gap-1 text-sm">
                <Plus className="w-4 h-4" /> Add <ChevronDown className="w-3 h-3" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-52 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl z-30 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                {CREATE_OPTIONS.map(o => (
                  <button key={o.label} onClick={() => onNavigate?.(o.nav)}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-700 hover:text-slate-100 first:rounded-t-xl last:rounded-b-xl transition-colors">
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── summary cards ── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Object.entries(TYPE_CFG).map(([key, cfg]) => (
            <button key={key} onClick={() => setTab(tab === key ? 'all' : key)}
              className={`rounded-xl p-3 border text-left transition-all ${
                tab === key ? cfg.color : 'bg-dark-800/80 border-dark-700 hover:border-dark-600'
              }`}>
              <cfg.Icon className="w-3.5 h-3.5 mb-1 opacity-60" />
              <p className="text-[10px] text-slate-500 truncate">{cfg.label}</p>
              <p className="text-sm font-bold text-slate-100">{fmtINR(totals[key] || 0)}</p>
            </button>
          ))}
        </div>

        {/* ── filters ── */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-dark-800 border border-dark-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Search name, payee, ref…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <input type="date" value={dateFrom} onChange={e => setFrom(e.target.value)}
            className="text-xs px-2 py-2 rounded-lg bg-dark-800 border border-dark-700 text-slate-300 focus:outline-none" />
          <span className="text-slate-600 text-xs self-center">to</span>
          <input type="date" value={dateTo} onChange={e => setTo(e.target.value)}
            className="text-xs px-2 py-2 rounded-lg bg-dark-800 border border-dark-700 text-slate-300 focus:outline-none" />
          <select value={modeFilter} onChange={e => setMode(e.target.value)}
            className="text-xs px-2 py-2 rounded-lg bg-dark-800 border border-dark-700 text-slate-300 focus:outline-none">
            <option value="">All Modes</option>
            {MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
          {(search || modeFilter) && (
            <button onClick={() => { setSearch(''); setMode('') }}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* ── tabs ── */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.key ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-dark-800'
              }`}>
              {t.label}
              {t.key !== 'all' && totals[t.key] > 0 && (
                <span className="ml-1.5 text-[10px] opacity-70">{fmtINR(totals[t.key])}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── total bar ── */}
      <div className="px-6 py-2 border-b border-dark-800 shrink-0 flex items-center justify-between bg-dark-900/30">
        <p className="text-xs text-slate-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        <p className="text-sm font-black text-red-400">{fmtINR(grandTotal)}</p>
      </div>

      {/* ── list ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-2 text-slate-600">
            <Receipt className="w-10 h-10" />
            <p className="text-sm">No expenses match the selected filters</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-800">
            {filtered.map(e => {
              const isOpen = expanded === e._key
              const cfg    = TYPE_CFG[e.type]
              return (
                <div key={e._key} className="bg-dark-850 hover:bg-dark-800/60 transition-colors">
                  {/* ── row ── */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : e._key)}
                  >
                    {/* expand arrow */}
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}

                    {/* date */}
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-xs font-bold text-slate-100 leading-none">
                        {new Date(e.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}
                      </p>
                      <p className="text-[10px] text-slate-600">{new Date(e.date).getFullYear()}</p>
                    </div>

                    {/* type badge */}
                    <div className="shrink-0 hidden sm:block">
                      <TypeBadge type={e.type} />
                    </div>

                    {/* colored dot on mobile */}
                    <div className={`w-2 h-2 rounded-full shrink-0 sm:hidden ${cfg.dot}`} />

                    {/* content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-slate-100 truncate">{e.title}</p>
                        {e.hasBillPhoto && <Image className="w-3 h-3 text-slate-500" title="Has bill photo" />}
                        {e.scope && <ScopeBadge scope={e.scope} />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {e.sub1 && <span className="text-xs text-slate-500 truncate max-w-xs">{e.sub1}</span>}
                        {e.sub2 && <span className="text-[10px] text-slate-600 font-mono truncate">· {e.sub2}</span>}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-slate-500 uppercase shrink-0">{e.mode}</span>
                        {e.catLabel && <span className="text-[10px] text-slate-600">{e.catLabel}</span>}
                      </div>
                    </div>

                    {/* amount */}
                    <p className="text-base font-black text-red-400 shrink-0">{fmtINR(e.amount)}</p>

                    {/* actions */}
                    <div className="flex items-center gap-1 shrink-0" onClick={ev => ev.stopPropagation()}>
                      {e.canEdit && (
                        <button onClick={() => setEditing(e)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {e.canDelete && (
                        <button onClick={() => deleteEntry(e)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── expanded detail ── */}
                  {isOpen && <ExpandedDetail entry={e} onNavigate={onNavigate} />}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── edit modals ── */}
      {editing?.editModal === 'field' && (
        <EditFieldModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries(['fe_unified', companyId])
            qc.invalidateQueries(['core_expenses_unified', companyId])
          }}
        />
      )}
      {editing?.editModal === 'expense' && (
        <EditExpenseModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries(['core_expenses_unified', companyId])}
        />
      )}
    </div>
  )
}
