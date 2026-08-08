import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { nextDocNumber } from '../../utils/docNumbers'
import toast from 'react-hot-toast'
import {
  Plus, X, Search, ChevronDown, ChevronRight, Trash2, Pencil,
  FileText, FolderOpen, Loader2, IndianRupee, ArrowLeft, Check,
  ClipboardList, Building2, CalendarDays, Hash, AlertTriangle,
  TrendingUp, BarChart3, Receipt,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR = (n) => {
  if (!n && n !== 0) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtDate   = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const todayStr  = () => new Date().toISOString().split('T')[0]
const pct       = (done, total) => total > 0 ? Math.min(100, (done / total) * 100) : 0
const inp       = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`
const LINE_UNITS = ['nos','m','m²','m³','kg','MT','L','km','bag','sqft','rft','lot','set','hr','day','ls','RM','cum','sqm']

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
const CONTRACT_TYPES = [
  { value: 'item_rate',        label: 'Item Rate' },
  { value: 'lump_sum',         label: 'Lump Sum' },
  { value: 'percentage_rate',  label: 'Percentage Rate' },
]

function StatusBadge({ status, cfg }) {
  const c = cfg[status] || cfg.draft
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>
}

function ProgressBar({ value }) {
  const v = Math.min(100, Math.max(0, value || 0))
  const color = v >= 100 ? 'bg-emerald-500' : v > 75 ? 'bg-primary-500' : v > 40 ? 'bg-amber-500' : 'bg-slate-600'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className={`text-[10px] font-bold w-9 text-right ${v >= 100 ? 'text-emerald-400' : 'text-slate-400'}`}>{v.toFixed(1)}%</span>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}

// ── BOQ List ──────────────────────────────────────────────────────────────────
function BOQList({ companyId, session, onSelect }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const blank = () => ({
    title: '', contract_number: '', work_order_number: '', tender_ref: '',
    client_id: '', project_id: '', loa_date: '', valid_from: todayStr(), valid_to: '',
    contract_type: 'item_rate', sd_pct: '5', mob_advance_pct: '0',
    it_applicable: true, it_pct: '1', labour_cess_applicable: true, labour_cess_pct: '1',
    notes: '',
  })
  const [form, setForm] = useState(blank())
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
    return boqs.filter(b =>
      (statusFilter === 'all' || b.status === statusFilter) &&
      (!q || b.title.toLowerCase().includes(q) || (b.contract_number || '').toLowerCase().includes(q) || (b.client_name || '').toLowerCase().includes(q))
    )
  }, [boqs, search, statusFilter])

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error('Title required'); return }
    setSaving(true)
    try {
      const num = await nextDocNumber(companyId, 'boq').catch(() => `BOQ-${Date.now()}`)
      const client = clients.find(c => c.id === form.client_id)
      const project = projects.find(p => p.id === form.project_id)
      const { data: doc, error } = await supabase.from('boq_documents').insert({
        company_id: companyId, boq_number: num,
        title: form.title.trim(),
        contract_number: form.contract_number.trim() || null,
        work_order_number: form.work_order_number.trim() || null,
        tender_ref: form.tender_ref.trim() || null,
        loa_date: form.loa_date || null,
        client_id: form.client_id || null,
        client_name: client ? (client.display_name || client.business_name) : null,
        project_id: form.project_id || null,
        project_name: project?.name || null,
        contract_type: form.contract_type,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        sd_pct: parseFloat(form.sd_pct) || 5,
        mob_advance_pct: parseFloat(form.mob_advance_pct) || 0,
        it_applicable: form.it_applicable,
        it_pct: parseFloat(form.it_pct) || 1,
        labour_cess_applicable: form.labour_cess_applicable,
        labour_cess_pct: parseFloat(form.labour_cess_pct) || 1,
        notes: form.notes || null,
        created_by: session.user.id,
      }).select().single()
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['boq_documents', companyId] })
      toast.success(`${num} created`)
      setShowCreate(false); setForm(blank()); onSelect(doc)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const deleteBoq = async (boq, e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${boq.boq_number}"? All items and RA bills will be removed.`)) return
    await supabase.from('boq_documents').delete().eq('id', boq.id)
    qc.invalidateQueries({ queryKey: ['boq_documents', companyId] })
  }

  const activeTotal = boqs.filter(b => b.status !== 'cancelled').reduce((s, b) => s + Number(b.total_value || 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary-500"
            placeholder="Search by title, contract no., client…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-slate-300"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="text-xs text-slate-500 hidden sm:block">
          Total: <span className="font-bold text-slate-300">{fmtINR(activeTotal)}</span>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors shrink-0">
          <Plus className="w-4 h-4" /> New BOQ
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-slate-500">
            <ClipboardList className="w-12 h-12 text-slate-700" />
            <p>{search ? 'No BOQs match your search' : 'No BOQs yet'}</p>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg">
              <Plus className="w-3.5 h-3.5" /> New BOQ
            </button>
          </div>
        ) : filtered.map(boq => {
          const executedValue = Number(boq.executed_value || 0)
          const totalValue    = Number(boq.total_value || 0)
          const progress      = pct(executedValue, totalValue)
          return (
            <div key={boq.id} onClick={() => onSelect(boq)}
              className="bg-dark-800 border border-dark-700 hover:border-primary-600/50 rounded-xl p-4 cursor-pointer transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-mono text-primary-400">{boq.boq_number}</p>
                    {boq.contract_number && <p className="text-xs font-mono text-slate-500">· {boq.contract_number}</p>}
                    <StatusBadge status={boq.status} cfg={STATUS_CFG} />
                    <span className="text-[10px] text-slate-600 capitalize">{boq.contract_type?.replace('_', ' ')}</span>
                  </div>
                  <p className="font-bold text-slate-100 mt-0.5">{boq.title}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {boq.client_name && <span className="text-xs text-slate-500 flex items-center gap-1"><Building2 className="w-3 h-3" />{boq.client_name}</span>}
                    {boq.loa_date && <span className="text-xs text-slate-600 flex items-center gap-1"><CalendarDays className="w-3 h-3" />LOA {fmtDate(boq.loa_date)}</span>}
                  </div>
                  <div className="mt-2"><ProgressBar value={progress} /></div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-slate-100">{fmtINR(totalValue)}</p>
                  <p className="text-[10px] text-slate-500">Executed {fmtINR(executedValue)}</p>
                  <button onClick={e => deleteBoq(boq, e)} className="mt-1 p-1 text-slate-600 hover:text-red-400 transition-colors block ml-auto">
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
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 shrink-0">
              <p className="font-bold text-slate-100">New BOQ / Contract</p>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <Field label="Contract Title *">
                <input className={inp()} placeholder="e.g. Earthwork & Site Levelling — Phase 1" value={form.title} onChange={e => setF('title', e.target.value)} autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contract Number">
                  <input className={`${inp()} font-mono uppercase`} placeholder="e.g. IREL/2026/001" value={form.contract_number} onChange={e => setF('contract_number', e.target.value)} />
                </Field>
                <Field label="Work Order No.">
                  <input className={`${inp()} font-mono uppercase`} placeholder="e.g. WO/2026/045" value={form.work_order_number} onChange={e => setF('work_order_number', e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tender Reference">
                  <input className={inp()} placeholder="NIT / Tender No." value={form.tender_ref} onChange={e => setF('tender_ref', e.target.value)} />
                </Field>
                <Field label="LOA Date">
                  <input type="date" className={inp()} value={form.loa_date} onChange={e => setF('loa_date', e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Client">
                  <select className={inp()} value={form.client_id} onChange={e => setF('client_id', e.target.value)}>
                    <option value="">-- None --</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
                  </select>
                </Field>
                <Field label="Project">
                  <select className={inp()} value={form.project_id} onChange={e => setF('project_id', e.target.value)}>
                    <option value="">-- None --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Contract Type">
                  <select className={inp()} value={form.contract_type} onChange={e => setF('contract_type', e.target.value)}>
                    {CONTRACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Start Date">
                  <input type="date" className={inp()} value={form.valid_from} onChange={e => setF('valid_from', e.target.value)} />
                </Field>
                <Field label="End Date">
                  <input type="date" className={inp()} value={form.valid_to} onChange={e => setF('valid_to', e.target.value)} />
                </Field>
              </div>

              {/* Recovery defaults */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recovery & Deduction Defaults</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Security Deposit %">
                    <input type="number" className={inp()} min="0" max="100" step="0.01" value={form.sd_pct} onChange={e => setF('sd_pct', e.target.value)} />
                  </Field>
                  <Field label="Mob. Advance %">
                    <input type="number" className={inp()} min="0" max="100" step="0.01" value={form.mob_advance_pct} onChange={e => setF('mob_advance_pct', e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="it_app" checked={form.it_applicable} onChange={e => setF('it_applicable', e.target.checked)} className="accent-primary-500" />
                    <label htmlFor="it_app" className="text-xs text-slate-400">Income Tax (TDS)</label>
                    {form.it_applicable && (
                      <input type="number" className="w-16 bg-dark-700 border border-dark-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                        value={form.it_pct} onChange={e => setF('it_pct', e.target.value)} step="0.01" />
                    )}
                    {form.it_applicable && <span className="text-xs text-slate-500">%</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="lc_app" checked={form.labour_cess_applicable} onChange={e => setF('labour_cess_applicable', e.target.checked)} className="accent-primary-500" />
                    <label htmlFor="lc_app" className="text-xs text-slate-400">Labour Cess</label>
                    {form.labour_cess_applicable && (
                      <input type="number" className="w-16 bg-dark-700 border border-dark-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                        value={form.labour_cess_pct} onChange={e => setF('labour_cess_pct', e.target.value)} step="0.01" />
                    )}
                    {form.labour_cess_applicable && <span className="text-xs text-slate-500">%</span>}
                  </div>
                </div>
              </div>
              <Field label="Notes">
                <textarea className={`${inp()} resize-none`} rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-3 justify-end px-5 pb-5 pt-3 border-t border-dark-800 shrink-0">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={handleCreate} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-lg">
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
    await onUpdate(item.id, { description: form.description, item_code: form.item_code || null, unit: form.unit, quantity: parseFloat(form.quantity) || 0, rate: parseFloat(form.rate) || 0 })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-dark-700/50 border border-primary-600/30 rounded-lg p-3 space-y-2">
        <div className="flex gap-2">
          <input className={`${inp()} text-xs w-20 shrink-0`} placeholder="Code" value={form.item_code} onChange={e => setF('item_code', e.target.value)} />
          <input className={`${inp()} text-xs flex-1`} placeholder="Description *" value={form.description} onChange={e => setF('description', e.target.value)} autoFocus />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select className={`${inp()} text-xs w-20 shrink-0`} value={form.unit} onChange={e => setF('unit', e.target.value)}>
            {LINE_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
          <input type="number" className={`${inp()} text-xs w-24 shrink-0`} placeholder="Qty" value={form.quantity} onChange={e => setF('quantity', e.target.value)} step="0.001" />
          <input type="number" className={`${inp()} text-xs w-28 shrink-0`} placeholder="Rate ₹" value={form.rate} onChange={e => setF('rate', e.target.value)} step="0.01" />
          <p className="text-xs font-bold text-slate-200 text-right shrink-0">{fmtINR((parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0))}</p>
          <div className="flex gap-1">
            <button onClick={save} className="p-1.5 rounded bg-primary-600 text-white"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditing(false)} className="p-1.5 rounded bg-dark-600 text-slate-400"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-dark-700/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {item.item_code && <span className="text-[10px] font-mono text-slate-500">{item.item_code}</span>}
          <p className="text-xs text-slate-200">{item.description}</p>
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-[10px] text-slate-500">{Number(item.quantity).toLocaleString()} {item.unit} × {fmtINR(item.rate)} = <span className="font-bold text-slate-300">{fmtINR(item.amount)}</span></span>
          {item.executed_qty > 0 && <span className="text-[10px] text-emerald-400">✓ {Number(item.executed_qty).toLocaleString()} done ({executedPct.toFixed(0)}%)</span>}
        </div>
        <div className="mt-1 max-w-xs"><ProgressBar value={executedPct} /></div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0 pt-0.5">
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
  const [newItem, setNewItem] = useState({ description: '', item_code: '', unit: 'm³', quantity: '', rate: '' })

  const sectionTotal    = items.reduce((s, i) => s + Number(i.amount || 0), 0)
  const sectionExecuted = items.reduce((s, i) => s + (Number(i.executed_qty || 0) * Number(i.rate || 0)), 0)
  const sectionPct      = pct(sectionExecuted, sectionTotal)

  const saveItem = async () => {
    if (!newItem.description.trim()) return
    await onAddItem(section.id, newItem)
    setNewItem({ description: '', item_code: '', unit: 'm³', quantity: '', rate: '' })
    setAddingItem(false)
  }

  return (
    <div className="border border-dark-700 rounded-xl overflow-hidden mb-3">
      <div className="bg-dark-800/80 px-3 py-2.5 flex items-center gap-2">
        <button onClick={() => setOpen(p => !p)} className="text-slate-400 hover:text-slate-200">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {editingTitle ? (
          <input autoFocus className="flex-1 bg-dark-700 border border-primary-600/50 rounded px-2 py-0.5 text-sm font-semibold text-slate-100 focus:outline-none"
            value={title} onChange={e => setTitle(e.target.value)}
            onBlur={async () => { await onUpdateSection(section.id, title); setEditingTitle(false) }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
        ) : (
          <p className="flex-1 text-sm font-bold text-slate-100 cursor-pointer" onDoubleClick={() => setEditingTitle(true)}>{section.title}</p>
        )}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-28 hidden sm:block"><ProgressBar value={sectionPct} /></div>
          <p className="text-xs font-bold text-slate-300">{fmtINR(sectionTotal)}</p>
          <button onClick={() => setAddingItem(true)} className="text-[10px] text-primary-400 hover:text-primary-300 flex items-center gap-0.5"><Plus className="w-3 h-3" />Item</button>
          <button onClick={() => onDeleteSection(section.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {open && (
        <div className="px-2 py-1 space-y-0.5">
          {items.length > 0 && (
            <div className="grid grid-cols-[1fr_auto] gap-2 px-2 py-1 text-[10px] text-slate-600 uppercase tracking-wider border-b border-dark-700/50">
              <span>Description</span><span className="text-right">Amount / Progress</span>
            </div>
          )}
          {items.map(item => (
            <ItemRow key={item.id} item={item} onUpdate={onUpdateItem} onDelete={onDeleteItem} />
          ))}
          {items.length === 0 && !addingItem && (
            <p className="text-xs text-slate-600 px-2 py-2 italic">No items — click "+ Item" to add</p>
          )}
          {addingItem && (
            <div className="bg-dark-700/40 border border-dashed border-dark-600 rounded-lg p-3 mt-1 space-y-2">
              <div className="flex gap-2">
                <input className={`${inp()} text-xs w-20 shrink-0`} placeholder="Code" value={newItem.item_code} onChange={e => setNewItem(p => ({ ...p, item_code: e.target.value }))} />
                <input className={`${inp()} text-xs flex-1`} placeholder="Description *" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} autoFocus />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <select className={`${inp()} text-xs w-20 shrink-0`} value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}>
                  {LINE_UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <input type="number" className={`${inp()} text-xs w-24 shrink-0`} placeholder="Qty" value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: e.target.value }))} step="0.001" />
                <input type="number" className={`${inp()} text-xs w-28 shrink-0`} placeholder="Rate ₹" value={newItem.rate} onChange={e => setNewItem(p => ({ ...p, rate: e.target.value }))} step="0.01" />
                <p className="text-xs font-bold text-slate-200">= {fmtINR((parseFloat(newItem.quantity) || 0) * (parseFloat(newItem.rate) || 0))}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={saveItem} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg">
                  <Check className="w-3.5 h-3.5" /> Add
                </button>
                <button onClick={() => { setAddingItem(false); setNewItem({ description: '', item_code: '', unit: 'm³', quantity: '', rate: '' }) }}
                  className="text-xs text-slate-500 hover:text-slate-300 px-2">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Abstract Tab ──────────────────────────────────────────────────────────────
function AbstractTab({ boq, allItems, sections, raBills }) {
  const totalValue    = Number(boq.total_value || 0)
  const executedValue = allItems.reduce((s, i) => s + (Number(i.executed_qty || 0) * Number(i.rate || 0)), 0)
  const billedGross   = raBills.filter(r => r.status !== 'draft').reduce((s, r) => s + Number(r.subtotal || 0), 0)
  const billedNet     = raBills.filter(r => r.status !== 'draft').reduce((s, r) => s + Number(r.net_payable || 0), 0)
  const paidNet       = raBills.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.net_payable || 0), 0)
  const outstanding   = billedNet - paidNet

  // Section-wise summary
  const itemsBySection = useMemo(() => {
    const m = {}
    for (const item of allItems) {
      const k = item.section_id || '__none__'
      if (!m[k]) m[k] = []
      m[k].push(item)
    }
    return m
  }, [allItems])

  return (
    <div className="p-4 space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Contract Value', value: fmtINR(totalValue), color: 'text-slate-100' },
          { label: 'Work Executed', value: fmtINR(executedValue), color: 'text-emerald-400' },
          { label: 'Billed (Gross)', value: fmtINR(billedGross), color: 'text-primary-400' },
          { label: 'Paid Out', value: fmtINR(paidNet), color: 'text-blue-400' },
        ].map(t => (
          <div key={t.label} className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{t.label}</p>
            <p className={`text-base font-black mt-1 ${t.color}`}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* Overall progress */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
        <p className="text-xs font-bold text-slate-400 mb-3">Overall Progress</p>
        <ProgressBar value={pct(executedValue, totalValue)} />
        {outstanding > 0 && (
          <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Outstanding: {fmtINR(outstanding)} (billed but not yet paid)
          </p>
        )}
      </div>

      {/* Section-wise BOQ abstract */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700">
          <p className="text-xs font-bold text-slate-300">Abstract of BOQ — Section Wise</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-dark-700 text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-2 text-left">Section</th>
                <th className="px-4 py-2 text-right">BOQ Value</th>
                <th className="px-4 py-2 text-right">Executed Value</th>
                <th className="px-4 py-2 text-right">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {sections.map(sec => {
                const items  = itemsBySection[sec.id] || []
                const boqVal = items.reduce((s, i) => s + Number(i.amount || 0), 0)
                const exVal  = items.reduce((s, i) => s + (Number(i.executed_qty || 0) * Number(i.rate || 0)), 0)
                return (
                  <tr key={sec.id} className="hover:bg-dark-700/20">
                    <td className="px-4 py-2 text-slate-300 font-medium">{sec.title}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{fmtINR(boqVal)}</td>
                    <td className="px-4 py-2 text-right text-emerald-400">{fmtINR(exVal)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="w-24 ml-auto"><ProgressBar value={pct(exVal, boqVal)} /></div>
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-dark-600 bg-dark-700/30 font-bold">
                <td className="px-4 py-2 text-slate-200">TOTAL</td>
                <td className="px-4 py-2 text-right text-slate-100">{fmtINR(totalValue)}</td>
                <td className="px-4 py-2 text-right text-emerald-400">{fmtINR(executedValue)}</td>
                <td className="px-4 py-2 text-right">
                  <div className="w-24 ml-auto"><ProgressBar value={pct(executedValue, totalValue)} /></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Running Account Statement */}
      {raBills.length > 0 && (
        <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700">
            <p className="text-xs font-bold text-slate-300">Running Account Statement</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-dark-700 text-[10px] text-slate-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">RA No</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                  <th className="px-3 py-2 text-right">Deductions</th>
                  <th className="px-3 py-2 text-right">Net Payable</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {raBills.map(ra => {
                  const taxAmt    = Number(ra.cgst_amount || 0) + Number(ra.sgst_amount || 0) + Number(ra.igst_amount || 0)
                  const deductions = Number(ra.mob_advance_recovery || 0) + Number(ra.income_tax_amt || 0) +
                    Number(ra.labour_cess_amt || 0) + Number(ra.sd_amount || 0) + Number(ra.other_deductions || 0) + Number(ra.retention_amt || 0)
                  return (
                    <tr key={ra.id} className="hover:bg-dark-700/20">
                      <td className="px-3 py-2 font-mono text-primary-400">{ra.ra_number}</td>
                      <td className="px-3 py-2 text-slate-400">
                        {ra.period_from ? `${fmtDate(ra.period_from)} — ${fmtDate(ra.period_to)}` : fmtDate(ra.bill_date)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">{fmtINR(ra.subtotal)}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{fmtINR(taxAmt)}</td>
                      <td className="px-3 py-2 text-right text-orange-400">{fmtINR(deductions)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-100">{fmtINR(ra.net_payable)}</td>
                      <td className="px-3 py-2 text-center"><StatusBadge status={ra.status} cfg={RA_STATUS_CFG} /></td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-dark-600 bg-dark-700/30 font-bold">
                  <td colSpan={2} className="px-3 py-2 text-slate-200">TOTAL</td>
                  <td className="px-3 py-2 text-right text-slate-100">{fmtINR(raBills.reduce((s, r) => s + Number(r.subtotal || 0), 0))}</td>
                  <td className="px-3 py-2 text-right text-slate-300">
                    {fmtINR(raBills.reduce((s, r) => s + Number(r.cgst_amount || 0) + Number(r.sgst_amount || 0) + Number(r.igst_amount || 0), 0))}
                  </td>
                  <td className="px-3 py-2 text-right text-orange-400">
                    {fmtINR(raBills.reduce((s, r) => s + Number(r.mob_advance_recovery || 0) + Number(r.income_tax_amt || 0) + Number(r.labour_cess_amt || 0) + Number(r.sd_amount || 0) + Number(r.other_deductions || 0) + Number(r.retention_amt || 0), 0))}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-400">{fmtINR(billedNet)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
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
  const [raForm, setRaForm] = useState({
    bill_date: todayStr(), period_from: '', period_to: '',
    cgst_rate: '0', sgst_rate: '0', igst_rate: '0',
    mob_advance_recovery: '0',
    income_tax_pct: String(boq.it_pct || 1),
    labour_cess_pct: String(boq.labour_cess_pct || 1),
    sd_amount: '0',
    other_deductions: '0', other_deductions_note: '',
  })
  const setRF = (k, v) => setRaForm(p => ({ ...p, [k]: v }))

  const openCreate = () => {
    const lines = allItems.filter(i => i.quantity > 0).map(i => ({
      boq_item_id: i.id, description: i.description, unit: i.unit, rate: i.rate,
      previous_qty: i.executed_qty, current_qty: '',
    }))
    setRaLines(lines)
    setRaForm({
      bill_date: todayStr(), period_from: '', period_to: '',
      cgst_rate: '0', sgst_rate: '0', igst_rate: '0',
      mob_advance_recovery: '0',
      income_tax_pct: String(boq.it_pct || 1),
      labour_cess_pct: String(boq.labour_cess_pct || 1),
      sd_amount: '0',
      other_deductions: '0', other_deductions_note: '',
    })
    setShowCreate(true)
  }

  // Calculations
  const subtotal       = raLines.reduce((s, l) => s + ((parseFloat(l.current_qty) || 0) * (l.rate || 0)), 0)
  const cgst           = subtotal * (parseFloat(raForm.cgst_rate) || 0) / 100
  const sgst           = subtotal * (parseFloat(raForm.sgst_rate) || 0) / 100
  const igst           = subtotal * (parseFloat(raForm.igst_rate) || 0) / 100
  const grossWithTax   = subtotal + cgst + sgst + igst
  const mobRec         = parseFloat(raForm.mob_advance_recovery) || 0
  const itAmt          = boq.it_applicable ? subtotal * (parseFloat(raForm.income_tax_pct) || 0) / 100 : 0
  const lcAmt          = boq.labour_cess_applicable ? subtotal * (parseFloat(raForm.labour_cess_pct) || 0) / 100 : 0
  const sdAmt          = parseFloat(raForm.sd_amount) || 0
  const otherDed       = parseFloat(raForm.other_deductions) || 0
  const totalDeductions = mobRec + itAmt + lcAmt + sdAmt + otherDed
  const netPayable     = grossWithTax - totalDeductions

  const saveRA = async () => {
    const validLines = raLines.filter(l => parseFloat(l.current_qty) > 0)
    if (validLines.length === 0) { toast.error('Enter quantities for at least one item'); return }
    setSaving(true)
    try {
      const raNum = await nextDocNumber(companyId, 'ra_bill').catch(() => `RA-${Date.now()}`)
      const { data: ra, error } = await supabase.from('ra_bills').insert({
        company_id: companyId, boq_id: boq.id, ra_number: raNum,
        bill_date: raForm.bill_date,
        period_from: raForm.period_from || null,
        period_to: raForm.period_to || null,
        status: 'draft', subtotal,
        cgst_rate: parseFloat(raForm.cgst_rate) || 0,
        sgst_rate: parseFloat(raForm.sgst_rate) || 0,
        igst_rate: parseFloat(raForm.igst_rate) || 0,
        cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
        total_amount: grossWithTax,
        mob_advance_recovery: mobRec,
        income_tax_pct: parseFloat(raForm.income_tax_pct) || 0,
        income_tax_amt: itAmt,
        labour_cess_pct: parseFloat(raForm.labour_cess_pct) || 0,
        labour_cess_amt: lcAmt,
        sd_amount: sdAmt,
        other_deductions: otherDed,
        other_deductions_note: raForm.other_deductions_note || null,
        net_payable: netPayable,
        certified_amount: netPayable,
        retention_pct: 0, retention_amt: 0,
        created_by: session.user.id,
      }).select().single()
      if (error) throw error

      const items = validLines.map((l, i) => ({
        ra_bill_id: ra.id, boq_item_id: l.boq_item_id,
        description: l.description, unit: l.unit, rate: l.rate,
        previous_qty: parseFloat(l.previous_qty) || 0,
        current_qty: parseFloat(l.current_qty) || 0,
        total_qty: (parseFloat(l.previous_qty) || 0) + (parseFloat(l.current_qty) || 0),
        current_amount: (parseFloat(l.current_qty) || 0) * (l.rate || 0),
        sort_order: i,
      }))
      const { error: ie } = await supabase.from('ra_bill_items').insert(items)
      if (ie) throw ie

      toast.success(`${raNum} raised — Net payable ${fmtINR(netPayable)}`)
      setShowCreate(false)
      onRefresh()
      qc.invalidateQueries({ queryKey: ['boq_items', boq.id] })
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const updateRAStatus = async (id, status) => {
    await supabase.from('ra_bills').update({ status }).eq('id', id)
    onRefresh()
    toast.success(`Marked ${status}`)
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-slate-300">Running Account Bills ({raBills.length})</p>
        <button onClick={openCreate} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Raise RA Bill
        </button>
      </div>

      {raBills.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3 text-slate-600">
          <Receipt className="w-10 h-10 text-slate-700" />
          <p className="text-sm">No RA bills raised yet</p>
        </div>
      ) : raBills.map(ra => {
        const taxAmt    = Number(ra.cgst_amount || 0) + Number(ra.sgst_amount || 0) + Number(ra.igst_amount || 0)
        const deductions = Number(ra.mob_advance_recovery || 0) + Number(ra.income_tax_amt || 0) +
          Number(ra.labour_cess_amt || 0) + Number(ra.sd_amount || 0) + Number(ra.other_deductions || 0) + Number(ra.retention_amt || 0)
        return (
          <div key={ra.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-mono text-primary-400">{ra.ra_number}</p>
                  <StatusBadge status={ra.status} cfg={RA_STATUS_CFG} />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fmtDate(ra.bill_date)}{ra.period_from ? ` · ${fmtDate(ra.period_from)} → ${fmtDate(ra.period_to)}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-slate-100">{fmtINR(ra.net_payable)}</p>
                <p className="text-[10px] text-slate-500">Gross {fmtINR(ra.total_amount)}</p>
              </div>
            </div>

            {/* Deduction breakdown */}
            {deductions > 0 && (
              <div className="mt-2 pt-2 border-t border-dark-700/50 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ra.mob_advance_recovery > 0 && <div className="text-[10px]"><span className="text-slate-600">Mob Adv Recovery</span><br /><span className="text-orange-400 font-bold">{fmtINR(ra.mob_advance_recovery)}</span></div>}
                {ra.income_tax_amt > 0 && <div className="text-[10px]"><span className="text-slate-600">TDS ({ra.income_tax_pct}%)</span><br /><span className="text-orange-400 font-bold">{fmtINR(ra.income_tax_amt)}</span></div>}
                {ra.labour_cess_amt > 0 && <div className="text-[10px]"><span className="text-slate-600">Labour Cess ({ra.labour_cess_pct}%)</span><br /><span className="text-orange-400 font-bold">{fmtINR(ra.labour_cess_amt)}</span></div>}
                {ra.sd_amount > 0 && <div className="text-[10px]"><span className="text-slate-600">Security Deposit</span><br /><span className="text-orange-400 font-bold">{fmtINR(ra.sd_amount)}</span></div>}
                {ra.other_deductions > 0 && <div className="text-[10px]"><span className="text-slate-600">{ra.other_deductions_note || 'Other Deductions'}</span><br /><span className="text-orange-400 font-bold">{fmtINR(ra.other_deductions)}</span></div>}
              </div>
            )}

            <div className="flex gap-2 mt-3 flex-wrap">
              {ra.status === 'draft'     && <button onClick={() => updateRAStatus(ra.id, 'submitted')} className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-700/40">Submit to Client</button>}
              {ra.status === 'submitted' && <button onClick={() => updateRAStatus(ra.id, 'approved')}  className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-700/40">Mark Approved</button>}
              {ra.status === 'approved'  && <button onClick={() => updateRAStatus(ra.id, 'paid')}      className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-700/40">Mark Paid</button>}
            </div>
          </div>
        )
      })}

      {/* Raise RA Bill Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 shrink-0">
              <div>
                <p className="font-bold text-slate-100">Raise RA Bill</p>
                <p className="text-xs text-slate-500">{boq.title} · {boq.contract_number || boq.boq_number}</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Dates */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Bill Date"><input type="date" className={inp()} value={raForm.bill_date} onChange={e => setRF('bill_date', e.target.value)} /></Field>
                <Field label="Period From"><input type="date" className={inp()} value={raForm.period_from} onChange={e => setRF('period_from', e.target.value)} /></Field>
                <Field label="Period To"><input type="date" className={inp()} value={raForm.period_to} onChange={e => setRF('period_to', e.target.value)} /></Field>
              </div>

              {/* Work Done Table */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Work Done This Bill</p>
                <div className="border border-dark-700 rounded-xl overflow-hidden">
                  <div className="grid text-[10px] text-slate-500 uppercase tracking-wider px-3 py-2 bg-dark-800"
                    style={{ gridTemplateColumns: '1fr 50px 70px 70px 70px 80px' }}>
                    <span>Item</span><span>Unit</span><span className="text-right">Rate</span>
                    <span className="text-right">Prev Qty</span><span className="text-right">Cur Qty</span><span className="text-right">Amount</span>
                  </div>
                  {raLines.map((l, i) => {
                    const remaining = Number(l.previous_qty ? (allItems.find(x => x.id === l.boq_item_id)?.quantity || 0) - l.previous_qty : allItems.find(x => x.id === l.boq_item_id)?.quantity || 0)
                    return (
                      <div key={l.boq_item_id} className="grid border-t border-dark-800 items-center px-3 py-2"
                        style={{ gridTemplateColumns: '1fr 50px 70px 70px 70px 80px' }}>
                        <div>
                          <p className="text-xs text-slate-300 truncate">{l.description}</p>
                          <p className="text-[10px] text-slate-600">Remaining: {remaining.toLocaleString()} {l.unit}</p>
                        </div>
                        <p className="text-xs text-slate-500">{l.unit}</p>
                        <p className="text-xs text-slate-400 text-right">{fmtINR(l.rate)}</p>
                        <p className="text-xs text-slate-500 text-right">{Number(l.previous_qty).toLocaleString()}</p>
                        <input type="number" step="0.001" min="0"
                          className="text-xs bg-dark-700 border border-dark-600 rounded px-2 py-1 text-right text-slate-100 focus:outline-none focus:border-primary-500 w-full"
                          placeholder="0" value={l.current_qty}
                          onChange={e => setRaLines(p => p.map((x, j) => j === i ? { ...x, current_qty: e.target.value } : x))} />
                        <p className="text-xs font-semibold text-slate-200 text-right">{fmtINR((parseFloat(l.current_qty) || 0) * (l.rate || 0))}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tax */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tax</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="CGST %"><input type="number" className={inp()} value={raForm.cgst_rate} onChange={e => setRF('cgst_rate', e.target.value)} step="0.01" /></Field>
                  <Field label="SGST %"><input type="number" className={inp()} value={raForm.sgst_rate} onChange={e => setRF('sgst_rate', e.target.value)} step="0.01" /></Field>
                  <Field label="IGST %"><input type="number" className={inp()} value={raForm.igst_rate} onChange={e => setRF('igst_rate', e.target.value)} step="0.01" /></Field>
                </div>
              </div>

              {/* Recoveries */}
              <div className="bg-dark-800/60 border border-orange-700/20 rounded-xl p-4">
                <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-3">Recoveries & Deductions</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mob. Advance Recovery (₹)" hint="Amount being recovered this RA">
                    <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.mob_advance_recovery} onChange={e => setRF('mob_advance_recovery', e.target.value)} step="0.01" />
                  </Field>
                  <Field label="Security Deposit (₹)">
                    <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.sd_amount} onChange={e => setRF('sd_amount', e.target.value)} step="0.01" />
                  </Field>
                  {boq.it_applicable && (
                    <Field label={`Income Tax / TDS (%)`}>
                      <div className="flex gap-2">
                        <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.income_tax_pct} onChange={e => setRF('income_tax_pct', e.target.value)} step="0.01" />
                        <div className="flex items-center justify-center text-xs text-orange-400 font-bold w-24 bg-dark-700 border border-dark-600 rounded-lg shrink-0">{fmtINR(itAmt)}</div>
                      </div>
                    </Field>
                  )}
                  {boq.labour_cess_applicable && (
                    <Field label="Labour Cess (%)">
                      <div className="flex gap-2">
                        <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.labour_cess_pct} onChange={e => setRF('labour_cess_pct', e.target.value)} step="0.01" />
                        <div className="flex items-center justify-center text-xs text-orange-400 font-bold w-24 bg-dark-700 border border-dark-600 rounded-lg shrink-0">{fmtINR(lcAmt)}</div>
                      </div>
                    </Field>
                  )}
                  <Field label="Other Deductions (₹)">
                    <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.other_deductions} onChange={e => setRF('other_deductions', e.target.value)} step="0.01" />
                  </Field>
                  <Field label="Deduction Description">
                    <input className={inp()} placeholder="e.g. Penalty, Advance" value={raForm.other_deductions_note} onChange={e => setRF('other_deductions_note', e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 space-y-1.5">
                {[
                  ['Value of Work Done', subtotal, 'text-slate-300'],
                  cgst > 0 ? ['CGST', cgst, 'text-slate-400'] : null,
                  sgst > 0 ? ['SGST', sgst, 'text-slate-400'] : null,
                  igst > 0 ? ['IGST', igst, 'text-slate-400'] : null,
                  ['Gross Amount (incl. Tax)', grossWithTax, 'text-slate-200 font-bold'],
                  mobRec > 0 ? ['Less: Mob. Advance Recovery', -mobRec, 'text-orange-400'] : null,
                  itAmt > 0  ? [`Less: TDS @ ${raForm.income_tax_pct}%`, -itAmt, 'text-orange-400'] : null,
                  lcAmt > 0  ? [`Less: Labour Cess @ ${raForm.labour_cess_pct}%`, -lcAmt, 'text-orange-400'] : null,
                  sdAmt > 0  ? ['Less: Security Deposit', -sdAmt, 'text-orange-400'] : null,
                  otherDed > 0 ? [`Less: ${raForm.other_deductions_note || 'Other Deductions'}`, -otherDed, 'text-orange-400'] : null,
                  ['NET PAYABLE', netPayable, 'text-emerald-400 font-black text-base'],
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
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-xl">
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

// ── BOQ Detail ────────────────────────────────────────────────────────────────
function BOQDetail({ boq: initialBoq, companyId, session, onBack }) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('items')
  const [boq, setBoq] = useState(initialBoq)

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

  const addSection = async () => {
    await supabase.from('boq_sections').insert({ boq_id: boq.id, title: `Section ${sections.length + 1}`, sort_order: sections.length })
    refetchSections()
  }
  const updateSection = async (id, title) => { await supabase.from('boq_sections').update({ title }).eq('id', id); refetchSections() }
  const deleteSection = async (id) => {
    if (!window.confirm('Delete this section?')) return
    await supabase.from('boq_sections').delete().eq('id', id); refetchSections()
  }
  const addItem = async (sectionId, form) => {
    const { error } = await supabase.from('boq_items').insert({
      boq_id: boq.id, section_id: sectionId === '__none__' ? null : sectionId,
      description: form.description.trim(), item_code: form.item_code?.trim() || null,
      unit: form.unit, quantity: parseFloat(form.quantity) || 0, rate: parseFloat(form.rate) || 0,
      sort_order: (itemsBySection[sectionId] || []).length,
    })
    if (error) { toast.error(error.message); return }
    refresh()
  }
  const updateItem = async (id, patch) => {
    const { error } = await supabase.from('boq_items').update(patch).eq('id', id)
    if (error) toast.error(error.message); else refresh()
  }
  const deleteItem = async (id) => { await supabase.from('boq_items').delete().eq('id', id); refresh() }
  const updateStatus = async (status) => {
    await supabase.from('boq_documents').update({ status }).eq('id', boq.id)
    setBoq(p => ({ ...p, status }))
    qc.invalidateQueries({ queryKey: ['boq_documents', companyId] })
  }

  const totalValue    = Number(boq.total_value || 0)
  const executedValue = allItems.reduce((s, i) => s + (Number(i.executed_qty || 0) * Number(i.rate || 0)), 0)
  const billedNet     = raBills.filter(r => r.status !== 'draft').reduce((s, r) => s + Number(r.net_payable || 0), 0)
  const paidNet       = raBills.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.net_payable || 0), 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-800 shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-300"><ArrowLeft className="w-4 h-4" /></button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-mono text-primary-400">{boq.boq_number}</p>
              {boq.contract_number && <p className="text-xs font-mono text-slate-500">{boq.contract_number}</p>}
              <StatusBadge status={boq.status} cfg={STATUS_CFG} />
              {boq.client_name && <span className="text-xs text-slate-500">{boq.client_name}</span>}
            </div>
            <p className="font-bold text-slate-100 truncate">{boq.title}</p>
            {(boq.work_order_number || boq.loa_date) && (
              <p className="text-[11px] text-slate-600 mt-0.5">
                {boq.work_order_number && <span>WO: {boq.work_order_number}</span>}
                {boq.work_order_number && boq.loa_date && <span> · </span>}
                {boq.loa_date && <span>LOA: {fmtDate(boq.loa_date)}</span>}
              </p>
            )}
          </div>
          <select className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-slate-300 focus:outline-none shrink-0"
            value={boq.status} onChange={e => updateStatus(e.target.value)}>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-4 gap-2 mt-1">
          <div className="bg-dark-800 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Contract Value</p>
            <p className="text-sm font-black text-slate-100">{fmtINR(totalValue)}</p>
          </div>
          <div className="bg-dark-800 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Executed</p>
            <p className="text-sm font-black text-emerald-400">{fmtINR(executedValue)}</p>
          </div>
          <div className="bg-dark-800 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Billed Net</p>
            <p className="text-sm font-black text-primary-400">{fmtINR(billedNet)}</p>
          </div>
          <div className="bg-dark-800 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Paid</p>
            <p className="text-sm font-black text-blue-400">{fmtINR(paidNet)}</p>
          </div>
        </div>
        <div className="mt-2"><ProgressBar value={pct(executedValue, totalValue)} /></div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-800 shrink-0">
        {[
          { id: 'items',    label: 'BOQ Items' },
          { id: 'ra',       label: `RA Bills (${raBills.length})` },
          { id: 'abstract', label: 'Abstract' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === t.id ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'items' && (
          <div className="p-4">
            {sections.map(sec => (
              <BOQSection key={sec.id} section={sec} items={itemsBySection[sec.id] || []}
                onAddItem={addItem} onUpdateItem={updateItem} onDeleteItem={deleteItem}
                onDeleteSection={deleteSection} onUpdateSection={updateSection} />
            ))}
            {(itemsBySection['__none__'] || []).length > 0 && (
              <div className="border border-dashed border-dark-600 rounded-xl p-3 mb-3">
                <p className="text-xs text-slate-600 mb-2 font-semibold uppercase tracking-wider">Unsectioned</p>
                {(itemsBySection['__none__'] || []).map(item => (
                  <ItemRow key={item.id} item={item} onUpdate={updateItem} onDelete={deleteItem} />
                ))}
              </div>
            )}
            <div className="flex gap-3 mt-2">
              <button onClick={addSection} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-dark-700 hover:bg-dark-600 text-slate-300 rounded-lg border border-dark-600">
                <Plus className="w-3.5 h-3.5" /> Add Section
              </button>
            </div>
            {allItems.length > 0 && (
              <div className="mt-4 bg-dark-800 border border-dark-700 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-400">CONTRACT VALUE</p>
                <p className="text-xl font-black text-slate-100">{fmtINR(totalValue)}</p>
              </div>
            )}
          </div>
        )}
        {activeTab === 'ra' && (
          <RABillsTab boq={boq} raBills={raBills} allItems={allItems} companyId={companyId} session={session} onRefresh={() => { refetchRA(); refreshBoq() }} />
        )}
        {activeTab === 'abstract' && (
          <AbstractTab boq={boq} allItems={allItems} sections={sections} raBills={raBills} />
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BOQPage() {
  const { companyId, session } = useAuth()
  const [selectedBoq, setSelectedBoq] = useState(null)

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-0 shrink-0 border-b border-dark-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-700/40 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Bill of Quantities</h1>
            <p className="text-xs text-slate-500">Contracts · BOQ Items · RA Bills · Running Account</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {selectedBoq
          ? <BOQDetail boq={selectedBoq} companyId={companyId} session={session} onBack={() => setSelectedBoq(null)} />
          : <BOQList   companyId={companyId} session={session} onSelect={setSelectedBoq} />
        }
      </div>
    </div>
  )
}
