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

-- Step 4: (skipped)
-- account_transactions has no category column so old purchase-only entries
-- cannot be identified and backfilled. They still count in P&L totals.
-- New purchase entries going forward are written to both tables.

-- Confirmation
SELECT
  source,
  COUNT(*) AS count,
  SUM(amount) AS total
FROM expenses
GROUP BY source
ORDER BY source;
