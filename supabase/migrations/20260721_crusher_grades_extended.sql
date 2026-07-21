-- ─────────────────────────────────────────────────────────────────────────────
-- Extend crusher_grades:
--   1. default_uom  — billing unit per material (tonnes / cum / units / bags / trips)
--   2. category     — grouping label (Sand, Jelly & Aggregate, GSB, WMM, Boulders, Others)
--   3. rate_revised_at — timestamp auto-updated whenever default_rate changes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crusher_grades
  ADD COLUMN IF NOT EXISTS default_uom      text NOT NULL DEFAULT 'tonnes'
    CHECK (default_uom IN ('tonnes','cum','units','bags','trips')),
  ADD COLUMN IF NOT EXISTS category         text,
  ADD COLUMN IF NOT EXISTS rate_revised_at  timestamptz;

-- Trigger: auto-set rate_revised_at whenever default_rate is updated
CREATE OR REPLACE FUNCTION set_grade_rate_revised_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.default_rate IS DISTINCT FROM OLD.default_rate THEN
    NEW.rate_revised_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grade_rate_revised ON crusher_grades;
CREATE TRIGGER trg_grade_rate_revised
  BEFORE UPDATE ON crusher_grades
  FOR EACH ROW EXECUTE FUNCTION set_grade_rate_revised_at();

-- Backfill rate_revised_at for existing rows that already have a rate
UPDATE crusher_grades
  SET rate_revised_at = created_at
  WHERE default_rate IS NOT NULL AND default_rate > 0 AND rate_revised_at IS NULL;
