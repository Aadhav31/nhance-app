// All standard construction equipment types used in India
// meter_type: 'hours' | 'kilometers' | 'both'

export const EQUIPMENT_CATEGORIES = [
  // ── Earth Moving ──────────────────────────────────────────
  { category: 'Excavator (Hydraulic)',     meter_type: 'hours' },
  { category: 'Backhoe Loader',            meter_type: 'hours' },
  { category: 'Wheel Loader',              meter_type: 'hours' },
  { category: 'Skid Steer Loader',         meter_type: 'hours' },
  { category: 'Motor Grader',              meter_type: 'hours' },
  { category: 'Dozer / Bulldozer',         meter_type: 'hours' },
  { category: 'Soil Compactor',            meter_type: 'hours' },
  { category: 'Scraper',                   meter_type: 'hours' },
  // ── Road Construction ─────────────────────────────────────
  { category: 'Vibratory Roller',          meter_type: 'hours' },
  { category: 'Static Roller',             meter_type: 'hours' },
  { category: 'Pneumatic Tyre Roller',     meter_type: 'hours' },
  { category: 'Asphalt Paver',             meter_type: 'hours' },
  { category: 'Cold Milling Machine',      meter_type: 'hours' },
  { category: 'Bitumen Sprayer',           meter_type: 'both'  },
  { category: 'Hot Mix Plant',             meter_type: 'hours' },
  // ── Lifting & Material Handling ───────────────────────────
  { category: 'Mobile Crane',              meter_type: 'both'  },
  { category: 'Pick & Carry Crane',        meter_type: 'both'  },
  { category: 'Tower Crane',               meter_type: 'hours' },
  { category: 'Crawler Crane',             meter_type: 'hours' },
  { category: 'Overhead Crane',            meter_type: 'hours' },
  { category: 'Forklift',                  meter_type: 'hours' },
  { category: 'Telehandler',               meter_type: 'both'  },
  { category: 'Reach Stacker',             meter_type: 'both'  },
  { category: 'Scissor Lift / AWP',        meter_type: 'hours' },
  { category: 'Man Lift / Boom Lift',      meter_type: 'hours' },
  // ── Piling & Foundation ───────────────────────────────────
  { category: 'Piling Rig',               meter_type: 'hours' },
  { category: 'Rotary Drilling Rig',       meter_type: 'hours' },
  { category: 'Bore Well Machine',         meter_type: 'hours' },
  { category: 'Vibratory Piling Hammer',   meter_type: 'hours' },
  // ── Concrete Equipment ────────────────────────────────────
  { category: 'Transit Mixer',             meter_type: 'both'  },
  { category: 'Concrete Pump',             meter_type: 'hours' },
  { category: 'Boom Placer',               meter_type: 'both'  },
  { category: 'Concrete Batching Plant',   meter_type: 'hours' },
  { category: 'Concrete Mixer (Diesel)',   meter_type: 'hours' },
  // ── Transport (Hours + KM) ────────────────────────────────
  { category: 'Tipper / Dumper',           meter_type: 'both'  },
  { category: 'Hyva Truck',                meter_type: 'both'  },
  { category: 'Low Bed Trailer',           meter_type: 'both'  },
  { category: 'Flat Bed Trailer',          meter_type: 'both'  },
  { category: 'Water Tanker',              meter_type: 'both'  },
  { category: 'Fuel Tanker',               meter_type: 'both'  },
  { category: 'Container Truck',           meter_type: 'both'  },
  // ── Compressors & Generators ──────────────────────────────
  { category: 'Air Compressor',            meter_type: 'hours' },
  { category: 'Generator / DG Set',        meter_type: 'hours' },
  { category: 'Welding Machine',           meter_type: 'hours' },
  // ── Drilling & Cutting ────────────────────────────────────
  { category: 'Rock Breaker / Hydraulic Hammer', meter_type: 'hours' },
  { category: 'Core Cutting Machine',      meter_type: 'hours' },
  { category: 'Jack Hammer',               meter_type: 'hours' },
  // ── Dewatering ────────────────────────────────────────────
  { category: 'Dewatering Pump',           meter_type: 'hours' },
  { category: 'Submersible Pump',          meter_type: 'hours' },
  // ── Compaction ────────────────────────────────────────────
  { category: 'Plate Compactor',           meter_type: 'hours' },
  { category: 'Rammer / Jumping Jack',     meter_type: 'hours' },
  // ── Other ─────────────────────────────────────────────────
  { category: 'Pipe Laying Machine',       meter_type: 'hours' },
  { category: 'Other',                     meter_type: 'hours' },
]

export const CATEGORY_NAMES = EQUIPMENT_CATEGORIES.map(e => e.category)

export function getMeterType(category) {
  return EQUIPMENT_CATEGORIES.find(e => e.category === category)?.meter_type || 'hours'
}

export const STATUS_COLORS = {
  active:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Active' },
  idle:        { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/30',  label: 'Idle' },
  breakdown:   { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30',     label: 'Breakdown' },
  maintenance: { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/30',    label: 'Maintenance' },
  disposed:    { bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/30',   label: 'Disposed' },
}

export const INCIDENT_TYPES = [
  { value: 'breakdown',           label: 'Breakdown' },
  { value: 'regular_maintenance', label: 'Regular Maintenance' },
  { value: 'damage',              label: 'Damaged / Broken' },
  { value: 'safety_issue',        label: 'Safety Issue' },
  { value: 'accident',            label: 'Accident' },
  { value: 'near_miss',           label: 'Near Miss' },
  { value: 'theft',               label: 'Theft' },
  { value: 'other',               label: 'Others' },
]

export const INCIDENT_SEVERITY = [
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
]
