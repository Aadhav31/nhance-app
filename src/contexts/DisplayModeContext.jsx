import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const DisplayModeContext = createContext(null)

export function DisplayModeProvider({ children }) {
  const { userProfile, company, role } = useAuth()
  const [mode, setModeState] = useState('basic')

  useEffect(() => {
    if (!userProfile) return
    // User's personal preference takes priority
    if (userProfile.display_mode) {
      setModeState(userProfile.display_mode)
      return
    }
    // Fall back to company's per-role default
    const roleDefaults = company?.role_default_modes || {}
    setModeState(roleDefaults[role] || 'basic')
  }, [userProfile, company, role])

  const setMode = async (newMode) => {
    setModeState(newMode)
    if (userProfile?.id) {
      await supabase
        .from('user_profiles')
        .update({ display_mode: newMode })
        .eq('id', userProfile.id)
    }
  }

  return (
    <DisplayModeContext.Provider value={{
      mode,
      setMode,
      isAdvanced: mode === 'advanced',
      isBasic:    mode === 'basic',
    }}>
      {children}
    </DisplayModeContext.Provider>
  )
}

export function useDisplayMode() {
  const ctx = useContext(DisplayModeContext)
  if (!ctx) throw new Error('useDisplayMode must be inside DisplayModeProvider')
  return ctx
}
