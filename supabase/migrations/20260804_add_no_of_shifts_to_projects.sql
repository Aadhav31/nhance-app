-- Add no_of_shifts to projects table
-- Controls how many operators can be assigned to equipment deployed on this project
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS no_of_shifts integer NOT NULL DEFAULT 1 CHECK (no_of_shifts IN (1, 2));

COMMENT ON COLUMN projects.no_of_shifts IS
  'Number of shifts per day for this project (1 = single, 2 = day + night). Drives max operator slots per equipment.';
