// Vercel Serverless Function — GSTIN lookup proxy
// Endpoint: GET /api/gstin?gstin=33AABCU9603R1ZX
// Debug:    GET /api/gstin?gstin=33AABCU9603R1ZX&debug=1

function timeout(ms) {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { gstin, debug } = req.query
  if (!gstin || gstin.length !== 15) {
    return res.status(400).json({ error: 'Invalid GSTIN' })
  }
  const g = gstin.toUpperCase().trim()
  const debugLog = []

  // ── Source 1: Official GST Portal (public taxpayer search) ────────────────
  try {
    const ctrl = timeout(8000)
    const r = await fetch(
      `https://api.gst.gov.in/commonapis/v0.1/search?action=TP&gstin=${g}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible)',
        },
        signal: ctrl.signal,
      }
    )
    const text = await r.text()
    debugLog.push({ source: 'gst.gov.in', status: r.status, body: text.slice(0, 500) })
    if (r.ok) {
      try {
        const json = JSON.parse(text)
        const d = json?.data || json?.taxpayerInfo || json
        const name = d?.legalName || d?.lgnm || d?.tradeNam
        if (name) {
          const addr = d?.principalPlaceOfBusiness?.address || d?.pradr || {}
          if (!debug) return res.status(200).json({
            businessName: name,
            tradeName:    d?.tradeName || d?.tradeNam || '',
            gstinStatus:  d?.status   || d?.sts       || 'Active',
            address:      addr?.address || addr?.adr   || '',
            city:         addr?.city  || addr?.dst     || '',
            pincode:      addr?.pincode|| addr?.pncd   || '',
            source: 'gst.gov.in',
          })
        }
      } catch(e) { debugLog.push({ parse_error: e.message }) }
    }
  } catch(e) { debugLog.push({ source: 'gst.gov.in', error: e.message }) }

  // ── Source 2: KnowYourGST ─────────────────────────────────────────────────
  try {
    const ctrl = timeout(8000)
    const r = await fetch(
      `https://api.knowyourgst.com/getgstin/?gstin=${g}&key=demo`,
      { headers: { Accept: 'application/json' }, signal: ctrl.signal }
    )
    const text = await r.text()
    debugLog.push({ source: 'knowyourgst', status: r.status, body: text.slice(0, 500) })
    if (r.ok) {
      try {
        const json = JSON.parse(text)
        const info = json?.taxpayerInfo
        if (info?.lgnm) {
          if (!debug) return res.status(200).json({
            businessName: info.lgnm,
            tradeName:    info.tradeNam || '',
            gstinStatus:  info.sts      || 'Active',
            address:      info.pradr?.adr || '',
            city:         info.pradr?.dst || info.pradr?.city || '',
            pincode:      info.pradr?.pncd || '',
            source: 'knowyourgst',
          })
        }
      } catch(e) { debugLog.push({ parse_error: e.message }) }
    }
  } catch(e) { debugLog.push({ source: 'knowyourgst', error: e.message }) }

  // ── Source 3: MasterGST public search ─────────────────────────────────────
  try {
    const ctrl = timeout(8000)
    const r = await fetch(
      `https://api.mastersindia.co/commonapi/V2/search_by_gstin?gstin=${g}`,
      { headers: { Accept: 'application/json' }, signal: ctrl.signal }
    )
    const text = await r.text()
    debugLog.push({ source: 'mastersindia', status: r.status, body: text.slice(0, 500) })
    if (r.ok) {
      try {
        const json = JSON.parse(text)
        const d = json?.data || json
        if (d?.lgnm || d?.legalName) {
          if (!debug) return res.status(200).json({
            businessName: d.lgnm || d.legalName,
            tradeName:    d.tradeNam || '',
            gstinStatus:  d.sts || 'Active',
            address:      d.pradr?.adr || '',
            city:         d.pradr?.dst || '',
            pincode:      d.pradr?.pncd || '',
            source: 'mastersindia',
          })
        }
      } catch(e) { debugLog.push({ parse_error: e.message }) }
    }
  } catch(e) { debugLog.push({ source: 'mastersindia', error: e.message }) }

  // Return debug log if requested, otherwise 404
  if (debug) {
    return res.status(200).json({ gstin: g, debug: debugLog })
  }

  return res.status(404).json({
    error: 'GSTIN not found. Verify the number is correct and GST registration is active.',
  })
}
