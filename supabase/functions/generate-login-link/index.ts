// supabase/functions/generate-login-link/index.ts
// Generates a magic login link AND emails it via Resend.
// Superadmin can also copy the link to share via WhatsApp/SMS.
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

    // ── Parse body ─────────────────────────────────────────────────────────────
    const { email, full_name } = await req.json()
    if (!email) throw new Error('email is required')

    const appUrl = Deno.env.get('APP_URL') || 'https://nhance-app.vercel.app'

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Generate magic link ────────────────────────────────────────────────────
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${appUrl}/` },
    })

    if (error) throw error
    if (!data?.properties?.action_link) throw new Error('Failed to generate link')

    const link = data.properties.action_link

    // ── Send via Resend email API ──────────────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY')
    let emailSent = false

    if (resendKey) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Nhance <onboarding@resend.dev>',
          to: [email],
          subject: 'Your Nhance Login Link',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;color:#f1f5f9;border-radius:12px;">
              <h1 style="font-size:28px;font-weight:900;margin:0 0 4px;color:#60a5fa;">NHANCE</h1>
              <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 32px;">Fleet & Operations Suite</p>
              <p style="color:#cbd5e1;font-size:16px;margin:0 0 8px;">Hi ${full_name || 'there'},</p>
              <p style="color:#94a3b8;font-size:14px;margin:0 0 28px;">
                Click the button below to sign in to Nhance. This link is valid for <strong style="color:#f1f5f9;">1 hour</strong> and can only be used once. No password needed.
              </p>
              <a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
                Sign in to Nhance →
              </a>
              <p style="color:#475569;font-size:12px;margin:28px 0 0;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          `,
        }),
      })
      emailSent = emailRes.ok
      if (!emailRes.ok) {
        const errText = await emailRes.text()
        console.error('Resend email failed:', errText)
      }
    }

    console.log(`✅ Login link generated for ${email} — email sent: ${emailSent}`)

    return new Response(
      JSON.stringify({ success: true, link, email, email_sent: emailSent }),
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
