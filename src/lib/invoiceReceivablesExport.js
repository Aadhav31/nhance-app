import { invoiceReceivablesBasis, invoiceReceivablesTable } from './invoiceReceivables.js'

const viewLabels = { invoice: 'Invoice-wise', client: 'Client-wise', project: 'Project-wise' }
const currency = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const filename = (view, date, extension) => `invoice_receivables_${view}_${date}.${extension}`

export async function createInvoiceReceivablesWorkbook({ rows, companyName, reportDate, filterDescription, view, includeProforma = rows.some(row => row.isProforma) }) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  for (const tab of [view, ...['invoice', 'client', 'project'].filter(v => v !== view)]) {
    const { columns, rows: tableRows, totals } = invoiceReceivablesTable(rows, tab)
    const headerRow = 5
    const values = [
      [companyName || 'Nhance'], [`Invoice Receivables — ${viewLabels[tab]}`],
      [`Current balances as of ${reportDate} | Currency: INR`], [filterDescription], [],
      columns.map(c => c.label),
      ...tableRows.map(row => columns.map(c => row[c.key] ?? '')),
      columns.map((c, i) => i === 0 ? 'TOTAL' : c.numeric ? totals[c.key] : c.key === 'count' ? rows.length : ''),
    ]
    const sheet = XLSX.utils.aoa_to_sheet(values)
    sheet['!cols'] = columns.map(c => ({ wch: c.numeric ? 20 : c.count ? 14 : ['clientName', 'projectName'].includes(c.key) ? 32 : 18 }))
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + tableRows.length, c: columns.length - 1 } }) }
    for (let row = headerRow + 1; row < values.length; row++) {
      columns.forEach((c, col) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })]
        if (c.numeric && cell?.t === 'n') cell.z = '#,##0.00'
      })
    }
    XLSX.utils.book_append_sheet(workbook, sheet, viewLabels[tab])
  }
  const { totals } = invoiceReceivablesTable(rows)
  const summary = XLSX.utils.aoa_to_sheet([
    ['Company', companyName || 'Nhance'], ['Report date', reportDate], ['Filters', filterDescription],
    ['Invoice count', rows.length], ['Billed (INR)', totals.billed], ['Collected (INR)', totals.received],
    ['Outstanding (INR)', totals.balance], ['Overdue (INR)', totals.overdue],
    ['Basis', invoiceReceivablesBasis(includeProforma)],
    ['Scope', 'Client opening balances, unallocated advances and credit notes are separate from invoice balances.'],
  ])
  summary['!cols'] = [{ wch: 24 }, { wch: 90 }]
  for (const key of ['B5', 'B6', 'B7', 'B8']) summary[key].z = '#,##0.00'
  XLSX.utils.book_append_sheet(workbook, summary, 'Summary')
  return workbook
}

export async function downloadInvoiceReceivablesExcel(report) {
  const [XLSX, workbook] = await Promise.all([import('xlsx'), createInvoiceReceivablesWorkbook(report)])
  XLSX.writeFile(workbook, filename(report.view, report.reportDate, 'xlsx'))
}

export async function createInvoiceReceivablesPDF({ rows, companyName, reportDate, filterDescription, view, includeProforma = rows.some(row => row.isProforma) }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const { columns, rows: tableRows, totals } = invoiceReceivablesTable(rows, view)
  doc.setFont('helvetica', 'bold').setFontSize(15).text('Invoice Receivables', 10, 12)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  const description = doc.splitTextToSize(`${companyName || 'Nhance'} | ${viewLabels[view]} | Current balances as of ${reportDate}\n${filterDescription}`, 276)
  doc.text(description, 10, 18)
  const summaryY = 20 + description.length * 4
  doc.setFontSize(9).text(`INR | Billed: ${currency(totals.billed)} | Collected: ${currency(totals.received)} | Outstanding: ${currency(totals.balance)} | Overdue: ${currency(totals.overdue)}`, 10, summaryY)
  autoTable(doc, {
    startY: summaryY + 5, margin: { left: 10, right: 10, bottom: 19 },
    head: [columns.map(c => c.label)],
    body: tableRows.map(row => columns.map(c => c.numeric ? currency(row[c.key]) : String(row[c.key] ?? ''))),
    foot: [columns.map((c, i) => i === 0 ? 'TOTAL' : c.numeric ? currency(totals[c.key]) : c.key === 'count' ? String(rows.length) : '')],
    showFoot: 'lastPage', styles: { fontSize: view === 'invoice' ? 7 : 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [49, 46, 129] }, footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, c.numeric || c.count ? { halign: 'right' } : {}])),
  })
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page).setFontSize(7).setTextColor(100)
    doc.text(invoiceReceivablesBasis(includeProforma), 10, 195)
    doc.text('Opening balances, unallocated advances and credit notes are separate from invoice balances.', 10, 199)
    doc.text(`Page ${page} of ${pageCount} | INR`, 287, 204, { align: 'right' })
  }
  return doc
}

export async function downloadInvoiceReceivablesPDF(report) {
  const doc = await createInvoiceReceivablesPDF(report)
  doc.save(filename(report.view, report.reportDate, 'pdf'))
}

export async function downloadInvoiceReceivablesCSV(report) {
  const { downloadReportCSV } = await import('./reportExport.js')
  const table = invoiceReceivablesTable(report.rows, report.view)
  downloadReportCSV({ ...report, model: { ...table, reportId: `invoice_receivables_${report.view}`, title: 'Outstanding Receivables', notes: invoiceReceivablesBasis(report.includeProforma), columns: table.columns.map(c => ({ ...c, type: c.numeric ? 'money' : c.count ? 'number' : 'text', total: !!c.numeric || c.key === 'count' })), totals: { ...table.totals, count: report.rows.length } } })
}
