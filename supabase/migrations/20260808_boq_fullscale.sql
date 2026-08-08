-- ══════════════════════════════════════════════════════════════════════════
-- Full-scale BOQ enhancements
-- Adds contract details, recovery fields, measurement book
-- ══════════════════════════════════════════════════════════════════════════

-- ── boq_documents: contract details ──────────────────────────────────────
ALTER TABLE boq_documents
  ADD COLUMN IF NOT EXISTS contract_number       TEXT,
  ADD COLUMN IF NOT EXISTS work_order_number     TEXT,
  ADD COLUMN IF NOT EXISTS tender_ref            TEXT,
  ADD COLUMN IF NOT EXISTS loa_date              DATE,
  ADD COLUMN IF NOT EXISTS contract_type         TEXT NOT NULL DEFAULT 'item_rate',
  -- 'item_rate' | 'lump_sum' | 'percentage_rate'
  ADD COLUMN IF NOT EXISTS sd_pct                NUMERIC(5,2)  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS mob_advance_pct       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mob_advance_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mob_advance_recovered NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS it_applicable         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS it_pct                NUMERIC(5,2)  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS labour_cess_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS labour_cess_pct       NUMERIC(5,2)  NOT NULL DEFAULT 1;

-- ── ra_bills: recovery + certified fields ─────────────────────────────────
ALTER TABLE ra_bills
  ADD COLUMN IF NOT EXISTS mob_advance_recovery  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS income_tax_pct        NUMERIC(5,2)  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS income_tax_amt        NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labour_cess_pct       NUMERIC(5,2)  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS labour_cess_amt       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sd_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions_note TEXT,
  ADD COLUMN IF NOT EXISTS previous_certified    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS certified_amount      NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ── ra_bill_measurements — Measurement Book entries ───────────────────────
-- Each RA bill item can have multiple measurement rows (nos × L × B × D)
CREATE TABLE IF NOT EXISTS ra_bill_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ra_bill_item_id UUID NOT NULL REFERENCES ra_bill_items(id) ON DELETE CASCADE,
  location_ref    TEXT,           -- chainage / location / drawing ref
  nos             NUMERIC(10,3)  NOT NULL DEFAULT 1,
  length          NUMERIC(10,3),
  breadth         NUMERIC(10,3),
  depth           NUMERIC(10,3),
  qty             NUMERIC(14,3)  NOT NULL DEFAULT 0,  -- computed in app or manually entered
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ra_measurements ON ra_bill_measurements(ra_bill_item_id);

ALTER TABLE ra_bill_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co_ra_measurements" ON ra_bill_measurements FOR ALL
USING (ra_bill_item_id IN (
  SELECT rbi.id FROM ra_bill_items rbi
  JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
  WHERE rb.company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
));

NOTIFY pgrst, 'reload schema';
