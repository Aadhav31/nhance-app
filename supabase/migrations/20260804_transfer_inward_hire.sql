-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Transfer Certificate + Inward Hire Contracts
--   1. Add tc_pdf_url to equipment_deployments
--   2. inward_hire_contracts — machines hired from external vendors
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Transfer Certificate URL on deployment record ────────────────────────────
ALTER TABLE equipment_deployments
  ADD COLUMN IF NOT EXISTS tc_pdf_url      TEXT,          -- URL of generated TC PDF
  ADD COLUMN IF NOT EXISTS tc_from_project TEXT,          -- snapshot of project left
  ADD COLUMN IF NOT EXISTS tc_to_project   TEXT,          -- snapshot of project entered
  ADD COLUMN IF NOT EXISTS tc_generated_at TIMESTAMPTZ;   -- when TC was generated/downloaded


-- 2. Inward Hire Contracts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inward_hire_contracts (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_ref           TEXT,                             -- IHC-2026-001, auto or manual

  -- Vendor ──────────────────────────────────────────────────────────────────
  vendor_id              UUID,                             -- soft ref to vendors table
  vendor_name            TEXT        NOT NULL,
  vendor_contact         TEXT,
  vendor_address         TEXT,

  -- Machine details ─────────────────────────────────────────────────────────
  machine_type           TEXT        NOT NULL,             -- Excavator, Tipper, Crane…
  make                   TEXT,
  model                  TEXT,
  year_of_manufacture    INT,
  registration_number    TEXT,
  capacity_description   TEXT,                            -- "1.2 cu.m bucket", "10T"
  machine_photo_url      TEXT,

  -- Hire terms ──────────────────────────────────────────────────────────────
  hire_rate              NUMERIC(12,2),
  rate_type              TEXT        NOT NULL DEFAULT 'monthly'
                                     CHECK (rate_type IN ('hourly','daily','monthly')),
  billing_period         TEXT        DEFAULT 'monthly',   -- '15_days' | 'monthly'
  max_hours_per_day      NUMERIC(6,1),
  deposit_amount         NUMERIC(12,2),
  mob_charges            NUMERIC(12,2),
  demob_charges          NUMERIC(12,2),

  -- Dates ───────────────────────────────────────────────────────────────────
  mob_date               DATE,
  expected_demob_date    DATE,
  actual_demob_date      DATE,

  -- Status ──────────────────────────────────────────────────────────────────
  status                 TEXT        NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active','returned','cancelled')),

  -- Assignment ──────────────────────────────────────────────────────────────
  current_project_id     UUID        REFERENCES projects(id) ON DELETE SET NULL,
  current_project_name   TEXT,                            -- snapshot
  current_site_name      TEXT,

  -- Operator ────────────────────────────────────────────────────────────────
  operator_provided_by   TEXT        DEFAULT 'own'
                                     CHECK (operator_provided_by IN ('own','vendor')),
  operator_name          TEXT,

  -- Return condition ────────────────────────────────────────────────────────
  return_condition       TEXT,
  return_meter_reading   NUMERIC(12,1),
  return_notes           TEXT,

  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inward_hire_company_status
  ON inward_hire_contracts(company_id, status);

ALTER TABLE inward_hire_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company members can manage inward_hire_contracts" ON inward_hire_contracts;
CREATE POLICY "company members can manage inward_hire_contracts"
  ON inward_hire_contracts FOR ALL
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION _set_inward_hire_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_inward_hire_updated_at ON inward_hire_contracts;
CREATE TRIGGER trg_inward_hire_updated_at
  BEFORE UPDATE ON inward_hire_contracts
  FOR EACH ROW EXECUTE FUNCTION _set_inward_hire_updated_at();

-- Auto-generate contract_ref: IHC-YYYY-NNNN
CREATE OR REPLACE FUNCTION _generate_ihc_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  yr  TEXT := TO_CHAR(NOW(), 'YYYY');
  seq INT;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(contract_ref, '^IHC-\d{4}-', ''), '')::INT
  ), 0) + 1
  INTO seq
  FROM inward_hire_contracts
  WHERE company_id = NEW.company_id
    AND contract_ref LIKE 'IHC-' || yr || '-%';
  NEW.contract_ref := 'IHC-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ihc_ref ON inward_hire_contracts;
CREATE TRIGGER trg_ihc_ref
  BEFORE INSERT ON inward_hire_contracts
  FOR EACH ROW
  WHEN (NEW.contract_ref IS NULL OR NEW.contract_ref = '')
  EXECUTE FUNCTION _generate_ihc_ref();

NOTIFY pgrst, 'reload schema';
