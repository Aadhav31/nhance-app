-- Add all missing columns to inventory_items
-- Covers: brand, sub_category, description, hsn_code, min_stock_level,
--         reorder_qty, avg_unit_cost, unit, is_active, created_by, updated_at

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sub_category      TEXT,
  ADD COLUMN IF NOT EXISTS brand             TEXT,
  ADD COLUMN IF NOT EXISTS unit              TEXT NOT NULL DEFAULT 'nos',
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS hsn_code          TEXT,
  ADD COLUMN IF NOT EXISTS min_stock_level   NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_qty       NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_unit_cost     NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_by        UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(company_id, is_active);
