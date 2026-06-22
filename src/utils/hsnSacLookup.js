/**
 * HSN / SAC Code Lookup for Construction, Equipment Rental, Transport & Logistics
 * Includes GST rate applicable as per Indian GST rules.
 * Note: Rates are indicative — verify with a CA for your specific transactions.
 */

const HSN_SAC_DB = {
  // ── CONSTRUCTION SERVICES (SAC 9954) ─────────────────────────────────────
  '9954':   { type: 'SAC', desc: 'Works Contract / Construction Services', gst: 18 },
  '995411': { type: 'SAC', desc: 'Residential building construction (affordable housing)', gst: 12 },
  '995412': { type: 'SAC', desc: 'Residential building construction (other)', gst: 18 },
  '995413': { type: 'SAC', desc: 'Roads, highways, bridges, tunnels', gst: 12 },
  '995414': { type: 'SAC', desc: 'Dams, waterways, water treatment works', gst: 12 },
  '995415': { type: 'SAC', desc: 'Other civil engineering construction', gst: 12 },
  '995416': { type: 'SAC', desc: 'Power plant construction', gst: 18 },
  '995419': { type: 'SAC', desc: 'Other construction services NES', gst: 18 },
  '995421': { type: 'SAC', desc: 'Repair, alteration & additions to buildings', gst: 18 },
  '995422': { type: 'SAC', desc: 'Site preparation and clearance', gst: 18 },
  '995423': { type: 'SAC', desc: 'Structural steel erection work', gst: 18 },
  '995424': { type: 'SAC', desc: 'Masonry and plastering work', gst: 18 },
  '995425': { type: 'SAC', desc: 'Waterproofing, painting & glazing', gst: 18 },
  '995426': { type: 'SAC', desc: 'Joinery and carpentry work', gst: 18 },
  '995427': { type: 'SAC', desc: 'Flooring and tiling services', gst: 18 },
  '995428': { type: 'SAC', desc: 'Scaffolding and formwork services', gst: 18 },
  '995431': { type: 'SAC', desc: 'Industrial plant construction', gst: 18 },
  '995432': { type: 'SAC', desc: 'Pipeline and duct construction', gst: 18 },
  '995433': { type: 'SAC', desc: 'Electrical installation work', gst: 18 },
  '995434': { type: 'SAC', desc: 'Mechanical installation, plumbing & HVAC', gst: 18 },
  '995435': { type: 'SAC', desc: 'Other installation services', gst: 18 },
  '995436': { type: 'SAC', desc: 'Completion and finishing works', gst: 18 },
  '995438': { type: 'SAC', desc: 'Other specialised construction NES', gst: 18 },
  '995439': { type: 'SAC', desc: 'Repair/maintenance of infrastructure', gst: 18 },

  // ── EQUIPMENT RENTAL / LEASING (SAC 9973) ────────────────────────────────
  '9973':   { type: 'SAC', desc: 'Leasing and Rental Services', gst: 18 },
  '997311': { type: 'SAC', desc: 'Financial leasing services', gst: 18 },
  '997312': { type: 'SAC', desc: 'Operating leasing without operator', gst: 18 },
  '997313': { type: 'SAC', desc: 'Renting of construction / mining equipment', gst: 18 },
  '997314': { type: 'SAC', desc: 'Renting of transport equipment with operator', gst: 18 },
  '997315': { type: 'SAC', desc: 'Renting of agricultural machinery', gst: 18 },
  '997319': { type: 'SAC', desc: 'Other leasing and rental services', gst: 18 },

  // ── MAINTENANCE & REPAIR (SAC 9987) ──────────────────────────────────────
  '9987':   { type: 'SAC', desc: 'Maintenance, Repair and Installation Services', gst: 18 },
  '998711': { type: 'SAC', desc: 'Maintenance of motor vehicles', gst: 18 },
  '998712': { type: 'SAC', desc: 'Repair of motor vehicles', gst: 18 },
  '998713': { type: 'SAC', desc: 'Maintenance of construction/mining machinery', gst: 18 },
  '998714': { type: 'SAC', desc: 'Repair of industrial machinery', gst: 18 },
  '998715': { type: 'SAC', desc: 'Maintenance of office/IT equipment', gst: 18 },
  '998719': { type: 'SAC', desc: 'Other maintenance and repair services', gst: 18 },

  // ── TRANSPORT (SAC 9966) ──────────────────────────────────────────────────
  '9966':   { type: 'SAC', desc: 'Road Transport Services', gst: 5 },
  '996601': { type: 'SAC', desc: 'Goods transport by road — GTA (Goods Transport Agency)', gst: 5 },
  '996602': { type: 'SAC', desc: 'Goods transport vehicle on hire with operator', gst: 18 },
  '996603': { type: 'SAC', desc: 'Freight forwarding services', gst: 18 },
  '996611': { type: 'SAC', desc: 'Passenger transport by road (not taxi)', gst: 5 },
  '996612': { type: 'SAC', desc: 'Taxi / cab services', gst: 5 },
  '996621': { type: 'SAC', desc: 'Courier services', gst: 18 },

  // ── MANPOWER / LABOUR SUPPLY (SAC 9985) ──────────────────────────────────
  '9985':   { type: 'SAC', desc: 'Support Services', gst: 18 },
  '998511': { type: 'SAC', desc: 'Executive search / retained personnel', gst: 18 },
  '998512': { type: 'SAC', desc: 'Permanent placement / recruitment', gst: 18 },
  '998513': { type: 'SAC', desc: 'Labour / manpower supply', gst: 18 },
  '998514': { type: 'SAC', desc: 'Temporary staffing services', gst: 18 },
  '998519': { type: 'SAC', desc: 'Other employment and staffing services', gst: 18 },

  // ── ENGINEERING / PROFESSIONAL SERVICES (SAC 9983) ───────────────────────
  '9983':   { type: 'SAC', desc: 'Professional and Technical Services', gst: 18 },
  '998311': { type: 'SAC', desc: 'Management consulting', gst: 18 },
  '998313': { type: 'SAC', desc: 'Technical consulting / advisory', gst: 18 },
  '998314': { type: 'SAC', desc: 'Engineering / design services', gst: 18 },
  '998315': { type: 'SAC', desc: 'Quantity surveying services', gst: 18 },
  '998316': { type: 'SAC', desc: 'Architectural design services', gst: 18 },

  // ── SECURITY SERVICES (SAC 9985) ─────────────────────────────────────────
  '998524': { type: 'SAC', desc: 'Investigation and security services', gst: 18 },

  // ── PETROLEUM / FUEL (HSN 27) ─────────────────────────────────────────────
  '2710':   { type: 'HSN', desc: 'Petroleum oils and preparations', gst: 18 },
  '271012': { type: 'HSN', desc: 'Aviation turbine fuel (ATF)', gst: 18 },
  '271019': { type: 'HSN', desc: 'High speed diesel / other petroleum oils', gst: 18 },
  '2711':   { type: 'HSN', desc: 'Petroleum gases (LPG, CNG)', gst: 5 },
  '2713':   { type: 'HSN', desc: 'Petroleum coke, bitumen, asphalt', gst: 18 },

  // ── LUBRICANTS & FLUIDS (HSN 34/38) ──────────────────────────────────────
  '3403':   { type: 'HSN', desc: 'Lubricating preparations / greases / cutting oils', gst: 18 },
  '3811':   { type: 'HSN', desc: 'Anti-knock preparations / additives for lubricants', gst: 18 },
  '3819':   { type: 'HSN', desc: 'Hydraulic brake fluids / anti-freeze', gst: 18 },

  // ── TYRES & RUBBER (HSN 40) ───────────────────────────────────────────────
  '4011':   { type: 'HSN', desc: 'New pneumatic tyres (rubber)', gst: 28 },
  '4012':   { type: 'HSN', desc: 'Retreaded / used pneumatic tyres', gst: 28 },
  '4013':   { type: 'HSN', desc: 'Inner tubes (rubber)', gst: 28 },
  '4016':   { type: 'HSN', desc: 'Other rubber articles (seals, gaskets)', gst: 18 },

  // ── STEEL & STRUCTURAL (HSN 73) ───────────────────────────────────────────
  '7308':   { type: 'HSN', desc: 'Structural steel / fabricated steel structures', gst: 18 },
  '7315':   { type: 'HSN', desc: 'Steel chains and parts', gst: 18 },
  '7318':   { type: 'HSN', desc: 'Bolts, nuts, screws, washers (steel)', gst: 18 },
  '7326':   { type: 'HSN', desc: 'Other iron/steel articles', gst: 18 },

  // ── ENGINES & MACHINERY PARTS (HSN 84) ───────────────────────────────────
  '8408':   { type: 'HSN', desc: 'Diesel engines (compression-ignition)', gst: 28 },
  '8409':   { type: 'HSN', desc: 'Parts for diesel/petrol engines', gst: 28 },
  '8413':   { type: 'HSN', desc: 'Pumps for liquids (water/fuel pumps)', gst: 18 },
  '8414':   { type: 'HSN', desc: 'Air pumps, compressors, fans', gst: 18 },
  '8415':   { type: 'HSN', desc: 'Air conditioning machines', gst: 28 },
  '8425':   { type: 'HSN', desc: 'Pulley tackle, chain hoists, lifting equipment', gst: 18 },
  '8426':   { type: 'HSN', desc: 'Mobile cranes, ship derricks, lifting frames', gst: 28 },
  '8427':   { type: 'HSN', desc: 'Fork-lift trucks and work trucks', gst: 28 },
  '8428':   { type: 'HSN', desc: 'Conveyors, lifts, escalators and other lifting machinery', gst: 18 },
  '8429':   { type: 'HSN', desc: 'Bulldozers, graders, scrapers, levellers, angledozers', gst: 28 },
  '8430':   { type: 'HSN', desc: 'Excavators, back-hoes, loaders, pile-drivers', gst: 28 },
  '8431':   { type: 'HSN', desc: 'Parts for HS 8425–8430 construction machinery', gst: 28 },
  '8432':   { type: 'HSN', desc: 'Agricultural soil preparation machinery', gst: 12 },
  '8467':   { type: 'HSN', desc: 'Hand-held tools (pneumatic/hydraulic/motor)', gst: 18 },
  '8474':   { type: 'HSN', desc: 'Crushers, mixers, screens for stone/ore', gst: 18 },
  '8475':   { type: 'HSN', desc: 'Machines for assembling electric lamps', gst: 18 },
  '8479':   { type: 'HSN', desc: 'Machines for special purposes NES', gst: 18 },
  '8481':   { type: 'HSN', desc: 'Taps, valves, cocks for pipes / tanks', gst: 18 },
  '8482':   { type: 'HSN', desc: 'Ball / roller bearings', gst: 18 },
  '8483':   { type: 'HSN', desc: 'Transmission shafts, gears, clutches, couplings', gst: 18 },
  '8484':   { type: 'HSN', desc: 'Gaskets, washers and similar seals', gst: 18 },
  '8511':   { type: 'HSN', desc: 'Electrical ignition / starting equipment for engines', gst: 18 },
  '8537':   { type: 'HSN', desc: 'Switchboards, distribution panels (electrical)', gst: 18 },
  '8544':   { type: 'HSN', desc: 'Insulated wire, cable, electric conductors', gst: 18 },

  // ── MOTOR VEHICLES & PARTS (HSN 87) ───────────────────────────────────────
  '8703':   { type: 'HSN', desc: 'Motor cars and passenger vehicles', gst: 28 },
  '8704':   { type: 'HSN', desc: 'Goods transport vehicles (trucks/lorries/tippers)', gst: 28 },
  '8705':   { type: 'HSN', desc: 'Special purpose motor vehicles (crane trucks, concrete mixers)', gst: 28 },
  '8706':   { type: 'HSN', desc: 'Chassis fitted with engines for motor vehicles', gst: 28 },
  '8707':   { type: 'HSN', desc: 'Bodies (incl. cabs) for motor vehicles', gst: 28 },
  '8708':   { type: 'HSN', desc: 'Parts and accessories for motor vehicles', gst: 28 },
  '8714':   { type: 'HSN', desc: 'Parts and accessories for motorcycles', gst: 28 },
  '8716':   { type: 'HSN', desc: 'Trailers, semi-trailers, non-propelled vehicles', gst: 28 },

  // ── PREFABRICATED STRUCTURES (HSN 94) ─────────────────────────────────────
  '9406':   { type: 'HSN', desc: 'Prefabricated structures (site offices, cabins)', gst: 18 },
}

/**
 * Look up an HSN or SAC code.
 * @param {string} code — raw user input (e.g. "997313", "8429")
 * @returns {{ type, desc, gst, cgst, sgst, igst } | null}
 */
export function lookupHsnSac(code) {
  if (!code) return null
  const key = code.trim().toUpperCase().replace(/\s/g, '')
  const entry = HSN_SAC_DB[key]
  if (!entry) return null
  const half = entry.gst / 2
  return {
    type: entry.type,
    desc: entry.desc,
    gst: entry.gst,
    cgst: half,
    sgst: half,
    igst: entry.gst,
  }
}

/**
 * Returns all entries as an array (for autocomplete).
 */
export function getAllHsnSac() {
  return Object.entries(HSN_SAC_DB).map(([code, v]) => ({ code, ...v }))
}
