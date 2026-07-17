-- Add attachment URL column to bills
-- Stores path/URL of uploaded vendor bill scan (photo or PDF) in nhance-photos bucket

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;
