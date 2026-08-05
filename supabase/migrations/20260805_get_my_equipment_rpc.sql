-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: get_my_equipment RPC
--
-- Called by OperatorPortal to find the equipment assigned to the logged-in user.
-- Logic:
--   1. auth.uid() → look up hr_employees.user_id → get employee record
--   2. Look up equipment_assignments where employee_id matches → get equipment_id
--   3. Join equipment table → return equipment row + assignment shift_type
--
-- SECURITY DEFINER so it bypasses RLS and can read across tables safely.
-- The function itself enforces the auth.uid() binding, so it's safe.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_equipment()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id   UUID;
  v_assignment    RECORD;
  v_equipment     RECORD;
  v_result        jsonb;
BEGIN
  -- Step 1: resolve auth.uid() → hr_employees
  SELECT id INTO v_employee_id
  FROM hr_employees
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN NULL;  -- operator not linked to an HR employee record
  END IF;

  -- Step 2: find active assignment (pick most recent if multiple)
  SELECT *
  INTO v_assignment
  FROM equipment_assignments
  WHERE employee_id = v_employee_id
    AND equipment_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_assignment IS NULL OR v_assignment.equipment_id IS NULL THEN
    RETURN NULL;  -- no machine assigned
  END IF;

  -- Step 3: fetch equipment details
  SELECT *
  INTO v_equipment
  FROM equipment
  WHERE id = v_assignment.equipment_id
  LIMIT 1;

  IF v_equipment IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build result — include assignment_shift_type so portal can use it
  v_result := jsonb_build_object(
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
    -- from assignment (fallback shift type)
    'assignment_shift_type',  v_assignment.shift_type,
    'assignment_id',          v_assignment.id,
    'assignment_role',        v_assignment.assignment_role
  );

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION get_my_equipment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_equipment() TO authenticated;

NOTIFY pgrst, 'reload schema';
