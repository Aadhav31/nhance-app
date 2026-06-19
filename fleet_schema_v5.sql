-- fleet_schema_v5.sql
-- Adds: sub_category to equipment, reference_number to equipment_documents,
--       equipment_attachments table for physical attachments per equipment

-- ── Equipment sub-category ────────────────────────────────────────────────────
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS sub_category TEXT;   -- e.g. 'Medium (14–30T)' for excavator

-- ── Reference number on documents ─────────────────────────────────────────────
ALTER TABLE equipment_documents
  ADD COLUMN IF NOT EXISTS reference_number TEXT; -- Invoice No / Policy No / Permit No / Cert No

-- ── Equipment attachments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_attachments (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL,
  equipment_id   UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,

  attachment_name TEXT NOT NULL,   -- e.g. 'Hydraulic Breaker', 'Rock Bucket'
  make            TEXT,
  model           TEXT,
  serial_number   TEXT,
  purchase_date   DATE,
  invoice_number  TEXT,
  invoice_url     TEXT,            -- optional uploaded invoice
  notes           TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_equipment_id
  ON equipment_attachments(equipment_id);

ALTER TABLE equipment_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_attachments_select" ON equipment_attachments;
CREATE POLICY "company_attachments_select"
  ON equipment_attachments FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "company_attachments_insert" ON equipment_attachments;
CREATE POLICY "company_attachments_insert"
  ON equipment_attachments FOR INSERT
  WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "company_attachments_update" ON equipment_attachments;
CREATE POLICY "company_attachments_update"
  ON equipment_attachments FOR UPDATE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "company_attachments_delete" ON equipment_attachments;
CREATE POLICY "company_attachments_delete"
  ON equipment_attachments FOR DELETE
  USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
