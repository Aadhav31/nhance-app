-- ─────────────────────────────────────────────────────────────────────────────
-- companies_update_policy.sql
-- The companies table had only a SELECT RLS policy.  Without an UPDATE policy,
-- Supabase silently drops every UPDATE (no error, 0 rows written).
-- This meant Settings → Payment Info appeared to save (toast fired, React
-- state updated) but the data vanished on next page load.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY company_update ON companies
  FOR UPDATE TO authenticated
  USING  (id = auth_company_id())
  WITH CHECK (id = auth_company_id());
