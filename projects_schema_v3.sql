-- projects_schema_v3.sql
-- Run AFTER projects_schema_v2.sql
-- Adds: multiple supervisors / P&M contacts (JSONB), rate card enhancements

-- Projects: store multiple supervisors and P&M contacts as JSON arrays
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS our_supervisors   JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS our_pnm_contacts  JSONB DEFAULT '[]'::jsonb;

-- Rate items: new billing basis options + allowance + inclusions
ALTER TABLE project_rate_items
  ADD COLUMN IF NOT EXISTS max_hours_per_month      NUMERIC,
  ADD COLUMN IF NOT EXISTS rate_inclusive_hsd        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rate_inclusive_gst        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allowance_per_day         NUMERIC;

NOTIFY pgrst, 'reload schema';
