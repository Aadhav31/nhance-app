-- ============================================================
-- INVENTORY PATCH — fixes inventory_stock + RLS + trigger
-- Run after 20260717_inventory_full_schema.sql
-- ============================================================

-- ── 1. Fix inventory_stock — add any columns that may be missing ──────────────
-- (CREATE TABLE IF NOT EXISTS skips recreation if partial table already exists)

ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quantity_on_hand NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_unit_cost    NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

-- Ensure the unique constraint exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='inventory_stock' AND constraint_type='UNIQUE'
      AND constraint_name='inventory_stock_item_id_store_id_key'
  ) THEN
    ALTER TABLE inventory_stock ADD CONSTRAINT inventory_stock_item_id_store_id_key UNIQUE (item_id, store_id);
  END IF;
END $$;

-- ── 2. RLS for stores, inventory_stock, stock_transactions ───────────────────

ALTER TABLE stores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist (safe to re-run)
DROP POLICY IF EXISTS tenant_isolation_stores             ON stores;
DROP POLICY IF EXISTS tenant_isolation_inventory_stock    ON inventory_stock;
DROP POLICY IF EXISTS tenant_isolation_stock_transactions ON stock_transactions;

CREATE POLICY tenant_isolation_stores
  ON stores FOR ALL TO authenticated
  USING (company_id = auth_company_id());

CREATE POLICY tenant_isolation_inventory_stock
  ON inventory_stock FOR ALL TO authenticated
  USING (company_id = auth_company_id());

CREATE POLICY tenant_isolation_stock_transactions
  ON stock_transactions FOR ALL TO authenticated
  USING (company_id = auth_company_id());

-- ── 3. Rebuild trigger as SECURITY DEFINER ───────────────────────────────────
-- Must run as superuser context so it can write to inventory_stock
-- even though authenticated users trigger it via stock_transactions INSERT.

CREATE OR REPLACE FUNCTION fn_update_inventory_stock()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.txn_type = 'in' THEN
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand, avg_unit_cost)
    VALUES (
      NEW.company_id, NEW.item_id, NEW.store_id,
      NEW.quantity,
      COALESCE(NEW.unit_cost, 0)
    )
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      avg_unit_cost    = CASE
                           WHEN NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0
                                AND (inventory_stock.quantity_on_hand + NEW.quantity) > 0
                           THEN (inventory_stock.quantity_on_hand * inventory_stock.avg_unit_cost
                                 + NEW.quantity * NEW.unit_cost)
                                / (inventory_stock.quantity_on_hand + NEW.quantity)
                           ELSE inventory_stock.avg_unit_cost
                         END,
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.quantity,
      updated_at       = now();

  ELSIF NEW.txn_type = 'out' THEN
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand)
    VALUES (NEW.company_id, NEW.item_id, NEW.store_id, -NEW.quantity)
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand - NEW.quantity,
      updated_at       = now();

  ELSIF NEW.txn_type = 'adjustment' THEN
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand)
    VALUES (NEW.company_id, NEW.item_id, NEW.store_id, NEW.quantity)
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.quantity,
      updated_at       = now();

  ELSIF NEW.txn_type = 'transfer' AND NEW.to_store_id IS NOT NULL THEN
    -- Deduct from source
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand)
    VALUES (NEW.company_id, NEW.item_id, NEW.store_id, -NEW.quantity)
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand - NEW.quantity,
      updated_at       = now();
    -- Add to destination
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand)
    VALUES (NEW.company_id, NEW.item_id, NEW.to_store_id, NEW.quantity)
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.quantity,
      updated_at       = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_update_inventory_stock ON stock_transactions;
CREATE TRIGGER trg_update_inventory_stock
  AFTER INSERT ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_inventory_stock();
