/**
 * HSN / SAC Code Lookup — Construction, Equipment Rental, Transport & Logistics
 * Covers raw materials, finished goods, services, machinery, vehicles.
 *
 * Rates verified against:
 *  - CBIC GST Rate notifications (incl. No. 05/2020 dated 16-Oct-2020)
 *  - ClearTax Chapter 84 HSN table (cleartax.in)
 *  - Tax2Win Chapter 84 GST rate guide (tax2win.in)
 *
 * Key corrections vs. common misconceptions:
 *  - HSN 8431 (construction machinery parts): 18% NOT 28%
 *  - HSN 8429 (bulldozers, excavators, graders): 18% NOT 28%
 *  - HSN 8430 (boring, pile-driving machinery): 18% NOT 28%
 *  - HSN 8426 (cranes, ship derricks): 18% NOT 28%
 *  - HSN 8427 (fork-lifts): 18% NOT 28%
 *  - HSN 8483 (gearboxes, crankshafts, clutches): 28% NOT 18%
 *  - HSN 8413 (pumps): split rate — fuel/concrete pumps 28%, water pumps 12%, hand pumps 5%
 *
 * ALWAYS verify with your CA for your specific product/transaction.
 * Last updated: July 2026
 */

const HSN_SAC_DB = {

  // ── EARTH, STONE & AGGREGATES (Ch. 25) ───────────────────────────────────
  '2505':   { type: 'HSN', desc: 'Natural sands (silica, M-sand, P-sand, river sand)', gst: 5 },
  '250510': { type: 'HSN', desc: 'Silica sands / quartz sands', gst: 5 },
  '250590': { type: 'HSN', desc: 'Other natural sands (M-sand, P-sand, river sand)', gst: 5 },
  '2506':   { type: 'HSN', desc: 'Quartz and quartzite', gst: 5 },
  '2515':   { type: 'HSN', desc: 'Marble, travertine and alabaster', gst: 28 },
  '251511': { type: 'HSN', desc: 'Marble and travertine — crude / roughly trimmed', gst: 5 },
  '251512': { type: 'HSN', desc: 'Marble and travertine — cut slabs', gst: 28 },
  '2516':   { type: 'HSN', desc: 'Granite, sandstone, basalt', gst: 5 },
  '251611': { type: 'HSN', desc: 'Granite — crude / roughly trimmed', gst: 5 },
  '251612': { type: 'HSN', desc: 'Granite — cut into blocks or slabs', gst: 12 },
  '2517':   { type: 'HSN', desc: 'Pebbles, gravel, crushed / broken stone (aggregate)', gst: 5 },
  '251710': { type: 'HSN', desc: 'Pebbles, gravel, crushed stone — aggregates', gst: 5 },
  '251720': { type: 'HSN', desc: 'Macadam of slag or dross', gst: 5 },
  '2521':   { type: 'HSN', desc: 'Limestone flux / limestone for cement', gst: 5 },
  '2522':   { type: 'HSN', desc: 'Quicklime, slaked lime, hydraulic lime', gst: 5 },
  '252210': { type: 'HSN', desc: 'Quicklime', gst: 5 },
  '252220': { type: 'HSN', desc: 'Slaked lime', gst: 5 },
  '2523':   { type: 'HSN', desc: 'Portland cement, aluminous cement, slag cement', gst: 28 },
  '252310': { type: 'HSN', desc: 'Cement clinkers', gst: 28 },
  '252321': { type: 'HSN', desc: 'White Portland cement', gst: 28 },
  '252329': { type: 'HSN', desc: 'Other Portland cement (OPC/PPC)', gst: 28 },
  '252330': { type: 'HSN', desc: 'Aluminous cement', gst: 28 },
  '252390': { type: 'HSN', desc: 'Other hydraulic cements (PSC/slag cement)', gst: 28 },
  '2524':   { type: 'HSN', desc: 'Asbestos', gst: 5 },
  '2526':   { type: 'HSN', desc: 'Natural steatite and talc', gst: 5 },

  // ── ORES, SLAG & ASH (Ch. 26) ────────────────────────────────────────────
  '2601':   { type: 'HSN', desc: 'Iron ores and concentrates', gst: 5 },
  '2616':   { type: 'HSN', desc: 'Precious metal ores', gst: 5 },
  '2617':   { type: 'HSN', desc: 'Other ores and concentrates', gst: 5 },
  '2618':   { type: 'HSN', desc: 'Granulated slag from iron/steel manufacture', gst: 5 },
  '2619':   { type: 'HSN', desc: 'Slag, dross, scalings from iron/steel', gst: 5 },

  // ── PETROLEUM / FUEL (Ch. 27) ─────────────────────────────────────────────
  '2710':   { type: 'HSN', desc: 'Petroleum oils and preparations', gst: 18 },
  '271012': { type: 'HSN', desc: 'Aviation turbine fuel (ATF)', gst: 18 },
  '271019': { type: 'HSN', desc: 'High speed diesel / other petroleum oils', gst: 18 },
  '2711':   { type: 'HSN', desc: 'Petroleum gases (LPG, CNG)', gst: 5 },
  '2713':   { type: 'HSN', desc: 'Petroleum coke, bitumen, asphalt', gst: 18 },
  '271320': { type: 'HSN', desc: 'Bitumen / asphalt (petroleum)', gst: 18 },

  // ── CHEMICALS & ADMIXTURES (Ch. 28/29/38) ────────────────────────────────
  '2814':   { type: 'HSN', desc: 'Ammonia (anhydrous / aqueous)', gst: 18 },
  '2901':   { type: 'HSN', desc: 'Acyclic hydrocarbons (solvents)', gst: 18 },
  '3214':   { type: 'HSN', desc: 'Glaziers putty, resin cements, sealants, caulking', gst: 18 },
  '321400': { type: 'HSN', desc: 'Putty, sealants, caulking compounds', gst: 18 },
  '3506':   { type: 'HSN', desc: 'Prepared adhesives / glues', gst: 18 },
  '3815':   { type: 'HSN', desc: 'Reaction initiators / accelerators / catalysts', gst: 18 },
  '3824':   { type: 'HSN', desc: 'Concrete admixtures, prepared binders, chemical products NES', gst: 18 },

  // ── PAINTS & COATINGS (Ch. 32) ───────────────────────────────────────────
  '3208':   { type: 'HSN', desc: 'Paints and varnishes (polyester/acrylic based)', gst: 18 },
  '3209':   { type: 'HSN', desc: 'Paints and varnishes (water-based)', gst: 18 },
  '3210':   { type: 'HSN', desc: 'Other paints and varnishes', gst: 18 },
  '3211':   { type: 'HSN', desc: 'Prepared driers for paints', gst: 18 },
  '3212':   { type: 'HSN', desc: 'Pigments / inks / dyes', gst: 18 },
  '3214':   { type: 'HSN', desc: 'Putty, sealants, non-refractory surfacing preparations', gst: 18 },

  // ── LUBRICANTS & FLUIDS (Ch. 34/38) ──────────────────────────────────────
  '3403':   { type: 'HSN', desc: 'Lubricating preparations / greases / cutting oils', gst: 18 },
  '3811':   { type: 'HSN', desc: 'Anti-knock preparations / additives for lubricants', gst: 18 },
  '3819':   { type: 'HSN', desc: 'Hydraulic brake fluids / anti-freeze', gst: 18 },

  // ── PLASTICS & PIPES (Ch. 39) ─────────────────────────────────────────────
  '3917':   { type: 'HSN', desc: 'Plastic tubes, pipes and hoses', gst: 18 },
  '391710': { type: 'HSN', desc: 'Artificial guts (sausage casings)', gst: 18 },
  '391721': { type: 'HSN', desc: 'PVC rigid tubes and pipes', gst: 18 },
  '391729': { type: 'HSN', desc: 'Other plastic tubes / pipes (HDPE, UPVC, PPR)', gst: 18 },
  '391731': { type: 'HSN', desc: 'Flexible plastic tubes / hoses', gst: 18 },
  '3918':   { type: 'HSN', desc: 'Plastic floor coverings', gst: 18 },
  '3919':   { type: 'HSN', desc: 'Self-adhesive plastic plates, sheets, film', gst: 18 },
  '3920':   { type: 'HSN', desc: 'Plastic sheets, film, foil (non-cellular)', gst: 18 },
  '3925':   { type: 'HSN', desc: 'Plastic builders\' ware (tanks, doors, windows)', gst: 18 },
  '392510': { type: 'HSN', desc: 'Plastic reservoirs / tanks / vats', gst: 18 },
  '392520': { type: 'HSN', desc: 'Plastic doors, windows and their frames', gst: 18 },
  '392590': { type: 'HSN', desc: 'Other plastic builders\' ware (fittings, fixtures)', gst: 18 },

  // ── RUBBER & TYRES (Ch. 40) ───────────────────────────────────────────────
  '4011':   { type: 'HSN', desc: 'New pneumatic tyres (rubber)', gst: 28 },
  '4012':   { type: 'HSN', desc: 'Retreaded / used pneumatic tyres', gst: 28 },
  '4013':   { type: 'HSN', desc: 'Inner tubes (rubber)', gst: 28 },
  '4016':   { type: 'HSN', desc: 'Other rubber articles (seals, gaskets, mats)', gst: 18 },
  '4017':   { type: 'HSN', desc: 'Hard rubber articles', gst: 18 },

  // ── WOOD, PLYWOOD & TIMBER (Ch. 44) ──────────────────────────────────────
  '4407':   { type: 'HSN', desc: 'Wood sawn / chipped lengthwise (timber)', gst: 12 },
  '4408':   { type: 'HSN', desc: 'Veneer sheets and sheets for plywood', gst: 12 },
  '4409':   { type: 'HSN', desc: 'Wood profiles, mouldings, skirting boards', gst: 12 },
  '4410':   { type: 'HSN', desc: 'Particle board, OSB and similar wood panels', gst: 12 },
  '4411':   { type: 'HSN', desc: 'Fibreboard (MDF / HDF)', gst: 12 },
  '4412':   { type: 'HSN', desc: 'Plywood, veneered panels, laminated wood', gst: 12 },
  '4418':   { type: 'HSN', desc: 'Builders\' joinery (doors, windows, shuttering)', gst: 12 },
  '441810': { type: 'HSN', desc: 'Windows, French windows and their frames (wood)', gst: 12 },
  '441820': { type: 'HSN', desc: 'Doors and their frames / thresholds (wood)', gst: 12 },
  '441840': { type: 'HSN', desc: 'Formwork and shuttering (wood)', gst: 12 },
  '441850': { type: 'HSN', desc: 'Shingles and shakes (wood)', gst: 12 },

  // ── TARPAULINS & SACKING (Ch. 63) ────────────────────────────────────────
  '6305':   { type: 'HSN', desc: 'Sacks and bags (for packing)', gst: 12 },
  '6306':   { type: 'HSN', desc: 'Tarpaulins, awnings and sunblinds', gst: 12 },

  // ── STONE, PLASTER & CEMENT ARTICLES (Ch. 68) ────────────────────────────
  '6801':   { type: 'HSN', desc: 'Setts, curbstones, flagstones of natural stone', gst: 5 },
  '6802':   { type: 'HSN', desc: 'Monumental / building stone (dressed, worked)', gst: 12 },
  '680210': { type: 'HSN', desc: 'Tiles, cubes and similar articles of natural stone', gst: 12 },
  '6803':   { type: 'HSN', desc: 'Worked slate and articles of slate', gst: 12 },
  '6808':   { type: 'HSN', desc: 'Panels, boards of vegetable fibre / cement', gst: 12 },
  '6809':   { type: 'HSN', desc: 'Articles of plaster / gypsum (boards, sheets)', gst: 18 },
  '6810':   { type: 'HSN', desc: 'Articles of cement / concrete / artificial stone', gst: 18 },
  '681011': { type: 'HSN', desc: 'Building blocks and bricks of cement / concrete', gst: 18 },
  '681019': { type: 'HSN', desc: 'Other tiles, flagstones of cement / concrete', gst: 18 },
  '681091': { type: 'HSN', desc: 'Prefabricated structural components (cement/concrete)', gst: 18 },
  '6811':   { type: 'HSN', desc: 'Articles of asbestos-cement, cellulose-cement', gst: 18 },
  '6812':   { type: 'HSN', desc: 'Fabricated asbestos fibres, articles', gst: 18 },

  // ── BRICKS & REFRACTORY (Ch. 69) ─────────────────────────────────────────
  '6901':   { type: 'HSN', desc: 'Bricks, blocks, tiles — siliceous fossil meals', gst: 5 },
  '6902':   { type: 'HSN', desc: 'Refractory bricks, blocks, tiles', gst: 18 },
  '6904':   { type: 'HSN', desc: 'Ceramic building bricks, flooring blocks', gst: 5 },
  '690410': { type: 'HSN', desc: 'Building bricks', gst: 5 },
  '6905':   { type: 'HSN', desc: 'Roofing tiles, chimney-pots, cowls (ceramic)', gst: 5 },
  '6906':   { type: 'HSN', desc: 'Ceramic pipes, conduits, guttering', gst: 18 },
  '6907':   { type: 'HSN', desc: 'Ceramic flags and paving / wall tiles (unglazed)', gst: 28 },
  '6908':   { type: 'HSN', desc: 'Ceramic flags and paving / wall tiles (glazed)', gst: 28 },

  // ── GLASS & GLASS PRODUCTS (Ch. 70) ──────────────────────────────────────
  '7003':   { type: 'HSN', desc: 'Cast glass and rolled glass (sheets)', gst: 18 },
  '7005':   { type: 'HSN', desc: 'Float glass and surface ground / polished glass', gst: 18 },
  '7006':   { type: 'HSN', desc: 'Glass bent, edge-worked, engraved, enamelled', gst: 18 },
  '7007':   { type: 'HSN', desc: 'Safety glass (toughened / laminated)', gst: 18 },
  '7008':   { type: 'HSN', desc: 'Multiple-walled insulating glass units', gst: 18 },
  '7009':   { type: 'HSN', desc: 'Glass mirrors', gst: 18 },
  '7016':   { type: 'HSN', desc: 'Glass paving blocks, bricks, tiles, glass of glass', gst: 18 },

  // ── IRON & STEEL — BARS, RODS, PROFILES (Ch. 72) ─────────────────────────
  '7201':   { type: 'HSN', desc: 'Pig iron and spiegeleisen', gst: 18 },
  '7207':   { type: 'HSN', desc: 'Semi-finished products of iron / non-alloy steel', gst: 18 },
  '7208':   { type: 'HSN', desc: 'Flat-rolled iron/steel (hot-rolled, wide)', gst: 18 },
  '7210':   { type: 'HSN', desc: 'Flat-rolled iron/steel (plated / coated)', gst: 18 },
  '7213':   { type: 'HSN', desc: 'Bars and rods — hot-rolled, in irregular coils (rebars)', gst: 18 },
  '721310': { type: 'HSN', desc: 'TMT / rebars — hot-rolled iron/steel bars', gst: 18 },
  '7214':   { type: 'HSN', desc: 'Bars and rods of iron/steel (other)', gst: 18 },
  '7215':   { type: 'HSN', desc: 'Other bars and rods of iron/steel', gst: 18 },
  '7216':   { type: 'HSN', desc: 'Angles, shapes, sections of iron/steel (channels, beams)', gst: 18 },
  '7217':   { type: 'HSN', desc: 'Wire of iron/steel (binding wire)', gst: 18 },
  '7219':   { type: 'HSN', desc: 'Flat-rolled products of stainless steel', gst: 18 },
  '7222':   { type: 'HSN', desc: 'Bars / rods of stainless steel', gst: 18 },
  '7225':   { type: 'HSN', desc: 'Flat-rolled products of other alloy steel', gst: 18 },
  '7227':   { type: 'HSN', desc: 'Bars / rods of other alloy steel (hot-rolled)', gst: 18 },
  '7228':   { type: 'HSN', desc: 'Other bars / rods of alloy steel', gst: 18 },
  '7229':   { type: 'HSN', desc: 'Wire of other alloy steel', gst: 18 },

  // ── STEEL ARTICLES (Ch. 73) ───────────────────────────────────────────────
  '7301':   { type: 'HSN', desc: 'Sheet piling of iron/steel; welded angles, shapes', gst: 18 },
  '7302':   { type: 'HSN', desc: 'Railway track construction material (rails, sleepers)', gst: 5 },
  '7303':   { type: 'HSN', desc: 'Cast iron tubes, pipes and fittings', gst: 18 },
  '7304':   { type: 'HSN', desc: 'Seamless steel tubes and pipes', gst: 18 },
  '7305':   { type: 'HSN', desc: 'Large diameter welded steel tubes / pipes', gst: 18 },
  '7306':   { type: 'HSN', desc: 'Other welded steel tubes / pipes (ERW, HFW)', gst: 18 },
  '7307':   { type: 'HSN', desc: 'Steel pipe fittings (elbows, flanges, couplings)', gst: 18 },
  '7308':   { type: 'HSN', desc: 'Structural steel / fabricated steel structures', gst: 18 },
  '730810': { type: 'HSN', desc: 'Bridges and bridge sections (steel)', gst: 18 },
  '730820': { type: 'HSN', desc: 'Towers, lattice masts of iron/steel', gst: 18 },
  '730830': { type: 'HSN', desc: 'Doors, windows, their frames of iron/steel', gst: 18 },
  '730840': { type: 'HSN', desc: 'Scaffolding, shuttering, prop (steel)', gst: 18 },
  '730890': { type: 'HSN', desc: 'Other structures / parts of structures (steel)', gst: 18 },
  '7309':   { type: 'HSN', desc: 'Reservoirs, tanks, vats of iron/steel (>300 L)', gst: 18 },
  '7310':   { type: 'HSN', desc: 'Steel tanks, casks, drums, cans (<300 L)', gst: 18 },
  '7312':   { type: 'HSN', desc: 'Stranded wire, ropes, cables of iron/steel', gst: 18 },
  '7313':   { type: 'HSN', desc: 'Barbed wire of iron/steel; twisted fencing wire', gst: 18 },
  '7314':   { type: 'HSN', desc: 'Cloth, grill, netting of iron/steel wire', gst: 18 },
  '7315':   { type: 'HSN', desc: 'Chain and parts of iron/steel', gst: 18 },
  '7317':   { type: 'HSN', desc: 'Nails, tacks, staples (steel)', gst: 18 },
  '7318':   { type: 'HSN', desc: 'Bolts, nuts, screws, washers (steel)', gst: 18 },
  '7320':   { type: 'HSN', desc: 'Springs and leaves of iron/steel', gst: 18 },
  '7321':   { type: 'HSN', desc: 'Stoves, cookers, grates of iron/steel', gst: 18 },
  '7322':   { type: 'HSN', desc: 'Radiators for central heating (steel)', gst: 18 },
  '7323':   { type: 'HSN', desc: 'Household articles of iron/steel', gst: 18 },
  '7326':   { type: 'HSN', desc: 'Other articles of iron/steel', gst: 18 },

  // ── COPPER & ALUMINIUM (Ch. 74/76) ───────────────────────────────────────
  '7408':   { type: 'HSN', desc: 'Copper wire', gst: 18 },
  '7411':   { type: 'HSN', desc: 'Copper tubes and pipes', gst: 18 },
  '7412':   { type: 'HSN', desc: 'Copper pipe fittings', gst: 18 },
  '7604':   { type: 'HSN', desc: 'Aluminium bars, rods and profiles', gst: 18 },
  '7605':   { type: 'HSN', desc: 'Aluminium wire', gst: 18 },
  '7608':   { type: 'HSN', desc: 'Aluminium tubes and pipes', gst: 18 },
  '7609':   { type: 'HSN', desc: 'Aluminium tube or pipe fittings', gst: 18 },
  '7610':   { type: 'HSN', desc: 'Aluminium structures (doors, windows, railings)', gst: 18 },
  '7611':   { type: 'HSN', desc: 'Aluminium reservoirs, tanks, vats (>300 L)', gst: 18 },
  '7615':   { type: 'HSN', desc: 'Aluminium household articles', gst: 18 },
  '7616':   { type: 'HSN', desc: 'Other articles of aluminium', gst: 18 },

  // ── HAND TOOLS (Ch. 82) ───────────────────────────────────────────────────
  '8201':   { type: 'HSN', desc: 'Spades, shovels, mattocks, picks, hoes, forks (hand tools)', gst: 12 },
  '8202':   { type: 'HSN', desc: 'Saws (hand); blades for saws', gst: 18 },
  '8203':   { type: 'HSN', desc: 'Files, rasps, pliers, wire cutters', gst: 18 },
  '8204':   { type: 'HSN', desc: 'Hand-operated spanners and wrenches', gst: 18 },
  '8205':   { type: 'HSN', desc: 'Hand tools NES (hammers, chisels, drills)', gst: 18 },
  '8207':   { type: 'HSN', desc: 'Interchangeable tools for hand / machine tools', gst: 18 },
  '8211':   { type: 'HSN', desc: 'Knives, blades for machines or mechanical appliances', gst: 18 },

  // ── MISC BASE METAL ARTICLES (Ch. 83) ─────────────────────────────────────
  '8301':   { type: 'HSN', desc: 'Padlocks and locks of base metal', gst: 18 },
  '8302':   { type: 'HSN', desc: 'Base metal mountings, fittings, hinges, handles', gst: 18 },
  '8304':   { type: 'HSN', desc: 'Filing cabinets, card-index cabinets (base metal)', gst: 18 },
  '8307':   { type: 'HSN', desc: 'Flexible tubing of base metal with fittings', gst: 18 },

  // ── ENGINES & MACHINERY (Ch. 84) ─────────────────────────────────────────
  // Note: 8408 has two rates — verify sub-code before billing
  '8408':   { type: 'HSN', desc: 'Compression-ignition diesel/semi-diesel engines', gst: 28 },
  '840820': { type: 'HSN', desc: 'Fixed-speed diesel engines ≤15 HP (agricultural)', gst: 12 },
  '8409':   { type: 'HSN', desc: 'Parts for diesel/petrol engines (8407/8408)', gst: 28 },

  // Note: 8413 has multiple sub-rates — use the correct sub-code
  '8413':   { type: 'HSN', desc: 'Pumps for liquids (general 18% — see sub-codes)', gst: 18 },
  '841311': { type: 'HSN', desc: 'Pumps for dispensing fuel/lubricants (filling stations)', gst: 28 },
  '841320': { type: 'HSN', desc: 'Hand pumps and parts thereof', gst: 5 },
  '841330': { type: 'HSN', desc: 'Fuel, lubricating or cooling medium pumps for engines', gst: 28 },
  '841340': { type: 'HSN', desc: 'Concrete pumps', gst: 28 },
  '841350': { type: 'HSN', desc: 'Other reciprocating positive displacement pumps', gst: 18 },
  '841360': { type: 'HSN', desc: 'Other rotary positive displacement pumps', gst: 28 },
  '841370': { type: 'HSN', desc: 'Centrifugal pumps (general)', gst: 18 },
  '841381': { type: 'HSN', desc: 'Power-driven water pumps (centrifugal, submersible, turbine)', gst: 12 },

  '8414':   { type: 'HSN', desc: 'Air pumps, compressors, fans, ventilating hoods', gst: 18 },
  '8415':   { type: 'HSN', desc: 'Air conditioning machines', gst: 28 },
  '8425':   { type: 'HSN', desc: 'Pulley tackle, chain hoists, winches, jacks', gst: 18 },
  '8426':   { type: 'HSN', desc: 'Ship derricks, cranes, mobile lifting frames', gst: 18 },
  '8427':   { type: 'HSN', desc: 'Fork-lift trucks and work trucks', gst: 18 },
  '8428':   { type: 'HSN', desc: 'Conveyors, lifts, escalators and other lifting machinery', gst: 18 },
  '8429':   { type: 'HSN', desc: 'Bulldozers, graders, scrapers, excavators, road rollers', gst: 18 },
  '8430':   { type: 'HSN', desc: 'Pile-drivers, boring machinery, snow-ploughs, compactors', gst: 18 },

  // ── HSN 8431 — PARTS FOR CONSTRUCTION MACHINERY — ALL SUB-CODES 18% ──────
  '8431':   { type: 'HSN', desc: 'Parts for HS 8425–8430 construction machinery', gst: 18 },
  '843110': { type: 'HSN', desc: 'Parts for pulley tackle & hoists (8425)', gst: 18 },
  '843120': { type: 'HSN', desc: 'Parts for fork-lift trucks (8427)', gst: 18 },
  '843131': { type: 'HSN', desc: 'Parts for lifts, skip hoists, escalators (8428)', gst: 18 },
  '843139': { type: 'HSN', desc: 'Parts for conveyors, moving equipment (8428)', gst: 18 },
  '843141': { type: 'HSN', desc: 'Buckets, shovels, grabs and grips (8426/8429/8430)', gst: 18 },
  '843142': { type: 'HSN', desc: 'Bulldozer and angledozer blades (8429)', gst: 18 },
  '843143': { type: 'HSN', desc: 'Parts for boring/sinking machinery (8430)', gst: 18 },
  '843149': { type: 'HSN', desc: 'Other parts for 8426/8429/8430 machinery (road rollers, cranes, excavators)', gst: 18 },

  '8432':   { type: 'HSN', desc: 'Agricultural soil preparation / cultivation machinery', gst: 12 },
  '8467':   { type: 'HSN', desc: 'Hand-held tools (pneumatic/hydraulic/motor driven)', gst: 18 },
  '8474':   { type: 'HSN', desc: 'Crushers, mixers, screens for stone/ore/concrete', gst: 18 },
  '8479':   { type: 'HSN', desc: 'Machines for special purposes NES', gst: 18 },
  '8481':   { type: 'HSN', desc: 'Taps, valves, cocks for pipes / tanks', gst: 18 },
  '8482':   { type: 'HSN', desc: 'Ball / roller bearings', gst: 18 },
  // Note: 8483 has two rates — plain shaft bearings 18%, rest 28%
  '8483':   { type: 'HSN', desc: 'Transmission shafts, camshafts, crankshafts, gears, gearboxes, clutches', gst: 28 },
  '848310': { type: 'HSN', desc: 'Plain shaft bearings (without housing)', gst: 18 },
  '8484':   { type: 'HSN', desc: 'Gaskets, washers and similar seals', gst: 18 },

  // ── ELECTRICAL EQUIPMENT (Ch. 85) ─────────────────────────────────────────
  '8501':   { type: 'HSN', desc: 'Electric motors and generators', gst: 18 },
  '8502':   { type: 'HSN', desc: 'Electric generating sets (DG sets)', gst: 18 },
  '8503':   { type: 'HSN', desc: 'Parts for electric motors/generators', gst: 18 },
  '8504':   { type: 'HSN', desc: 'Electrical transformers, static converters, inductors', gst: 18 },
  '8511':   { type: 'HSN', desc: 'Electrical ignition / starting equipment for engines', gst: 18 },
  '8516':   { type: 'HSN', desc: 'Electric water heaters, boilers, space heaters', gst: 28 },
  '8531':   { type: 'HSN', desc: 'Electric sound / visual signalling apparatus', gst: 18 },
  '8535':   { type: 'HSN', desc: 'Electrical apparatus for switching (HV circuits)', gst: 18 },
  '8536':   { type: 'HSN', desc: 'Electrical apparatus for switching (LV ≤1000V)', gst: 18 },
  '8537':   { type: 'HSN', desc: 'Switchboards, control panels, distribution panels', gst: 18 },
  '8544':   { type: 'HSN', desc: 'Insulated wire, cable, electric conductors', gst: 18 },
  '8545':   { type: 'HSN', desc: 'Carbon electrodes, carbon brushes', gst: 18 },
  '8546':   { type: 'HSN', desc: 'Electrical insulators', gst: 18 },
  '8547':   { type: 'HSN', desc: 'Insulating fittings for electrical machines', gst: 18 },

  // ── MOTOR VEHICLES & PARTS (Ch. 87) ───────────────────────────────────────
  '8703':   { type: 'HSN', desc: 'Motor cars and passenger vehicles', gst: 28 },
  '8704':   { type: 'HSN', desc: 'Goods transport vehicles (trucks/lorries/tippers)', gst: 28 },
  '8705':   { type: 'HSN', desc: 'Special purpose motor vehicles (crane trucks, concrete mixers)', gst: 28 },
  '8706':   { type: 'HSN', desc: 'Chassis fitted with engines for motor vehicles', gst: 28 },
  '8707':   { type: 'HSN', desc: 'Bodies (incl. cabs) for motor vehicles', gst: 28 },
  '8708':   { type: 'HSN', desc: 'Parts and accessories for motor vehicles', gst: 28 },
  '8714':   { type: 'HSN', desc: 'Parts and accessories for motorcycles', gst: 28 },
  '8716':   { type: 'HSN', desc: 'Trailers, semi-trailers, non-propelled vehicles', gst: 28 },

  // ── PREFABRICATED STRUCTURES (Ch. 94) ─────────────────────────────────────
  '9406':   { type: 'HSN', desc: 'Prefabricated structures (site offices, cabins, porta-cabins)', gst: 18 },

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
  '996601': { type: 'SAC', desc: 'Goods transport by road — GTA', gst: 5 },
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

  // ── SECURITY SERVICES ────────────────────────────────────────────────────
  '998524': { type: 'SAC', desc: 'Investigation and security services', gst: 18 },
}

/**
 * Look up an HSN or SAC code with prefix fallback.
 * Tries exact match first, then 4-digit chapter prefix.
 * @param {string} code
 * @returns {{ type, desc, gst, cgst, sgst, igst } | null}
 */
export function lookupHsnSac(code) {
  if (!code) return null
  const key = code.trim().toUpperCase().replace(/\s/g, '')
  if (key.length < 4) return null

  // Try exact match first
  let entry = HSN_SAC_DB[key]

  // Fallback: try progressively shorter prefixes (6 → 4 digits)
  if (!entry && key.length >= 6) entry = HSN_SAC_DB[key.slice(0, 6)]
  if (!entry && key.length >= 4) entry = HSN_SAC_DB[key.slice(0, 4)]

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

export function getAllHsnSac() {
  return Object.entries(HSN_SAC_DB).map(([code, v]) => ({ code, ...v }))
}
