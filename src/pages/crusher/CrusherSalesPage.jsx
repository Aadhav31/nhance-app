import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Users, Truck, MapPin, Package, FileText, Plus, Edit2, Trash2, X, Save,
  Loader2, CheckCircle, Settings2, ChevronRight, AlertCircle, ToggleLeft,
  ToggleRight, Phone, Mail, CreditCard, Calendar, Building2, Hash
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'invoices',   label: 'Invoices',          icon: FileText },
  { key: 'clients',    label: 'Clients',            icon: Users    },
  { key: 'vehicles',   label: 'Vehicles',           icon: Truck    },
  { key: 'locations',  label: 'Loading Points',     icon: MapPin   },
  { key: 'materials',  label: 'Materials & HSN',    icon: Package  },
]

const VEHICLE_TYPES = [
  'Tipper (6-Wheeler)', 'Tipper (10-Wheeler)', 'Tipper (12-Wheeler)', 'Tipper (14-Wheeler)',
  'Hyva Tipper', 'Lorry', 'Mini Truck', 'Tractor-Trailer', 'Own Fleet Vehicle', 'Other',
]

const PAYMENT_MODES = [
  { value: 'cash',          label: 'Cash' },
  { value: 'gpay',          label: 'GPay' },
  { value: 'upi',           label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'neft',          label: 'NEFT' },
  { value: 'rtgs',          label: 'RTGS' },
  { value: 'cheque',        label: 'Cheque' },
]

function inp(extra = '') {
  return `w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-slate-200
          placeholder:text-slate-500 focus:outline-none focus:border-primary-500 ${extra}`
}

function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className={`bg-dark-800 rounded-xl border border-dark-700 shadow-2xl flex flex-col max-h-[90vh] ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-dark-700 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-dark-700 flex justify-end gap-2 flex-shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Badge({ label, color = 'slate' }) {
  const colors = {
    slate:  'bg-slate-500/20 text-slate-400',
    green:  'bg-emerald-500/20 text-emerald-400',
    blue:   'bg-primary-500/20 text-primary-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    red:    'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors[color]}`}>
      {label}
    </span>
  )
}

