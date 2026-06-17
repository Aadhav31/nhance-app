// Vercel Serverless Function — GSTIN lookup proxy
// Avoids CORS by fetching the GST portal API server-side
// Endpoint: GET /api/gstin?gstin=33AABCU9603R1ZX

export default async function handler(req, res) {
  // CORS headers so the browser can call this
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { gstin } = req.query
  if (!gstin || gstin.length !== 15) {
    return res.status(400).json({ error: 'Invalid GSTIN length' })
  }

  const g = gstin.toUpperCase().trim()

  // Try multiple free endpoints in sequence
  const sources = [
    // Source 1: knowyourgst.com free demo
    async () => {
      const r = await fetch(
        `https://api.knowyourgst.com/getgstin/?gstin=${g}&key=demo`,
        { headers: { Accept: 'application/json', 'User-Agent': 'Nhance-App/1.0' }, signal: AbortSignal.timeout(6000) }
      )
      if (!r.ok) return null
      const d = await r.json()
      const info = d?.taxpayerInfo
      if (!info?.lgnm) return null
      return {
        businessName: info.lgnm,
        tradeName:    info.tradeNam || '',
        gstinStatus:  info.sts || 'Active',
        address:      info.pradr?.adr || '',
        city:         info.pradr?.dst || info.pradr?.city || '',
        pincode:      info.pradr?.pncd || '',
        registrationDate: info.rgdt || '',
        source: 'knowyourgst',
      }
    },
    // Source 2: gstincheck.co.in (alternative free endpoint)
    async () => {
      const r = await fetch(
        `https://api.gstincheck.co.in/check/free/${g}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
      )
      if (!r.ok) return null
      const d = await r.json()
      if (!d?.taxpayerInfo?.lgnm) return null
      return {
        businessName: d.taxpayerInfo.lgnm,
        tradeName:    d.taxpayerInfo.tradeNam || '',
        gstinStatus:  d.taxpayerInfo.sts || 'Active',
        address:      d.taxpayerInfo.pradr?.adr || '',
        city:         d.taxpayerInfo.pradr?.dst || '',
        pincode:      d.taxpayerInfo.pradr?.pncd || '',
        source: 'gstincheck',
      }
    },
  ]

  for (const source of sources) {
    try {
      const result = await source()
      if (result) return res.status(200).json(result)
    } catch { /* try next */ }
  }

  // All sources failed — return 404 so client knows to go manual
  return res.status(404).json({ error: 'Could not fetch GSTIN details from any source' })
}
