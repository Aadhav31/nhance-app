-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: get_my_equipment v3
--
-- Fixes: substitution lookup failing when HRPage stored hr_employees.id
-- instead of user_profiles.id in substitute_operator_id (happens when
-- hr_employees.user_id is null at the time the substitution is saved).
--
-- Priority order:
--   1a. operator_substitutions WHERE substitute_operator_id = auth.uid()
--       (correct path: user_profiles.id stored)
--   1b. operator_substitutions via hr_employees bridge
--       (fallback path: hr_employees.id was stored due to null user_id)
--   2.  equipment_assignments WHERE employee_id = hr_employee linked to auth.uid()
--
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_my_equipment();

CREATE OR REPLACE FUNCTION get_my_equipment()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_employee_id   UUID;
  v_sub           RECORD;
  v_assignment    RECORD;
  v_equipment     RECORD;
BEGIN

  -- ── Priority 1a: Substitution — correct path (user_profiles.id stored) ──────
  SELECT *
  INTO v_sub
  FROM operator_substitutions
  WHERE substitute_operator_id = v_uid
    AND shift_date = CURRENT_DATE
  ORDER BY created_at DESC
  LIMIT 1;

  -- ── Priority 1b: Substitution — fallback path (hr_employees.id stored) ──────
  -- Happens when hr_employees.user_id was null when the substitution was created
  IF v_sub IS NULL THEN
    SELECT e.id INTO v_employee_id
    FROM hr_employees e
    WHERE e.user_id = v_uid
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      SELECT *
      INTO v_sub
      FROM operator_substitutions
      WHERE substitute_operator_id = v_employee_id   -- stored hr_employees.id by mistake
        AND shift_date = CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- If any substitution found (via either path), return that equipment
  IF v_sub IS NOT NULL THEN
    SELECT * INTO v_equipment FROM equipment WHERE id = v_sub.equipment_id LIMIT 1;
    IF v_equipment IS NULL THEN RETURN NULL; END IF;

    RETURN jsonb_build_object(
      'id',                     v_equipment.id,
      'name',                   v_equipment.name,
      'equipment_number',       v_equipment.equipment_number,
      'category',               v_equipment.category,
      'make',                   v_equipment.make,
      'model',                  v_equipment.model,
      'status',                 v_equipment.status,
      'current_meter_reading',  v_equipment.current_meter_reading,
      'current_project_id',     v_equipment.current_project_id,
      'default_shift_type',     v_sub.shift_type,
      'assignment_shift_type',  v_sub.shift_type,
      'assignment_id',          v_sub.id,
      'assignment_role',        'primary_operator',
      'is_substitution',        true,
      'substitution_id',        v_sub.id
    );
  END IF;

  -- ── Priority 2: Regular assignment via hr_employees ───────────────────────
  -- v_employee_id may already be set from 1b lookup above
  IF v_employee_id IS NULL THEN
    SELECT id INTO v_employee_id
    FROM hr_employees
    WHERE user_id = v_uid
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL THEN
    RETURN NULL;  -- operator has no HR record linked to their login
  END IF;

  SELECT *
  INTO v_assignment
  FROM equipment_assignments
  WHERE employee_id = v_employee_id
    AND equipment_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_assignment IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_equipment FROM equipment WHERE id = v_assignment.equipment_id LIMIT 1;
  IF v_equipment IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id',                     v_equipment.id,
    'name',                   v_equipment.name,
    'equipment_number',       v_equipment.equipment_number,
    'category',               v_equipment.category,
    'make',                   v_equipment.make,
    'model',                  v_equipment.model,
    'status',                 v_equipment.status,
    'current_meter_reading',  v_equipment.current_meter_reading,
    'current_project_id',     v_equipment.current_project_id,
    'default_shift_type',     v_equipment.default_shift_type,
    'assignment_shift_type',  v_assignment.shift_type,
    'assignment_id',          v_assignment.id,
    'assignment_role',        v_assignment.assignment_role,
    'is_substitution',        false,
    'substitution_id',        null
  );

END;
$$;

REVOKE ALL ON FUNCTION get_my_equipment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_equipment() TO authenticated;
NOTIFY pgrst, 'reload schema';
