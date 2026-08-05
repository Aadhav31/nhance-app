-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: get_my_equipment v2
--
-- Priority order:
--   1. Check operator_substitutions for today with substitute_operator_id = auth.uid()
--      → If found: return that equipment + shift_type + is_substitution = true
--         (bypass shift window — admin already approved)
--   2. Fallback: equipment_assignments where employee_id = linked hr_employee
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
  -- ── Priority 1: Active substitution for today ─────────────────────────────
  -- substitute_operator_id links directly to user_profiles.id (= auth.uid())
  SELECT *
  INTO v_sub
  FROM operator_substitutions
  WHERE substitute_operator_id = v_uid
    AND shift_date = CURRENT_DATE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NOT NULL THEN
    SELECT * INTO v_equipment FROM equipment WHERE id = v_sub.equipment_id LIMIT 1;
    IF v_equipment IS NULL THEN RETURN NULL; END IF;

    RETURN jsonb_build_object(
      'id',                    v_equipment.id,
      'name',                  v_equipment.name,
      'equipment_number',      v_equipment.equipment_number,
      'category',              v_equipment.category,
      'make',                  v_equipment.make,
      'model',                 v_equipment.model,
      'status',                v_equipment.status,
      'current_meter_reading', v_equipment.current_meter_reading,
      'current_project_id',    v_equipment.current_project_id,
      'default_shift_type',    v_sub.shift_type,        -- use substitution's shift type
      'assignment_shift_type', v_sub.shift_type,
      'assignment_id',         v_sub.id,
      'assignment_role',       'primary_operator',
      'is_substitution',       true,                    -- portal uses this to bypass window check
      'substitution_id',       v_sub.id
    );
  END IF;

  -- ── Priority 2: Regular equipment_assignment ──────────────────────────────
  -- equipment_assignments.employee_id references hr_employees.id
  -- so we need to resolve auth.uid() → hr_employees first
  SELECT id INTO v_employee_id
  FROM hr_employees
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_employee_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_assignment
  FROM equipment_assignments
  WHERE employee_id = v_employee_id
    AND equipment_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_assignment IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_equipment FROM equipment WHERE id = v_assignment.equipment_id LIMIT 1;
  IF v_equipment IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id',                    v_equipment.id,
    'name',                  v_equipment.name,
    'equipment_number',      v_equipment.equipment_number,
    'category',              v_equipment.category,
    'make',                  v_equipment.make,
    'model',                 v_equipment.model,
    'status',                v_equipment.status,
    'current_meter_reading', v_equipment.current_meter_reading,
    'current_project_id',    v_equipment.current_project_id,
    'default_shift_type',    v_equipment.default_shift_type,
    'assignment_shift_type', v_assignment.shift_type,
    'assignment_id',         v_assignment.id,
    'assignment_role',       v_assignment.assignment_role,
    'is_substitution',       false,
    'substitution_id',       null
  );
END;
$$;

REVOKE ALL ON FUNCTION get_my_equipment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_equipment() TO authenticated;

NOTIFY pgrst, 'reload schema';
