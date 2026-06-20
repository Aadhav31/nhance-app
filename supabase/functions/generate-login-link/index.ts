// supabase/functions/generate-login-link/index.ts
// Generates a magic login link for a user so superadmin can share it directly
// (bypasses email delivery — superadmin copies link and sends via WhatsApp/SMS)
// Deploy: supabase functions deploy generate-login-link

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
    if (caller.email !== nhanceAdminEmail) throw new Error('Only Nhance superadmin can generate login links')

    const { email } = await req.json()
    if (!email) throw new Error('email is required')

    const appUrl = Deno.env.get('APP_URL') || 'https://nhance-app.vercel.app'

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Generate a magic link — user clicks it and is logged in directly, no password needed
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${appUrl}/`,
      },
    })

    if (error) throw error
    if (!data?.properties?.action_link) throw new Error('Failed to generate link')

    console.log(`✅ Generated login link for ${email} by ${caller.email}`)

    return new Response(
      JSON.stringify({
        success: true,
        link: data.properties.action_link,
        email,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('generate-login-link error:', e)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
