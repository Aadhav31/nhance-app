import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,     setSession]     = useState(undefined) // undefined = loading
  const [userProfile, setUserProfile] = useState(null)
  const [userRole,    setUserRole]    = useState(null)
  const [company,     setCompany]     = useState(null)
  const [userUnit,    setUserUnit]    = useState(null)   // company_units row or null (all-access)
  const [allUnits,    setAllUnits]    = useState([])     // all units for this company
  const [modules,     setModules]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [authError,   setAuthError]   = useState(null)  // shown on login page if profile missing

  // Load full profile after auth session is established
  const loadUserData = async (authUser) => {
    if (!authUser) {
      setUserProfile(null)
      setUserRole(null)
      setCompany(null)
      setUserUnit(null)
      setAllUnits([])
      setModules([])
      setLoading(false)
      return
    }

    // Check if Nhance super-admin
    // IMPORTANT: VITE_NHANCE_ADMIN_EMAIL must be set in Vercel environment variables
    const nhanceAdminEmail = import.meta.env.VITE_NHANCE_ADMIN_EMAIL
    if (nhanceAdminEmail && authUser.email === nhanceAdminEmail) {
      setUserRole({ role: 'superadmin' })
      setUserProfile({ id: authUser.id, full_name: 'Nhance Admin', email: authUser.email })
      setCompany(null)
      setModules(['*']) // super-admin has all access
      setLoading(false)
      return
    }

    try {
      setAuthError(null)

      // Load user profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (profileError || !profile) throw new Error('Your account profile is not set up yet. Contact your HR admin.')

      // Load role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', authUser.id)
        .single()

      if (roleError || !roleData) throw new Error('No role assigned to your account. Contact your HR admin.')

      // Load company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single()

      if (companyError || !companyData) throw new Error('Company not found. Contact your HR admin.')

      if (!companyData.is_active) throw new Error('Your company account is suspended. Contact Nhance support.')

      // Load active modules
      const { data: moduleData } = await supabase
        .from('company_modules')
        .select('module_key')
        .eq('company_id', profile.company_id)
        .eq('is_enabled', true)

      // Load all company units
      const { data: unitsData } = await supabase
        .from('company_units')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('sort_order')

      // Load the user's assigned unit (NULL = all-access)
      let assignedUnit = null
      if (profile.unit_id && unitsData) {
        assignedUnit = unitsData.find(u => u.id === profile.unit_id) || null
      }

      setAuthError(null)
      setUserProfile(profile)
      setUserRole(roleData)
      setCompany(companyData)
      setUserUnit(assignedUnit)
      setAllUnits(unitsData || [])
      setModules(moduleData?.map(m => m.module_key) || [])
    } catch (err) {
      console.error('Failed to load user data:', err)
      // Don't auto-signout — show the error so user/admin knows what's wrong
      setAuthError(err.message || 'Login failed — contact your admin.')
      setUserProfile(null)
      setUserRole(null)
      setCompany(null)
      setUserUnit(null)
      setAllUnits([])
      setModules([])
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

  const isSuperAdmin  = () => userRole?.role === 'superadmin'
  const isAdmin       = () => ['admin', 'superadmin'].includes(userRole?.role)
  const role          = userRole?.role || null
  const industryType  = company?.industry || 'construction'

  // Unit helpers
  // isAllUnits: true for admin / accounts / superadmin roles, or if no units are set up yet
  const ALL_UNIT_ROLES = ['admin', 'superadmin', 'accounts', 'hr']
  const isAllUnits = ALL_UNIT_ROLES.includes(role) || !userUnit
  // unitFilter(col): returns Supabase filter args or null (meaning no filter needed)
  // Usage: const filter = unitFilter('unit_id')
  //        if (filter) query = query.eq(...filter)
  const unitFilter = (col = 'unit_id') => isAllUnits ? null : [col, userUnit?.id]

  const signOut = async () => {
    setAuthError(null)
    await supabase.auth.signOut()
  }

  const value = {
    session,
    userProfile,
    userRole,
    company,
    companyId:    company?.id ?? null,
    industryType,             // e.g. 'construction' | 'crusher' | 'readymix' | 'automobile'
    modules,
    loading,
    role,
    authError,
    // ── Multi-unit ────────────────────────────────────────────────────────────
    userUnit,     // company_units row for the logged-in user, or null (all-access)
    allUnits,     // all active company_units[]
    isAllUnits,   // true = admin/accounts sees all units
    unitFilter,   // fn(col?) → [col, unitId] | null — apply to Supabase queries
    // ─────────────────────────────────────────────────────────────────────────
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
