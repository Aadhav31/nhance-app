import { useState, useEffect } from 'react'
import { Save, Building2, Users, Monitor, CheckCircle, AlertCircle,
         Plus, X, Loader2, Mail, Shield, Trash2, RefreshCw, Send,
         CreditCard, Eye, EyeOff, Link, Pencil } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useDisplayMode } from '../../contexts/DisplayModeContext'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

// ─── Constants ───────────────────────────────────────────────────────────────
const ROLES = [
  { key: 'admin',      label: 'Admin',      color: 'text-red-400 border-red-700/40 bg-red-900/20' },
  { key: 'manager',    label: 'Manager',    color: 'text-primary-400 border-primary-700/40 bg-primary-900/20' },
  { key: 'supervisor', label: 'Supervisor', color: 'text-amber-400 border-amber-700/40 bg-amber-900/20' },
  { key: 'accounts',   label: 'Accounts',   color: 'text-emerald-400 border-emerald-700/40 bg-emerald-900/20' },
  { key: 'operator',   label: 'Operator/Driver',   color: 'text-blue-400 border-blue-700/40 bg-blue-900/20' },
]

const DEFAULT_ROLE_MODES = {
  admin: 'advanced', manager: 'advanced', supervisor: 'basic',
  operator: 'basic', accounts: 'basic',
}

