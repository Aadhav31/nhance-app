-- Breakdown alert escalation table
-- Stores one row per breakdown incident, with ordered notify_chain
-- and acknowledgment tracking.
CREATE TABLE IF NOT EXISTS breakdown_alerts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL,
  equipment_id           UUID NOT NULL,
  incident_id            UUID,                   -- FK to shift_incidents.id
  equipment_name         TEXT NOT NULL,
  project_id             UUID,
  breakdown_cause        TEXT,
  reported_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_by_name       TEXT,
  -- Ordered escalation chain: [{level,role,name,phone,email}]
  notify_chain           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Acknowledgment (first person who stops the alarm)
  acknowledged_at        TIMESTAMPTZ,
  acknowledged_by_name   TEXT,
  acknowledged_level     INT,       -- which escalation level ack'd it
  -- Timestamps
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for dashboard query (active alarms per company)
CREATE INDEX IF NOT EXISTS idx_breakdown_alerts_company_ack
  ON breakdown_alerts(company_id, acknowledged_at);

-- Index for equipment log
CREATE INDEX IF NOT EXISTS idx_breakdown_alerts_equipment
  ON breakdown_alerts(equipment_id);

-- Add manager contacts to projects (escalation level 3, between P&M and PM)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS our_managers JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
