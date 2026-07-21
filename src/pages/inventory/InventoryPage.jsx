import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { nextDocNumber } from '../../utils/docNumbers'
import {
  Package, Plus, X, Loader2, Search, ChevronRight, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, RefreshCcw, Shuffle, Store,
  LayoutDashboard, Edit2, Trash2, TrendingDown, IndianRupee,
  Wrench, Droplets, Box, Layers, CheckCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]
const inp = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${x}`
const fmtINR  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const fmtQty  = (n, u) => `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${u || ''}`
const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—'

const CATEGORIES = [
  { value: 'raw_material',  label: 'Raw Material',   icon: Layers,   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-700/40' },
  { value: 'spare_part',    label: 'Spare Part',      icon: Wrench,   color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-700/40' },
  { value: 'lubricant',     label: 'Lubricant',       icon: Droplets, color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-700/40' },
  { value: 'consumable',    label: 'Consumable',      icon: Package,  color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-700/40' },
  { value: 'tool',          label: 'Tool',            icon: Wrench,   color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-700/40' },
  { value: 'finished_good', label: 'Finished Goods/Products', icon: Box, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-700/40' },
]

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

const UNITS = ['tonnes','MT','ton','kg','g','unit','nos','bag','box','litre','ml','m','m2','m3','ft','inch','set','pair','roll','sheet','length']

function CategoryBadge({ cat }) {
  const c = CAT_MAP[cat] || { label: cat, bg: 'bg-slate-500/10 border-slate-400/50', color: 'text-slate-500' }
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${c.bg} ${c.color}`}>{c.label}</span>
}

function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className={`bg-dark-800 rounded-xl border border-dark-700 shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} my-4`}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-dark-700">
          <div>
            <h2 className="text-base font-bold text-slate-100">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 mt-0.5"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
        {footer && <div className="flex gap-3 px-6 pb-6 pt-0">{footer}</div>}
      </div>
    </div>
  )
}

