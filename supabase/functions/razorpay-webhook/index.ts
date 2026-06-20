// supabase/functions/razorpay-webhook/index.ts
// Receives Razorpay payment webhooks and auto-reconciles invoices in Nhance
// Deployed via: supabase functions deploy razorpay-webhook
//
// Set this URL in Razorpay Dashboard → Settings → Webhooks:
//   https://<your-project-ref>.supabase.co/functions/v1/razorpay-webhook
// Events to enable: payment_link.paid

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  // Razorpay sends POST only — reject anything else
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()

  // ── 1. Verify Razorpay webhook signature ─────────────────────────────────
  // This is critical — it proves the request genuinely came from Razorpay
  const receivedSig = req.headers.get('x-razorpay-signature') || ''
  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || ''

  try {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(webhookSecret)
    const msgData = encoder.encode(rawBody)

    const key = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    )
    const sigBuffer = await crypto.subtle.sign('HMAC', key, msgData)
    const expectedSig = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    if (expectedSig !== receivedSig) {
      console.error('Webhook signature mismatch — request rejected')
      return new Response('Invalid signature', { status: 401 })
    }
  } catch (sigErr) {
    console.error('Signature verification failed:', sigErr)
    return new Response('Signature error', { status: 400 })
  }

  // ── 2. Parse the event ────────────────────────────────────────────────────
  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  console.log('Razorpay webhook event:', event.event)

  // ── 3. Handle payment_link.paid ───────────────────────────────────────────
  // This fires when a client completes payment on a payment link
  if (event.event === 'payment_link.paid') {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // service role needed to bypass RLS
    )

    try {
      const pl      = event.payload.payment_link?.entity
      const payment = event.payload.payment?.entity

      if (!pl || !payment) {
        console.error('Missing payload entities')
        return new Response('OK', { status: 200 }) // return 200 so Razorpay stops retrying
      }

      const invoiceId  = pl.notes?.invoice_id
      const companyId  = pl.notes?.company_id
      const amountPaid = payment.amount / 100 // paise → rupees

      if (!invoiceId) {
        console.warn('No invoice_id in payment link notes — skipping')
        return new Response('OK', { status: 200 })
      }

      // Fetch current invoice state
      const { data: invoice, error: fetchErr } = await supabase
        .from('client_invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      if (fetchErr || !invoice) {
        console.error('Invoice not found:', invoiceId)
        return new Response('Invoice not found', { status: 200 }) // 200 so Razorpay doesn't retry
      }

      // Determine payment mode from Razorpay method
      const modeMap: Record<string, string> = {
        upi:        'upi',
        netbanking: 'bank',
        card:       'bank',
        wallet:     'bank',
        emi:        'bank',
        bank_transfer: 'bank',
      }
      const paymentMode = modeMap[payment.method] || 'bank'

      // Calculate new amounts
      const newPaid    = (invoice.paid_amount || 0) + amountPaid
      const newBalance = Math.max(0, invoice.total_amount - newPaid)
      const newStatus  = newBalance < 0.01 ? 'paid' : 'partial'

      // ── Update invoice ────────────────────────────────────────────────────
      const { error: invUpdateErr } = await supabase
        .from('client_invoices')
        .update({
          paid_amount: newPaid,
          balance_due: newBalance,
          status:      newStatus,
          updated_at:  new Date().toISOString(),
        })
        .eq('id', invoiceId)

      if (invUpdateErr) {
        console.error('Failed to update invoice:', invUpdateErr)
        return new Response('DB error', { status: 500 })
      }

      // ── Create ledger transaction ─────────────────────────────────────────
      const { data: txn, error: txnErr } = await supabase
        .from('account_transactions')
        .insert({
          company_id:     companyId,
          txn_date:       new Date().toISOString().split('T')[0],
          type:           'income',
          description:    `Payment received — ${invoice.invoice_number} (${invoice.client_name}) via Razorpay`,
          amount:         amountPaid,
          payment_mode:   paymentMode,
          bank_reference: payment.id,           // Razorpay payment ID (pay_xxxx)
          reference_type: 'invoice',
          reference_id:   invoiceId,
          notes:          `Razorpay Payment Link: ${pl.id} | Method: ${payment.method}`,
        })
        .select()
        .single()

      if (txnErr) console.error('Ledger transaction failed:', txnErr)

      // ── Create invoice_payment record ────────────────────────────────────
      await supabase.from('invoice_payments').insert({
        invoice_id:     invoiceId,
        company_id:     companyId,
        payment_date:   new Date().toISOString().split('T')[0],
        amount:         amountPaid,
        payment_mode:   paymentMode,
        bank_reference: payment.id,
        notes:          `Auto-recorded via Razorpay webhook. Method: ${payment.method}`,
        transaction_id: txn?.id || null,
      })

      console.log(`✅ Invoice ${invoice.invoice_number} updated — paid ${amountPaid}, status: ${newStatus}`)
    } catch (err) {
      console.error('Error processing payment_link.paid:', err)
      return new Response('Processing error', { status: 500 })
    }
  }

  // Return 200 for all events — Razorpay retries on non-2xx
  return new Response('OK', { status: 200 })
})
