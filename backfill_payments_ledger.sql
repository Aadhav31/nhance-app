-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Widen both check constraints on account_transactions
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow 'rtgs' in payment_mode
ALTER TABLE account_transactions
  DROP CONSTRAINT IF EXISTS account_transactions_payment_mode_check;
ALTER TABLE account_transactions
  ADD CONSTRAINT account_transactions_payment_mode_check
  CHECK (payment_mode IN ('cash','bank','upi','cheque','neft','rtgs'));

-- Allow 'payment_received' and 'payment_made' in reference_type
ALTER TABLE account_transactions
  DROP CONSTRAINT IF EXISTS account_transactions_reference_type_check;
ALTER TABLE account_transactions
  ADD CONSTRAINT account_transactions_reference_type_check
  CHECK (reference_type IN ('invoice','expense','bill','payment_received','payment_made','other'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Backfill payments_received → account_transactions (income)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO account_transactions (
  company_id, txn_date, type, description,
  amount, payment_mode, bank_reference,
  reference_type, reference_id, notes, created_by
)
SELECT
  pr.company_id,
  pr.payment_date,
  'income',
  'Payment received — ' || pr.payment_number || ' (' || pr.client_name || ')',
  pr.amount,
  pr.payment_mode,
  pr.bank_reference,
  'payment_received',
  pr.id,
  pr.notes,
  pr.created_by
FROM payments_received pr
WHERE NOT EXISTS (
  SELECT 1 FROM account_transactions at
  WHERE at.reference_type = 'payment_received'
    AND at.reference_id   = pr.id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Backfill payments_made → account_transactions (expense)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO account_transactions (
  company_id, txn_date, type, description,
  amount, payment_mode, bank_reference,
  reference_type, reference_id, notes, created_by
)
SELECT
  pm.company_id,
  pm.payment_date,
  'expense',
  'Payment made — ' || pm.payment_number || ' (' || COALESCE(pm.vendor_name, '') || ')',
  pm.amount,
  pm.payment_mode,
  pm.bank_reference,
  'payment_made',
  pm.id,
  pm.notes,
  pm.created_by
FROM payments_made pm
WHERE NOT EXISTS (
  SELECT 1 FROM account_transactions at
  WHERE at.reference_type = 'payment_made'
    AND at.reference_id   = pm.id
);
