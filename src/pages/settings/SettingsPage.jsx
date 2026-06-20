import { useState, useEffect } from 'react'
import { Save, Building2, Users, Monitor, CheckCircle, AlertCircle,
         Plus, X, Loader2, Mail, Shield, Trash2, RefreshCw, Send } from 'lucide-react'
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
  { key: 'operator',   label: 'Operator',   color: 'text-blue-400 border-blue-700/40 bg-blue-900/20' },
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
  const r = ROLES.find(x => x.key === role) || { label: role, color: 'text-slate-400 border-slate-600 bg-slate-800' }
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
              {form.role === 'operator' && 'Daily operations only — start/end shifts'}
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
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <select
                        value={m.role}
                        onChange={e => handleChangeRole(m.id, e.target.value)}
                        className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-primary-500"
                      >
                        {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                      <button
                        onClick={() => setResendTarget(m)}
                        title="Resend invite email"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeactivate(m.id, m.is_active)}
                        title={m.is_active ? 'Deactivate' : 'Reactivate'}
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
function CompanyProfile({ company }) {
  if (!company) return <p className="text-sm text-slate-500">No company data found.</p>
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      <Field label="Company Name" value={company.name} />
      <Field label="Industry"     value={company.industry} />
      <Field label="Country"      value={company.country} />
      <Field label="Plan"         value={company.plan} />
      <Field label="Company ID"   value={company.id} />
      <Field label="Created"      value={company.created_at ? new Date(company.created_at).toLocaleDateString('en-IN') : null} />
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
          <CompanyProfile company={company} />
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

      </div>
    </div>
  )
}
