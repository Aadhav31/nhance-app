/**
 * docVerify.js — Document verification helper (Option C: URL + HMAC hybrid)
 *
 * Flow:
 *  1. At PDF generation time → createVerification() signs the document fields
 *     with HMAC-SHA256, stores the sig in the DB, and returns a URL like:
 *       https://nhance.app/verify/<uuid>?sig=<hex_hmac>
 *
 *  2. QR code on the PDF encodes that URL.
 *
 *  3. Anyone scanning the QR opens VerifyPage which:
 *       a) Looks up the token in DB (checks status: active / void)
 *       b) Recomputes HMAC from the DB record and compares with stored sig
 *          → proves the DB data was not tampered with after issuance
 *       c) Compares URL sig with stored DB sig
 *          → proves the QR itself was not modified
 *
 * Secret key:
 *   Set VITE_NHANCE_SIGN_SECRET in .env.local and in Vercel environment variables.
 *   Generate with: openssl rand -hex 32
 *   Without it the fallback dev key is used (only safe for local testing).
 */

// ── Secret (set per-environment) ─────────────────────────────────────────────
const SECRET =
  import.meta.env.VITE_NHANCE_SIGN_SECRET ||
  'nhance-dev-only-secret-replace-in-production'

// ── HMAC-SHA256 via Web Crypto API (browser-native, zero deps) ───────────────
export async function hmacSHA256(message) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(message))
  return Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Canonical payload — same order used at sign time and verify time ──────────
export function buildSigPayload({ docType, docNumber, docDate, partyName, amount, companyId }) {
  return [
    docType       || '',
    docNumber     || '',
    docDate       || '',
    partyName     || '',
    Number(amount || 0).toFixed(2),
    companyId     || '',
  ].join('|')
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} companyId
 * @param {{ docType: string, docNumber: string, docDate?: string, partyName?: string, amount?: number }} opts
 * @returns {Promise<string|null>} Full verification URL (with sig param), or null on failure
 */
export async function createVerification(supabase, companyId, { docType, docNumber, docDate, partyName, amount }) {
  if (!supabase || !companyId || !docNumber) return null
  try {
    // 1. Sign the canonical document payload
    const sig = await hmacSHA256(
      buildSigPayload({ docType, docNumber, docDate, partyName, amount, companyId })
    )

    // 2. Store record + sig in DB
    const { data, error } = await supabase
      .from('document_verifications')
      .insert({
        company_id: companyId,
        doc_type:   docType,
        doc_number: docNumber,
        doc_date:   docDate   || null,
        party_name: partyName || null,
        amount:     amount    != null ? Number(amount) : null,
        status:     'active',
        sig,
      })
      .select('token')
      .single()

    if (error || !data?.token) return null

    // 3. Return URL with sig embedded — this becomes the QR payload
    return `${window.location.origin}/verify/${data.token}?sig=${sig}`
  } catch {
    return null
  }
}
