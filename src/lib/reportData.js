import { REPORTS, REPORT_SOURCES } from './reportCatalog.js'

export async function fetchReportRows(db, table, companyId) {
  if (!companyId) throw new Error('Select a company to load reports.')
  const rows = []
  let expected = null
  const ids = new Set()
  do {
    const { data, error, count } = await db.from(table).select(REPORT_SOURCES[table], { count: 'exact' })
      .eq('company_id', companyId).order('id', { ascending: true }).range(rows.length, rows.length + 499)
    if (error) throw new Error(`${table}: ${error.message || 'Unable to load data.'}`)
    if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error(`${table}: Could not confirm complete report data. Refresh to retry.`)
    if (expected !== null && count !== expected) throw new Error(`${table}: Data changed while loading. Refresh to retry.`)
    expected = count
    if ((!data.length && rows.length < expected) || rows.length + data.length > expected) throw new Error(`${table}: Incomplete report data. Refresh to retry.`)
    for (const row of data) {
      if (!row.id || ids.has(row.id)) throw new Error(`${table}: Data changed while loading. Refresh to retry.`)
      ids.add(row.id)
    }
    rows.push(...data)
  } while (rows.length < expected)
  return rows
}

export async function loadReportData(reportId, db, companyId) {
  const report = REPORTS.find(r => r.id === reportId)
  if (!report || report.existing) throw new Error('Select a valid report.')
  const sources = [...new Set(report.sources)]
  const results = await Promise.all(sources.map(async table => [table, await fetchReportRows(db, table, companyId)]))
  return Object.fromEntries(results)
}
