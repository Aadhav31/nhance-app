-- ─────────────────────────────────────────────────────────────────────────────
-- expense_scope_schema.sql
-- Every expense must be linked to a machine (equipment) OR classified as
-- admin overhead.  This enables true per-equipment P&L.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add expense_scope to expenses ──────────────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS expense_scope TEXT
    CHECK (expense_scope IN ('equipment', 'administrative'));

-- Backfill existing records
UPDATE expenses
SET expense_scope = CASE
  WHEN equipment_id IS NOT NULL THEN 'equipment'
  ELSE 'administrative'
END
WHERE expense_scope IS NULL;

-- ── 2. Update field_expense sync trigger to propagate expense_scope ───────────
-- When a field_expense is inserted, the trigger derives scope from equipment_id
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

  RETURN NEW;
END;
$$;

-- Reattach trigger (idempotent)
DROP TRIGGER IF EXISTS trg_sync_field_expense_to_accounts ON field_expenses;
CREATE TRIGGER trg_sync_field_expense_to_accounts
  AFTER INSERT ON field_expenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_field_expense_to_accounts();

-- ── 3. Update trigger that syncs edits ────────────────────────────────────────
-- When a field_expense is updated, also update expense_scope in expenses
CREATE OR REPLACE FUNCTION fn_update_field_expense_sync()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE expenses SET
    expense_scope = CASE WHEN NEW.equipment_id IS NOT NULL THEN 'equipment' ELSE 'administrative' END,
    equipment_id  = NEW.equipment_id
  WHERE field_expense_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_field_expense_scope ON field_expenses;
CREATE TRIGGER trg_update_field_expense_scope
  AFTER UPDATE ON field_expenses
  FOR EACH ROW
  WHEN (OLD.equipment_id IS DISTINCT FROM NEW.equipment_id)
  EXECUTE FUNCTION fn_update_field_expense_sync();

-- ── 4. payroll_postings — tracks which months have been posted to P&L ─────────
CREATE TABLE IF NOT EXISTS payroll_postings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_id     UUID,
  month          INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  year           INT  NOT NULL,
  posted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_by      UUID REFERENCES auth.users(id),
  total_salary   NUMERIC(12,2),
  employee_count INT,
  UNIQUE(company_id, month, year)
);

ALTER TABLE payroll_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_postings_company_access" ON payroll_postings
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Index
CREATE INDEX IF NOT EXISTS payroll_postings_company_idx ON payroll_postings(company_id, year, month);
