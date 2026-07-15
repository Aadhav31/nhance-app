-- ─────────────────────────────────────────────────────────────────────────────
-- payment_vouchers_expense_trigger.sql
--
-- Problem:
--   VoucherReceipt shows ₹0 / blank for purchase and payroll expenses because:
--   • Those paths insert into `expenses`, NOT `field_expenses`
--   • The existing trigger (trg_auto_payment_voucher) only fires on field_expenses
--   • The app called onSuccess?.(null) — no voucher data passed to receipt
--
-- Fix:
--   1. Add `expense_src_id` column to payment_vouchers (links back to expenses.id)
--   2. New SECURITY DEFINER trigger on expenses auto-creates the voucher
--      for source IN ('purchase', 'manual')
--   3. App.jsx queries payment_vouchers by expense_src_id to get the voucher
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add linking column to payment_vouchers
ALTER TABLE payment_vouchers
  ADD COLUMN IF NOT EXISTS expense_src_id UUID;

CREATE INDEX IF NOT EXISTS pv_expense_src_idx
  ON payment_vouchers(expense_src_id)
  WHERE expense_src_id IS NOT NULL;

-- 2. Trigger function — mirrors fn_auto_create_payment_voucher but fires on expenses
CREATE OR REPLACE FUNCTION fn_auto_voucher_from_expenses()
RETURNS TRIGGER
SECURITY DEFINER                    -- runs as DB owner, bypasses RLS
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_voucher_date  date;
  v_count         int;
  v_voucher_num   text;
  v_attempt       int := 0;
  v_payee_name    text;
  v_payee_type    text;
  v_user_name     text;
  v_user_role     text;
BEGIN
  -- Only create vouchers for purchase / manual (payroll & overhead) sources
  IF NEW.source NOT IN ('purchase', 'manual') THEN
    RETURN NEW;
  END IF;

  v_voucher_date := COALESCE(NEW.expense_date, CURRENT_DATE);
  v_payee_name   := COALESCE(NEW.vendor_name, 'Unknown');

  -- Determine payee_type from category
  v_payee_type := CASE
    WHEN NEW.category IN ('salary', 'payroll') THEN 'employee'
    ELSE 'vendor'
  END;

  -- Look up creator's display name and role
  SELECT up.full_name INTO v_user_name
  FROM user_profiles up WHERE up.id = NEW.created_by;

  SELECT ur.role INTO v_user_role
  FROM user_roles ur WHERE ur.user_id = NEW.created_by
  LIMIT 1;

  -- Retry loop handles the rare concurrent-insert unique-violation
  LOOP
    SELECT COUNT(*) + 1 + v_attempt INTO v_count
    FROM payment_vouchers
    WHERE company_id   = NEW.company_id
      AND voucher_date = v_voucher_date;

    v_voucher_num :=
      'PV-' || to_char(v_voucher_date, 'YYYYMMDD')
             || '-' || LPAD(v_count::text, 4, '0');

    BEGIN
      INSERT INTO payment_vouchers (
        company_id,      voucher_number,   voucher_date,
        expense_src_id,  payee_name,       payee_type,
        amount,          payment_mode,     transaction_ref,
        category,        description,      bill_number,     bill_photo_url,
        equipment_id,
        created_by,      created_by_name,  created_by_role, status
      ) VALUES (
        NEW.company_id,
        v_voucher_num,
        v_voucher_date,
        NEW.id,                                   -- links back to expenses.id
        v_payee_name,
        v_payee_type,
        COALESCE(NEW.amount, 0),
        COALESCE(NEW.payment_mode, 'cash'),
        NEW.bank_reference,
        NEW.category,
        NEW.description,
        NEW.bill_number,
        NEW.bill_photo_url,
        NEW.equipment_id,
        NEW.created_by,
        COALESCE(v_user_name, NEW.created_by::text),
        v_user_role,
        'paid'
      );

      EXIT;  -- success — leave retry loop

    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt > 10 THEN
        RAISE EXCEPTION 'payment_vouchers: could not generate unique voucher number after 10 attempts';
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger to expenses
DROP TRIGGER IF EXISTS trg_auto_voucher_from_expenses ON expenses;

CREATE TRIGGER trg_auto_voucher_from_expenses
  AFTER INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_voucher_from_expenses();

-- ─────────────────────────────────────────────────────────────────────────────
-- Done.
-- After this runs, every INSERT into expenses with source='purchase' or
-- source='manual' will auto-generate a payment_vouchers row.
-- The app then queries:  .eq('expense_src_id', exp.id)  to fetch it.
-- ─────────────────────────────────────────────────────────────────────────────
