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

// ── Category dot ──────────────────────────────────────────────────────────────
function CatDot({ color, size = 8 }) {
  return <span style={{ background: color, width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
}

// ── Month Forecast Column ─────────────────────────────────────────────────────
function MonthColumn({ year, month, plans, hrPayroll, isCurrent, fixedExpenses = [] }) {
  const fixedTotal = fixedExpenses.reduce((s, fe) => s + fixedMonthlyAmount(fe), 0)
  const total = plans.reduce((s, p) => s + monthlyAmount(p), 0) + hrPayroll + fixedTotal

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
        <p className="text-xs text-slate-500">{itemCount} expense items</p>
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

      {plans.length === 0 && hrPayroll === 0 && fixedExpenses.length === 0 && (
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
              />
            ))}
          </div>
        )
      }

      {/* Fixed Expenses auto-pulled panel */}
      {fixedExpenses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-teal-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
              Fixed Expenses — Auto ({fixedExpenses.length})
            </h2>
            <span className="text-xs text-slate-500">Pulled from Accounts → Fixed Expenses</span>
          </div>
          <div className="card overflow-hidden">
            {fixedExpenses.map(fe => (
              <div key={fe.id} className="flex items-center justify-between px-4 py-3 border-b border-dark-700/60 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <CatDot color="#0d9488" size={10} />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">{fe.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {fe.category && <span className="text-xs text-slate-500">{fe.category}</span>}
                      {fe.category && <span className="text-slate-600">·</span>}
                      <span className="text-xs text-slate-500">
                        {fe.recurrence_type === 'monthly'
                          ? `Monthly (due day ${fe.due_day || '—'})`
                          : `Every ${fe.recurrence_days} days`}
                      </span>
                      {fe.payee_name && <><span className="text-slate-600">·</span><span className="text-xs text-slate-500">{fe.payee_name}</span></>}
                      {fe.end_date && <><span className="text-slate-600">·</span><span className="text-xs text-amber-400">ends {fe.end_date}</span></>}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-semibold text-slate-100">{fmtINR(fe.amount)}</p>
                  {fe.recurrence_type === 'custom_days' && (
                    <p className="text-xs text-slate-500">≈{fmtINRShort(fixedMonthlyAmount(fe))}/mo</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expense list */}
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
          <div className="card overflow-hidden">
            {/* Category legend */}
            {categories.length > 0 && (
              <div className="px-4 py-2.5 border-b border-dark-700 flex flex-wrap gap-3">
                {categories.map(c => (
                  <div key={c} className="flex items-center gap-1.5">
                    <CatDot color={catColor[c]} />
                    <span className="text-xs text-slate-400">{c}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Expense rows */}
            {plans.map(plan => (
              <div key={plan.id} className="flex items-center justify-between px-4 py-3 border-b border-dark-700/60 last:border-0 hover:bg-dark-700/30 group">
                <div className="flex items-center gap-3 min-w-0">
                  <CatDot color={catColor[plan.category] || '#64748b'} size={10} />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">{plan.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">{plan.category}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-xs text-slate-500">{FREQ_LABELS[plan.frequency]}</span>
                      {plan.end_date && <span className="text-xs text-slate-600">until {plan.end_date}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-100">{fmtINR(plan.amount)}</p>
                    {plan.frequency !== 'monthly' && plan.frequency !== 'one_time' && (
                      <p className="text-xs text-slate-500">≈{fmtINRShort(monthlyAmount(plan))}/mo</p>
                    )}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TYPE_COLORS[plan.type]}`}>
                    {plan.type === 'fixed' ? 'Fixed' : 'Est.'}
                  </span>
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
