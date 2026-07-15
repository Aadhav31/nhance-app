import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Search, Plus, Sheet, Loader2, ChevronDown,
  Receipt, ShoppingCart, Users, Wrench, CreditCard, Lock, Pencil, Trash2,
  X, TrendingDown,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
const inp = (extra = '') => `w-full px-3 py-2 rounded-lg border border-dark-600 bg-dark-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${extra}`

// ── type config ──────────────────────────────────────────────────────────────
const TYPES = {
  field:       { label: 'Field',        color: 'bg-emerald-500/20 text-emerald-300 border-emerald-700/50', Icon: Receipt },
  purchase:    { label: 'Purchase',     color: 'bg-blue-500/20 text-blue-300 border-blue-700/50',          Icon: ShoppingCart },
  salary:      { label: 'Salary',       color: 'bg-purple-500/20 text-purple-300 border-purple-700/50',    Icon: Users },
  overhead:    { label: 'Overhead',     color: 'bg-orange-500/20 text-orange-300 border-orange-700/50',    Icon: Wrench },
  bill_payment:{ label: 'Bill Pmt',    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-700/50',           Icon: CreditCard },
  fixed:       { label: 'Fixed',        color: 'bg-yellow-500/20 text-yellow-300 border-yellow-700/50',    Icon: Lock },
}

const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'field',       label: 'Field' },
  { key: 'purchase',    label: 'Purchase' },
  { key: 'salary',      label: 'Salary' },
  { key: 'overhead',    label: 'Overhead' },
  { key: 'bill_payment',label: 'Bill Payments' },
  { key: 'fixed',       label: 'Fixed' },
]

const MODES = ['cash','bank','upi','cheque','neft','rtgs']

