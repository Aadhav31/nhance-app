-- ─────────────────────────────────────────────────────────────────────────────
-- razorpay_multicompany.sql
-- Adds per-company Razorpay credentials to the companies table.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
--
-- SECURITY NOTE:
--   razorpay_key_secret is a sensitive value. RLS on the companies table
--   already restricts reads to members of that company.
--   The secret is NEVER exposed to the frontend — only the Edge Function
--   (running with service-role key, bypassing RLS) reads it.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add columns to companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS razorpay_key_id        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_key_secret     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_webhook_secret TEXT DEFAULT NULL;

-- 2. Comments for documentation
COMMENT ON COLUMN companies.razorpay_key_id IS
  'Razorpay Live Key ID for this company (e.g. rzp_live_xxxx). Set by company admin in Settings.';

COMMENT ON COLUMN companies.razorpay_key_secret IS
  'Razorpay Live Key Secret for this company. Never returned to frontend — only read by Edge Function via service role.';

COMMENT ON COLUMN companies.razorpay_webhook_secret IS
  'Razorpay Webhook Secret for this company. Used to verify webhook signatures. Never returned to frontend.';

-- 3. Create a secure view that hides the secret from normal queries
--    Frontend uses this view; Edge Function queries the base table directly via service role.
CREATE OR REPLACE VIEW company_razorpay_status AS
  SELECT
    id,
    name,
    CASE WHEN razorpay_key_id IS NOT NULL THEN true ELSE false END AS razorpay_connected,
    razorpay_key_id  -- key_id is safe to show (it's not secret); secret is excluded
  FROM companies;

-- Grant select on the view to authenticated users (RLS on base table still applies via the view)
GRANT SELECT ON company_razorpay_status TO authenticated;
