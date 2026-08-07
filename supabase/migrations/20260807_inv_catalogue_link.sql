-- Link inventory_items → item_catalogue so names stay in sync
-- Adds an optional catalogue_id FK; existing rows are unaffected.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS catalogue_id UUID REFERENCES item_catalogue(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_items_catalogue ON inventory_items(catalogue_id);

NOTIFY pgrst, 'reload schema';
