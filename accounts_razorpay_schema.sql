-- accounts_razorpay_schema.sql
-- Add Razorpay payment link tracking to client_invoices
-- Run in Supabase SQL Editor AFTER accounts_schema.sql

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS payment_link_id  TEXT,        -- Razorpay payment link ID (plink_xxxx)
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT;        -- Short URL to share with client

-- Index for webhook lookups by payment_link_id
CREATE INDEX IF NOT EXISTS idx_invoices_payment_link
  ON client_invoices(payment_link_id)
  WHERE payment_link_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ── How this works ────────────────────────────────────────────────────────────
-- 1. Accounts user clicks "Generate Payment Link" on a sent invoice
-- 2. Nhance calls the create-payment-link Edge Function
-- 3. Edge Function calls Razorpay API → returns short URL (e.g. rzp.io/l/abc123)
-- 4. URL is saved to payment_link_url, shown in the invoice card
-- 5. User copies URL and sends to client via WhatsApp / email
-- 6. Client pays via UPI / net banking / card — no app needed
-- 7. Razorpay fires webhook → razorpay-webhook Edge Function
-- 8. Webhook auto-updates: invoice status = paid, ledger transaction created
-- 9. Everything reconciled without any manual entry
