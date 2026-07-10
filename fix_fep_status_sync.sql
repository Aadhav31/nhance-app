-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: sync fixed_expense_payments status to 'paid'
-- for records whose ledger entries already exist in account_transactions
-- but status was reset to 'pending' by the upsert bug.
--
-- Safe to run multiple times — only updates rows still in 'pending'.
-- Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE fixed_expense_payments fep
SET
  status       = 'paid',
  paid_date    = at.txn_date,
  paid_amount  = at.amount,
  payment_mode = at.payment_mode,
  updated_at   = NOW()
FROM fixed_expenses fe,
     account_transactions at
WHERE fep.fixed_expense_id = fe.id
  AND at.description = fe.name || ' – ' || fep.period_month
  AND at.type = 'expense'
  AND fep.status = 'pending';

-- Verify result
SELECT
  fe.name,
  fep.period_month,
  fep.status,
  fep.paid_date,
  fep.paid_amount,
  fep.payment_mode
FROM fixed_expense_payments fep
JOIN fixed_expenses fe ON fe.id = fep.fixed_expense_id
ORDER BY fep.period_month DESC, fe.name;
