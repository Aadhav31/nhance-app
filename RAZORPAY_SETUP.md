# Razorpay Integration Setup Guide

## Step 1 — Razorpay Business Account

1. Go to https://razorpay.com and sign up
2. Complete KYC — you'll need:
   - Company PAN
   - GST certificate
   - Bank account details (where payments will settle)
   - Director/owner Aadhaar + PAN
3. KYC approval takes 1–3 business days
4. Once approved, go to **Settings → API Keys → Generate Test Key** first (for testing)

## Step 2 — Get Your API Keys

From Razorpay Dashboard → Settings → API Keys:

- **Key ID**: starts with `rzp_test_` (test) or `rzp_live_` (live)
- **Key Secret**: shown once — copy and save it immediately

Also from Settings → Webhooks:
- Create a new webhook
- **Webhook Secret**: you create this (any random string, keep it safe)

## Step 3 — Enable Razorpay Payouts (for future vendor/salary payments)

Dashboard → Payouts → Get Started
- Add your company bank account as the source account
- Maintain a minimum balance (Razorpay holds float for payouts)
- This is separate from payment collection — enable when ready

## Step 4 — Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Verify
supabase --version
```

## Step 5 — Link Your Supabase Project

```bash
# In your nhance-app folder
cd /path/to/nhance-app

# Login
supabase login

# Find your project ref in Supabase Dashboard URL:
# https://supabase.com/dashboard/project/<project-ref>
supabase link --project-ref <your-project-ref>
```

## Step 6 — Set Secrets (API Keys)

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
supabase secrets set RAZORPAY_KEY_SECRET=your_key_secret_here
supabase secrets set RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

Verify secrets are set:
```bash
supabase secrets list
```

## Step 7 — Deploy Edge Functions

```bash
# Deploy both functions
supabase functions deploy create-payment-link
supabase functions deploy razorpay-webhook

# Verify deployment
supabase functions list
```

Your webhook URL will be:
```
https://<your-project-ref>.supabase.co/functions/v1/razorpay-webhook
```

## Step 8 — Configure Webhook in Razorpay Dashboard

1. Dashboard → Settings → Webhooks → Add New Webhook
2. **Webhook URL**: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`
3. **Secret**: same as RAZORPAY_WEBHOOK_SECRET you set above
4. **Active Events** — enable only:
   - ✅ `payment_link.paid`
5. Save

## Step 9 — Run the Schema Migration

In Supabase SQL Editor, run `accounts_razorpay_schema.sql` — adds payment_link_id and payment_link_url columns to client_invoices.

## Step 10 — Test End to End

1. In Nhance Accounts → Invoices, create a test invoice for ₹1
2. Mark it as "Sent"
3. Click "Generate Razorpay Payment Link"
4. Copy the link — open it in browser
5. Use Razorpay test card: `4111 1111 1111 1111`, any future date, any CVV
6. Complete payment
7. Check Nhance — invoice should auto-update to "Paid" within seconds
8. Check Ledger tab — transaction should appear automatically

## Go Live

1. Switch from test keys to live keys:
   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxx
   supabase secrets set RAZORPAY_KEY_SECRET=your_live_secret
   ```
2. Redeploy functions:
   ```bash
   supabase functions deploy create-payment-link
   supabase functions deploy razorpay-webhook
   ```
3. Update webhook URL in Razorpay to use live mode

## Settlement Timeline

- UPI / Net Banking / Card: Settlement in T+2 days into your bank
- Razorpay fee: ~2% per transaction (check your plan)
- Check settlement in Razorpay Dashboard → Settlements

## If Something Goes Wrong

- Payment link created but webhook not firing → check webhook URL in Razorpay dashboard
- Invoice not updating → check Supabase Edge Function logs:
  ```bash
  supabase functions logs razorpay-webhook
  ```
- "Razorpay credentials not configured" → re-run `supabase secrets set` and redeploy
