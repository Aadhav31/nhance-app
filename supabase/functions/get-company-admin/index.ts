// supabase/functions/get-company-admin/index.ts
// Returns the admin user(s) for a company including email and login status.
// Used by SuperAdmin to check if the company admin has logged in yet.
// Deploy: supabase functions deploy get-company-admin

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ── Verify caller is superadmin ────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) throw new Error('Unauthorized')

    const nhanceAdminEmail = Deno.env.get('NHANCE_ADMIN_EMAIL') || ''
    if (caller.email !== nhanceAdminEmail) throw new Error('Only Nhance superadmin can access this')

    const body = await req.json().catch(() => ({}))
    const url = new URL(req.url)
    const company_id = body.company_id || url.searchParams.get('company_id')
    if (!company_id) throw new Error('company_id is required')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Find admin user_ids for this company ───────────────────────────────────
    const { data: adminRoles } = await admin
      .from('user_roles')
      .select('user_id, role')
      .eq('company_id', company_id)
      .eq('role', 'admin')

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, admins: [] }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Look up auth users to get email + login status ─────────────────────────
    const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const authUsers = userList?.users || []

    const { data: profiles } = await admin
      .from('user_profiles')
      .select('id, full_name')
      .in('id', adminRoles.map(r => r.user_id))

    const profileMap: Record<string, string> = {}
    profiles?.forEach((p: any) => { profileMap[p.id] = p.full_name })

    const admins = adminRoles.map(r => {
      const authUser = authUsers.find(u => u.id === r.user_id)
      return {
        user_id:        r.user_id,
        email:          authUser?.email || null,
        full_name:      profileMap[r.user_id] || null,
        has_logged_in:  !!authUser?.last_sign_in_at,
        last_sign_in:   authUser?.last_sign_in_at || null,
        invite_sent_at: authUser?.invited_at || null,
      }
    })

    return new Response(
      JSON.stringify({ success: true, admins }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('get-company-admin error:', e)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
