-- projects_schema_v2.sql
-- Run this in Supabase SQL editor

-- New columns on projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS site_lat              NUMERIC,
  ADD COLUMN IF NOT EXISTS site_lng              NUMERIC,
  ADD COLUMN IF NOT EXISTS our_pm_name           TEXT,
  ADD COLUMN IF NOT EXISTS our_pm_phone          TEXT,
  ADD COLUMN IF NOT EXISTS our_pm_email          TEXT;

-- New columns on project_rate_items table (for OT rules + short-term hire)
ALTER TABLE project_rate_items
  ADD COLUMN IF NOT EXISTS billing_basis         TEXT    DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS max_hours_per_day     NUMERIC,
  ADD COLUMN IF NOT EXISTS ot_percentage         NUMERIC,
  ADD COLUMN IF NOT EXISTS is_short_term         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS short_term_fixed_hours NUMERIC DEFAULT 6;

NOTIFY pgrst, 'reload schema';
