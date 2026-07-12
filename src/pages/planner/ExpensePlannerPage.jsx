import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight,
  Loader2, RefreshCw, Tag, Users, AlertTriangle, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtINRShort = (n) => {
  n = Number(n || 0)
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`
  return fmtINR(n)
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const FREQ_LABELS = {
  monthly:     'Monthly',
  weekly:      'Weekly (×4)',
  quarterly:   'Quarterly',
  half_yearly: 'Half-Yearly',
  yearly:      'Yearly',
  one_time:    'One-Time',
}

const FREQ_OPTIONS = Object.entries(FREQ_LABELS)

const TYPE_COLORS = {
  fixed:      'bg-blue-500/15 text-blue-300 border-blue-500/30',
  predictive: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

const CATEGORY_PALETTE = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#ec4899','#84cc16','#14b8a6',
]

// Does a plan have an occurrence in a given month?
function occursInMonth(plan, year, month) {
  const start = new Date(plan.start_date)
  const startY = start.getFullYear()
  const startM = start.getMonth() // 0-indexed

  // Before start
  if (year < startY || (year === startY && month < startM)) return false

  // After end
  if (plan.end_date) {
    const end = new Date(plan.end_date)
    if (year > end.getFullYear() || (year === end.getFullYear() && month > end.getMonth())) return false
  }

  switch (plan.frequency) {
    case 'monthly':     return true
    case 'weekly':      return true  // treated as ×4/month
    case 'one_time':    return year === startY && month === startM
    case 'quarterly':   return ((year * 12 + month) - (startY * 12 + startM)) % 3 === 0
    case 'half_yearly': return ((year * 12 + month) - (startY * 12 + startM)) % 6 === 0
    case 'yearly':      return month === startM && (year - startY) % 1 === 0
    default:            return false
  }
}

function monthlyAmount(plan) {
  if (plan.frequency === 'weekly') return Number(plan.amount) * 4
  return Number(plan.amount)
}

// Fixed expense monthly amount approximation
function fixedMonthlyAmount(fe) {
  if (fe.recurrence_type === 'monthly') return Number(fe.amount)
  if (fe.recurrence_type === 'custom_days' && Number(fe.recurrence_days) > 0)
    return Math.round(Number(fe.amount) * 30 / Number(fe.recurrence_days))
  return Number(fe.amount)
}

// Does a fixed expense apply to this month?
// Note: query already filters is_active=true, so no check needed here
function fixedOccursInMonth(fe, year, month) {
  // Check start_date (only for non-monthly — monthly has no start_date)
  if (fe.start_date) {
    const start = new Date(fe.start_date)
    const sY = start.getFullYear(), sM = start.getMonth()
    if (year < sY || (year === sY && month < sM)) return false
  }
  // Check end_date
  if (fe.end_date) {
    const end = new Date(fe.end_date)
    const eY = end.getFullYear(), eM = end.getMonth()
    if (year > eY || (year === eY && month > eM)) return false
  }
  return true
}

// Returns the 'YYYY-MM' key for the month immediately before a given key
function prevMonthKey(key) {
  const [y, m] = key.split('-').map(Number)
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`
}

