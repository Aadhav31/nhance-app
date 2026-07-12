-- Add working_days_per_month to rate card and deployment tables
-- Used by Equipment P&L to convert monthly rate → daily rate for shift-based revenue
-- Default 26 (standard industry working days/month)

ALTER TABLE project_rate_items
  ADD COLUMN IF NOT EXISTS working_days_per_month INTEGER DEFAULT 26;

ALTER TABLE equipment_deployments
  ADD COLUMN IF NOT EXISTS working_days_per_month INTEGER DEFAULT 26;
