-- ─────────────────────────────────────────────────────────────────────────────
-- Crusher Production Tracker
-- Tables: crusher_grades, crusher_production, crusher_production_outputs
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Grade definitions (company-configurable: 6mm, 12mm, 20mm, 40mm, Dust, etc.)
CREATE TABLE IF NOT EXISTS crusher_grades (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  grade_name  TEXT        NOT NULL,           -- '6mm', '12mm', '20mm', '40mm', 'Dust', 'Rejects'
  description TEXT,
  sort_order  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, grade_name)
);

-- 2. Daily production log — one row per machine per shift per day
CREATE TABLE IF NOT EXISTS crusher_production (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  production_date  DATE        NOT NULL,
  shift_type       TEXT        NOT NULL DEFAULT 'day' CHECK (shift_type IN ('day','night','general')),
  equipment_id     UUID        REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_name   TEXT,                        -- snapshot in case equipment deleted
  raw_input_tonnes NUMERIC(12,3) NOT NULL DEFAULT 0,  -- total rock/stone fed in tonnes
  running_hours    NUMERIC(6,2),                -- machine running hours this shift
  notes            TEXT,
  created_by       UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Grade-wise output per production entry
CREATE TABLE IF NOT EXISTS crusher_production_outputs (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id  UUID        NOT NULL REFERENCES crusher_production(id) ON DELETE CASCADE,
  grade_id       UUID        NOT NULL REFERENCES crusher_grades(id) ON DELETE RESTRICT,
  grade_name     TEXT        NOT NULL,          -- snapshot
  quantity_tonnes NUMERIC(12,3) NOT NULL DEFAULT 0,
  UNIQUE (production_id, grade_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crusher_production_company_date
  ON crusher_production(company_id, production_date DESC);

CREATE INDEX IF NOT EXISTS idx_crusher_production_equipment
  ON crusher_production(equipment_id);

CREATE INDEX IF NOT EXISTS idx_crusher_production_outputs_prod
  ON crusher_production_outputs(production_id);

-- RLS
ALTER TABLE crusher_grades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_production         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_production_outputs ENABLE ROW LEVEL SECURITY;

-- Policies: company-scoped access using existing get_user_company_id() helper
CREATE POLICY "company_grades" ON crusher_grades
  FOR ALL USING (company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "company_production" ON crusher_production
  FOR ALL USING (company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "company_production_outputs" ON crusher_production_outputs
  FOR ALL USING (
    production_id IN (
      SELECT id FROM crusher_production
      WHERE company_id = (SELECT company_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- Seed default grades when a crusher company is detected
-- (Run manually per company or call from app on first visit)
-- Example seed:
-- INSERT INTO crusher_grades (company_id, grade_name, sort_order) VALUES
--   ('<company_id>', '40mm', 1),
--   ('<company_id>', '20mm', 2),
--   ('<company_id>', '12mm', 3),
--   ('<company_id>', '6mm',  4),
--   ('<company_id>', 'Dust', 5),
--   ('<company_id>', 'Rejects', 6);
