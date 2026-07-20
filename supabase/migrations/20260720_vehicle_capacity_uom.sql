-- Add capacity unit of measure to crusher_client_vehicles
ALTER TABLE crusher_client_vehicles
  ADD COLUMN IF NOT EXISTS capacity_uom TEXT NOT NULL DEFAULT 'tonnes'
    CHECK (capacity_uom IN ('tonnes', 'cum', 'units'));
