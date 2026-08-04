-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Data Quality — idle_reason + fuel_issues
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add idle_reason to daily_operations
ALTER TABLE daily_operations
  ADD COLUMN IF NOT EXISTS idle_reason TEXT
    CHECK (idle_reason IN (
      'no_work_available',
      'operator_absent',
      'waiting_for_material',
      'minor_repair',
      'weather',
      'other'
    ));

-- 2. Fuel Issues table — fuel issued FROM company stock TO machine
--    Separate from fuel_consumed (what operator reports as used).
--    Variance = issued - consumed  → positive means unaccounted fuel.
CREATE TABLE IF NOT EXISTS fuel_issues (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  issue_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  equipment_id     UUID        REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_name   TEXT,                        -- denormalised snapshot
  quantity_liters  NUMERIC(8,2) NOT NULL,
  fuel_source      TEXT        NOT NULL DEFAULT 'company_bowser'
                               CHECK (fuel_source IN (
                                 'company_bowser',
                                 'company_tank',
                                 'vendor_supply',
                                 'petrol_pump'
                               )),
  meter_at_issue   NUMERIC(12,2),               -- hour meter / odometer at time of issue
  issued_by        UUID        REFERENCES user_profiles(id),
  issued_by_name   TEXT,                        -- denormalised snapshot
  voucher_number   TEXT,                        -- physical fuel voucher / receipt ref
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fuel_issues_company_date
  ON fuel_issues(company_id, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_issues_equipment
  ON fuel_issues(equipment_id)
  WHERE equipment_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION _set_fuel_issues_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fuel_issues_updated_at ON fuel_issues;
CREATE TRIGGER trg_fuel_issues_updated_at
  BEFORE UPDATE ON fuel_issues
  FOR EACH ROW EXECUTE FUNCTION _set_fuel_issues_updated_at();

-- Row-level security
ALTER TABLE fuel_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members can manage fuel_issues" ON fuel_issues;
CREATE POLICY "company members can manage fuel_issues"
  ON fuel_issues FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
