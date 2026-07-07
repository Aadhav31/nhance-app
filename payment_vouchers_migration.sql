-- ============================================================
-- Payment Vouchers — Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Create payment_vouchers table
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_vouchers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voucher_number   text        NOT NULL,
  voucher_date     date        NOT NULL,
  expense_id       uuid        REFERENCES field_expenses(id) ON DELETE SET NULL,

  payee_name       text        NOT NULL,
  payee_type       text,                            -- vendor | operator | direct
  payee_id         uuid,

  amount           numeric(15,2) NOT NULL DEFAULT 0,
  payment_mode     text        NOT NULL DEFAULT 'cash',
  transaction_ref  text,

  category         text,
  description      text,
  bill_number      text,
  bill_photo_url   text,

  equipment_id     uuid,
  equipment_name   text,
  project_id       uuid,
  project_name     text,

  created_by       uuid        REFERENCES auth.users(id),
  created_by_name  text,
  created_by_role  text,

  status           text        NOT NULL DEFAULT 'paid',  -- paid | cancelled
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
-- ============================================================
-- Voucher number must be unique per company (handles concurrent inserts)
CREATE UNIQUE INDEX IF NOT EXISTS pv_company_number_uidx
  ON payment_vouchers(company_id, voucher_number);

CREATE INDEX IF NOT EXISTS pv_company_date_idx
  ON payment_vouchers(company_id, voucher_date DESC);

CREATE INDEX IF NOT EXISTS pv_expense_idx
  ON payment_vouchers(expense_id);

CREATE INDEX IF NOT EXISTS pv_created_by_idx
  ON payment_vouchers(created_by);

-- 3. Row-Level Security
-- ============================================================
ALTER TABLE payment_vouchers ENABLE ROW LEVEL SECURITY;

-- Company members can view their own vouchers
DROP POLICY IF EXISTS "Company members view vouchers" ON payment_vouchers;
CREATE POLICY "Company members view vouchers"
  ON payment_vouchers FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- No INSERT policy needed — the trigger function runs SECURITY DEFINER
-- and bypasses RLS automatically.

-- 4. Trigger function — creates voucher atomically on every field_expenses INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION fn_auto_create_payment_voucher()
RETURNS TRIGGER
SECURITY DEFINER                    -- runs as DB owner, bypasses RLS
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_voucher_date date;
  v_count        int;
  v_voucher_num  text;
  v_attempt      int := 0;
BEGIN
  v_voucher_date := COALESCE(NEW.expense_date, CURRENT_DATE);

  -- Retry loop handles the rare case of two concurrent inserts on the same
  -- company + date hitting the unique index simultaneously.
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
        company_id,     voucher_number,   voucher_date,    expense_id,
        payee_name,     payee_type,       payee_id,
        amount,         payment_mode,     transaction_ref,
        category,       description,      bill_number,     bill_photo_url,
        equipment_id,   equipment_name,   project_id,      project_name,
        created_by,     created_by_name,  created_by_role, status
      ) VALUES (
        NEW.company_id,
        v_voucher_num,
        v_voucher_date,
        NEW.id,

        COALESCE(NEW.payee_name, 'Unknown'),
        NEW.payee_type,
        NEW.payee_id,

        COALESCE(NEW.amount, 0),
        COALESCE(NEW.payment_mode, 'cash'),
        NEW.transaction_ref,

        NEW.category,
        NEW.description,
        NEW.bill_number,
        NEW.bill_photo_url,

        NEW.equipment_id,
        NEW.equipment_name,
        NEW.project_id,
        NEW.project_name,

        NEW.created_by,
        NEW.created_by_name,
        NEW.created_by_role,
        COALESCE(NEW.payment_status, 'paid')
      );

      EXIT;  -- success — leave the loop

    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt > 10 THEN
        RAISE EXCEPTION 'payment_vouchers: could not generate unique voucher number after 10 attempts';
      END IF;
      -- loop again with v_attempt incremented
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 5. Attach trigger to field_expenses
-- ============================================================
DROP TRIGGER IF EXISTS trg_auto_payment_voucher ON field_expenses;

CREATE TRIGGER trg_auto_payment_voucher
  AFTER INSERT ON field_expenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_create_payment_voucher();

-- ============================================================
-- Done.
-- Every INSERT into field_expenses — from web app, APK, or any
-- future client — will automatically produce a payment voucher
-- with a sequential voucher number in the same DB transaction.
-- ============================================================
