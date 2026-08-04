-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Fuel Register Enhancement
--   1. fuel_tanks  — company fuel storage points (bowsers, fixed tanks)
--   2. fuel_issues — add traceability columns
--   3. Trigger     — auto-deduct tank stock on fuel issue
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Fuel Tanks — company-owned fuel storage
CREATE TABLE IF NOT EXISTS fuel_tanks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,               -- e.g. "Main Bowser", "Site A Tank"
  tank_type        TEXT        NOT NULL DEFAULT 'bowser'
                               CHECK (tank_type IN ('bowser', 'fixed_tank', 'drum')),
  location         TEXT,                               -- site / yard name
  capacity_liters  NUMERIC(10,2),                      -- max capacity
  current_stock    NUMERIC(10,2) NOT NULL DEFAULT 0,   -- live running stock
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_tanks_company
  ON fuel_tanks(company_id);

ALTER TABLE fuel_tanks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company members can manage fuel_tanks" ON fuel_tanks;
CREATE POLICY "company members can manage fuel_tanks"
  ON fuel_tanks FOR ALL
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- auto updated_at
CREATE OR REPLACE FUNCTION _set_fuel_tanks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_fuel_tanks_updated_at ON fuel_tanks;
CREATE TRIGGER trg_fuel_tanks_updated_at
  BEFORE UPDATE ON fuel_tanks
  FOR EACH ROW EXECUTE FUNCTION _set_fuel_tanks_updated_at();

-- 2. Add traceability columns to fuel_issues
ALTER TABLE fuel_issues
  ADD COLUMN IF NOT EXISTS tank_id             UUID REFERENCES fuel_tanks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tank_name           TEXT,
  ADD COLUMN IF NOT EXISTS vendor_id           UUID REFERENCES vendors(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_name         TEXT,
  ADD COLUMN IF NOT EXISTS purchase_order_id   UUID,   -- soft ref — no FK to avoid circular deps
  ADD COLUMN IF NOT EXISTS po_number           TEXT,
  ADD COLUMN IF NOT EXISTS delivered_by        TEXT,   -- delivery driver / person name
  ADD COLUMN IF NOT EXISTS incharge_id         UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS incharge_name       TEXT;   -- company incharge who authorised

-- 3. Trigger: deduct from fuel_tanks.current_stock when a fuel issue is inserted
CREATE OR REPLACE FUNCTION _deduct_fuel_tank_on_issue()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tank_id IS NOT NULL THEN
    UPDATE fuel_tanks
       SET current_stock = GREATEST(0, current_stock - NEW.quantity_liters)
     WHERE id = NEW.tank_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduct_tank_on_issue ON fuel_issues;
CREATE TRIGGER trg_deduct_tank_on_issue
  AFTER INSERT ON fuel_issues
  FOR EACH ROW EXECUTE FUNCTION _deduct_fuel_tank_on_issue();

-- Trigger: restore stock when a fuel issue is deleted
CREATE OR REPLACE FUNCTION _restore_fuel_tank_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tank_id IS NOT NULL THEN
    UPDATE fuel_tanks
       SET current_stock = current_stock + OLD.quantity_liters
     WHERE id = OLD.tank_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_tank_on_delete ON fuel_issues;
CREATE TRIGGER trg_restore_tank_on_delete
  AFTER DELETE ON fuel_issues
  FOR EACH ROW EXECUTE FUNCTION _restore_fuel_tank_on_delete();

-- 4. fuel_tank_replenishments — track when stock is added to a tank
CREATE TABLE IF NOT EXISTS fuel_tank_replenishments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tank_id          UUID        NOT NULL REFERENCES fuel_tanks(id) ON DELETE CASCADE,
  replenish_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  quantity_liters  NUMERIC(10,2) NOT NULL,
  vendor_id        UUID        REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name      TEXT,
  invoice_ref      TEXT,
  rate_per_liter   NUMERIC(8,2),
  total_amount     NUMERIC(12,2),
  received_by      UUID        REFERENCES user_profiles(id),
  received_by_name TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fuel_tank_replenishments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company members can manage fuel_tank_replenishments" ON fuel_tank_replenishments;
CREATE POLICY "company members can manage fuel_tank_replenishments"
  ON fuel_tank_replenishments FOR ALL
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- Trigger: add to tank stock when replenishment is inserted
CREATE OR REPLACE FUNCTION _add_fuel_tank_on_replenish()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE fuel_tanks
     SET current_stock = current_stock + NEW.quantity_liters
   WHERE id = NEW.tank_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_tank_on_replenish ON fuel_tank_replenishments;
CREATE TRIGGER trg_add_tank_on_replenish
  AFTER INSERT ON fuel_tank_replenishments
  FOR EACH ROW EXECUTE FUNCTION _add_fuel_tank_on_replenish();

NOTIFY pgrst, 'reload schema';
