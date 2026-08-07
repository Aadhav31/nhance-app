-- ══════════════════════════════════════════════════════════════════════════
-- item_catalogue_prices — zone / state-level pricing for catalogue items
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS item_catalogue_prices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_id  UUID NOT NULL REFERENCES item_catalogue(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  zone          TEXT NOT NULL,           -- e.g. "Tamil Nadu", "Karnataka", "North Zone"
  avg_cost      NUMERIC(12,2),
  max_cost      NUMERIC(12,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (catalogue_id, zone)
);

CREATE INDEX IF NOT EXISTS idx_cat_prices_catalogue ON item_catalogue_prices(catalogue_id);
CREATE INDEX IF NOT EXISTS idx_cat_prices_company   ON item_catalogue_prices(company_id, zone);

ALTER TABLE item_catalogue_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_item_catalogue_prices" ON item_catalogue_prices FOR ALL
USING  (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
