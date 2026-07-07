-- ============================================================
-- Field Expenses → Accounts Sync  (schema-corrected final)
-- Run in Supabase SQL Editor → fresh tab → paste all → Run
-- ============================================================


-- Step 1: Convert ENUM columns → TEXT
--   category and payment_mode are both custom ENUMs.
--   Casting to text preserves existing data and allows any string.
-- ============================================================
ALTER TABLE expenses
  ALTER COLUMN category     TYPE text USING category::text;

ALTER TABLE expenses
  ALTER COLUMN payment_mode TYPE text USING payment_mode::text;


-- Step 2: Add missing columns (all safe with IF NOT EXISTS)
-- ============================================================
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS vendor_name      text,
  ADD COLUMN IF NOT EXISTS bank_reference   text,
  ADD COLUMN IF NOT EXISTS payment_mode     text,
  ADD COLUMN IF NOT EXISTS source           text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS field_expense_id uuid;


-- Step 3: Unique index — prevents double-syncing the same field expense
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS expenses_field_expense_uidx
  ON expenses(field_expense_id)
  WHERE field_expense_id IS NOT NULL;


-- Step 4: FK constraint (drop first so re-runs don't fail)
-- ============================================================
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_field_expense_fk;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_field_expense_fk
  FOREIGN KEY (field_expense_id)
  REFERENCES field_expenses(id)
  ON DELETE CASCADE;


-- Step 5: INSERT trigger
--   Fires on every field_expenses insert (web app, APK, anything).
--   Maps bank_transfer → bank and card → card for payment_mode.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_sync_field_expense_to_accounts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_desc     text;
  v_pay_mode text;
BEGIN
  -- Guard: already synced
  IF EXISTS (SELECT 1 FROM expenses WHERE field_expense_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Human-readable description
  v_desc := CASE
    WHEN NEW.description IS NOT NULL AND NEW.payee_name IS NOT NULL
      THEN NEW.description || ' — ' || NEW.payee_name
    WHEN NEW.description IS NOT NULL THEN NEW.description
    WHEN NEW.payee_name  IS NOT NULL THEN NEW.payee_name
    ELSE REPLACE(INITCAP(COALESCE(NEW.category, 'Expense')), '_', ' ')
  END;

  -- Map payment modes that differ between the two modules
  v_pay_mode := CASE COALESCE(NEW.payment_mode, 'cash')
    WHEN 'bank_transfer' THEN 'bank'
    WHEN 'card'          THEN 'cash'   -- nearest safe fallback
    ELSE COALESCE(NEW.payment_mode, 'cash')
  END;

  INSERT INTO expenses (
    company_id,    expense_date,                          category,
    description,   vendor_name,   amount,   tax_amount,
    payment_mode,  bank_reference, equipment_id,
    created_by,    source,         field_expense_id
  ) VALUES (
    NEW.company_id,
    COALESCE(NEW.expense_date, CURRENT_DATE),
    COALESCE(NEW.category, 'misc'),
    v_desc,
    NEW.payee_name,
    COALESCE(NEW.amount, 0),
    0,               -- tax_amount: field expenses don't track tax separately
    v_pay_mode,
    NEW.transaction_ref,
    NEW.equipment_id,
    NEW.created_by,
    'field_expense',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_field_expense_to_accounts ON field_expenses;

CREATE TRIGGER trg_sync_field_expense_to_accounts
  AFTER INSERT ON field_expenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_field_expense_to_accounts();


-- Step 6: DELETE cleanup trigger
--   The FK CASCADE auto-deletes the expenses row.
--   This trigger cleans up account_transactions if any were linked.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_cleanup_field_expense_accounts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM account_transactions
  WHERE reference_type = 'expense'
    AND reference_id IN (
      SELECT id FROM expenses WHERE field_expense_id = OLD.id
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_field_expense_accounts ON field_expenses;

CREATE TRIGGER trg_cleanup_field_expense_accounts
  BEFORE DELETE ON field_expenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_cleanup_field_expense_accounts();


-- Step 7: Backfill — sync existing field expenses not yet in expenses table
-- ============================================================
INSERT INTO expenses (
  company_id,    expense_date,    category,
  description,   vendor_name,     amount,   tax_amount,
  payment_mode,  bank_reference,  equipment_id,
  created_by,    source,          field_expense_id
)
SELECT
  fe.company_id,
  COALESCE(fe.expense_date, CURRENT_DATE),
  COALESCE(fe.category, 'misc'),
  CASE
    WHEN fe.description IS NOT NULL AND fe.payee_name IS NOT NULL
      THEN fe.description || ' — ' || fe.payee_name
    WHEN fe.description IS NOT NULL THEN fe.description
    WHEN fe.payee_name  IS NOT NULL THEN fe.payee_name
    ELSE REPLACE(INITCAP(COALESCE(fe.category, 'Expense')), '_', ' ')
  END,
  fe.payee_name,
  COALESCE(fe.amount, 0),
  0,
  CASE COALESCE(fe.payment_mode, 'cash')
    WHEN 'bank_transfer' THEN 'bank'
    WHEN 'card'          THEN 'cash'
    ELSE COALESCE(fe.payment_mode, 'cash')
  END,
  fe.transaction_ref,
  fe.equipment_id,
  fe.created_by,
  'field_expense',
  fe.id
FROM field_expenses fe
WHERE NOT EXISTS (
  SELECT 1 FROM expenses e WHERE e.field_expense_id = fe.id
)
ON CONFLICT (field_expense_id) DO NOTHING;


-- Confirmation
SELECT
  'Done. ' || COUNT(*) || ' field expense(s) now visible in Accounts.' AS status
FROM expenses
WHERE source = 'field_expense';
