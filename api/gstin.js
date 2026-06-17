// Vercel Serverless Function — GSTIN lookup proxy
// Server-side fetch avoids browser CORS restrictions
// Endpoint: GET /api/gstin?gstin=33AABCU9603R1ZX

function makeAbortController(ms) {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { gstin } = req.query
  if (!gstin || gstin.length !== 15) {
    return res.status(400).json({ error: 'Invalid GSTIN' })
  }
  const g = gstin.toUpperCase().trim()

  // ── Source 1: Official GST Government Portal ───────────────────────────────
  // Same API the GST portal's "Search Taxpayer" page uses — no auth needed
  try {
    const ctrl = makeAbortController(8000)
    const r = await fetch(
      `https://api.gst.gov.in/commonapis/v0.1/search?action=TP&gstin=${g}`,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: ctrl.signal,
      }
    )
    if (r.ok) {
      const json = await r.json()
      // Response field names vary — try both formats
      const d = json?.data || json?.taxpayerInfo || json
      const legalName = d?.legalName || d?.lgnm || d?.tradeNam
      if (legalName) {
        const addr = d?.principalPlaceOfBusiness?.address || d?.pradr || {}
        return res.status(200).json({
          businessName: legalName,
          tradeName:    d?.tradeName || d?.tradeNam || '',
          gstinStatus:  d?.status    || d?.sts      || 'Active',
          address:      addr?.address || addr?.adr   || '',
          city:         addr?.city   || addr?.dst    || d?.city || '',
          pincode:      addr?.pincode|| addr?.pncd   || '',
          registrationDate: d?.registrationDate || d?.rgdt || '',
          source: 'gst.gov.in',
        })
      }
    }
  } catch { /* try next */ }

  // ── Source 2: KnowYourGST (free) ──────────────────────────────────────────
  try {
    const ctrl = makeAbortController(8000)
    const r = await fetch(
      `https://api.knowyourgst.com/getgstin/?gstin=${g}&key=demo`,
      { headers: { Accept: 'application/json' }, signal: ctrl.signal }
    )
    if (r.ok) {
      const json = await r.json()
      const info = json?.taxpayerInfo
      if (info?.lgnm) {
        return res.status(200).json({
          businessName: info.lgnm,
          tradeName:    info.tradeNam || '',
          gstinStatus:  info.sts      || 'Active',
          address:      info.pradr?.adr || '',
          city:         info.pradr?.dst || info.pradr?.city || '',
          pincode:      info.pradr?.pncd || '',
          registrationDate: info.rgdt || '',
          source: 'knowyourgst',
        })
      }
    }
  } catch { /* try next */ }

  // ── Source 3: GSTZen public API ───────────────────────────────────────────
  try {
    const ctrl = makeAbortController(8000)
    const r = await fetch(
      `https://api.gstzen.in/taxpayer/search?gstin=${g}`,
      { headers: { Accept: 'application/json' }, signal: ctrl.signal }
    )
    if (r.ok) {
      const json = await r.json()
      const d = json?.data || json
      if (d?.legalName || d?.lgnm) {
        return res.status(200).json({
          businessName: d.legalName || d.lgnm,
          tradeName:    d.tradeName || d.tradeNam || '',
          gstinStatus:  d.status   || d.sts      || 'Active',
          address:      d.address  || '',
          city:         d.city     || '',
          pincode:      d.pincode  || d.pin || '',
          source: 'gstzen',
        })
      }
    }
  } catch { /* all sources failed */ }

  // All three failed — GSTIN might not be registered, or all APIs down
  return res.status(404).json({
    error: 'GSTIN not found in GST records. Please verify the number is correct and active.',
  })
}
