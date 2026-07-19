import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtCurrency } from '../../lib/utils'
import {
  Building2, Users, Package, Plus, ChevronRight,
  CheckCircle, XCircle, Loader2, X, ToggleLeft, ToggleRight,
  Pencil, Trash2, ShieldCheck, Clock, Copy, Link, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal, { FormField } from '../../components/shared/Modal'
import { MODULE_LABELS } from '../../lib/constants'
import { INDUSTRY_LABELS, INDUSTRY_ICONS, getIndustryModules } from '../../lib/industryConfig'

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
        <span className="text-xs text-slate-400">{INDUSTRY_ICONS[company.industry] || '🏢'} {INDUSTRY_LABELS[company.industry] || company.industry?.replace('_', ' ')}</span>
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
    name: '', industry: 'construction', contact_name: '', contact_email: '',
    admin_name: '', admin_email: '', admin_password: '',
    contact_phone: '', gstin: '', address: '', max_users: 10,
    modules: getIndustryModules('construction'),
  })
  const [saving, setSaving]   = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [created, setCreated] = useState(null) // { companyName, email, password }
  const [copied,  setCopied]  = useState(false)

  const generatePassword = () => {
    const digits = Math.floor(1000 + Math.random() * 9000)
    set('admin_password', `Nhance@${digits}`)
    setShowPwd(true)
  }

  const set = (k, v) => setForm(p => {
    const next = { ...p, [k]: v }
    if (k === 'industry') next.modules = getIndustryModules(v)
    return next
  })

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
    if (!form.name.trim())    { toast.error('Company name is required'); return }
    if (!form.admin_name.trim()) { toast.error('Admin name is required'); return }
    if (!form.admin_email.trim() || !form.admin_email.includes('@')) {
      toast.error('Admin email is required'); return
    }
    if (!form.admin_password || form.admin_password.length < 6) {
      toast.error('Password must be at least 6 characters'); return
    }
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

      // 2. Create all module entries (all enabled)
      const moduleRows = ALL_MODULES.map(mod => ({
        company_id: company.id,
        module_key: mod,
        is_enabled: form.modules.includes(mod),
        enabled_at: form.modules.includes(mod) ? new Date().toISOString() : null,
      }))
      const { error: mErr } = await supabase.from('company_modules').insert(moduleRows)
      if (mErr) throw mErr

      // 3. Create admin login directly — no email invite
      const { data: loginData, error: loginErr } = await supabase.functions.invoke('create-employee-login', {
        body: {
          email: form.admin_email.trim().toLowerCase(),
          full_name: form.admin_name.trim(),
          role: 'admin',
          company_id: company.id,
          password: form.admin_password,
          // no employee_id — this is a company admin, not an HR employee
        },
      })
      if (loginErr || !loginData?.success) throw new Error(loginData?.error || loginErr?.message || 'Failed to create admin login')

      qc.invalidateQueries(['companies'])
      setCreated({ companyName: form.name, email: form.admin_email.trim().toLowerCase(), password: form.admin_password })
    } catch (err) {
      toast.error(err.message || 'Failed to create company')
    } finally {
      setSaving(false)
    }
  }

  const copyCredentials = () => {
    if (!created) return
    const msg = `Hi ${form.admin_name},\n\nYour Nhance Admin login for ${created.companyName}:\nEmail: ${created.email}\nPassword: ${created.password}\n\nLogin at: https://nhance-app.vercel.app`
    navigator.clipboard.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Credentials copied — paste into WhatsApp')
  }

  // Show success screen after creation
  if (created) {
    return (
      <Modal title="Company Created!" onClose={onClose} footer={
        <>
          <button onClick={copyCredentials}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-600/30 text-sm font-medium">
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy for WhatsApp'}
          </button>
          <button onClick={onClose} className="btn-primary">Done</button>
        </>
      }>
        <div className="space-y-4">
          <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 text-center">
            <p className="text-emerald-400 font-bold text-base mb-1">✅ {created.companyName} is live!</p>
            <p className="text-xs text-slate-400">Admin account created. Share these credentials via WhatsApp.</p>
          </div>
          <div className="bg-dark-700 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-xs">Email</span>
              <span className="text-slate-100 font-mono">{created.email}</span>
            </div>
            <div className="flex justify-between items-center border-t border-dark-600 pt-2">
              <span className="text-slate-400 text-xs">Password</span>
              <span className="text-emerald-400 font-mono font-bold text-base">{created.password}</span>
            </div>
            <div className="flex justify-between items-center border-t border-dark-600 pt-2">
              <span className="text-slate-400 text-xs">App URL</span>
              <span className="text-slate-300 text-xs">nhance-app.vercel.app</span>
            </div>
          </div>
        </div>
      </Modal>
    )
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
            Set the admin's login credentials here. Share via WhatsApp after creating — no email needed.
          </p>
          <div className="form-grid-2 mb-3">
            <FormField label="Admin Full Name" required>
              <input className="input" value={form.admin_name} onChange={e => set('admin_name', e.target.value)} placeholder="e.g. Ravi Kumar" />
            </FormField>
            <FormField label="Admin Email" required>
              <input type="email" className="input" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} placeholder="admin@company.com" />
            </FormField>
          </div>
          <FormField label="Admin Password" required>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPwd ? 'text' : 'password'} className="input pr-14 font-mono"
                  value={form.admin_password} onChange={e => set('admin_password', e.target.value)}
                  placeholder="Min. 6 characters"
                />
                <button type="button" onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs">
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
              <button type="button" onClick={generatePassword}
                className="px-3 py-2 rounded-lg bg-dark-600 border border-dark-500 text-xs text-cyan-400 hover:bg-dark-500 whitespace-nowrap">
                Auto-generate
              </button>
            </div>
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Company Name" required>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Equipment Pvt Ltd" />
          </FormField>
          <FormField label="Industry">
            <select className="input" value={form.industry} onChange={e => set('industry', e.target.value)}>
              {Object.entries(INDUSTRY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{INDUSTRY_ICONS[val]} {label}</option>
              ))}
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
              {Object.entries(INDUSTRY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{INDUSTRY_ICONS[val]} {label}</option>
              ))}
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

  const { data: adminInfo = [], refetch: refetchAdmin } = useQuery({
    queryKey: ['company_admin', company.id],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('get-company-admin', {
        body: { company_id: company.id },
      })
      return data?.admins || []
    },
  })

  const [setPwdFor, setSetPwdFor] = useState(null) // { user_id, email, full_name }
  const [newPwd, setNewPwd]       = useState('')
  const [settingPwd, setSettingPwd] = useState(false)
  const [pwdDone, setPwdDone]     = useState(false)
  const [copied, setCopied]       = useState(false)

  const generatePwd = () => {
    const d = Math.floor(1000 + Math.random() * 9000)
    setNewPwd(`Nhance@${d}`)
  }

  const handleSetPassword = async () => {
    if (!newPwd || newPwd.length < 6) return toast.error('Password must be at least 6 characters')
    setSettingPwd(true)
    try {
      const { data, error } = await supabase.functions.invoke('set-employee-password', {
        body: { user_id: setPwdFor.user_id, password: newPwd },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Failed to set password')
      setPwdDone(true)
    } catch (err) {
      toast.error(err.message || 'Failed to set password')
    } finally {
      setSettingPwd(false)
    }
  }

  const copyAdminCreds = () => {
    const msg = `Hi ${setPwdFor?.full_name || 'Admin'},\n\nYour Nhance Admin login:\nEmail: ${setPwdFor?.email}\nPassword: ${newPwd}\n\nLogin at: https://nhance-app.vercel.app`
    navigator.clipboard.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied — paste into WhatsApp')
  }

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
      `⚠️ Permanently delete "${company.name}"?\n\nThis will remove ALL company data — employees, equipment, invoices, projects, and users. This cannot be undone.`
    )) return
    setDeleting(true)
    try {
      const { error } = await supabase.rpc('delete_company_cascade', { p_company_id: company.id })
      if (error) throw error
      toast.success(`"${company.name}" permanently deleted`)
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

        {/* Admin Login Status */}
        <div className="border border-dark-600 rounded-lg p-4 bg-dark-700/40 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Company Admin Login</p>
            <p className="text-[11px] text-slate-500">Generate a link to share via WhatsApp or SMS</p>
          </div>
          {adminInfo.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No admin user linked yet</p>
          ) : (
            <div className="space-y-3">
              {adminInfo.map((adm) => (
                <div key={adm.user_id} className="flex flex-col gap-2.5 p-3 rounded-lg bg-dark-800/60 border border-dark-600">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-700/40 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
                        {(adm.full_name || adm.email || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{adm.full_name || '—'}</p>
                        <p className="text-xs text-slate-400 truncate">{adm.email || '—'}</p>
                      </div>
                    </div>
                    {adm.has_logged_in ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex-shrink-0">
                        <ShieldCheck className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full flex-shrink-0">
                        <Clock className="w-3 h-3" /> Never Logged In
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { setSetPwdFor(adm); setNewPwd(''); setPwdDone(false) }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition-colors w-full"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Set / Reset Password
                  </button>
                </div>
              ))}
            </div>
          )}
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

    {setPwdFor && (
      <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
        <div className="bg-dark-800 rounded-xl border border-dark-600 shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
            <h2 className="text-base font-bold text-slate-100">Set Password — {setPwdFor.full_name || setPwdFor.email}</h2>
            <button onClick={() => setSetPwdFor(null)} className="text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            {!pwdDone ? (
              <>
                <div className="bg-dark-700 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-slate-400">Email</span><span className="text-slate-200 font-mono">{setPwdFor.email}</span></div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs text-slate-400">New Password</label>
                    <button onClick={generatePwd} className="text-xs text-cyan-400 hover:text-cyan-300 underline">Auto-generate</button>
                  </div>
                  <input type="text" className="input font-mono"
                    value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min. 6 characters" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setSetPwdFor(null)} className="btn-ghost flex-1">Cancel</button>
                  <button onClick={handleSetPassword} disabled={settingPwd || newPwd.length < 6} className="btn-primary flex-1">
                    {settingPwd ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting…</> : 'Set Password'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 text-center">
                  <p className="text-emerald-400 font-semibold text-sm">✅ Password updated!</p>
                  <p className="text-xs text-slate-400 mt-1">Share credentials via WhatsApp.</p>
                </div>
                <div className="bg-dark-700 rounded-xl p-3 text-xs space-y-1.5">
                  <div className="flex justify-between"><span className="text-slate-400">Email</span><span className="text-slate-100 font-mono">{setPwdFor.email}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Password</span><span className="text-emerald-400 font-mono font-bold">{newPwd}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">App</span><span className="text-slate-300">nhance-app.vercel.app</span></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={copyAdminCreds}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-600/30 text-sm font-medium">
                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy for WhatsApp'}
                  </button>
                  <button onClick={() => setSetPwdFor(null)} className="btn-primary flex-1 justify-center">Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
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
