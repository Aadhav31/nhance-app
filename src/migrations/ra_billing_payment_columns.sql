-- RA Billing — Payment Recording Columns
-- Run this in Supabase → SQL Editor

ALTER TABLE public.ra_bills
  ADD COLUMN IF NOT EXISTS payment_date   date,
  ADD COLUMN IF NOT EXISTS payment_ref    text,
  ADD COLUMN IF NOT EXISTS payment_mode   text,        -- 'NEFT','RTGS','Cheque','Cash','UPI'
  ADD COLUMN IF NOT EXISTS payment_notes  text,
  ADD COLUMN IF NOT EXISTS payment_amount numeric(14,2); -- actual amount received (may differ from net_payable)

-- Optional: index for filtering by date
CREATE INDEX IF NOT EXISTS idx_ra_bills_payment_date ON public.ra_bills (payment_date);
CREATE INDEX IF NOT EXISTS idx_ra_bills_company_status ON public.ra_bills (company_id, status);
