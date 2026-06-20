import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtCurrency } from '../../lib/utils'
import {
  Building2, Users, Package, Plus, ChevronRight,
  CheckCircle, XCircle, Loader2, X, ToggleLeft, ToggleRight,
  Pencil, Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal, { FormField } from '../../components/shared/Modal'
import { MODULE_LABELS } from '../../lib/constants'

const ALL_MODULES = Object.keys(MODULE_LABELS)

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = 'text-primary-400' }) {
  return (
    <div className="stat-card">
      <div className={`${color} mb-1`}><Icon className="w-5 h-5" /></div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  )
}

// ─── Company row ─────────────────────────────────────────────────────────────
function CompanyRow({ company, onSelect }) {
  return (
    <tr onClick={() => onSelect(company)} className="cursor-pointer hover:bg-dark-700/50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-100">{company.name}</div>
        <div className="text-xs text-slate-500">{company.contact_email || '—'}</div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-slate-400 capitalize">{company.industry?.replace('_', ' ')}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`badge ${company.is_active ? 'badge-success' : 'badge-danger'}`}>
          {company.is_active ? 'Active' : 'Suspended'}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">{company.max_users} seats</td>
      <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(company.created_at)}</td>
      <td className="px-4 py-3">
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </td>
    </tr>
  )
}

