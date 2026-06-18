import { useState, useEffect } from 'react'
import { Save, Building2, Users, Monitor, CheckCircle, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useDisplayMode } from '../../contexts/DisplayModeContext'
import { supabase } from '../../lib/supabase'

// ─── Helpers ────────────────────────────────────────────────────────────────
const ROLES = [
  { key: 'admin',      label: 'Admin' },
  { key: 'manager',    label: 'Manager' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'operator',   label: 'Operator' },
  { key: 'viewer',     label: 'Viewer' },
  { key: 'driver',     label: 'Driver' },
]

const DEFAULT_ROLE_MODES = {
  admin: 'advanced', manager: 'advanced', supervisor: 'basic',
  operator: 'basic', viewer: 'basic', driver: 'basic',
}

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

function Toast({ msg, type }) {
  if (!msg) return null
  const ok = type === 'success'
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium
      ${ok ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
    </div>
  )
}

// ─── Display Mode Defaults ───────────────────────────────────────────────────
function DisplayModeSettings({ company, isAdmin }) {
  const [modes, setModes] = useState(DEFAULT_ROLE_MODES)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (company?.role_default_modes) {
      setModes({ ...DEFAULT_ROLE_MODES, ...company.role_default_modes })
    }
  }, [company])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSave = async () => {
    if (!isAdmin) return
    setSaving(true)
    const { error } = await supabase
      .from('companies')
      .update({ role_default_modes: modes })
      .eq('id', company.id)
    setSaving(false)
    if (error) showToast('Failed to save: ' + error.message, 'error')
    else showToast('Display mode defaults saved')
  }

  return (
    <>
      <p className="text-xs text-slate-500 mb-5">
        Sets the default view mode for each role. Users can override their own preference via the toggle in the top bar.
      </p>
      <div className="grid gap-3">
        {ROLES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-2 border-b border-dark-700 last:border-0">
            <span className="text-sm text-slate-300 font-medium">{label}</span>
            {isAdmin ? (
              <div className="flex items-center bg-dark-700 border border-dark-600 rounded-lg p-0.5">
                {['basic', 'advanced'].map(m => (
                  <button
                    key={m}
                    onClick={() => setModes(prev => ({ ...prev, [key]: m }))}
                    className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all
                      ${modes[key] === m
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-dark-700 text-slate-400 capitalize">
                {modes[key]}
              </span>
            )}
          </div>
        ))}
      </div>
      {isAdmin && (
        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500
              text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save defaults'}
          </button>
        </div>
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </>
  )
}

// ─── My Display Mode ─────────────────────────────────────────────────────────
function MyDisplayMode() {
  const { mode, setMode } = useDisplayMode()

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4">
        Your personal preference overrides the company default. Change it anytime via the toggle in the top bar.
      </p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-300">Current mode:</span>
        <div className="flex items-center bg-dark-700 border border-dark-600 rounded-lg p-0.5">
          {['basic', 'advanced'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-all
                ${mode === m
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'}`}
            >
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
  const { company, role, isAdmin } = useAuth()
  const adminAccess = isAdmin?.() ?? false

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Company Profile */}
        <SectionCard icon={Building2} title="Company Profile">
          <CompanyProfile company={company} />
        </SectionCard>

        {/* My Display Mode */}
        <SectionCard icon={Monitor} title="My Display Mode">
          <MyDisplayMode />
        </SectionCard>

        {/* Role Default Modes — visible to all, editable by admin */}
        <SectionCard icon={Users} title="Display Mode Defaults by Role">
          <DisplayModeSettings company={company} isAdmin={adminAccess} />
        </SectionCard>

      </div>
    </div>
  )
}
