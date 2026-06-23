import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Wrench, Plus, X, ChevronRight, Loader2,
  Calendar, CheckCircle, Circle, AlertCircle, Search,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Helpers ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0]

const inp = (extra = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-2 text-sm text-slate-100
   placeholder-slate-500 focus:outline-none focus:border-primary-500 ${extra}`

const MAINTENANCE_TYPES = [
  { value: 'preventive',  label: 'Preventive Maintenance' },
  { value: 'breakdown',   label: 'Breakdown Repair' },
  { value: 'accidental',  label: 'Accidental Damage' },
  { value: 'overhaul',    label: 'Overhaul / Major Service' },
]

const STATUS_CONFIG = {
  open:        { label: 'Open',        cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-700/30' },
  in_progress: { label: 'In Progress', cls: 'bg-blue-500/10   text-blue-400   border-blue-700/30'   },
  completed:   { label: 'Completed',   cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-700/30' },
}

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      cls: 'text-slate-400',  dot: 'bg-slate-500'  },
  normal:   { label: 'Normal',   cls: 'text-blue-400',   dot: 'bg-blue-500'   },
  high:     { label: 'High',     cls: 'text-orange-400', dot: 'bg-orange-500' },
  critical: { label: 'Critical', cls: 'text-red-400',    dot: 'bg-red-500'    },
}

const fmt = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

// ── Create / Edit Modal ───────────────────────────────────────────────────────
function MaintenanceFormModal({ record, companyId, session, onClose, onSaved }) {
  const isEdit = !!record
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    equipment_id:     record?.equipment_id     || '',
    maintenance_type: record?.maintenance_type || 'preventive',
    description:      record?.description      || '',
    service_date:     record?.service_date     || today(),
    completed_date:   record?.completed_date   || '',
    technician_name:  record?.technician_name  || '',
    done_by:          record?.done_by          || 'inhouse',
    labour_cost:      record?.labour_cost      || '',
    total_cost:       record?.total_cost       || '',
    downtime_hours:   record?.downtime_hours   || '',
    meter_at_service: record?.meter_at_service || '',
    status:           record?.status           || 'open',
    priority:         record?.priority         || 'normal',
    notes:            record?.notes            || '',
    project_id:       record?.project_id       || '',
  })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { data: equipList = [] } = useQuery({
    queryKey: ['equip_list_maint', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id, name, equipment_number, category, current_project_id, current_client_id')
        .eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects_list_maint', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('projects')
        .select('id, name, project_code').eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Auto-fill project when equipment selected
  const handleEquipChange = (equipId) => {
    setF('equipment_id', equipId)
    const eq = equipList.find(e => e.id === equipId)
    if (eq?.current_project_id && !form.project_id) {
      setF('project_id', eq.current_project_id)
    }
  }

  const handleSave = async () => {
    if (!form.equipment_id) { toast.error('Select equipment'); return }
    if (!form.description.trim()) { toast.error('Description required'); return }
    if (!form.service_date) { toast.error('Service date required'); return }
    setSaving(true)
    try {
      const eq = equipList.find(e => e.id === form.equipment_id)
      const payload = {
        company_id:       companyId,
        equipment_id:     form.equipment_id,
        maintenance_type: form.maintenance_type,
        description:      form.description.trim(),
        service_date:     form.service_date,
        completed_date:   form.completed_date || null,
        technician_name:  form.technician_name.trim() || null,
        done_by:          form.done_by,
        labour_cost:      form.labour_cost   ? Number(form.labour_cost)   : 0,
        total_cost:       form.total_cost    ? Number(form.total_cost)    : 0,
        downtime_hours:   form.downtime_hours ? Number(form.downtime_hours) : 0,
        meter_at_service: form.meter_at_service ? Number(form.meter_at_service) : null,
        status:           form.status,
        priority:         form.priority,
        notes:            form.notes.trim() || null,
        project_id:       form.project_id  || null,
        client_id:        eq?.current_client_id || null,
        created_by:       session?.user?.id,
      }

      if (isEdit) {
        const { error } = await supabase.from('maintenance_records').update(payload).eq('id', record.id)
        if (error) throw error
        toast.success('Record updated')
      } else {
        const { error } = await supabase.from('maintenance_records').insert(payload)
        if (error) throw error
        // Tag equipment as under maintenance
        if (['breakdown', 'accidental', 'overhaul'].includes(form.maintenance_type) && form.status !== 'completed') {
          await supabase.from('equipment').update({ status: 'maintenance' }).eq('id', form.equipment_id)
        }
        toast.success('Maintenance record created')
      }
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-dark-900 sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700 shrink-0 bg-dark-800 sm:rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary-400" />
            <p className="font-bold text-slate-100">{isEdit ? 'Edit Record' : 'New Maintenance Record'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Equipment *</label>
            <select className={inp()} value={form.equipment_id} onChange={e => handleEquipChange(e.target.value)}>
              <option value="">Select equipment…</option>
              {equipList.map(e => (
                <option key={e.id} value={e.id}>
                  {e.equipment_number ? `${e.equipment_number} · ` : ''}{e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type *</label>
              <select className={inp()} value={form.maintenance_type} onChange={e => setF('maintenance_type', e.target.value)}>
                {MAINTENANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Priority</label>
              <select className={inp()} value={form.priority} onChange={e => setF('priority', e.target.value)}>
                {Object.entries(PRIORITY_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description / Work Done *</label>
            <textarea className={inp('min-h-[68px] resize-none')} value={form.description}
              onChange={e => setF('description', e.target.value)} placeholder="Describe the maintenance work…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Service Date *</label>
              <input type="date" className={inp()} value={form.service_date} onChange={e => setF('service_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Completed Date</label>
              <input type="date" className={inp()} value={form.completed_date} onChange={e => setF('completed_date', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Technician / Vendor</label>
              <input className={inp()} value={form.technician_name} onChange={e => setF('technician_name', e.target.value)} placeholder="Name" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Done By</label>
              <select className={inp()} value={form.done_by} onChange={e => setF('done_by', e.target.value)}>
                <option value="inhouse">In-house</option>
                <option value="vendor">External Vendor</option>
                <option value="oem">OEM Service</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Labour (₹)</label>
              <input type="number" className={inp()} value={form.labour_cost} onChange={e => setF('labour_cost', e.target.value)} min="0" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Total Cost (₹)</label>
              <input type="number" className={inp()} value={form.total_cost} onChange={e => setF('total_cost', e.target.value)} min="0" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Downtime (h)</label>
              <input type="number" className={inp()} value={form.downtime_hours} onChange={e => setF('downtime_hours', e.target.value)} min="0" step="0.5" placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Meter at Service</label>
              <input type="number" className={inp()} value={form.meter_at_service} onChange={e => setF('meter_at_service', e.target.value)} min="0" placeholder="hrs / km" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Status</label>
              <select className={inp()} value={form.status} onChange={e => setF('status', e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Project (auto-filled from equipment)</label>
            <select className={inp()} value={form.project_id} onChange={e => setF('project_id', e.target.value)}>
              <option value="">No project linked</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ''}{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <textarea className={inp('min-h-[52px] resize-none')} value={form.notes}
              onChange={e => setF('notes', e.target.value)} placeholder="Additional remarks…" />
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-dark-700 shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 border border-dark-600 hover:border-dark-500 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create Record'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function RecordDetailModal({ record, companyId, onClose, onEdit }) {
  const qc = useQueryClient()
  const [completing, setCompleting] = useState(false)

  const handleMarkComplete = async () => {
    setCompleting(true)
    try {
      const { error } = await supabase.from('maintenance_records')
        .update({ status: 'completed', completed_date: today() }).eq('id', record.id)
      if (error) throw error
      await supabase.from('equipment').update({ status: 'idle' }).eq('id', record.equipment_id)
      toast.success('Marked as completed — equipment set to idle')
      qc.invalidateQueries(['maintenance_records', companyId])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally { setCompleting(false) }
  }

  const st = STATUS_CONFIG[record.status] || STATUS_CONFIG.open
  const pr = PRIORITY_CONFIG[record.priority] || PRIORITY_CONFIG.normal

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-dark-900 sm:rounded-2xl border-t sm:border border-dark-600 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        <div className="flex items-start justify-between px-4 py-3 border-b border-dark-700 shrink-0 bg-dark-800 sm:rounded-t-2xl">
          <div className="flex-1 min-w-0 pr-2">
            <p className="font-bold text-slate-100 truncate">{record.equipment?.name || 'Maintenance Record'}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
              <span className={`text-xs font-medium ${pr.cls} flex items-center gap-1`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pr.dot}`} />{pr.label}
              </span>
              <span className="text-xs text-slate-500">{format(new Date(record.service_date), 'dd MMM yyyy')}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Type</p>
              <p className="text-sm font-semibold text-slate-100">
                {MAINTENANCE_TYPES.find(t => t.value === record.maintenance_type)?.label || record.maintenance_type}
              </p>
            </div>
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Equipment</p>
              <p className="text-sm font-semibold text-primary-400 truncate">{record.equipment?.equipment_number || record.equipment?.name || '—'}</p>
              {record.equipment?.equipment_number && <p className="text-[10px] text-slate-500 truncate">{record.equipment.name}</p>}
            </div>
          </div>

          <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Work Description</p>
            <p className="text-sm text-slate-200 leading-relaxed">{record.description}</p>
          </div>

          {(record.technician_name || record.done_by) && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Technician</p>
              <p className="text-sm font-semibold text-slate-100">{record.technician_name || '—'}</p>
              <p className="text-[10px] text-slate-500 capitalize">{record.done_by?.replace('_', ' ')}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-dark-800 rounded-xl p-2.5 border border-dark-700 text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">Labour</p>
              <p className="text-sm font-bold text-slate-200">{fmt(record.labour_cost)}</p>
            </div>
            <div className="bg-dark-800 rounded-xl p-2.5 border border-dark-700 text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">Total Cost</p>
              <p className="text-sm font-bold text-emerald-400">{fmt(record.total_cost)}</p>
            </div>
            <div className="bg-dark-800 rounded-xl p-2.5 border border-dark-700 text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">Downtime</p>
              <p className="text-sm font-bold text-orange-400">{record.downtime_hours || 0}h</p>
            </div>
          </div>

          {record._project && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Project</p>
              <p className="text-sm font-semibold text-slate-100">{record._project.name}</p>
              {record._project.project_code && <p className="text-[10px] text-slate-500">{record._project.project_code}</p>}
            </div>
          )}

          {record.notes && (
            <div className="bg-dark-800 rounded-xl p-3 border border-dark-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-slate-400 leading-relaxed">{record.notes}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-dark-700 shrink-0">
          <button onClick={onEdit}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-slate-300 border border-dark-600 hover:border-primary-600 hover:text-primary-400 transition-colors">
            Edit
          </button>
          {record.status !== 'completed' && (
            <button onClick={handleMarkComplete} disabled={completing}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Mark Completed
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MaintenancePage() {
  const { companyId, session, role } = useAuth()
  const qc = useQueryClient()
  const isAdmin = ['admin', 'superadmin'].includes(role)

  const [showCreate, setShowCreate] = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [search, setSearch] = useState('')

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['maintenance_records', companyId, statusFilter, typeFilter],
    queryFn: async () => {
      let q = supabase.from('maintenance_records')
        .select('*, equipment(id, name, equipment_number, category, meter_type)')
        .eq('company_id', companyId)
        .order('service_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)

      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      if (typeFilter   !== 'all') q = q.eq('maintenance_type', typeFilter)

      const { data, error } = await q
      if (error) throw error

      const rows = data || []

      // Batch-resolve project names
      const projectIds = [...new Set(rows.map(r => r.project_id).filter(Boolean))]
      if (projectIds.length > 0) {
        const { data: projs } = await supabase.from('projects')
          .select('id, name, project_code').in('id', projectIds)
        if (projs) {
          const pMap = Object.fromEntries(projs.map(p => [p.id, p]))
          rows.forEach(r => { r._project = r.project_id ? (pMap[r.project_id] || null) : null })
        }
      }
      return rows
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter(r =>
      r.equipment?.name?.toLowerCase().includes(q) ||
      r.equipment?.equipment_number?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.technician_name?.toLowerCase().includes(q) ||
      r._project?.name?.toLowerCase().includes(q)
    )
  }, [records, search])

  // Summary stats
  const openCount     = records.filter(r => r.status === 'open').length
  const inProgCount   = records.filter(r => r.status === 'in_progress').length
  const totalCost     = records.reduce((s, r) => s + Number(r.total_cost || 0), 0)
  const totalDowntime = records.reduce((s, r) => s + Number(r.downtime_hours || 0), 0)

  const handleSaved = () => {
    setShowCreate(false)
    setEditTarget(null)
    qc.invalidateQueries(['maintenance_records', companyId])
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dark-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-dark-700 flex-shrink-0">
        <Wrench className="w-5 h-5 text-primary-400" />
        <h1 className="text-base font-bold text-slate-100">Maintenance</h1>
        <div className="flex-1" />
        {isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-primary-600/20">
            <Plus className="w-4 h-4" /> New Record
          </button>
        )}
      </div>

      {/* Summary bar */}
      {(openCount > 0 || inProgCount > 0 || totalCost > 0) && (
        <div className="px-5 py-2 border-b border-dark-800 flex items-center gap-3 flex-wrap shrink-0">
          {openCount > 0 && (
            <span className="text-xs bg-yellow-900/20 border border-yellow-700/30 text-yellow-400 px-2.5 py-1 rounded-lg font-semibold">
              {openCount} Open
            </span>
          )}
          {inProgCount > 0 && (
            <span className="text-xs bg-blue-900/20 border border-blue-700/30 text-blue-400 px-2.5 py-1 rounded-lg font-semibold">
              {inProgCount} In Progress
            </span>
          )}
          {totalCost > 0 && (
            <span className="text-xs text-slate-400 ml-auto">
              Total: <span className="text-slate-200 font-semibold">{fmt(totalCost)}</span>
              {totalDowntime > 0 && (
                <span className="ml-3">Downtime: <span className="text-orange-400 font-semibold">{totalDowntime.toFixed(0)}h</span></span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="px-5 py-2 border-b border-dark-800 flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500"
            placeholder="Search equipment, description…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-primary-500"
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {MAINTENANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Records list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Wrench className="w-12 h-12 text-slate-700" />
            <p className="text-slate-500 text-sm">No maintenance records found</p>
            {isAdmin && (
              <button onClick={() => setShowCreate(true)}
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
                <Plus className="w-4 h-4" /> Create first record
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const st = STATUS_CONFIG[r.status] || STATUS_CONFIG.open
              const pr = PRIORITY_CONFIG[r.priority] || PRIORITY_CONFIG.normal
              const mtype = MAINTENANCE_TYPES.find(t => t.value === r.maintenance_type)

              return (
                <button key={r.id} onClick={() => setSelected(r)}
                  className="w-full text-left bg-dark-800 border border-dark-700 hover:border-primary-700/40 rounded-xl px-4 py-3 transition-all group">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {r.status === 'completed'
                        ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                        : r.status === 'in_progress'
                          ? <AlertCircle className="w-4 h-4 text-blue-400" />
                          : <Circle className="w-4 h-4 text-yellow-400" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-semibold text-slate-100">
                          {r.equipment?.equipment_number
                            ? <span className="text-primary-400 font-mono">{r.equipment.equipment_number} · </span>
                            : null}
                          {r.equipment?.name || 'Unknown Equipment'}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls} shrink-0`}>{st.label}</span>
                        {r.priority && r.priority !== 'normal' && (
                          <span className={`text-[10px] flex items-center gap-1 ${pr.cls} shrink-0`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pr.dot}`} />{pr.label}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 truncate">{r.description}</p>

                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(r.service_date), 'dd MMM yyyy')}
                        </span>
                        {mtype && <span className="text-[11px] text-slate-500">{mtype.label}</span>}
                        {r._project && (
                          <span className="text-[11px] text-primary-400/70 truncate max-w-[140px]">
                            📋 {r._project.name}
                          </span>
                        )}
                        {Number(r.total_cost) > 0 && (
                          <span className="text-[11px] text-emerald-400 font-semibold">{fmt(r.total_cost)}</span>
                        )}
                        {Number(r.downtime_hours) > 0 && (
                          <span className="text-[11px] text-orange-400">⏱ {r.downtime_hours}h down</span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-1" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <MaintenanceFormModal companyId={companyId} session={session}
          onClose={() => setShowCreate(false)} onSaved={handleSaved} />
      )}
      {editTarget && (
        <MaintenanceFormModal record={editTarget} companyId={companyId} session={session}
          onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      )}
      {selected && !editTarget && (
        <RecordDetailModal record={selected} companyId={companyId}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditTarget(selected); setSelected(null) }} />
      )}
    </div>
  )
}
