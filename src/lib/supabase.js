import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from './supabasePublic'

// Anon key is a public key — safe to include in client code.
// Supabase Row Level Security protects all data access.
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || PUBLIC_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
