/**
 * Master UOM list — single source of truth for all modules.
 * Grouped by category for readability; stored as flat array for dropdowns.
 *
 * Conventions:
 *  - Weight  : MT (metric tonne = 1000 kg), quintal (100 kg), kg, g
 *  - Volume  : cum (cubic metre), KL (kilolitre), litre, ml
 *  - Area    : sqm, sqft
 *  - Length  : mtr, rmt, km, ft, inch
 *  - Count   : nos, unit, set, bag, box, pair, roll, sheet, bundle
 *  - Service : hrs, days, weeks, months, trips, LS (lump sum)
 */

export const UOM_LIST = [
  // ── Weight ────────────────────────────────────
  'MT',       // metric tonne (standard GST unit — MTS)
  'tonnes',   // common colloquial / crusher/sand usage
  'quintal',  // 100 kg
  'kg',
  'g',

  // ── Volume ────────────────────────────────────
  'cum',      // cubic metre (m³) — construction standard
  'KL',       // kilolitre
  'litre',
  'ml',

  // ── Area ──────────────────────────────────────
  'sqm',      // square metre
  'sqft',     // square feet

  // ── Length ────────────────────────────────────
  'mtr',      // metre
  'rmt',      // running metre
  'km',
  'ft',
  'inch',

  // ── Count / Packaging ─────────────────────────
  'nos',
  'unit',
  'set',
  'bag',
  'box',
  'pair',
  'roll',
  'sheet',
  'bundle',

  // ── Time / Services ───────────────────────────
  'hrs',
  'days',
  'weeks',
  'months',
  'trips',
  'LS',       // lump sum
]

/** Default UOM for new items (change if industry default differs) */
export const DEFAULT_UOM = 'nos'
