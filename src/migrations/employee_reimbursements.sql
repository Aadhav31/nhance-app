-- ═══════════════════════════════════════════════════════════════════════════
--  EMPLOYEE REIMBURSEMENTS
--
--  Tracks personal expenses paid out-of-pocket by employees at site.
--  Lifecycle:  submitted → pending → approved/rejected → reimbursed
--
--  Separate from field_expenses (which are company operational costs).
--  Flagging columns let admin later link the expense to a project,
--  equipment record, or bill for proper cost allocation.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.employee_reimbursements (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Submitter
  employee_id         uuid        NOT NULL,
  employee_name       text        NOT NULL,
  employee_role       text,

  -- Expense details
  amount              numeric(12,2) NOT NULL CHECK (amount > 0),
  category            text        NOT NULL,   -- fuel|food|travel|accommodation|medical|tools|communication|other
  description         text,
  expense_date        date        NOT NULL DEFAULT CURRENT_DATE,
  receipt_url         text,                   -- photo of receipt / bill

  -- Flags for future linkage (equipment, project, bill reference)
  -- e.g. { "project_id": "uuid", "equipment_id": "uuid", "bill_ref": "INV-001" }
  flags               jsonb       NOT NULL DEFAULT '{}',

  -- Workflow
  status              text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','reimbursed')),

  -- Approval
  reviewed_by         uuid,
  reviewed_by_name    text,
  reviewed_at         timestamptz,
  review_notes        text,

  -- Reimbursement payment
  reimbursed_by       uuid,
  reimbursed_by_name  text,
  reimbursed_at       timestamptz,
  reimbursed_mode     text,                   -- cash|bank_transfer|upi|cheque

  submitted_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reimb_company_status
  ON public.employee_reimbursements(company_id, status);
CREATE INDEX IF NOT EXISTS idx_reimb_employee
  ON public.employee_reimbursements(company_id, employee_id, submitted_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.employee_reimbursements ENABLE ROW LEVEL SECURITY;

-- Company members can SELECT their own + all if admin/manager
CREATE POLICY "Employees can view own reimbursements"
  ON public.employee_reimbursements FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
  ));

-- Any company employee can submit
CREATE POLICY "Employees can submit reimbursements"
  ON public.employee_reimbursements FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid())
    AND employee_id = auth.uid()
  );

-- Admin / manager can update (approve, reject, mark reimbursed)
CREATE POLICY "Managers can update reimbursements"
  ON public.employee_reimbursements FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
  ));

-- Enable realtime (so web page auto-refreshes when APK submits)
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_reimbursements;

-- ── Storage bucket for receipt photos ─────────────────────────────────────────
-- Create in Supabase dashboard → Storage → New bucket:
--   Name:   reimbursement-receipts
--   Public: true
--   File size limit: 20971520  (20 MB)
--
-- OR via SQL:
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('reimbursement-receipts', 'reimbursement-receipts', true, 20971520)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Employees can upload receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reimbursement-receipts');

CREATE POLICY "Public can read receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reimbursement-receipts');

CREATE POLICY "Uploader can delete own receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'reimbursement-receipts' AND owner = auth.uid());
