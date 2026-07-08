/**
 * invoicePDF.js
 * Generates a GST-compliant A4 Tax Invoice PDF using jsPDF + jspdf-autotable.
 *
 * Layout (portrait A4, 10 mm margins):
 *   ┌─────────────────────────────────────────┐
 *   │           TAX INVOICE  (title bar)      │
 *   ├─────────────────────────┬───────────────┤
 *   │  Company Info (55%)     │ Invoice Detail │
 *   ├─────────────────────────┴───────────────┤
 *   │  BILLED TO  (client details)            │
 *   ├─────────────────────────────────────────┤
 *   │  LINE ITEMS TABLE                       │
 *   ├─────────────────────────────────────────┤
 *   │  Taxable / GST / Total (right-aligned)  │
 *   │  Amount in Words                        │
 *   ├─────────────────────────────────────────┤
 *   │  GST BREAKUP TABLE                      │
 *   │  Tax Amount in Words                    │
 *   ├─────────────────────────────────────────┤
 *   │  Declaration                            │
 *   │  Signature block                        │
 *   └─────────────────────────────────────────┘
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Number-to-words (Indian numbering system) ──────────────────────────────
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n) {
  if (n <= 0) return ''
  if (n < 20) return ONES[n]
  return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim()
}

function threeDigits(n) {
  if (n <= 0) return ''
  if (n < 100) return twoDigits(n)
  const h = Math.floor(n / 100)
  const rem = n % 100
  return ONES[h] + ' Hundred' + (rem ? ' ' + twoDigits(rem) : '')
}

export function numToWords(amount) {
  if (!amount || isNaN(amount)) return 'Zero Rupees Only'
  const neg = amount < 0
  amount = Math.abs(amount)
  const rupees = Math.floor(amount)
  const paise  = Math.round((amount - rupees) * 100)

  let rem = rupees
  const parts = []
  if (rem >= 10000000) { parts.push(threeDigits(Math.floor(rem / 10000000)) + ' Crore'); rem %= 10000000 }
  if (rem >= 100000)   { parts.push(twoDigits(Math.floor(rem / 100000)) + ' Lakh');     rem %= 100000   }
  if (rem >= 1000)     { parts.push(twoDigits(Math.floor(rem / 1000)) + ' Thousand');   rem %= 1000     }
  if (rem > 0)         { parts.push(threeDigits(rem)) }

  let result = (neg ? 'Minus ' : '') + 'Rupees ' + (parts.length ? parts.join(' ') : 'Zero')
  if (paise > 0) result += ' and ' + twoDigits(paise) + ' Paise'
  return result + ' Only'
}

// ── Format helpers ─────────────────────────────────────────────────────────
const fmtINR = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = d => {
  if (!d) return '—'
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
}

// ── Color palette (RGB arrays) ─────────────────────────────────────────────
const C = {
  dark:   [15, 23, 42],
  grey:   [100, 116, 139],
  ltGrey: [226, 232, 240],
  bgGrey: [248, 250, 252],
  white:  [255, 255, 255],
  black:  [0, 0, 0],
  header: [30, 41, 59],    // dark navy for title bar
  accent: [37, 99, 235],   // blue for section labels
}

// ── Main export ─────────────────────────────────────────────────────────────
export function generateInvoicePDF(invoice, lineItems, company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Page dimensions
  const PW = 210     // page width
  const PH = 297     // page height
  const M  = 10      // margin
  const CW = PW - 2 * M  // content width = 190

  const isIGST = Number(invoice.igst_rate || 0) > 0 && !(Number(invoice.cgst_rate || 0) > 0)

  // ── TITLE BAR ─────────────────────────────────────────────────────────────
  doc.setFillColor(...C.header)
  doc.rect(M, M, CW, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...C.white)
  doc.text('TAX INVOICE', PW / 2, M + 7, { align: 'center' })

  // ── COMPANY INFO (left 55%) + INVOICE DETAILS (right 45%) ─────────────────
  let y = M + 11
  const leftW  = Math.floor(CW * 0.55)  // 104
  const rightW = CW - leftW - 1         //  85
  const rightX = M + leftW + 1

  const rowH = 37

  // Border boxes
  doc.setDrawColor(...C.ltGrey)
  doc.setLineWidth(0.25)
  doc.rect(M, y, leftW, rowH)
  doc.rect(rightX, y, rightW, rowH)

  // Company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  const coName = company?.name || 'Your Company'
  doc.text(coName, M + 3, y + 7, { maxWidth: leftW - 6 })

  // Company sub-details
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.grey)
  let ly = y + 13
  const coLines = [
    company?.address || '',
    company?.gstin ? `GSTIN: ${company.gstin}` : '',
    company?.phone ? `Tel: ${company.phone}` : '',
    company?.email || '',
    company?.state ? `State: ${company.state}` : '',
  ].filter(Boolean)

  coLines.forEach(line => {
    if (ly > y + rowH - 3) return
    const wrapped = doc.splitTextToSize(line, leftW - 6)
    wrapped.slice(0, 1).forEach(wl => { doc.text(wl, M + 3, ly); ly += 4 })
  })

  // Invoice details (right column)
  const detRows = [
    ['Invoice No.',       invoice.invoice_number || '—'],
    ['Invoice Date',      fmtDate(invoice.invoice_date)],
    ['Due Date',          fmtDate(invoice.due_date)],
    ['Work Order No.',    invoice.work_order_number || '—'],
    ['Work Order Date',   fmtDate(invoice.work_order_date)],
    ['Nature of Supply',  invoice.nature_of_supply || '—'],
  ]

  doc.setFontSize(7.5)
  let ry = y + 5
  detRows.forEach(([label, value]) => {
    if (ry > y + rowH - 2) return
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(label + ':', rightX + 3, ry)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.grey)
    const labelW = doc.getTextWidth(label + ':  ')
    const valStr = String(value)
    const valLines = doc.splitTextToSize(valStr, rightW - labelW - 6)
    doc.text(valLines[0] || '', rightX + 3 + labelW, ry)
    ry += 5.5
  })

  y += rowH + 2

  // ── WORK DONE PERIOD row (spans full width) ───────────────────────────────
  if (invoice.work_done_from || invoice.work_done_to) {
    doc.setDrawColor(...C.ltGrey)
    doc.setLineWidth(0.25)
    doc.rect(M, y, CW, 7)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.dark)
    doc.text('Work Done Period:', M + 3, y + 4.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.grey)
    const periodStr = `${fmtDate(invoice.work_done_from)}  to  ${fmtDate(invoice.work_done_to)}`
    doc.text(periodStr, M + 38, y + 4.5)
    y += 8
  }

  // ── BILLED TO / CLIENT DETAILS ────────────────────────────────────────────
  doc.setFillColor(...C.bgGrey)
  doc.rect(M, y, CW, 6, 'F')
  doc.setDrawColor(...C.ltGrey)
  doc.rect(M, y, CW, 6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.accent)
  doc.text('BILLED TO', M + 3, y + 4)

  y += 7
  const clientRowH = 24
  doc.setDrawColor(...C.ltGrey)
  doc.rect(M, y, CW, clientRowH)

  // Divider between client and place of supply
  const divX = M + Math.floor(CW * 0.6)
  doc.line(divX, y, divX, y + clientRowH)

  // Client info (left 60%)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.text(invoice.client_name || '', M + 3, y + 7, { maxWidth: divX - M - 6 })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.grey)
  let cy = y + 12
  if (invoice.client_address) {
    const addrLines = doc.splitTextToSize(invoice.client_address, divX - M - 6)
    addrLines.slice(0, 2).forEach(l => { doc.text(l, M + 3, cy); cy += 4 })
  }
  if (invoice.client_gstin) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text('GSTIN: ', M + 3, cy)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.grey)
    doc.text(invoice.client_gstin, M + 3 + doc.getTextWidth('GSTIN: '), cy)
  }

  // Place of supply (right 40%)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.dark)
  doc.text('Place of Supply', divX + 3, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.grey)
  if (invoice.place_of_supply) {
    doc.text(invoice.place_of_supply, divX + 3, y + 12)
  }
  if (invoice.place_of_supply_address) {
    const posLines = doc.splitTextToSize(invoice.place_of_supply_address, M + CW - divX - 6)
    posLines.slice(0, 2).forEach((l, i) => doc.text(l, divX + 3, y + 16 + i * 4))
  }

  y += clientRowH + 3

  // ── PART 2: LINE ITEMS TABLE ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.accent)
  doc.text('PART I — DETAILS OF SUPPLY', M, y)
  y += 3

  // Calculate totals
  const subtotal  = lineItems.reduce((s, l) => s + Number(l.amount || 0), 0)
  const discount  = Number(invoice.discount_amount || 0)
  const taxable   = subtotal - discount
  const cgstAmt   = Number(invoice.cgst_amount || 0)
  const sgstAmt   = Number(invoice.sgst_amount || 0)
  const igstAmt   = Number(invoice.igst_amount || 0)
  const totalGST  = cgstAmt + sgstAmt + igstAmt
  const totalAmt  = Number(invoice.total_amount || 0)

  // Build invoice-level GST rate string (for lines that don't have per-line rate)
  const invGSTRate = isIGST
    ? Number(invoice.igst_rate || 0)
    : (Number(invoice.cgst_rate || 0) + Number(invoice.sgst_rate || 0))

  const lineBody = lineItems.map((l, i) => {
    const lineRate = l.gst_rate != null ? Number(l.gst_rate) : invGSTRate
    return [
      i + 1,
      l.item_code || '',
      l.description || '',
      l.sac_hsn_code || '',
      lineRate > 0 ? `${lineRate}%` : '—',
      l.unit || '',
      Number(l.quantity || 0),
      fmtINR(l.rate),
      fmtINR(l.amount),
    ]
  })

  // Subtotal row
  lineBody.push(['', '', 'Sub Total', '', '', '', '', '', fmtINR(subtotal)])

  // Discount row (if any)
  if (discount > 0) {
    lineBody.push(['', '', 'Less: Discount', '', '', '', '', '', `(${fmtINR(discount)})`])
    lineBody.push(['', '', 'Taxable Amount', '', '', '', '', '', fmtINR(taxable)])
  }

  // Tax rows
  if (isIGST) {
    lineBody.push(['', '', `IGST @ ${invoice.igst_rate}%`, '', '', '', '', '', fmtINR(igstAmt)])
  } else {
    lineBody.push(['', '', `CGST @ ${invoice.cgst_rate}%`, '', '', '', '', '', fmtINR(cgstAmt)])
    lineBody.push(['', '', `SGST @ ${invoice.sgst_rate}%`, '', '', '', '', '', fmtINR(sgstAmt)])
  }

  // Grand total row
  lineBody.push(['', '', 'GRAND TOTAL', '', '', '', '', '', fmtINR(totalAmt)])

  const specialRows = new Set(
    Array.from({ length: lineBody.length - lineItems.length }, (_, i) => lineItems.length + i)
  )

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    tableWidth: CW,
    head: [[
      { content: 'S.\nNo', styles: { halign: 'center' } },
      { content: 'Item\nCode', styles: { halign: 'center' } },
      { content: 'Description of Service', styles: { halign: 'left' } },
      { content: 'SAC /\nHSN', styles: { halign: 'center' } },
      { content: 'GST\n%', styles: { halign: 'center' } },
      { content: 'UOM', styles: { halign: 'center' } },
      { content: 'Qty', styles: { halign: 'right' } },
      { content: 'Rate\n(₹)', styles: { halign: 'right' } },
      { content: 'Amount\n(₹)', styles: { halign: 'right' } },
    ]],
    body: lineBody,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      overflow: 'linebreak',
      textColor: C.black,
      lineColor: C.ltGrey,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [226, 232, 240],
      textColor: C.dark,
      fontStyle: 'bold',
      fontSize: 7,
      valign: 'middle',
    },
    bodyStyles: { fillColor: C.white },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'center', cellWidth: 16 },
      2: { halign: 'left',   cellWidth: 'auto' },  // flexible — takes remaining space
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 12 },
      5: { halign: 'center', cellWidth: 13 },
      6: { halign: 'right',  cellWidth: 12 },
      7: { halign: 'right',  cellWidth: 22 },
      8: { halign: 'right',  cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const ri = data.row.index
      if (!specialRows.has(ri)) return

      // Grey background for summary rows
      data.cell.styles.fillColor = [241, 245, 249]
      data.cell.styles.fontStyle = 'bold'

      // Grand total row gets a darker background
      if (ri === lineBody.length - 1) {
        data.cell.styles.fillColor = [226, 232, 240]
        data.cell.styles.textColor = C.dark
        data.cell.styles.fontSize  = 8
      }
    },
  })

  y = doc.lastAutoTable.finalY + 2

  // ── AMOUNT IN WORDS ────────────────────────────────────────────────────────
  const wordsH = 10
  doc.setDrawColor(...C.ltGrey)
  doc.setFillColor(...C.bgGrey)
  doc.rect(M, y, CW, wordsH, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.dark)
  doc.text('Invoice Amount in Words:', M + 3, y + 4)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...C.grey)
  const words = numToWords(totalAmt)
  const wordLines = doc.splitTextToSize(words, CW - 60)
  doc.text(wordLines[0], M + 3, y + 8)

  y += wordsH + 3

  // ── PART 3: GST BREAKUP TABLE ─────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.accent)
  doc.text('PART II — GST TAX SUMMARY', M, y)
  y += 3

  // Group line items by SAC/HSN for GST breakup
  const gstMap = {}
  lineItems.forEach(l => {
    const key = l.sac_hsn_code || '—'
    const lRate = l.gst_rate != null ? Number(l.gst_rate) : invGSTRate
    if (!gstMap[key]) gstMap[key] = { sac: key, taxableAmt: 0, gstRate: lRate }
    gstMap[key].taxableAmt += Number(l.amount || 0)
  })

  const gstGroups = Object.values(gstMap)
  let totIGSTA = 0, totCGSTA = 0, totSGSTA = 0, totTaxA = 0

  const gstBody = gstGroups.map((g, i) => {
    const taxableG = g.taxableAmt - (discount * g.taxableAmt / (subtotal || 1))
    const igstR = isIGST ? g.gstRate : 0
    const cgstR = isIGST ? 0 : g.gstRate / 2
    const sgstR = isIGST ? 0 : g.gstRate / 2
    const igstA = Number((taxableG * igstR / 100).toFixed(2))
    const cgstA = Number((taxableG * cgstR / 100).toFixed(2))
    const sgstA = Number((taxableG * sgstR / 100).toFixed(2))
    const total = igstA + cgstA + sgstA

    totIGSTA += igstA
    totCGSTA += cgstA
    totSGSTA += sgstA
    totTaxA  += total

    return [
      i + 1,
      g.sac,
      igstR > 0 ? `${igstR}%` : '—',
      igstA > 0 ? fmtINR(igstA) : '—',
      cgstR > 0 ? `${cgstR}%` : '—',
      cgstA > 0 ? fmtINR(cgstA) : '—',
      sgstR > 0 ? `${sgstR}%` : '—',
      sgstA > 0 ? fmtINR(sgstA) : '—',
      fmtINR(total),
    ]
  })

  // Totals row for GST table
  gstBody.push([
    '', 'TOTAL',
    '',
    totIGSTA > 0 ? fmtINR(totIGSTA) : '—',
    '',
    totCGSTA > 0 ? fmtINR(totCGSTA) : '—',
    '',
    totSGSTA > 0 ? fmtINR(totSGSTA) : '—',
    fmtINR(totTaxA),
  ])

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    tableWidth: CW,
    head: [[
      { content: 'S.\nNo',          styles: { halign: 'center' } },
      { content: 'SAC /\nHSN Code', styles: { halign: 'center' } },
      { content: 'IGST\nRate',      styles: { halign: 'center' } },
      { content: 'IGST\nAmt (₹)',   styles: { halign: 'right'  } },
      { content: 'CGST\nRate',      styles: { halign: 'center' } },
      { content: 'CGST\nAmt (₹)',   styles: { halign: 'right'  } },
      { content: 'SGST/UTGST\nRate',styles: { halign: 'center' } },
      { content: 'SGST/UTGST\nAmt (₹)', styles: { halign: 'right' } },
      { content: 'Total Tax\nAmt (₹)', styles: { halign: 'right' } },
    ]],
    body: gstBody,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      overflow: 'linebreak',
      textColor: C.black,
      lineColor: C.ltGrey,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [226, 232, 240],
      textColor: C.dark,
      fontStyle: 'bold',
      fontSize: 7,
      valign: 'middle',
    },
    bodyStyles: { fillColor: C.white },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9  },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'right',  cellWidth: 22 },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'right',  cellWidth: 22 },
      6: { halign: 'center', cellWidth: 20 },
      7: { halign: 'right',  cellWidth: 22 },
      8: { halign: 'right',  cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      if (data.row.index === gstBody.length - 1) {
        data.cell.styles.fillColor  = [226, 232, 240]
        data.cell.styles.fontStyle  = 'bold'
        data.cell.styles.textColor  = C.dark
      }
    },
  })

  y = doc.lastAutoTable.finalY + 2

  // ── TAX AMOUNT IN WORDS ────────────────────────────────────────────────────
  doc.setDrawColor(...C.ltGrey)
  doc.setFillColor(...C.bgGrey)
  doc.rect(M, y, CW, 10, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.dark)
  doc.text('Total Tax Amount in Words:', M + 3, y + 4)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...C.grey)
  doc.text(numToWords(totalGST), M + 3, y + 8)
  y += 13

  // Check if enough space for declaration + signature (need ~38mm)
  if (y + 38 > PH - M) {
    doc.addPage()
    y = M
  }

  // ── DECLARATION ────────────────────────────────────────────────────────────
  doc.setDrawColor(...C.ltGrey)
  doc.setLineWidth(0.25)
  doc.rect(M, y, CW, 18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.dark)
  doc.text('Declaration:', M + 3, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.grey)
  const decl = 'We declare that this invoice shows the actual price of the services described and all particulars are true and correct.'
  const declLines = doc.splitTextToSize(decl, CW - 6)
  declLines.forEach((l, i) => doc.text(l, M + 3, y + 10 + i * 4.5))
  y += 20

  // ── SIGNATURE BLOCK ────────────────────────────────────────────────────────
  const sigW = 75
  const sigX = M + CW - sigW
  doc.setDrawColor(...C.ltGrey)
  doc.rect(sigX, y, sigW, 24)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.dark)
  const sigName = `For ${company?.name || ''}`
  const sigNameLines = doc.splitTextToSize(sigName, sigW - 6)
  sigNameLines.forEach((l, i) => doc.text(l, sigX + 3, y + 5 + i * 4.5))
  doc.setDrawColor(...C.ltGrey)
  doc.line(sigX + 5, y + 20, sigX + sigW - 5, y + 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.grey)
  doc.text('Authorised Signatory', sigX + 3, y + 23)

  // ── OUTER PAGE BORDER ──────────────────────────────────────────────────────
  doc.setDrawColor(...C.ltGrey)
  doc.setLineWidth(0.5)
  doc.rect(M, M, CW, PH - 2 * M)

  // ── FOOTER (every page) ────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(180, 180, 180)
    doc.text('This is a computer generated invoice.', PW / 2, PH - 5, { align: 'center' })
    doc.text(`Page ${p} of ${pageCount}`, PW - M, PH - 5, { align: 'right' })
  }

  doc.save(`Invoice_${invoice.invoice_number || 'Draft'}.pdf`)
}
