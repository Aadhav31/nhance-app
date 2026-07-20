-- Add driver_name + unloading_address to crusher_invoices
ALTER TABLE crusher_invoices
  ADD COLUMN IF NOT EXISTS driver_name       text,
  ADD COLUMN IF NOT EXISTS unloading_address text;
