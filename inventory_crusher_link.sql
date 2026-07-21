-- Add grade_id to inventory_items so crusher grades can be linked to inventory
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS grade_id UUID REFERENCES crusher_grades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_items_grade ON inventory_items(grade_id);

-- Add loading_point_id to stores so loading points can be mapped as stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS loading_point_id UUID REFERENCES crusher_loading_points(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stores_loading_pt ON stores(loading_point_id);

-- Allow 'finished_goods' as a valid category (original schema only had 'finished_good')
ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_category_check;

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_category_check
  CHECK (category IN ('raw_material','spare_part','lubricant','tool','finished_good','finished_goods','consumable'));
