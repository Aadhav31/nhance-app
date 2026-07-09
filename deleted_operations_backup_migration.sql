-- ─────────────────────────────────────────────────────────────────────────────
-- deleted_operations_backup — 30-day soft-delete archive for Daily Operations
-- Stores full JSON snapshots of deleted shifts, fuel entries, and incidents.
-- Records auto-expire after 30 days (expires_at).
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deleted_operations_backup (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        REFERENCES companies(id) ON DELETE CASCADE,
  record_type  TEXT        NOT NULL
                           CHECK (record_type IN ('shift', 'fuel_entry', 'incident')),
  record_id    UUID        NOT NULL,
  record_data  JSONB       NOT NULL,          -- full snapshot of deleted row
  related_data JSONB,                         -- for shifts: fuel entries + incidents
  deleted_by   UUID,                          -- user who deleted
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_del_ops_company  ON deleted_operations_backup(company_id);
CREATE INDEX IF NOT EXISTS idx_del_ops_expires  ON deleted_operations_backup(expires_at);
CREATE INDEX IF NOT EXISTS idx_del_ops_type     ON deleted_operations_backup(record_type);

-- Enable RLS (same policy as other tables)
ALTER TABLE deleted_operations_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view backups"
  ON deleted_operations_backup FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Company members can insert backups"
  ON deleted_operations_backup FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
