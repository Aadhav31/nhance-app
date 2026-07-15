-- ─────────────────────────────────────────────────────────────────────────────
-- equipment_commissionings.sql
-- Tracks formal Equipment Deployment / Commencement of Operations records.
-- Created when a Commencement of Operations certificate is issued via the
-- Letters module. Shown in the Projects section per project.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment_commissionings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id       UUID        REFERENCES projects(id) ON DELETE SET NULL,
  equipment_id     UUID        REFERENCES equipment(id) ON DELETE SET NULL,

  -- Deployment details
  commissioned_date DATE        NOT NULL,
  withdrawn_date    DATE,                        -- filled when equipment leaves site
  site_location     TEXT,
  client_name       TEXT,
  operator_name     TEXT,
  notes             TEXT,

  -- Link back to the issued letter/certificate
  doc_ref           TEXT,                        -- document_verifications.token
  ref_number        TEXT,                        -- letter ref number

  created_by        UUID        REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ec_company_idx   ON equipment_commissionings(company_id);
CREATE INDEX IF NOT EXISTS ec_project_idx   ON equipment_commissionings(project_id);
CREATE INDEX IF NOT EXISTS ec_equipment_idx ON equipment_commissionings(equipment_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE equipment_commissionings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ec_company_access" ON equipment_commissionings
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );
