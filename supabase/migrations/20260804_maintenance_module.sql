-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Maintenance Module
--   1. pm_schedules   — per-equipment PM service intervals with task checklists
--   2. job_cards      — repair / PM work orders
--   3. job_card_parts — parts consumed per job card (links to inventory)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. PM Schedules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pm_schedules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id      UUID        REFERENCES equipment(id) ON DELETE CASCADE,
  equipment_name    TEXT,                             -- snapshot

  schedule_name     TEXT        NOT NULL,             -- e.g. "250hr Service"
  interval_hours    NUMERIC(10,1) NOT NULL,           -- 250, 500, 1000 …
  tasks             JSONB       NOT NULL DEFAULT '[]',-- [{task, category, required}]

  last_done_meter   NUMERIC(12,1),                   -- meter reading when last serviced
  last_done_date    DATE,
  next_due_meter    NUMERIC(12,1),                   -- last_done_meter + interval_hours
  next_due_date     DATE,                             -- optional calendar date override

  is_active         BOOLEAN     NOT NULL DEFAULT true,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_schedules_equipment
  ON pm_schedules(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pm_schedules_company
  ON pm_schedules(company_id);

ALTER TABLE pm_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company members can manage pm_schedules" ON pm_schedules;
CREATE POLICY "company members can manage pm_schedules"
  ON pm_schedules FOR ALL
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION _set_pm_schedules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_pm_schedules_updated_at ON pm_schedules;
CREATE TRIGGER trg_pm_schedules_updated_at
  BEFORE UPDATE ON pm_schedules
  FOR EACH ROW EXECUTE FUNCTION _set_pm_schedules_updated_at();


-- 2. Job Cards ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_cards (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  jc_number         TEXT        NOT NULL,             -- JC-2026-001 (auto-generated)

  equipment_id      UUID        REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_name    TEXT,
  pm_schedule_id    UUID        REFERENCES pm_schedules(id) ON DELETE SET NULL,

  jc_type           TEXT        NOT NULL DEFAULT 'breakdown'
                                CHECK (jc_type IN (
                                  'pm_service',       -- triggered by PM schedule
                                  'breakdown',        -- machine stopped / failure
                                  'unscheduled',      -- unexpected repair
                                  'inspection'        -- periodic inspection
                                )),

  status            TEXT        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'in_progress', 'closed')),

  -- Problem description
  complaint         TEXT,                             -- what operator/site reported
  diagnosis         TEXT,                             -- workshop finding
  work_done         TEXT,                             -- description of work carried out

  -- Technician
  technician_name   TEXT,
  technician_id     UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  done_by           TEXT        CHECK (done_by IN ('inhouse', 'vendor', 'oem')),
  vendor_name       TEXT,                             -- if done_by = vendor

  -- Dates & meter
  opened_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  closed_date       DATE,
  meter_at_open     NUMERIC(12,1),

  -- Cost & time
  labor_hours       NUMERIC(8,2),
  labor_cost        NUMERIC(12,2),
  parts_cost        NUMERIC(12,2) DEFAULT 0,          -- sum from job_card_parts (auto-updated)
  total_cost        NUMERIC(12,2) DEFAULT 0,          -- labor_cost + parts_cost
  downtime_hours    NUMERIC(8,2),

  notes             TEXT,
  created_by        UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_cards_equipment
  ON job_cards(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_cards_company_status
  ON job_cards(company_id, status);
CREATE INDEX IF NOT EXISTS idx_job_cards_company_date
  ON job_cards(company_id, opened_date DESC);

ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company members can manage job_cards" ON job_cards;
CREATE POLICY "company members can manage job_cards"
  ON job_cards FOR ALL
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION _set_job_cards_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_job_cards_updated_at ON job_cards;
CREATE TRIGGER trg_job_cards_updated_at
  BEFORE UPDATE ON job_cards
  FOR EACH ROW EXECUTE FUNCTION _set_job_cards_updated_at();

-- Auto-generate jc_number: JC-YYYY-NNNN (per company)
CREATE OR REPLACE FUNCTION _generate_jc_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  yr   TEXT := TO_CHAR(NOW(), 'YYYY');
  seq  INT;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(jc_number, '^JC-\d{4}-', ''), '')::INT
  ), 0) + 1
  INTO seq
  FROM job_cards
  WHERE company_id = NEW.company_id
    AND jc_number LIKE 'JC-' || yr || '-%';

  NEW.jc_number := 'JC-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jc_number ON job_cards;
CREATE TRIGGER trg_jc_number
  BEFORE INSERT ON job_cards
  FOR EACH ROW
  WHEN (NEW.jc_number IS NULL OR NEW.jc_number = '')
  EXECUTE FUNCTION _generate_jc_number();

-- Auto-update total_cost when labor_cost changes
CREATE OR REPLACE FUNCTION _update_jc_total_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.total_cost := COALESCE(NEW.labor_cost, 0) + COALESCE(NEW.parts_cost, 0);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jc_total_cost ON job_cards;
CREATE TRIGGER trg_jc_total_cost
  BEFORE INSERT OR UPDATE ON job_cards
  FOR EACH ROW EXECUTE FUNCTION _update_jc_total_cost();


-- 3. Job Card Parts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_card_parts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id       UUID        NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  inventory_item_id UUID,                             -- soft ref to inventory items
  part_name         TEXT        NOT NULL,
  part_number       TEXT,
  quantity          NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_cost         NUMERIC(12,2),
  total_cost        NUMERIC(12,2) GENERATED ALWAYS AS
                      (ROUND(quantity * COALESCE(unit_cost, 0), 2)) STORED,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jc_parts_job_card
  ON job_card_parts(job_card_id);

ALTER TABLE job_card_parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company members can manage job_card_parts" ON job_card_parts;
CREATE POLICY "company members can manage job_card_parts"
  ON job_card_parts FOR ALL
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- Trigger: keep job_cards.parts_cost in sync when parts are added/removed/changed
CREATE OR REPLACE FUNCTION _sync_jc_parts_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  _jc_id UUID;
  _total NUMERIC(12,2);
BEGIN
  _jc_id := COALESCE(NEW.job_card_id, OLD.job_card_id);
  SELECT COALESCE(SUM(total_cost), 0) INTO _total
  FROM job_card_parts WHERE job_card_id = _jc_id;

  UPDATE job_cards
     SET parts_cost = _total,
         total_cost = COALESCE(labor_cost, 0) + _total
   WHERE id = _jc_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_jc_parts_cost ON job_card_parts;
CREATE TRIGGER trg_sync_jc_parts_cost
  AFTER INSERT OR UPDATE OR DELETE ON job_card_parts
  FOR EACH ROW EXECUTE FUNCTION _sync_jc_parts_cost();

NOTIFY pgrst, 'reload schema';
