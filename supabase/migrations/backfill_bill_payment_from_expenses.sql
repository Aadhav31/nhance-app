-- ─────────────────────────────────────────────────────────────────────────────
-- backfill_bill_payment_from_expenses.sql
--
-- Problem:
--   Payments made via the nhance-expense-app "against bill" path were recorded
--   in `expenses` and directly updated `bills.paid_amount`, but were never
--   inserted into `payments_made`. This means:
--     • The bill shows the correct balance (paid/due amounts)
--     • But the web app's Payments Made tab shows no record
--
-- Fix:
--   For every expense (source='purchase') that has a bill_number, find the
--   matching bill and insert a payments_made record — but ONLY if no
--   payments_made record already exists for that bill+amount+date combination
--   (to avoid duplicates if this script is run twice).
--
--   After insert, trg_bill_paid fires and recomputes the bill balance from
--   the sum of ALL payments_made records — which is correct.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
--   Review the SELECT preview first, then run the INSERT block.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── STEP 1: Preview what will be inserted (run this first) ───────────────────
SELECT
  e.id           AS expense_id,
  e.expense_date,
  e.vendor_name,
  e.amount,
  e.payment_mode,
  e.bill_number,
  b.id           AS bill_id,
  b.bill_number  AS matched_bill_number,
  b.total_amount AS bill_total
FROM expenses e
JOIN bills b
  ON b.bill_number = e.bill_number
 AND b.company_id  = e.company_id
WHERE e.source       = 'purchase'
  AND e.bill_number IS NOT NULL
  -- Only where no matching payments_made record exists yet
  AND NOT EXISTS (
    SELECT 1 FROM payments_made pm
    WHERE pm.bill_id      = b.id
      AND pm.amount       = e.amount
      AND pm.payment_date = e.expense_date
      AND pm.company_id   = e.company_id
  );

-- ── STEP 2: Insert the missing payments_made records ─────────────────────────
-- (Only run after confirming the preview above looks correct)

INSERT INTO payments_made (
  company_id,
  payment_number,
  payment_date,
  vendor_name,
  vendor_id,
  bill_id,
  amount,
  payment_mode,
  bank_reference,
  notes,
  created_by
)
SELECT
  e.company_id,
  'PM-BACKFILL-' || to_char(e.expense_date, 'YYYYMMDD') || '-' || ROW_NUMBER() OVER (ORDER BY e.expense_date),
  e.expense_date,
  e.vendor_name,
  NULL,           -- vendor_id not available from expense app
  b.id,           -- bill_id
  e.amount,
  e.payment_mode,
  e.bank_reference,
  'Backfilled from expense app payment (against bill)',
  e.created_by
FROM expenses e
JOIN bills b
  ON b.bill_number = e.bill_number
 AND b.company_id  = e.company_id
WHERE e.source       = 'purchase'
  AND e.bill_number IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM payments_made pm
    WHERE pm.bill_id      = b.id
      AND pm.amount       = e.amount
      AND pm.payment_date = e.expense_date
      AND pm.company_id   = e.company_id
  );

-- After this runs, trg_bill_paid fires for each inserted row and recalculates
-- the bill's paid_amount / balance_due / status correctly.
-- ─────────────────────────────────────────────────────────────────────────────
