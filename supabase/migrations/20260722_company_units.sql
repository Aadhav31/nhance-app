-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: company_units — multi-unit / multi-facility architecture
--
-- A company can have many units (crusher plant, stockyard, quarry, etc.).
-- user_profiles.unit_id = NULL  → admin / accounts (sees ALL units)
-- user_profiles.unit_id = <id>  → restricted to that unit only
--
-- Equipment gets a home_unit_id (movable — daily_operations tracks which unit
-- it worked at on a given day via ops_unit_id).
--
-- After running: NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. company_units ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_units (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  unit_name    TEXT        NOT NULL,
  unit_code    TEXT,                        -- short code e.g. "U1", "SY"
  unit_type    TEXT        NOT NULL DEFAULT 'manufacturing'
                           CHECK (unit_type IN (
                             'manufacturing', 'stockyard', 'quarry',
                             'msand_plant', 'psand_plant', 'office', 'other'
                           )),
  location     TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_units_company
  ON company_units(company_id, sort_order);

CREATE OR REPLACE FUNCTION _set_company_units_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_company_units_updated_at ON company_units;
CREATE TRIGGER trg_company_units_updated_at
  BEFORE UPDATE ON company_units
  FOR EACH ROW EXECUTE FUNCTION _set_company_units_updated_at();

ALTER TABLE company_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members can manage company_units" ON company_units;
CREATE POLICY "company members can manage company_units"
  ON company_units FOR ALL
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- ── 2. companies — branding / letterhead fields ───────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_url          TEXT,
  ADD COLUMN IF NOT EXISTS tagline           TEXT,
  ADD COLUMN IF NOT EXISTS letterhead_color  TEXT DEFAULT '#1a5c2a',
  ADD COLUMN IF NOT EXISTS pdf_footer_text   TEXT,
  ADD COLUMN IF NOT EXISTS signature_name    TEXT,
  ADD COLUMN IF NOT EXISTS signature_title   TEXT,
  ADD COLUMN IF NOT EXISTS website           TEXT,
  ADD COLUMN IF NOT EXISTS bank_name         TEXT,
  ADD COLUMN IF NOT EXISTS bank_account      TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc         TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT;

-- ── 3. user_profiles — unit assignment ───────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- NULL = admin / accounts (all-unit access)
-- non-NULL = restricted to that unit

-- ── 4. equipment — home unit ──────────────────────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS home_unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- ── 5. Operational tables — unit_id (which unit the record belongs to) ────────
ALTER TABLE daily_operations
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

ALTER TABLE equipment_assignments
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- crusher_production (production tracker)
ALTER TABLE crusher_production
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- stock_transactions
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- field_expenses
ALTER TABLE field_expenses
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- expenses (purchase + manual)
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- bills
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- hr_attendance
ALTER TABLE hr_attendance
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES company_units(id) ON DELETE SET NULL;

-- ── 6. Performance indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_ops_unit
  ON daily_operations(unit_id) WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eq_assign_unit
  ON equipment_assignments(unit_id) WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bills_unit
  ON bills(unit_id) WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_unit
  ON expenses(unit_id) WHERE unit_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
