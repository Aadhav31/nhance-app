-- Add default selling rate to crusher grades
ALTER TABLE crusher_grades
  ADD COLUMN IF NOT EXISTS default_rate NUMERIC(14,2) NOT NULL DEFAULT 0;
