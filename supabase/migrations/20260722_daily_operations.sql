-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: daily_operations table
--
-- Records the daily operational status and usage of support/auxiliary equipment:
-- excavators, loaders, tippers, generators (DG sets), water tankers, etc.
-- These are NOT tracked in crusher_production (which handles production machines
-- like crushers, M Sand / P Sand machines, and washers).
--
-- After running: NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_operations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ops_date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  shift_type      TEXT        NOT NULL DEFAULT 'day'
                              CHECK (shift_type IN ('day', 'night', 'general')),

  -- Equipment ref
  equipment_id    UUID        REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_name  TEXT,                         -- denormalised snapshot
  equipment_type  TEXT,                         -- category snapshot (Excavator, Tipper, etc.)

  -- Operational status for the shift
  status          TEXT        NOT NULL DEFAULT 'working'
                              CHECK (status IN ('working', 'idle', 'breakdown', 'maintenance')),

  -- Metered usage (adaptive — not all fields apply to every equipment type)
  running_hours   NUMERIC(6,2),                 -- for hour-metered machines
  kilometer_run   NUMERIC(8,2),                 -- for vehicles
  trip_count      INTEGER,                      -- for tippers / water tankers
  fuel_consumed   NUMERIC(8,2),                 -- litres
  material_moved  NUMERIC(10,3),                -- tonnes (excavator digs, tipper loads)

  -- People & work
  operator_name   TEXT,
  activity        TEXT,                         -- brief work description
  notes           TEXT,

  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_ops_company_date
  ON daily_operations(company_id, ops_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_ops_equipment
  ON daily_operations(equipment_id)
  WHERE equipment_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION _set_daily_ops_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_daily_ops_updated_at ON daily_operations;
CREATE TRIGGER trg_daily_ops_updated_at
  BEFORE UPDATE ON daily_operations
  FOR EACH ROW EXECUTE FUNCTION _set_daily_ops_updated_at();

-- Row-level security
ALTER TABLE daily_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members can manage daily_operations" ON daily_operations;
CREATE POLICY "company members can manage daily_operations"
  ON daily_operations FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
