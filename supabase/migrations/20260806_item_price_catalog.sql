-- ══════════════════════════════════════════════════════════════════════════
-- item_price_catalog — learns average purchase price per item from bill history
-- + allows admin to set a manual benchmark price
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS item_price_catalog (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Normalized description (always stored as TRIM(LOWER(original)))
  description         TEXT NOT NULL,
  unit                TEXT,
  category            TEXT, -- 'material' | 'service' | 'fuel' | 'labour' | 'equipment' etc.

  -- ── Auto-learned from bill history ──
  avg_purchase_price  NUMERIC(12,2),
  min_purchase_price  NUMERIC(12,2),
  max_purchase_price  NUMERIC(12,2),
  last_purchase_price NUMERIC(12,2),
  purchase_count      INTEGER NOT NULL DEFAULT 0,
  last_purchased_at   TIMESTAMPTZ,

  -- ── Admin-set benchmark ──
  benchmark_price     NUMERIC(12,2),           -- manually entered industry reference
  benchmark_set_by    UUID REFERENCES auth.users(id),
  benchmark_set_at    TIMESTAMPTZ,

  -- Overpay threshold (% above reference price that triggers the warning/gate)
  overpay_threshold   NUMERIC(5,2) NOT NULL DEFAULT 20,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(company_id, description)
);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE item_price_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_price_catalog" ON item_price_catalog;
CREATE POLICY "company_members_price_catalog"
ON item_price_catalog FOR ALL
USING (
  company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
);

-- ── Trigger: auto-update catalog whenever a bill_line_item is inserted ────
CREATE OR REPLACE FUNCTION fn_update_price_catalog()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id UUID;
  v_rate       NUMERIC(12,2);
  v_desc       TEXT;
BEGIN
  -- Resolve company from the parent bill
  SELECT company_id INTO v_company_id FROM bills WHERE id = NEW.bill_id;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  v_rate := NEW.rate;
  v_desc := TRIM(LOWER(COALESCE(NEW.description, '')));

  -- Skip zero/null rates or empty descriptions
  IF v_rate IS NULL OR v_rate <= 0 OR v_desc = '' THEN RETURN NEW; END IF;

  INSERT INTO item_price_catalog (
    company_id, description, unit,
    avg_purchase_price, min_purchase_price, max_purchase_price,
    last_purchase_price, purchase_count, last_purchased_at
  )
  VALUES (
    v_company_id, v_desc, NEW.unit,
    v_rate, v_rate, v_rate,
    v_rate, 1, NOW()
  )
  ON CONFLICT (company_id, description) DO UPDATE SET
    -- Rolling average: new_avg = (old_avg * old_count + new_rate) / (old_count + 1)
    avg_purchase_price  = ROUND(
      (item_price_catalog.avg_purchase_price * item_price_catalog.purchase_count + EXCLUDED.avg_purchase_price)
      / (item_price_catalog.purchase_count + 1),
      2
    ),
    min_purchase_price  = LEAST(item_price_catalog.min_purchase_price, EXCLUDED.min_purchase_price),
    max_purchase_price  = GREATEST(item_price_catalog.max_purchase_price, EXCLUDED.max_purchase_price),
    last_purchase_price = EXCLUDED.last_purchase_price,
    purchase_count      = item_price_catalog.purchase_count + 1,
    last_purchased_at   = NOW(),
    -- Keep existing unit if already set; otherwise fill from new row
    unit                = COALESCE(item_price_catalog.unit, EXCLUDED.unit),
    updated_at          = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_price_catalog ON bill_line_items;
CREATE TRIGGER trg_update_price_catalog
AFTER INSERT ON bill_line_items
FOR EACH ROW EXECUTE FUNCTION fn_update_price_catalog();

-- ── Seed: build catalog from ALL existing bill_line_items ─────────────────
-- (future inserts will be handled by the trigger above)
INSERT INTO item_price_catalog (
  company_id, description, unit,
  avg_purchase_price, min_purchase_price, max_purchase_price,
  last_purchase_price, purchase_count, last_purchased_at
)
SELECT
  b.company_id,
  TRIM(LOWER(li.description))                          AS description,
  MAX(li.unit)                                         AS unit,
  ROUND(AVG(li.rate), 2)                               AS avg_purchase_price,
  MIN(li.rate)                                         AS min_purchase_price,
  MAX(li.rate)                                         AS max_purchase_price,
  (ARRAY_AGG(li.rate ORDER BY b.bill_date DESC))[1]   AS last_purchase_price,
  COUNT(*)::INTEGER                                    AS purchase_count,
  MAX(b.bill_date::TIMESTAMPTZ)                        AS last_purchased_at
FROM bill_line_items li
JOIN bills b ON b.id = li.bill_id
WHERE
  li.rate IS NOT NULL AND li.rate > 0
  AND li.description IS NOT NULL
  AND TRIM(li.description) <> ''
GROUP BY b.company_id, TRIM(LOWER(li.description))
ON CONFLICT (company_id, description) DO NOTHING;

NOTIFY pgrst, 'reload schema';
