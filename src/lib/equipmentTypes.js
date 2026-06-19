// Equipment types with prefix, sub-categories, and attachments
// meter_type: 'hours' | 'kilometers' | 'both'

export const EQUIPMENT_TYPES = [
  // ── Earth Moving ──────────────────────────────────────────────────────────────
  {
    type: 'Excavator (Hydraulic)',
    prefix: 'EX',
    meter_type: 'hours',
    sub_categories: ['Micro (< 1T)', 'Mini (1–6T)', 'Small (6–14T)', 'Medium (14–30T)', 'Large (30–50T)', 'Heavy / Mining (> 50T)'],
    attachments: [
      'Digging Bucket (Standard)', 'Rock Bucket', 'Grading / Ditching Bucket', 'Trenching Bucket',
      'Hydraulic Breaker / Rock Hammer', 'Demolition Grapple', 'Sorting Grapple', 'Orange-Peel Grapple',
      'Auger Drive', 'Vibratory Compactor Plate', 'Ripper', 'Thumb Attachment',
      'Screening Bucket', 'Crushing Bucket', 'Quick Coupler', 'Tilt Rotator',
    ],
  },
  {
    type: 'Backhoe Loader',
    prefix: 'BL',
    meter_type: 'hours',
    sub_categories: ['Standard (75–100 HP)', 'High Performance (100–120 HP)', 'Extended Hoe'],
    attachments: [
      'Front Loader Bucket', 'Rear Digging Bucket', 'Rock Breaker (Rear)', 'Auger',
      'Pallet Forks (Front)', 'Compactor Wheel', 'Ditch Cleaning Bucket', '4-in-1 Bucket',
    ],
  },
  {
    type: 'Wheel Loader',
    prefix: 'WL',
    meter_type: 'hours',
    sub_categories: ['Small (< 2 m³)', 'Medium (2–3.5 m³)', 'Large (> 3.5 m³)'],
    attachments: [
      'Standard Bucket', 'Rock / High-Tip Bucket', 'Pallet Forks', 'Grapple Bucket',
      'Dozing Blade', 'Side Tipping Bucket', 'Timber Grapple', 'Bale Clamp', 'Snow Blade',
    ],
  },
  {
    type: 'Skid Steer Loader',
    prefix: 'SS',
    meter_type: 'hours',
    sub_categories: ['Compact', 'Standard', 'Large Frame'],
    attachments: [
      'Dirt Bucket', 'Rock Bucket', 'Pallet Forks', 'Auger', 'Sweeper Broom',
      'Trencher', 'Hydraulic Breaker', 'Grapple Bucket', 'Snow Blower', 'Stump Grinder',
    ],
  },
  {
    type: 'Motor Grader',
    prefix: 'GR',
    meter_type: 'hours',
    sub_categories: ['Small (< 140 HP)', 'Medium (140–200 HP)', 'Large (> 200 HP)'],
    attachments: ['Scarifier / Ripper', 'Front Push Blade', 'Side Shift Blade', 'Snow Wing', 'Ripping Teeth'],
  },
  {
    type: 'Dozer / Bulldozer',
    prefix: 'DZ',
    meter_type: 'hours',
    sub_categories: ['Small (< 150 HP)', 'Medium (150–250 HP)', 'Large (> 250 HP)'],
    attachments: ['U-Blade', 'S-Blade / Straight Blade', 'Angle Blade', 'Single-Shank Ripper', 'Multi-Shank Ripper', 'Coal U-Blade', 'Winch'],
  },
  {
    type: 'Scraper',
    prefix: 'SP2',
    meter_type: 'hours',
    sub_categories: ['Self-Propelled', 'Push-Pull', 'Elevating'],
    attachments: [],
  },
  // ── Road Construction ─────────────────────────────────────────────────────────
  {
    type: 'Vibratory Roller',
    prefix: 'VR',
    meter_type: 'hours',
    sub_categories: ['Single Drum (Soil)', 'Double Drum (Asphalt)', 'Tandem Roller', 'Combination Roller'],
    attachments: [],
  },
  {
    type: 'Static Roller',
    prefix: 'SR',
    meter_type: 'hours',
    sub_categories: ['3-Wheel', 'Tandem'],
    attachments: [],
  },
  {
    type: 'Pneumatic Tyre Roller',
    prefix: 'PT',
    meter_type: 'hours',
    sub_categories: ['7-Tyre', '9-Tyre', '11-Tyre'],
    attachments: [],
  },
  {
    type: 'Soil Compactor',
    prefix: 'SC',
    meter_type: 'hours',
    sub_categories: ['Small (< 10T)', 'Medium (10–15T)', 'Large (> 15T)'],
    attachments: [],
  },
  {
    type: 'Asphalt Paver',
    prefix: 'AP',
    meter_type: 'hours',
    sub_categories: ['Tracked', 'Wheeled', 'Mini Paver'],
    attachments: ['Ski / Averaging Beam', 'Screed Extension (Left)', 'Screed Extension (Right)', 'Spray Bar Kit'],
  },
  {
    type: 'Cold Milling Machine',
    prefix: 'CM',
    meter_type: 'hours',
    sub_categories: ['Small (< 500 mm width)', 'Medium (500–1000 mm)', 'Large (> 1000 mm)'],
    attachments: [],
  },
  {
    type: 'Bitumen Sprayer',
    prefix: 'BS',
    meter_type: 'both',
    sub_categories: ['Tractor-Mounted', 'Truck-Mounted', 'Trailer-Mounted'],
    attachments: [],
  },
  {
    type: 'Hot Mix Plant',
    prefix: 'HM',
    meter_type: 'hours',
    sub_categories: ['Drum Mix (< 80 TPH)', 'Drum Mix (80–160 TPH)', 'Batch Mix (80–160 TPH)', 'Batch Mix (> 160 TPH)'],
    attachments: [],
  },
  // ── Lifting & Material Handling ───────────────────────────────────────────────
  {
    type: 'Mobile Crane',
    prefix: 'MC',
    meter_type: 'both',
    sub_categories: ['10T', '14T', '20T', '30T', '50T', '80T', '100T+'],
    attachments: [
      'Standard Hook Block', 'Spreader Beam', 'Lifting Magnet', 'Concrete Bucket',
      'Personnel Platform / Man Basket', 'Clamshell Bucket', 'Demolition Ball', 'Pallet Fork Attachment',
    ],
  },
  {
    type: 'Pick & Carry Crane',
    prefix: 'PC',
    meter_type: 'both',
    sub_categories: ['10T', '14T', '20T', '25T', '40T'],
    attachments: ['Standard Hook Block', 'Spreader Beam', 'Personnel Platform / Man Basket', 'Lifting Magnet'],
  },
  {
    type: 'Tower Crane',
    prefix: 'TC',
    meter_type: 'hours',
    sub_categories: ['Self-Erecting (< 8 T·m)', 'Flat-Top (8–200 T·m)', 'Luffing Jib (> 200 T·m)'],
    attachments: ['Hook Block', 'Spreader Beam', 'Concrete Skip / Bucket'],
  },
  {
    type: 'Crawler Crane',
    prefix: 'CC',
    meter_type: 'hours',
    sub_categories: ['50T', '100T', '150T', '200T+'],
    attachments: ['Standard Hook Block', 'Lattice Boom Extension', 'Luffing Jib', 'Clamshell Bucket', 'Demolition Ball'],
  },
  {
    type: 'Overhead Crane',
    prefix: 'OC',
    meter_type: 'hours',
    sub_categories: ['Single Girder (< 10T)', 'Double Girder (10–30T)', 'Heavy Duty (> 30T)'],
    attachments: ['Hook Block', 'Lifting Magnet', 'Vacuum Lifter', 'Spreader Beam', 'Grab Bucket'],
  },
  {
    type: 'Forklift',
    prefix: 'FL',
    meter_type: 'hours',
    sub_categories: ['1–2T Counterbalance', '2–3.5T Counterbalance', '3.5–6T Counterbalance', 'Reach Truck', 'Rough-Terrain Forklift'],
    attachments: [
      'Standard Fork', 'Side Shifter', 'Rotating Fork', 'Drum Clamp',
      'Bale Clamp', 'Carpet Pole', 'Jib / Crane Arm', 'Push-Pull Attachment', 'Paper Roll Clamp',
    ],
  },
  {
    type: 'Telehandler',
    prefix: 'TH',
    meter_type: 'both',
    sub_categories: ['Fixed (< 12 m reach)', 'Rotating (< 15 m)', 'High-Reach (> 15 m)'],
    attachments: ['Pallet Fork', 'Winch', 'Lifting Jib', 'Bucket', 'Man Basket', 'Truss Boom', 'Bale Clamp'],
  },
  {
    type: 'Reach Stacker',
    prefix: 'RS',
    meter_type: 'both',
    sub_categories: ['Container (20–45T)', 'Empty Container', 'Industrial'],
    attachments: ['Spreader (Fixed)', 'Spreader (Telescopic)', 'Rotator Spreader', 'Hook Attachment'],
  },
  {
    type: 'Scissor Lift / AWP',
    prefix: 'SL',
    meter_type: 'hours',
    sub_categories: ['Electric (< 10 m)', 'Electric (10–14 m)', 'Diesel (> 14 m)'],
    attachments: ['Deck Extension', 'Pipe Rack / Material Tray', 'Tool Tray'],
  },
  {
    type: 'Man Lift / Boom Lift',
    prefix: 'BM',
    meter_type: 'hours',
    sub_categories: ['Articulated (< 18 m)', 'Telescopic (18–30 m)', 'Telescopic (> 30 m)'],
    attachments: ['Pipe Rack', 'Material Tray', 'Jib Extension'],
  },
  // ── Piling & Foundation ────────────────────────────────────────────────────────
  {
    type: 'Piling Rig',
    prefix: 'PL',
    meter_type: 'hours',
    sub_categories: ['CFA Rig', 'Rotary Rig', 'Displacement Rig', 'Cased Secant Rig'],
    attachments: ['Kelly Bar (Short)', 'Kelly Bar (Long)', 'Core Barrel', 'Bucket Auger', 'Rock Auger', 'Cleaning Bucket', 'Double-Start Auger', 'Casing Oscillator'],
  },
  {
    type: 'Rotary Drilling Rig',
    prefix: 'RD',
    meter_type: 'hours',
    sub_categories: ['Light Duty (< 50T pull-back)', 'Medium Duty', 'Heavy Duty (> 200T)'],
    attachments: ['Auger Bit (Soil)', 'Auger Bit (Rock)', 'Tri-Cone Roller Bit', 'PDC Bit', 'Core Barrel', 'Stabilizer', 'DTH Hammer'],
  },
  {
    type: 'Bore Well Machine',
    prefix: 'BW',
    meter_type: 'hours',
    sub_categories: ['DTH (< 6 inch)', 'DTH (6–12 inch)', 'Rotary (> 12 inch)'],
    attachments: ['DTH Hammer', 'DTH Bit', 'Drill Rods', 'Casing Pipe'],
  },
  {
    type: 'Vibratory Piling Hammer',
    prefix: 'VH',
    meter_type: 'hours',
    sub_categories: ['Low Frequency (< 1200 rpm)', 'High Frequency (> 1200 rpm)'],
    attachments: ['Sheet Pile Clamp', 'H-Pile Clamp', 'Pipe Pile Clamp', 'Tube Clamp'],
  },
  // ── Concrete Equipment ─────────────────────────────────────────────────────────
  {
    type: 'Transit Mixer',
    prefix: 'TM',
    meter_type: 'both',
    sub_categories: ['6 m³', '7 m³', '8 m³', '10 m³'],
    attachments: [],
  },
  {
    type: 'Concrete Pump',
    prefix: 'CPN',
    meter_type: 'hours',
    sub_categories: ['Trailer-Mounted (< 60 m³/hr)', 'Truck-Mounted (60–100 m³/hr)', 'Stationary (> 100 m³/hr)'],
    attachments: ['Delivery Pipeline', 'End Hose (Rubber)', 'Reducer', 'Elbow / Bend', 'Concrete Placing Boom'],
  },
  {
    type: 'Boom Placer',
    prefix: 'BP',
    meter_type: 'both',
    sub_categories: ['24 m Boom', '28 m Boom', '32 m Boom', '36 m+ Boom'],
    attachments: ['End Hose', 'Delivery Pipeline', 'Slew Ring Accessory'],
  },
  {
    type: 'Concrete Batching Plant',
    prefix: 'CB',
    meter_type: 'hours',
    sub_categories: ['30 m³/hr', '60 m³/hr', '90 m³/hr', '120 m³/hr+'],
    attachments: [],
  },
  {
    type: 'Concrete Mixer (Diesel)',
    prefix: 'MX',
    meter_type: 'hours',
    sub_categories: ['0.5 m³ (Tilt Drum)', '1 m³ (Pan Mixer)', '2 m³'],
    attachments: [],
  },
  // ── Transport ─────────────────────────────────────────────────────────────────
  {
    type: 'Tipper / Dumper',
    prefix: 'TI',
    meter_type: 'both',
    sub_categories: ['5 m³ / 6-Wheeler', '8 m³ / 10-Wheeler', '10 m³ / 10-Wheeler', '12 m³ / 12-Wheeler', '14 m³ / 14-Wheeler', '16 m³ / 14-Wheeler', '20 m³+ / 16-Wheeler'],
    attachments: ['Tarpaulin Frame / Cover', 'Rock Body (Special)', 'Coal Body (High-Sided)', 'Tail-Gate'],
  },
  {
    type: 'Hyva Truck',
    prefix: 'HV',
    meter_type: 'both',
    sub_categories: ['6-Wheeler', '10-Wheeler', '12-Wheeler'],
    attachments: ['Tarpaulin Cover', 'Tail-Gate', 'Rock Body', 'Rear Roller Shutter'],
  },
  {
    type: 'Low Bed Trailer',
    prefix: 'LB',
    meter_type: 'both',
    sub_categories: ['40T Capacity', '60T Capacity', '80T Capacity', '100T+ Capacity'],
    attachments: ['Ramp Extension', 'Jeep Dolly / Booster', 'Hydraulic Gooseneck', 'Side Extensions'],
  },
  {
    type: 'Flat Bed Trailer',
    prefix: 'FB',
    meter_type: 'both',
    sub_categories: ['20T Capacity', '30T Capacity', '40T Capacity'],
    attachments: ['Side Stakes', 'Tie-Down Rails', 'Drop Sides'],
  },
  {
    type: 'Water Tanker',
    prefix: 'WT',
    meter_type: 'both',
    sub_categories: ['5 KL', '8 KL', '10 KL', '12 KL', '16 KL', '20 KL'],
    attachments: ['Water Sprinkler Bar (Front)', 'Rear Sprinkler Nozzle', 'Suction Hose Assembly', 'Rear Spray Boom'],
  },
  {
    type: 'Fuel Tanker',
    prefix: 'FT',
    meter_type: 'both',
    sub_categories: ['5 KL', '8 KL', '10 KL', '12 KL'],
    attachments: ['Dispensing Pump & Hose', 'Flow Meter', 'Grounding Cable', 'Delivery Nozzle'],
  },
  {
    type: 'Container Truck',
    prefix: 'CT',
    meter_type: 'both',
    sub_categories: ['20 ft', '40 ft', 'Refrigerated'],
    attachments: [],
  },
  // ── Compressors & Generators ──────────────────────────────────────────────────
  {
    type: 'Air Compressor',
    prefix: 'AC',
    meter_type: 'hours',
    sub_categories: ['< 100 CFM (Portable)', '100–250 CFM', '250–600 CFM (Heavy-Duty)'],
    attachments: ['Pneumatic Drill / Jack Hammer', 'Sand Blasting Pot', 'Spray Gun', 'Rock Drill', 'Air Hose Reel'],
  },
  {
    type: 'Generator / DG Set',
    prefix: 'GN',
    meter_type: 'hours',
    sub_categories: ['< 25 kVA (Portable)', '25–62.5 kVA', '62.5–125 kVA', '125–250 kVA', '250–500 kVA', '> 500 kVA'],
    attachments: ['Synchronising Panel', 'AMF Panel', 'Trailer / Skid Mount', 'Acoustic Canopy'],
  },
  {
    type: 'Welding Machine',
    prefix: 'WM',
    meter_type: 'hours',
    sub_categories: ['Arc Welder (< 300A)', 'MIG/MAG (300–500A)', 'TIG Welder', 'Generator Welder'],
    attachments: ['Welding Torch / Gun', 'Earth Clamp', 'Wire Feeder Unit', 'Plasma Cutter Attachment'],
  },
  // ── Drilling & Cutting ────────────────────────────────────────────────────────
  {
    type: 'Rock Breaker / Hydraulic Hammer',
    prefix: 'RB',
    meter_type: 'hours',
    sub_categories: ['Mini (< 500 kg)', 'Small (500 kg – 1T)', 'Medium (1–3T)', 'Heavy (> 3T)'],
    attachments: ['Moil Point Chisel', 'Flat Chisel', 'Blunt / Pyramid Tool', 'Conical Tool'],
  },
  {
    type: 'Core Cutting Machine',
    prefix: 'CCM',
    meter_type: 'hours',
    sub_categories: ['Handheld (< 200 mm dia)', 'Rig-Mounted (> 200 mm dia)'],
    attachments: ['Core Drill Bit (Diamond)', 'Extension Rod', 'Water Swivel'],
  },
  {
    type: 'Jack Hammer',
    prefix: 'JH',
    meter_type: 'hours',
    sub_categories: ['Electric', 'Pneumatic', 'Hydraulic'],
    attachments: ['Chisel Bit', 'Moil Point Bit', 'Clay Spade', 'Tamping Rod'],
  },
  // ── Dewatering ────────────────────────────────────────────────────────────────
  {
    type: 'Dewatering Pump',
    prefix: 'DP',
    meter_type: 'hours',
    sub_categories: ['Diesel (< 100 m³/hr)', 'Diesel (100–300 m³/hr)', 'Electric Submersible'],
    attachments: ['Suction Hose', 'Delivery Hose', 'Float Switch', 'Strainer / Foot Valve'],
  },
  {
    type: 'Submersible Pump',
    prefix: 'SPM',
    meter_type: 'hours',
    sub_categories: ['< 5 HP', '5–15 HP', '15–50 HP', '> 50 HP'],
    attachments: ['Delivery Hose / Pipe', 'Float Switch', 'Control Panel'],
  },
  // ── Compaction (Small) ────────────────────────────────────────────────────────
  {
    type: 'Plate Compactor',
    prefix: 'PCT',
    meter_type: 'hours',
    sub_categories: ['< 75 kg', '75–120 kg', '> 120 kg'],
    attachments: [],
  },
  {
    type: 'Rammer / Jumping Jack',
    prefix: 'RJ',
    meter_type: 'hours',
    sub_categories: ['Diesel (< 80 kg)', 'Petrol (< 80 kg)', 'Heavy (> 80 kg)'],
    attachments: [],
  },
  // ── Other ─────────────────────────────────────────────────────────────────────
  {
    type: 'Pipe Laying Machine',
    prefix: 'PM',
    meter_type: 'hours',
    sub_categories: ['Tracked Side Boom', 'Wheeled', 'Vacuum Excavator'],
    attachments: ['Side Boom Arm', 'Pipe Roller', 'Pipe Clamp'],
  },
  {
    type: 'Other',
    prefix: 'OT',
    meter_type: 'hours',
    sub_categories: ['General Equipment'],
    attachments: [],
  },
]

// ── Backward-compatible exports ───────────────────────────────────────────────
export const EQUIPMENT_CATEGORIES = EQUIPMENT_TYPES.map(e => ({
  category: e.type,
  meter_type: e.meter_type,
}))

export const CATEGORY_NAMES = EQUIPMENT_TYPES.map(e => e.type)

export function getMeterType(category) {
  return EQUIPMENT_TYPES.find(e => e.type === category)?.meter_type || 'hours'
}

export function getPrefix(category) {
  return EQUIPMENT_TYPES.find(e => e.type === category)?.prefix || 'EQ'
}

export function getSubCategories(category) {
  return EQUIPMENT_TYPES.find(e => e.type === category)?.sub_categories || []
}

export function getAttachments(category) {
  return EQUIPMENT_TYPES.find(e => e.type === category)?.attachments || []
}

// ── Status colours ────────────────────────────────────────────────────────────
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
