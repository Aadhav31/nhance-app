// supabase/functions/invite-user/index.ts
// Invites a new employee login — creates auth user, profile, role, and links to HR record
// Called from Settings > Team Members or HR > Invite & Link
// Deployed via: supabase functions deploy invite-user

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ── Verify caller is authenticated ────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) throw new Error('Unauthorized')

    // ── Check caller is admin ─────────────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', caller.id)
      .single()

    // Allow Nhance superadmin (no user_roles entry) or company admin/manager
    const nhanceAdminEmail = Deno.env.get('NHANCE_ADMIN_EMAIL') || ''
    const isSuperAdmin = caller.email === nhanceAdminEmail
    if (!isSuperAdmin && (!callerRole || !['admin', 'manager'].includes(callerRole.role))) {
      throw new Error('Only admins and managers can invite users')
    }

    // ── Parse request ─────────────────────────────────────────────────────────
    const { email, full_name, role, employee_id, company_id: bodyCompanyId } = await req.json()

    if (!email || !full_name || !role) {
      throw new Error('email, full_name, and role are required')
    }

    const validRoles = ['admin', 'manager', 'supervisor', 'accounts', 'operator']
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`)
    }

    // Use company_id from user_roles, or from request body (superadmin case), or first company
    let company_id = callerRole?.company_id || bodyCompanyId
    if (!company_id) {
      const { data: firstCompany } = await supabaseAdmin
        .from('companies').select('id').limit(1).single()
      company_id = firstCompany?.id
    }
    if (!company_id) throw new Error('Could not determine company')

    // ── Send invite email via Supabase Auth ───────────────────────────────────
    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name, role, company_id },
        redirectTo: `${Deno.env.get('APP_URL') || 'https://nhance-app.vercel.app'}/`,
      }
    )

    let newUserId = inviteData?.user?.id

    // If user already exists in Auth, look them up by listing users
    if (!newUserId) {
      const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      const existing = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (existing) {
        newUserId = existing.id
        console.log(`User already exists in auth — reusing: ${newUserId}`)
      } else if (inviteErr) {
        throw inviteErr
      }
    }

    if (!newUserId) throw new Error('Could not create or find user account')

    // ── Create user_profiles record ───────────────────────────────────────────
    const { error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: newUserId,
        company_id,
        full_name: full_name.trim(),
      }, { onConflict: 'id' })

    if (profileErr) throw profileErr

    // ── Create user_roles record ──────────────────────────────────────────────
    const { error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: newUserId,
        company_id,
        role,
      }, { onConflict: 'user_id,company_id' })

    if (roleErr) throw roleErr

    // ── Link to HR employee record if provided ────────────────────────────────
    if (employee_id) {
      await supabaseAdmin
        .from('hr_employees')
        .update({ user_id: newUserId })
        .eq('id', employee_id)
        .eq('company_id', company_id)
    }

    console.log(`✅ Invited ${email} as ${role} in company ${company_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invite sent to ${email}. They will receive an email to set their password.`,
        user_id: newUserId,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('invite-user error:', e)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