// ── Invoices Tab (Placeholder) ────────────────────────────────────────────────
function InvoicesTab({ companyId }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary-500/10 flex items-center justify-center">
        <FileText className="w-8 h-8 text-primary-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-200 mb-1">Crusher Invoices</h3>
        <p className="text-sm text-slate-400 max-w-sm">
          Tax &amp; non-tax invoicing with vehicle-linked tonnage billing, GST computation,
          and tax ↔ non-tax conversion will be available here.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 max-w-md w-full text-left">
        {[
          { icon: '📄', label: 'Tax / Non-Tax', desc: 'Select invoice type first' },
          { icon: '🚛', label: 'Vehicle Linked', desc: 'Auto-fill capacity from registry' },
          { icon: '⚖️', label: 'Tonnage Based', desc: 'Tonnes / Units / CUM billing' },
          { icon: '🔄', label: 'Tax Conversion', desc: 'Convert between tax & non-tax' },
        ].map(f => (
          <div key={f.label} className="bg-dark-700 rounded-lg p-3 border border-dark-600">
            <div className="text-xl mb-1">{f.icon}</div>
            <div className="text-xs font-semibold text-slate-300">{f.label}</div>
            <div className="text-[11px] text-slate-500">{f.desc}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-2">Complete client setup &amp; vehicles first, then invoice creation will open here.</p>
    </div>
  )
}

// ── Quick Add / Edit Client Modal ────────────────────────────────────────────
function QuickClientModal({ companyId, existing, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    display_name:  existing?.display_name || existing?.business_name || '',
    gstin:         existing?.gstin         || '',
    contact_phone: existing?.contact_phone || existing?.phone || '',
    contact_email: existing?.contact_email || existing?.email || '',
    registered_address: existing?.registered_address || existing?.address || '',
    // Also set credit settings inline
    credit_period_days:   '',
    statement_day:        '',
    payment_due_days:     '7',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.display_name.trim()) { toast.error('Client name is required'); return }
    setSaving(true)
    try {
      const clientPayload = {
        company_id:          companyId,
        display_name:        form.display_name.trim(),
        business_name:       form.display_name.trim(),
        name:                form.display_name.trim(),
        gstin:               form.gstin.trim() || null,
        contact_phone:       form.contact_phone.trim() || null,
        contact_email:       form.contact_email.trim() || null,
        registered_address:  form.registered_address.trim() || null,
        address:             form.registered_address.trim() || null,
        client_type:         'business',
        currency:            'INR',
        tax_preference:      'tax_payer',
      }

      let clientId = existing?.id
      if (isEdit) {
        const { error } = await supabase.from('clients').update(clientPayload).eq('id', clientId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('clients').insert(clientPayload).select('id').single()
        if (error) throw error
        clientId = data.id
      }

      // Save credit settings if any credit fields filled
      if (form.credit_period_days) {
        const creditPayload = {
          company_id:        companyId,
          client_id:         clientId,
          credit_period_days: Number(form.credit_period_days),
          statement_day:     form.statement_day ? Number(form.statement_day) : null,
          payment_due_days:  Number(form.payment_due_days) || 7,
          updated_at:        new Date().toISOString(),
        }
        await supabase.from('crusher_client_settings')
          .upsert(creditPayload, { onConflict: 'company_id,client_id' })
      }

      await qc.invalidateQueries({ queryKey: ['clients', companyId] })
      await qc.invalidateQueries({ queryKey: ['crusher_client_settings', companyId] })
      toast.success(isEdit ? 'Client updated' : 'Client added')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit — ${existing.display_name || existing.business_name}` : 'Add New Client'}
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update Client' : 'Add Client'}
          </button>
        </>
      }
    >
      {/* Client details */}
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Client Details</div>
      <Field label="Company / Client Name" required>
        <input className={inp()} value={form.display_name}
          onChange={e => set('display_name', e.target.value)}
          placeholder="e.g. ABC Constructions" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="GSTIN">
          <input className={inp('font-mono')} value={form.gstin}
            onChange={e => set('gstin', e.target.value.toUpperCase())}
            placeholder="22AAAAA0000A1Z5" maxLength={15} />
        </Field>
        <Field label="Phone">
          <input className={inp()} value={form.contact_phone}
            onChange={e => set('contact_phone', e.target.value)}
            placeholder="+91 98765 43210" />
        </Field>
      </div>
      <Field label="Email">
        <input type="email" className={inp()} value={form.contact_email}
          onChange={e => set('contact_email', e.target.value)}
          placeholder="billing@example.com" />
      </Field>
      <Field label="Address">
        <textarea className={inp()} rows={2} value={form.registered_address}
          onChange={e => set('registered_address', e.target.value)}
          placeholder="Full billing address…" />
      </Field>

      {/* Credit settings (optional) */}
      <div className="border-t border-dark-600 pt-3 mt-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Credit Settings <span className="font-normal normal-case text-slate-500">(optional — can set later)</span></div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Credit Period (days)">
            <input type="number" className={inp()} value={form.credit_period_days}
              onChange={e => set('credit_period_days', e.target.value)}
              placeholder="e.g. 30" min={1} />
          </Field>
          <Field label="Statement Day (1–31)">
            <input type="number" className={inp()} value={form.statement_day}
              onChange={e => set('statement_day', e.target.value)}
              placeholder="e.g. 1" min={1} max={31} />
          </Field>
          <Field label="Payment Due (days)">
            <input type="number" className={inp()} value={form.payment_due_days}
              onChange={e => set('payment_due_days', e.target.value)}
              placeholder="7" min={0} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── Credit Settings Modal ─────────────────────────────────────────────────────
function CreditSettingsModal({ client, companyId, existing, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    credit_period_days:   existing?.credit_period_days   ?? 30,
    statement_day:        existing?.statement_day         ?? 1,
    payment_due_days:     existing?.payment_due_days      ?? 7,
    default_loading_pt:   existing?.default_loading_pt    ?? '',
    default_unloading_pt: existing?.default_unloading_pt  ?? '',
    notes:                existing?.notes                 ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        company_id:           companyId,
        client_id:            client.id,
        credit_period_days:   Number(form.credit_period_days),
        statement_day:        form.statement_day ? Number(form.statement_day) : null,
        payment_due_days:     Number(form.payment_due_days),
        default_loading_pt:   form.default_loading_pt  || null,
        default_unloading_pt: form.default_unloading_pt || null,
        notes:                form.notes || null,
        updated_at:           new Date().toISOString(),
      }
      const { error } = existing
        ? await supabase.from('crusher_client_settings').update(payload).eq('id', existing.id)
        : await supabase.from('crusher_client_settings').insert({ ...payload })
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['crusher_client_settings', companyId] })
      toast.success('Credit settings saved')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Credit Settings — ${client.name}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Credit Period (days)" required>
          <input type="number" className={inp()} value={form.credit_period_days}
            onChange={e => set('credit_period_days', e.target.value)} min={1} max={365} />
        </Field>
        <Field label="Statement Day (1–31)">
          <input type="number" className={inp()} value={form.statement_day}
            onChange={e => set('statement_day', e.target.value)} min={1} max={31}
            placeholder="e.g. 1" />
        </Field>
        <Field label="Payment Due (days after stmt)">
          <input type="number" className={inp()} value={form.payment_due_days}
            onChange={e => set('payment_due_days', e.target.value)} min={0} max={90} />
        </Field>
      </div>
      <Field label="Default Loading Point">
        <input className={inp()} value={form.default_loading_pt}
          onChange={e => set('default_loading_pt', e.target.value)}
          placeholder="e.g. Plant Gate, Quarry 1" />
      </Field>
      <Field label="Default Unloading Point">
        <input className={inp()} value={form.default_unloading_pt}
          onChange={e => set('default_unloading_pt', e.target.value)}
          placeholder="e.g. Site A, Customer Yard" />
      </Field>
      <Field label="Notes">
        <textarea className={inp()} rows={2} value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Any billing notes for this client…" />
      </Field>
      <div className="bg-dark-700 rounded-lg p-3 border border-dark-600 text-xs text-slate-400 space-y-1">
        <div className="flex items-center gap-1.5 text-slate-300 font-medium mb-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-primary-400" /> How credit periods work
        </div>
        <p>• Invoices created with <strong className="text-slate-300">Credit</strong> payment type will auto-set due date = invoice date + credit period days.</p>
        <p>• Statement will be generated on day <strong className="text-slate-300">{form.statement_day || '?'}</strong> of each month.</p>
        <p>• Expected payment = statement date + <strong className="text-slate-300">{form.payment_due_days}</strong> days.</p>
      </div>
    </Modal>
  )
}

// ── Clients Tab ───────────────────────────────────────────────────────────────
function ClientsTab({ companyId }) {
  const [creditModal, setCreditModal] = useState(null)   // { client, existing }
  const [clientModal, setClientModal] = useState(null)   // null | { existing? }

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('*')
        .eq('company_id', companyId).order('name')
      return data || []
    },
  })

  const { data: settings = [] } = useQuery({
    queryKey: ['crusher_client_settings', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_settings').select('*')
        .eq('company_id', companyId)
      return data || []
    },
  })

  const { data: vehicles = [] } = useQuery({
    queryKey: ['crusher_client_vehicles', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_vehicles').select('client_id')
        .eq('company_id', companyId).eq('owner_type', 'client')
      return data || []
    },
  })

  const settingsMap = Object.fromEntries(settings.map(s => [s.client_id, s]))
  const vehicleCount = vehicles.reduce((acc, v) => {
    acc[v.client_id] = (acc[v.client_id] || 0) + 1
    return acc
  }, {})

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setClientModal({ existing: null })} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Client
        </button>
        <span className="text-xs text-slate-500 ml-auto">{clients.length} client{clients.length !== 1 ? 's' : ''}</span>
      </div>

      {!clients.length ? (
        <div className="text-center py-16 text-slate-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm mb-3">No clients yet.</p>
          <button onClick={() => setClientModal({ existing: null })} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Add First Client
          </button>
        </div>
      ) : null}

      {clients.map(client => {
        const s = settingsMap[client.id]
        const vCount = vehicleCount[client.id] || 0
        return (
          <div key={client.id} className="bg-dark-700 rounded-xl border border-dark-600 p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center text-sm font-bold text-primary-400 flex-shrink-0">
              {client.name?.[0]?.toUpperCase() || 'C'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-200">{client.name}</span>
                {s ? (
                  <Badge label={`Credit: ${s.credit_period_days}d`} color="blue" />
                ) : (
                  <Badge label="No credit settings" color="slate" />
                )}
                {vCount > 0 && <Badge label={`${vCount} vehicle${vCount > 1 ? 's' : ''}`} color="green" />}
              </div>
              {client.phone && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</p>}
              {s && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Statement: day {s.statement_day || '—'} of month · Due: {s.payment_due_days}d after statement
                  {s.default_loading_pt && ` · Load: ${s.default_loading_pt}`}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex gap-1.5">
              <button
                onClick={() => setClientModal({ existing: client })}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-dark-600 hover:bg-dark-500 px-3 py-1.5 rounded-lg transition-all"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setCreditModal({ client, existing: s })}
                className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-all"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {s ? 'Credit' : 'Set Credit'}
              </button>
            </div>
          </div>
        )
      })}

      {clientModal && (
        <QuickClientModal
          companyId={companyId}
          existing={clientModal.existing}
          onClose={() => setClientModal(null)}
        />
      )}

      {creditModal && (
        <CreditSettingsModal
          client={creditModal.client}
          companyId={companyId}
          existing={creditModal.existing}
          onClose={() => setCreditModal(null)}
        />
      )}
    </div>
  )
}

// ── Vehicle Form Modal ────────────────────────────────────────────────────────
function VehicleFormModal({ companyId, clients, fleet, existing, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    vehicle_number:   existing?.vehicle_number  ?? '',
    vehicle_type:     existing?.vehicle_type    ?? 'Tipper (10-Wheeler)',
    owner_type:       existing?.owner_type      ?? 'client',
    client_id:        existing?.client_id       ?? '',
    equipment_id:     existing?.equipment_id    ?? '',
    billing_basis:    existing?.billing_basis   ?? 'fixed_capacity',
    capacity_tonnes:  existing?.capacity_tonnes ?? '',
    notes:            existing?.notes           ?? '',
    is_active:        existing?.is_active       ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.vehicle_number.trim()) { toast.error('Vehicle number is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id:      companyId,
        vehicle_number:  form.vehicle_number.trim().toUpperCase(),
        vehicle_type:    form.vehicle_type,
        owner_type:      form.owner_type,
        client_id:       form.owner_type === 'client' && form.client_id ? form.client_id : null,
        equipment_id:    form.owner_type === 'own' && form.equipment_id ? form.equipment_id : null,
        billing_basis:   form.billing_basis,
        capacity_tonnes: form.capacity_tonnes ? Number(form.capacity_tonnes) : null,
        notes:           form.notes || null,
        is_active:       form.is_active,
      }
      const { error } = isEdit
        ? await supabase.from('crusher_client_vehicles').update(payload).eq('id', existing.id)
        : await supabase.from('crusher_client_vehicles').insert(payload)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['crusher_client_vehicles', companyId] })
      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle registered')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit Vehicle' : 'Register Vehicle'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Register'}
          </button>
        </>
      }
    >
      <Field label="Vehicle Registration Number" required>
        <input className={inp()} value={form.vehicle_number}
          onChange={e => set('vehicle_number', e.target.value)}
          placeholder="e.g. TN38 AB 1234"
          style={{ textTransform: 'uppercase' }} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Vehicle Type" required>
          <select className={inp()} value={form.vehicle_type}
            onChange={e => set('vehicle_type', e.target.value)}>
            {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Owner">
          <select className={inp()} value={form.owner_type}
            onChange={e => set('owner_type', e.target.value)}>
            <option value="client">Client's Vehicle</option>
            <option value="own">Own Fleet Vehicle</option>
          </select>
        </Field>
      </div>

      {form.owner_type === 'client' && (
        <Field label="Linked Client">
          <select className={inp()} value={form.client_id}
            onChange={e => set('client_id', e.target.value)}>
            <option value="">— Select client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

      {form.owner_type === 'own' && fleet.length > 0 && (
        <Field label="Link to Fleet Equipment (optional)">
          <select className={inp()} value={form.equipment_id}
            onChange={e => set('equipment_id', e.target.value)}>
            <option value="">— Not linked —</option>
            {fleet.map(eq => (
              <option key={eq.id} value={eq.id}>{eq.name} ({eq.equipment_number})</option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Billing Basis" required>
          <select className={inp()} value={form.billing_basis}
            onChange={e => set('billing_basis', e.target.value)}>
            <option value="fixed_capacity">Fixed Capacity (per trip)</option>
            <option value="weighed">Weigh-Based (varies)</option>
          </select>
        </Field>
        {form.billing_basis === 'fixed_capacity' && (
          <Field label="Capacity (Tonnes)">
            <input type="number" className={inp()} value={form.capacity_tonnes}
              onChange={e => set('capacity_tonnes', e.target.value)}
              placeholder="e.g. 10.5" step={0.5} min={0} />
          </Field>
        )}
        {form.billing_basis === 'weighed' && (
          <div className="flex items-end pb-1">
            <p className="text-xs text-slate-500">Weight per trip will be entered on each invoice.</p>
          </div>
        )}
      </div>

      <Field label="Notes">
        <input className={inp()} value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Any notes about this vehicle…" />
      </Field>

      {isEdit && (
        <div className="flex items-center gap-3">
          <button onClick={() => set('is_active', !form.is_active)}
            className={`flex items-center gap-2 text-sm transition-colors ${form.is_active ? 'text-emerald-400' : 'text-slate-400'}`}>
            {form.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {form.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
      )}
    </Modal>
  )
}

// ── Vehicles Tab ──────────────────────────────────────────────────────────────
function VehiclesTab({ companyId }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null) // null | { existing? }
  const [filterClient, setFilterClient] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['crusher_client_vehicles', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_client_vehicles')
        .select('*, clients(name), equipment(name, equipment_number)')
        .eq('company_id', companyId).order('vehicle_number')
      return data || []
    },
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name')
        .eq('company_id', companyId).order('name')
      return data || []
    },
  })

  const { data: fleet = [] } = useQuery({
    queryKey: ['fleet_basic', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id, name, equipment_number')
        .eq('company_id', companyId).eq('status', 'active').order('name')
      return data || []
    },
  })

  const handleDelete = async (id) => {
    const { error } = await supabase.from('crusher_client_vehicles').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    await qc.invalidateQueries({ queryKey: ['crusher_client_vehicles', companyId] })
    toast.success('Vehicle removed')
    setConfirmDel(null)
  }

  const filtered = filterClient
    ? vehicles.filter(v => v.client_id === filterClient || (filterClient === '__own' && v.owner_type === 'own'))
    : vehicles

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setModal({ existing: null })} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Register Vehicle
        </button>
        <select className="rounded-lg border border-dark-600 bg-dark-700 px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
          value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">All Vehicles</option>
          <option value="__own">Own Fleet</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} vehicle{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
      ) : !filtered.length ? (
        <div className="text-center py-12 text-slate-500">
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No vehicles registered yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(v => (
            <div key={v.id} className={`bg-dark-700 rounded-xl border p-4 flex items-start gap-4 ${v.is_active ? 'border-dark-600' : 'border-dark-600 opacity-60'}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${v.owner_type === 'own' ? 'bg-emerald-500/10' : 'bg-primary-500/10'}`}>
                <Truck className={`w-5 h-5 ${v.owner_type === 'own' ? 'text-emerald-400' : 'text-primary-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-primary-300">{v.vehicle_number}</span>
                  <Badge label={v.vehicle_type} color="slate" />
                  {v.owner_type === 'own'
                    ? <Badge label="Own Fleet" color="green" />
                    : <Badge label="Client Vehicle" color="blue" />}
                  {!v.is_active && <Badge label="Inactive" color="red" />}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {v.owner_type === 'client' && v.clients?.name && <span className="mr-2">Client: <strong>{v.clients.name}</strong></span>}
                  {v.owner_type === 'own' && v.equipment?.name && <span className="mr-2">Fleet: <strong>{v.equipment.name}</strong></span>}
                  {v.billing_basis === 'fixed_capacity'
                    ? <span>Fixed capacity: <strong>{v.capacity_tonnes ?? '—'} T</strong></span>
                    : <span className="text-yellow-400">Weigh-based billing</span>}
                </p>
                {v.notes && <p className="text-[11px] text-slate-500 mt-0.5">{v.notes}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setModal({ existing: v })}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDel(v)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <VehicleFormModal
          companyId={companyId}
          clients={clients}
          fleet={fleet}
          existing={modal.existing}
          onClose={() => setModal(null)}
        />
      )}

      {confirmDel && (
        <Modal title="Remove Vehicle?" onClose={() => setConfirmDel(null)}
          footer={
            <>
              <button onClick={() => setConfirmDel(null)} className="btn-ghost">Cancel</button>
              <button onClick={() => handleDelete(confirmDel.id)} className="btn-danger">Remove</button>
            </>
          }>
          <p className="text-sm text-slate-300">Remove <strong>{confirmDel.vehicle_number}</strong> from the registry? This won't affect existing invoices.</p>
        </Modal>
      )}
    </div>
  )
}

// ── Location Form Modal ───────────────────────────────────────────────────────
function LocationFormModal({ companyId, existing, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!existing?.id
  const [form, setForm] = useState({
    point_name:  existing?.point_name  ?? '',
    point_type:  existing?.point_type  ?? 'both',
    address:     existing?.address     ?? '',
    sort_order:  existing?.sort_order  ?? 0,
    is_active:   existing?.is_active   ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.point_name.trim()) { toast.error('Point name is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id:  companyId,
        point_name:  form.point_name.trim(),
        point_type:  form.point_type,
        address:     form.address || null,
        sort_order:  Number(form.sort_order),
        is_active:   form.is_active,
      }
      const { error } = isEdit
        ? await supabase.from('crusher_loading_points').update(payload).eq('id', existing.id)
        : await supabase.from('crusher_loading_points').insert(payload)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['crusher_loading_points', companyId] })
      toast.success(isEdit ? 'Location updated' : 'Location added')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit Location' : 'Add Loading / Unloading Point'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Add'}
          </button>
        </>
      }
    >
      <Field label="Point Name" required>
        <input className={inp()} value={form.point_name}
          onChange={e => set('point_name', e.target.value)}
          placeholder="e.g. Plant Gate, Quarry 1, Site A" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className={inp()} value={form.point_type}
            onChange={e => set('point_type', e.target.value)}>
            <option value="loading">Loading Point (source)</option>
            <option value="unloading">Unloading Point (destination)</option>
            <option value="both">Both (loading & unloading)</option>
          </select>
        </Field>
        <Field label="Display Order">
          <input type="number" className={inp()} value={form.sort_order}
            onChange={e => set('sort_order', e.target.value)} min={0} />
        </Field>
      </div>
      <Field label="Address / Description">
        <textarea className={inp()} rows={2} value={form.address}
          onChange={e => set('address', e.target.value)}
          placeholder="Full address or description of this point…" />
      </Field>
    </Modal>
  )
}

