import { useState } from 'react'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import LoadingScreen from '../../components/shared/LoadingScreen'

function PwdInput({ label, value, onChange, show, onToggle, autoComplete }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value} onChange={e => onChange(e.target.value)}
          required autoComplete={autoComplete}
          className="input pr-10" placeholder="••••••••"
        />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  const { session, loading, updatePassword, signOut } = useAuth()

  const [newPwd,     setNewPwd]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showNew,    setShowNew]    = useState(false)
  const [showCon,    setShowCon]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [done,       setDone]       = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPwd.length < 6) return setError('Password must be at least 6 characters')
    if (newPwd !== confirmPwd) return setError('Passwords do not match')

    setSaving(true)
    try {
      await updatePassword(newPwd)
      setDone(true)
      // Sign out the temporary recovery session
      await signOut()
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Still establishing session from the reset token
  if (loading || !session) {
    return <LoadingScreen message="Verifying reset link…" />
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-400 to-cyan-400 bg-clip-text text-transparent">
            NHANCE
          </h1>
          <p className="text-slate-500 text-sm mt-1 uppercase tracking-widest font-semibold">
            Fleet &amp; Operations Suite
          </p>
        </div>

        <div className="card p-8">
          {done ? (
            /* ── SUCCESS ── */
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-slate-100 mb-1">Password updated!</h2>
              <p className="text-sm text-slate-400 mb-6">
                Your password has been changed successfully. Please sign in with your new password.
              </p>
              <button
                onClick={() => { window.location.href = '/' }}
                className="btn-primary w-full justify-center py-2.5">
                Go to Sign In
              </button>
            </div>
          ) : (
            /* ── SET NEW PASSWORD ── */
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-primary-500/15 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-primary-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Set new password</h2>
                  <p className="text-slate-400 text-xs mt-0.5">Choose a strong password for your account</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
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
                  className="btn-primary w-full justify-center py-2.5 mt-2">
                  {saving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                    : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          © {new Date().getFullYear()} Nhance. All rights reserved.
        </p>
      </div>
    </div>
  )
}
