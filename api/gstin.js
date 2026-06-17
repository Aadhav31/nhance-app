// Vercel Serverless Function — GSTIN lookup proxy
// Uses Sandbox.co.in GST Compliance API (free tier: 1,000 calls/month)
//
// Required Vercel env vars:
//   SANDBOX_API_KEY     — from sandbox.co.in dashboard
//   SANDBOX_API_SECRET  — from sandbox.co.in dashboard
//
// Status codes returned to frontend:
//   200  — found, returns { businessName, tradeName, gstinStatus, address, city, state, pincode, source }
//   404  — GSTIN confirmed not found (FO8000 from GST portal)
//   503  — all sources unavailable (missing key, network error, etc.)
//   400  — bad GSTIN format

function abortIn(ms) {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl
}

// Step 1 — get a short-lived JWT from Sandbox
async function getSandboxToken(apiKey, apiSecret) {
  const ctrl = abortIn(8000)
  const r = await fetch('https://api.sandbox.co.in/authenticate', {
    method: 'POST',
    headers: {
      'x-api-key':    apiKey,
      'x-api-secret': apiSecret,
      'x-api-version': '1.0.0',
    },
    signal: ctrl.signal,
  })
  if (!r.ok) return null
  const json = await r.json()
  return json?.access_token || null
}

// Step 2 — call the GST taxpayer search
async function searchGSTIN(gstin, apiKey, token) {
  const ctrl = abortIn(10000)
  const r = await fetch('https://api.sandbox.co.in/gst/compliance/public/gstin/search', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'authorization': token,
      'x-api-key':     apiKey,
      'x-api-version': '1.0.0',
    },
    body: JSON.stringify({ gstin }),
    signal: ctrl.signal,
  })
  return r
}

function buildAddress(addr) {
  // pradr.addr: { bno, bnm, st, flno, loc, dst, stcd, pncd }
  const parts = [
    addr.bno && addr.bnm ? `${addr.bno}, ${addr.bnm}` : addr.bno || addr.bnm,
    addr.flno,
    addr.st,
    addr.loc,
  ].filter(Boolean)
  return parts.join(', ')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { gstin } = req.query
  if (!gstin || gstin.length < 15) {
    return res.status(400).json({ error: 'Invalid GSTIN — must be 15 characters' })
  }
  const g = gstin.toUpperCase().trim()

  const apiKey    = process.env.SANDBOX_API_KEY
  const apiSecret = process.env.SANDBOX_API_SECRET

  // ── Sandbox.co.in (primary source) ────────────────────────────────────────
  if (apiKey && apiSecret) {
    try {
      const token = await getSandboxToken(apiKey, apiSecret)
      if (token) {
        const r = await searchGSTIN(g, apiKey, token)
        const json = await r.json()

        // FO8000 = "No records found" — definitive not-found from GST portal
        if (json?.data?.error?.error_cd === 'FO8000') {
          return res.status(404).json({
            error: 'GSTIN not registered in GST portal. Verify the number and try again.',
          })
        }

        const d = json?.data?.data
        if (d?.lgnm) {
          const addr = d.pradr?.addr || {}
          return res.status(200).json({
            businessName: d.lgnm,
            tradeName:    d.tradeNam || '',
            gstinStatus:  d.sts || 'Active',
            address:      buildAddress(addr),
            city:         addr.dst || addr.loc || '',
            state:        addr.stcd || '',
            pincode:      addr.pncd || '',
            source:       'sandbox.co.in',
          })
        }
      }
    } catch(e) {
      // Fall through to fallback sources
      console.error('[gstin] sandbox error:', e.message)
    }
  }

  // ── Fallback 1: Official GST portal with public headers ───────────────────
  // Works intermittently — kept as a best-effort fallback when no API key configured
  try {
    const ctrl = abortIn(9000)
    const r = await fetch(
      `https://api.gst.gov.in/commonapis/v0.1/search?action=TP&gstin=${g}`,
      {
        headers: {
          'Accept':        'application/json, */*',
          'Authorization': 'Bearer undefined',
          'Referer':       'https://www.gst.gov.in/',
          'Origin':        'https://www.gst.gov.in',
          'User-Agent':    'Mozilla/5.0 (compatible; NhanceApp)',
        },
        signal: ctrl.signal,
      }
    )
    const text = await r.text()
    if (r.ok) {
      const json = JSON.parse(text)
      const d = json?.data || json
      if (d?.lgnm) {
        const addr = d.pradr?.addr || d.pradr || {}
        return res.status(200).json({
          businessName: d.lgnm,
          tradeName:    d.tradeNam || '',
          gstinStatus:  d.sts || 'Active',
          address:      addr.adr || buildAddress(addr),
          city:         addr.dst || addr.loc || '',
          state:        addr.stcd || '',
          pincode:      addr.pncd || '',
          source:       'gst.gov.in',
        })
      }
      if (/not\s*found|no\s*record/i.test(JSON.stringify(json))) {
        return res.status(404).json({ error: 'GSTIN not found in GST portal.' })
      }
    }
  } catch(e) {
    console.error('[gstin] fallback error:', e.message)
  }

  // ── All sources unavailable ───────────────────────────────────────────────
  // Return 503 (not 404!) so the frontend knows the GSTIN may still be valid
  return res.status(503).json({
    error: !apiKey
      ? 'GSTIN_API_KEY not configured. Please add SANDBOX_API_KEY and SANDBOX_API_SECRET to Vercel environment variables.'
      : 'GST portal verification temporarily unavailable. Enter business details manually.',
  })
}
