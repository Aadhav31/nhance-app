-- ─────────────────────────────────────────────────────────────────────────────
-- Internal Cost Allocation
-- Adds internal hire rates to equipment and project attribution to daily_operations
-- so P&M can generate cross-charge reports: hours × internal rate = cost to project
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Internal hire rates on equipment
--    Separate from client-facing rates in equipment_deployments.
--    Set by P&M manager / admin to reflect true internal cost of machine ownership.
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS internal_rate_basis  TEXT    DEFAULT 'hourly'
    CHECK (internal_rate_basis IN ('hourly', 'daily', 'monthly')),
  ADD COLUMN IF NOT EXISTS internal_rate_per_hour   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS internal_rate_per_day    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS internal_rate_per_month  NUMERIC(12,2);

-- 2. Project attribution on daily_operations
--    Nullable: null = infer from equipment_deployments date range
--    Set explicitly when machine does a one-off day on a different project.
ALTER TABLE daily_operations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_ops_project
  ON daily_operations(project_id) WHERE project_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
