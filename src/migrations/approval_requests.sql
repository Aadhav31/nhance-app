-- Approval Requests & Acknowledgments
-- Supports both blocking approvals (is_blocking = true) and soft acknowledgments (is_blocking = false)
-- module values: 'ra_bill' | 'purchase_bill' | 'field_expense' | 'hire_contract'
-- status values: 'pending' | 'approved' | 'rejected' | 'acknowledged'
-- required_role values: 'manager' | 'accounts' | 'admin'

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        REFERENCES public.companies(id) ON DELETE CASCADE,

  -- what is being approved
  module            text        NOT NULL,
  record_id         uuid        NOT NULL,
  record_ref        text,                        -- e.g. 'RA-2026-001', 'EXP-0023'
  description       text,                        -- human-readable context
  amount            numeric(14,2),               -- for threshold routing and display

  -- who submitted
  requested_by      uuid,
  requested_by_name text,

  -- routing
  required_role     text        NOT NULL,        -- which role should act on this
  is_blocking       boolean     NOT NULL DEFAULT true,  -- false = acknowledgment only

  -- outcome
  status            text        NOT NULL DEFAULT 'pending',
  reviewed_by       uuid,
  reviewed_by_name  text,
  review_date       timestamptz,
  review_comments   text,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status
  ON public.approval_requests(company_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_requests_module_record
  ON public.approval_requests(module, record_id);

-- RLS: users within the same company can read/write approval_requests
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view approval_requests"
  ON public.approval_requests FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Company members can insert approval_requests"
  ON public.approval_requests FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Company members can update approval_requests"
  ON public.approval_requests FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
  ));
