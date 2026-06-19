-- fleet_schema_v4.sql
-- Adds ON DELETE CASCADE to all equipment foreign keys
-- so deleting an equipment record cleans up shifts, fuel, assignments, incidents

-- Shifts
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_equipment_id_fkey;
ALTER TABLE shifts ADD CONSTRAINT shifts_equipment_id_fkey
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;

-- Fuel entries
ALTER TABLE fuel_entries DROP CONSTRAINT IF EXISTS fuel_entries_equipment_id_fkey;
ALTER TABLE fuel_entries ADD CONSTRAINT fuel_entries_equipment_id_fkey
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;

-- Equipment assignments
ALTER TABLE equipment_assignments DROP CONSTRAINT IF EXISTS equipment_assignments_equipment_id_fkey;
ALTER TABLE equipment_assignments ADD CONSTRAINT equipment_assignments_equipment_id_fkey
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;

-- Incidents (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'incidents') THEN
    ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_equipment_id_fkey;
    ALTER TABLE incidents ADD CONSTRAINT incidents_equipment_id_fkey
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