function Field({ label, children, required }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

// ── OVERVIEW TAB ──────────────────────────────────────────────────────────────
function OverviewTab({ companyId, onNavigate }) {
  const { data: items = [] } = useQuery({
    queryKey: ['inv_items', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_items').select('*').eq('company_id', companyId).eq('is_active', true)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: stock = [] } = useQuery({
    queryKey: ['inv_stock', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_stock')
        .select('*, inventory_items(item_name, item_code, unit, min_stock_level, category), stores(store_name)')
        .eq('company_id', companyId)
        .gt('quantity_on_hand', 0)
        .order('quantity_on_hand', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: recentTxns = [] } = useQuery({
    queryKey: ['inv_txns_recent', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_transactions')
        .select('*, inventory_items(item_name, unit), stores(store_name)')
        .eq('company_id', companyId).order('created_at', { ascending: false }).limit(10)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: pendingBills = [] } = useQuery({
    queryKey: ['pending-stock-bills', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_transactions')
        .select('id, txn_number, txn_date, quantity, unit, inventory_items(item_name, unit), supplier_name')
        .eq('company_id', companyId).eq('requires_bill', true).is('bill_id', null).eq('action_taken', false)
        .order('txn_date', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const totalValue = stock.reduce((sum, s) => sum + (s.quantity_on_hand || 0) * (s.avg_unit_cost || 0), 0)
  const lowStock   = stock.filter(s => {
    const min = s.inventory_items?.min_stock_level || 0
    return min > 0 && s.quantity_on_hand <= min
  })

  // Per-category: item count + stock value
  const catStats = useMemo(() => {
    const m = {}
    CATEGORIES.forEach(c => { m[c.value] = { items: 0, value: 0 } })
    items.forEach(i => { if (m[i.category]) m[i.category].items++ })
    stock.forEach(s => {
      const cat = s.inventory_items?.category
      if (cat && m[cat]) m[cat].value += (s.quantity_on_hand || 0) * (s.avg_unit_cost || 0)
    })
    return m
  }, [items, stock])

  const TXN_ICON  = { in: ArrowDownCircle, out: ArrowUpCircle, transfer: Shuffle, adjustment: RefreshCcw }
  const TXN_COLOR = { in: 'text-emerald-400', out: 'text-red-400', transfer: 'text-blue-400', adjustment: 'text-orange-400' }
  const TXN_SIGN  = { in: '+', out: '-', transfer: '⇄', adjustment: '~' }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3 space-y-5">

      {/* ── Summary KPIs ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button onClick={() => onNavigate('items')} className="bg-dark-800 border border-dark-700 hover:border-primary-600/60 rounded-xl p-4 text-left transition-colors group">
          <p className="text-xs text-slate-500 mb-1">Total Items</p>
          <p className="text-2xl font-black text-slate-100">{items.length}</p>
          <p className="text-[10px] text-slate-600 mt-0.5 group-hover:text-primary-400">in catalog →</p>
        </button>
        <button onClick={() => onNavigate('stores')} className="bg-dark-800 border border-dark-700 hover:border-primary-600/60 rounded-xl p-4 text-left transition-colors group">
          <p className="text-xs text-slate-500 mb-1">In Stock</p>
          <p className="text-2xl font-black text-slate-100">{stock.length}</p>
          <p className="text-[10px] text-slate-600 mt-0.5 group-hover:text-primary-400">item-store pairs →</p>
        </button>
        <button onClick={() => onNavigate('stock_in')} className={`bg-dark-800 border rounded-xl p-4 text-left transition-colors group ${lowStock.length > 0 ? 'border-red-700/50 hover:border-red-500' : 'border-dark-700 hover:border-primary-600/60'}`}>
          <p className="text-xs text-slate-500 mb-1">Low Stock</p>
          <p className={`text-2xl font-black ${lowStock.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{lowStock.length}</p>
          <p className={`text-[10px] mt-0.5 ${lowStock.length > 0 ? 'text-red-500 group-hover:text-red-400' : 'text-slate-600 group-hover:text-primary-400'}`}>{lowStock.length > 0 ? 'needs restocking →' : 'all good'}</p>
        </button>
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Total Value</p>
          <p className="text-xl font-black text-primary-400">{fmtINR(totalValue)}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">at avg cost</p>
        </div>
      </div>

      {/* ── Pending bill alert ── */}
      {pendingBills.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-lg">🚛</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-400">{pendingBills.length} stock receipt{pendingBills.length > 1 ? 's' : ''} waiting for a bill</p>
            <p className="text-[11px] text-amber-300/60 mt-0.5">
              {pendingBills.slice(0, 2).map(r => r.inventory_items?.item_name).filter(Boolean).join(', ')}
              {pendingBills.length > 2 ? ` +${pendingBills.length - 2} more` : ''}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-amber-400/70 shrink-0">→ Purchase → Bills</span>
        </div>
      )}

      {/* ── Low stock alerts ── */}
      {lowStock.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Low Stock Alerts
          </p>
          <div className="space-y-1.5">
            {lowStock.map(s => (
              <div key={s.id} className="bg-red-500/5 border border-red-700/30 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{s.inventory_items?.item_name}</p>
                  <p className="text-xs text-slate-500">{s.stores?.store_name} · Min: {fmtQty(s.inventory_items?.min_stock_level, s.inventory_items?.unit)}</p>
                </div>
                <p className="text-lg font-black text-red-400">{fmtQty(s.quantity_on_hand, s.inventory_items?.unit)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Current Stock Position ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Stock Position</p>
          <button onClick={() => onNavigate('stores')} className="text-[11px] text-primary-400 hover:text-primary-300">View by store →</button>
        </div>
        {stock.length === 0 ? (
          <div className="bg-dark-800 border border-dark-700 rounded-xl px-4 py-8 text-center">
            <Package className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No stock recorded yet</p>
            <button onClick={() => onNavigate('stock_in')} className="mt-2 text-xs text-primary-400 hover:text-primary-300 underline underline-offset-2">Receive your first stock →</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {stock.map(s => {
              const item = s.inventory_items
              const val  = (s.quantity_on_hand || 0) * (s.avg_unit_cost || 0)
              const isLow = item?.min_stock_level > 0 && s.quantity_on_hand <= item.min_stock_level
              return (
                <div key={s.id} className={`flex items-center justify-between rounded-xl px-4 py-3 border ${isLow ? 'bg-red-500/5 border-red-700/30' : 'bg-dark-800 border-dark-700'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-slate-100 truncate">{item?.item_name}</p>
                      {item?.category && <CategoryBadge cat={item.category} />}
                      {isLow && <span className="text-[10px] text-red-400 font-bold">⚠ LOW</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      📍 {s.stores?.store_name}
                      {s.avg_unit_cost > 0 ? ` · ₹${Number(s.avg_unit_cost).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/unit` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-base font-black text-emerald-400">{fmtQty(s.quantity_on_hand, item?.unit)}</p>
                    {val > 0 && <p className="text-[10px] text-slate-500">{fmtINR(val)}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Category breakdown (clickable) ── */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">By Category</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORIES.map(cat => {
            const stats = catStats[cat.value] || { items: 0, value: 0 }
            const Icon = cat.icon
            return (
              <button key={cat.value} onClick={() => onNavigate('items')}
                className="bg-dark-800 border border-dark-700 hover:border-primary-600/50 rounded-xl p-3 flex items-center gap-3 text-left transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.bg} shrink-0`}>
                  <Icon className={`w-4 h-4 ${cat.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{cat.label}</p>
                  <p className="text-sm font-bold text-slate-100">{stats.items} <span className="text-xs font-normal text-slate-500">items</span></p>
                  {stats.value > 0 && <p className="text-[10px] text-primary-400 font-semibold">{fmtINR(stats.value)}</p>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Recent movements ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recent Movements</p>
          <div className="flex gap-2">
            <button onClick={() => onNavigate('stock_in')}  className="text-[11px] text-emerald-400 hover:text-emerald-300">+ Stock In</button>
            <button onClick={() => onNavigate('stock_out')} className="text-[11px] text-red-400 hover:text-red-300">- Stock Out</button>
          </div>
        </div>
        {recentTxns.length === 0 ? (
          <div className="bg-dark-800 border border-dark-700 rounded-xl px-4 py-6 text-center">
            <p className="text-sm text-slate-500">No movements recorded yet</p>
            <button onClick={() => onNavigate('stock_in')} className="mt-1 text-xs text-primary-400 hover:text-primary-300 underline underline-offset-2">Record first stock receipt →</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentTxns.map(t => {
              const Icon = TXN_ICON[t.txn_type] || Package
              const col  = TXN_COLOR[t.txn_type] || 'text-slate-400'
              const sign = TXN_SIGN[t.txn_type] || ''
              return (
                <div key={t.id} className="bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${col}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-100 truncate">{t.inventory_items?.item_name}</p>
                    <p className="text-xs text-slate-500">{t.txn_number} · {t.stores?.store_name} · {fmtDate(t.txn_date)}</p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${col}`}>
                    {sign}{fmtQty(Math.abs(t.quantity), t.unit || t.inventory_items?.unit)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ITEMS TAB ─────────────────────────────────────────────────────────────────
function ItemsTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing]       = useState(null)
  const [search, setSearch]         = useState('')
  const [filterCat, setFilterCat]   = useState('all')
  const [saving, setSaving]         = useState(false)
  const blank = { item_code:'', item_name:'', category:'raw_material', sub_category:'', brand:'', unit:'nos', description:'', hsn_code:'', min_stock_level:'', reorder_qty:'', avg_unit_cost:'', grade_id: null }
  const [form, setForm] = useState(blank)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Fetch crusher grades for auto-fill
  const { data: grades = [] } = useQuery({
    queryKey: ['crusher-grades-inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_grades')
        .select('id, grade_name, hsn_code, default_uom, default_rate, category')
        .eq('company_id', companyId).order('grade_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const openCreate = async () => {
    setEditing(null)
    // Pre-generate item code so user sees it immediately
    const nextCode = await nextDocNumber(companyId, 'inventory_item').catch(() => '')
    setForm({ ...blank, item_code: nextCode })
    setShowCreate(true)
  }

  // Auto-fill from a crusher grade
  const fillFromGrade = (gradeId) => {
    const g = grades.find(x => x.id === gradeId)
    if (!g) return
    setF('item_name',     g.grade_name   || '')
    setF('hsn_code',      g.hsn_code     || '')
    setF('unit',          g.default_uom  || 'tonnes')
    setF('avg_unit_cost', g.default_rate ? String(g.default_rate) : '')
    setF('category',      'finished_good')
    setF('grade_id',      g.id)
  }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inv_items', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_items').select('*').eq('company_id', companyId).order('item_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: stock = [] } = useQuery({
    queryKey: ['inv_stock', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_stock').select('item_id, quantity_on_hand').eq('company_id', companyId)
      return data || []
    },
    enabled: !!companyId,
  })

  // Total qty on hand per item
  const stockMap = useMemo(() => {
    const m = {}
    stock.forEach(s => { m[s.item_id] = (m[s.item_id] || 0) + Number(s.quantity_on_hand || 0) })
    return m
  }, [stock])

  const displayed = items.filter(i =>
    (filterCat === 'all' || i.category === filterCat) &&
    (!search || i.item_name?.toLowerCase().includes(search.toLowerCase()) || i.item_code?.toLowerCase().includes(search.toLowerCase()))
  )

  const openEdit = (item) => { setEditing(item); setForm({ ...blank, ...item }); setShowCreate(true) }

  const save = async () => {
    if (!form.item_name.trim()) return toast.error('Item name required')
    setSaving(true)
    try {
      // item_code is pre-generated in openCreate; fall back to nextDocNumber if somehow empty
      const item_code = form.item_code?.trim() || (!editing ? await nextDocNumber(companyId, 'inventory_item').catch(() => null) : null)
      const payload = {
        company_id: companyId, item_code,
        item_name: form.item_name.trim(), category: form.category,
        sub_category: form.sub_category?.trim() || null, brand: form.brand?.trim() || null,
        unit: form.unit, description: form.description?.trim() || null,
        hsn_code: form.hsn_code?.trim() || null,
        min_stock_level: parseFloat(form.min_stock_level) || 0,
        reorder_qty: parseFloat(form.reorder_qty) || 0,
        avg_unit_cost: parseFloat(form.avg_unit_cost) || 0,
        grade_id: form.grade_id || null,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from('inventory_items').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Item updated')
      } else {
        const { error } = await supabase.from('inventory_items').insert({ ...payload, created_by: session.user.id })
        if (error) throw error
        toast.success('Item added to catalog')
      }
      setShowCreate(false); setEditing(null); setForm(blank)
      qc.invalidateQueries(['inv_items', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const toggleActive = async (item) => {
    await supabase.from('inventory_items').update({ is_active: !item.is_active }).eq('id', item.id)
    qc.invalidateQueries(['inv_items', companyId])
    toast.success(item.is_active ? 'Item deactivated' : 'Item activated')
  }

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.item_name}" permanently? This cannot be undone.`)) return
    // Check for existing transactions first
    const { count } = await supabase.from('stock_transactions').select('id', { count: 'exact', head: true }).eq('item_id', item.id)
    if (count > 0) {
      toast.error(`Cannot delete — ${count} stock transaction(s) reference this item. You can keep it deactivated instead.`)
      return
    }
    const { error } = await supabase.from('inventory_items').delete().eq('id', item.id)
    if (error) return toast.error(error.message)
    toast.success(`"${item.item_name}" deleted`)
    qc.invalidateQueries(['inv_items', companyId])
    qc.invalidateQueries(['inv_stock', companyId])
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input className={inp('pl-8 text-xs')} placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-2 text-slate-300" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button onClick={openCreate} className="btn-primary shrink-0">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : displayed.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><Package className="w-10 h-10 text-slate-700" /><p>No items yet</p></div>
        : <div className="mt-1 border border-dark-700 rounded-xl overflow-hidden divide-y divide-dark-700">
          {displayed.map(item => {
            const qoh = stockMap[item.id] || 0
            const low = item.min_stock_level > 0 && qoh <= item.min_stock_level
            return (
              <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-dark-750 transition-colors ${low ? 'bg-red-500/5' : 'bg-dark-800'}`}>
                {/* Left: code + name + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.item_code && <span className="text-[10px] font-mono text-primary-500 shrink-0">{item.item_code}</span>}
                    <span className="font-semibold text-sm text-slate-100 truncate">{item.item_name}</span>
                    <CategoryBadge cat={item.category} />
                    {!item.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/50 shrink-0">Inactive</span>}
                    {low && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-700/30 shrink-0">⚠ Low</span>}
                  </div>
                  {(item.brand || item.hsn_code) && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {item.brand}{item.brand && item.hsn_code ? ' · ' : ''}{item.hsn_code ? `HSN ${item.hsn_code}` : ''}
                    </p>
                  )}
                </div>

                {/* Right: qty + cost + actions */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-bold ${low ? 'text-red-400' : qoh > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {fmtQty(qoh, item.unit)}
                    </p>
                    {item.avg_unit_cost > 0 && (
                      <p className="text-[10px] text-slate-500">{fmtINR(item.avg_unit_cost)}/{item.unit}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg border border-dark-600 text-slate-500 hover:text-slate-100 hover:border-slate-500 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleActive(item)} className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${item.is_active ? 'border-dark-600 text-slate-500 hover:text-red-400 hover:border-red-700/40' : 'border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20'}`}>
                      {item.is_active ? 'Off' : 'On'}
                    </button>
                    {!item.is_active && (
                      <button onClick={() => deleteItem(item)} className="p-1.5 rounded-lg border border-dark-600 text-slate-600 hover:text-red-400 hover:border-red-700/40 transition-colors" title="Delete permanently">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>}
      </div>

      {showCreate && (
        <Modal title={editing ? 'Edit Item' : 'Add Item to Catalog'} onClose={() => { setShowCreate(false); setEditing(null) }} wide
          footer={<><button onClick={() => { setShowCreate(false); setEditing(null) }} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Save Changes' : 'Add Item'}</button></>}>

          {/* Material Master quick-fill — only on create */}
          {!editing && grades.length > 0 && (
            <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-3 mb-1">
              <p className="text-[11px] font-semibold text-primary-400 mb-1.5">⚡ Pull from Material Master</p>
              <select className={inp()} defaultValue="" onChange={e => { if (e.target.value) fillFromGrade(e.target.value) }}>
                <option value="">-- Select a crusher grade to auto-fill --</option>
                {grades.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.grade_name}{g.hsn_code ? ` · HSN ${g.hsn_code}` : ''}{g.default_rate ? ` · ₹${g.default_rate}/${g.default_uom || 'T'}` : ''}
                  </option>
                ))}
              </select>
              {form.grade_id && (
                <p className="text-[10px] text-primary-400/70 mt-1">Fields auto-filled from material master — edit below if needed</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Item Code (auto-generated)">
              <input className={inp()} value={form.item_code} onChange={e => setF('item_code', e.target.value)}
                placeholder="Auto" />
            </Field>
            <Field label="Category *">
              <select className={inp()} value={form.category} onChange={e => setF('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="Item Name *"><input className={inp()} value={form.item_name} onChange={e => setF('item_name', e.target.value)} /></Field></div>
            <Field label="Sub-category / Type"><input className={inp()} value={form.sub_category} onChange={e => setF('sub_category', e.target.value)} placeholder="e.g., Filter, Belt, M-Sand" /></Field>
            <Field label="Brand"><input className={inp()} value={form.brand} onChange={e => setF('brand', e.target.value)} /></Field>
            <Field label="Unit of Measure">
              <select className={inp()} value={form.unit} onChange={e => setF('unit', e.target.value)}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="HSN Code"><input className={inp()} value={form.hsn_code} onChange={e => setF('hsn_code', e.target.value)} placeholder="Auto-filled from material master" /></Field>
            <Field label="Min Stock Level"><input type="number" className={inp()} value={form.min_stock_level} onChange={e => setF('min_stock_level', e.target.value)} placeholder="0" step="0.001" /></Field>
            <Field label="Reorder Qty"><input type="number" className={inp()} value={form.reorder_qty} onChange={e => setF('reorder_qty', e.target.value)} placeholder="0" step="0.001" /></Field>
            <Field label="Avg Unit Cost (₹)"><input type="number" className={inp()} value={form.avg_unit_cost} onChange={e => setF('avg_unit_cost', e.target.value)} placeholder="Auto-filled from material master" step="0.01" /></Field>
            <div className="col-span-2"><Field label="Description"><textarea className={inp()} rows={2} value={form.description} onChange={e => setF('description', e.target.value)} /></Field></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── STORE DETAIL MODAL ────────────────────────────────────────────────────────
function StoreDetailModal({ store, companyId, onClose }) {
  const { data: stock = [], isLoading } = useQuery({
    queryKey: ['store-stock-detail', store.id],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_stock')
        .select('*, inventory_items(item_name, item_code, unit, category)')
        .eq('store_id', store.id)
        .gt('quantity_on_hand', 0)
        .order('quantity_on_hand', { ascending: false })
      return data || []
    },
    enabled: !!store,
  })

  const totalValue = stock.reduce((s, r) => s + (r.quantity_on_hand || 0) * (r.avg_unit_cost || 0), 0)

  return (
    <Modal title={store.store_name} subtitle={[store.store_code, store.location, store.in_charge ? `👤 ${store.in_charge}` : ''].filter(Boolean).join(' · ')} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Stock on Hand</p>
        <div className="flex gap-3">
          <span className="text-xs bg-dark-700 rounded-lg px-3 py-1 text-slate-400">{stock.length} items</span>
          <span className="text-xs bg-primary-500/10 border border-primary-500/30 rounded-lg px-3 py-1 text-primary-400 font-semibold">{fmtINR(totalValue)}</span>
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
      ) : stock.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2 text-slate-500">
          <Package className="w-8 h-8 text-slate-700" />
          <p>No stock currently in this store</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {stock.map(r => {
            const item = r.inventory_items
            const rowVal = (r.quantity_on_hand || 0) * (r.avg_unit_cost || 0)
            return (
              <div key={r.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-100 truncate">{item?.item_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item?.item_code && <span className="text-[10px] font-mono text-primary-500">{item.item_code}</span>}
                    {item?.category && <CategoryBadge cat={item.category} />}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-base font-black text-emerald-400">{fmtQty(r.quantity_on_hand, item?.unit)}</p>
                  {r.avg_unit_cost > 0 && <p className="text-[10px] text-slate-500">{fmtINR(rowVal)}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

// ── STORES TAB ────────────────────────────────────────────────────────────────
function StoresTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [detailStore, setDetailStore] = useState(null)
  const [form, setForm] = useState({ store_name:'', store_code:'', location:'', in_charge:'' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stores').select('*').eq('company_id', companyId).eq('is_active', true).order('store_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: stockCounts = [] } = useQuery({
    queryKey: ['inv_stock', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_stock').select('store_id, quantity_on_hand, avg_unit_cost').eq('company_id', companyId)
      return data || []
    },
    enabled: !!companyId,
  })

  const storeStats = useMemo(() => {
    const m = {}
    stockCounts.forEach(s => {
      if (!m[s.store_id]) m[s.store_id] = { items: 0, value: 0 }
      m[s.store_id].items++
      m[s.store_id].value += (s.quantity_on_hand || 0) * (s.avg_unit_cost || 0)
    })
    return m
  }, [stockCounts])

  const save = async () => {
    if (!form.store_name.trim()) return toast.error('Store name required')
    setSaving(true)
    try {
      const { error } = await supabase.from('stores').insert({
        company_id: companyId, store_name: form.store_name.trim(),
        store_code: form.store_code?.trim() || null, location: form.location?.trim() || null,
        in_charge: form.in_charge?.trim() || null, created_by: session.user.id,
      })
      if (error) throw error
      toast.success('Store added')
      setShowCreate(false); setForm({ store_name:'', store_code:'', location:'', in_charge:'' })
      qc.invalidateQueries(['stores', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{stores.length} stores</span>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Store</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : stores.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><Store className="w-10 h-10 text-slate-700" /><p>No stores added yet</p></div>
        : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stores.map(s => {
            const stats = storeStats[s.id] || { items: 0, value: 0 }
            return (
              <div key={s.id}
                onClick={() => setDetailStore(s)}
                className="bg-dark-800 border border-dark-700 rounded-xl p-4 cursor-pointer hover:border-primary-600/60 hover:bg-dark-750 transition-colors group">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-100">{s.store_name}</p>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-primary-400 transition-colors" />
                    </div>
                    {s.store_code && <p className="text-xs font-mono text-primary-500">{s.store_code}</p>}
                    {s.location && <p className="text-xs text-slate-500 mt-0.5">📍 {s.location}</p>}
                    {s.in_charge && <p className="text-xs text-slate-500">👤 {s.in_charge}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-slate-100">{stats.items}</p>
                    <p className="text-[10px] text-slate-500">item types</p>
                    <p className="text-xs text-primary-400 font-semibold mt-1">{fmtINR(stats.value)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>}
      </div>

      {showCreate && (
        <Modal title="Add Store / Location" onClose={() => setShowCreate(false)}
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Store'}</button></>}>
          <Field label="Store Name *"><input className={inp()} value={form.store_name} onChange={e => setF('store_name', e.target.value)} placeholder="Main Yard, Site A Store, Workshop..." /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Store Code"><input className={inp()} value={form.store_code} onChange={e => setF('store_code', e.target.value)} placeholder="STR-01" /></Field>
            <Field label="In-charge Name"><input className={inp()} value={form.in_charge} onChange={e => setF('in_charge', e.target.value)} /></Field>
          </div>
          <Field label="Location / Address"><input className={inp()} value={form.location} onChange={e => setF('location', e.target.value)} /></Field>
        </Modal>
      )}
      {detailStore && (
        <StoreDetailModal store={detailStore} companyId={companyId} onClose={() => setDetailStore(null)} />
      )}
    </div>
  )
}

// ── SHARED: Transaction form helper hooks ─────────────────────────────────────
function useInventoryData(companyId) {
  const { data: invItems = [] } = useQuery({
    queryKey: ['inv_items_active', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_items').select('id, item_name, item_code, unit, avg_unit_cost, grade_id').eq('company_id', companyId).eq('is_active', true).order('item_name')
      return data || []
    },
    enabled: !!companyId,
  })
  // Crusher grades from material master — shown in item picker for crusher industry
  const { data: grades = [] } = useQuery({
    queryKey: ['crusher-grades-inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_grades').select('id, grade_name, default_uom, hsn_code, default_rate').eq('company_id', companyId).order('grade_name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Merge: existing inventory items + grades not yet in inventory
  const gradeItemIds = new Set(invItems.filter(i => i.grade_id).map(i => i.grade_id))
  const gradeItems = grades
    .filter(g => !gradeItemIds.has(g.id))
    .map(g => ({ id: `grade:${g.id}`, item_name: g.grade_name, item_code: null, unit: g.default_uom || 'tonnes', avg_unit_cost: g.default_rate || 0, _isGrade: true, _grade: g }))
  const items = [...invItems, ...gradeItems]

  const { data: invStores = [] } = useQuery({
    queryKey: ['stores', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stores').select('id, store_name, loading_point_id').eq('company_id', companyId).eq('is_active', true).order('store_name')
      return data || []
    },
    enabled: !!companyId,
  })
  // Loading points act as stores in crusher operations
  const { data: loadingPoints = [] } = useQuery({
    queryKey: ['loading-pts-inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_loading_points').select('id, point_name, point_type').eq('company_id', companyId).order('sort_order')
      return data || []
    },
    enabled: !!companyId,
  })

  // Merge: existing stores + loading points not yet mapped to a store
  const mappedLpIds = new Set(invStores.filter(s => s.loading_point_id).map(s => s.loading_point_id))
  const lpStores = loadingPoints
    .filter(lp => !mappedLpIds.has(lp.id))
    .map(lp => ({ id: `lp:${lp.id}`, store_name: lp.point_name, _isLP: true, _lp: lp }))
  const stores = [...invStores, ...lpStores]

  const { data: projects = [] } = useQuery({
    queryKey: ['projects_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, project_name, project_code').eq('company_id', companyId).eq('status', 'active').order('project_name').limit(100)
      return data || []
    },
    enabled: !!companyId,
  })
  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id, name, equipment_number').eq('company_id', companyId).order('equipment_number').limit(100)
      return data || []
    },
    enabled: !!companyId,
  })
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name').eq('company_id', companyId).order('name').limit(100)
      return data || []
    },
    enabled: !!companyId,
  })
  return { items, stores, projects, equipment, vendors, grades, loadingPoints: loadingPoints }
}

// Resolve virtual item_id (grade:xxx) → real inventory_items.id, creating if needed
async function resolveItemId(companyId, itemId, items, userId) {
  if (!itemId.startsWith('grade:')) return itemId
  const gradeId = itemId.replace('grade:', '')
  const item = items.find(i => i.id === itemId)
  if (!item) throw new Error('Grade not found')
  const g = item._grade
  // Auto item_code: look at existing codes like GRD-001
  const { data: existing } = await supabase.from('inventory_items')
    .select('item_code').eq('company_id', companyId).like('item_code', 'GRD-%').order('item_code', { ascending: false }).limit(1)
  let seq = 1
  if (existing?.length) {
    const parsed = parseInt(existing[0].item_code.replace('GRD-', ''), 10)
    if (!isNaN(parsed)) seq = parsed + 1
  }
  const item_code = `GRD-${String(seq).padStart(3, '0')}`
  const { data: created, error } = await supabase.from('inventory_items').insert({
    company_id: companyId, item_code, item_name: g.grade_name,
    category: 'finished_good', unit: g.default_uom || 'tonnes',
    hsn_code: g.hsn_code || null, avg_unit_cost: g.default_rate || 0,
    grade_id: gradeId, is_active: true, created_by: userId,
  }).select('id').single()
  if (error) throw error
  return created.id
}

// Resolve virtual store_id (lp:xxx) → real stores.id, creating if needed
async function resolveStoreId(companyId, storeId, stores) {
  if (!storeId.startsWith('lp:')) return storeId
  const lpId = storeId.replace('lp:', '')
  const s = stores.find(x => x.id === storeId)
  if (!s) throw new Error('Loading point not found')
  // Check if a store already exists for this loading point (race condition guard)
  const { data: existing } = await supabase.from('stores').select('id').eq('company_id', companyId).eq('loading_point_id', lpId).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await supabase.from('stores').insert({
    company_id: companyId, store_name: s.store_name,
    store_code: null, location: s.store_name,
    loading_point_id: lpId, is_active: true,
  }).select('id').single()
  if (error) throw error
  return created.id
}

// ── STOCK IN TAB ──────────────────────────────────────────────────────────────
function StockInTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [receiptMode, setReceiptMode] = useState('direct') // 'direct' | 'against_bill'
  const [linkBillId, setLinkBillId]   = useState('')
  const [autoDraft, setAutoDraft]     = useState(true)
  const blankForm = () => ({ item_id:'', store_id:'', quantity:'', unit:'tonnes', unit_cost:'', txn_date: todayStr(), vendor_id:'', notes:'', vehicle_number:'', delivery_mode:'supplier_vehicle' })
  const [form, setForm] = useState(blankForm())
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const { items, stores, vendors } = useInventoryData(companyId)

  // Vehicles for crusher grade stock-in
  const { data: vehicles = [] } = useQuery({
    queryKey: ['crusher-vehicles-inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_vehicles')
        .select('id, vehicle_number, vehicle_type').eq('company_id', companyId).order('vehicle_number')
      return data || []
    },
    enabled: !!companyId,
  })

  // Open bills for "receive against bill" mode
  const { data: openBills = [] } = useQuery({
    queryKey: ['open-bills-stkin', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bills')
        .select('id, bill_number, vendor_id, vendor_name, balance_due, bill_date, status')
        .eq('company_id', companyId).in('status', ['draft','pending','partial'])
        .order('bill_date', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ['stxn_in', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_transactions').select('*, inventory_items(item_name, unit), stores(store_name)').eq('company_id', companyId).eq('txn_type', 'in').order('created_at', { ascending: false }).limit(100)
      return data || []
    },
    enabled: !!companyId,
  })

  const total  = (parseFloat(form.quantity) || 0) * (parseFloat(form.unit_cost) || 0)

  const save = async () => {
    if (!form.item_id)  return toast.error('Select an item')
    if (!form.store_id) return toast.error('Select a store / loading point')
    if (!form.quantity || parseFloat(form.quantity) <= 0) return toast.error('Enter valid quantity')
    if (receiptMode === 'against_bill' && !linkBillId) return toast.error('Select a bill to receive against')
    setSaving(true)
    try {
      const realItemId  = await resolveItemId(companyId, form.item_id, items, session.user.id)
      const realStoreId = await resolveStoreId(companyId, form.store_id, stores)
      const txnNum = await nextDocNumber(companyId, 'stock_in').catch(() => `GRN-${Date.now()}`)
      const selectedItem = items.find(i => i.id === form.item_id)
      const isCrusherGrade = !!(selectedItem?._isGrade || selectedItem?.grade_id)

      let billIdToLink   = null
      let vendorIdForTxn = form.vendor_id || null
      let requiresBill   = false

      if (receiptMode === 'against_bill') {
        // Link directly to existing bill — bill already exists, no further action needed
        billIdToLink = linkBillId
        const linkedBill = openBills.find(b => b.id === linkBillId)
        vendorIdForTxn = linkedBill?.vendor_id || vendorIdForTxn
        requiresBill   = false
      } else {
        // Direct receipt mode
        if (form.vendor_id && autoDraft) {
          // Auto-create a draft bill for this supplier
          const vendor = vendors.find(v => v.id === form.vendor_id)
          const blNum  = await nextDocNumber(companyId, 'bill').catch(() => `BL-${Date.now()}`)
          const draftId = crypto.randomUUID()
          const modeNote = form.delivery_mode === 'own_vehicle'
            ? ' (Material cost only — transport via own vehicle, tracked separately)'
            : ' (Material + transport cost)'
          const { error: billErr } = await supabase.from('bills').insert({
            id: draftId,
            company_id: companyId,
            bill_number: blNum,
            vendor_id: form.vendor_id,
            vendor_name: vendor?.name || '',
            bill_date: form.txn_date,
            subtotal: total,
            total_amount: total,
            paid_amount: 0,
            balance_due: total,
            status: 'draft',
            notes: `Auto-draft from stock receipt ${txnNum}${modeNote}`,
            created_by: session.user.id,
          })
          if (billErr) throw billErr
          billIdToLink = draftId
          requiresBill = false
        } else {
          // No supplier / no auto draft — flag as pending
          requiresBill = isCrusherGrade
        }
      }

      const { error } = await supabase.from('stock_transactions').insert({
        company_id: companyId, txn_number: txnNum, txn_type: 'in',
        txn_date: form.txn_date, item_id: realItemId, store_id: realStoreId,
        quantity: parseFloat(form.quantity), unit: form.unit || null,
        unit_cost: parseFloat(form.unit_cost) || 0,
        total_cost: total,
        vendor_id: vendorIdForTxn,
        notes: form.notes || null, created_by: session.user.id,
        vehicle_number: isCrusherGrade ? (form.vehicle_number?.trim() || null) : null,
        requires_bill: requiresBill,
        bill_id: billIdToLink || null,
        delivery_mode: receiptMode === 'direct' && form.vendor_id ? form.delivery_mode : null,
        supplier_name: receiptMode === 'direct' && form.vendor_id ? (vendors.find(v => v.id === form.vendor_id)?.name || null) : null,
      })
      if (error) throw error

      // ── Update inventory_stock (upsert: add qty, recalculate weighted avg cost) ──
      const qty  = parseFloat(form.quantity)
      const cost = parseFloat(form.unit_cost) || 0
      const { data: existing } = await supabase.from('inventory_stock')
        .select('id, quantity_on_hand, avg_unit_cost')
        .eq('company_id', companyId).eq('item_id', realItemId).eq('store_id', realStoreId)
        .maybeSingle()
      if (existing) {
        const oldQty  = Number(existing.quantity_on_hand) || 0
        const oldCost = Number(existing.avg_unit_cost)    || 0
        const newQty  = oldQty + qty
        const newAvg  = newQty > 0 ? ((oldQty * oldCost) + (qty * cost)) / newQty : cost
        await supabase.from('inventory_stock').update({
          quantity_on_hand: newQty, avg_unit_cost: newAvg,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      } else {
        await supabase.from('inventory_stock').insert({
          company_id: companyId, item_id: realItemId, store_id: realStoreId,
          quantity_on_hand: qty, avg_unit_cost: cost,
        })
      }

      if (receiptMode === 'against_bill')
        toast.success(`Stock received — ${txnNum} · Linked to bill`)
      else if (billIdToLink)
        toast.success(`Stock received — ${txnNum} · Draft bill created in Purchase`)
      else if (requiresBill)
        toast.success(`Stock received — ${txnNum} · Bill pending in Purchase`)
      else
        toast.success(`Stock received — ${txnNum}`)

      setShowCreate(false)
      setReceiptMode('direct')
      setLinkBillId('')
      setAutoDraft(true)
      setForm(blankForm())
      qc.invalidateQueries(['pending-stock-bills', companyId])
      qc.invalidateQueries(['open-bills-stkin', companyId])
      qc.invalidateQueries(['stxn_in', companyId])
      qc.invalidateQueries(['inv_stock', companyId])
      qc.invalidateQueries(['inv_items_active', companyId])
      qc.invalidateQueries(['stores', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  // Mark a pending stock receipt as resolved (transfer/manual)
  const markResolved = async (txnId) => {
    await supabase.from('stock_transactions').update({ action_taken: true }).eq('id', txnId)
    qc.invalidateQueries(['stxn_in', companyId])
    qc.invalidateQueries(['pending-stock-bills', companyId])
    toast.success('Receipt marked as resolved')
  }

  // Auto-fill unit cost + UOM from item; clear vehicle when non-grade selected
  const onItemChange = (id) => {
    setF('item_id', id)
    const item = items.find(i => i.id === id)
    if (item?.avg_unit_cost) setF('unit_cost', String(item.avg_unit_cost))
    if (item?.unit) setF('unit', item.unit)
    if (!item?._isGrade) setF('vehicle_number', '')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="text-xs bg-dark-800 rounded-xl px-3 py-2">
          <span className="text-slate-500">Total Receipts </span>
          <span className="font-bold text-emerald-400">{txns.length}</span>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Receive Stock</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : txns.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ArrowDownCircle className="w-10 h-10 text-slate-700" /><p>No stock received yet</p></div>
        : <div className="space-y-2">
          {txns.map(t => (
            <div key={t.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-mono text-primary-500">{t.txn_number}</p>
                  {t.requires_bill && !t.bill_id && !t.action_taken && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">⚠ Action Required</span>}
                  {t.requires_bill && t.bill_id  && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Bill Linked</span>}
                  {t.requires_bill && !t.bill_id && t.action_taken && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">✓ Resolved</span>}
                </div>
                <p className="font-semibold text-slate-100 text-sm">{t.inventory_items?.item_name}</p>
                <p className="text-xs text-slate-500">{t.stores?.store_name} · {fmtDate(t.txn_date)}</p>
                {t.vehicle_number && <p className="text-xs text-slate-400 mt-0.5">🚛 {t.vehicle_number}</p>}
                {t.supplier_name && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    👤 {t.supplier_name}
                    {t.delivery_mode === 'supplier_vehicle' && <span className="ml-1.5 text-[10px] text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded">Supplier vehicle</span>}
                    {t.delivery_mode === 'own_vehicle'      && <span className="ml-1.5 text-[10px] text-purple-400/80 bg-purple-500/10 px-1.5 py-0.5 rounded">Own vehicle</span>}
                  </p>
                )}
                {t.notes && <p className="text-xs text-slate-600 mt-0.5">{t.notes}</p>}
                {/* Action buttons for pending receipts */}
                {t.requires_bill && !t.bill_id && !t.action_taken && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-amber-400/70">Create bill / link bill / record transfer:</span>
                    <button onClick={() => markResolved(t.id)} className="text-[10px] px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-emerald-400 hover:border-emerald-700/50">
                      Mark Transferred ✓
                    </button>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-black text-emerald-400">+{fmtQty(t.quantity, t.unit || t.inventory_items?.unit)}</p>
                {t.total_cost > 0 && <p className="text-xs text-slate-500">{fmtINR(t.total_cost)}</p>}
              </div>
            </div>
          ))}
        </div>}
      </div>

      {showCreate && (() => {
        const invItemsList   = items.filter(i => !i._isGrade)
        const gradeItemsList = items.filter(i =>  i._isGrade)
        const storesList     = stores.filter(s => !s._isLP)
        const lpList         = stores.filter(s =>  s._isLP)
        const selectedItem   = items.find(i => i.id === form.item_id)
        const isCrusherGrade = !!(selectedItem?._isGrade || selectedItem?.grade_id)
        const selectedVendor = vendors.find(v => v.id === form.vendor_id)
        const selectedBill   = openBills.find(b => b.id === linkBillId)
        const costLabel = form.delivery_mode === 'own_vehicle'
          ? 'Material Unit Cost (₹) — no transport'
          : 'Unit Cost (₹) — material + transport'
        return (
        <Modal title="Receive Stock" onClose={() => { setShowCreate(false); setReceiptMode('direct'); setLinkBillId(''); setAutoDraft(true); setForm(blankForm()) }} wide
          footer={<><button onClick={() => { setShowCreate(false); setReceiptMode('direct'); setLinkBillId(''); setAutoDraft(true); setForm(blankForm()) }} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Receipt'}</button></>}>

          {/* ── Receipt Mode ── */}
          <div className="flex rounded-xl overflow-hidden border border-dark-600 mb-4">
            <button
              onClick={() => { setReceiptMode('direct'); setLinkBillId('') }}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${receiptMode === 'direct' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-slate-400 hover:text-slate-200'}`}>
              📦 Direct Receipt
            </button>
            <button
              onClick={() => setReceiptMode('against_bill')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${receiptMode === 'against_bill' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-slate-400 hover:text-slate-200'}`}>
              📄 Against Existing Bill
            </button>
          </div>

          {/* ── Against Bill: pick open bill ── */}
          {receiptMode === 'against_bill' && (
            <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <p className="text-[11px] text-blue-300 mb-2">Select the bill this stock is being received against. The bill must already exist in Purchase.</p>
              <Field label="Open Bill *">
                <select className={inp()} value={linkBillId} onChange={e => setLinkBillId(e.target.value)}>
                  <option value="">-- Select bill --</option>
                  {openBills.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bill_number} · {b.vendor_name} · {fmtINR(b.balance_due)} pending · {fmtDate(b.bill_date)}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedBill && (
                <p className="text-[11px] text-emerald-400 mt-1">✓ Supplier: {selectedBill.vendor_name} · Balance due: {fmtINR(selectedBill.balance_due)}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* ── Item picker ── */}
            <div className="col-span-2">
              <Field label="Item *">
                <select className={inp()} value={form.item_id} onChange={e => onItemChange(e.target.value)}>
                  <option value="">-- Select item --</option>
                  {gradeItemsList.length > 0 && (
                    <optgroup label="── Material Master (Crusher Grades) ──">
                      {gradeItemsList.map(i => <option key={i.id} value={i.id}>{i.item_name} · {i.unit} · auto item code</option>)}
                    </optgroup>
                  )}
                  {invItemsList.length > 0 && (
                    <optgroup label="── Inventory Items ──">
                      {invItemsList.map(i => <option key={i.id} value={i.id}>{i.item_name}{i.item_code ? ` (${i.item_code})` : ''}</option>)}
                    </optgroup>
                  )}
                </select>
              </Field>
              {isCrusherGrade && receiptMode === 'direct' && !form.vendor_id && (
                <p className="text-[11px] text-amber-400/80 mt-1 bg-amber-500/10 rounded px-2 py-1">
                  ⚠ Select Supplier below so we know who to pay — or the bill will appear as pending
                </p>
              )}
            </div>

            {/* ── Vehicle number — crusher grades only ── */}
            {isCrusherGrade && (
              <div className="col-span-2">
                <Field label="Vehicle Number">
                  <div className="flex gap-2">
                    <input
                      list="vehicle-list"
                      className={inp() + ' flex-1'}
                      value={form.vehicle_number}
                      onChange={e => setF('vehicle_number', e.target.value.toUpperCase())}
                      placeholder="e.g. TN 39 AB 1234"
                    />
                    <datalist id="vehicle-list">
                      {vehicles.map(v => <option key={v.id} value={v.vehicle_number}>{v.vehicle_type ? `${v.vehicle_number} · ${v.vehicle_type}` : v.vehicle_number}</option>)}
                    </datalist>
                  </div>
                </Field>
              </div>
            )}

            {/* ── Store / Loading Point ── */}
            <Field label="Store / Loading Point *">
              <select className={inp()} value={form.store_id} onChange={e => setF('store_id', e.target.value)}>
                <option value="">-- Select location --</option>
                {lpList.length > 0 && (
                  <optgroup label="── Loading Points (Crusher) ──">
                    {lpList.map(s => <option key={s.id} value={s.id}>📍 {s.store_name}</option>)}
                  </optgroup>
                )}
                {storesList.length > 0 && (
                  <optgroup label="── Stores / Warehouses ──">
                    {storesList.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
                  </optgroup>
                )}
              </select>
            </Field>

            <Field label="Date"><input type="date" className={inp()} value={form.txn_date} onChange={e => setF('txn_date', e.target.value)} /></Field>

            <Field label="Quantity *">
              <div className="flex items-center gap-2">
                <input type="number" className={inp() + ' flex-1'} value={form.quantity} onChange={e => setF('quantity', e.target.value)} step="0.001" placeholder="0" />
                <select className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-2 text-slate-200 shrink-0 min-w-[80px]" value={form.unit} onChange={e => setF('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </Field>

            <Field label={receiptMode === 'direct' && form.vendor_id ? costLabel : 'Unit Cost (₹)'}>
              <input type="number" className={inp()} value={form.unit_cost} onChange={e => setF('unit_cost', e.target.value)} step="0.01" placeholder="0" />
            </Field>

            {/* ── Supplier section — only for Direct Receipt ── */}
            {receiptMode === 'direct' && (
              <div className="col-span-2 border border-dark-600 rounded-xl p-3 bg-dark-800/50">
                <p className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wide">Supplier / Who to Pay</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Field label="Supplier (Vendor)">
                      <select className={inp()} value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)}>
                        <option value="">-- Select supplier --</option>
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  {form.vendor_id && (<>
                    <div className="col-span-2">
                      <p className="text-[11px] text-slate-500 mb-1.5">How is material being delivered?</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setF('delivery_mode', 'supplier_vehicle')}
                          className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${form.delivery_mode === 'supplier_vehicle' ? 'bg-primary-600/30 border-primary-500 text-primary-300' : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-slate-200'}`}>
                          🚛 Supplier's Vehicle<br />
                          <span className="text-[10px] opacity-70">Bill covers material + transport</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setF('delivery_mode', 'own_vehicle')}
                          className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${form.delivery_mode === 'own_vehicle' ? 'bg-primary-600/30 border-primary-500 text-primary-300' : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-slate-200'}`}>
                          🏗 Our Vehicle<br />
                          <span className="text-[10px] opacity-70">Bill = material only; transport separate</span>
                        </button>
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center gap-2 pt-1">
                      <input id="auto-draft" type="checkbox" checked={autoDraft} onChange={e => setAutoDraft(e.target.checked)} className="w-3.5 h-3.5 rounded accent-primary-500" />
                      <label htmlFor="auto-draft" className="text-xs text-slate-400 cursor-pointer">
                        Auto-create draft bill for <span className="text-slate-200 font-semibold">{selectedVendor?.name}</span> in Purchase
                      </label>
                    </div>
                    {autoDraft && (
                      <p className="col-span-2 text-[11px] text-emerald-400/80 bg-emerald-500/10 rounded px-2 py-1">
                        ✓ A draft bill will be created automatically · Go to Purchase → Bills to review &amp; finalise
                      </p>
                    )}
                  </>)}
                  {!form.vendor_id && (
                    <p className="col-span-2 text-[11px] text-amber-400/70 bg-amber-500/10 rounded px-2 py-1">
                      ⚠ No supplier selected — receipt will show as "Action Required" until a bill is linked or it is marked resolved
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="col-span-2"><Field label="Notes / Reference"><input className={inp()} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field></div>
          </div>
          {total > 0 && (
            <div className="bg-dark-700 rounded-xl p-3 flex justify-between items-center mt-1">
              <span className="text-sm text-slate-400">Total Cost</span>
              <span className="text-base font-bold text-primary-400">{fmtINR(total)}</span>
            </div>
          )}
        </Modal>
        )
      })()}
    </div>
  )
}

// ── STOCK OUT TAB ─────────────────────────────────────────────────────────────
function StockOutTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm] = useState({ item_id:'', store_id:'', quantity:'', unit:'unit', txn_date: todayStr(), project_id:'', equipment_id:'', issued_to:'', notes:'' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const { items, stores, projects, equipment } = useInventoryData(companyId)

  const onItemChangeOut = (id) => {
    setF('item_id', id)
    const item = items.find(i => i.id === id)
    if (item?.unit) setF('unit', item.unit)
  }

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ['stxn_out', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_transactions').select('*, inventory_items(item_name, unit), stores(store_name)').eq('company_id', companyId).eq('txn_type', 'out').order('created_at', { ascending: false }).limit(100)
      return data || []
    },
    enabled: !!companyId,
  })

  // Available stock for selected item+store
  const { data: availableStock } = useQuery({
    queryKey: ['stock_check', form.item_id, form.store_id],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_stock').select('quantity_on_hand').eq('item_id', form.item_id).eq('store_id', form.store_id).single()
      return data?.quantity_on_hand || 0
    },
    enabled: !!form.item_id && !!form.store_id,
  })

  const save = async () => {
    if (!form.item_id)  return toast.error('Select an item')
    if (!form.store_id) return toast.error('Select a store')
    if (!form.quantity || parseFloat(form.quantity) <= 0) return toast.error('Enter valid quantity')
    if (availableStock !== undefined && parseFloat(form.quantity) > availableStock)
      return toast.error(`Only ${fmtQty(availableStock, '')} available in this store`)
    setSaving(true)
    try {
      const issNum = await nextDocNumber(companyId, 'stock_out').catch(() => `ISS-${Date.now()}`)
      const { error } = await supabase.from('stock_transactions').insert({
        company_id: companyId, txn_number: issNum, txn_type: 'out',
        txn_date: form.txn_date, item_id: form.item_id, store_id: form.store_id,
        quantity: parseFloat(form.quantity), unit: form.unit || null,
        project_id: form.project_id || null, equipment_id: form.equipment_id || null,
        issued_to: form.issued_to || null, notes: form.notes || null,
        created_by: session.user.id,
      })
      if (error) throw error

      // ── Deduct from inventory_stock ──
      const qty = parseFloat(form.quantity)
      const { data: existing } = await supabase.from('inventory_stock')
        .select('id, quantity_on_hand').eq('company_id', companyId)
        .eq('item_id', form.item_id).eq('store_id', form.store_id).maybeSingle()
      if (existing) {
        const newQty = Math.max(0, (Number(existing.quantity_on_hand) || 0) - qty)
        await supabase.from('inventory_stock').update({
          quantity_on_hand: newQty, updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      }

      toast.success(`Stock issued — ${issNum}`)
      setShowCreate(false)
      setForm({ item_id:'', store_id:'', quantity:'', unit:'unit', txn_date: todayStr(), project_id:'', equipment_id:'', issued_to:'', notes:'' })
      qc.invalidateQueries(['stxn_out', companyId])
      qc.invalidateQueries(['inv_stock', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <div className="text-xs bg-dark-800 rounded-xl px-3 py-2">
          <span className="text-slate-500">Total Issues </span>
          <span className="font-bold text-red-400">{txns.length}</span>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Issue Stock</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : txns.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><ArrowUpCircle className="w-10 h-10 text-slate-700" /><p>No stock issued yet</p></div>
        : <div className="space-y-2">
          {txns.map(t => (
            <div key={t.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-primary-500">{t.txn_number}</p>
                <p className="font-semibold text-slate-100 text-sm">{t.inventory_items?.item_name}</p>
                <p className="text-xs text-slate-500">{t.stores?.store_name} · {fmtDate(t.txn_date)}</p>
                {t.issued_to && <p className="text-xs text-slate-500">To: {t.issued_to}</p>}
              </div>
              <p className="text-lg font-black text-red-400 shrink-0">-{fmtQty(t.quantity, t.unit || t.inventory_items?.unit)}</p>
            </div>
          ))}
        </div>}
      </div>

      {showCreate && (() => {
        const invItemsList   = items.filter(i => !i._isGrade)
        const gradeItemsList = items.filter(i =>  i._isGrade)
        const storesList     = stores.filter(s => !s._isLP)
        const lpList         = stores.filter(s =>  s._isLP)
        return (
        <Modal title="Issue Stock" onClose={() => setShowCreate(false)} wide
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Issue Stock'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Item *">
                <select className={inp()} value={form.item_id} onChange={e => onItemChangeOut(e.target.value)}>
                  <option value="">-- Select item --</option>
                  {gradeItemsList.length > 0 && <optgroup label="── Material Master (Crusher Grades) ──">{gradeItemsList.map(i => <option key={i.id} value={i.id}>{i.item_name} · {i.unit}</option>)}</optgroup>}
                  {invItemsList.length > 0 && <optgroup label="── Inventory Items ──">{invItemsList.map(i => <option key={i.id} value={i.id}>{i.item_name}{i.item_code ? ` (${i.item_code})` : ''}</option>)}</optgroup>}
                </select>
              </Field>
            </div>
            <Field label="From Store / Loading Point *">
              <select className={inp()} value={form.store_id} onChange={e => setF('store_id', e.target.value)}>
                <option value="">-- Select location --</option>
                {lpList.length > 0 && <optgroup label="── Loading Points (Crusher) ──">{lpList.map(s => <option key={s.id} value={s.id}>📍 {s.store_name}</option>)}</optgroup>}
                {storesList.length > 0 && <optgroup label="── Stores / Warehouses ──">{storesList.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</optgroup>}
              </select>
            </Field>
            <Field label="Date"><input type="date" className={inp()} value={form.txn_date} onChange={e => setF('txn_date', e.target.value)} /></Field>
            <Field label="Quantity *">
              <div className="flex items-center gap-2">
                <input type="number" className={inp() + ' flex-1'} value={form.quantity} onChange={e => setF('quantity', e.target.value)} step="0.001" placeholder="0" />
                <select className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-2 text-slate-200 shrink-0 min-w-[80px]" value={form.unit} onChange={e => setF('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              {availableStock !== undefined && form.store_id && form.item_id &&
                <p className="text-[10px] text-slate-500 mt-0.5">Available: {fmtQty(availableStock, '')}</p>}
            </Field>
            <Field label="Issued To"><input className={inp()} value={form.issued_to} onChange={e => setF('issued_to', e.target.value)} placeholder="Person / department" /></Field>
            <Field label="Link to Equipment">
              <select className={inp()} value={form.equipment_id} onChange={e => setF('equipment_id', e.target.value)}>
                <option value="">-- Equipment (optional) --</option>
                {equipment.map(e => <option key={e.id} value={e.id}>{e.equipment_number} — {e.name}</option>)}
              </select>
            </Field>
            <Field label="Link to Project">
              <select className={inp()} value={form.project_id} onChange={e => setF('project_id', e.target.value)}>
                <option value="">-- Project (optional) --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="Notes"><input className={inp()} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field></div>
          </div>
        </Modal>
        )
      })()}
    </div>
  )
}

// ── TRANSFERS TAB ─────────────────────────────────────────────────────────────
function TransfersTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [reversing, setReversing]   = useState(null)
  const [form, setForm] = useState({ item_id:'', store_id:'', to_store_id:'', quantity:'', txn_date: todayStr(), notes:'' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const { items, stores } = useInventoryData(companyId)

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ['stxn_transfer', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_transactions')
        .select('*, inventory_items(item_name, unit), from_store:stores!store_id(store_name), to_store:stores!to_store_id(store_name)')
        .eq('company_id', companyId).eq('txn_type', 'transfer')
        .order('created_at', { ascending: false }).limit(100)
      return data || []
    },
    enabled: !!companyId,
  })

  const reverseTransfer = async (t) => {
    if (!window.confirm(`Reverse transfer of ${fmtQty(t.quantity, t.inventory_items?.unit)} back from "${t.to_store?.store_name}" to "${t.from_store?.store_name}"?`)) return
    setReversing(t.id)
    try {
      const trfNum = await nextDocNumber(companyId, 'stock_transfer').catch(() => `TRF-${Date.now()}`)
      const { error } = await supabase.from('stock_transactions').insert({
        company_id: companyId, txn_number: trfNum, txn_type: 'transfer',
        txn_date: todayStr(), item_id: t.item_id,
        store_id: t.to_store_id, to_store_id: t.store_id,   // swapped
        quantity: t.quantity, notes: `Reversal of ${t.txn_number}`,
        created_by: session.user.id,
      })
      if (error) throw error
      toast.success(`Transfer reversed — ${trfNum}`)
      qc.invalidateQueries(['stxn_transfer', companyId])
      qc.invalidateQueries(['inv_stock', companyId])
    } catch (e) { toast.error(e.message) } finally { setReversing(null) }
  }

  const save = async () => {
    if (!form.item_id)     return toast.error('Select an item')
    if (!form.store_id)    return toast.error('Select source store')
    if (!form.to_store_id) return toast.error('Select destination store')
    if (form.store_id === form.to_store_id) return toast.error('Source and destination must differ')
    if (!form.quantity || parseFloat(form.quantity) <= 0) return toast.error('Enter valid quantity')
    setSaving(true)
    try {
      const trfNum = await nextDocNumber(companyId, 'stock_transfer').catch(() => `TRF-${Date.now()}`)
      const { error } = await supabase.from('stock_transactions').insert({
        company_id: companyId, txn_number: trfNum, txn_type: 'transfer',
        txn_date: form.txn_date, item_id: form.item_id,
        store_id: form.store_id, to_store_id: form.to_store_id,
        quantity: parseFloat(form.quantity), notes: form.notes || null,
        created_by: session.user.id,
      })
      if (error) throw error
      toast.success(`Stock transferred — ${trfNum}`)
      setShowCreate(false)
      setForm({ item_id:'', store_id:'', to_store_id:'', quantity:'', txn_date: todayStr(), notes:'' })
      qc.invalidateQueries(['stxn_transfer', companyId])
      qc.invalidateQueries(['inv_stock', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{txns.length} transfers</span>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Transfer Stock</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : txns.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><Shuffle className="w-10 h-10 text-slate-700" /><p>No transfers yet</p></div>
        : <div className="space-y-2">
          {txns.map(t => (
            <div key={t.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-primary-500">{t.txn_number}</p>
                <p className="font-semibold text-slate-100 text-sm truncate">{t.inventory_items?.item_name}</p>
                <p className="text-xs text-slate-400">
                  <span className="text-slate-300">{t.from_store?.store_name || '—'}</span>
                  <span className="mx-1 text-slate-600">→</span>
                  <span className="text-slate-300">{t.to_store?.store_name || '—'}</span>
                </p>
                <p className="text-xs text-slate-600 mt-0.5">{fmtDate(t.txn_date)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p className="text-lg font-black text-blue-400">{fmtQty(t.quantity, t.inventory_items?.unit)}</p>
                <button
                  onClick={() => reverseTransfer(t)}
                  disabled={reversing === t.id}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg bg-dark-700 text-orange-400 hover:bg-orange-500/10 border border-orange-700/30 hover:border-orange-500/50 transition-colors disabled:opacity-50"
                  title="Reverse this transfer">
                  {reversing === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                  <span>Reverse</span>
                </button>
              </div>
            </div>
          ))}
        </div>}
      </div>

      {showCreate && (() => {
        const invItemsList   = items.filter(i => !i._isGrade)
        const gradeItemsList = items.filter(i =>  i._isGrade)
        const storesList     = stores.filter(s => !s._isLP)
        const lpList         = stores.filter(s =>  s._isLP)
        const allStoreOpts = (exclude) => (
          <>
            {lpList.filter(s => s.id !== exclude).length > 0 && <optgroup label="── Loading Points (Crusher) ──">{lpList.filter(s => s.id !== exclude).map(s => <option key={s.id} value={s.id}>📍 {s.store_name}</option>)}</optgroup>}
            {storesList.filter(s => s.id !== exclude).length > 0 && <optgroup label="── Stores / Warehouses ──">{storesList.filter(s => s.id !== exclude).map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</optgroup>}
          </>
        )
        return (
        <Modal title="Transfer Stock" onClose={() => setShowCreate(false)} wide
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Transfer'}</button></>}>
          <div className="col-span-2">
            <Field label="Item *">
              <select className={inp()} value={form.item_id} onChange={e => setF('item_id', e.target.value)}>
                <option value="">-- Select item --</option>
                {gradeItemsList.length > 0 && <optgroup label="── Material Master (Crusher Grades) ──">{gradeItemsList.map(i => <option key={i.id} value={i.id}>{i.item_name} · {i.unit}</option>)}</optgroup>}
                {invItemsList.length > 0 && <optgroup label="── Inventory Items ──">{invItemsList.map(i => <option key={i.id} value={i.id}>{i.item_name}{i.item_code ? ` (${i.item_code})` : ''}</option>)}</optgroup>}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="From Store / Loading Point *">
              <select className={inp()} value={form.store_id} onChange={e => setF('store_id', e.target.value)}>
                <option value="">-- Source --</option>
                {allStoreOpts(form.to_store_id)}
              </select>
            </Field>
            <Field label="To Store / Loading Point *">
              <select className={inp()} value={form.to_store_id} onChange={e => setF('to_store_id', e.target.value)}>
                <option value="">-- Destination --</option>
                {allStoreOpts(form.store_id)}
              </select>
            </Field>
            <Field label="Quantity *"><input type="number" className={inp()} value={form.quantity} onChange={e => setF('quantity', e.target.value)} step="0.001" placeholder="0" /></Field>
            <Field label="Date"><input type="date" className={inp()} value={form.txn_date} onChange={e => setF('txn_date', e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Notes"><input className={inp()} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field></div>
          </div>
        </Modal>
        )
      })()}
    </div>
  )
}

// ── ADJUSTMENTS TAB ───────────────────────────────────────────────────────────
function AdjustmentsTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm] = useState({ item_id:'', store_id:'', quantity:'', adj_type:'+', txn_date: todayStr(), reason:'', notes:'' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const { items, stores } = useInventoryData(companyId)

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ['stxn_adj', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_transactions').select('*, inventory_items(item_name, unit), stores(store_name)').eq('company_id', companyId).eq('txn_type', 'adjustment').order('created_at', { ascending: false }).limit(100)
      return data || []
    },
    enabled: !!companyId,
  })

  const REASONS = ['Physical audit correction','Damage / Breakage','Expired / Obsolete','Theft / Loss','System correction','Opening balance','Other']

  const save = async () => {
    if (!form.item_id)  return toast.error('Select an item')
    if (!form.store_id) return toast.error('Select a store')
    if (!form.quantity || parseFloat(form.quantity) <= 0) return toast.error('Enter valid quantity')
    setSaving(true)
    try {
      const adjNum = await nextDocNumber(companyId, 'stock_adjustment').catch(() => `ADJ-${Date.now()}`)
      const delta = form.adj_type === '-' ? -Math.abs(parseFloat(form.quantity)) : Math.abs(parseFloat(form.quantity))
      const { error } = await supabase.from('stock_transactions').insert({
        company_id: companyId, txn_number: adjNum, txn_type: 'adjustment',
        txn_date: form.txn_date, item_id: form.item_id, store_id: form.store_id,
        quantity: delta, reason: form.reason || null, notes: form.notes || null,
        created_by: session.user.id,
      })
      if (error) throw error
      toast.success(`Adjustment ${adjNum} recorded`)
      setShowCreate(false)
      setForm({ item_id:'', store_id:'', quantity:'', adj_type:'+', txn_date: todayStr(), reason:'', notes:'' })
      qc.invalidateQueries(['stxn_adj', companyId])
      qc.invalidateQueries(['inv_stock', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between">
        <span className="text-xs bg-dark-800 rounded-xl px-3 py-2 text-slate-500">{txns.length} adjustments</span>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> Adjust Stock</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        : txns.length === 0 ? <div className="flex flex-col items-center py-16 gap-2 text-slate-500"><RefreshCcw className="w-10 h-10 text-slate-700" /><p>No adjustments yet</p></div>
        : <div className="space-y-2">
          {txns.map(t => (
            <div key={t.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-primary-500">{t.txn_number}</p>
                <p className="font-semibold text-slate-100 text-sm">{t.inventory_items?.item_name}</p>
                <p className="text-xs text-slate-500">{t.stores?.store_name} · {fmtDate(t.txn_date)}</p>
                {t.reason && <p className="text-xs text-slate-500 italic">{t.reason}</p>}
              </div>
              <p className={`text-lg font-black shrink-0 ${t.quantity >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {t.quantity >= 0 ? '+' : ''}{fmtQty(t.quantity, t.inventory_items?.unit)}
              </p>
            </div>
          ))}
        </div>}
      </div>

      {showCreate && (() => {
        const invItemsList   = items.filter(i => !i._isGrade)
        const gradeItemsList = items.filter(i =>  i._isGrade)
        const storesList     = stores.filter(s => !s._isLP)
        const lpList         = stores.filter(s =>  s._isLP)
        return (
        <Modal title="Stock Adjustment" onClose={() => setShowCreate(false)} wide
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Adjustment'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Item *">
                <select className={inp()} value={form.item_id} onChange={e => setF('item_id', e.target.value)}>
                  <option value="">-- Select item --</option>
                  {gradeItemsList.length > 0 && <optgroup label="── Material Master (Crusher Grades) ──">{gradeItemsList.map(i => <option key={i.id} value={i.id}>{i.item_name} · {i.unit}</option>)}</optgroup>}
                  {invItemsList.length > 0 && <optgroup label="── Inventory Items ──">{invItemsList.map(i => <option key={i.id} value={i.id}>{i.item_name}{i.item_code ? ` (${i.item_code})` : ''}</option>)}</optgroup>}
                </select>
              </Field>
            </div>
            <Field label="Store / Loading Point *">
              <select className={inp()} value={form.store_id} onChange={e => setF('store_id', e.target.value)}>
                <option value="">-- Select location --</option>
                {lpList.length > 0 && <optgroup label="── Loading Points (Crusher) ──">{lpList.map(s => <option key={s.id} value={s.id}>📍 {s.store_name}</option>)}</optgroup>}
                {storesList.length > 0 && <optgroup label="── Stores / Warehouses ──">{storesList.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</optgroup>}
              </select>
            </Field>
            <Field label="Date"><input type="date" className={inp()} value={form.txn_date} onChange={e => setF('txn_date', e.target.value)} /></Field>
            <Field label="Adjustment Type">
              <div className="flex gap-2">
                {[{v:'+', label:'Add (+)', col:'border-emerald-500 bg-emerald-500/10 text-emerald-400'}, {v:'-', label:'Remove (-)', col:'border-red-500 bg-red-500/10 text-red-400'}].map(o => (
                  <button key={o.v} type="button" onClick={() => setF('adj_type', o.v)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors ${form.adj_type === o.v ? o.col : 'border-dark-600 text-slate-500 hover:border-slate-500'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Quantity *"><input type="number" className={inp()} value={form.quantity} onChange={e => setF('quantity', e.target.value)} step="0.001" placeholder="0" /></Field>
            <div className="col-span-2">
              <Field label="Reason">
                <select className={inp()} value={form.reason} onChange={e => setF('reason', e.target.value)}>
                  <option value="">-- Select reason --</option>
                  {REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
            </div>
            <div className="col-span-2"><Field label="Notes"><input className={inp()} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field></div>
          </div>
        </Modal>
        )
      })()}
    </div>
  )
}

// ── MAIN INVENTORY PAGE ───────────────────────────────────────────────────────
export default function InventoryPage() {
  const { companyId, session } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview',     label: 'Overview',      icon: LayoutDashboard },
    { id: 'items',        label: 'Items',          icon: Package },
    { id: 'stores',       label: 'Stores',         icon: Store },
    { id: 'stock_in',     label: 'Stock In',       icon: ArrowDownCircle },
    { id: 'stock_out',    label: 'Stock Out',      icon: ArrowUpCircle },
    { id: 'transfers',    label: 'Transfers',      icon: Shuffle },
    { id: 'adjustments',  label: 'Adjustments',   icon: RefreshCcw },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 shrink-0 border-b border-dark-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-700/40 flex items-center justify-center">
            <Package className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Inventory</h1>
            <p className="text-xs text-slate-500">Items · Stores · Stock Movements</p>
          </div>
        </div>
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.id ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'overview'    && <OverviewTab     companyId={companyId} onNavigate={setActiveTab} />}
        {activeTab === 'items'       && <ItemsTab        companyId={companyId} session={session} />}
        {activeTab === 'stores'      && <StoresTab       companyId={companyId} session={session} />}
        {activeTab === 'stock_in'    && <StockInTab      companyId={companyId} session={session} />}
        {activeTab === 'stock_out'   && <StockOutTab     companyId={companyId} session={session} />}
        {activeTab === 'transfers'   && <TransfersTab    companyId={companyId} session={session} />}
        {activeTab === 'adjustments' && <AdjustmentsTab  companyId={companyId} session={session} />}
      </div>
    </div>
  )
}
