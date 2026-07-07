-- ============================================================
-- PATCH: Sync field expenses → account_transactions
-- Run in a fresh Supabase SQL Editor tab
-- This makes the Accounts Overview totals reflect field expenses
-- ============================================================


-- Step 1: Update trigger to also write account_transactions
-- ============================================================
CREATE OR REPLACE FUNCTION fn_sync_field_expense_to_accounts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_desc     text;
  v_pay_mode text;
  v_exp_id   uuid;
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
    ELSE REPLACE(INITCAP(COALESCE(NEW.category::text, 'Expense')), '_', ' ')
  END;

  -- Map payment modes
  v_pay_mode := CASE COALESCE(NEW.payment_mode::text, 'cash')
    WHEN 'bank_transfer' THEN 'bank'
    WHEN 'card'          THEN 'cash'
    ELSE COALESCE(NEW.payment_mode::text, 'cash')
  END;

  -- 1. Insert into expenses
  INSERT INTO expenses (
    company_id,    expense_date,    category,
    description,   vendor_name,     amount,    tax_amount,  total_amount,
    payment_mode,  bank_reference,  equipment_id,
    created_by,    source,          field_expense_id
  ) VALUES (
    NEW.company_id,
    COALESCE(NEW.expense_date, CURRENT_DATE),
    COALESCE(NEW.category::text, 'misc'),
    v_desc,
    NEW.payee_name,
    COALESCE(NEW.amount, 0),
    0,
    COALESCE(NEW.amount, 0),
    v_pay_mode,
    NEW.transaction_ref,
    NEW.equipment_id,
    NEW.created_by,
    'field_expense',
    NEW.id
  )
  RETURNING id INTO v_exp_id;

  -- 2. Insert into account_transactions
  INSERT INTO account_transactions (
    company_id,   txn_date,                    type,
    description,  amount,    gst_amount,
    payment_mode, bank_reference,  reference_type,  reference_id,
    equipment_id, created_by
  ) VALUES (
    NEW.company_id,
    COALESCE(NEW.expense_date, CURRENT_DATE),
    'expense',
    v_desc,
    COALESCE(NEW.amount, 0),
    0,
    v_pay_mode,
    NEW.transaction_ref,
    'expense',
    v_exp_id,
    NEW.equipment_id,
    NEW.created_by
  );

  RETURN NEW;
END;
$$;


-- Step 2: Backfill account_transactions for the 4 existing synced expenses
-- ============================================================
DO $$
DECLARE
  r   RECORD;
  tid uuid;
BEGIN
  FOR r IN
    SELECT * FROM expenses
    WHERE source = 'field_expense'
      AND NOT EXISTS (
        SELECT 1 FROM account_transactions at
        WHERE at.reference_id = expenses.id AND at.reference_type = 'expense'
      )
  LOOP
    INSERT INTO account_transactions (
      company_id,   txn_date,          type,
      description,  amount,  gst_amount,
      payment_mode, bank_reference,  reference_type,  reference_id,
      equipment_id, created_by
    ) VALUES (
      r.company_id,
      r.expense_date,
      'expense',
      r.description,
      r.amount,
      0,
      r.payment_mode,
      r.bank_reference,
      'expense',
      r.id,
      r.equipment_id,
      r.created_by
    );
  END LOOP;
END;
$$;


-- Confirmation
SELECT
  'Done. ' || COUNT(*) || ' account_transactions entries for field expenses.' AS status
FROM account_transactions at
JOIN expenses e ON e.id = at.reference_id AND at.reference_type = 'expense'
WHERE e.source = 'field_expense';
