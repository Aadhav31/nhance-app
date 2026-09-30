import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const safeFilename = value => String(value || 'Report').trim().replace(/[^a-z0-9_-]+/gi, '_')

export function downloadTablePDF({ title, subtitle, companyName, columns, rows, summary = [] }) {
  const landscape = columns.length > 6
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()

  pdf.setTextColor(88, 28, 48)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text(companyName || 'NHANCE', 12, 12)

  pdf.setTextColor(25, 29, 36)
  pdf.setFontSize(16)
  pdf.text(title, 12, 21)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(100, 107, 118)
  if (subtitle) pdf.text(subtitle, 12, 27)

  if (summary.length) {
    pdf.setTextColor(55, 61, 71)
    pdf.text(summary.join('   |   '), 12, 33)
  }

  autoTable(pdf, {
    startY: summary.length ? 38 : 32,
    head: [columns.map(column => column.label)],
    body: rows.map(row => columns.map(column => row[column.key] ?? '')),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: landscape ? 7 : 8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [88, 28, 48], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 246, 247] },
    columnStyles: Object.fromEntries(columns.map((column, index) => [index, {
      halign: column.align || 'left',
      ...(column.width ? { cellWidth: column.width } : {}),
    }])),
    margin: { left: 12, right: 12, bottom: 13 },
    didDrawPage: data => {
      pdf.setFontSize(7)
      pdf.setTextColor(125, 125, 125)
      pdf.text(`Generated ${new Date().toLocaleString('en-IN')}`, 12, pdf.internal.pageSize.getHeight() - 6)
      pdf.text(`Page ${data.pageNumber}`, pageWidth - 12, pdf.internal.pageSize.getHeight() - 6, { align: 'right' })
    },
  })

  pdf.save(`${safeFilename(title)}.pdf`)
}
