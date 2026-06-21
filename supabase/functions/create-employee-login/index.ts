// supabase/functions/create-employee-login/index.ts
// Creates a Supabase auth user for an employee with a password set directly.
// No email invite sent — admin shares credentials via WhatsApp.
// Also creates user_profiles, user_roles, and links hr_employees.user_id.
// Deploy: supabase functions deploy create-employee-login

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
    const { email, full_name, role, employee_id, company_id, password } = await req.json()
    if (!email)      throw new Error('email is required')
    if (!role)       throw new Error('role is required')
    if (!company_id) throw new Error('company_id is required')
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters')

    const nhanceAdminEmail = Deno.env.get('NHANCE_ADMIN_EMAIL') || ''
    const isSuperAdmin = caller.email === nhanceAdminEmail

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Verify caller is admin/manager of the same company ──────────────────────
    if (!isSuperAdmin) {
      const { data: callerRole } = await admin
        .from('user_roles')
        .select('role, company_id')
        .eq('user_id', caller.id)
        .single()

      if (!callerRole || !['admin', 'manager'].includes(callerRole.role)) {
        throw new Error('Only admin or manager can create employee logins')
      }
      if (callerRole.company_id !== company_id) {
        throw new Error('Cannot create login for a different company')
      }
    }

    // ── Check if user already exists ────────────────────────────────────────────
    const { data: { users: existingUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = existingUsers?.find(u => u.email === email.toLowerCase())

    let userId: string

    if (existingUser) {
      // User exists — just update their password
      const { error: updateErr } = await admin.auth.admin.updateUserById(existingUser.id, { password })
      if (updateErr) throw updateErr
      userId = existingUser.id
    } else {
      // Create new auth user with password (no email confirmation required)
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: email.toLowerCase(),
        password,
        email_confirm: true, // skip email confirmation
      })
      if (createErr) throw createErr
      userId = newUser.user.id
    }

    // ── Upsert user_profiles ────────────────────────────────────────────────────
    const { error: profileErr } = await admin.from('user_profiles').upsert({
      id: userId,
      company_id,
      full_name: full_name || email.split('@')[0],
      email,
    }, { onConflict: 'id' })
    if (profileErr) console.error('user_profiles upsert error:', profileErr)

    // ── Upsert user_roles ───────────────────────────────────────────────────────
    const { error: roleErr } = await admin.from('user_roles').upsert({
      user_id: userId,
      company_id,
      role,
    }, { onConflict: 'user_id' })
    if (roleErr) console.error('user_roles upsert error:', roleErr)

    // ── Link employee record (optional) ────────────────────────────────────────
    if (employee_id) {
      const { error: empErr } = await admin
        .from('hr_employees')
        .update({ user_id: userId })
        .eq('id', employee_id)
      if (empErr) console.error('hr_employees link error:', empErr)
    }

    console.log(`✅ Employee login created: ${email} → user ${userId}`)

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('create-employee-login error:', e)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
