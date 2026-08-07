import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { nextDocNumber } from '../../utils/docNumbers'
import toast from 'react-hot-toast'
import {
  Plus, X, Search, ChevronDown, ChevronRight, Trash2, Pencil,
  FileText, FolderOpen, Loader2, BarChart3, IndianRupee,
  ArrowLeft, Check, CircleDot, Hash, AlertTriangle, Download,
  ClipboardList, Building2,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR = (n) => {
  if (!n && n !== 0) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const pct = (done, total) => total > 0 ? Math.min(100, (done / total) * 100) : 0

const inp = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`
const LINE_UNITS = ['nos','m','m²','m³','kg','MT','L','km','bag','sqft','rft','lot','set','hr','day','ls']

const STATUS_CFG = {
  draft:     { label: 'Draft',     cls: 'bg-slate-500/10 text-slate-400 border-slate-600/50' },
  active:    { label: 'Active',    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40' },
  completed: { label: 'Completed', cls: 'bg-blue-500/10 text-blue-400 border-blue-700/40' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-500/10 text-red-400 border-red-700/40' },
}

const RA_STATUS_CFG = {
  draft:     { label: 'Draft',     cls: 'bg-slate-500/10 text-slate-400 border-slate-600/50' },
  submitted: { label: 'Submitted', cls: 'bg-amber-500/10 text-amber-400 border-amber-700/40' },
  approved:  { label: 'Approved',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40' },
  paid:      { label: 'Paid',      cls: 'bg-blue-500/10 text-blue-400 border-blue-700/40' },
}

function StatusBadge({ status, cfg }) {
  const c = cfg[status] || cfg.draft
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>
}

function ProgressBar({ value, color = 'bg-primary-500' }) {
  const v = Math.min(100, Math.max(0, value || 0))
  const barColor = v >= 100 ? 'bg-emerald-500' : v > 75 ? 'bg-primary-500' : v > 40 ? 'bg-amber-500' : 'bg-slate-600'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${v}%` }} />
      </div>
      <span className={`text-[10px] font-bold w-9 text-right ${v >= 100 ? 'text-emerald-400' : 'text-slate-400'}`}>{v.toFixed(0)}%</span>
    </div>
  )
}

