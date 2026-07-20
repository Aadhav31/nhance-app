-- ─────────────────────────────────────────────────────────────────────────────
-- Crusher Client Extended Profile
-- 1. Add fields to clients table (general — also used by SalesPage etc.)
-- 2. Extend crusher_client_settings (crusher-specific defaults + credit limit)
-- 3. Create crusher_client_rates (per-client grade rate overrides)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS contact_person       text,          -- person to call
  ADD COLUMN IF NOT EXISTS contact_phone2       text,          -- alternate / site phone
  ADD COLUMN IF NOT EXISTS pan                  text,          -- PAN for TDS / compliance
  ADD COLUMN IF NOT EXISTS client_category      text DEFAULT 'contractor',
                                                               -- contractor|builder|government|retail|wholesale
  ADD COLUMN IF NOT EXISTS opening_balance      numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_name            text,
  ADD COLUMN IF NOT EXISTS bank_account_number  text,
  ADD COLUMN IF NOT EXISTS bank_ifsc            text;

-- 2. Extend crusher_client_settings
ALTER TABLE crusher_client_settings
  ADD COLUMN IF NOT EXISTS default_grade_id  uuid REFERENCES crusher_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_limit      numeric(14,2);   -- max outstanding amount allowed

-- 3. Per-client material rate overrides
--    e.g. SRA Mining gets M-Sand at Rs 4.80 instead of standard Rs 5.00
CREATE TABLE IF NOT EXISTS crusher_client_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id)        ON DELETE CASCADE,
  grade_id    uuid NOT NULL REFERENCES crusher_grades(id) ON DELETE CASCADE,
  custom_rate numeric(14,2) NOT NULL,
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, client_id, grade_id)
);

CREATE INDEX IF NOT EXISTS idx_crusher_client_rates_lookup
  ON crusher_client_rates(company_id, client_id);

ALTER TABLE crusher_client_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_client_rates" ON crusher_client_rates;
CREATE POLICY "company_client_rates" ON crusher_client_rates
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );
