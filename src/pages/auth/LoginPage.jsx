import { useState } from 'react'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const { signIn, authError, signOut, resetPassword } = useAuth()

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPwd,     setShowPwd]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  // Forgot password state
  const [forgotMode,  setForgotMode]  = useState(false)
  const [resetEmail,  setResetEmail]  = useState('')
  const [resetSent,   setResetSent]   = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError,  setResetError]  = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email.trim().toLowerCase(), password)
    } catch (err) {
      setError(err.message?.includes('Invalid') ? 'Incorrect email or password' : err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    try {
      await resetPassword(resetEmail.trim().toLowerCase())
      setResetSent(true)
    } catch (err) {
      setResetError(err.message || 'Failed to send reset email')
    } finally {
      setResetLoading(false)
    }
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

          {/* ── FORGOT PASSWORD MODE ─────────────────────────────── */}
          {forgotMode ? (
            <>
              <button onClick={() => { setForgotMode(false); setResetSent(false); setResetError('') }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-5 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>

              {resetSent ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                  <h2 className="text-lg font-bold text-slate-100 mb-1">Check your email</h2>
                  <p className="text-sm text-slate-400">
                    We sent a password reset link to <span className="text-primary-300 font-medium">{resetEmail}</span>.
                    Click the link in the email to set a new password.
                  </p>
                  <p className="text-xs text-slate-500 mt-3">Didn't receive it? Check your spam folder.</p>
                  <button onClick={() => { setResetSent(false); setResetEmail('') }}
                    className="mt-4 text-xs text-primary-400 hover:text-primary-300 underline underline-offset-2">
                    Try a different email
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-slate-100">Forgot password?</h2>
                    <p className="text-slate-400 text-sm mt-1">Enter your email and we'll send a reset link.</p>
                  </div>

                  <form onSubmit={handleForgot} className="space-y-4">
                    {resetError && (
                      <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {resetError}
                      </div>
                    )}
                    <div>
                      <label className="label">Email Address</label>
                      <input
                        type="email" className="input" placeholder="you@company.com"
                        value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                        required autoFocus
                      />
                    </div>
                    <button type="submit" disabled={resetLoading}
                      className="btn-primary w-full justify-center py-2.5">
                      {resetLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send Reset Link'}
                    </button>
                  </form>
                </>
              )}
            </>
          ) : (
            /* ── SIGN IN MODE ──────────────────────────────────────── */
            <>
              {/* Auth error (profile/role missing) */}
              {authError && (
                <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <div className="flex items-start gap-2 text-red-400 text-sm mb-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="font-semibold">Account not configured</span>
                  </div>
                  <p className="text-xs text-red-300/80 mb-3">{authError}</p>
                  <button onClick={signOut} className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2">
                    Sign out
                  </button>
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-100">Welcome back</h2>
                <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email" className="input" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email" autoFocus
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label !mb-0">Password</label>
                    <button type="button" onClick={() => { setForgotMode(true); setResetEmail(email) }}
                      className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'} className="input pr-10"
                      placeholder="••••••••" value={password}
                      onChange={e => setPassword(e.target.value)}
                      required autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full justify-center py-2.5 mt-2">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
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
