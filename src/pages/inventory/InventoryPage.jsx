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

const UNITS = ['unit','nos','kg','g','ton','litre','ml','m','m2','m3','ft','inch','set','box','bag','pair','roll','sheet','length']

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
function OverviewTab({ companyId }) {
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
      const { data } = await supabase.from('inventory_stock').select('*, inventory_items(item_name, item_code, unit, min_stock_level, category), stores(store_name)').eq('company_id', companyId)
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: recentTxns = [] } = useQuery({
    queryKey: ['inv_txns_recent', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_transactions').select('*, inventory_items(item_name, unit), stores(store_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(15)
      return data || []
    },
    enabled: !!companyId,
  })

  const lowStock = stock.filter(s => {
    const minLevel = s.inventory_items?.min_stock_level || 0
    return minLevel > 0 && s.quantity_on_hand <= minLevel
  })

  const totalValue = stock.reduce((sum, s) => sum + (s.quantity_on_hand * (s.avg_unit_cost || s.inventory_items?.avg_unit_cost || 0)), 0)

  const TXN_ICON = { in: ArrowDownCircle, out: ArrowUpCircle, transfer: Shuffle, adjustment: RefreshCcw }
  const TXN_COLOR = { in: 'text-emerald-400', out: 'text-red-400', transfer: 'text-blue-400', adjustment: 'text-orange-400' }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Items',    value: items.length,         sub: 'in catalog',          color: 'text-slate-100' },
          { label: 'Stock Entries',  value: stock.length,         sub: 'item-store pairs',    color: 'text-slate-100' },
          { label: 'Low Stock',      value: lowStock.length,      sub: 'below minimum',       color: lowStock.length > 0 ? 'text-red-400' : 'text-emerald-400' },
          { label: 'Total Value',    value: fmtINR(totalValue),   sub: 'at avg cost',         color: 'text-primary-400' },
        ].map(c => (
          <div key={c.label} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Low Stock Alerts
          </p>
          <div className="space-y-2">
            {lowStock.map(s => (
              <div key={s.id} className="bg-red-500/5 border border-red-700/30 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{s.inventory_items?.item_name}</p>
                  <p className="text-xs text-slate-500">{s.stores?.store_name} · Min: {fmtQty(s.inventory_items?.min_stock_level, s.inventory_items?.unit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-red-400">{fmtQty(s.quantity_on_hand, s.inventory_items?.unit)}</p>
                  <p className="text-[10px] text-red-500">below minimum</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock by category */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Stock by Category</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORIES.map(cat => {
            const catItems = items.filter(i => i.category === cat.value)
            const Icon = cat.icon
            return (
              <div key={cat.value} className={`bg-dark-800 border rounded-xl p-3 flex items-center gap-3 border-dark-700`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.bg} shrink-0`}>
                  <Icon className={`w-4 h-4 ${cat.color}`} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{cat.label}</p>
                  <p className="text-base font-bold text-slate-100">{catItems.length} <span className="text-xs font-normal text-slate-500">items</span></p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent movements */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Recent Movements</p>
        {recentTxns.length === 0
          ? <p className="text-sm text-slate-600 py-4 text-center">No transactions yet</p>
          : <div className="space-y-1.5">
            {recentTxns.map(t => {
              const Icon = TXN_ICON[t.txn_type] || Package
              const col  = TXN_COLOR[t.txn_type] || 'text-slate-400'
              return (
                <div key={t.id} className="bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${col}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-100 truncate">{t.inventory_items?.item_name}</p>
                    <p className="text-xs text-slate-500">{t.txn_number} · {t.stores?.store_name} · {fmtDate(t.txn_date)}</p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${col}`}>
                    {t.txn_type === 'out' ? '-' : t.txn_type === 'adjustment' && t.quantity < 0 ? '' : '+'}
                    {fmtQty(Math.abs(t.quantity), t.inventory_items?.unit)}
                  </p>
                </div>
              )
            })}
          </div>
        }
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
        : <div className="space-y-2 mt-1">
          {displayed.map(item => {
            const qoh = stockMap[item.id] || 0
            const low = item.min_stock_level > 0 && qoh <= item.min_stock_level
            return (
              <div key={item.id} className={`bg-dark-800 border rounded-xl p-4 transition-colors ${low ? 'border-red-700/40' : 'border-dark-700'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.item_code && <span className="text-[10px] font-mono text-primary-500">{item.item_code}</span>}
                      <CategoryBadge cat={item.category} />
                      {!item.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-300">Inactive</span>}
                      {low && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-700/30">Low Stock</span>}
                    </div>
                    <p className="font-semibold text-slate-100 text-sm mt-0.5">{item.item_name}</p>
                    {item.brand && <p className="text-xs text-slate-500">{item.brand}{item.sub_category ? ` · ${item.sub_category}` : ''}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-black ${low ? 'text-red-400' : 'text-slate-100'}`}>{fmtQty(qoh, item.unit)}</p>
                    <p className="text-[10px] text-slate-500">on hand</p>
                    {item.avg_unit_cost > 0 && <p className="text-xs text-slate-500">{fmtINR(item.avg_unit_cost)}/{item.unit}</p>}
                  </div>
                </div>
                {item.min_stock_level > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>Stock level</span>
                      <span>Min: {fmtQty(item.min_stock_level, item.unit)}</span>
                    </div>
                    <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${low ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, (qoh / (item.min_stock_level * 2)) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-3 justify-end">
                  <button onClick={() => openEdit(item)} className="text-xs px-2 py-1 rounded-lg border border-dark-600 text-slate-400 hover:text-slate-100 hover:border-slate-500">
                    <Edit2 className="w-3 h-3 inline mr-1" />Edit
                  </button>
                  <button onClick={() => toggleActive(item)} className={`text-xs px-2 py-1 rounded-lg border ${item.is_active ? 'border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-700/40' : 'border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20'}`}>
                    {item.is_active ? 'Deactivate' : 'Activate'}
                  </button>
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

// ── STORES TAB ────────────────────────────────────────────────────────────────
function StoresTab({ companyId, session }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving]         = useState(false)
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
              <div key={s.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-100">{s.store_name}</p>
                    {s.store_code && <p className="text-xs font-mono text-primary-500">{s.store_code}</p>}
                    {s.location && <p className="text-xs text-slate-500 mt-0.5">📍 {s.location}</p>}
                    {s.in_charge && <p className="text-xs text-slate-500">👤 {s.in_charge}</p>}
                  </div>
                  <div className="text-right">
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
  const [form, setForm] = useState({ item_id:'', store_id:'', quantity:'', unit_cost:'', txn_date: todayStr(), vendor_id:'', po_id:'', notes:'', vehicle_number:'' })
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
    setSaving(true)
    try {
      // Resolve virtual IDs (grade:xxx → real inventory_item, lp:xxx → real store)
      const realItemId  = await resolveItemId(companyId, form.item_id, items, session.user.id)
      const realStoreId = await resolveStoreId(companyId, form.store_id, stores)
      const txnNum = await nextDocNumber(companyId, 'stock_in').catch(() => `GRN-${Date.now()}`)
      const selectedItem = items.find(i => i.id === form.item_id)
      const isCrusherGrade = !!(selectedItem?._isGrade || selectedItem?.grade_id)
      const { error } = await supabase.from('stock_transactions').insert({
        company_id: companyId, txn_number: txnNum, txn_type: 'in',
        txn_date: form.txn_date, item_id: realItemId, store_id: realStoreId,
        quantity: parseFloat(form.quantity), unit_cost: parseFloat(form.unit_cost) || 0,
        total_cost: total, vendor_id: form.vendor_id || null, po_id: form.po_id || null,
        notes: form.notes || null, created_by: session.user.id,
        vehicle_number: isCrusherGrade ? (form.vehicle_number?.trim() || null) : null,
        requires_bill: isCrusherGrade,
      })
      if (error) throw error
      if (isCrusherGrade) toast.success(`Stock received — ${txnNum} · Bill pending in Purchase`)
      else toast.success(`Stock received — ${txnNum}`)
      setShowCreate(false)
      setForm({ item_id:'', store_id:'', quantity:'', unit_cost:'', txn_date: todayStr(), vendor_id:'', po_id:'', notes:'', vehicle_number:'' })
      qc.invalidateQueries(['pending-stock-bills', companyId])
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

  // Auto-fill unit cost from item's avg cost; clear vehicle when non-grade selected
  const onItemChange = (id) => {
    setF('item_id', id)
    const item = items.find(i => i.id === id)
    if (item?.avg_unit_cost) setF('unit_cost', String(item.avg_unit_cost))
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
                <p className="text-lg font-black text-emerald-400">+{fmtQty(t.quantity, t.inventory_items?.unit)}</p>
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
        return (
        <Modal title="Receive Stock" onClose={() => setShowCreate(false)} wide
          footer={<><button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="flex-1 btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Receipt'}</button></>}>
          <div className="grid grid-cols-2 gap-3">
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
              {isCrusherGrade && (
                <p className="text-[11px] text-amber-400/80 mt-1 bg-amber-500/10 rounded px-2 py-1">
                  ⚡ Auto item code (GRD-xxx) will be generated · A bill will be required in Purchase after saving
                </p>
              )}
            </div>

            {/* Vehicle number — shown only for crusher grade items */}
            {isCrusherGrade && (
              <div className="col-span-2">
                <Field label="Vehicle Number *">
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
            <Field label={`Quantity *${selectedItem?.unit ? ` (${selectedItem.unit})` : ''}`}>
              <div className="flex items-center gap-2">
                <input type="number" className={inp() + ' flex-1'} value={form.quantity} onChange={e => setF('quantity', e.target.value)} step="0.001" placeholder="0" />
                {selectedItem?.unit && <span className="text-xs font-bold text-primary-400 bg-primary-500/10 border border-primary-500/30 rounded-lg px-2.5 py-2 shrink-0 uppercase">{selectedItem.unit}</span>}
              </div>
            </Field>
            <Field label="Unit Cost (₹)"><input type="number" className={inp()} value={form.unit_cost} onChange={e => setF('unit_cost', e.target.value)} step="0.01" placeholder="0" /></Field>
            {vendors.length > 0 && <Field label="Vendor">
              <select className={inp()} value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)}>
                <option value="">-- Vendor (optional) --</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>}
            <div className="col-span-2"><Field label="Notes / Reference (e.g. Bill No.)"><input className={inp()} value={form.notes} onChange={e => setF('notes', e.target.value)} /></Field></div>
          </div>
          {total > 0 && <div className="bg-dark-700 rounded-xl p-3 flex justify-between items-center"><span className="text-sm text-slate-400">Total Cost</span><span className="text-base font-bold text-primary-400">{fmtINR(total)}</span></div>}
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
  const [form, setForm] = useState({ item_id:'', store_id:'', quantity:'', txn_date: todayStr(), project_id:'', equipment_id:'', issued_to:'', notes:'' })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const { items, stores, projects, equipment } = useInventoryData(companyId)

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
        quantity: parseFloat(form.quantity),
        project_id: form.project_id || null, equipment_id: form.equipment_id || null,
        issued_to: form.issued_to || null, notes: form.notes || null,
        created_by: session.user.id,
      })
      if (error) throw error
      toast.success(`Stock issued — ${issNum}`)
      setShowCreate(false)
      setForm({ item_id:'', store_id:'', quantity:'', txn_date: todayStr(), project_id:'', equipment_id:'', issued_to:'', notes:'' })
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
              <p className="text-lg font-black text-red-400 shrink-0">-{fmtQty(t.quantity, t.inventory_items?.unit)}</p>
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
                <select className={inp()} value={form.item_id} onChange={e => setF('item_id', e.target.value)}>
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
              <input type="number" className={inp()} value={form.quantity} onChange={e => setF('quantity', e.target.value)} step="0.001" placeholder="0" />
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
        {activeTab === 'overview'    && <OverviewTab     companyId={companyId} />}
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
