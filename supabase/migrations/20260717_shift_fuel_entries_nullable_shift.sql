-- shift_fuel_entries.shift_id → nullable
-- Fuel logged from the Fleet tab (direct entry) has no shift context.
-- Shift-linked entries (OperatorPortal, OperationsPage) still supply shift_id.

ALTER TABLE shift_fuel_entries
  ALTER COLUMN shift_id DROP NOT NULL;
