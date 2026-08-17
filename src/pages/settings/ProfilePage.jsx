import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Lock, User, Mail, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { userProfile, userRole, company, updatePassword, passwordRecovery, setPasswordRecovery } = useAuth()

  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [showCur,     setShowCur]     = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [showCon,     setShowCon]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [pwdSuccess,  setPwdSuccess]  = useState(false)
  const [pwdError,    setPwdError]    = useState('')

  const roleLabel = {
    admin: 'Admin', operator: 'Operator', hr: 'HR', accounts: 'Accounts',
    supervisor: 'Supervisor', viewer: 'Viewer', superadmin: 'Super Admin',
  }[userRole?.role] || userRole?.role || '—'

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwdError('')
    setPwdSuccess(false)

    if (newPwd.length < 6) return setPwdError('New password must be at least 6 characters')
    if (newPwd !== confirmPwd) return setPwdError('New passwords do not match')

    setSaving(true)
    try {
      // Verify current password by attempting a silent sign-in
      if (!passwordRecovery) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: userProfile.email,
          password: currentPwd,
        })
        if (verifyErr) {
          setPwdError('Current password is incorrect')
          setSaving(false)
          return
        }
      }

      await updatePassword(newPwd)
      setPwdSuccess(true)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      if (passwordRecovery) setPasswordRecovery(false)
      toast.success('Password updated successfully')
    } catch (err) {
      setPwdError(err.message || 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  const PwdInput = ({ label, value, onChange, show, onToggle, autoComplete, required = true }) => (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value} onChange={e => onChange(e.target.value)}
          required={required} autoComplete={autoComplete}
          className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-slate-200 pr-10
            focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
          placeholder="••••••••"
        />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">

      {/* Password recovery banner */}
      {passwordRecovery && (
        <div className="flex items-start gap-3 bg-primary-500/10 border border-primary-500/30 rounded-xl p-4">
          <Shield className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-primary-300">Password reset requested</p>
            <p className="text-xs text-slate-400 mt-0.5">You arrived via a password reset link. Set your new password below.</p>
          </div>
        </div>
      )}

      {/* Profile Info */}
      <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-dark-700/60">
          <User className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">My Profile</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-dark-700/40">
            <span className="text-xs text-slate-500 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Name</span>
            <span className="text-sm text-slate-200 font-medium">{userProfile?.full_name || '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-dark-700/40">
            <span className="text-xs text-slate-500 flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Email</span>
            <span className="text-sm text-slate-200">{userProfile?.email || '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-dark-700/40">
            <span className="text-xs text-slate-500 flex items-center gap-2"><Shield className="w-3.5 h-3.5" /> Role</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary-500/15 text-primary-300 border border-primary-500/30 font-medium">
              {roleLabel}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-slate-500">Company</span>
            <span className="text-sm text-slate-300">{company?.name || '—'}</span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-dark-800/40 border border-dark-600/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-dark-700/60">
          <Lock className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Change Password</span>
        </div>

        {pwdSuccess && (
          <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-4">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Password updated successfully
          </div>
        )}

        {pwdError && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {pwdError}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          {/* Only ask for current password if NOT coming from a reset link */}
          {!passwordRecovery && (
            <PwdInput
              label="Current Password"
              value={currentPwd} onChange={setCurrentPwd}
              show={showCur} onToggle={() => setShowCur(v => !v)}
              autoComplete="current-password"
            />
          )}
          <PwdInput
            label="New Password"
            value={newPwd} onChange={setNewPwd}
            show={showNew} onToggle={() => setShowNew(v => !v)}
            autoComplete="new-password"
          />
          <PwdInput
            label="Confirm New Password"
            value={confirmPwd} onChange={setConfirmPwd}
            show={showCon} onToggle={() => setShowCon(v => !v)}
            autoComplete="new-password"
          />

          <p className="text-xs text-slate-500">Password must be at least 6 characters.</p>

          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : <><Lock className="w-4 h-4" /> Update Password</>}
          </button>
        </form>
      </div>

    </div>
  )
}