// ── Category dot ──────────────────────────────────────────────────────────────
function CatDot({ color, size = 8 }) {
  return <span style={{ background: color, width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
}

// ── Month Forecast Column ─────────────────────────────────────────────────────
function MonthColumn({ year, month, plans, hrPayroll, isCurrent, fixedExpenses = [], fepStats = { paid: 0, pending: 0 }, overdueItems = [], today = '' }) {
  const fixedTotal = fixedExpenses.reduce((s, fe) => s + fixedMonthlyAmount(fe), 0)
  const plansTotal = plans.reduce((s, p) => s + monthlyAmount(p), 0)
  const total      = plansTotal + hrPayroll + fixedTotal

  // Split overdue items: same-month (in-period warning) vs prior-month carryover
  const todayMs = today ? new Date(today).getTime() : Date.now()
  const sameMonthOverdue = overdueItems.filter(p => !p._carryover).map(p => ({
    ...p,
    daysOverdue: Math.floor((todayMs - new Date(p.due_date).getTime()) / 86400000),
  }))
  const carryoverItems = overdueItems.filter(p => p._carryover).map(p => ({
    ...p,
    daysOverdue: Math.floor((todayMs - new Date(p.due_date).getTime()) / 86400000),
  }))

  // Only carryover adds to total (same-month is already included in fixedTotal)
  const carryoverTotal = carryoverItems.reduce((s, p) => s + Number(p.amount), 0)

  // Paid = confirmed fixed expense payments; remaining = this month unpaid + carryover
  const paidAmount = fepStats.paid
  const remaining  = (total - paidAmount) + carryoverTotal

  const byCategory = {}
  plans.forEach(p => {
    const cat = p.category || 'General'
    if (!byCategory[cat]) byCategory[cat] = { total: 0, color: p._color, items: [] }
    byCategory[cat].total += monthlyAmount(p)
    byCategory[cat].items.push(p)
  })

  const itemCount = plans.length + (hrPayroll > 0 ? 1 : 0) + fixedExpenses.length

  return (
    <div className={`flex-1 min-w-0 rounded-xl border ${isCurrent ? 'border-primary-500/50 bg-primary-500/5' : 'border-dark-700 bg-dark-800'} p-4 flex flex-col gap-3`}>
      {/* Month header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className={`text-sm font-bold ${isCurrent ? 'text-primary-300' : 'text-slate-200'}`}>
            {MONTHS[month].slice(0, 3)} {year}
            {isCurrent && <span className="ml-2 text-[10px] bg-primary-500/20 text-primary-400 px-1.5 py-0.5 rounded-full">Current</span>}
          </p>
        </div>
        <p className="text-2xl font-bold text-slate-100">{fmtINRShort(total)}</p>
        <p className="text-xs text-slate-500">
          {itemCount} expense items
          {sameMonthOverdue.length > 0 ? ` · ${sameMonthOverdue.length} overdue` : ''}
          {carryoverItems.length > 0 ? ` · ${carryoverItems.length} overdue` : ''}
        </p>
        {/* Paid / remaining / carryover summary */}
        {(paidAmount > 0 || carryoverTotal > 0) && (
          <div className="flex flex-col gap-0.5 mt-1.5">
            {paidAmount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-400 font-medium">✓ Paid {fmtINRShort(paidAmount)}</span>
                <span className="text-[10px] text-slate-500">·</span>
                <span className="text-[10px] text-amber-400 font-medium">⏳ Remaining {fmtINRShort(total - paidAmount)}</span>
              </div>
            )}
            {carryoverTotal > 0 && (
              <span className="text-[10px] text-red-400 font-medium">⚠ +{fmtINRShort(carryoverTotal)} overdue carryover · Total due {fmtINRShort(remaining)}</span>
            )}
          </div>
        )}
      </div>

      {/* Progress bar by category */}
      {total > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
          {hrPayroll > 0 && (
            <div style={{ width: `${(hrPayroll / total) * 100}%`, background: '#6366f1' }} />
          )}
          {fixedTotal > 0 && (
            <div style={{ width: `${(fixedTotal / total) * 100}%`, background: '#0d9488' }} />
          )}
          {Object.entries(byCategory).map(([cat, { total: ct, color }]) => (
            <div key={cat} style={{ width: `${(ct / total) * 100}%`, background: color || '#64748b' }} />
          ))}
        </div>
      )}

      {/* Payroll auto-line */}
      {hrPayroll > 0 && (
        <div className="flex items-center justify-between py-2 border-b border-dark-700/60">
          <div className="flex items-center gap-2 min-w-0">
            <CatDot color="#6366f1" />
            <div className="min-w-0">
              <p className="text-xs text-slate-300 truncate">Payroll</p>
              <p className="text-[10px] text-slate-500">Auto · HR</p>
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-200 shrink-0 ml-2">{fmtINRShort(hrPayroll)}</p>
        </div>
      )}

      {/* Fixed Expenses auto-pulled section */}
      {fixedExpenses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <CatDot color="#0d9488" />
              <p className="text-[11px] font-semibold text-teal-400 uppercase tracking-wide">Fixed Expenses</p>
              <span className="text-[9px] px-1 py-0.5 rounded bg-teal-500/15 border border-teal-500/30 text-teal-400">Auto</span>
            </div>
            <p className="text-xs text-teal-400">{fmtINRShort(fixedTotal)}</p>
          </div>
          <div className="space-y-1 pl-3">
            {fixedExpenses.map(fe => (
              <div key={fe.id} className="flex items-center justify-between">
                <p className="text-xs text-slate-300 truncate">{fe.name}</p>
                <p className="text-xs text-slate-400 shrink-0 ml-2">{fmtINRShort(fixedMonthlyAmount(fe))}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expense items by category */}
      {Object.entries(byCategory).map(([cat, { total: ct, color, items }]) => (
        <div key={cat}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <CatDot color={color || '#64748b'} />
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{cat}</p>
            </div>
            <p className="text-xs text-slate-400">{fmtINRShort(ct)}</p>
          </div>
          <div className="space-y-1 pl-3">
            {items.map(p => (
              <div key={p.id} className="flex items-center justify-between">
                <p className="text-xs text-slate-300 truncate">{p.name}</p>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {p.type === 'predictive' && <AlertTriangle size={10} className="text-amber-400" />}
                  <p className="text-xs text-slate-400">{fmtINRShort(monthlyAmount(p))}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Same-month overdue (payment missed within this month, not yet month-end) */}
      {sameMonthOverdue.length > 0 && (
        <div className="nhance-overdue-card rounded-lg border border-red-800/50 bg-red-950/25 p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} className="text-red-400 nhance-overdue-label" />
              <p className="text-[11px] font-semibold text-red-400 nhance-overdue-label uppercase tracking-wide">Overdue This Month</p>
            </div>
            <p className="text-xs font-semibold text-red-400 nhance-overdue-label">
              {fmtINRShort(sameMonthOverdue.reduce((s, p) => s + Number(p.amount), 0))}
            </p>
          </div>
          <div className="space-y-1.5">
            {sameMonthOverdue.map(p => (
              <div key={p.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-red-200 nhance-overdue-name truncate">{p.fixed_expenses?.name || '—'}</p>
                  <p className="text-[10px] text-red-500 nhance-overdue-date">
                    Due {p.due_date} · <span className="font-semibold">{p.daysOverdue}d overdue</span>
                  </p>
                </div>
                <p className="text-xs text-red-300 nhance-overdue-amount font-semibold shrink-0">{fmtINRShort(p.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prior-month carryover (1 month only — after month ends) */}
      {carryoverItems.length > 0 && (
        <div className="nhance-overdue-card rounded-lg border border-red-800/50 bg-red-950/25 p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} className="text-red-400 nhance-overdue-label" />
              <p className="text-[11px] font-semibold text-red-400 nhance-overdue-label uppercase tracking-wide">Overdue Carryover</p>
            </div>
            <p className="text-xs font-semibold text-red-400 nhance-overdue-label">{fmtINRShort(carryoverTotal)}</p>
          </div>
          <div className="space-y-1.5">
            {carryoverItems.map(p => (
              <div key={p.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-red-200 nhance-overdue-name truncate">{p.fixed_expenses?.name || '—'}</p>
                  <p className="text-[10px] text-red-500 nhance-overdue-date">
                    Due {p.due_date} · <span className="font-semibold">{p.daysOverdue}d overdue</span>
                  </p>
                </div>
                <p className="text-xs text-red-300 nhance-overdue-amount font-semibold shrink-0">{fmtINRShort(p.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {plans.length === 0 && hrPayroll === 0 && fixedExpenses.length === 0 && sameMonthOverdue.length === 0 && carryoverItems.length === 0 && (
        <p className="text-xs text-slate-600 text-center py-4">No expenses planned</p>
      )}
    </div>
  )
}

// ── Expense Form Modal ────────────────────────────────────────────────────────
const BLANK = {
  name: '', category: '', amount: '', frequency: 'monthly',
  type: 'fixed', start_date: new Date().toISOString().split('T')[0],
  end_date: '', notes: '',
}

function ExpenseModal({ initial, categories, onClose, onSaved, companyId }) {
  const [form, setForm]   = useState(initial || BLANK)
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [showCatInput, setShowCatInput] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const allCats = [...new Set([...categories, form.category].filter(Boolean))]

  const handleSave = async () => {
    if (!form.name.trim())    return toast.error('Enter expense name')
    if (!form.amount || isNaN(Number(form.amount))) return toast.error('Enter a valid amount')
    if (!form.category.trim()) return toast.error('Select or create a category')
    setSaving(true)
    try {
      const payload = {
        company_id: companyId,
        name: form.name.trim(),
        category: form.category.trim(),
        amount: Number(form.amount),
        frequency: form.frequency,
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date || null,
        notes: form.notes || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }
      if (initial?.id) {
        const { error } = await supabase.from('expense_plans').update(payload).eq('id', initial.id)
        if (error) throw error
        toast.success('Expense updated')
      } else {
        const { error } = await supabase.from('expense_plans').insert(payload)
        if (error) throw error
        toast.success('Expense added')
      }
      onSaved()
    } catch (e) {
      toast.error(e.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const addCat = () => {
    const c = newCat.trim()
    if (!c) return
    set('category', c)
    setNewCat('')
    setShowCatInput(false)
  }

  const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'
  const label = 'text-xs text-slate-400 mb-1 block'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-sm font-bold text-slate-100">{initial?.id ? 'Edit Expense' : 'Add Planned Expense'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className={label}>Expense Name *</label>
            <input className={inp} placeholder="e.g. Office Rent, JCB EMI, Generator Fuel" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={label.replace('mb-1','')}>Category *</label>
              <button onClick={() => setShowCatInput(p => !p)} className="text-xs text-primary-400 hover:text-primary-300">
                + New category
              </button>
            </div>
            {showCatInput && (
              <div className="flex gap-2 mb-2">
                <input className={inp + ' flex-1'} placeholder="Category name" value={newCat} onChange={e => setNewCat(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCat()} />
                <button onClick={addCat} className="btn-primary px-3 text-xs">Add</button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {allCats.map(c => (
                <button key={c} onClick={() => set('category', c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    form.category === c
                      ? 'bg-primary-500/20 border-primary-500/60 text-primary-300'
                      : 'bg-dark-700 border-dark-600 text-slate-400 hover:border-slate-500'
                  }`}>{c}</button>
              ))}
              {allCats.length === 0 && <p className="text-xs text-slate-500">Click "+ New category" to create one</p>}
            </div>
          </div>

          {/* Amount + Frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Amount (₹) *</label>
              <input type="number" className={inp} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
            <div>
              <label className={label}>Frequency</label>
              <select className={inp} value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                {FREQ_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className={label}>Expense Type</label>
            <div className="flex gap-2">
              {[['fixed','Fixed / Certain'],['predictive','Predictive / Estimated']].map(([k, v]) => (
                <button key={k} onClick={() => set('type', k)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                    form.type === k ? TYPE_COLORS[k] : 'bg-dark-700 border-dark-600 text-slate-400'
                  }`}>{v}</button>
              ))}
            </div>
            {form.type === 'predictive' && (
              <p className="text-xs text-amber-400/70 mt-1.5 flex items-center gap-1">
                <Info size={11} /> Marked with ⚠ in forecast — treat as estimate
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Start Date *</label>
              <input type="date" className={inp} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className={label}>End Date <span className="text-slate-600">(optional)</span></label>
              <input type="date" className={inp} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              {!form.end_date && <p className="text-[10px] text-slate-600 mt-0.5">Leave blank = ongoing</p>}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={label}>Notes <span className="text-slate-600">(optional)</span></label>
            <input className={inp} placeholder="e.g. Lease #12, renewal due Oct" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : (initial?.id ? 'Update' : 'Add Expense')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExpensePlannerPage() {
  const { company } = useAuth()
  const companyId   = company?.id
  const qc          = useQueryClient()

  // Rolling offset — 0 = current month is first column
  const [offset, setOffset] = useState(0)
  const [modal, setModal]   = useState(null)   // null | 'add' | plan object
  const [delId, setDelId]   = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [expandedCats, setExpandedCats]           = useState({})  // planned expense categories
  const [expandedFixedCats, setExpandedFixedCats] = useState({})  // fixed expense categories

  const toggleCat      = (cat) => setExpandedCats(p => ({ ...p, [cat]: !p[cat] }))
  const toggleFixedCat = (cat) => setExpandedFixedCats(p => ({ ...p, [cat]: !p[cat] }))

  // Compute 3 months to display
  const months = useMemo(() => {
    const now = new Date()
    return [0, 1, 2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset + i, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }, [offset])

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['expense_plans', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_plans')
        .select('*').eq('company_id', companyId).eq('is_active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
    staleTime: 30_000,
  })

  // HR payroll auto-pull
  const { data: salaries = [] } = useQuery({
    queryKey: ['planner_salaries', companyId],
    queryFn: async () => {
      // Get latest salary record per active employee
      const { data: emps } = await supabase.from('hr_employees')
        .select('id').eq('company_id', companyId).eq('is_active', true)
      if (!emps?.length) return []
      const empIds = emps.map(e => e.id)
      const { data: sals } = await supabase.from('salary_records')
        .select('employee_id,basic_salary,hra,special_allowance,other_allowance,effective_from')
        .in('employee_id', empIds)
        .order('effective_from', { ascending: false })
      if (!sals?.length) return []
      // Take latest per employee
      const seen = {}
      return sals.filter(s => { if (seen[s.employee_id]) return false; seen[s.employee_id] = true; return true })
    },
    enabled: !!companyId,
    staleTime: 120_000,
  })

  const hrPayroll = useMemo(() =>
    salaries.reduce((s, r) =>
      s + Number(r.basic_salary || 0) + Number(r.hra || 0) +
          Number(r.special_allowance || 0) + Number(r.other_allowance || 0), 0),
    [salaries]
  )

  // Fixed expenses auto-pull from Accounts → Fixed Expenses
  const { data: fixedExpenses = [] } = useQuery({
    queryKey: ['fixed_expenses_planner', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_expenses')
        .select('id,name,category,amount,recurrence_type,recurrence_days,due_day,start_date,end_date,payee_name,description')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
    staleTime: 60_000,
  })

  // Fixed expenses that apply to each displayed month
  const fixedMonthPlans = useMemo(() =>
    months.map(({ year, month }) =>
      fixedExpenses.filter(fe => fixedOccursInMonth(fe, year, month))
    ),
    [months, fixedExpenses]
  )

  // YYYY-MM keys for the 3 displayed months
  const monthKeys = useMemo(() =>
    months.map(({ year, month }) => `${year}-${String(month + 1).padStart(2, '0')}`),
    [months]
  )

  // Fetch actual payment status for fixed expenses in displayed months
  const { data: fepPayments = [] } = useQuery({
    queryKey: ['fep_planner_status', companyId, monthKeys.join(',')],
    queryFn: async () => {
      const { data } = await supabase.from('fixed_expense_payments')
        .select('fixed_expense_id, period_month, status, paid_amount, amount')
        .eq('company_id', companyId)
        .in('period_month', monthKeys)
      return data || []
    },
    enabled: !!companyId && monthKeys.length > 0,
    staleTime: 30_000,
  })

  // Per-month: how much of the fixed expenses is paid vs still pending
  const fepStatsByMonth = useMemo(() =>
    monthKeys.map(key => {
      const mp = fepPayments.filter(p => p.period_month === key)
      return {
        paid:    mp.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.paid_amount || p.amount), 0),
        pending: mp.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0),
      }
    }),
    [fepPayments, monthKeys]
  )

  // Overdue: all pending fixed_expense_payments whose due_date is in the past
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  const { data: overduePayments = [] } = useQuery({
    queryKey: ['fep_overdue', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('fixed_expense_payments')
        .select('id, fixed_expense_id, period_month, due_date, amount, fixed_expenses(name, category)')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .lt('due_date', todayStr)
        .order('due_date', { ascending: true })
      return data || []
    },
    enabled: !!companyId,
    staleTime: 30_000,
  })

  // Overdue display rules:
  //   • Same month (period_month === key, due_date already < today): show as "OVERDUE"
  //   • Immediately prior month only (period_month === prevMonth): show as "OVERDUE CARRYOVER"
  //   • Anything older: do NOT show (no infinite carry-forward)
  const overdueByMonth = useMemo(() =>
    monthKeys.map(key => {
      const prev = prevMonthKey(key)
      return overduePayments
        .filter(p => p.period_month === key || p.period_month === prev)
        .map(p => ({ ...p, _carryover: p.period_month !== key }))
    }),
    [overduePayments, monthKeys]
  )

  // Assign colors to categories
  const categories = useMemo(() => [...new Set(plans.map(p => p.category).filter(Boolean))], [plans])

  const catColor = useMemo(() => {
    const m = {}
    categories.forEach((c, i) => { m[c] = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] })
    return m
  }, [categories])

  const plansWithColor = useMemo(() =>
    plans.map(p => ({ ...p, _color: catColor[p.category] || '#64748b' })),
    [plans, catColor]
  )

  // Group planned expenses by category (for the category-tile list)
  const plansByCategory = useMemo(() => {
    const groups = {}
    plansWithColor.forEach(p => {
      const cat = p.category || 'General'
      if (!groups[cat]) groups[cat] = { color: p._color || '#64748b', items: [], total: 0 }
      groups[cat].items.push(p)
      groups[cat].total += monthlyAmount(p)
    })
    return groups
  }, [plansWithColor])

  // Group fixed expenses by category
  const fixedByCategory = useMemo(() => {
    const groups = {}
    fixedExpenses.forEach(fe => {
      const cat = fe.category || 'misc'
      if (!groups[cat]) groups[cat] = { items: [], total: 0 }
      groups[cat].items.push(fe)
      groups[cat].total += fixedMonthlyAmount(fe)
    })
    return groups
  }, [fixedExpenses])

  // Filter plans for each month
  const monthPlans = useMemo(() =>
    months.map(({ year, month }) =>
      plansWithColor.filter(p => occursInMonth(p, year, month))
    ),
    [months, plansWithColor]
  )

  // Totals for summary (manual plans + HR payroll + fixed expenses)
  const totals = monthPlans.map((mp, i) =>
    mp.reduce((s, p) => s + monthlyAmount(p), 0) +
    hrPayroll +
    fixedMonthPlans[i].reduce((s, fe) => s + fixedMonthlyAmount(fe), 0)
  )

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setDeleting(true)
    try {
      const { error } = await supabase.from('expense_plans').delete().eq('id', id)
      if (error) throw error
      toast.success('Expense removed')
      qc.invalidateQueries(['expense_plans', companyId])
      setDelId(null)
    } catch (e) {
      toast.error(e.message || 'Failed to delete')
    } finally { setDeleting(false) }
  }

  const invalidate = () => qc.invalidateQueries(['expense_plans', companyId])

  const currentMonthIdx = offset === 0 ? 0 : -1  // highlight first col when offset=0

  // ── UI ────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Expense Planner</h1>
          <p className="text-sm text-slate-500">
            {MONTHS[months[0].month].slice(0,3)} · {MONTHS[months[1].month].slice(0,3)} · {MONTHS[months[2].month].slice(0,3)} {months[0].year !== months[2].year ? `${months[0].year}–${months[2].year}` : months[0].year}
            {hrPayroll > 0 && <span className="ml-2 text-indigo-400">· Payroll {fmtINRShort(hrPayroll)}/mo</span>}
            {fixedExpenses.length > 0 && <span className="ml-2 text-teal-400">· {fixedExpenses.length} fixed auto-pulled</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month nav */}
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(o => o - 1)} className="p-1.5 rounded-lg bg-dark-700 border border-dark-600 text-slate-400 hover:text-slate-200">
              <ChevronLeft size={16} />
            </button>
            {offset !== 0 && (
              <button onClick={() => setOffset(0)} className="text-xs text-slate-500 hover:text-slate-300 px-2">
                Today
              </button>
            )}
            <button onClick={() => setOffset(o => o + 1)} className="p-1.5 rounded-lg bg-dark-700 border border-dark-600 text-slate-400 hover:text-slate-200">
              <ChevronRight size={16} />
            </button>
          </div>
          <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={15} /> Add Expense
          </button>
        </div>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {months.map(({ year, month }, i) => (
          <div key={i} className={`card p-3 text-center ${i === 0 && offset === 0 ? 'border-primary-500/40' : ''}`}>
            <p className="text-xs text-slate-500">{MONTHS[month].slice(0,3)} {year}</p>
            <p className="text-lg font-bold text-slate-100">{fmtINRShort(totals[i])}</p>
            {i > 0 && totals[0] > 0 && (
              <p className={`text-[10px] mt-0.5 ${totals[i] > totals[0] ? 'text-red-400' : 'text-emerald-400'}`}>
                {totals[i] > totals[0] ? '▲' : '▼'} {fmtINRShort(Math.abs(totals[i] - totals[0]))} vs {MONTHS[months[0].month].slice(0,3)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 3-column forecast */}
      {isLoading
        ? <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2"><Loader2 size={16} className="animate-spin" /> Loading forecast…</div>
        : (
          <div className="flex gap-4">
            {months.map(({ year, month }, i) => (
              <MonthColumn
                key={`${year}-${month}`}
                year={year} month={month}
                plans={monthPlans[i]}
                hrPayroll={hrPayroll}
                isCurrent={i === 0 && offset === 0}
                fixedExpenses={fixedMonthPlans[i]}
                fepStats={fepStatsByMonth[i] || { paid: 0, pending: 0 }}
                overdueItems={overdueByMonth[i] || []}
                today={todayStr}
              />
            ))}
          </div>
        )
      }

      {/* ── Fixed Expenses by Category ────────────────────────────────────────── */}
      {fixedExpenses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-teal-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
              Fixed Expenses — Auto ({fixedExpenses.length})
            </h2>
            <span className="text-xs text-slate-500">Pulled from Accounts → Fixed Expenses</span>
          </div>
          <div className="space-y-2">
            {Object.entries(fixedByCategory).map(([cat, { items, total: catTotal }]) => {
              const expanded = !!expandedFixedCats[cat]
              const icon = { salary:'👤', emi:'🏦', rent:'🏠', insurance:'🛡️', interest:'📈', admin:'📋', misc:'📦' }[cat] || '📦'
              const label = { salary:'Salary', emi:'EMI / Loan', rent:'Rent', insurance:'Insurance', interest:'Interest', admin:'Admin', misc:'Miscellaneous' }[cat] || cat
              return (
                <div key={cat} className="card overflow-hidden">
                  <button onClick={() => toggleFixedCat(cat)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-700/30 transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-base">{icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200">{label}</p>
                        <p className="text-xs text-slate-500">{items.length} expense{items.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <p className="text-sm font-semibold text-teal-300">{fmtINRShort(catTotal)}<span className="text-xs text-slate-500 font-normal">/mo</span></p>
                      <ChevronRight size={15} className={`text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t border-dark-700/60">
                      {items.map(fe => (
                        <div key={fe.id} className="flex items-center justify-between px-4 py-2.5 border-b border-dark-700/40 last:border-0 bg-dark-900/30">
                          <div className="flex items-center gap-3 min-w-0">
                            <CatDot color="#0d9488" size={8} />
                            <div className="min-w-0">
                              <p className="text-sm text-slate-200 truncate">{fe.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[10px] text-slate-500">
                                  {fe.recurrence_type === 'monthly' ? `Due day ${fe.due_day || '—'}` : `Every ${fe.recurrence_days}d`}
                                </span>
                                {fe.payee_name && <><span className="text-slate-600">·</span><span className="text-[10px] text-slate-500">{fe.payee_name}</span></>}
                                {fe.end_date && <span className="text-[10px] text-amber-400">· ends {fe.end_date}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-sm font-semibold text-slate-100">{fmtINR(fe.amount)}</p>
                            {fe.recurrence_type === 'custom_days' && (
                              <p className="text-[10px] text-slate-500">≈{fmtINRShort(fixedMonthlyAmount(fe))}/mo</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Planned Expenses by Category ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Tag size={13} /> Planned Expenses ({plans.length})
          </h2>
          {hrPayroll > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-400">
              <Users size={12} /> Payroll {fmtINR(hrPayroll)}/mo · {salaries.length} employees (auto)
            </div>
          )}
        </div>

        {plans.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-slate-400 text-sm font-medium mb-1">No planned expenses yet</p>
            <p className="text-slate-500 text-xs mb-4">Add your recurring costs — rent, EMIs, insurance, fuel — to see your 3-month forecast.</p>
            <button onClick={() => setModal('add')} className="btn-primary mx-auto flex items-center gap-1.5 text-sm">
              <Plus size={14} /> Add First Expense
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(plansByCategory).map(([cat, { color, items, total: catTotal }]) => {
              const expanded = !!expandedCats[cat]
              return (
                <div key={cat} className="card overflow-hidden">
                  {/* Category tile header */}
                  <button onClick={() => toggleCat(cat)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-700/30 transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <CatDot color={color} size={12} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200">{cat}</p>
                        <p className="text-xs text-slate-500">{items.length} expense{items.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <p className="text-sm font-semibold text-slate-100">{fmtINRShort(catTotal)}<span className="text-xs text-slate-500 font-normal">/mo</span></p>
                      <ChevronRight size={15} className={`text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
                    </div>
                  </button>

                  {/* Expense rows — visible when expanded */}
                  {expanded && (
                    <div className="border-t border-dark-700/60">
                      {items.map(plan => (
                        <div key={plan.id} className="flex items-center justify-between px-4 py-2.5 border-b border-dark-700/40 last:border-0 bg-dark-900/30 group">
                          <div className="flex items-center gap-3 min-w-0">
                            <CatDot color={color} size={8} />
                            <div className="min-w-0">
                              <p className="text-sm text-slate-200 truncate">{plan.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[10px] text-slate-500">{FREQ_LABELS[plan.frequency]}</span>
                                {plan.end_date && <span className="text-[10px] text-slate-500">· until {plan.end_date}</span>}
                                <span className={`text-[9px] px-1 py-0.5 rounded border ml-0.5 ${TYPE_COLORS[plan.type]}`}>
                                  {plan.type === 'fixed' ? 'Fixed' : 'Est.'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-100">{fmtINR(plan.amount)}</p>
                              {plan.frequency !== 'monthly' && plan.frequency !== 'one_time' && (
                                <p className="text-[10px] text-slate-500">≈{fmtINRShort(monthlyAmount(plan))}/mo</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setModal(plan)} className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-dark-600">
                                <Edit2 size={13} />
                              </button>
                              {delId === plan.id ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleDelete(plan.id)} disabled={deleting}
                                    className="text-xs px-2 py-0.5 rounded bg-red-600/20 border border-red-700/40 text-red-400 hover:bg-red-600/30">
                                    {deleting ? '…' : 'Confirm'}
                                  </button>
                                  <button onClick={() => setDelId(null)} className="text-xs text-slate-500 hover:text-slate-300 px-1">✕</button>
                                </div>
                              ) : (
                                <button onClick={() => setDelId(plan.id)} className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-dark-600">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <ExpenseModal
          initial={modal === 'add' ? null : modal}
          categories={categories}
          companyId={companyId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); invalidate() }}
        />
      )}
    </div>
  )
}
