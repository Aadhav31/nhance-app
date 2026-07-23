/**
 * VehiclesTab — unified vehicle registry
 * Used in both PurchasePage and CrusherSalesPage (Sales & Invoicing)
 * Props:
 *   context: 'purchase' | 'sales'   (filters default view, both can see all)
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { toast } from 'react-hot-toast'
import {
  Plus, Truck, Pencil, Trash2, X, ChevronDown, ChevronUp,
  User, Phone, Tag, AlertCircle
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const VEHICLE_TYPES = ['truck', 'tipper', 'tractor', 'trailer', 'lorry', 'van', 'other']
const OWNERSHIP_TYPES = [
  { value: 'own',         label: 'Own Vehicle',       color: 'badge-info' },
  { value: 'vendor',      label: 'Vendor / Hired',    color: 'badge-warning' },
  { value: 'client',      label: "Client's Vehicle",  color: 'badge-success' },
  { value: 'transporter', label: 'Transporter',        color: 'badge-neutral' },
]
const RATE_UNITS = [
  { value: 'per_trip', label: 'Per Trip' },
  { value: 'per_ton',  label: 'Per Ton' },
  { value: 'per_km',   label: 'Per KM' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const ownershipMeta = (type) =>
  OWNERSHIP_TYPES.find(o => o.value === type) || OWNERSHIP_TYPES[3]

// ── VehicleFormModal ──────────────────────────────────────────────────────────
function VehicleFormModal({ vehicle, vendors, clients, onClose, onSaved }) {
  const { companyId } = useAuth()
  const [form, setForm] = useState({
    vehicle_number:      vehicle?.vehicle_number      || '',
    vehicle_type:        vehicle?.vehicle_type        || 'truck',
    description:         vehicle?.description         || '',
    ownership_type:      vehicle?.ownership_type      || 'own',
    vendor_id:           vehicle?.vendor_id           || '',
    client_id:           vehicle?.client_id           || '',
    driver_name:         vehicle?.driver_name         || '',
    driver_phone:        vehicle?.driver_phone        || '',
    transport_rate:      vehicle?.transport_rate      || '',
    transport_rate_unit: vehicle?.transport_rate_unit || 'per_trip',
    is_active:           vehicle?.is_active           ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.vehicle_number.trim()) return toast.error('Vehicle number is required')
    if (form.ownership_type === 'vendor' && !form.vendor_id)
      return toast.error('Select a vendor for vendor-type vehicles')
    if (form.ownership_type === 'client' && !form.client_id)
      return toast.error('Select a client for client-type vehicles')

    setSaving(true)
    try {
      const payload = {
        company_id:          companyId,
        vehicle_number:      form.vehicle_number.trim().toUpperCase(),
        vehicle_type:        form.vehicle_type,
        description:         form.description.trim() || null,
        ownership_type:      form.ownership_type,
        vendor_id:           ['vendor', 'transporter'].includes(form.ownership_type) ? (form.vendor_id || null) : null,
        client_id:           form.ownership_type === 'client' ? (form.client_id || null) : null,
        driver_name:         form.driver_name.trim() || null,
        driver_phone:        form.driver_phone.trim() || null,
        transport_rate:      form.transport_rate !== '' ? Number(form.transport_rate) : null,
        transport_rate_unit: form.transport_rate !== '' ? form.transport_rate_unit : null,
        is_active:           form.is_active,
      }

      const { error } = vehicle?.id
        ? await supabase.from('vehicles').update(payload).eq('id', vehicle.id)
        : await supabase.from('vehicles').insert(payload)

      if (error) throw error
      toast.success(vehicle?.id ? 'Vehicle updated' : 'Vehicle added')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally { setSaving(false) }
  }

  const needsVendor = ['vendor', 'transporter'].includes(form.ownership_type)
  const needsClient = form.ownership_type === 'client'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-dark-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-600/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-100">
              {vehicle?.id ? 'Edit Vehicle' : 'Add Vehicle'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Vehicle Number + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Vehicle Number *</label>
              <input
                value={form.vehicle_number}
                onChange={e => set('vehicle_number', e.target.value.toUpperCase())}
                placeholder="TN46AB1234"
                className="input-field w-full uppercase"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type</label>
              <select value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)}
                className="input-field w-full">
                {VEHICLE_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ownership */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Ownership Type</label>
            <div className="grid grid-cols-2 gap-2">
              {OWNERSHIP_TYPES.map(o => (
                <button
                  key={o.value}
                  onClick={() => set('ownership_type', o.value)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left ${
                    form.ownership_type === o.value
                      ? 'border-primary-500 bg-primary-600/20 text-primary-300'
                      : 'border-dark-600 bg-dark-700 text-slate-400 hover:border-dark-500'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vendor / Client picker */}
          {needsVendor && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                {form.ownership_type === 'transporter' ? 'Transporter (Vendor)' : 'Vendor *'}
              </label>
              <select value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}
                className="input-field w-full">
                <option value="">-- Select vendor --</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}

          {needsClient && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Client *</label>
              <select value={form.client_id} onChange={e => set('client_id', e.target.value)}
                className="input-field w-full">
                <option value="">-- Select client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Driver */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Driver Name</label>
              <input value={form.driver_name} onChange={e => set('driver_name', e.target.value)}
                placeholder="Driver name" className="input-field w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Driver Phone</label>
              <input value={form.driver_phone} onChange={e => set('driver_phone', e.target.value)}
                placeholder="9876543210" className="input-field w-full" />
            </div>
          </div>

          {/* Transport Rate (for vendor/transporter vehicles — used in auto-billing) */}
          {['vendor', 'transporter'].includes(form.ownership_type) && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300 font-medium">Transport Rate — used to auto-create bills on stock-in</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Rate (₹)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.transport_rate}
                    onChange={e => set('transport_rate', e.target.value)}
                    placeholder="0.00"
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Rate Unit</label>
                  <select value={form.transport_rate_unit} onChange={e => set('transport_rate_unit', e.target.value)}
                    className="input-field w-full">
                    {RATE_UNITS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Leave blank to skip auto-billing for this vehicle.
              </p>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Any additional notes" className="input-field w-full" />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="w-4 h-4 rounded accent-primary-500" />
            <span className="text-sm text-slate-300">Active vehicle</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-dark-700">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-dark-600 text-slate-300 text-sm hover:bg-dark-700 transition-all">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-all disabled:opacity-50">
            {saving ? 'Saving…' : vehicle?.id ? 'Update Vehicle' : 'Add Vehicle'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── VehicleCard ───────────────────────────────────────────────────────────────
function VehicleCard({ vehicle, vendors, clients, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const meta = ownershipMeta(vehicle.ownership_type)

  const vendorName = vehicle.vendor_id
    ? vendors.find(v => v.id === vehicle.vendor_id)?.name
    : null
  const clientName = vehicle.client_id
    ? (clients.find(c => c.id === vehicle.client_id)?.display_name ||
       clients.find(c => c.id === vehicle.client_id)?.business_name)
    : null

  return (
    <div className={`bg-dark-800 border rounded-xl transition-all ${vehicle.is_active ? 'border-dark-700' : 'border-dark-700 opacity-60'}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-primary-300 font-mono tracking-wide">
              {vehicle.vehicle_number}
            </span>
            <span className={`badge ${meta.color} text-xs`}>{meta.label}</span>
            <span className="text-xs text-slate-500 capitalize">{vehicle.vehicle_type}</span>
            {!vehicle.is_active && (
              <span className="badge badge-neutral text-xs">Inactive</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {vendorName && (
              <span className="text-xs text-slate-400">
                <Tag className="w-3 h-3 inline mr-1" />{vendorName}
              </span>
            )}
            {clientName && (
              <span className="text-xs text-slate-400">
                <Tag className="w-3 h-3 inline mr-1" />{clientName}
              </span>
            )}
            {vehicle.driver_name && (
              <span className="text-xs text-slate-400">
                <User className="w-3 h-3 inline mr-1" />{vehicle.driver_name}
              </span>
            )}
            {vehicle.transport_rate && (
              <span className="text-xs text-amber-400 font-medium">
                ₹{Number(vehicle.transport_rate).toLocaleString('en-IN')} / {RATE_UNITS.find(r => r.value === vehicle.transport_rate_unit)?.label || vehicle.transport_rate_unit}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => onEdit(vehicle)}
            className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(vehicle)}
            className="p-1.5 rounded-lg hover:bg-dark-700 text-red-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-dark-700 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
          {vehicle.driver_phone && (
            <div>
              <p className="text-xs text-slate-500">Driver Phone</p>
              <p className="text-xs text-slate-200 flex items-center gap-1">
                <Phone className="w-3 h-3" />{vehicle.driver_phone}
              </p>
            </div>
          )}
          {vehicle.description && (
            <div className="col-span-2">
              <p className="text-xs text-slate-500">Notes</p>
              <p className="text-xs text-slate-300">{vehicle.description}</p>
            </div>
          )}
          {vehicle.transport_rate && (
            <div>
              <p className="text-xs text-slate-500">Auto-bill rate</p>
              <p className="text-xs text-amber-300 font-medium">
                ₹{Number(vehicle.transport_rate).toLocaleString('en-IN')} {RATE_UNITS.find(r => r.value === vehicle.transport_rate_unit)?.label}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main VehiclesTab ──────────────────────────────────────────────────────────
export default function VehiclesTab({ context = 'purchase' }) {
  const { companyId } = useAuth()
  const qc = useQueryClient()
  const [modalVehicle, setModalVehicle] = useState(null)   // null=closed, {}=new, {id,...}=edit
  const [ownerFilter, setOwnerFilter]   = useState('all')
  const [search, setSearch]             = useState('')

  // Vehicles
  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('company_id', companyId)
        .order('vehicle_number')
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  // Vendors + Clients for form
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name').eq('company_id', companyId).order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, display_name, business_name').eq('company_id', companyId).order('display_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vehicles', companyId] })

  const deleteVehicle = async (vehicle) => {
    if (!confirm(`Delete vehicle ${vehicle.vehicle_number}? This cannot be undone.`)) return
    const { error } = await supabase.from('vehicles').delete().eq('id', vehicle.id)
    if (error) return toast.error(error.message)
    toast.success('Vehicle deleted')
    invalidate()
  }

  // Filtered list
  const filtered = vehicles.filter(v => {
    const matchOwner = ownerFilter === 'all' || v.ownership_type === ownerFilter
    const matchSearch = !search ||
      v.vehicle_number.toLowerCase().includes(search.toLowerCase()) ||
      (v.driver_name || '').toLowerCase().includes(search.toLowerCase())
    return matchOwner && matchSearch
  })

  // Counts for filter pills
  const counts = vehicles.reduce((acc, v) => {
    acc[v.ownership_type] = (acc[v.ownership_type] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Vehicle Registry</h3>
          <p className="text-xs text-slate-500">{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button onClick={() => setModalVehicle({})}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-all">
          <Plus className="w-4 h-4" /> Add Vehicle
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-2">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by vehicle number or driver..."
          className="input-field w-full"
        />
        <div className="flex gap-2 flex-wrap">
          {[{ value: 'all', label: 'All', count: vehicles.length }, ...OWNERSHIP_TYPES.map(o => ({
            value: o.value, label: o.label, count: counts[o.value] || 0
          }))].map(f => (
            <button
              key={f.value}
              onClick={() => setOwnerFilter(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                ownerFilter === f.value
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'bg-dark-700 border-dark-600 text-slate-400 hover:border-dark-500'
              }`}
            >
              {f.label} {f.count > 0 && <span className="opacity-70">({f.count})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500 text-sm">Loading vehicles…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search || ownerFilter !== 'all' ? 'No vehicles match filter' : 'No vehicles yet — add your first one'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(v => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              vendors={vendors}
              clients={clients}
              onEdit={v => setModalVehicle(v)}
              onDelete={deleteVehicle}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalVehicle !== null && (
        <VehicleFormModal
          vehicle={Object.keys(modalVehicle).length ? modalVehicle : null}
          vendors={vendors}
          clients={clients}
          onClose={() => setModalVehicle(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  )
}
