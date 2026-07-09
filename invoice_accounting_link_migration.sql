-- ─────────────────────────────────────────────────────────────────────────────
-- invoice_accounting_link_migration.sql
-- Add internal accounting fields to client_invoices:
--   project_id      → links invoice to a project (internal only, not on PDF)
--   inv_equipment_id → links invoice to an equipment unit (internal only)
-- Run ONCE in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_invoices
  ADD COLUMN IF NOT EXISTS project_id        UUID REFERENCES projects(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inv_equipment_id  UUID REFERENCES equipment(id)  ON DELETE SET NULL;

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'client_invoices'
  AND column_name IN ('project_id', 'inv_equipment_id')
ORDER BY column_name;
