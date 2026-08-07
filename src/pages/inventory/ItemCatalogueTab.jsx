/**
 * ItemCatalogueTab — master list of spare parts / materials / services
 * with zone-based pricing. Lives in Inventory module.
 *
 * Props: companyId, session
 */
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import PagePanel from '../../components/shared/PagePanel'
import {
  Plus, X, Search, Loader2, Pencil, Trash2,
  Hash, Wrench, Package, ChevronDown, ToggleLeft, ToggleRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { UOM_LIST } from '../../utils/units'

// ── Helpers ───────────────────────────────────────────────────────────────────
const inp = (x = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, subtitle, onClose, children, footer }) {
  return (
    <PagePanel title={title} subtitle={subtitle} onClose={onClose} footer={footer}>
      {children}
    </PagePanel>
  )
}

export const ITEM_CATEGORIES = [
  { value: 'spare_part', label: 'Spare Part' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'service',    label: 'Service' },
  { value: 'fuel',       label: 'Fuel' },
  { value: 'lubricant',  label: 'Lubricant' },
  { value: 'tyre',       label: 'Tyre' },
  { value: 'other',      label: 'Other' },
]

const LINE_UNITS = UOM_LIST

export default function ItemCatalogueTab({ companyId, session }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [equipFilter, setEquipFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expandedZones, setExpandedZones] = useState(null)
  const [zoneForm, setZoneForm] = useState({ zone: '', avg_cost: '', max_cost: '' })
  const [savingZone, setSavingZone] = useState(false)

  const blankForm = () => ({
    item_name: '', brand: '', part_number: '', description: '',
    equipment_id: '', compatible_with: '',
    category: 'spare_part', unit: 'nos',
    avg_cost: '', max_cost: '', hsn_sac: '', gst_rate: '',
  })
  const [form, setForm] = useState(blankForm())
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['item_catalogue', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('item_catalogue')
        .select('*, equipment(id, name, registration_number)')
        .eq('company_id', companyId)
        .order('item_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: zonePrices = [] } = useQuery({
    queryKey: ['item_catalogue_prices', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('item_catalogue_prices')
        .select('*')
        .eq('company_id', companyId)
        .order('zone')
      return data || []
    },
    enabled: !!companyId,
  })

  const zonePriceMap = useMemo(() => {
    const m = {}
    for (const p of zonePrices) {
      if (!m[p.catalogue_id]) m[p.catalogue_id] = []
      m[p.catalogue_id].push(p)
    }
    return m
  }, [zonePrices])

  const { data: equipmentList = [] } = useQuery({
    queryKey: ['equipment_list_simple', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment')
        .select('id, name, registration_number')
        .eq('company_id', companyId).eq('is_active', true).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return items.filter(it => {
      if (catFilter !== 'all' && it.category !== catFilter) return false
      if (equipFilter !== 'all' && it.equipment_id !== equipFilter) return false
      if (!q) return true
      return (
        it.item_name.toLowerCase().includes(q) ||
        (it.brand || '').toLowerCase().includes(q) ||
        (it.part_number || '').toLowerCase().includes(q) ||
        (it.compatible_with || '').toLowerCase().includes(q)
      )
    })
  }, [items, search, catFilter, equipFilter])

  // ── Save item ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.item_name.trim()) { toast.error('Item name is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id: companyId,
        item_name: form.item_name.trim(),
        brand: form.brand.trim() || null,
        part_number: form.part_number.trim() || null,
        description: form.description.trim() || null,
        equipment_id: form.equipment_id || null,
        compatible_with: form.compatible_with.trim() || null,
        category: form.category,
        unit: form.unit,
        avg_cost: parseFloat(form.avg_cost) || null,
        max_cost: parseFloat(form.max_cost) || null,
        hsn_sac: form.hsn_sac.trim() || null,
        gst_rate: parseFloat(form.gst_rate) || null,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from('item_catalogue').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Item updated')
      } else {
        const { error } = await supabase.from('item_catalogue').insert({ ...payload, created_by: session.user.id })
        if (error) throw error
        toast.success('Item added to catalogue')
      }
      qc.invalidateQueries({ queryKey: ['item_catalogue', companyId] })
      setShowForm(false); setEditing(null); setForm(blankForm())
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  // ── Zone price CRUD ───────────────────────────────────────────────────────
  const saveZonePrice = async (catalogueId) => {
    if (!zoneForm.zone.trim()) { toast.error('Zone / state name required'); return }
    if (!zoneForm.avg_cost && !zoneForm.max_cost) { toast.error('Enter at least avg or max cost'); return }
    setSavingZone(true)
    try {
      const { error } = await supabase.from('item_catalogue_prices').upsert({
        catalogue_id: catalogueId,
        company_id: companyId,
        zone: zoneForm.zone.trim(),
        avg_cost: parseFloat(zoneForm.avg_cost) || null,
        max_cost: parseFloat(zoneForm.max_cost) || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'catalogue_id,zone' })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['item_catalogue_prices', companyId] })
      setZoneForm({ zone: '', avg_cost: '', max_cost: '' })
      toast.success('Zone price saved')
    } catch (e) { toast.error(e.message) } finally { setSavingZone(false) }
  }

  const deleteZonePrice = async (id) => {
    await supabase.from('item_catalogue_prices').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['item_catalogue_prices', companyId] })
    toast.success('Zone price removed')
  }

  const openEdit = (it) => {
    setEditing(it)
    setForm({
      item_name: it.item_name || '',
      brand: it.brand || '',
      part_number: it.part_number || '',
      description: it.description || '',
      equipment_id: it.equipment_id || '',
      compatible_with: it.compatible_with || '',
      category: it.category || 'spare_part',
      unit: it.unit || 'nos',
      avg_cost: it.avg_cost ?? '',
      max_cost: it.max_cost ?? '',
      hsn_sac: it.hsn_sac || '',
      gst_rate: it.gst_rate ?? '',
    })
    setShowForm(true)
  }

  const toggleActive = async (it) => {
    await supabase.from('item_catalogue').update({ is_active: !it.is_active }).eq('id', it.id)
    qc.invalidateQueries({ queryKey: ['item_catalogue', companyId] })
  }

  const deleteItem = async (it) => {
    if (!window.confirm(`Delete "${it.item_name}" from catalogue?`)) return
    await supabase.from('item_catalogue').delete().eq('id', it.id)
    qc.invalidateQueries({ queryKey: ['item_catalogue', companyId] })
    qc.invalidateQueries({ queryKey: ['item_catalogue_prices', companyId] })
    toast.success('Item deleted')
  }

  const catLabel = (v) => ITEM_CATEGORIES.find(c => c.value === v)?.label || v

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-800 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary-500"
              placeholder="Search item, brand, part number…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-300"
            value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {ITEM_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-300"
            value={equipFilter} onChange={e => setEquipFilter(e.target.value)}>
            <option value="all">All Equipment</option>
            {equipmentList.map(e => <option key={e.id} value={e.id}>{e.name || e.registration_number}</option>)}
          </select>
        </div>
        <button onClick={() => { setEditing(null); setForm(blankForm()); setShowForm(true) }}
          className="btn-primary shrink-0">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {/* Stats */}
      <div className="px-4 py-2 border-b border-dark-800 shrink-0 flex items-center gap-4 text-xs text-slate-500">
        <span>{items.filter(i => i.is_active).length} active</span>
        <span>·</span>
        <span>{items.filter(i => i.category === 'spare_part').length} spare parts</span>
        <span>·</span>
        <span>{zonePrices.length} zone prices</span>
        <span>·</span>
        <span>{filtered.length} shown</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-slate-500">
            <Package className="w-12 h-12 text-slate-700" />
            <p className="text-sm">{search || catFilter !== 'all' || equipFilter !== 'all' ? 'No items match your filters' : 'No items in catalogue yet'}</p>
            <button onClick={() => { setEditing(null); setForm(blankForm()); setShowForm(true) }} className="btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" /> Add First Item
            </button>
          </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map(it => {
              const zones = zonePriceMap[it.id] || []
              const isZoneOpen = expandedZones === it.id
              return (
                <div key={it.id} className={`bg-dark-800 border rounded-xl overflow-hidden ${it.is_active ? 'border-dark-700' : 'border-dark-700/40 opacity-60'}`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-slate-100">{it.item_name}</p>
                          {it.brand && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/10 border border-primary-700/30 text-primary-400">{it.brand}</span>}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 border border-dark-600 text-slate-400">{catLabel(it.category)}</span>
                          {zones.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-700/30 text-violet-400">
                              🌐 {zones.length} zone{zones.length > 1 ? 's' : ''}
                            </span>
                          )}
                          {!it.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 border border-slate-600/40 text-slate-500">Inactive</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {it.part_number && (
                            <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                              <Hash className="w-3 h-3 text-slate-600" />{it.part_number}
                            </span>
                          )}
                          {(it.equipment?.name || it.compatible_with) && (
                            <span className="text-xs text-amber-400 flex items-center gap-1">
                              <Wrench className="w-3 h-3" />
                              Compatible: {it.equipment?.name || it.compatible_with}
                            </span>
                          )}
                          {it.hsn_sac && <span className="text-xs text-slate-500">HSN {it.hsn_sac}</span>}
                        </div>
                        {it.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{it.description}</p>}
                      </div>
                      {/* Right — base pricing */}
                      <div className="text-right shrink-0">
                        <p className="text-[9px] text-slate-600 uppercase tracking-wider">Base Price</p>
                        {it.avg_cost != null
                          ? <p className="text-sm font-bold text-slate-100">{fmtINR(it.avg_cost)}<span className="text-[10px] text-slate-500 font-normal ml-1">avg</span></p>
                          : <p className="text-xs text-slate-600 italic">—</p>
                        }
                        {it.max_cost != null && <p className="text-xs text-orange-400">Max {fmtINR(it.max_cost)}</p>}
                        <p className="text-[10px] text-slate-600 mt-0.5">{it.unit}</p>
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center justify-between gap-1 mt-3 pt-3 border-t border-dark-700/50">
                      <button
                        onClick={() => { setExpandedZones(isZoneOpen ? null : it.id); setZoneForm({ zone: '', avg_cost: '', max_cost: '' }) }}
                        className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors ${isZoneOpen ? 'bg-violet-900/30 text-violet-400 border border-violet-700/40' : 'text-slate-400 hover:text-violet-400 hover:bg-violet-900/20'}`}>
                        <ChevronDown className={`w-3 h-3 transition-transform ${isZoneOpen ? 'rotate-180' : ''}`} />
                        Zone Prices {zones.length > 0 ? `(${zones.length})` : ''}
                      </button>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(it)} className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-900/20 transition-colors">
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button onClick={() => toggleActive(it)} className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors ${it.is_active ? 'text-slate-400 hover:text-amber-400 hover:bg-amber-900/20' : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20'}`}>
                          {it.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                          {it.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => deleteItem(it)} className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Zone Prices Panel */}
                  {isZoneOpen && (
                    <div className="border-t border-dark-700 bg-dark-900/50 px-4 py-3">
                      <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-2">🌐 Zone / State-based Prices</p>
                      {zones.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {zones.map(z => (
                            <div key={z.id} className="flex items-center gap-2 bg-dark-700/50 border border-dark-600/50 rounded-lg px-3 py-2">
                              <p className="text-xs font-semibold text-slate-200 flex-1">{z.zone}</p>
                              {z.avg_cost != null && <span className="text-xs font-bold text-slate-300">{fmtINR(z.avg_cost)}<span className="text-[10px] text-slate-500 ml-1">avg</span></span>}
                              {z.max_cost != null && <span className="text-xs text-orange-400">Max {fmtINR(z.max_cost)}</span>}
                              <button onClick={() => deleteZonePrice(z.id)} className="text-slate-600 hover:text-red-400 transition-colors ml-1">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Add zone form */}
                      <div className="flex gap-2 items-end flex-wrap">
                        <div className="flex-1 min-w-[140px]">
                          <p className="text-[10px] text-slate-500 mb-1">Zone / State *</p>
                          <input
                            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 placeholder-slate-600"
                            placeholder="e.g. Tamil Nadu"
                            value={zoneForm.zone}
                            onChange={e => setZoneForm(p => ({ ...p, zone: e.target.value }))}
                          />
                        </div>
                        <div className="w-28">
                          <p className="text-[10px] text-slate-500 mb-1">Avg Cost ₹</p>
                          <input type="number" step="0.01"
                            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 placeholder-slate-600"
                            placeholder="0.00" value={zoneForm.avg_cost}
                            onChange={e => setZoneForm(p => ({ ...p, avg_cost: e.target.value }))}
                          />
                        </div>
                        <div className="w-28">
                          <p className="text-[10px] text-slate-500 mb-1">Max Cost ₹</p>
                          <input type="number" step="0.01"
                            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-orange-300 focus:outline-none focus:border-orange-500 border-orange-700/30 placeholder-slate-600"
                            placeholder="0.00" value={zoneForm.max_cost}
                            onChange={e => setZoneForm(p => ({ ...p, max_cost: e.target.value }))}
                          />
                        </div>
                        <button onClick={() => saveZonePrice(it.id)} disabled={savingZone}
                          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors">
                          {savingZone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          Add Zone
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-2">Zone prices appear as selectable options when picking this item in purchase bills.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <Modal
          title={editing ? 'Edit Item' : 'Add to Catalogue'}
          subtitle={editing ? editing.item_name : 'Spare part, material or service'}
          onClose={() => { setShowForm(false); setEditing(null); setForm(blankForm()) }}
          footer={
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowForm(false); setEditing(null); setForm(blankForm()) }} className="btn-ghost">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {editing ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          }>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Item Name *">
                <input className={inp()} placeholder="e.g. Air Filter" value={form.item_name} onChange={e => setF('item_name', e.target.value)} autoFocus />
              </Field>
              <Field label="Brand">
                <input className={inp()} placeholder="e.g. Fleetguard" value={form.brand} onChange={e => setF('brand', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Part Number">
                <input className={`${inp()} font-mono uppercase`} placeholder="e.g. AF-2631M" value={form.part_number} onChange={e => setF('part_number', e.target.value)} />
              </Field>
              <Field label="Category">
                <select className={inp()} value={form.category} onChange={e => setF('category', e.target.value)}>
                  {ITEM_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Compatible Equipment">
              <select className={inp()} value={form.equipment_id} onChange={e => setF('equipment_id', e.target.value)}>
                <option value="">-- Select equipment (optional) --</option>
                {equipmentList.map(e => <option key={e.id} value={e.id}>{e.name || e.registration_number}</option>)}
              </select>
            </Field>
            <Field label="Compatible With (free text)">
              <input className={inp()} placeholder="e.g. All JCB 3DX variants" value={form.compatible_with} onChange={e => setF('compatible_with', e.target.value)} />
            </Field>
            <Field label="Unit of Measure">
              <select className={inp()} value={form.unit} onChange={e => setF('unit', e.target.value)}>
                {LINE_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </Field>
            {/* Base Pricing */}
            <div className="bg-dark-700/50 border border-dark-600 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Base Price (Nationwide / Default)</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Average Cost (₹)">
                  <input className={inp()} type="number" step="0.01" placeholder="0.00" value={form.avg_cost} onChange={e => setF('avg_cost', e.target.value)} />
                </Field>
                <Field label="Maximum Cost (₹)">
                  <input className={`${inp()} border-orange-700/40 focus:border-orange-500`} type="number" step="0.01" placeholder="0.00" value={form.max_cost} onChange={e => setF('max_cost', e.target.value)} />
                </Field>
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5">Zone-specific prices can be added after saving — click "Zone Prices" on the item card.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="HSN / SAC Code">
                <input className={`${inp()} font-mono uppercase`} placeholder="e.g. 84139110" value={form.hsn_sac} onChange={e => setF('hsn_sac', e.target.value)} />
              </Field>
              <Field label="GST Rate (%)">
                <input className={inp()} type="number" min="0" max="100" step="0.01" placeholder="18" value={form.gst_rate} onChange={e => setF('gst_rate', e.target.value)} />
              </Field>
            </div>
            <Field label="Description / Notes">
              <textarea className={`${inp()} resize-none`} rows={3} placeholder="Specs, compatibility notes…" value={form.description} onChange={e => setF('description', e.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
