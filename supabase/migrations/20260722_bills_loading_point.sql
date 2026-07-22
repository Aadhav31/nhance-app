-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add loading_point_id to bills
--
-- For crusher/sand industry companies, bills are tagged to a crusher loading
-- point (manufacturing unit / plant) rather than a specific piece of equipment.
-- The existing equipment_id column is retained for non-crusher industries.
--
-- After running:  NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS loading_point_id UUID;

CREATE INDEX IF NOT EXISTS idx_bills_loading_point_id
  ON bills(loading_point_id)
  WHERE loading_point_id IS NOT NULL;
