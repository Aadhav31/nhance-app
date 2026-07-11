-- Add CIN (Company Identification Number) column to companies table
-- Run this in Supabase SQL Editor

ALTER TABLE companies ADD COLUMN IF NOT EXISTS cin TEXT;

-- (Optional) Pre-fill SRA's CIN if you know the company_id:
-- UPDATE companies SET cin = 'U14200TN2023OPC157908' WHERE name ILIKE '%SRA%';
