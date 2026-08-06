-- Add resolution tracking to breakdown_alerts
-- resolved_at = equipment fixed, work resumed (set by operator)
-- acknowledged_at = admin/supervisor is aware (set by management)
ALTER TABLE breakdown_alerts
  ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by_name  TEXT;

NOTIFY pgrst, 'reload schema';
