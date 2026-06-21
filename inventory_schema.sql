-- ═══════════════════════════════════════════════════════════════════
-- INVENTORY MODULE SCHEMA
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── Stores / Locations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  store_name    TEXT NOT NULL,
  store_code    TEXT,
  location      TEXT,
  in_charge     TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_company ON stores(company_id);
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stores_all" ON stores;
CREATE POLICY "stores_all" ON stores FOR ALL TO authenticated USING (true);

-- ── Item Master Catalog ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  item_code       TEXT,
  item_name       TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'raw_material'
    CHECK (category IN ('raw_material','spare_part','lubricant','tool','finished_good','consumable')),
  sub_category    TEXT,
  brand           TEXT,
  unit            TEXT DEFAULT 'nos',
  description     TEXT,
  hsn_code        TEXT,
  min_stock_level NUMERIC(10,3) DEFAULT 0,
  reorder_qty     NUMERIC(10,3) DEFAULT 0,
  avg_unit_cost   NUMERIC(12,2) DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_items_company  ON inventory_items(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_category ON inventory_items(company_id, category);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_items_all" ON inventory_items;
CREATE POLICY "inv_items_all" ON inventory_items FOR ALL TO authenticated USING (true);

-- ── Stock Balances (per item per store) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_stock (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  item_id          UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  store_id         UUID REFERENCES stores(id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(10,3) DEFAULT 0,
  avg_unit_cost    NUMERIC(12,2) DEFAULT 0,
  last_updated     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_stock_company ON inventory_stock(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_item    ON inventory_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_store   ON inventory_stock(store_id);
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_stock_all" ON inventory_stock;
CREATE POLICY "inv_stock_all" ON inventory_stock FOR ALL TO authenticated USING (true);

-- ── Stock Transactions (all movements) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  txn_number   TEXT NOT NULL,
  txn_type     TEXT NOT NULL
    CHECK (txn_type IN ('in','out','transfer','adjustment')),
  txn_date     DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Item & location
  item_id      UUID REFERENCES inventory_items(id),
  store_id     UUID REFERENCES stores(id),     -- source store
  to_store_id  UUID REFERENCES stores(id),     -- destination (transfers only)

  -- Quantity & cost
  quantity     NUMERIC(10,3) NOT NULL,
  unit_cost    NUMERIC(12,2) DEFAULT 0,
  total_cost   NUMERIC(12,2) DEFAULT 0,

  -- Links to other modules
  project_id   UUID,   -- link to projects
  equipment_id UUID,   -- link to equipment
  vendor_id    UUID REFERENCES vendors(id) ON DELETE SET NULL,
  po_id        UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,

  -- Context
  issued_to    TEXT,   -- person receiving stock out
  reason       TEXT,   -- for adjustments
  notes        TEXT,

  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stxn_company  ON stock_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_stxn_item     ON stock_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_stxn_store    ON stock_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_stxn_date     ON stock_transactions(txn_date DESC);
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stxn_all" ON stock_transactions;
CREATE POLICY "stxn_all" ON stock_transactions FOR ALL TO authenticated USING (true);

-- ── Trigger: maintain inventory_stock on every transaction ────────────────────
CREATE OR REPLACE FUNCTION fn_update_inventory_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.txn_type = 'in' THEN
    -- Add to store; recalculate weighted avg cost
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand, avg_unit_cost, last_updated)
    VALUES (NEW.company_id, NEW.item_id, NEW.store_id, NEW.quantity, NEW.unit_cost, now())
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      avg_unit_cost = CASE
        WHEN (inventory_stock.quantity_on_hand + NEW.quantity) = 0 THEN 0
        ELSE ROUND(
          (inventory_stock.avg_unit_cost * inventory_stock.quantity_on_hand + NEW.total_cost)
          / (inventory_stock.quantity_on_hand + NEW.quantity), 2)
      END,
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.quantity,
      last_updated = now();

    -- Also update avg_unit_cost on item master
    UPDATE inventory_items SET
      avg_unit_cost = (
        SELECT COALESCE(SUM(avg_unit_cost * quantity_on_hand) / NULLIF(SUM(quantity_on_hand),0), 0)
        FROM inventory_stock WHERE item_id = NEW.item_id
      ),
      updated_at = now()
    WHERE id = NEW.item_id;

  ELSIF NEW.txn_type = 'out' THEN
    UPDATE inventory_stock SET
      quantity_on_hand = GREATEST(0, quantity_on_hand - NEW.quantity),
      last_updated = now()
    WHERE item_id = NEW.item_id AND store_id = NEW.store_id;

  ELSIF NEW.txn_type = 'transfer' THEN
    -- Deduct from source
    UPDATE inventory_stock SET
      quantity_on_hand = GREATEST(0, quantity_on_hand - NEW.quantity),
      last_updated = now()
    WHERE item_id = NEW.item_id AND store_id = NEW.store_id;
    -- Add to destination
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand, avg_unit_cost, last_updated)
    VALUES (NEW.company_id, NEW.item_id, NEW.to_store_id, NEW.quantity,
      COALESCE((SELECT avg_unit_cost FROM inventory_stock WHERE item_id = NEW.item_id AND store_id = NEW.store_id), 0),
      now())
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.quantity,
      last_updated = now();

  ELSIF NEW.txn_type = 'adjustment' THEN
    -- quantity here is the delta (+/-)
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand, last_updated)
    VALUES (NEW.company_id, NEW.item_id, NEW.store_id, GREATEST(0, NEW.quantity), now())
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = GREATEST(0, inventory_stock.quantity_on_hand + NEW.quantity),
      last_updated = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_inventory_stock ON stock_transactions;
CREATE TRIGGER trg_update_inventory_stock
  AFTER INSERT ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_inventory_stock();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
