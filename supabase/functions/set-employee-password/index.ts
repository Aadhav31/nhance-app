// supabase/functions/set-employee-password/index.ts
// Admin sets a password for an employee directly — no email needed.
// Admin shares the password via WhatsApp / phone call.
// Deploy: supabase functions deploy set-employee-password

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ── Verify caller is authenticated ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) throw new Error('Unauthorized')

    // ── Parse body ──────────────────────────────────────────────────────────────
    const { user_id, password } = await req.json()
    if (!user_id)  throw new Error('user_id is required')
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters')

    const nhanceAdminEmail = Deno.env.get('NHANCE_ADMIN_EMAIL') || ''
    const isSuperAdmin = caller.email === nhanceAdminEmail

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Verify caller is admin/manager of the SAME company as the target user ──
    if (!isSuperAdmin) {
      const { data: callerRole } = await admin
        .from('user_roles')
        .select('role, company_id')
        .eq('user_id', caller.id)
        .single()

      if (!callerRole || !['admin', 'manager'].includes(callerRole.role)) {
        throw new Error('Only admin or manager can set employee passwords')
      }

      // Make sure target user belongs to same company
      const { data: targetRole } = await admin
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user_id)
        .single()

      if (!targetRole || targetRole.company_id !== callerRole.company_id) {
        throw new Error('Cannot set password for user outside your company')
      }
    }

    // ── Set the password via service role ───────────────────────────────────────
    const { error: updateErr } = await admin.auth.admin.updateUserById(user_id, { password })
    if (updateErr) throw updateErr

    console.log(`✅ Password set for user ${user_id} by ${caller.email}`)

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('set-employee-password error:', e)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
