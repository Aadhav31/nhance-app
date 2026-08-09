-- ═══════════════════════════════════════════════════════════════════════════
--  AUDIT LOGS — Immutable append-only event trail
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Immutability is enforced at two levels:
--    1. RLS — no UPDATE or DELETE policy exists for any role
--    2. DB trigger — raises an exception on any attempt to update or delete
--       a row, even by service_role via the Supabase dashboard
--
--  To clean up test data during development only:
--    DROP TRIGGER IF EXISTS enforce_audit_immutability ON public.audit_logs;
--    DELETE FROM public.audit_logs WHERE ...;
--    (recreate the trigger when done)
--
--  module values  : 'ra_billing' | 'approvals' | 'hire_contract' | 'purchase'
--                   'field_expense' | 'boq' | 'inventory' | 'settings' | 'auth'
--  action values  : 'created' | 'updated' | 'submitted' | 'approved' | 'rejected'
--                   'paid' | 'deleted' | 'acknowledged' | 'recalled' | 'activated'
--                   'terminated' | 'login' | 'logout'
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        REFERENCES public.companies(id) ON DELETE CASCADE,

  -- What happened
  module       text        NOT NULL,
  action       text        NOT NULL,
  record_id    uuid,                   -- loose reference to the affected row
  record_ref   text,                   -- human-readable: 'RA-2026-001', 'HC-045'
  description  text,                   -- 'RA Bill RA-2026-001 submitted for approval'

  -- Who did it
  actor_id     uuid,                   -- auth.uid() at the time of action
  actor_name   text,
  actor_role   text,

  -- Extra context (optional)
  meta         jsonb,                  -- any additional key-value pairs

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
  ON public.audit_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_module
  ON public.audit_logs(company_id, module);

CREATE INDEX IF NOT EXISTS idx_audit_logs_record
  ON public.audit_logs(record_id)
  WHERE record_id IS NOT NULL;

-- ── Immutability trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_logs_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is immutable — updates and deletes are not permitted. '
    'To clean test data, drop the trigger temporarily (see migration comments).';
END;
$$;

DROP TRIGGER IF EXISTS enforce_audit_immutability ON public.audit_logs;
CREATE TRIGGER enforce_audit_immutability
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_logs_immutable();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs for their company
-- NOTE: role is stored in user_roles table, NOT in user_profiles
CREATE POLICY "Admins can view audit_logs"
  ON public.audit_logs FOR SELECT
  USING (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- All authenticated company members can write (INSERT only)
CREATE POLICY "Company members can insert audit_logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- !! No UPDATE policy  → UPDATE statements are blocked by RLS
-- !! No DELETE policy  → DELETE statements are blocked by RLS
-- The trigger above adds a second layer on top of RLS for service_role bypass protection
