-- Add project/equipment tagging columns to bills
-- Allows bills to be linked to a specific project and machine for Equipment P&L tracking

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS project_id      UUID,
  ADD COLUMN IF NOT EXISTS equipment_id    UUID,
  ADD COLUMN IF NOT EXISTS project_name    TEXT,
  ADD COLUMN IF NOT EXISTS equipment_name  TEXT;

-- Index for Equipment P&L queries
CREATE INDEX IF NOT EXISTS idx_bills_equipment_id ON bills(equipment_id);
CREATE INDEX IF NOT EXISTS idx_bills_project_id   ON bills(project_id);
