-- Activate all modules for ALL companies
-- Run this in Supabase SQL Editor after running inventory_schema.sql

-- Accounts
INSERT INTO company_modules (company_id, module_key, is_enabled)
SELECT id, 'accounts'::module_key, true FROM companies
ON CONFLICT (company_id, module_key) DO UPDATE SET is_enabled = true;

-- Sales
INSERT INTO company_modules (company_id, module_key, is_enabled)
SELECT id, 'sales'::module_key, true FROM companies
ON CONFLICT (company_id, module_key) DO UPDATE SET is_enabled = true;

-- Purchase
INSERT INTO company_modules (company_id, module_key, is_enabled)
SELECT id, 'purchase'::module_key, true FROM companies
ON CONFLICT (company_id, module_key) DO UPDATE SET is_enabled = true;

-- Inventory
INSERT INTO company_modules (company_id, module_key, is_enabled)
SELECT id, 'inventory'::module_key, true FROM companies
ON CONFLICT (company_id, module_key) DO UPDATE SET is_enabled = true;
