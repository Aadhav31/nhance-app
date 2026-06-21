import { useState } from 'react'
import { Eye, EyeOff, Loader2, AlertCircle, Mail, KeyRound, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { signIn, resetPassword, authError, signOut } = useAuth()

  // 'password' | 'otp_email' | 'otp_verify' | 'forgot'
  const [mode, setMode] = useState('password')

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [otp,      setOtp]      = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // ── Password login ────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  // ── OTP — send code ───────────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address'); return }
    setError('')
    setLoading(true)
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false }, // only existing users can OTP-login
      })
      if (otpErr) throw otpErr
      setMode('otp_verify')
      toast.success(`6-digit code sent to ${email}`)
    } catch (err) {
      setError(err.message?.includes('not found')
        ? 'No account found with this email. Contact your admin.'
        : err.message || 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  // ── OTP — verify code ─────────────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    if (otp.length < 6) { setError('Enter the 6-digit code from your email'); return }
    setError('')
    setLoading(true)
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'email',
      })
      if (verifyErr) throw verifyErr
      // AuthContext will pick up the new session automatically
    } catch (err) {
      setError(err.message?.includes('expired') || err.message?.includes('invalid')
        ? 'Code is invalid or expired. Request a new one.'
        : err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      toast.success('Password reset link sent to your email')
      setMode('password')
    } catch (err) {
      const msg = err?.message || err?.error_description || ''
      setError(msg || 'Failed to send reset link — check your email and try again')
    } finally {
      setLoading(false)
    }
  }

  const reset = (newMode) => { setError(''); setOtp(''); setMode(newMode) }

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

          {/* ── Auth error (profile/role missing after successful login) ── */}
          {authError && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-start gap-2 text-red-400 text-sm mb-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="font-semibold">Account not set up correctly</span>
              </div>
              <p className="text-xs text-red-300/80 mb-3">{authError}</p>
              <button onClick={signOut}
                className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2">
                Sign out and try a different account
              </button>
            </div>
          )}

          {/* ── Mode: Password login ── */}
          {mode === 'password' && (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-100">Welcome back</h2>
                <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
              </div>

              {/* Login method tabs */}
              <div className="flex bg-dark-700 border border-dark-600 rounded-lg p-1 mb-6">
                <button
                  onClick={() => reset('password')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium bg-primary-600 text-white shadow-sm"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Password
                </button>
                <button
                  onClick={() => reset('otp_email')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" /> Email OTP
                </button>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {error && <ErrorBox msg={error} />}
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email" className="input" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label !mb-0">Password</label>
                    <button type="button" onClick={() => reset('forgot')}
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

          {/* ── Mode: OTP — enter email ── */}
          {mode === 'otp_email' && (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-100">Login with OTP</h2>
                <p className="text-slate-400 text-sm mt-1">We'll send a 6-digit code to your email — no password needed</p>
              </div>

              {/* Login method tabs */}
              <div className="flex bg-dark-700 border border-dark-600 rounded-lg p-1 mb-6">
                <button
                  onClick={() => reset('password')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Password
                </button>
                <button
                  onClick={() => reset('otp_email')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium bg-primary-600 text-white shadow-sm"
                >
                  <Mail className="w-3.5 h-3.5" /> Email OTP
                </button>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                {error && <ErrorBox msg={error} />}
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email" className="input" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email"
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="btn-primary w-full justify-center py-2.5">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Mail className="w-4 h-4" /> Send Code</>}
                </button>
              </form>
            </>
          )}

          {/* ── Mode: OTP — verify code ── */}
          {mode === 'otp_verify' && (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-100">Enter your code</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Code sent to <span className="text-slate-300 font-medium">{email}</span>
                </p>
              </div>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {error && <ErrorBox msg={error} />}
                <div>
                  <label className="label">6-Digit Code</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                    className="input text-center text-2xl tracking-[0.5em] font-bold"
                    placeholder="000000"
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus required
                  />
                </div>
                <button type="submit" disabled={loading || otp.length < 6}
                  className="btn-primary w-full justify-center py-2.5">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify & Sign In'}
                </button>
                <button type="button" onClick={() => reset('otp_email')}
                  className="btn-ghost w-full justify-center text-sm">
                  <ArrowLeft className="w-3.5 h-3.5" /> Resend code
                </button>
              </form>
            </>
          )}

          {/* ── Mode: Forgot password ── */}
          {mode === 'forgot' && (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-100">Reset password</h2>
                <p className="text-slate-400 text-sm mt-1">Enter your email — we'll send a reset link</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-4">
                {error && <ErrorBox msg={error} />}
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email" className="input" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)} required
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="btn-primary w-full justify-center py-2.5">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send Reset Link'}
                </button>
                <button type="button" onClick={() => reset('password')}
                  className="btn-ghost w-full justify-center text-sm">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
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

function ErrorBox({ msg }) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {msg}
    </div>
  )
}
