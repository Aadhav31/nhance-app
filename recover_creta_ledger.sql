-- ─────────────────────────────────────────────────────────────────────────────
-- recover_creta_ledger.sql
-- Recovers missing expense + account_transaction entries for Creta EMI
-- that was marked paid but ledger entries were never created due to a
-- previous constraint bug (reference_type / payment_mode).
--
-- Run ONCE in Supabase SQL Editor.
-- Safe to run — checks for duplicates before inserting.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_company_id   UUID;
  v_exp_id       UUID;
  v_paid_date    DATE    := '2026-07-07';
  v_amount       NUMERIC := 47521;
  v_description  TEXT    := 'Creta';
  v_vendor       TEXT    := 'HDFC Bank Ltd';
  v_pay_mode     TEXT    := 'cheque';
  v_period       TEXT    := '2026-07';
BEGIN
  -- Get company_id from the fixed_expense_payments record
  SELECT fep.company_id INTO v_company_id
  FROM fixed_expense_payments fep
  JOIN fixed_expenses fe ON fe.id = fep.fixed_expense_id
  WHERE fe.name ILIKE '%creta%'
    AND fep.period_month = v_period
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Could not find Creta fixed expense payment — check name/period';
    RETURN;
  END IF;

  -- Check if expense entry already exists (avoid duplicates)
  IF EXISTS (
    SELECT 1 FROM expenses
    WHERE company_id   = v_company_id
      AND description  ILIKE '%creta%'
      AND expense_date = v_paid_date
      AND amount       = v_amount
  ) THEN
    RAISE NOTICE 'Expense entry already exists — skipping expenses insert';
  ELSE
    INSERT INTO expenses (
      company_id, expense_date, category, description,
      vendor_name, amount, total_amount, payment_mode,
      source, created_by
    )
    SELECT
      v_company_id, v_paid_date, fe.category, v_description,
      v_vendor, v_amount, v_amount, v_pay_mode,
      'manual', fe.created_at::TEXT::UUID
    FROM fixed_expenses fe
    WHERE fe.name ILIKE '%creta%' AND fe.company_id = v_company_id
    LIMIT 1
    RETURNING id INTO v_exp_id;

    RAISE NOTICE 'Inserted expense with id: %', v_exp_id;
  END IF;

  -- Get the expense id if we skipped the insert
  IF v_exp_id IS NULL THEN
    SELECT id INTO v_exp_id FROM expenses
    WHERE company_id   = v_company_id
      AND description  ILIKE '%creta%'
      AND expense_date = v_paid_date
      AND amount       = v_amount
    LIMIT 1;
  END IF;

  -- Check if account_transaction already exists
  IF EXISTS (
    SELECT 1 FROM account_transactions
    WHERE company_id    = v_company_id
      AND txn_date      = v_paid_date
      AND amount        = v_amount
      AND reference_type = 'expense'
      AND reference_id  = v_exp_id
  ) THEN
    RAISE NOTICE 'account_transaction already exists — skipping';
  ELSE
    INSERT INTO account_transactions (
      company_id, txn_date, type, description,
      amount, payment_mode, reference_type, reference_id
    ) VALUES (
      v_company_id, v_paid_date, 'expense',
      v_description || ' – ' || v_period,
      v_amount, v_pay_mode, 'expense', v_exp_id
    );
    RAISE NOTICE 'Inserted account_transaction for Creta ₹%', v_amount;
  END IF;
END $$;

-- Verify
SELECT txn_date, description, amount, payment_mode, reference_type
FROM account_transactions
WHERE description ILIKE '%creta%'
ORDER BY txn_date DESC
LIMIT 5;
