// supabase/functions/create-payment-link/index.ts
// Generates a Razorpay Payment Link for a Nhance invoice
// Deployed via: supabase functions deploy create-payment-link

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const { invoice_id } = await req.json()
    if (!invoice_id) throw new Error('invoice_id is required')

    // ── Supabase client (service role — bypasses RLS for webhook updates) ────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Fetch invoice ─────────────────────────────────────────────────────────
    const { data: invoice, error: invErr } = await supabase
      .from('client_invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invErr || !invoice) throw new Error('Invoice not found')
    if (invoice.balance_due <= 0.01) throw new Error('Invoice is already fully paid')
    if (invoice.payment_link_url) {
      // Already has a link — return it directly (idempotent)
      return new Response(
        JSON.stringify({ success: true, payment_link_url: invoice.payment_link_url, reused: true }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Razorpay credentials ──────────────────────────────────────────────────
    const keyId     = Deno.env.get('RAZORPAY_KEY_ID')
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!keyId || !keySecret) throw new Error('Razorpay credentials not configured')
    const auth = btoa(`${keyId}:${keySecret}`)

    // ── Create Payment Link via Razorpay API ─────────────────────────────────
    const amountPaise = Math.round(invoice.balance_due * 100) // must be in paise

    const payload = {
      amount: amountPaise,
      currency: 'INR',
      accept_partial: false,
      description: `${invoice.invoice_number}${invoice.project_name ? ' — ' + invoice.project_name : ''}`,
      customer: {
        name: invoice.client_name,
      },
      notify: {
        sms: false,   // set true if you want Razorpay to SMS the client directly
        email: false, // set true if client email is stored
      },
      reminder_enable: true,
      notes: {
        // These notes come back in the webhook — used to identify the invoice
        invoice_id:     invoice.id,
        invoice_number: invoice.invoice_number,
        company_id:     invoice.company_id,
      },
      // Optional: auto-expire link after 30 days
      expire_by: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
    }

    const rzpRes = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const rzpData = await rzpRes.json()

    if (!rzpRes.ok) {
      throw new Error(rzpData.error?.description || `Razorpay error: ${rzpRes.status}`)
    }

    // ── Save payment link back to invoice ─────────────────────────────────────
    const { error: updateErr } = await supabase
      .from('client_invoices')
      .update({
        payment_link_id:  rzpData.id,
        payment_link_url: rzpData.short_url,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', invoice_id)

    if (updateErr) throw updateErr

    return new Response(
      JSON.stringify({
        success:          true,
        payment_link_url: rzpData.short_url,
        payment_link_id:  rzpData.id,
        amount:           invoice.balance_due,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('create-payment-link error:', e)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
