// Vercel Serverless Function — GSTIN lookup proxy
// Endpoint: GET /api/gstin?gstin=33AABCU9603R1ZX
// Debug:    GET /api/gstin?gstin=33AABCU9603R1ZX&debug=1
//
// Status codes:
//   200  — found, returns { businessName, tradeName, gstinStatus, address, city, pincode, source }
//   404  — GSTIN confirmed not found in GST records
//   503  — could not reach / auth error on all sources (GSTIN may still be valid)
//   400  — invalid gstin format

function withTimeout(ms) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  ctrl._id = id
  return ctrl
}

// Try to parse common GST API response shapes → return { businessName, ... } or null
function parseGSTResponse(json) {
  // Shape 1: { data: { lgnm, tradeNam, sts, pradr: { adr, dst, pncd } } }
  // Shape 2: { taxpayerInfo: { lgnm, ... } }
  // Shape 3: { lgnm, ... } (flat)
  const d =
    json?.taxpayerInfo ||
    json?.data?.taxpayerInfo ||
    json?.data ||
    json

  const name = d?.lgnm || d?.legalName || d?.tradeName || d?.tradeNam
  if (!name) return null

  const addr = d?.pradr || d?.principalPlaceOfBusiness || {}
  return {
    businessName: d?.lgnm || d?.legalName || name,
    tradeName:    d?.tradeNam || d?.tradeName || '',
    gstinStatus:  d?.sts || d?.status || 'Active',
    address:      addr?.adr || addr?.address || '',
    city:         addr?.dst || addr?.city || '',
    pincode:      addr?.pncd || addr?.pincode || '',
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { gstin, debug } = req.query
  if (!gstin || gstin.length !== 15) {
    return res.status(400).json({ error: 'Invalid GSTIN' })
  }
  const g = gstin.toUpperCase().trim()

  const log = []          // debug log
  let confirmedNotFound = false   // any source explicitly said GSTIN not found

  // ── Source 1: Official GST portal (public taxpayer search)
  // The portal's own public search page calls this with "Bearer undefined" — works for public info
  try {
    const ctrl = withTimeout(9000)
    const r = await fetch(
      `https://api.gst.gov.in/commonapis/v0.1/search?action=TP&gstin=${g}`,
      {
        headers: {
          'Accept':        'application/json, text/plain, */*',
          'Authorization': 'Bearer undefined',
          'Referer':       'https://www.gst.gov.in/',
          'Origin':        'https://www.gst.gov.in',
          'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        },
        signal: ctrl.signal,
      }
    )
    clearTimeout(ctrl._id)
    const text = await r.text()
    log.push({ source: 'gst.gov.in', status: r.status, body: text.slice(0, 600) })

    if (r.ok) {
      try {
        const json = JSON.parse(text)
        // Check for explicit "not found" error codes
        const errMsg = json?.message || json?.error?.message || json?.errorMessage || ''
        if (/not\s*found|invalid.*gstin|gstin.*invalid|no.*record/i.test(errMsg)) {
          confirmedNotFound = true
        } else {
          const parsed = parseGSTResponse(json)
          if (parsed) {
            if (debug) { res.status(200).json({ gstin: g, data: parsed, log }); return }
            return res.status(200).json({ ...parsed, source: 'gst.gov.in' })
          }
        }
      } catch(e) { log.push({ parse_error: e.message }) }
    } else if (r.status === 404) {
      confirmedNotFound = true
      log.push({ note: 'gst.gov.in returned 404 — GSTIN not found' })
    }
    // 401/403 = auth needed; 5xx = server error — NOT "not found"
  } catch(e) {
    log.push({ source: 'gst.gov.in', error: e.message })
  }

  // ── Source 2: GST portal v2 endpoint
  try {
    const ctrl = withTimeout(9000)
    const r = await fetch(
      `https://services.gst.gov.in/services/api/search/taxpayerDetails?gstin=${g}`,
      {
        headers: {
          'Accept':     'application/json',
          'Referer':    'https://services.gst.gov.in/',
          'User-Agent': 'Mozilla/5.0 (compatible; NhanceApp/1.0)',
        },
        signal: ctrl.signal,
      }
    )
    clearTimeout(ctrl._id)
    const text = await r.text()
    log.push({ source: 'services.gst.gov.in', status: r.status, body: text.slice(0, 600) })

    if (r.ok) {
      try {
        const json = JSON.parse(text)
        const errMsg = json?.message || json?.errorMessage || ''
        if (/not\s*found|invalid/i.test(errMsg)) {
          confirmedNotFound = true
        } else {
          const parsed = parseGSTResponse(json)
          if (parsed) {
            if (debug) { res.status(200).json({ gstin: g, data: parsed, log }); return }
            return res.status(200).json({ ...parsed, source: 'services.gst.gov.in' })
          }
        }
      } catch(e) { log.push({ parse_error: e.message }) }
    } else if (r.status === 404) {
      confirmedNotFound = true
    }
  } catch(e) {
    log.push({ source: 'services.gst.gov.in', error: e.message })
  }

  // ── Source 3: KnowYourGST (free demo tier)
  try {
    const ctrl = withTimeout(8000)
    const r = await fetch(
      `https://api.knowyourgst.com/getgstin/?gstin=${g}&key=demo`,
      {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      }
    )
    clearTimeout(ctrl._id)
    const text = await r.text()
    log.push({ source: 'knowyourgst', status: r.status, body: text.slice(0, 600) })

    if (r.ok) {
      try {
        const json = JSON.parse(text)
        const parsed = parseGSTResponse(json)
        if (parsed) {
          if (debug) { res.status(200).json({ gstin: g, data: parsed, log }); return }
          return res.status(200).json({ ...parsed, source: 'knowyourgst' })
        }
        if (json?.taxpayerInfo === null || /not\s*found/i.test(json?.message || '')) {
          confirmedNotFound = true
        }
      } catch(e) { log.push({ parse_error: e.message }) }
    }
  } catch(e) {
    log.push({ source: 'knowyourgst', error: e.message })
  }

  // Return debug data if requested
  if (debug) {
    return res.status(200).json({
      gstin: g,
      confirmedNotFound,
      log,
      verdict: confirmedNotFound ? 'not_found' : 'unreachable',
    })
  }

  // If at least one source confirmed "not found", trust it
  if (confirmedNotFound) {
    return res.status(404).json({
      error: 'GSTIN not registered in GST portal. Verify the number is correct and currently active.',
    })
  }

  // All sources failed for auth/network reasons — return 503 (not 404!)
  return res.status(503).json({
    error: 'GST portal verification temporarily unavailable. Please enter business details manually.',
  })
}