// ─── New company modal ────────────────────────────────────────────────────────
function NewCompanyModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', industry: 'equipment_rental', contact_name: '', contact_email: '',
    admin_name: '', admin_email: '',
    contact_phone: '', gstin: '', address: '', max_users: 10,
    modules: ['core'],
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const toggleModule = (mod) => {
    if (mod === 'core') return // core always on
    setForm(p => ({
      ...p,
      modules: p.modules.includes(mod)
        ? p.modules.filter(m => m !== mod)
        : [...p.modules, mod],
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return }
    if (!form.admin_email.trim() || !form.admin_email.includes('@')) {
      toast.error('Admin email is required — this person will manage the company')
      return
    }
    if (!form.admin_name.trim()) { toast.error('Admin name is required'); return }
    setSaving(true)
    try {
      // 1. Create company
      const { data: company, error: cErr } = await supabase
        .from('companies')
        .insert({
          name: form.name, industry: form.industry,
          contact_name: form.contact_name, contact_email: form.contact_email,
          contact_phone: form.contact_phone, gstin: form.gstin,
          address: form.address, max_users: Number(form.max_users),
          is_active: true,
        })
        .select()
        .single()
      if (cErr) throw cErr

      // 2. Create module entries
      const moduleRows = ALL_MODULES.map(mod => ({
        company_id: company.id,
        module_key: mod,
        is_enabled: form.modules.includes(mod),
        enabled_at: form.modules.includes(mod) ? new Date().toISOString() : null,
      }))
      const { error: mErr } = await supabase.from('company_modules').insert(moduleRows)
      if (mErr) throw mErr

      // 3. Invite admin user — sends email invite, creates profile + role
      const { data: inviteData, error: inviteErr } = await supabase.functions.invoke('invite-user', {
        body: {
          email: form.admin_email.trim().toLowerCase(),
          full_name: form.admin_name.trim(),
          role: 'admin',
          company_id: company.id,
        },
      })
      if (inviteErr || !inviteData?.success) {
        // Company created but invite failed — warn but don't block
        toast.success(`Company "${form.name}" created`)
        toast.error(`Admin invite failed: ${inviteData?.error || inviteErr?.message} — send invite manually from Settings`)
      } else {
        toast.success(`Company "${form.name}" created — invite sent to ${form.admin_email}`)
      }

      qc.invalidateQueries(['companies'])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to create company')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Add New Company"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Company'}
          </button>
        </>
      }
    >
      <div className="space-y-5">

        {/* Admin Login — most important, shown first */}
        <div className="bg-primary-900/20 border border-primary-700/40 rounded-xl p-4">
          <p className="text-xs font-bold text-primary-400 uppercase tracking-widest mb-3">
            Company Admin Login (required)
          </p>
          <p className="text-xs text-slate-400 mb-3">
            This person will manage the company in Nhance. They'll receive an email to set their password.
          </p>
          <div className="form-grid-2">
            <FormField label="Admin Full Name" required>
              <input className="input" value={form.admin_name} onChange={e => set('admin_name', e.target.value)} placeholder="e.g. Ravi Kumar" />
            </FormField>
            <FormField label="Admin Email" required>
              <input type="email" className="input" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} placeholder="admin@company.com" />
            </FormField>
          </div>
        </div>

        <div className="form-grid-2">
          <FormField label="Company Name" required>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Equipment Pvt Ltd" />
          </FormField>
          <FormField label="Industry">
            <select className="input" value={form.industry} onChange={e => set('industry', e.target.value)}>
              <option value="equipment_rental">Equipment Rental</option>
              <option value="transport">Transport & Logistics</option>
              <option value="construction">Construction</option>
            </select>
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Contact Person">
            <input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </FormField>
          <FormField label="Contact Phone">
            <input className="input" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Contact Email">
            <input type="email" className="input" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
          </FormField>
          <FormField label="Max Users (Seats)">
            <input type="number" className="input" value={form.max_users} onChange={e => set('max_users', e.target.value)} min={1} />
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="GSTIN">
            <input className="input" value={form.gstin} onChange={e => set('gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
          </FormField>
          <FormField label="Address">
            <input className="input" value={form.address} onChange={e => set('address', e.target.value)} />
          </FormField>
        </div>

        <div>
          <p className="section-title">Modules Licensed</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_MODULES.map(mod => {
              const active = form.modules.includes(mod)
              const isCore = mod === 'core'
              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => toggleModule(mod)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all
                    ${isCore ? 'border-primary-600 bg-primary-600/20 text-primary-300 cursor-default' :
                      active ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' :
                               'border-dark-600 bg-dark-700 text-slate-400 hover:border-dark-500'}`}
                >
                  {active ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-40" />}
                  <span className="truncate">{MODULE_LABELS[mod]}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Edit company modal ───────────────────────────────────────────────────────
function EditCompanyModal({ company, onClose, onUpdated }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name:          company.name          || '',
    industry:      company.industry      || 'equipment_rental',
    contact_name:  company.contact_name  || '',
    contact_email: company.contact_email || '',
    contact_phone: company.contact_phone || '',
    gstin:         company.gstin         || '',
    address:       company.address       || '',
    max_users:     company.max_users     || 10,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name:          form.name.trim(),
          industry:      form.industry,
          contact_name:  form.contact_name,
          contact_email: form.contact_email,
          contact_phone: form.contact_phone,
          gstin:         form.gstin,
          address:       form.address,
          max_users:     Number(form.max_users),
        })
        .eq('id', company.id)
      if (error) throw error
      toast.success('Company updated')
      qc.invalidateQueries(['companies'])
      onUpdated({ ...company, ...form, max_users: Number(form.max_users) })
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to update company')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Edit: ${company.name}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="form-grid-2">
          <FormField label="Company Name" required>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
          </FormField>
          <FormField label="Industry">
            <select className="input" value={form.industry} onChange={e => set('industry', e.target.value)}>
              <option value="equipment_rental">Equipment Rental</option>
              <option value="transport">Transport &amp; Logistics</option>
              <option value="construction">Construction</option>
            </select>
          </FormField>
        </div>
        <div className="form-grid-2">
          <FormField label="Contact Person">
            <input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </FormField>
          <FormField label="Contact Phone">
            <input className="input" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
          </FormField>
        </div>
        <div className="form-grid-2">
          <FormField label="Contact Email">
            <input type="email" className="input" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
          </FormField>
          <FormField label="Max Users (Seats)">
            <input type="number" className="input" value={form.max_users} onChange={e => set('max_users', e.target.value)} min={1} />
          </FormField>
        </div>
        <div className="form-grid-2">
          <FormField label="GSTIN">
            <input className="input" value={form.gstin} onChange={e => set('gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
          </FormField>
          <FormField label="Address">
            <input className="input" value={form.address} onChange={e => set('address', e.target.value)} />
          </FormField>
        </div>
      </div>
    </Modal>
  )
}

// ─── Company detail panel ─────────────────────────────────────────────────────
function CompanyDetail({ company: initialCompany, onClose }) {
  const qc = useQueryClient()
  const [company, setCompany] = useState(initialCompany)
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data: modules = [] } = useQuery({
    queryKey: ['company_modules', company.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_modules')
        .select('*')
        .eq('company_id', company.id)
      return data || []
    },
  })

  const { data: userCount = 0 } = useQuery({
    queryKey: ['company_users', company.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.id)
      return count || 0
    },
  })

  const toggleModule = async (mod, currentState) => {
    const newState = !currentState
    // Upsert so it works even if the row doesn't exist yet
    const { error } = await supabase
      .from('company_modules')
      .upsert(
        { company_id: company.id, module_key: mod, is_enabled: newState, enabled_at: newState ? new Date().toISOString() : null },
        { onConflict: 'company_id,module_key' }
      )

    if (error) { toast.error('Failed to update module'); return }
    toast.success(`${MODULE_LABELS[mod]} ${newState ? 'enabled' : 'disabled'}`)
    qc.invalidateQueries(['company_modules', company.id])
  }

  const toggleActive = async () => {
    const newActive = !company.is_active
    const { error } = await supabase
      .from('companies')
      .update({ is_active: newActive })
      .eq('id', company.id)
    if (error) { toast.error('Failed to update status'); return }
    toast.success(newActive ? 'Company activated' : 'Company suspended')
    setCompany(c => ({ ...c, is_active: newActive }))
    qc.invalidateQueries(['companies'])
  }

  const handleDelete = async () => {
    if (!window.confirm(
      `⚠️ Permanently delete "${company.name}"?\n\nThis will remove all company data including employees, equipment, invoices, and records. This cannot be undone.\n\nType OK to confirm.`
    )) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('companies').delete().eq('id', company.id)
      if (error) throw error
      toast.success(`"${company.name}" deleted`)
      qc.invalidateQueries(['companies'])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to delete company')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
    <Modal
      title={company.name}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-between w-full">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={() => setShowEdit(true)} className="btn-primary text-xs">
            <Pencil className="w-3.5 h-3.5" /> Edit Company
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-dark-700 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-slate-100">{userCount}</div>
            <div className="text-xs text-slate-400">Users</div>
          </div>
          <div className="bg-dark-700 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-slate-100">{company.max_users}</div>
            <div className="text-xs text-slate-400">Max Seats</div>
          </div>
          <div className="bg-dark-700 rounded-lg p-3 text-center">
            <div className={`text-sm font-bold ${company.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
              {company.is_active ? 'Active' : 'Suspended'}
            </div>
            <div className="text-xs text-slate-400">Status</div>
          </div>
          <div className="bg-dark-700 rounded-lg p-3 text-center">
            <div className="text-sm font-bold text-slate-100">{fmtDate(company.created_at)}</div>
            <div className="text-xs text-slate-400">Onboarded</div>
          </div>
        </div>

        {/* Contact info */}
        <div className="form-grid-2">
          <div>
            <p className="label">Contact</p>
            <p className="text-sm text-slate-200">{company.contact_name || '—'}</p>
            <p className="text-xs text-slate-400">{company.contact_phone || ''}</p>
          </div>
          <div>
            <p className="label">Email</p>
            <p className="text-sm text-slate-200">{company.contact_email || '—'}</p>
          </div>
          <div>
            <p className="label">GSTIN</p>
            <p className="text-sm text-slate-200 font-mono">{company.gstin || '—'}</p>
          </div>
          <div>
            <p className="label">Industry</p>
            <p className="text-sm text-slate-200 capitalize">{company.industry?.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Modules toggle */}
        <div>
          <p className="section-title">Module Access</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_MODULES.map(mod => {
              const row = modules.find(m => m.module_key === mod)
              const enabled = row?.is_enabled || false
              const isCore = mod === 'core'
              return (
                <div key={mod} className="flex items-center justify-between px-3 py-2.5 bg-dark-700 rounded-lg border border-dark-600">
                  <span className="text-sm text-slate-200">{MODULE_LABELS[mod]}</span>
                  {isCore ? (
                    <span className="text-xs text-slate-500 italic">always on</span>
                  ) : (
                    <button onClick={() => toggleModule(mod, enabled)} className="text-slate-400 hover:text-slate-100">
                      {enabled
                        ? <ToggleRight className="w-6 h-6 text-emerald-400" />
                        : <ToggleLeft className="w-6 h-6" />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Danger zone */}
        <div className="border border-red-500/20 rounded-lg p-4 bg-red-500/5 space-y-3">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Danger Zone</p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-300">
              {company.is_active ? 'Suspend this company account' : 'Re-activate this company account'}
            </p>
            <button
              onClick={toggleActive}
              className={company.is_active ? 'btn-danger text-xs' : 'btn-primary text-xs'}
            >
              {company.is_active ? 'Suspend' : 'Activate'}
            </button>
          </div>
          <div className="flex items-center justify-between border-t border-red-500/20 pt-3">
            <p className="text-sm text-slate-300">Permanently delete all company data</p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn-danger text-xs"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Trash2 className="w-3.5 h-3.5" /> Delete</>}
            </button>
          </div>
        </div>
      </div>
    </Modal>

    {showEdit && (
      <EditCompanyModal
        company={company}
        onClose={() => setShowEdit(false)}
        onUpdated={updated => setCompany(updated)}
      />
    )}
    </>
  )
}

// ─── Main super-admin page ────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const [showNew,    setShowNew]    = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [search,     setSearch]     = useState('')

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_email || '').toLowerCase().includes(search.toLowerCase())
  )

  const active   = companies.filter(c => c.is_active).length
  const inactive = companies.filter(c => !c.is_active).length

  return (
    <div className="page-container">
      <div className="page-body space-y-6">
        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-primary-900/40 to-cyan-900/20 border border-primary-800/40 rounded-xl p-5">
          <h2 className="text-lg font-bold text-slate-100">Nhance Admin Panel</h2>
          <p className="text-sm text-slate-400 mt-0.5">Manage client companies, modules, and subscriptions</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Building2} label="Total Companies"   value={companies.length} />
          <StatCard icon={CheckCircle} label="Active"          value={active}    color="text-emerald-400" />
          <StatCard icon={XCircle}    label="Suspended"        value={inactive}  color="text-red-400" />
          <StatCard icon={Users}      label="Nhance Phase"     value="1.0"       color="text-cyan-400" />
        </div>

        {/* Companies table */}
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-dark-700">
            <h3 className="text-sm font-semibold text-slate-100">Client Companies</h3>
            <div className="flex items-center gap-3">
              <input
                className="input w-48 text-xs py-1.5"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button onClick={() => setShowNew(true)} className="btn-primary text-xs py-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Company
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              {search ? 'No companies match your search' : 'No companies yet — add your first client'}
            </div>
          ) : (
            <div className="table-container rounded-none rounded-b-xl">
              <table className="table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Industry</th>
                    <th>Status</th>
                    <th>Seats</th>
                    <th>Onboarded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <CompanyRow key={c.id} company={c} onSelect={setSelected} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showNew   && <NewCompanyModal onClose={() => setShowNew(false)} />}
      {selected  && <CompanyDetail company={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
