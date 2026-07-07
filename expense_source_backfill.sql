-- ============================================================
-- Expense Source Backfill
-- Separates expenses by module so each module shows its own data
-- Run in a fresh Supabase SQL Editor tab
-- ============================================================

-- Step 1: Ensure 'source' column exists on expenses
-- (was added in field_expenses_sync_FINAL.sql — this is safe to re-run)
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Step 2: Tag existing accounts-module expenses (salary, EMI, overhead)
-- These were added via AccountsPage and have no source tag yet
UPDATE expenses
SET source = 'manual'
WHERE source IS NULL
  AND (field_expense_id IS NULL)
  AND category IN ('salary','emi','interest','rent','insurance','admin','misc');

-- Step 3: Tag any existing purchase-category entries in expenses
-- (old entries that may already be there from before the Purchase module change)
UPDATE expenses
SET source = 'purchase'
WHERE source IS NULL
  AND (field_expense_id IS NULL)
  AND category IN ('spares','equipment_purchase','lubricants','maintenance_service','invoice_payment','other','operational');

-- Step 4: Backfill purchase account_transactions into expenses table
-- Old purchase entries only exist in account_transactions — copy them to expenses
-- so the Purchase module can display them
DO $$
DECLARE
  r   RECORD;
  eid uuid;
BEGIN
  FOR r IN
    SELECT at.*
    FROM account_transactions at
    WHERE at.type = 'expense'
      AND (at.reference_type IS NULL OR at.reference_type != 'expense')
      AND at.category IN ('spares','equipment_purchase','lubricants',
                          'maintenance_service','invoice_payment','other','operational')
  LOOP
    -- Check not already backfilled
    IF NOT EXISTS (
      SELECT 1 FROM expenses
      WHERE company_id   = r.company_id
        AND expense_date = r.txn_date
        AND description  = r.description
        AND amount       = r.amount
        AND source       = 'purchase'
    ) THEN
      INSERT INTO expenses (
        company_id, expense_date, category, description,
        amount, total_amount, gst_amount,
        payment_mode, bank_reference,
        source, created_by
      ) VALUES (
        r.company_id, r.txn_date,
        COALESCE(r.category, 'other'),
        r.description,
        r.amount, r.amount,
        COALESCE(r.gst_amount, 0),
        r.payment_mode,
        r.bank_reference,
        'purchase',
        r.created_by
      ) RETURNING id INTO eid;

      -- Link account_transaction back to the new expenses row
      UPDATE account_transactions
      SET reference_type = 'expense', reference_id = eid
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- Confirmation
SELECT
  source,
  COUNT(*) AS count,
  SUM(amount) AS total
FROM expenses
GROUP BY source
ORDER BY source;
