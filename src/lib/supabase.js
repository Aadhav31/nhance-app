import { createClient } from '@supabase/supabase-js'

// Anon key is a public key — safe to include in client code.
// Supabase Row Level Security protects all data access.
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || 'https://ygfyaryowsmqbapkmyjd.supabase.co'
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnZnlhcnlvd3NtcWJhcGtteWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDk1NzYsImV4cCI6MjA5NzE4NTU3Nn0.3eVe841mD-5-UkmQMbDN-fjhw4Y5AcCfa8fmFnU6cNU'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
