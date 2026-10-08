import { ACTIVITY_BASIS, ACTIVITY_TIME_ZONE, activityAction, activityFields, activityReference, activitySection, activitySectionCounts, activityTimestamp, activityValue, redactActivity } from './dailyActivity.js'
import { csvCell } from './reportExport.js'

const headings = ['Event #', 'Time (IST)', 'Section', 'User', 'Role', 'Action', 'Reference', 'Description', 'Table', 'Changed fields', 'Source']
const eventValues = event => [event.event_no, activityTimestamp(event.created_at), activitySection(event), event.actor_name || (event.actor_id ? 'Unknown user' : 'System / automation'), event.actor_role || '', activityAction(event), activityReference(event), event.description || '', event.table_name || '', (event.changed_fields || []).join(', '), event.source || '']
const safeReport = report => ({ ...report, events: report.events.map(redactActivity) })
const summary = report => [['Company', report.companyName || 'Nhance'], ['Activity date', report.date], ['Time zone', ACTIVITY_TIME_ZONE], ['Filters', report.filterDescription], ['Matching events', report.events.length], ['All events on this day', report.total], ['Snapshot through event', report.highWater ?? 'None'], ['Loaded at', report.loadedAt], ['Recorded history starts', report.historyStart || 'No events recorded'], ['Coverage', ACTIVITY_BASIS], ['Export note', 'Credential redaction is applied to exported values. Event hashes refer to the original database ledger.'], [], ['Section', 'Matching events'], ...Object.entries(activitySectionCounts(report.events))]
export function dailyActivityJSON(report) {
  const safe = safeReport(report)
  return JSON.stringify({ report: 'Daily Activity Report', company: safe.companyName, date: safe.date, timeZone: ACTIVITY_TIME_ZONE, filters: safe.filterDescription, totalDayEvents: safe.total, matchingEvents: safe.events.length, highWater: safe.highWater, loadedAt: safe.loadedAt, historyStart: safe.historyStart, basis: ACTIVITY_BASIS, sections: activitySectionCounts(safe.events), events: safe.events }, null, 2)
}
export function dailyActivityCSV(report) {
  const safe = safeReport(report)
  const rows = [...summary(safe), [], [...headings, 'Record primary key', 'Before (JSON)', 'After (JSON)', 'Metadata (JSON)', 'UTC timestamp', 'Event hash', 'Previous hash', 'Transaction ID'], ...safe.events.map(event => [...eventValues(event), activityValue(event.record_pk), activityValue(event.old_data), activityValue(event.new_data), activityValue(event.meta), event.created_at, event.event_hash || '', event.previous_hash || '', event.transaction_id ?? ''])]
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}
const chunks = (value, size) => {
  const text = String(value ?? ''), parts = []
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + size, text.length)
    // A UTF-16 pair must stay in one cell or Excel replaces it on round-trip.
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--
    parts.push(text.slice(start, end)); start = end
  }
  return parts.length ? parts : ['']
}
export async function createDailyActivityWorkbook(report) {
  const XLSX = await import('xlsx'), safe = safeReport(report), book = XLSX.utils.book_new()
  const addSheets = (name, header, rows) => {
    // Excel limits: 32,767 characters per cell and 1,048,576 rows per sheet.
    // Long snapshots are split into explicitly numbered parts, never discarded.
    for (let start = 0, part = 1; start < Math.max(1, rows.length); start += 1000000, part++) {
      const values = [header, ...rows.slice(start, start + 1000000)]
      const sheet = XLSX.utils.aoa_to_sheet(values)
      sheet['!cols'] = header.map(() => ({ wch: 24 }))
      sheet['!autofilter'] = { ref: sheet['!ref'] }
      XLSX.utils.book_append_sheet(book, sheet, part === 1 ? name : `${name} ${part}`)
    }
  }
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary(safe)), 'Summary')
  addSheets('Activities', headings, safe.events.map(event => eventValues(event).map(value => typeof value === 'string' && value.length > 29000 ? '[Full value in Event JSON sheet]' : value)))
  const changes = [], raw = []
  for (const event of safe.events) {
    for (const field of activityFields(event)) {
      for (const [side, snapshot] of [['Before', event.old_data], ['After', event.new_data]]) {
        const parts = chunks(activityValue(snapshot?.[field]), 29000)
        parts.forEach((value, i) => changes.push([event.event_no, field, (event.changed_fields || []).includes(field) ? 'Yes' : 'No', side, i + 1, parts.length, value]))
      }
    }
    const parts = chunks(JSON.stringify(event), 29000)
    parts.forEach((value, i) => raw.push([event.event_no, i + 1, parts.length, value]))
  }
  addSheets('Record values', ['Event #', 'Field', 'Changed', 'Snapshot', 'Part', 'Parts', 'Value (JSON)'], changes)
  addSheets('Event JSON', ['Event #', 'Part', 'Parts', 'JSON (concatenate parts in order)'], raw)
  return book
}
export async function createDailyActivityPDF(report) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const safe = safeReport(report), doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'bold').setFontSize(16).text('Daily Activity Report', 10, 12)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  const intro = doc.splitTextToSize(`${safe.companyName || 'Nhance'} | ${safe.date} | India time (IST)\n${safe.filterDescription}\n${safe.events.length} matching events of ${safe.total} daily events | Snapshot through event ${safe.highWater ?? 'none'}\n${ACTIVITY_BASIS}\nRecorded history starts: ${safe.historyStart || 'No events recorded'}`, width - 20)
  doc.text(intro, 10, 19)
  const activityRows = safe.events.flatMap(event => {
    const values = eventValues(event).map(value => chunks(String(value ?? '').replaceAll('\n', '\\n').replaceAll('\r', '\\r'), 250))
    return Array.from({ length: Math.max(...values.map(parts => parts.length)) }, (_, i) => values.map((parts, column) => column === 0 ? event.event_no : parts[i] || ''))
  })
  autoTable(doc, { startY: 21 + intro.length * 4, margin: { left: 10, right: 10, bottom: 12 }, head: [headings], body: activityRows, styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' }, headStyles: { fillColor: [49, 46, 129] } })
  if (!safe.events.length) doc.text('No recorded activities match this date and these filters.', 10, doc.lastAutoTable.finalY + 8)
  // Complete before/after values are carried in the appendix, including deletes.
  if (safe.events.length) {
    doc.addPage().setFont('helvetica', 'bold').setFontSize(12).text('Record values and event details', 10, 12)
    const rows = []
    for (const event of safe.events) {
      const fields = activityFields(event)
      for (const field of fields) {
        const before = chunks(activityValue(event.old_data?.[field]), 250), after = chunks(activityValue(event.new_data?.[field]), 250)
        const parts = Math.max(before.length, after.length)
        for (let i = 0; i < parts; i++) rows.push([event.event_no, field, (event.changed_fields || []).includes(field) ? 'Yes' : 'No', `${i + 1}/${parts}`, before[i] || '', after[i] || ''])
      }
      const eventDetails = { ...event }
      delete eventDetails.old_data; delete eventDetails.new_data
      const meta = chunks(JSON.stringify(eventDetails), 250)
      meta.forEach((value, i) => rows.push([event.event_no, 'Event metadata', '', `${i + 1}/${meta.length}`, '', value]))
    }
    autoTable(doc, { startY: 18, margin: { left: 10, right: 10, bottom: 12 }, head: [['Event #', 'Field', 'Changed', 'Part', 'Before (JSON)', 'After (JSON)']], body: rows, styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' }, columnStyles: { 4: { cellWidth: 95 }, 5: { cellWidth: 95 } }, headStyles: { fillColor: [49, 46, 129] } })
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) doc.setPage(page).setFont('helvetica', 'normal').setFontSize(7).setTextColor(100).text(`Page ${page} of ${doc.getNumberOfPages()} | ${safe.date} IST | All matching activities`, width - 10, height - 5, { align: 'right' })
  return doc
}
function downloadText(text, name, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function downloadDailyActivity(format, report) {
  const name = `daily_activity_${report.date}`
  if (format === 'csv') downloadText(dailyActivityCSV(report), `${name}.csv`, 'text/csv;charset=utf-8;')
  else if (format === 'json') downloadText(dailyActivityJSON(report), `${name}.json`, 'application/json;charset=utf-8;')
  else if (format === 'excel') {
    const [XLSX, book] = await Promise.all([import('xlsx'), createDailyActivityWorkbook(report)])
    XLSX.writeFile(book, `${name}.xlsx`)
  } else if (format === 'pdf') (await createDailyActivityPDF(report)).save(`${name}.pdf`)
  else throw new Error('Unsupported activity export format.')
}