function TypeBadge({ type }) {
  const cfg = TYPES[type] || TYPES.purchase
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${cfg.color}`}>
      <cfg.Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  )
}

// ── edit modal for editable types ────────────────────────────────────────────
function EditModal({ entry, onClose, onSaved, companyId, session }) {
  const [form, setForm] = useState({
    expense_date:   entry.date,
    description:    entry.description || '',
    vendor_name:    entry.payee       || '',
    amount:         String(entry.amount || ''),
    payment_mode:   entry.mode        || 'cash',
    bank_reference: entry.ref         || '',
  })
  const [saving, setSaving] = useState(false)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      const { error } = await supabase.from('expenses').update({
        expense_date:   form.expense_date,
        description:    form.description.trim() || null,
        vendor_name:    form.vendor_name.trim() || null,
        amount:         parseFloat(form.amount),
        total_amount:   parseFloat(form.amount),
        payment_mode:   form.payment_mode,
        bank_reference: form.bank_reference.trim() || null,
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
      <div className="relative bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <div>
            <p className="font-semibold text-slate-100 text-sm">Edit Expense</p>
            <TypeBadge type={entry.type} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Date</p>
              <input type="date" className={inp()} value={form.expense_date} onChange={e => setF('expense_date', e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Amount (₹)</p>
              <input type="number" className={inp()} value={form.amount} onChange={e => setF('amount', e.target.value)} step="0.01" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Payee / Vendor</p>
            <input className={inp()} value={form.vendor_name} onChange={e => setF('vendor_name', e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Description</p>
            <input className={inp()} value={form.description} onChange={e => setF('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Payment Mode</p>
              <select className={inp()} value={form.payment_mode} onChange={e => setF('payment_mode', e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Ref / Cheque No.</p>
              <input className={inp()} value={form.bank_reference} onChange={e => setF('bank_reference', e.target.value)} />
            </div>
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

// ── main page ────────────────────────────────────────────────────────────────
export default function ExpensesPage({ onNavigate }) {
  const { companyId, session } = useAuth()
  const qc = useQueryClient()

  const [tab, setTab]         = useState('all')
  const [search, setSearch]   = useState('')
  const [dateFrom, setFrom]   = useState(startOfMonth())
  const [dateTo, setTo]       = useState(todayStr())
  const [modeFilter, setMode] = useState('')
  const [editing, setEditing] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  // ── data fetches ──────────────────────────────────────────────────────────
  const { data: expenses = [], isLoading: loadExp } = useQuery({
    queryKey: ['unified_expenses', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('expenses')
        .select('*')
        .eq('company_id', companyId)
        .order('expense_date', { ascending: false })
        .limit(500)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: billPayments = [], isLoading: loadPay } = useQuery({
    queryKey: ['unified_bill_payments', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('payments_made')
        .select('*, bills(bill_number)')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: false })
        .limit(500)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: fixedPayments = [], isLoading: loadFixed } = useQuery({
    queryKey: ['unified_fixed_payments', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('fixed_expense_payments')
        .select('*, fixed_expenses(name, category, company_id)')
        .eq('fixed_expenses.company_id', companyId)
        .order('payment_date', { ascending: false })
        .limit(200)
      return (data || []).filter(p => p.fixed_expenses)
    },
    enabled: !!companyId,
  })

  const isLoading = loadExp || loadPay || loadFixed

  // ── normalise + merge ─────────────────────────────────────────────────────
  const allEntries = useMemo(() => {
    const expRows = expenses.map(e => {
      let type = 'purchase'
      if (e.source === 'field_expense' || e.source === 'field') type = 'field'
      else if (e.category === 'salary' || e.category === 'payroll') type = 'salary'
      else if (e.source === 'manual') type = 'overhead'
      return {
        _key:      `exp-${e.id}`,
        source_id: e.id,
        type,
        date:        e.expense_date,
        description: e.description || '',
        payee:       e.vendor_name || '',
        amount:      Number(e.amount || 0),
        mode:        e.payment_mode || 'cash',
        ref:         e.bill_number || e.bank_reference || '',
        editable:    type !== 'field',   // field expenses managed in FieldExpensePage
        deletable:   type !== 'field',
      }
    })

    const payRows = billPayments.map(p => ({
      _key:      `pay-${p.id}`,
      source_id: p.id,
      type:      'bill_payment',
      date:        p.payment_date,
      description: p.bills?.bill_number ? `Bill ${p.bills.bill_number}` : 'Bill Payment',
      payee:       p.vendor_name || '',
      amount:      Number(p.amount || 0),
      mode:        p.payment_mode || 'cash',
      ref:         p.payment_number || '',
      editable:    false,
      deletable:   false,
    }))

    const fixedRows = fixedPayments.map(p => ({
      _key:      `fix-${p.id}`,
      source_id: p.id,
      type:      'fixed',
      date:        p.payment_date,
      description: p.fixed_expenses?.name || 'Fixed Expense',
      payee:       '',
      amount:      Number(p.amount || 0),
      mode:        p.payment_mode || 'cash',
      ref:         '',
      editable:    false,
      deletable:   false,
    }))

    return [...expRows, ...payRows, ...fixedRows].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [expenses, billPayments, fixedPayments])

  // ── filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allEntries.filter(e => {
      if (tab !== 'all' && e.type !== tab) return false
      if (dateFrom && e.date < dateFrom) return false
      if (dateTo   && e.date > dateTo)   return false
      if (modeFilter && e.mode !== modeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!e.description.toLowerCase().includes(q) &&
            !e.payee.toLowerCase().includes(q) &&
            !e.ref.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allEntries, tab, dateFrom, dateTo, modeFilter, search])

  // ── summary ───────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totals = {}
    Object.keys(TYPES).forEach(t => { totals[t] = 0 })
    filtered.forEach(e => { totals[e.type] = (totals[e.type] || 0) + e.amount })
    return totals
  }, [filtered])

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0)

  // ── actions ───────────────────────────────────────────────────────────────
  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete this ₹${entry.amount.toLocaleString('en-IN')} expense?`)) return
    try {
      const table = entry.type === 'bill_payment' ? 'payments_made' : 'expenses'
      const { error } = await supabase.from(table).delete().eq('id', entry.source_id)
      if (error) throw error
      toast.success('Deleted')
      qc.invalidateQueries(['unified_expenses', companyId])
      qc.invalidateQueries(['unified_bill_payments', companyId])
    } catch (e) { toast.error(e.message) }
  }

  // ── export ────────────────────────────────────────────────────────────────
  const exportXLSX = () => {
    const rows = filtered.map(e => ({
      Date:        e.date,
      Type:        TYPES[e.type]?.label || e.type,
      Description: e.description,
      Payee:       e.payee,
      'Amount (₹)': e.amount,
      Mode:        e.mode?.toUpperCase(),
      Reference:   e.ref,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses')
    XLSX.writeFile(wb, `Expenses_${dateFrom}_to_${dateTo}.xlsx`)
    toast.success('Excel downloaded')
  }

  // ── create redirect ───────────────────────────────────────────────────────
  const CREATE_OPTIONS = [
    { label: 'Field Expense',     action: () => onNavigate?.('fieldexpense') },
    { label: 'Purchase Expense',  action: () => onNavigate?.('purchase') },
    { label: 'Salary / Overhead', action: () => onNavigate?.('hr') },
    { label: 'Bill Payment',      action: () => onNavigate?.('purchase') },
    { label: 'Fixed Expense',     action: () => onNavigate?.('accounts') },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── page header ── */}
      <div className="px-6 py-4 border-b border-dark-800 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-600/20 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Expenses</h1>
              <p className="text-xs text-slate-500">All expense sources in one view</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportXLSX} className="btn-ghost text-xs gap-1.5">
              <Sheet className="w-3.5 h-3.5" /> Export
            </button>
            {/* Create dropdown */}
            <div className="relative group">
              <button className="btn-primary gap-1.5">
                <Plus className="w-4 h-4" /> Add Expense <ChevronDown className="w-3 h-3" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-52 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-30 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                {CREATE_OPTIONS.map(opt => (
                  <button key={opt.label} onClick={() => { opt.action(); setShowCreate(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-700 hover:text-slate-100 first:rounded-t-xl last:rounded-b-xl transition-colors">
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── summary cards ── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          {Object.entries(TYPES).map(([key, cfg]) => (
            <button key={key}
              onClick={() => setTab(tab === key ? 'all' : key)}
              className={`rounded-xl p-3 border text-left transition-all ${
                tab === key ? cfg.color : 'bg-dark-800 border-dark-700 hover:border-dark-600'
              }`}>
              <cfg.Icon className="w-3.5 h-3.5 mb-1 opacity-70" />
              <p className="text-[10px] text-slate-500 truncate">{cfg.label}</p>
              <p className="text-sm font-bold text-slate-100">{fmtINR(summary[key])}</p>
            </button>
          ))}
        </div>

        {/* ── filter bar ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-dark-800 border border-dark-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder-slate-600"
              placeholder="Search description, payee, ref…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* date range */}
          <input type="date" value={dateFrom} onChange={e => setFrom(e.target.value)}
            className="text-xs px-2 py-2 rounded-lg bg-dark-800 border border-dark-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500" />
          <span className="text-slate-600 text-xs">to</span>
          <input type="date" value={dateTo} onChange={e => setTo(e.target.value)}
            className="text-xs px-2 py-2 rounded-lg bg-dark-800 border border-dark-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500" />
          {/* mode filter */}
          <select value={modeFilter} onChange={e => setMode(e.target.value)}
            className="text-xs px-2 py-2 rounded-lg bg-dark-800 border border-dark-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500">
            <option value="">All Modes</option>
            {MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
          {/* clear */}
          {(search || modeFilter) && (
            <button onClick={() => { setSearch(''); setMode('') }}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* ── tabs ── */}
        <div className="flex gap-1 mt-3 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.key ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-dark-800'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── total bar ── */}
      <div className="px-6 py-2 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <p className="text-xs text-slate-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        <p className="text-sm font-bold text-red-400">{fmtINR(totalFiltered)} total</p>
      </div>

      {/* ── list ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3 text-slate-600">
            <Receipt className="w-10 h-10" />
            <p className="text-sm">No expenses found for the selected filters</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(e => (
              <div key={e._key} className="bg-dark-800 border border-dark-700 hover:border-dark-600 rounded-xl px-4 py-3 flex items-center gap-4 transition-colors">
                {/* date */}
                <div className="w-20 shrink-0 text-center">
                  <p className="text-xs font-bold text-slate-100">{new Date(e.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</p>
                  <p className="text-[10px] text-slate-500">{new Date(e.date).getFullYear()}</p>
                </div>
                {/* badge */}
                <div className="shrink-0">
                  <TypeBadge type={e.type} />
                </div>
                {/* main info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{e.description || e.payee || '—'}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {e.payee && <span className="text-xs text-slate-500 truncate">{e.payee}</span>}
                    {e.ref   && <span className="text-[10px] font-mono text-slate-600">· {e.ref}</span>}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-slate-500 uppercase">{e.mode}</span>
                  </div>
                </div>
                {/* amount */}
                <p className="text-base font-black text-red-400 shrink-0">{fmtINR(e.amount)}</p>
                {/* actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {e.editable && (
                    <button onClick={() => setEditing(e)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {e.deletable && (
                    <button onClick={() => deleteEntry(e)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!e.editable && !e.deletable && (
                    <span className="text-[10px] text-slate-600 italic">view only</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* edit modal */}
      {editing && (
        <EditModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries(['unified_expenses', companyId])
          }}
          companyId={companyId}
          session={session}
        />
      )}
    </div>
  )
}
