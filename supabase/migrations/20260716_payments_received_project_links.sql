-- Migration: propagate project/equipment context from invoices to payments_received
-- Run in Supabase SQL Editor

-- 1. Add project/equipment columns to payments_received
ALTER TABLE payments_received
  ADD COLUMN IF NOT EXISTS project_id       UUID,
  ADD COLUMN IF NOT EXISTS inv_equipment_id UUID,
  ADD COLUMN IF NOT EXISTS project_name     TEXT;

-- 2. Add project/equipment columns to account_transactions (for P&L attribution on income entries)
ALTER TABLE account_transactions
  ADD COLUMN IF NOT EXISTS project_id       UUID,
  ADD COLUMN IF NOT EXISTS inv_equipment_id UUID;

-- 3. Back-fill existing payments that are linked to invoices
--    (pulls project_id, inv_equipment_id, project_name from the linked invoice)
UPDATE payments_received pr
SET
  project_id       = ci.project_id,
  inv_equipment_id = ci.inv_equipment_id,
  project_name     = ci.project_name
FROM client_invoices ci
WHERE pr.invoice_id = ci.id
  AND pr.invoice_id IS NOT NULL
  AND (ci.project_id IS NOT NULL OR ci.inv_equipment_id IS NOT NULL);

-- 4. Back-fill account_transactions for payment_received type entries
UPDATE account_transactions at
SET
  project_id       = pr.project_id,
  inv_equipment_id = pr.inv_equipment_id
FROM payments_received pr
WHERE at.reference_type = 'payment_received'
  AND at.reference_id   = pr.id
  AND (pr.project_id IS NOT NULL OR pr.inv_equipment_id IS NOT NULL);

-- Done. Verify with:
-- SELECT id, payment_number, project_name, project_id, inv_equipment_id FROM payments_received LIMIT 20;
