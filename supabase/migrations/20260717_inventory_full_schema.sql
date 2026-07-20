-- ============================================================
-- INVENTORY MODULE — FULL SCHEMA FIX
-- Fixes column name mismatches in inventory_items and creates
-- the three missing tables: stores, inventory_stock, stock_transactions
-- ============================================================

-- ── 1. Fix inventory_items column renames ────────────────────────────────────

-- name → item_name
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_items' AND column_name='name'
  ) THEN
    ALTER TABLE inventory_items RENAME COLUMN name TO item_name;
  END IF;
END $$;

-- minimum_stock → min_stock_level
-- (a new empty min_stock_level may already exist from a previous migration — copy + drop old)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_items' AND column_name='minimum_stock'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='inventory_items' AND column_name='min_stock_level'
    ) THEN
      -- Copy data from old column into the new one, then drop old
      UPDATE inventory_items
        SET min_stock_level = minimum_stock
        WHERE minimum_stock IS NOT NULL AND (min_stock_level IS NULL OR min_stock_level = 0);
      ALTER TABLE inventory_items DROP COLUMN minimum_stock;
    ELSE
      ALTER TABLE inventory_items RENAME COLUMN minimum_stock TO min_stock_level;
    END IF;
  END IF;
END $$;

-- unit_cost → avg_unit_cost  (same pattern)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_items' AND column_name='unit_cost'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='inventory_items' AND column_name='avg_unit_cost'
    ) THEN
      UPDATE inventory_items
        SET avg_unit_cost = unit_cost
        WHERE unit_cost IS NOT NULL AND (avg_unit_cost IS NULL OR avg_unit_cost = 0);
      ALTER TABLE inventory_items DROP COLUMN unit_cost;
    ELSE
      ALTER TABLE inventory_items RENAME COLUMN unit_cost TO avg_unit_cost;
    END IF;
  END IF;
END $$;

-- Ensure all other columns used by the code exist
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sub_category   TEXT,
  ADD COLUMN IF NOT EXISTS brand          TEXT,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS hsn_code       TEXT,
  ADD COLUMN IF NOT EXISTS min_stock_level  NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_qty    NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_unit_cost  NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT now();

-- ── 2. Create stores table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_name  TEXT NOT NULL,
  store_code  TEXT,
  location    TEXT,
  in_charge   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_company ON stores(company_id);

-- ── 3. Create inventory_stock table ─────────────────────────────────────────
-- Tracks current qty on hand per item+store pair.
-- Updated automatically by the trigger below.

CREATE TABLE IF NOT EXISTS inventory_stock (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id          UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(14,4) NOT NULL DEFAULT 0,
  avg_unit_cost    NUMERIC(14,4) DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_stock_company  ON inventory_stock(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_item     ON inventory_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_store    ON inventory_stock(store_id);

-- ── 4. Create stock_transactions table ──────────────────────────────────────
-- Records every stock movement: in / out / transfer / adjustment.

CREATE TABLE IF NOT EXISTS stock_transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  txn_number   TEXT NOT NULL,
  txn_type     TEXT NOT NULL CHECK (txn_type IN ('in','out','transfer','adjustment')),
  txn_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  item_id      UUID NOT NULL REFERENCES inventory_items(id),
  store_id     UUID NOT NULL REFERENCES stores(id),
  to_store_id  UUID REFERENCES stores(id),       -- destination for transfers
  quantity     NUMERIC(14,4) NOT NULL,
  unit_cost    NUMERIC(14,4),
  total_cost   NUMERIC(14,4),
  vendor_id    UUID REFERENCES vendors(id),
  po_id        UUID,
  project_id   UUID,
  equipment_id UUID REFERENCES equipment(id),
  issued_to    TEXT,
  reason       TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stxn_company  ON stock_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_stxn_item     ON stock_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_stxn_type     ON stock_transactions(txn_type);
CREATE INDEX IF NOT EXISTS idx_stxn_date     ON stock_transactions(txn_date DESC);

-- ── 5. Trigger: auto-update inventory_stock on each transaction ──────────────

CREATE OR REPLACE FUNCTION fn_update_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.txn_type = 'in' THEN
    -- Weighted average cost recalc on receipt
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand, avg_unit_cost)
    VALUES (
      NEW.company_id, NEW.item_id, NEW.store_id,
      NEW.quantity,
      COALESCE(NEW.unit_cost, 0)
    )
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      avg_unit_cost    = CASE
                           WHEN NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0 AND (inventory_stock.quantity_on_hand + NEW.quantity) > 0
                           THEN (inventory_stock.quantity_on_hand * inventory_stock.avg_unit_cost + NEW.quantity * NEW.unit_cost)
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
    -- quantity can be negative (write-down) or positive (write-up)
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand)
    VALUES (NEW.company_id, NEW.item_id, NEW.store_id, NEW.quantity)
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.quantity,
      updated_at       = now();

  ELSIF NEW.txn_type = 'transfer' THEN
    -- Deduct from source store
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand)
    VALUES (NEW.company_id, NEW.item_id, NEW.store_id, -NEW.quantity)
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand - NEW.quantity,
      updated_at       = now();
    -- Add to destination store
    INSERT INTO inventory_stock (company_id, item_id, store_id, quantity_on_hand)
    VALUES (NEW.company_id, NEW.item_id, NEW.to_store_id, NEW.quantity)
    ON CONFLICT (item_id, store_id) DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.quantity,
      updated_at       = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_inventory_stock ON stock_transactions;
CREATE TRIGGER trg_update_inventory_stock
  AFTER INSERT ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_inventory_stock();
