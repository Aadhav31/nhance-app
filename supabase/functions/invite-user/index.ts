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

    if (!callerRole || !['admin', 'manager'].includes(callerRole.role)) {
      throw new Error('Only admins and managers can invite users')
    }

    // ── Parse request ─────────────────────────────────────────────────────────
    const { email, full_name, role, employee_id } = await req.json()

    if (!email || !full_name || !role) {
      throw new Error('email, full_name, and role are required')
    }

    const validRoles = ['admin', 'manager', 'supervisor', 'accounts', 'operator']
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`)
    }

    const company_id = callerRole.company_id

    // ── Send invite email via Supabase Auth ───────────────────────────────────
    // This sends an email with a magic link — employee clicks and sets their password
    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name, role, company_id },
        redirectTo: `${Deno.env.get('APP_URL') || 'https://nhance-app.vercel.app'}/`,
      }
    )

    if (inviteErr) {
      // If user already exists in auth, still try to create profile/role
      if (!inviteErr.message.includes('already been registered')) {
        throw inviteErr
      }
    }

    const newUserId = inviteData?.user?.id

    if (!newUserId) {
      // User already exists in auth — check if profile exists
      const { data: existingProfile } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('id', caller.id) // won't match, just checking pattern
        .single()

      throw new Error('User with this email already has a login. Link them manually from HR.')
    }

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
