-- Add avg_unit_cost column to inventory_items
-- Used by Inventory catalog form and stock valuation queries

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS avg_unit_cost NUMERIC(14,4) DEFAULT 0;
