-- equipment_shift_schedule_schema.sql
-- Define per-equipment shift timing so the system can alert on late start / overdue end
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS equipment_shift_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    UUID REFERENCES equipment(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id),

  shift_count     INT  DEFAULT 1 CHECK (shift_count BETWEEN 1 AND 3),

  -- Shift 1 (always present)
  shift1_label    TEXT DEFAULT 'Day',
  shift1_start    TIME,          -- e.g. '06:00'
  shift1_end      TIME,          -- e.g. '18:00'

  -- Shift 2 (double/triple only)
  shift2_label    TEXT,
  shift2_start    TIME,
  shift2_end      TIME,

  -- Shift 3 (triple only)
  shift3_label    TEXT,
  shift3_start    TIME,
  shift3_end      TIME,

  -- Alert config
  alert_enabled   BOOLEAN DEFAULT true,
  grace_minutes   INT DEFAULT 30,    -- alert fires X minutes after scheduled time

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE (equipment_id)              -- one schedule per machine
);

-- RLS
ALTER TABLE equipment_shift_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read shift schedules"
  ON equipment_shift_schedule FOR SELECT
  USING (company_id = (SELECT company_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin can manage shift schedules"
  ON equipment_shift_schedule FOR ALL
  USING (company_id = (SELECT company_id FROM user_profiles WHERE user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';

-- ── How this connects ─────────────────────────────────────────────────────────
-- 1. Admin opens Fleet → Equipment → Shift Schedule section
-- 2. Selects 1 / 2 / 3 shifts and sets start+end time for each
-- 3. Operations module reads this schedule and checks:
--      • Is it past (shift_start + grace_minutes) and no open shift? → LATE START alert
--      • Is it past (shift_end   + grace_minutes) and shift still open? → OVERDUE END alert
-- 4. Alerts appear as banners in the Daily Operations screen

