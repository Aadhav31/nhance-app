-- Activate accounts, sales, and purchase for ALL companies
-- Run this in Supabase SQL Editor

INSERT INTO company_modules (company_id, module_key)
SELECT id, 'accounts'::module_key FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO company_modules (company_id, module_key)
SELECT id, 'sales'::module_key FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO company_modules (company_id, module_key)
SELECT id, 'purchase'::module_key FROM companies
ON CONFLICT DO NOTHING;
