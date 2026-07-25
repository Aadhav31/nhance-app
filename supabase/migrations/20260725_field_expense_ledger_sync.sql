-- ─────────────────────────────────────────────────────────────────────────────
-- 20260725_field_expense_ledger_sync.sql
--
-- Problem:
--   Field expenses (submitted via web app OR mobile APK) appear in the
--   field_expenses table but are ABSENT from the Accounts Ledger
--   (account_transactions table).
--
--   Root cause:
--   • fn_sync_field_expense_to_accounts (from expense_scope_schema.sql)
--     writes field_expenses → expenses only.
--   • task #123 (fix double-counting) removed the account_transactions write.
--   • The expenses trigger (fn_auto_voucher_from_expenses) only fires for
--     source IN ('purchase', 'manual') — not 'field_expense'.
--   • Result: no path from field_expenses → account_transactions.
--
-- Fix:
--   1. Replace fn_sync_field_expense_to_accounts to also write to
--      account_transactions (with EXISTS guard to prevent double-count).
--   2. Backfill all existing field_expenses that are missing from the ledger.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query → paste & run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Widen the reference_type check constraint ────────────────────────────
-- The existing constraint doesn't include 'field_expense'. Drop and recreate
-- it with all values currently used across the codebase.
ALTER TABLE account_transactions
  DROP CONSTRAINT IF EXISTS account_transactions_reference_type_check;

ALTER TABLE account_transactions
  ADD CONSTRAINT account_transactions_reference_type_check
  CHECK (reference_type IN (
    'expense', 'payment_made', 'payment_received', 'invoice',
    'payroll', 'crusher_invoice_payment', 'crusher_advance',
    'field_expense'
  ));

-- ── 1. Updated trigger function ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_field_expense_to_accounts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_desc      text;
  v_pay_mode  text;
  v_scope     text;
BEGIN
  -- ── A. Sync to expenses table ─────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE field_expense_id = NEW.id) THEN

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

    -- Derive expense scope
    v_scope := CASE WHEN NEW.equipment_id IS NOT NULL THEN 'equipment' ELSE 'administrative' END;

    INSERT INTO expenses (
      company_id,    expense_date,    category,
      description,   vendor_name,     amount,    tax_amount,  total_amount,
      payment_mode,  bank_reference,  equipment_id,
      expense_scope, created_by,      source,    field_expense_id
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
      v_scope,
      NEW.created_by,
      'field_expense',
      NEW.id
    );
  END IF;

  -- ── B. Sync to account_transactions (ledger) ──────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM account_transactions
    WHERE reference_type = 'field_expense'
      AND reference_id   = NEW.id
  ) THEN

    -- Build description: "Category — Payee · Payment mode"
    v_desc := INITCAP(REPLACE(COALESCE(NEW.category::text, 'Expense'), '_', ' '));
    IF NEW.payee_name IS NOT NULL THEN
      v_desc := v_desc || ' — ' || NEW.payee_name;
    END IF;
    IF NEW.description IS NOT NULL THEN
      v_desc := v_desc || ' (' || NEW.description || ')';
    END IF;

    -- Normalise payment mode for ledger
    v_pay_mode := CASE COALESCE(NEW.payment_mode::text, 'cash')
      WHEN 'bank_transfer' THEN 'bank'
      WHEN 'card'          THEN 'cash'
      ELSE COALESCE(NEW.payment_mode::text, 'cash')
    END;

    INSERT INTO account_transactions (
      company_id,
      type,
      txn_date,
      description,
      amount,
      payment_mode,
      reference_type,
      reference_id,
      created_by
    ) VALUES (
      NEW.company_id,
      'expense',
      COALESCE(NEW.expense_date, CURRENT_DATE),
      v_desc,
      COALESCE(NEW.amount, 0),
      v_pay_mode,
      'field_expense',
      NEW.id,
      NEW.created_by
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Reattach trigger (idempotent — replaces the old one)
DROP TRIGGER IF EXISTS trg_sync_field_expense_to_accounts ON field_expenses;
CREATE TRIGGER trg_sync_field_expense_to_accounts
  AFTER INSERT ON field_expenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_field_expense_to_accounts();


-- ── 2. Backfill: field_expenses not yet in account_transactions ──────────────
INSERT INTO account_transactions (
  company_id,
  type,
  txn_date,
  description,
  amount,
  payment_mode,
  reference_type,
  reference_id,
  created_by
)
SELECT
  fe.company_id,
  'expense',
  COALESCE(fe.expense_date, fe.created_at::date),
  -- description: "Category — Payee (notes)"
  INITCAP(REPLACE(COALESCE(fe.category::text, 'Expense'), '_', ' '))
    || CASE WHEN fe.payee_name IS NOT NULL THEN ' — ' || fe.payee_name ELSE '' END
    || CASE WHEN fe.description IS NOT NULL THEN ' (' || fe.description || ')' ELSE '' END,
  COALESCE(fe.amount, 0),
  CASE COALESCE(fe.payment_mode::text, 'cash')
    WHEN 'bank_transfer' THEN 'bank'
    WHEN 'card'          THEN 'cash'
    ELSE COALESCE(fe.payment_mode::text, 'cash')
  END,
  'field_expense',
  fe.id,
  fe.created_by
FROM field_expenses fe
WHERE NOT EXISTS (
  SELECT 1 FROM account_transactions at2
  WHERE at2.reference_type = 'field_expense'
    AND at2.reference_id   = fe.id
)
  -- Skip expenses already linked to a bill payment (those are recorded via payments_made)
  AND fe.linked_bill_id IS NULL;


-- ── Done ─────────────────────────────────────────────────────────────────────
-- After this runs:
--   • Every new field_expense INSERT (web or mobile APK) auto-writes a ledger row.
--   • All existing field_expenses without a ledger row are back-filled.
--   • Expenses already linked to bill payments are excluded (avoid double-count).
NOTIFY pgrst, 'reload schema';
