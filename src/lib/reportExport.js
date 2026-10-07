const number = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const filename = (model, date, ext) => `${model.reportId}_${date}.${ext}`
const valuesFor = (model, companyName, description) => [
  [companyName || 'Nhance'], [model.title], ['Currency: INR'], [description], [model.notes], [],
  model.columns.map(c => c.label), ...model.rows.map(row => model.columns.map(c => row[c.key] ?? '')),
  model.columns.map((c, i) => i === 0 ? 'TOTAL (all filtered rows)' : c.total ? model.totals[c.key] : ''),
]
// CSV text must not become spreadsheet formula cells, and quotes/newlines must round-trip.
export function csvCell(value) {
  const text = String(value ?? '')
  const safe = typeof value !== 'number' && /^[\s\uFEFF]*[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}
export function reportCSV(report) {
  return '\uFEFF' + valuesFor(report.model, report.companyName, report.filterDescription).map(row => row.map(csvCell).join(',')).join('\r\n')
}
export function downloadReportCSV(report) {
  const url = URL.createObjectURL(new Blob([reportCSV(report)], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename(report.model, report.reportDate, 'csv')
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function createReportWorkbook({ model, companyName, reportDate, filterDescription }) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const values = valuesFor(model, companyName, filterDescription)
  const sheet = XLSX.utils.aoa_to_sheet(values)
  sheet['!cols'] = model.columns.map(c => ({ wch: c.type === 'text' ? 25 : 20 }))
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 6, c: 0 }, e: { r: 6 + model.rows.length, c: model.columns.length - 1 } }) }
  for (let r = 7; r < values.length; r++) for (let c = 0; c < model.columns.length; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })]
    if (cell?.t === 'n') cell.z = '#,##0.00'
  }
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report')
  const summary = [['Company', companyName || 'Nhance'], ['Report', model.title], ['Generated', reportDate], ['Filters', filterDescription], ['Rows', model.rows.length], ...model.columns.filter(c => c.total).map(c => [c.label, model.totals[c.key]]), ['Basis', model.notes]]
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Summary')
  if (model.details?.length && model.reportId === 'fuel_report') {
    const cols = ['date', 'equipmentNumber', 'equipmentName', 'projectName', 'source', 'fuelSource', 'vendor', 'station', 'reference', 'quantity', 'rate', 'amount', 'status']
    const detail = XLSX.utils.aoa_to_sheet([cols, ...model.details.map(row => cols.map(key => row[key] ?? ''))])
    detail['!cols'] = cols.map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(workbook, detail, 'Fuel entries')
  }
  return workbook
}
export async function downloadReportExcel(report) {
  const [XLSX, workbook] = await Promise.all([import('xlsx'), createReportWorkbook(report)])
  XLSX.writeFile(workbook, filename(report.model, report.reportDate, 'xlsx'))
}
export async function createReportPDF({ model, companyName, filterDescription }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  // A3 keeps wide fuel and cost reports readable without dropping columns.
  const wide = model.columns.length > 12
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: wide ? 'a3' : 'a4' })
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'bold').setFontSize(15).text(model.title, 10, 12)
  doc.setFont('helvetica', 'normal').setFontSize(8)
  const description = doc.splitTextToSize(`${companyName || 'Nhance'} | Currency: INR\n${filterDescription}\n${model.notes}`, width - 20)
  doc.text(description, 10, 19)
  autoTable(doc, { startY: 21 + description.length * 3.5, margin: { left: 10, right: 10, bottom: 12 },
    head: [model.columns.map(c => c.label)], body: model.rows.map(row => model.columns.map(c => row[c.key] == null ? '—' : c.type === 'money' ? number(row[c.key]) : String(row[c.key]))),
    foot: [model.columns.map((c, i) => i === 0 ? 'TOTAL' : c.total ? number(model.totals[c.key]) : '')], showFoot: 'lastPage',
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' }, headStyles: { fillColor: [49, 46, 129] },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    columnStyles: Object.fromEntries(model.columns.map((c, i) => [i, c.type === 'text' ? {} : { halign: 'right' }])),
  })
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page).setFontSize(7).setTextColor(100).text(`Page ${page} of ${doc.getNumberOfPages()} | All filtered rows | INR`, width - 10, height - 5, { align: 'right' })
  }
  return doc
}
export async function downloadReportPDF(report) {
  const doc = await createReportPDF(report)
  doc.save(filename(report.model, report.reportDate, 'pdf'))
}
