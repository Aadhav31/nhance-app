-- ─────────────────────────────────────────────────────────────────────────────
-- Nhance — Projects schema (run in Supabase SQL Editor)
-- Safe to run multiple times — all statements use IF NOT EXISTS
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. projects table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  project_code TEXT,
  division     TEXT,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  status       TEXT DEFAULT 'tender',
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects
  -- Site & Location
  ADD COLUMN IF NOT EXISTS site_name          TEXT,
  ADD COLUMN IF NOT EXISTS address            TEXT,
  ADD COLUMN IF NOT EXISTS city               TEXT,
  ADD COLUMN IF NOT EXISTS state              TEXT,
  ADD COLUMN IF NOT EXISTS pincode            TEXT,
  ADD COLUMN IF NOT EXISTS maps_link          TEXT,
  -- Timeline
  ADD COLUMN IF NOT EXISTS mobilization_date  DATE,
  ADD COLUMN IF NOT EXISTS start_date         DATE,
  ADD COLUMN IF NOT EXISTS expected_end_date  DATE,
  ADD COLUMN IF NOT EXISTS actual_end_date    DATE,
  -- Contract Terms
  ADD COLUMN IF NOT EXISTS nature_of_job      TEXT,
  ADD COLUMN IF NOT EXISTS contract_value     NUMERIC,
  ADD COLUMN IF NOT EXISTS billing_cycle      TEXT,
  ADD COLUMN IF NOT EXISTS mobilization_advance NUMERIC,
  ADD COLUMN IF NOT EXISTS retention_pct      NUMERIC,
  ADD COLUMN IF NOT EXISTS gst_rate           NUMERIC DEFAULT 18,
  ADD COLUMN IF NOT EXISTS payment_terms      TEXT,
  -- HSD Terms
  ADD COLUMN IF NOT EXISTS hsd_supplied_by        TEXT DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS hsd_consumption_norm   NUMERIC,
  ADD COLUMN IF NOT EXISTS hsd_rate_per_liter     NUMERIC,
  ADD COLUMN IF NOT EXISTS hsd_excess_bill_rate   NUMERIC,
  ADD COLUMN IF NOT EXISTS hsd_shortage_credit    NUMERIC,
  -- Contacts — client side
  ADD COLUMN IF NOT EXISTS client_pm_name         TEXT,
  ADD COLUMN IF NOT EXISTS client_pm_phone        TEXT,
  ADD COLUMN IF NOT EXISTS client_pm_email        TEXT,
  ADD COLUMN IF NOT EXISTS client_pnm_name        TEXT,
  ADD COLUMN IF NOT EXISTS client_pnm_phone       TEXT,
  ADD COLUMN IF NOT EXISTS client_accounts_name   TEXT,
  ADD COLUMN IF NOT EXISTS client_accounts_phone  TEXT,
  -- Contacts — our side
  ADD COLUMN IF NOT EXISTS our_supervisor_name    TEXT,
  ADD COLUMN IF NOT EXISTS our_supervisor_phone   TEXT,
  ADD COLUMN IF NOT EXISTS our_pnm_name           TEXT,
  ADD COLUMN IF NOT EXISTS our_pnm_phone          TEXT,
  -- Misc
  ADD COLUMN IF NOT EXISTS notes                  TEXT;

-- ── 2. Rate items table ───────────────────────────────────────────────────────
-- Flexible structure that covers all 4 contract types:
--   hire          → item_name=equipment, rate_per_hour/day/month, min_qty, idle_rate, ot_rate
--   rate_contract → item_name=work item, unit, rate
--   lump_sum      → item_name=milestone, rate=value, milestone_date
--   amc           → item_name=scope, rate=monthly amount, unit
CREATE TABLE IF NOT EXISTS project_rate_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_name      TEXT NOT NULL,
  unit           TEXT,
  rate           NUMERIC,
  rate_per_hour  NUMERIC,
  rate_per_day   NUMERIC,
  rate_per_month NUMERIC,
  min_quantity   NUMERIC,
  overtime_rate  NUMERIC,
  idle_rate      NUMERIC,
  milestone_date DATE,
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_rate_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='company_projects') THEN
    CREATE POLICY "company_projects" ON projects
      FOR ALL TO authenticated USING (company_id = auth_company_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_rate_items' AND policyname='company_project_rate_items') THEN
    CREATE POLICY "company_project_rate_items" ON project_rate_items
      FOR ALL TO authenticated USING (company_id = auth_company_id());
  END IF;
END $$;

-- ── 4. Reload PostgREST schema cache ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── 5. Verify ─────────────────────────────────────────────────────────────────
SELECT table_name, COUNT(*) as columns
FROM information_schema.columns
WHERE table_name IN ('projects', 'project_rate_items')
GROUP BY table_name;
