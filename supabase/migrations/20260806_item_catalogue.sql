-- ══════════════════════════════════════════════════════════════════════════
-- item_catalogue — master catalog of spare parts, materials & services
-- Used as a pick-list when creating bills; avg_cost & max_cost act as
-- reference prices to prevent overpayment.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS item_catalogue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- ── Core identity ──────────────────────────────────────────────────────
  item_name           TEXT NOT NULL,
  brand               TEXT,
  part_number         TEXT,
  description         TEXT,              -- longer notes / spec

  -- ── Compatibility ──────────────────────────────────────────────────────
  -- Which equipment this part/service is meant for (can be NULL = universal)
  equipment_id        UUID REFERENCES equipment(id) ON DELETE SET NULL,
  -- Free-text override when equipment not in system (e.g. "All JCB 3DX variants")
  compatible_with     TEXT,

  -- ── Classification ─────────────────────────────────────────────────────
  category            TEXT DEFAULT 'spare_part',
  -- 'spare_part' | 'consumable' | 'service' | 'fuel' | 'lubricant' | 'tyre' | 'other'
  unit                TEXT DEFAULT 'nos',

  -- ── Reference pricing ──────────────────────────────────────────────────
  avg_cost            NUMERIC(12,2),     -- expected / average market price
  max_cost            NUMERIC(12,2),     -- hard ceiling — flag any bill above this
  hsn_sac             TEXT,              -- pre-filled HSN / SAC code
  gst_rate            NUMERIC(5,2),      -- pre-filled GST %

  -- ── Meta ───────────────────────────────────────────────────────────────
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast company + name search
CREATE INDEX IF NOT EXISTS idx_item_catalogue_company
  ON item_catalogue(company_id, is_active, item_name);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE item_catalogue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_item_catalogue" ON item_catalogue;
CREATE POLICY "company_members_item_catalogue"
ON item_catalogue FOR ALL
USING (
  company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