// ── BOQ List ──────────────────────────────────────────────────────────────────
function BOQList({ companyId, session, onSelect }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankForm = () => ({ title: '', client_id: '', client_name: '', project_id: '', project_name: '', valid_from: todayStr(), valid_to: '', notes: '' })
  const [form, setForm] = useState(blankForm())
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: boqs = [], isLoading } = useQuery({
    queryKey: ['boq_documents', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('boq_documents').select('*')
        .eq('company_id', companyId).order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients_simple', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, display_name, business_name').eq('company_id', companyId).order('display_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects_simple', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return boqs
    return boqs.filter(b => b.title.toLowerCase().includes(q) || (b.client_name || '').toLowerCase().includes(q) || b.boq_number.toLowerCase().includes(q))
  }, [boqs, search])

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const num = await nextDocNumber(companyId, 'boq').catch(() => `BOQ-${Date.now()}`)
      const client = clients.find(c => c.id === form.client_id)
      const project = projects.find(p => p.id === form.project_id)
      const { data: doc, error } = await supabase.from('boq_documents').insert({
        company_id: companyId,
        boq_number: num,
        title: form.title.trim(),
        client_id: form.client_id || null,
        client_name: client ? (client.display_name || client.business_name) : null,
        project_id: form.project_id || null,
        project_name: project?.name || null,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        notes: form.notes || null,
        created_by: session.user.id,
      }).select().single()
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['boq_documents', companyId] })
      toast.success('BOQ created')
      setShowCreate(false); setForm(blankForm())
      onSelect(doc)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const deleteBoq = async (boq) => {
    if (!window.confirm(`Delete BOQ "${boq.boq_number} — ${boq.title}"? This will remove all items and RA bills.`)) return
    await supabase.from('boq_documents').delete().eq('id', boq.id)
    qc.invalidateQueries({ queryKey: ['boq_documents', companyId] })
    toast.success('BOQ deleted')
  }

  const totalValue = boqs.filter(b => b.status !== 'cancelled').reduce((s, b) => s + Number(b.total_value || 0), 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary-500"
              placeholder="Search BOQ…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="text-xs text-slate-500 hidden sm:block">
            Total value: <span className="font-bold text-slate-300">{fmtINR(totalValue)}</span>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors shrink-0">
          <Plus className="w-4 h-4" /> New BOQ
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-slate-500">
            <ClipboardList className="w-12 h-12 text-slate-700" />
            <p>{search ? 'No BOQs match your search' : 'No BOQs yet — create your first one'}</p>
            {!search && <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg"><Plus className="w-3.5 h-3.5" /> New BOQ</button>}
          </div>
        ) : filtered.map(boq => {
          const overall = pct(boq.executed_value || 0, boq.total_value || 0)
          return (
            <div key={boq.id} onClick={() => onSelect(boq)}
              className="bg-dark-800 border border-dark-700 hover:border-primary-600/50 rounded-xl p-4 cursor-pointer transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-mono text-primary-400">{boq.boq_number}</p>
                    <StatusBadge status={boq.status} cfg={STATUS_CFG} />
                  </div>
                  <p className="font-semibold text-slate-100 mt-0.5">{boq.title}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {boq.client_name && <span className="text-xs text-slate-500 flex items-center gap-1"><Building2 className="w-3 h-3" />{boq.client_name}</span>}
                    {boq.project_name && <span className="text-xs text-slate-500 flex items-center gap-1"><FolderOpen className="w-3 h-3" />{boq.project_name}</span>}
                    {boq.valid_from && <span className="text-xs text-slate-600">{fmtDate(boq.valid_from)}{boq.valid_to ? ` → ${fmtDate(boq.valid_to)}` : ''}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-slate-100">{fmtINR(boq.total_value)}</p>
                  <button onClick={e => { e.stopPropagation(); deleteBoq(boq) }}
                    className="mt-1 p-1 rounded text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
              <p className="font-bold text-slate-100">New BOQ</p>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Title *</label>
                <input className={inp()} placeholder="e.g. Civil Works — Phase 1" value={form.title} onChange={e => setF('title', e.target.value)} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Client</label>
                  <select className={inp()} value={form.client_id} onChange={e => setF('client_id', e.target.value)}>
                    <option value="">-- None --</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Project</label>
                  <select className={inp()} value={form.project_id} onChange={e => setF('project_id', e.target.value)}>
                    <option value="">-- None --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Valid From</label>
                  <input type="date" className={inp()} value={form.valid_from} onChange={e => setF('valid_from', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Valid To</label>
                  <input type="date" className={inp()} value={form.valid_to} onChange={e => setF('valid_to', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                <textarea className={`${inp()} resize-none`} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 justify-end px-5 pb-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={handleCreate} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-lg transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create BOQ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── BOQ Item Row ──────────────────────────────────────────────────────────────
function ItemRow({ item, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ description: item.description, item_code: item.item_code || '', unit: item.unit || 'nos', quantity: item.quantity, rate: item.rate })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const executedPct = pct(item.executed_qty, item.quantity)

  const save = async () => {
    await onUpdate(item.id, {
      description: form.description,
      item_code: form.item_code || null,
      unit: form.unit,
      quantity: parseFloat(form.quantity) || 0,
      rate: parseFloat(form.rate) || 0,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-dark-700/50 border border-primary-600/30 rounded-lg p-3 space-y-2">
        <div className="flex gap-2">
          <input className={`${inp()} text-xs w-20 shrink-0`} placeholder="Code" value={form.item_code} onChange={e => setF('item_code', e.target.value)} />
          <input className={`${inp()} text-xs flex-1`} placeholder="Description *" value={form.description} onChange={e => setF('description', e.target.value)} autoFocus />
        </div>
        <div className="flex gap-2 items-center">
          <select className={`${inp()} text-xs w-20 shrink-0`} value={form.unit} onChange={e => setF('unit', e.target.value)}>
            {LINE_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
          <input type="number" className={`${inp()} text-xs w-24 shrink-0`} placeholder="Qty" value={form.quantity} onChange={e => setF('quantity', e.target.value)} step="0.001" />
          <input type="number" className={`${inp()} text-xs w-28 shrink-0`} placeholder="Rate ₹" value={form.rate} onChange={e => setF('rate', e.target.value)} step="0.01" />
          <p className="text-xs font-bold text-slate-200 w-28 text-right shrink-0">
            {fmtINR((parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0))}
          </p>
          <div className="flex gap-1 shrink-0">
            <button onClick={save} className="p-1.5 rounded bg-primary-600 text-white hover:bg-primary-500"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditing(false)} className="p-1.5 rounded bg-dark-600 text-slate-400 hover:text-slate-200"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-dark-700/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {item.item_code && <span className="text-[10px] font-mono text-slate-500 shrink-0">{item.item_code}</span>}
          <p className="text-xs text-slate-200 leading-snug">{item.description}</p>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[10px] text-slate-500">{Number(item.quantity).toLocaleString()} {item.unit} × {fmtINR(item.rate)}</span>
          <span className="text-[10px] font-bold text-slate-300">{fmtINR(item.amount)}</span>
        </div>
        {/* Progress */}
        <div className="mt-1.5 max-w-xs">
          <ProgressBar value={executedPct} />
          <p className="text-[9px] text-slate-600 mt-0.5">
            Executed: {Number(item.executed_qty).toLocaleString()} / {Number(item.quantity).toLocaleString()} {item.unit}
          </p>
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
        <button onClick={() => setEditing(true)} className="p-1 text-slate-500 hover:text-blue-400"><Pencil className="w-3 h-3" /></button>
        <button onClick={() => onDelete(item.id)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
      </div>
    </div>
  )
}

// ── BOQ Section ───────────────────────────────────────────────────────────────
function BOQSection({ section, items, onAddItem, onUpdateItem, onDeleteItem, onDeleteSection, onUpdateSection }) {
  const [open, setOpen] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(section.title)
  const [addingItem, setAddingItem] = useState(false)
  const [newItem, setNewItem] = useState({ description: '', item_code: '', unit: 'nos', quantity: '', rate: '' })

  const sectionTotal = items.reduce((s, i) => s + Number(i.amount || 0), 0)
  const sectionDone  = items.reduce((s, i) => s + (Number(i.executed_qty || 0) * Number(i.rate || 0)), 0)
  const sectionPct   = pct(sectionDone, sectionTotal)

  const saveItem = async () => {
    if (!newItem.description.trim()) return
    await onAddItem(section.id, newItem)
    setNewItem({ description: '', item_code: '', unit: 'nos', quantity: '', rate: '' })
    setAddingItem(false)
  }

  return (
    <div className="border border-dark-700 rounded-xl overflow-hidden mb-3">
      {/* Section header */}
      <div className="bg-dark-800/80 px-3 py-2.5 flex items-center gap-2">
        <button onClick={() => setOpen(p => !p)} className="text-slate-400 hover:text-slate-200 transition-colors">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {editingTitle ? (
          <input
            autoFocus
            className="flex-1 bg-dark-700 border border-primary-600/50 rounded px-2 py-0.5 text-sm font-semibold text-slate-100 focus:outline-none"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={async () => { await onUpdateSection(section.id, title); setEditingTitle(false) }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          />
        ) : (
          <p className="flex-1 text-sm font-bold text-slate-100 cursor-pointer" onDoubleClick={() => setEditingTitle(true)}>
            {section.title}
          </p>
        )}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <ProgressBar value={sectionPct} />
          </div>
          <p className="text-xs font-bold text-slate-300">{fmtINR(sectionTotal)}</p>
          <button onClick={() => setAddingItem(true)} className="text-[10px] text-primary-400 hover:text-primary-300 flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> Item
          </button>
          <button onClick={() => onDeleteSection(section.id)} className="text-slate-600 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-2 py-1 space-y-0.5">
          {/* Column headers */}
          {items.length > 0 && (
            <div className="flex gap-2 px-2 py-1 text-[10px] text-slate-600 uppercase tracking-wider border-b border-dark-700/50">
              <span className="flex-1">Description</span>
              <span className="w-32 text-right shrink-0">Amount / Progress</span>
            </div>
          )}

          {items.map(item => (
            <ItemRow key={item.id} item={item} onUpdate={onUpdateItem} onDelete={onDeleteItem} />
          ))}

          {items.length === 0 && !addingItem && (
            <p className="text-xs text-slate-600 px-2 py-2 italic">No items yet — click "+ Item" to add one.</p>
          )}

          {/* Add item form */}
          {addingItem && (
            <div className="bg-dark-700/40 border border-dashed border-dark-600 rounded-lg p-3 mt-1 space-y-2">
              <div className="flex gap-2">
                <input className={`${inp()} text-xs w-20 shrink-0`} placeholder="Code" value={newItem.item_code}
                  onChange={e => setNewItem(p => ({ ...p, item_code: e.target.value }))} />
                <input className={`${inp()} text-xs flex-1`} placeholder="Description *" value={newItem.description}
                  onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} autoFocus />
              </div>
              <div className="flex gap-2 flex-wrap">
                <select className={`${inp()} text-xs w-20 shrink-0`} value={newItem.unit}
                  onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}>
                  {LINE_UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <input type="number" className={`${inp()} text-xs w-24 shrink-0`} placeholder="Qty"
                  value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: e.target.value }))} step="0.001" />
                <input type="number" className={`${inp()} text-xs w-28 shrink-0`} placeholder="Rate ₹"
                  value={newItem.rate} onChange={e => setNewItem(p => ({ ...p, rate: e.target.value }))} step="0.01" />
                <p className="text-xs font-bold text-slate-200 py-2 shrink-0">
                  = {fmtINR((parseFloat(newItem.quantity) || 0) * (parseFloat(newItem.rate) || 0))}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={saveItem} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg">
                  <Check className="w-3.5 h-3.5" /> Add
                </button>
                <button onClick={() => { setAddingItem(false); setNewItem({ description: '', item_code: '', unit: 'nos', quantity: '', rate: '' }) }}
                  className="text-xs text-slate-500 hover:text-slate-300 px-2">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── BOQ Detail ────────────────────────────────────────────────────────────────
function BOQDetail({ boq: initialBoq, companyId, session, onBack }) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('items')
  const [boq, setBoq] = useState(initialBoq)
  const [showRAForm, setShowRAForm] = useState(false)

  // Refresh boq header when items change
  const refreshBoq = useCallback(async () => {
    const { data } = await supabase.from('boq_documents').select('*').eq('id', boq.id).single()
    if (data) setBoq(data)
  }, [boq.id])

  const { data: sections = [], refetch: refetchSections } = useQuery({
    queryKey: ['boq_sections', boq.id],
    queryFn: async () => {
      const { data } = await supabase.from('boq_sections').select('*').eq('boq_id', boq.id).order('sort_order')
      return data || []
    },
  })

  const { data: allItems = [], refetch: refetchItems } = useQuery({
    queryKey: ['boq_items', boq.id],
    queryFn: async () => {
      const { data } = await supabase.from('boq_items').select('*').eq('boq_id', boq.id).order('sort_order')
      return data || []
    },
  })

  const { data: raBills = [], refetch: refetchRA } = useQuery({
    queryKey: ['ra_bills', boq.id],
    queryFn: async () => {
      const { data } = await supabase.from('ra_bills').select('*').eq('boq_id', boq.id).order('created_at', { ascending: false })
      return data || []
    },
  })

  const itemsBySection = useMemo(() => {
    const m = {}
    for (const item of allItems) {
      const k = item.section_id || '__none__'
      if (!m[k]) m[k] = []
      m[k].push(item)
    }
    return m
  }, [allItems])

  const refresh = () => { refetchSections(); refetchItems(); refreshBoq() }

  // ── Section CRUD ─────────────────────────────────────────────────────────
  const addSection = async () => {
    const title = `Section ${sections.length + 1}`
    await supabase.from('boq_sections').insert({ boq_id: boq.id, title, sort_order: sections.length })
    refetchSections()
  }

  const updateSection = async (id, title) => {
    await supabase.from('boq_sections').update({ title }).eq('id', id)
    refetchSections()
  }

  const deleteSection = async (id) => {
    if (!window.confirm('Delete this section? Items inside will become unsectioned.')) return
    await supabase.from('boq_sections').delete().eq('id', id)
    refetchSections()
  }

  // ── Item CRUD ─────────────────────────────────────────────────────────────
  const addItem = async (sectionId, form) => {
    const { error } = await supabase.from('boq_items').insert({
      boq_id: boq.id,
      section_id: sectionId === '__none__' ? null : sectionId,
      description: form.description.trim(),
      item_code: form.item_code?.trim() || null,
      unit: form.unit,
      quantity: parseFloat(form.quantity) || 0,
      rate: parseFloat(form.rate) || 0,
      sort_order: (itemsBySection[sectionId] || []).length,
    })
    if (error) { toast.error(error.message); return }
    refresh()
  }

  const updateItem = async (id, patch) => {
    const { error } = await supabase.from('boq_items').update(patch).eq('id', id)
    if (error) toast.error(error.message)
    else refresh()
  }

  const deleteItem = async (id) => {
    await supabase.from('boq_items').delete().eq('id', id)
    refresh()
  }

  // ── Status update ─────────────────────────────────────────────────────────
  const updateStatus = async (status) => {
    await supabase.from('boq_documents').update({ status }).eq('id', boq.id)
    setBoq(p => ({ ...p, status }))
    qc.invalidateQueries({ queryKey: ['boq_documents', companyId] })
  }

  // ── BOQ Summary stats ─────────────────────────────────────────────────────
  const totalValue    = Number(boq.total_value || 0)
  const executedValue = allItems.reduce((s, i) => s + (Number(i.executed_qty || 0) * Number(i.rate || 0)), 0)
  const overallPct    = pct(executedValue, totalValue)
  const raTotal       = raBills.filter(r => r.status !== 'cancelled').reduce((s, r) => s + Number(r.net_payable || 0), 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-800 shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-mono text-primary-400">{boq.boq_number}</p>
              <StatusBadge status={boq.status} cfg={STATUS_CFG} />
              {boq.client_name && <span className="text-xs text-slate-500">{boq.client_name}</span>}
            </div>
            <p className="font-bold text-slate-100 truncate">{boq.title}</p>
          </div>
          {/* Status changer */}
          <select
            className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-slate-300 focus:outline-none shrink-0"
            value={boq.status}
            onChange={e => updateStatus(e.target.value)}>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-dark-800 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">BOQ Value</p>
            <p className="text-sm font-black text-slate-100">{fmtINR(totalValue)}</p>
          </div>
          <div className="bg-dark-800 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Executed</p>
            <p className="text-sm font-black text-emerald-400">{fmtINR(executedValue)}</p>
          </div>
          <div className="bg-dark-800 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Progress</p>
            <p className="text-sm font-black text-primary-400">{overallPct.toFixed(1)}%</p>
          </div>
          <div className="bg-dark-800 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">RA Billed</p>
            <p className="text-sm font-black text-amber-400">{fmtINR(raTotal)}</p>
          </div>
        </div>
        <div className="mt-2">
          <ProgressBar value={overallPct} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-800 shrink-0">
        {[{ id: 'items', label: 'Items & Sections' }, { id: 'ra', label: `RA Bills (${raBills.length})` }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === t.id ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'items' && (
          <>
            {sections.map(sec => (
              <BOQSection
                key={sec.id}
                section={sec}
                items={itemsBySection[sec.id] || []}
                onAddItem={addItem}
                onUpdateItem={updateItem}
                onDeleteItem={deleteItem}
                onDeleteSection={deleteSection}
                onUpdateSection={updateSection}
              />
            ))}

            {/* Unsectioned items */}
            {(itemsBySection['__none__'] || []).length > 0 && (
              <div className="border border-dashed border-dark-600 rounded-xl p-3 mb-3">
                <p className="text-xs text-slate-600 mb-2 font-semibold uppercase tracking-wider">Unsectioned Items</p>
                {(itemsBySection['__none__'] || []).map(item => (
                  <ItemRow key={item.id} item={item} onUpdate={updateItem} onDelete={deleteItem} />
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button onClick={addSection}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-dark-700 hover:bg-dark-600 text-slate-300 rounded-lg border border-dark-600 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Section
              </button>
              <button onClick={() => addItem('__none__', { description: 'New Item', item_code: '', unit: 'nos', quantity: 0, rate: 0 })}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-dark-700 hover:bg-dark-600 text-slate-300 rounded-lg border border-dark-600 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Item (no section)
              </button>
            </div>

            {/* Grand total */}
            {allItems.length > 0 && (
              <div className="mt-4 bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-400">GRAND TOTAL</p>
                <p className="text-xl font-black text-slate-100">{fmtINR(totalValue)}</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'ra' && (
          <RABillsTab
            boq={boq}
            raBills={raBills}
            allItems={allItems}
            companyId={companyId}
            session={session}
            onRefresh={refetchRA}
          />
        )}
      </div>

      {/* Raise RA Bill FAB */}
      {activeTab === 'items' && allItems.length > 0 && (
        <div className="px-4 py-3 border-t border-dark-800 shrink-0">
          <button
            onClick={() => setActiveTab('ra')}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-xl transition-colors">
            <FileText className="w-4 h-4" /> Raise RA Bill
          </button>
        </div>
      )}
    </div>
  )
}

// ── RA Bills Tab ──────────────────────────────────────────────────────────────
function RABillsTab({ boq, raBills, allItems, companyId, session, onRefresh }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [raLines, setRaLines] = useState([])
  const [raForm, setRaForm] = useState({ bill_date: todayStr(), period_from: '', period_to: '', retention_pct: '0', cgst_rate: '0', sgst_rate: '0', igst_rate: '0', notes: '' })

  const openCreate = () => {
    // Pre-fill lines from all BOQ items that have remaining quantity
    const lines = allItems.filter(i => i.quantity > 0).map(i => ({
      boq_item_id: i.id,
      description: i.description,
      unit: i.unit,
      rate: i.rate,
      previous_qty: i.executed_qty,
      current_qty: '',
    }))
    setRaLines(lines)
    setShowCreate(true)
  }

  const subTotal = raLines.reduce((s, l) => s + ((parseFloat(l.current_qty) || 0) * (l.rate || 0)), 0)
  const cgst = subTotal * (parseFloat(raForm.cgst_rate) || 0) / 100
  const sgst = subTotal * (parseFloat(raForm.sgst_rate) || 0) / 100
  const igst = subTotal * (parseFloat(raForm.igst_rate) || 0) / 100
  const gross = subTotal + cgst + sgst + igst
  const retAmt = gross * (parseFloat(raForm.retention_pct) || 0) / 100
  const netPayable = gross - retAmt

  const saveRA = async () => {
    const validLines = raLines.filter(l => parseFloat(l.current_qty) > 0)
    if (validLines.length === 0) { toast.error('Enter quantities for at least one item'); return }
    setSaving(true)
    try {
      const raNum = await nextDocNumber(companyId, 'ra_bill').catch(() => `RA-${Date.now()}`)
      const { data: ra, error } = await supabase.from('ra_bills').insert({
        company_id: companyId, boq_id: boq.id,
        ra_number: raNum,
        bill_date: raForm.bill_date,
        period_from: raForm.period_from || null,
        period_to: raForm.period_to || null,
        status: 'draft',
        subtotal: subTotal,
        cgst_rate: parseFloat(raForm.cgst_rate) || 0,
        sgst_rate: parseFloat(raForm.sgst_rate) || 0,
        igst_rate: parseFloat(raForm.igst_rate) || 0,
        cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
        total_amount: gross,
        retention_pct: parseFloat(raForm.retention_pct) || 0,
        retention_amt: retAmt,
        net_payable: netPayable,
        notes: raForm.notes || null,
        created_by: session.user.id,
      }).select().single()
      if (error) throw error

      // Insert RA bill items
      const items = validLines.map((l, i) => ({
        ra_bill_id: ra.id,
        boq_item_id: l.boq_item_id,
        description: l.description,
        unit: l.unit,
        rate: l.rate,
        previous_qty: parseFloat(l.previous_qty) || 0,
        current_qty: parseFloat(l.current_qty) || 0,
        total_qty: (parseFloat(l.previous_qty) || 0) + (parseFloat(l.current_qty) || 0),
        current_amount: (parseFloat(l.current_qty) || 0) * (l.rate || 0),
        sort_order: i,
      }))
      const { error: ie } = await supabase.from('ra_bill_items').insert(items)
      if (ie) throw ie

      toast.success(`${raNum} raised — ${fmtINR(netPayable)} net payable`)
      setShowCreate(false)
      onRefresh()
      qc.invalidateQueries({ queryKey: ['boq_items', boq.id] })
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const updateRAStatus = async (id, status) => {
    await supabase.from('ra_bills').update({ status }).eq('id', id)
    onRefresh()
    toast.success(`RA Bill marked ${status}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-slate-300">Running Account Bills</p>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Raise RA Bill
        </button>
      </div>

      {raBills.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3 text-slate-600">
          <FileText className="w-10 h-10 text-slate-700" />
          <p className="text-sm">No RA bills raised yet</p>
        </div>
      ) : raBills.map(ra => (
        <div key={ra.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-primary-400">{ra.ra_number}</p>
                <StatusBadge status={ra.status} cfg={RA_STATUS_CFG} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{fmtDate(ra.bill_date)}{ra.period_from ? ` · Period: ${fmtDate(ra.period_from)} → ${fmtDate(ra.period_to)}` : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-base font-black text-slate-100">{fmtINR(ra.net_payable)}</p>
              <p className="text-[10px] text-slate-500">Gross {fmtINR(ra.total_amount)}{ra.retention_amt > 0 ? ` · Ret. ${fmtINR(ra.retention_amt)}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {ra.status === 'draft' && (
              <button onClick={() => updateRAStatus(ra.id, 'submitted')}
                className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-700/40">
                Submit
              </button>
            )}
            {ra.status === 'submitted' && (
              <button onClick={() => updateRAStatus(ra.id, 'approved')}
                className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-700/40">
                Approve
              </button>
            )}
            {ra.status === 'approved' && (
              <button onClick={() => updateRAStatus(ra.id, 'paid')}
                className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-700/40">
                Mark Paid
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Create RA Bill Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 shrink-0">
              <p className="font-bold text-slate-100">Raise RA Bill — {boq.title}</p>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Header fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Bill Date</label>
                  <input type="date" className={inp()} value={raForm.bill_date} onChange={e => setRaForm(p => ({ ...p, bill_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Period From</label>
                  <input type="date" className={inp()} value={raForm.period_from} onChange={e => setRaForm(p => ({ ...p, period_from: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Period To</label>
                  <input type="date" className={inp()} value={raForm.period_to} onChange={e => setRaForm(p => ({ ...p, period_to: e.target.value }))} />
                </div>
              </div>

              {/* Items table */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Work Done This Bill</p>
                <div className="border border-dark-700 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_60px_80px_80px_80px_88px] gap-1 px-3 py-2 bg-dark-800 text-[10px] text-slate-500 uppercase tracking-wider">
                    <span>Description</span><span>Unit</span><span className="text-right">Rate</span>
                    <span className="text-right">Prev Qty</span><span className="text-right">Cur Qty</span><span className="text-right">Amount</span>
                  </div>
                  {raLines.map((l, i) => (
                    <div key={l.boq_item_id} className="grid grid-cols-[1fr_60px_80px_80px_80px_88px] gap-1 px-3 py-2 border-t border-dark-800 items-center">
                      <p className="text-xs text-slate-300 truncate">{l.description}</p>
                      <p className="text-xs text-slate-500">{l.unit}</p>
                      <p className="text-xs text-slate-400 text-right">{fmtINR(l.rate)}</p>
                      <p className="text-xs text-slate-500 text-right">{Number(l.previous_qty).toLocaleString()}</p>
                      <input
                        type="number" step="0.001" min="0"
                        className="text-xs bg-dark-700 border border-dark-600 rounded px-2 py-1 text-right text-slate-100 focus:outline-none focus:border-primary-500 w-full"
                        placeholder="0"
                        value={l.current_qty}
                        onChange={e => setRaLines(p => p.map((x, j) => j === i ? { ...x, current_qty: e.target.value } : x))}
                      />
                      <p className="text-xs font-semibold text-slate-200 text-right">
                        {fmtINR((parseFloat(l.current_qty) || 0) * (l.rate || 0))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tax + Retention */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">CGST %</label>
                  <input type="number" className={inp()} min="0" max="100" step="0.01" value={raForm.cgst_rate} onChange={e => setRaForm(p => ({ ...p, cgst_rate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">SGST %</label>
                  <input type="number" className={inp()} min="0" max="100" step="0.01" value={raForm.sgst_rate} onChange={e => setRaForm(p => ({ ...p, sgst_rate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">IGST %</label>
                  <input type="number" className={inp()} min="0" max="100" step="0.01" value={raForm.igst_rate} onChange={e => setRaForm(p => ({ ...p, igst_rate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Retention %</label>
                  <input type="number" className={`${inp()} border-orange-700/40`} min="0" max="100" step="0.01" value={raForm.retention_pct} onChange={e => setRaForm(p => ({ ...p, retention_pct: e.target.value }))} />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 space-y-1.5">
                {[
                  ['Subtotal', subTotal, 'text-slate-300'],
                  cgst > 0 ? ['CGST', cgst, 'text-slate-400'] : null,
                  sgst > 0 ? ['SGST', sgst, 'text-slate-400'] : null,
                  igst > 0 ? ['IGST', igst, 'text-slate-400'] : null,
                  ['Gross Total', gross, 'text-slate-200 font-bold'],
                  retAmt > 0 ? ['Retention', -retAmt, 'text-orange-400'] : null,
                  ['Net Payable', netPayable, 'text-emerald-400 font-black text-base'],
                ].filter(Boolean).map(([label, val, cls]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className={`text-xs ${cls}`}>{val < 0 ? '−' : ''}{fmtINR(Math.abs(val))}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end px-5 pb-5 pt-3 border-t border-dark-800 shrink-0">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={saveRA} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-xl transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Raise RA Bill — {fmtINR(netPayable)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BOQPage() {
  const { companyId, session } = useAuth()
  const [selectedBoq, setSelectedBoq] = useState(null)

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-5 pb-0 shrink-0 border-b border-dark-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-700/40 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Bill of Quantities</h1>
            <p className="text-xs text-slate-500">Create BOQ · Track progress · Raise RA bills</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedBoq ? (
          <BOQDetail
            boq={selectedBoq}
            companyId={companyId}
            session={session}
            onBack={() => setSelectedBoq(null)}
          />
        ) : (
          <BOQList
            companyId={companyId}
            session={session}
            onSelect={setSelectedBoq}
          />
        )}
      </div>
    </div>
  )
}
