import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,     setSession]     = useState(undefined) // undefined = loading
  const [userProfile, setUserProfile] = useState(null)
  const [userRole,    setUserRole]    = useState(null)
  const [company,     setCompany]     = useState(null)
  const [modules,     setModules]     = useState([])
  const [loading,     setLoading]     = useState(true)

  // Load full profile after auth session is established
  const loadUserData = async (authUser) => {
    if (!authUser) {
      setUserProfile(null)
      setUserRole(null)
      setCompany(null)
      setModules([])
      setLoading(false)
      return
    }

    // Check if Nhance super-admin
    const nhanceAdminEmail = import.meta.env.VITE_NHANCE_ADMIN_EMAIL
    if (authUser.email === nhanceAdminEmail) {
      setUserRole({ role: 'superadmin' })
      setUserProfile({ id: authUser.id, full_name: 'Nhance Admin', email: authUser.email })
      setCompany(null)
      setModules(['*']) // super-admin has all access
      setLoading(false)
      return
    }

    try {
      // Load user profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (profileError || !profile) throw new Error('Profile not found')

      // Load role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', authUser.id)
        .single()

      if (roleError || !roleData) throw new Error('Role not found')

      // Load company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single()

      if (companyError || !companyData) throw new Error('Company not found')

      if (!companyData.is_active) throw new Error('Company account is suspended')

      // Load active modules
      const { data: moduleData } = await supabase
        .from('company_modules')
        .select('module_key')
        .eq('company_id', profile.company_id)
        .eq('is_enabled', true)

      setUserProfile(profile)
      setUserRole(roleData)
      setCompany(companyData)
      setModules(moduleData?.map(m => m.module_key) || [])
    } catch (err) {
      console.error('Failed to load user data:', err)
      // Sign out on error — prevents stuck loading state
      await supabase.auth.signOut()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      loadUserData(session?.user ?? null)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      loadUserData(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ─── Auth actions ──────────────────────────────────────────────────────────
  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    })
    if (error) throw error
  }

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }

  // ─── Permission check ──────────────────────────────────────────────────────
  const hasModule = (moduleKey) => {
    if (modules.includes('*')) return true
    return modules.includes(moduleKey)
  }

  const isSuperAdmin = () => userRole?.role === 'superadmin'
  const isAdmin      = () => ['admin', 'superadmin'].includes(userRole?.role)
  const role         = userRole?.role || null

  const value = {
    session,
    userProfile,
    userRole,
    company,
    companyId: company?.id ?? null,
    modules,
    loading,
    role,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    hasModule,
    isSuperAdmin,
    isAdmin,
    refreshProfile: () => loadUserData(session?.user),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