// ── Locations Tab ─────────────────────────────────────────────────────────────
function LocationsTab({ companyId }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['crusher_loading_points', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_loading_points').select('*')
        .eq('company_id', companyId).order('sort_order').order('point_name')
      return data || []
    },
  })

  const toggleActive = async (loc) => {
    const { error } = await supabase.from('crusher_loading_points')
      .update({ is_active: !loc.is_active }).eq('id', loc.id)
    if (error) { toast.error(error.message); return }
    await qc.invalidateQueries({ queryKey: ['crusher_loading_points', companyId] })
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('crusher_loading_points').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    await qc.invalidateQueries({ queryKey: ['crusher_loading_points', companyId] })
    toast.success('Location removed')
    setConfirmDel(null)
  }

  const typeLabel = { loading: '🔼 Loading', unloading: '🔽 Unloading', both: '↕ Both' }
  const typeColor = { loading: 'blue', unloading: 'green', both: 'yellow' }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setModal({ existing: null })} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add Location
        </button>
        <span className="text-xs text-slate-500 ml-auto">{locations.length} location{locations.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
      ) : !locations.length ? (
        <div className="text-center py-12 text-slate-500">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No loading/unloading points added yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {locations.map(loc => (
            <div key={loc.id} className={`bg-dark-700 rounded-xl border p-4 flex items-start gap-4 ${loc.is_active ? 'border-dark-600' : 'border-dark-600 opacity-60'}`}>
              <div className="w-9 h-9 rounded-lg bg-dark-600 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-200">{loc.point_name}</span>
                  <Badge label={typeLabel[loc.point_type]} color={typeColor[loc.point_type]} />
                  {!loc.is_active && <Badge label="Inactive" color="red" />}
                </div>
                {loc.address && <p className="text-xs text-slate-500 mt-0.5">{loc.address}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => toggleActive(loc)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                  title={loc.is_active ? 'Deactivate' : 'Activate'}>
                  {loc.is_active ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
                <button onClick={() => setModal({ existing: loc })}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDel(loc)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <LocationFormModal companyId={companyId} existing={modal.existing} onClose={() => setModal(null)} />
      )}

      {confirmDel && (
        <Modal title="Remove Location?" onClose={() => setConfirmDel(null)}
          footer={
            <>
              <button onClick={() => setConfirmDel(null)} className="btn-ghost">Cancel</button>
              <button onClick={() => handleDelete(confirmDel.id)} className="btn-danger">Remove</button>
            </>
          }>
          <p className="text-sm text-slate-300">Remove <strong>{confirmDel.point_name}</strong>? This won't affect existing invoices.</p>
        </Modal>
      )}
    </div>
  )
}

// ── HSN Edit Modal ────────────────────────────────────────────────────────────
function HsnEditModal({ grade, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    hsn_code:         grade.hsn_code         ?? '2517',
    default_gst_rate: grade.default_gst_rate ?? 5,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('crusher_grades')
        .update({ hsn_code: form.hsn_code || null, default_gst_rate: Number(form.default_gst_rate) })
        .eq('id', grade.id)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['crusher_grades_hsn'] })
      toast.success('HSN/GST updated')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`HSN / GST — ${grade.grade_name}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="HSN Code">
          <input className={inp()} value={form.hsn_code}
            onChange={e => set('hsn_code', e.target.value)}
            placeholder="e.g. 2517" />
        </Field>
        <Field label="Default GST Rate (%)">
          <select className={inp()} value={form.default_gst_rate}
            onChange={e => set('default_gst_rate', e.target.value)}>
            <option value={0}>0% (Exempt)</option>
            <option value={5}>5%</option>
            <option value={12}>12%</option>
            <option value={18}>18%</option>
            <option value={28}>28%</option>
          </select>
        </Field>
      </div>
      <div className="bg-dark-700 rounded-lg p-3 border border-dark-600 text-xs text-slate-400 space-y-1">
        <p>• HSN <strong className="text-slate-300">2517</strong> — Pebbles, gravel, broken or crushed stone (Aggregate, Dust, GSB, Rejects) → typically <strong className="text-slate-300">5% GST</strong></p>
        <p>• HSN <strong className="text-slate-300">2505</strong> — Natural sands (M Sand, P Sand) → typically <strong className="text-slate-300">5% GST</strong></p>
        <p>These are saved per material and auto-applied on tax invoices. Non-tax invoices will show ₹0 GST regardless.</p>
      </div>
    </Modal>
  )
}

// ── Materials & HSN Tab ───────────────────────────────────────────────────────
function MaterialsTab({ companyId }) {
  const [editGrade, setEditGrade] = useState(null)

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['crusher_grades_hsn'],
    queryFn: async () => {
      const { data } = await supabase.from('crusher_grades').select('*')
        .eq('company_id', companyId).order('sort_order').order('grade_name')
      return data || []
    },
  })

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>

  if (!grades.length) return (
    <div className="text-center py-12 text-slate-500">
      <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">No grades found. Go to <strong>Production → Grades</strong> to add grades first.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Set HSN code and default GST rate for each material grade. These are auto-applied when creating tax invoices.
        To add or remove grades, use <strong className="text-slate-400">Production → Grades tab</strong>.
      </p>
      <div className="grid gap-2">
        {grades.map(g => (
          <div key={g.id} className={`bg-dark-700 rounded-xl border border-dark-600 p-4 flex items-center gap-4 ${!g.is_active ? 'opacity-50' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-200">{g.grade_name}</span>
                {!g.is_active && <Badge label="Inactive" color="red" />}
              </div>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs text-slate-500">
                  HSN: <strong className="font-mono text-primary-300">{g.hsn_code || '—'}</strong>
                </span>
                <span className="text-xs text-slate-500">
                  GST: <strong className={`${Number(g.default_gst_rate) > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {g.default_gst_rate ?? 0}%
                  </strong>
                </span>
                {g.description && <span className="text-xs text-slate-600 truncate">{g.description}</span>}
              </div>
            </div>
            <button
              onClick={() => setEditGrade(g)}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-all"
            >
              <Hash className="w-3.5 h-3.5" />
              Edit HSN
            </button>
          </div>
        ))}
      </div>

      {editGrade && (
        <HsnEditModal grade={editGrade} onClose={() => setEditGrade(null)} />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CrusherSalesPage() {
  const { companyId } = useAuth()
  const [tab, setTab] = useState('invoices')

  const tabIcons = { invoices: FileText, clients: Users, vehicles: Truck, locations: MapPin, materials: Package }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-dark-700 px-6 py-4">
        <h1 className="text-xl font-bold text-slate-100">Crusher Sales</h1>
        <p className="text-sm text-slate-400 mt-0.5">Vehicle-linked tonnage invoicing, client credit management, and material billing</p>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-dark-700 px-4">
        <nav className="flex gap-1 overflow-x-auto py-2">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0
                  ${isActive ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'}`}>
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'invoices'  && <InvoicesTab   companyId={companyId} />}
        {tab === 'clients'   && <ClientsTab    companyId={companyId} />}
        {tab === 'vehicles'  && <VehiclesTab   companyId={companyId} />}
        {tab === 'locations' && <LocationsTab  companyId={companyId} />}
        {tab === 'materials' && <MaterialsTab  companyId={companyId} />}
      </div>
    </div>
  )
}
