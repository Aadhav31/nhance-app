-- ─────────────────────────────────────────────────────────────────────────────
-- Client Delivery Sites — one client can have many delivery locations
-- Also: statement_type + statement_interval_days on crusher_client_settings
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Delivery sites per client
CREATE TABLE IF NOT EXISTS crusher_client_sites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  client_id   uuid        NOT NULL REFERENCES clients(id)    ON DELETE CASCADE,
  site_name   text        NOT NULL,          -- short label, e.g. "Kumbakonam Site"
  address     text,                          -- full delivery address
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crusher_client_sites
  ON crusher_client_sites(company_id, client_id, is_active);

ALTER TABLE crusher_client_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_client_sites" ON crusher_client_sites;
CREATE POLICY "company_client_sites" ON crusher_client_sites
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- 2. Statement billing settings on crusher_client_settings
--    statement_type: 'none' | 'monthly' | 'interval'
--    monthly        → use existing statement_day column (day 1-28)
--    interval       → statement_interval_days (e.g. 10, 15, 30)
ALTER TABLE crusher_client_settings
  ADD COLUMN IF NOT EXISTS statement_type          text NOT NULL DEFAULT 'monthly'
    CHECK (statement_type IN ('none','monthly','interval')),
  ADD COLUMN IF NOT EXISTS statement_interval_days int;  -- used when statement_type = 'interval'

-- 3. Drop default_loading_pt from client settings — this is not a per-client concept
-- (column retained for backward compat but UI will no longer expose it)
-- ALTER TABLE crusher_client_settings DROP COLUMN IF EXISTS default_loading_pt;
-- ↑ Keeping column; just stop using it in UI. Safe to drop later after data migration.
