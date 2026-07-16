/**
 * docNumbers.js
 * Atomic document number generation via Supabase RPC.
 * Replaces fragile count-based numbering across the entire app.
 */
import { supabase } from '../lib/supabase'

const YEAR = new Date().getFullYear()

// Config for every document type in the app
export const DOC_TYPES = {
  // Purchase
  bill:             { prefix: 'BL',  yearBased: true,  pad: 4 },
  po:               { prefix: 'PO',  yearBased: true,  pad: 4 },
  vendor_credit:    { prefix: 'VC',  yearBased: true,  pad: 4 },
  payment_made:     { prefix: 'PM',  yearBased: true,  pad: 4 },
  // Sales
  invoice:          { prefix: 'INV', yearBased: true,  pad: 4 },
  quote:            { prefix: 'QT',  yearBased: true,  pad: 4 },
  sales_order:      { prefix: 'SO',  yearBased: true,  pad: 4 },
  challan:          { prefix: 'DC',  yearBased: true,  pad: 4 },
  credit_note:      { prefix: 'CN',  yearBased: true,  pad: 4 },
  payment_recv:     { prefix: 'PR',  yearBased: true,  pad: 4 },
  // Inventory transactions (year-based, reset each year)
  stock_in:         { prefix: 'GRN', yearBased: true,  pad: 4 },
  stock_out:        { prefix: 'ISS', yearBased: true,  pad: 4 },
  stock_transfer:   { prefix: 'TRF', yearBased: true,  pad: 4 },
  stock_adjustment: { prefix: 'ADJ', yearBased: true,  pad: 4 },
  // Letters
  letter:           { prefix: 'LTR', yearBased: true,  pad: 4 },
  // Master records (lifetime, never reset)
  vendor:           { prefix: 'V',   yearBased: false, pad: 4 },
  employee:         { prefix: 'EMP', yearBased: false, pad: 4 },
  inventory_item:   { prefix: 'ITM', yearBased: false, pad: 4 },
}

/**
 * Auto-number for fleet equipment, keyed per category prefix.
 * e.g. category "excavator" with prefix "EX" → seq_key "equipment_EX" → "EX-0001"
 * @param {string} companyId
 * @param {string} prefix - equipment category prefix (EX, DZ, CR, etc.)
 * @returns {Promise<string>} e.g. "EX-0001"
 */
export async function nextEquipmentNumber(companyId, prefix) {
  const seqKey = `equipment_${prefix}`
  const { data, error } = await supabase.rpc('next_doc_seq', {
    p_company_id: companyId,
    p_seq_key:    seqKey,
  })
  if (error) throw error
  return `${prefix}-${String(data).padStart(4, '0')}`
}

/**
 * Fetches the next document number for a given type.
 * @param {string} companyId - UUID of the company
 * @param {string} docType   - key from DOC_TYPES
 * @returns {Promise<string>} formatted number e.g. "BL-2026-0001"
 */
export async function nextDocNumber(companyId, docType) {
  const cfg = DOC_TYPES[docType]
  if (!cfg) throw new Error(`Unknown doc type: ${docType}`)

  const seqKey = cfg.yearBased ? `${docType}_${YEAR}` : docType

  const { data, error } = await supabase.rpc('next_doc_seq', {
    p_company_id: companyId,
    p_seq_key:    seqKey,
  })
  if (error) throw error

  const num = String(data).padStart(cfg.pad, '0')
  return cfg.yearBased
    ? `${cfg.prefix}-${YEAR}-${num}`
    : `${cfg.prefix}-${num}`
}
