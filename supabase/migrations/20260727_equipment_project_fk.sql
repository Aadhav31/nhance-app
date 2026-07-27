-- ─────────────────────────────────────────────────────────────────────────────
-- 20260727_equipment_project_fk.sql
--
-- Adds FK constraints for the three "current" columns on equipment so that
-- PostgREST can resolve nested joins (e.g. equipment → projects → clients).
--
-- Safe to run multiple times (uses IF NOT EXISTS / DO block guards).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ensure the columns exist (they should already, but guard anyway)
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS current_project_id UUID,
  ADD COLUMN IF NOT EXISTS current_client_id  UUID,
  ADD COLUMN IF NOT EXISTS current_site_name  TEXT,
  ADD COLUMN IF NOT EXISTS fuel_by_client     BOOLEAN DEFAULT FALSE;

-- 2. Add FK: equipment.current_project_id → projects(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'equipment_current_project_fk'
  ) THEN
    ALTER TABLE equipment
      ADD CONSTRAINT equipment_current_project_fk
        FOREIGN KEY (current_project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- 3. Add FK: equipment.current_client_id → clients(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'equipment_current_client_fk'
  ) THEN
    ALTER TABLE equipment
      ADD CONSTRAINT equipment_current_client_fk
        FOREIGN KEY (current_client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_equipment_current_project ON equipment(current_project_id) WHERE current_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_current_client  ON equipment(current_client_id)  WHERE current_client_id  IS NOT NULL;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
