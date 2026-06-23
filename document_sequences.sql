-- document_sequences.sql
-- Atomic auto-numbering for all documents
-- Run in Supabase SQL Editor

-- ── Sequences table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_sequences (
  company_id  UUID  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  seq_key     TEXT  NOT NULL,   -- e.g. 'bill_2026', 'employee'
  last_seq    INT   NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, seq_key)
);

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seq_all" ON document_sequences;
CREATE POLICY "seq_all" ON document_sequences FOR ALL TO authenticated USING (true);

-- ── Atomic increment function ─────────────────────────────────────────────────
-- Returns the next integer in the sequence (thread-safe via ON CONFLICT DO UPDATE)
CREATE OR REPLACE FUNCTION next_doc_seq(p_company_id UUID, p_seq_key TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_next INT;
BEGIN
  INSERT INTO document_sequences (company_id, seq_key, last_seq)
    VALUES (p_company_id, p_seq_key, 1)
    ON CONFLICT (company_id, seq_key)
    DO UPDATE SET last_seq = document_sequences.last_seq + 1
    RETURNING last_seq INTO v_next;
  RETURN v_next;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Document types and their formats ─────────────────────────────────────────
-- Year-based (resets each year):
--   bill          → BL-2026-0001
--   po            → PO-2026-0001
--   vendor_credit → VC-2026-0001
--   payment_made  → PM-2026-0001
--   invoice       → INV-2026-0001
--   quote         → QT-2026-0001
--   sales_order   → SO-2026-0001
--   challan       → DC-2026-0001
--   credit_note   → CN-2026-0001
--   payment_recv  → PR-2026-0001
-- Lifetime (never resets):
--   vendor        → V-0001
--   employee      → EMP-0001
