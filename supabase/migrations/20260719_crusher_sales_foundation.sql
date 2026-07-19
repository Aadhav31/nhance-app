-- ─────────────────────────────────────────────────────────────────────────────
-- Crusher Sales Foundation
-- Tables: crusher_client_settings, crusher_client_vehicles,
--         crusher_loading_points, crusher_invoices, crusher_invoice_items
-- Also: HSN/GST columns added to crusher_grades
-- ─────────────────────────────────────────────────────────────────────────────

-- 0. Extend crusher_grades with HSN + GST defaults
ALTER TABLE crusher_grades ADD COLUMN IF NOT EXISTS hsn_code TEXT DEFAULT '2517';
ALTER TABLE crusher_grades ADD COLUMN IF NOT EXISTS default_gst_rate NUMERIC(5,2) DEFAULT 5.00;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Client credit / billing settings (one row per client, company-scoped)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crusher_client_settings (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id           UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id            UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  credit_period_days   INT         NOT NULL DEFAULT 30,
  statement_day        INT         CHECK (statement_day BETWEEN 1 AND 31),   -- day of month for auto-statement
  payment_due_days     INT         NOT NULL DEFAULT 7,                        -- days after statement date
  default_loading_pt   TEXT,
  default_unloading_pt TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, client_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vehicle registry — both client-owned and own fleet vehicles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crusher_client_vehicles (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_number   TEXT        NOT NULL,                       -- TN38 AB 1234
  vehicle_type     TEXT        NOT NULL DEFAULT 'tipper',      -- tipper, hyva, lorry, own_fleet, etc.
  owner_type       TEXT        NOT NULL DEFAULT 'client'
                               CHECK (owner_type IN ('client', 'own')),
  client_id        UUID        REFERENCES clients(id) ON DELETE SET NULL,
  equipment_id     UUID        REFERENCES equipment(id) ON DELETE SET NULL,
  billing_basis    TEXT        NOT NULL DEFAULT 'fixed_capacity'
                               CHECK (billing_basis IN ('fixed_capacity', 'weighed')),
  capacity_tonnes  NUMERIC(10,3),                              -- predefined load per trip (if fixed)
  capacity_units   INT,                                        -- alternate unit capacity
  notes            TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, vehicle_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Named loading / unloading points
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crusher_loading_points (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  point_name   TEXT        NOT NULL,
  point_type   TEXT        NOT NULL DEFAULT 'both'
               CHECK (point_type IN ('loading', 'unloading', 'both')),
  address      TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Crusher invoices (tax or non-tax, vehicle-linked, tonnage-based)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crusher_invoices (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number      TEXT        NOT NULL,
  invoice_type        TEXT        NOT NULL DEFAULT 'tax'
                                  CHECK (invoice_type IN ('tax', 'non_tax')),
  invoice_date        DATE        NOT NULL DEFAULT CURRENT_DATE,

  -- Client & vehicle (both optional for walk-in cash sales)
  client_id           UUID        REFERENCES clients(id) ON DELETE SET NULL,
  client_name         TEXT,                                -- snapshot
  vehicle_id          UUID        REFERENCES crusher_client_vehicles(id) ON DELETE SET NULL,
  vehicle_number      TEXT,                                -- snapshot
  vehicle_capacity    NUMERIC(10,3),                       -- snapshot of capacity at invoice time
  billing_basis       TEXT        CHECK (billing_basis IN ('fixed_capacity', 'weighed')),

  -- Route
  loading_point       TEXT,
  unloading_point     TEXT,

  -- Payment
  payment_type        TEXT        NOT NULL DEFAULT 'cash'
                                  CHECK (payment_type IN ('cash', 'credit')),
  payment_mode        TEXT        CHECK (payment_mode IN
                                    ('cash','gpay','upi','bank_transfer','neft','rtgs','cheque')),
  cheque_number       TEXT,
  cheque_date         DATE,
  credit_due_date     DATE,                                -- due date for credit invoices

  -- Amounts
  subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_tax           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance             NUMERIC(14,2) NOT NULL DEFAULT 0,   -- updated by app on payment

  -- Status
  status              TEXT        NOT NULL DEFAULT 'issued'
                                  CHECK (status IN ('draft','issued','paid','partial','overdue','void')),

  -- Conversion tracking (tax ↔ non-tax)
  converted_from_id   UUID        REFERENCES crusher_invoices(id) ON DELETE SET NULL,
  conversion_type     TEXT        CHECK (conversion_type IN ('nontax_to_tax','tax_to_nontax')),

  notes               TEXT,
  created_by          UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crusher_invoices_number
  ON crusher_invoices(company_id, invoice_number);

CREATE INDEX IF NOT EXISTS idx_crusher_invoices_client
  ON crusher_invoices(client_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_crusher_invoices_status
  ON crusher_invoices(company_id, status, credit_due_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Line items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crusher_invoice_items (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id       UUID        NOT NULL REFERENCES crusher_invoices(id) ON DELETE CASCADE,
  grade_id         UUID        REFERENCES crusher_grades(id) ON DELETE SET NULL,
  material_name    TEXT        NOT NULL,
  hsn_code         TEXT,
  unit             TEXT        NOT NULL DEFAULT 'tonnes'
                               CHECK (unit IN ('tonnes','units','cum','bags','trips')),
  quantity         NUMERIC(14,3) NOT NULL DEFAULT 0,
  rate             NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount           NUMERIC(14,2) NOT NULL DEFAULT 0,   -- quantity × rate (app-computed)
  gst_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,    -- 0 for non_tax invoices
  gst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,   -- amount + gst_amount
  sort_order       INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_crusher_invoice_items_inv
  ON crusher_invoice_items(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crusher_client_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_client_vehicles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_loading_points     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_invoice_items      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_client_settings"   ON crusher_client_settings;
DROP POLICY IF EXISTS "company_client_vehicles"   ON crusher_client_vehicles;
DROP POLICY IF EXISTS "company_loading_points"    ON crusher_loading_points;
DROP POLICY IF EXISTS "company_crusher_invoices"  ON crusher_invoices;
DROP POLICY IF EXISTS "company_crusher_inv_items" ON crusher_invoice_items;

CREATE POLICY "company_client_settings" ON crusher_client_settings
  FOR ALL USING (company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "company_client_vehicles" ON crusher_client_vehicles
  FOR ALL USING (company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "company_loading_points" ON crusher_loading_points
  FOR ALL USING (company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "company_crusher_invoices" ON crusher_invoices
  FOR ALL USING (company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "company_crusher_inv_items" ON crusher_invoice_items
  FOR ALL USING (
    invoice_id IN (
      SELECT id FROM crusher_invoices
      WHERE company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
    )
  );
