-- Add extra contact + MSME + bank branch fields to companies table
-- bank_name, bank_account_number, bank_ifsc, upi_id already exist from PaymentInfoSettings

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS phone2         text,
  ADD COLUMN IF NOT EXISTS office_phone   text,
  ADD COLUMN IF NOT EXISTS msme           text,
  ADD COLUMN IF NOT EXISTS bank_branch    text;
