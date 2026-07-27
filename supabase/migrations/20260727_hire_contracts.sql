-- ─────────────────────────────────────────────────────────────────────────────
-- 20260727_hire_contracts.sql
--
-- Hire Contracts — the core commercial document for equipment rental.
-- A hire contract records what machine was given to which client,
-- at what rate, for what period. Everything downstream (billing, daily ops,
-- machine ledger) traces back to a contract.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query → paste & run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. hire_contracts table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hire_contracts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Identity
  contract_number       TEXT NOT NULL,                    -- HC-2026001
  status                TEXT NOT NULL DEFAULT 'draft'     -- draft | active | on_hold | completed | terminated
                          CHECK (status IN ('draft','active','on_hold','completed','terminated')),

  -- Parties
  client_id             UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name           TEXT,                             -- denormalized snapshot

  -- Equipment
  equipment_id          UUID REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_name        TEXT,                             -- denormalized snapshot
  equipment_number      TEXT,                             -- registration/ID snapshot

  -- Linked project (optional)
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name          TEXT,

  -- Site & duration
  site_location         TEXT,
  start_date            DATE NOT NULL,
  end_date              DATE,                             -- null = open-ended

  -- Billing
  billing_basis         TEXT NOT NULL DEFAULT 'daily'
                          CHECK (billing_basis IN ('hourly','daily','monthly','lump_sum')),
  rate                  NUMERIC(12,2) NOT NULL DEFAULT 0, -- per hour / per day / per month / lump
  minimum_hours_per_day NUMERIC(5,2),                    -- for hourly contracts
  overtime_rate         NUMERIC(12,2),                   -- per hour OT rate (optional)

  -- Charges
  mobilization_charge   NUMERIC(12,2) DEFAULT 0,
  demobilization_charge NUMERIC(12,2) DEFAULT 0,
  security_deposit      NUMERIC(12,2) DEFAULT 0,

  -- GST
  gst_applicable        BOOLEAN DEFAULT TRUE,
  gst_rate              NUMERIC(5,2) DEFAULT 18,          -- % (18 default)

  -- Documents
  terms_conditions      TEXT,
  notes                 TEXT,

  -- Audit
  created_by            UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- Uniqueness per company
  UNIQUE (company_id, contract_number)
);

-- ── 2. hire_contract_logs — status change timeline ───────────────────────────
CREATE TABLE IF NOT EXISTS hire_contract_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID NOT NULL REFERENCES hire_contracts(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,   -- 'created' | 'activated' | 'on_hold' | 'completed' | 'terminated' | 'note'
  note            TEXT,
  created_by      UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hire_contracts_company    ON hire_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_hire_contracts_client     ON hire_contracts(client_id)     WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hire_contracts_equipment  ON hire_contracts(equipment_id)  WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hire_contracts_status     ON hire_contracts(status);
CREATE INDEX IF NOT EXISTS idx_hire_contract_logs_contract ON hire_contract_logs(contract_id);

-- ── 4. Updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_hire_contracts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS hire_contracts_updated_at ON hire_contracts;
CREATE TRIGGER hire_contracts_updated_at
  BEFORE UPDATE ON hire_contracts
  FOR EACH ROW EXECUTE FUNCTION update_hire_contracts_updated_at();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE hire_contracts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hire_contract_logs  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hire_contracts' AND policyname = 'hire_contracts_company_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY hire_contracts_company_access ON hire_contracts
        USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hire_contract_logs' AND policyname = 'hire_contract_logs_company_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY hire_contract_logs_company_access ON hire_contract_logs
        USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
    $pol$;
  END IF;
END;
$$;

-- ── 6. Link daily_operations → hire_contracts (optional backlink) ────────────
ALTER TABLE daily_operations
  ADD COLUMN IF NOT EXISTS hire_contract_id UUID REFERENCES hire_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_ops_hire_contract
  ON daily_operations(hire_contract_id) WHERE hire_contract_id IS NOT NULL;

-- ── 7. Schema cache reload ───────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Tables: hire_contracts, hire_contract_logs
-- Column added: daily_operations.hire_contract_id
