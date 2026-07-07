-- ============================================================
-- PATCH — run this in a fresh Supabase SQL Editor tab
-- Fixes: payment_mode ENUM → text, then backfills field expenses
-- Steps 1-6 already ran. This patch completes the job.
-- ============================================================

-- Fix payment_mode ENUM → text (same issue as category had)
ALTER TABLE expenses
  ALTER COLUMN payment_mode TYPE text USING payment_mode::text;

-- Recreate trigger function (now payment_mode column is text, no cast issues)
CREATE OR REPLACE FUNCTION fn_sync_field_expense_to_accounts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_desc     text;
  v_pay_mode text;
BEGIN
  IF EXISTS (SELECT 1 FROM expenses WHERE field_expense_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_desc := CASE
    WHEN NEW.description IS NOT NULL AND NEW.payee_name IS NOT NULL
      THEN NEW.description || ' — ' || NEW.payee_name
    WHEN NEW.description IS NOT NULL THEN NEW.description
    WHEN NEW.payee_name  IS NOT NULL THEN NEW.payee_name
    ELSE REPLACE(INITCAP(COALESCE(NEW.category, 'Expense')), '_', ' ')
  END;

  v_pay_mode := CASE COALESCE(NEW.payment_mode::text, 'cash')
    WHEN 'bank_transfer' THEN 'bank'
    WHEN 'card'          THEN 'cash'
    ELSE COALESCE(NEW.payment_mode::text, 'cash')
  END;

  INSERT INTO expenses (
    company_id,    expense_date,    category,
    description,   vendor_name,     amount,   tax_amount,
    payment_mode,  bank_reference,  equipment_id,
    created_by,    source,          field_expense_id
  ) VALUES (
    NEW.company_id,
    COALESCE(NEW.expense_date, CURRENT_DATE),
    COALESCE(NEW.category, 'misc'),
    v_desc,
    NEW.payee_name,
    COALESCE(NEW.amount, 0),
    0,
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

-- Backfill existing field expenses
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
  CASE COALESCE(fe.payment_mode::text, 'cash')
    WHEN 'bank_transfer' THEN 'bank'
    WHEN 'card'          THEN 'cash'
    ELSE COALESCE(fe.payment_mode::text, 'cash')
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