const inp = (extra = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${extra}`

// ─── Helpers ─────────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-dark-700">
        <Icon className="w-4 h-4 text-primary-400" />
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      <span className="text-sm text-slate-200">{value || <span className="text-slate-600 italic">—</span>}</span>
    </div>
  )
}

function RoleBadge({ role }) {
  const r = ROLES.find(x => x.key === role) || { label: role, color: 'text-slate-500 border-slate-300 bg-slate-100' }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${r.color}`}>
      {r.label}
    </span>
  )
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────
function InviteModal({ onClose, onSent, companyId }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'operator' })
  const [sending, setSending] = useState(false)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSend = async () => {
    if (!form.full_name.trim()) return toast.error('Name required')
    if (!form.email.trim() || !form.email.includes('@')) return toast.error('Valid email required')
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: form.email.trim().toLowerCase(), full_name: form.full_name.trim(), role: form.role },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Invite failed')
      toast.success(`Invite sent to ${form.email}`)
      onSent()
    } catch (e) {
      toast.error(e.message || 'Failed to send invite')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
          <h2 className="text-base font-bold text-slate-100">Invite Team Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-400">
            An email invite will be sent. The employee clicks the link and sets their own password.
          </p>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Full Name *</label>
            <input className={inp()} value={form.full_name} onChange={e => setF('full_name', e.target.value)} placeholder="e.g. Ravi Kumar" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email Address *</label>
            <input type="email" className={inp()} value={form.email} onChange={e => setF('email', e.target.value)} placeholder="ravi@company.com" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Role *</label>
            <select className={inp()} value={form.role} onChange={e => setF('role', e.target.value)}>
              {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              {form.role === 'admin' && 'Full access — can manage all settings and users'}
              {form.role === 'manager' && 'Access to all operations, clients, projects, accounts'}
              {form.role === 'supervisor' && 'Operations, fleet view, inventory, projects, reports'}
              {form.role === 'accounts' && 'Accounts, invoices, expenses, ledger, HR view'}
              {form.role === 'operator' && 'Operator/Driver — daily operations portal only'}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button onClick={handleSend} disabled={sending} className="btn-primary flex-1">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4" /> Send Invite</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Resend Invite Modal ──────────────────────────────────────────────────────
function ResendInviteModal({ member, onClose }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!email.trim() || !email.includes('@')) return toast.error('Valid email required')
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: email.trim().toLowerCase(), full_name: member.full_name, role: member.role },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Resend failed')
      toast.success(`Invite resent to ${email}`)
      onClose()
    } catch (e) {
      toast.error(e.message || 'Failed to resend invite')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
          <h2 className="text-base font-bold text-slate-100">Resend Invite</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-300">
            Resending invite for <span className="font-semibold text-slate-100">{member.full_name}</span> ({member.role})
          </p>
          <p className="text-xs text-slate-400">Enter their email address to resend the login invite.</p>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email Address *</label>
            <input
              type="email"
              autoFocus
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="their@email.com"
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button onClick={handleSend} disabled={sending} className="btn-primary flex-1">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Resend</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Team Members Section ─────────────────────────────────────────────────────
function TeamMembers({ companyId, isAdmin }) {
  const qc = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [resendTarget, setResendTarget] = useState(null)

  const { data: members = [], isLoading, refetch } = useQuery({
    queryKey: ['team_members', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, is_active')
        .eq('company_id', companyId)
        .order('full_name')
      if (error) throw error

      // Fetch roles separately
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('company_id', companyId)

      const roleMap = {}
      roles?.forEach(r => { roleMap[r.user_id] = r.role })

      return (data || []).map(u => ({ ...u, role: roleMap[u.id] || 'unknown' }))
    },
    enabled: !!companyId,
  })

  const handleDeactivate = async (userId, currentStatus) => {
    if (!window.confirm(`${currentStatus ? 'Deactivate' : 'Reactivate'} this user?`)) return
    await supabase.from('user_profiles').update({ is_active: !currentStatus }).eq('id', userId)
    toast.success(currentStatus ? 'User deactivated' : 'User reactivated')
    refetch()
  }

  const handleChangeRole = async (userId, newRole) => {
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq('company_id', companyId)
    if (error) toast.error(error.message)
    else { toast.success('Role updated'); refetch() }
  }


  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400">
          {members.length} member{members.length !== 1 ? 's' : ''} in your organisation
        </p>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary text-xs py-1.5">
            <Plus className="w-3.5 h-3.5" /> Invite Member
          </button>
        )}
      </div>

      {isLoading
        ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
        : members.length === 0
          ? <p className="text-sm text-slate-500 text-center py-6">No team members yet. Invite your first member.</p>
          : (
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border ${m.is_active ? 'border-dark-600 bg-dark-700/30' : 'border-dark-700 bg-dark-800/50 opacity-60'}`}>
                  <div className="w-9 h-9 rounded-full bg-primary-600/20 border border-primary-700/40 flex items-center justify-center text-sm font-bold text-primary-400 flex-shrink-0">
                    {(m.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-200">{m.full_name}</p>
                      <RoleBadge role={m.role} />
                      {!m.is_active && <span className="text-[10px] text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded-full">Inactive</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={m.role}
                        onChange={e => handleChangeRole(m.id, e.target.value)}
                        className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-primary-500"
                      >
                        {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                      <button
                        onClick={() => setResendTarget(m)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition-colors"
                      >
                        <Send className="w-3 h-3" /> Resend Invite
                      </button>
                      <button
                        onClick={() => handleDeactivate(m.id, m.is_active)}
                        title={m.is_active ? 'Deactivate user' : 'Reactivate user'}
                        className={`p-1.5 rounded-lg transition-colors ${m.is_active ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                      >
                        {m.is_active ? <Trash2 className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
      }

      {showInvite && (
        <InviteModal
          companyId={companyId}
          onClose={() => setShowInvite(false)}
          onSent={() => { setShowInvite(false); refetch() }}
        />
      )}

      {resendTarget && (
        <ResendInviteModal
          member={resendTarget}
          onClose={() => setResendTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Display Mode Defaults ───────────────────────────────────────────────────
function DisplayModeSettings({ company, isAdmin }) {
  const [modes, setModes] = useState(DEFAULT_ROLE_MODES)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (company?.role_default_modes) {
      setModes({ ...DEFAULT_ROLE_MODES, ...company.role_default_modes })
    }
  }, [company])

  const handleSave = async () => {
    if (!isAdmin) return
    setSaving(true)
    const { error } = await supabase.from('companies').update({ role_default_modes: modes }).eq('id', company.id)
    setSaving(false)
    if (error) toast.error('Failed to save: ' + error.message)
    else toast.success('Display mode defaults saved')
  }

  return (
    <>
      <p className="text-xs text-slate-500 mb-5">
        Default view mode per role. Each user can override their own preference via the toggle in the top bar.
      </p>
      <div className="grid gap-3">
        {ROLES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-2 border-b border-dark-700 last:border-0">
            <span className="text-sm text-slate-300 font-medium">{label}</span>
            {isAdmin ? (
              <div className="flex items-center bg-dark-700 border border-dark-600 rounded-lg p-0.5">
                {['basic', 'advanced'].map(m => (
                  <button key={m} onClick={() => setModes(prev => ({ ...prev, [key]: m }))}
                    className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all
                      ${modes[key] === m ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                    {m}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-dark-700 text-slate-400 capitalize">{modes[key]}</span>
            )}
          </div>
        ))}
      </div>
      {isAdmin && (
        <div className="mt-5 flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save defaults'}
          </button>
        </div>
      )}
    </>
  )
}

// ─── My Display Mode ─────────────────────────────────────────────────────────
function MyDisplayMode() {
  const { mode, setMode } = useDisplayMode()
  return (
    <div>
      <p className="text-xs text-slate-500 mb-4">Your personal preference — overrides the company default.</p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-300">Current mode:</span>
        <div className="flex items-center bg-dark-700 border border-dark-600 rounded-lg p-0.5">
          {['basic', 'advanced'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-all
                ${mode === m ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
              {m}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">(saved automatically)</span>
      </div>
    </div>
  )
}

// ─── Company Profile ─────────────────────────────────────────────────────────
function CompanyProfile({ company, isAdmin }) {
  const EMPTY = {
    name: '', address: '', phone: '', phone2: '', office_phone: '',
    email: '', gstin: '', msme: '',
    bank_name: '', bank_account_number: '', bank_branch: '', bank_ifsc: '', upi_id: '',
  }
  const [form,    setForm]    = useState(EMPTY)
  const [saved,   setSaved]   = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [editing, setEditing] = useState(false)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!company?.id) return
    supabase.from('companies')
      .select('name, address, phone, phone2, office_phone, email, gstin, msme, bank_name, bank_account_number, bank_branch, bank_ifsc, upi_id')
      .eq('id', company.id).single()
      .then(({ data }) => {
        if (data) {
          const vals = Object.fromEntries(Object.keys(EMPTY).map(k => [k, data[k] || '']))
          setForm(vals); setSaved(vals)
        }
        setLoading(false)
      })
  }, [company?.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const patch = Object.fromEntries(Object.keys(EMPTY).map(k => [k, form[k].trim() || null]))
      if (patch.bank_ifsc) patch.bank_ifsc = patch.bank_ifsc.toUpperCase()
      const { error } = await supabase.from('companies').update(patch).eq('id', company.id)
      if (error) throw error
      setSaved({ ...form, bank_ifsc: patch.bank_ifsc || '' })
      setEditing(false)
      toast.success('Company profile saved')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>

  const RO = ({ label, value }) => (
    <div>
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      <span className="text-sm text-slate-200">{value || <span className="text-slate-600 italic">—</span>}</span>
    </div>
  )

  if (!editing) return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <RO label="Company Name"  value={saved.name} />
        <RO label="GSTIN/UIN"     value={saved.gstin} />
        <RO label="MSME (UDYAM)"  value={saved.msme} />
        <RO label="Email"         value={saved.email} />
        <RO label="Address"       value={saved.address} />
        <RO label="Phone"         value={[saved.phone, saved.phone2].filter(Boolean).join(' / ')} />
        <RO label="Office Phone"  value={saved.office_phone} />
      </div>
      <div className="border-t border-dark-600 pt-4">
        <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Bank Details (for Invoice PDF)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <RO label="Bank Name"    value={saved.bank_name} />
          <RO label="A/C Number"  value={saved.bank_account_number} />
          <RO label="Branch"       value={saved.bank_branch} />
          <RO label="IFSC Code"    value={saved.bank_ifsc} />
          <RO label="UPI / GPay / PhonePe" value={saved.upi_id} />
        </div>
      </div>
      {isAdmin && (
        <button onClick={() => setEditing(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-300 border border-dark-600 transition-all">
          <Pencil className="w-3.5 h-3.5" /> Edit Profile
        </button>
      )}
    </div>
  )

  const F = ({ label, k, placeholder = '', wide = false }) => (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input className={inp()} value={form[k]} onChange={e => setF(k, e.target.value)} placeholder={placeholder} />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <F label="Company Name *"  k="name"  placeholder="GVR M Sand" />
        <F label="GSTIN/UIN"       k="gstin" placeholder="33ACWPG1548F2ZK" />
        <F label="MSME (UDYAM No.)" k="msme" placeholder="UDYAM-TN-XX-XXXXXXX" />
        <F label="Email"           k="email" placeholder="info@company.com" />
        <F label="Address"         k="address" placeholder="No. 250/1, Road Name, Area" wide />
        <F label="Phone (Primary)" k="phone"        placeholder="9443157573" />
        <F label="Phone (Secondary)" k="phone2"     placeholder="9842424204" />
        <F label="Office Phone"    k="office_phone" placeholder="7373724204" />
      </div>
      <div className="border-t border-dark-600 pt-4">
        <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Bank Details (for Invoice PDF)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <F label="Bank Name"    k="bank_name"           placeholder="State Bank of India" />
          <F label="A/C Number"   k="bank_account_number" placeholder="38741106582" />
          <F label="Branch"       k="bank_branch"         placeholder="Perambalur" />
          <F label="IFSC Code"    k="bank_ifsc"           placeholder="SBIN0000796" />
          <F label="UPI / GPay / PhonePe No." k="upi_id" placeholder="9842024204" />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 transition-all">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
        <button onClick={() => { setForm(saved); setEditing(false) }}
          className="px-4 py-2 text-sm rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-300 border border-dark-600 transition-all">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Payment Info Settings (UPI + Bank) ──────────────────────────────────────
function PaymentInfoSettings({ companyId, isAdmin }) {
  const EMPTY = { upi_id: '', bank_account_name: '', bank_account_number: '', bank_ifsc: '', bank_name: '' }
  const [form,    setForm]    = useState(EMPTY)
  const [saved,   setSaved]   = useState(EMPTY)   // snapshot of what's in DB
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [editing, setEditing] = useState(false)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!companyId) return
    supabase.from('companies')
      .select('upi_id, bank_account_name, bank_account_number, bank_ifsc, bank_name')
      .eq('id', companyId).single()
      .then(({ data }) => {
        if (data) {
          const vals = {
            upi_id:              data.upi_id              || '',
            bank_account_name:   data.bank_account_name   || '',
            bank_account_number: data.bank_account_number || '',
            bank_ifsc:           data.bank_ifsc           || '',
            bank_name:           data.bank_name           || '',
          }
          setForm(vals)
          setSaved(vals)
        }
        setLoading(false)
      })
  }, [companyId])

  const hasSavedData = !!(saved.upi_id || saved.bank_account_number || saved.bank_account_name)

  const handleSave = async () => {
    setSaving(true)
    try {
      const patch = {
        upi_id:              form.upi_id.trim()              || null,
        bank_account_name:   form.bank_account_name.trim()   || null,
        bank_account_number: form.bank_account_number.trim() || null,
        bank_ifsc:           form.bank_ifsc.trim().toUpperCase() || null,
        bank_name:           form.bank_name.trim()           || null,
      }
      const { error } = await supabase.from('companies').update(patch).eq('id', companyId)
      if (error) throw error
      const next = { ...form, bank_ifsc: form.bank_ifsc.trim().toUpperCase() }
      setSaved(next)
      setEditing(false)
      toast.success('Payment info saved')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const handleCancel = () => { setForm(saved); setEditing(false) }

  // QR URI — show live in edit mode, from saved in view mode
  const upiSrc = editing ? form.upi_id.trim() : saved.upi_id.trim()
  const upiUri = upiSrc
    ? `upi://pay?pa=${encodeURIComponent(upiSrc)}&pn=${encodeURIComponent((editing ? form.bank_account_name : saved.bank_account_name).trim() || 'Payment')}&cu=INR`
    : null

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>

  // ── READ-ONLY view ──────────────────────────────────────────────────────────
  if (!editing && hasSavedData) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-slate-400 leading-relaxed">
            Shown on invoices so clients can pay directly — <span className="text-emerald-400 font-medium">0% commission</span>.
          </p>
          {isAdmin && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-dark-600 rounded-lg hover:bg-dark-700 transition-all shrink-0"
              style={{ color: 'rgb(var(--t2))' }}>
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
        </div>

        {/* UPI display */}
        {saved.upi_id && (
          <div className="rounded-xl border border-dark-600 overflow-hidden">
            <div className="px-4 py-2.5 bg-dark-700 border-b border-dark-600 flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[9px] text-emerald-500 font-bold">₹</span>
              <span className="text-xs font-semibold" style={{ color: 'rgb(var(--t2))' }}>UPI Details</span>
            </div>
            <div className="p-4 flex items-start gap-4">
              <div className="shrink-0 bg-white p-2 rounded-lg shadow-sm">
                <img
                  src={`https://chart.googleapis.com/chart?chs=120x120&cht=qr&chl=${encodeURIComponent(upiUri)}&choe=UTF-8`}
                  alt="UPI QR" className="w-20 h-20"
                />
              </div>
              <div className="space-y-1 text-xs min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">UPI ID</p>
                <p className="font-mono text-primary-500 break-all">{saved.upi_id}</p>
                <p className="text-slate-500 mt-2">Scan with PhonePe / GPay / BHIM to pay instantly.</p>
              </div>
            </div>
          </div>
        )}

        {/* Bank display */}
        {(saved.bank_account_name || saved.bank_account_number) && (
          <div className="rounded-xl border border-dark-600 overflow-hidden">
            <div className="px-4 py-2.5 bg-dark-700 border-b border-dark-600 flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-[9px] text-primary-500 font-bold">⇄</span>
              <span className="text-xs font-semibold" style={{ color: 'rgb(var(--t2))' }}>Bank Account (NEFT / RTGS)</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-dark-600">
              {[
                { label: 'Account Holder', value: saved.bank_account_name,   span: true },
                { label: 'Account Number', value: saved.bank_account_number, mono: true },
                { label: 'IFSC Code',      value: saved.bank_ifsc,           mono: true },
                { label: 'Bank',           value: saved.bank_name,           span: true },
              ].map(({ label, value, mono, span }) => value ? (
                <div key={label} className={`px-4 py-3 ${span ? 'col-span-2 border-b border-dark-600 last:border-b-0' : 'border-b border-dark-600'}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
                  <p className={`text-sm ${mono ? 'font-mono text-primary-500' : ''}`} style={!mono ? { color: 'rgb(var(--t1))' } : undefined}>{value}</p>
                </div>
              ) : null)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── EDIT / ADD form ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400 leading-relaxed">
        This information is shown on your invoices so clients can pay directly via UPI or bank transfer — <span className="text-emerald-400 font-medium">0% commission</span>. No payment gateway needed.
      </p>

      {/* UPI Section */}
      <div>
        <p className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-emerald-900/40 border border-emerald-700/40 flex items-center justify-center text-[10px] text-emerald-400 font-bold">₹</span>
          UPI Details
        </p>
        <div className="sm:col-span-2">
          <label className="text-xs text-slate-400 mb-1 block">UPI ID</label>
          <input className={inp()} value={form.upi_id} onChange={e => setF('upi_id', e.target.value)}
            placeholder="yourname@ybl  or  company@okicici" disabled={!isAdmin} />
          <p className="text-[11px] text-slate-500 mt-1">Find in PhonePe / GPay / BHIM → Profile → UPI ID</p>
        </div>
        {upiUri && (
          <div className="mt-3 flex items-start gap-4 bg-dark-700/60 border border-dark-600 rounded-xl p-4">
            <div className="shrink-0 bg-white p-2 rounded-lg">
              <img src={`https://chart.googleapis.com/chart?chs=120x120&cht=qr&chl=${encodeURIComponent(upiUri)}&choe=UTF-8`}
                alt="UPI QR Code" className="w-24 h-24" />
            </div>
            <div className="space-y-1 text-xs">
              <p className="text-emerald-400 font-semibold">QR Preview</p>
              <p className="text-slate-400">This QR will appear on your invoices. Clients scan with any UPI app to pay instantly.</p>
              <p className="text-primary-500 font-mono break-all mt-2">{form.upi_id}</p>
            </div>
          </div>
        )}
      </div>

      {/* Bank Section */}
      <div>
        <p className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-blue-900/40 border border-blue-700/40 flex items-center justify-center text-[10px] text-blue-400 font-bold">⇄</span>
          Bank Account (for NEFT / RTGS)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Account Holder Name</label>
            <input className={inp()} value={form.bank_account_name} onChange={e => setF('bank_account_name', e.target.value)}
              placeholder="As per bank records" disabled={!isAdmin} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Account Number</label>
            <input className={inp()} value={form.bank_account_number} onChange={e => setF('bank_account_number', e.target.value)}
              placeholder="000123456789" disabled={!isAdmin} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">IFSC Code</label>
            <input className={inp()} value={form.bank_ifsc} onChange={e => setF('bank_ifsc', e.target.value.toUpperCase())}
              placeholder="HDFC0001234" disabled={!isAdmin} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Bank Name</label>
            <input className={inp()} value={form.bank_name} onChange={e => setF('bank_name', e.target.value)}
              placeholder="HDFC Bank / SBI / ICICI Bank…" disabled={!isAdmin} />
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="flex justify-end gap-2 pt-1">
          {hasSavedData && (
            <button onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 border border-dark-600 text-sm font-medium rounded-lg hover:bg-dark-700 transition-all"
              style={{ color: 'rgb(var(--t2))' }}>
              <X className="w-4 h-4" /> Cancel
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Payment Info'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Razorpay Settings ───────────────────────────────────────────────────────
function RazorpaySettings({ companyId, isAdmin }) {
  const [keyId,          setKeyId]          = useState('')
  const [keySecret,      setKeySecret]      = useState('')
  const [webhookSecret,  setWebhookSecret]  = useState('')
  const [showSecret,     setShowSecret]     = useState(false)
  const [showWHSecret,   setShowWHSecret]   = useState(false)
  const [connected,      setConnected]      = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [removing,       setRemoving]       = useState(false)

  // Webhook URL for this company — tell them to paste this in Razorpay Dashboard
  const supabaseProjectRef = import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0] || '<your-project-ref>'
  const webhookUrl = `https://${supabaseProjectRef}.supabase.co/functions/v1/razorpay-webhook?cid=${companyId}`

  // Load current key_id (secrets are never fetched — write-only from frontend)
  useEffect(() => {
    if (!companyId) return
    supabase
      .from('companies')
      .select('razorpay_key_id')
      .eq('id', companyId)
      .single()
      .then(({ data }) => {
        if (data?.razorpay_key_id) {
          setKeyId(data.razorpay_key_id)
          setConnected(true)
        }
        setLoading(false)
      })
  }, [companyId])

  const handleSave = async () => {
    if (!keyId.trim())     return toast.error('Key ID is required')
    if (!keySecret.trim() && !connected) return toast.error('Key Secret is required')
    if (!keyId.startsWith('rzp_'))
      return toast.error('Key ID must start with rzp_live_ or rzp_test_')
    setSaving(true)
    try {
      const update = { razorpay_key_id: keyId.trim() }
      if (keySecret.trim()) update.razorpay_key_secret = keySecret.trim()
      if (webhookSecret.trim()) update.razorpay_webhook_secret = webhookSecret.trim()
      const { error } = await supabase.from('companies').update(update).eq('id', companyId)
      if (error) throw error
      setConnected(true)
      setKeySecret('')       // clear secrets from UI after save
      setWebhookSecret('')
      toast.success('Razorpay connected successfully')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const handleRemove = async () => {
    if (!window.confirm('Remove Razorpay integration? Payment links will no longer work for this company.')) return
    setRemoving(true)
    try {
      const { error } = await supabase
        .from('companies')
        .update({ razorpay_key_id: null, razorpay_key_secret: null, razorpay_webhook_secret: null })
        .eq('id', companyId)
      if (error) throw error
      setKeyId(''); setKeySecret(''); setWebhookSecret('')
      setConnected(false)
      toast.success('Razorpay disconnected')
    } catch (e) { toast.error(e.message) } finally { setRemoving(false) }
  }

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    toast.success('Webhook URL copied!')
  }

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400 leading-relaxed">
        Connect your company's Razorpay account so your clients can pay invoices online.
        Each company needs their own Razorpay account — money goes directly into your account.
      </p>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        {connected
          ? <><CheckCircle className="w-4 h-4 text-emerald-400" /><span className="text-sm text-emerald-400 font-medium">Connected</span><span className="text-xs text-slate-500">— Key ID: {keyId}</span></>
          : <><AlertCircle className="w-4 h-4 text-amber-400" /><span className="text-sm text-amber-400 font-medium">Not connected</span></>
        }
      </div>

      {isAdmin && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Razorpay Key ID</label>
            <input
              className={inp()}
              value={keyId}
              onChange={e => setKeyId(e.target.value)}
              placeholder="rzp_live_xxxxxxxxxxxx"
            />
            <p className="text-[11px] text-slate-600 mt-1">
              Dashboard → Settings → API Keys → Key ID
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Razorpay Key Secret {connected && <span className="text-slate-600">(enter new to update)</span>}
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                className={inp('pr-10')}
                value={keySecret}
                onChange={e => setKeySecret(e.target.value)}
                placeholder={connected ? '••••••••••••••••' : 'Your Razorpay secret key'}
                autoComplete="off"
              />
              <button type="button" onClick={() => setShowSecret(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">Never shared — stored securely, used server-side only.</p>
          </div>

          {/* Webhook URL — show this to the company so they configure it in Razorpay */}
          <div className="bg-dark-700/60 border border-dark-600 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-slate-300">Your Webhook URL</p>
            <p className="text-[11px] text-slate-400">
              In your Razorpay Dashboard → Settings → Webhooks, add this URL and enable the <code className="text-primary-400">payment_link.paid</code> event.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] text-emerald-400 bg-dark-800 rounded px-2 py-1.5 break-all">{webhookUrl}</code>
              <button onClick={copyWebhookUrl} className="shrink-0 text-xs px-2 py-1.5 rounded bg-dark-600 hover:bg-dark-500 text-slate-300 border border-dark-500">Copy</button>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Razorpay Webhook Secret {connected && <span className="text-slate-600">(enter new to update)</span>}
            </label>
            <div className="relative">
              <input
                type={showWHSecret ? 'text' : 'password'}
                className={inp('pr-10')}
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
                placeholder={connected ? '••••••••••••••••' : 'Webhook secret from Razorpay Dashboard'}
                autoComplete="off"
              />
              <button type="button" onClick={() => setShowWHSecret(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showWHSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">Found in Razorpay Dashboard when you create the webhook.</p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : (connected ? 'Update Keys' : 'Connect Razorpay')}
            </button>
            {connected && (
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-900/20 border border-red-700/30 text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                Disconnect
              </button>
            )}
            <a
              href="https://dashboard.razorpay.com/app/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 ml-auto"
            >
              <Link className="w-3.5 h-3.5" /> Razorpay Dashboard
            </a>
          </div>
        </div>
      )}

      {!isAdmin && connected && (
        <p className="text-xs text-slate-500 italic">Contact your admin to update payment gateway settings.</p>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { company, companyId, role, isAdmin } = useAuth()
  const adminAccess = isAdmin?.() ?? false

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        <SectionCard icon={Building2} title="Company Profile">
          <CompanyProfile company={company} isAdmin={adminAccess} />
        </SectionCard>

        <SectionCard icon={Users} title="Team Members">
          <TeamMembers companyId={companyId} isAdmin={adminAccess} />
        </SectionCard>

        <SectionCard icon={Monitor} title="My Display Mode">
          <MyDisplayMode />
        </SectionCard>

        <SectionCard icon={Shield} title="Display Mode Defaults by Role">
          <DisplayModeSettings company={company} isAdmin={adminAccess} />
        </SectionCard>

        <SectionCard icon={CreditCard} title="Online Payments — Razorpay UPI">
          <RazorpaySettings companyId={companyId} isAdmin={adminAccess} />
        </SectionCard>

      </div>
    </div>
  )
}
