-- RLS policy for breakdown_alerts
-- Without this, all queries return 0 rows (Supabase default: deny everything when RLS is on)
-- This is why the operator "Resume Work" banner and admin dashboard alarm were not showing.

ALTER TABLE breakdown_alerts ENABLE ROW LEVEL SECURITY;

-- Drop if re-running to avoid duplicate policy error
DROP POLICY IF EXISTS "company_members_breakdown_alerts" ON breakdown_alerts;

CREATE POLICY "company_members_breakdown_alerts"
ON breakdown_alerts
FOR ALL
USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
