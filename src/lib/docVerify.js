/**
 * docVerify.js — Document verification helper
 *
 * Creates a verification record in document_verifications and returns
 * the public URL to embed in the document QR code.
 *
 * Usage:
 *   const verifyUrl = await createVerification(supabase, companyId, {
 *     docType: 'invoice',
 *     docNumber: inv.invoice_number,
 *     docDate: inv.invoice_date,
 *     partyName: inv.client_name,
 *     amount: inv.total_amount,
 *   })
 *   await generateInvoicePDF(inv, lineItems, company, verifyUrl)
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} companyId
 * @param {{ docType: string, docNumber: string, docDate?: string, partyName?: string, amount?: number }} opts
 * @returns {Promise<string|null>} Full verification URL, or null on failure
 */
export async function createVerification(supabase, companyId, { docType, docNumber, docDate, partyName, amount }) {
  if (!supabase || !companyId || !docNumber) return null
  try {
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
      })
      .select('token')
      .single()

    if (error || !data?.token) return null
    return `${window.location.origin}/verify/${data.token}`
  } catch {
    return null
  }
}
