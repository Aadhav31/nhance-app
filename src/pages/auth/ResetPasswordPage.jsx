import { useState } from 'react'
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function ResetPasswordPage({ onDone }) {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPwd,   setShowPwd]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm)  { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) throw updateErr
      setDone(true)
      // Give user 2s to see success, then navigate to app
      setTimeout(() => onDone?.(), 2000)
    } catch (err) {
      setError(err.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="relative w-full max-w-md">
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
            <div className="text-center py-4 space-y-3">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
              <h2 className="text-xl font-bold text-slate-100">Password Set!</h2>
              <p className="text-slate-400 text-sm">You're being signed in…</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-100">Set your password</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Choose a password you'll use to sign in to Nhance
                </p>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                )}

                <div>
                  <label className="label">New Password</label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoFocus
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Re-enter password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full justify-center py-2.5 mt-2">
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                    : 'Set Password & Sign In'}
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
