-- ─────────────────────────────────────────────────────────────────────────────
-- NHANCE: Field Expenses Module Migration
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create field_expenses table
CREATE TABLE IF NOT EXISTS field_expenses (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        uuid NOT NULL,
  expense_date      date NOT NULL DEFAULT CURRENT_DATE,

  -- Equipment & Project link
  equipment_id      uuid REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_name    text,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_name      text,

  -- Expense classification
  category          text NOT NULL,
  -- values: spares_purchase, salary_payment, invoice_payment, accommodation,
  --         fuel, food, maintenance, site_allowance, other

  -- Payee
  payee_type        text NOT NULL DEFAULT 'vendor',
  -- values: operator, vendor, direct
  payee_name        text NOT NULL,
  payee_id          uuid,        -- hr_employees.id or vendor_id
  payee_upi_id      text,        -- UPI VPA for deep link

  -- Bill details
  bill_number       text,
  bill_photo_url    text,
  description       text,

  -- Amount & Payment
  amount            numeric(12, 2) NOT NULL DEFAULT 0,
  payment_mode      text NOT NULL DEFAULT 'cash',
  -- values: cash, upi, bank_transfer, cheque, card
  transaction_ref   text,        -- UPI TxnID / UTR / Cheque No
  payment_status    text NOT NULL DEFAULT 'paid',
  -- values: paid, pending

  -- Receipt
  receipt_generated boolean DEFAULT false,

  -- Inventory auto-link (for spares_purchase category)
  inv_item_name     text,
  inv_quantity      numeric(10, 3),
  inv_unit          text,
  inv_item_id       uuid,        -- set after inventory item is created/linked
  inv_txn_id        uuid,        -- stock_transaction id

  -- Audit
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name   text,
  created_by_role   text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- 2. Row Level Security
ALTER TABLE field_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "field_expenses_company_access" ON field_expenses;
CREATE POLICY "field_expenses_company_access" ON field_expenses
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_fe_company   ON field_expenses (company_id);
CREATE INDEX IF NOT EXISTS idx_fe_date      ON field_expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_fe_equipment ON field_expenses (equipment_id);
CREATE INDEX IF NOT EXISTS idx_fe_category  ON field_expenses (category);
CREATE INDEX IF NOT EXISTS idx_fe_created   ON field_expenses (created_by);

-- 4. Expense photos storage bucket (run once)
-- Go to Supabase Dashboard → Storage → Create bucket:
--   Name: expense-photos
--   Public: true (so photos can be displayed)

-- 5. Storage policy for expense-photos bucket
-- (Run after creating the bucket in the Dashboard)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'expense-photos'
  ) THEN

    DROP POLICY IF EXISTS "expense_photos_upload" ON storage.objects;
    CREATE POLICY "expense_photos_upload" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'expense-photos'
        AND auth.role() = 'authenticated'
      );

    DROP POLICY IF EXISTS "expense_photos_read" ON storage.objects;
    CREATE POLICY "expense_photos_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'expense-photos');

  END IF;
END $$;

-- Done!
-- Next: Create 'expense-photos' bucket manually in Supabase Dashboard → Storage
