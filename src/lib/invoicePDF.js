/**
 * invoicePDF.js — GST Tax Invoice (Government format)
 *
 * Layout matches standard Indian GST Tax Invoice (Book 11.xlsx reference):
 *
 *  ┌─────────────────────────────────────────┬────────────────┐
 *  │  (Original for Recipient)               │  Tax Invoice   │
 *  │  E-Invoice QR Code            IRN / Ack │                │
 *  ├──────────────┬────────────────┬──────────┤                │
 *  │              │ Invoice No.    │ Inv Date │                │
 *  │ Vendor Name  ├────────────────┼──────────┤                │
 *  │ & Address    │ Order No.      │ Ord Date │                │
 *  │              ├────────────────────────────┤                │
 *  │              │ Work done Period From / To │                │
 *  │ + Vendor GST ├────────────────────────────┤                │
 *  ├──────────────│ Nature of Service           │                │
 *  │ Buyer (Bill  ├────────────────────────────┤                │
 *  │ to) + Addr   │ Place of Supply w/ Address │                │
 *  │ Buyer GST    │                            │                │
 *  ├──────────────┴────────────────────────────┤                │
 *  │  Sl No. | Item code | Desc | SAC | GST% | UOM | Qty | Rate | Amt
 *  ├──────────────────────────────────────────────────────────────┤
 *  │  Amount chargeable (In Words)                                │
 *  ├──────────────────────────────────────────────────────────────┤
 *  │  Tax Summary Break-up (2-row header with Rate/Amt sub-cols)  │
 *  ├──────────────────────────────────────────────────────────────┤
 *  │  Tax Amount (in Words) | Reverse Charge | Declaration        │
 *  ├─────────────────────────────┬────────────────────────────────┤
 *  │   Company Seal              │ For Authorized Signatory       │
 *  └─────────────────────────────┴────────────────────────────────┘
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'

// ── QR verification payload ──────────────────────────────────────────────────
function buildQRPayload(invoice, company) {
  const lines = [
    `NHANCE VERIFIED DOCUMENT`,
    `Type    : ${invoice.invoice_type === 'proforma' ? 'Proforma Invoice' : 'Tax Invoice'}`,
    `No      : ${invoice.invoice_number || '—'}`,
    `Date    : ${invoice.invoice_date || '—'}`,
    `From    : ${company?.name || '—'}`,
    `GSTIN   : ${company?.gstin || '—'}`,
    `To      : ${invoice.client_name || '—'}`,
    `Amount  : INR ${Number(invoice.total_amount || 0).toFixed(2)}`,
  ]
  return lines.join('\n')
}

async function makeQRDataURL(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

// ── Number-to-words (Indian system) ──────────────────────────────────────────
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
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '')
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
const fmtINR = n =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// For line item qty / rate / amount — up to 3 dp, trims trailing zeros
const fmtQty = n =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

// Parse date safely without timezone shift (handles "YYYY-MM-DD" ISO strings correctly)
function parseLocalDate(d) {
  if (!d) return null
  const s = String(d)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return { y: Number(m[1]), mo: Number(m[2]), da: Number(m[3]) }
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return { y: dt.getFullYear(), mo: dt.getMonth() + 1, da: dt.getDate() }
}
const fmtDate = d => {
  const p = parseLocalDate(d)
  if (!p) return ''
  return `${String(p.da).padStart(2, '0')}/${String(p.mo).padStart(2, '0')}/${p.y}`
}

// ── Drawing primitives ─────────────────────────────────────────────────────
function border(doc) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
}
function hln(doc, x, y, w) {
  border(doc)
  doc.line(x, y, x + w, y)
}
function vln(doc, x, y, h) {
  border(doc)
  doc.line(x, y, x, y + h)
}
function bx(doc, x, y, w, h) {
  border(doc)
  doc.rect(x, y, w, h)
}

// Write label + value inside a pre-drawn cell area
function cellText(doc, { x, y, w, label = '', value = '', labelSz = 6.5, valSz = 7.5, valBold = false, padX = 2, padY = 3.5, lineH = 3.6, maxLines = 99 }) {
  let ty = y + padY
  if (label) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(labelSz)
    doc.setTextColor(0)
    doc.text(label, x + padX, ty)
    ty += lineH + 0.4
  }
  if (value !== '' && value != null) {
    doc.setFont('helvetica', valBold ? 'bold' : 'normal')
    doc.setFontSize(valSz)
    doc.setTextColor(0)
    const lines = doc.splitTextToSize(String(value), w - padX * 2)
    lines.slice(0, maxLines).forEach((l, i) => doc.text(l, x + padX, ty + i * lineH))
  }
}

// ── Main export ─────────────────────────────────────────────────────────────
export async function generateInvoicePDF(invoice, lineItems, company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const L  = 10      // left margin
  const T  = 8       // top margin
  const PW = 210     // page width
  const W  = 190     // content width (PW - 2*L)

  const isIGST = Number(invoice.igst_rate || 0) > 0 && !(Number(invoice.cgst_rate || 0) > 0)

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const subtotal  = lineItems.reduce((s, l) => s + Number(l.amount || 0), 0)
  const discount  = Number(invoice.discount_amount || 0)
  const taxable   = subtotal - discount
  const cgstAmt   = Number(invoice.cgst_amount || 0)
  const sgstAmt   = Number(invoice.sgst_amount || 0)
  const igstAmt   = Number(invoice.igst_amount || 0)
  const totalGST  = cgstAmt + sgstAmt + igstAmt
  const totalAmt  = Number(invoice.total_amount || 0)
  const invGSTRate = isIGST
    ? Number(invoice.igst_rate || 0)
    : (Number(invoice.cgst_rate || 0) + Number(invoice.sgst_rate || 0))

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 1 — TITLE + E-INVOICE HEADER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // "(Original for Recipient)" — top right
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(0)
  doc.text('(Original for Recipient)', L + W, T, { align: 'right' })

  const titleY = T + 2
  const titleH = 28
  const qrW    = 48         // QR code column
  const irnW   = W - qrW   // IRN / Ack column

  bx(doc, L, titleY, W, titleH)                   // outer border
  vln(doc, L + irnW, titleY, titleH)               // vertical divider

  // Title — "Proforma Invoice" or "Tax Invoice"
  const docTitle = invoice.invoice_type === 'proforma' ? 'Proforma Invoice' : 'Tax Invoice'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(docTitle, L + W / 2, titleY + 7, { align: 'center' })

  // IRN / Ack fields (left area)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('IRN         :', L + 2, titleY + 14)
  doc.text('Ack No.     :', L + 2, titleY + 19)
  doc.text('Ack. Date   :', L + 2, titleY + 24)

  // ── QR code (right area) — generated from invoice verification payload ──
  try {
    const qrPayload = buildQRPayload(invoice, company)
    const qrDataUrl = await makeQRDataURL(qrPayload)
    // Center a 24×24 mm QR square in the 48×28 mm box
    const qrSize  = 24
    const qrX     = L + irnW + (qrW - qrSize) / 2
    const qrY     = titleY   + (titleH - qrSize) / 2
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)
  } catch {
    // Fallback: label if QR generation fails
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text('QR Code', L + irnW + qrW / 2, titleY + 14, { align: 'center' })
  }

  let y = titleY + titleH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 2 — VENDOR + BUYER + INVOICE DETAILS
  // Column layout (matches Excel cols B-O / 14 cols):
  //   cA = left  (cols B-F,  5 cols) = vendor & buyer
  //   cB = middle (cols G-K, 5 cols) = invoice no, order, work period, nature, place of supply
  //   cC = right  (cols L-O, 4 cols) = invoice date, order date
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const cA = 76, cB = 66, cC = W - cA - cB   // 76 + 66 + 48 = 190
  const xA = L, xB = L + cA, xC = L + cA + cB

  // Row heights for MIDDLE+RIGHT columns (each row has its own border there)
  const rInvH = 10    // Invoice No. / Invoice Date
  const rOrdH = 9     // Order No. / Order Date
  const rWrkH = 9     // Work Done Period (merged middle+right)
  const rNatH = 9     // Nature of Service (merged middle+right)

  // LEFT column: vendor block = all 4 rows merged into ONE cell (no internal hlines)
  const vendorH = rInvH + rOrdH + rWrkH + rNatH   // = 37mm

  const rBuyH   = 26  // Buyer name + address (left) / Place of Supply (right, merged)
  const rGSTH   = 8   // Buyer GST (left) / empty (right, continues merged)

  // ── LEFT COLUMN — VENDOR block (one big unified rect) ──────────────────
  bx(doc, xA, y, cA, vendorH)

  // Vendor label
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0)
  doc.text('Vendor Name and Address (Bill from)', xA + 2, y + 4)

  // Vendor company name — 8pt to keep it proportional
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  const coName = company?.name || ''
  const coNameLines = doc.splitTextToSize(coName, cA - 4)
  coNameLines.slice(0, 2).forEach((l, i) => doc.text(l, xA + 2, y + 9 + i * 3.8))

  // Vendor address — up to 3 lines
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  const coAddr = company?.address || ''
  const coAddrLines = doc.splitTextToSize(coAddr, cA - 4)
  const shownCoLines = coAddrLines.slice(0, 3)
  const nameLineCount = Math.min(coNameLines.length, 2)
  const addrStartY = y + 9 + nameLineCount * 3.8 + 1.5
  shownCoLines.forEach((l, i) => doc.text(l, xA + 2, addrStartY + i * 3.5))

  // Vendor GST — positioned right after address (not pinned to bottom)
  const gstLabelY = Math.min(addrStartY + shownCoLines.length * 3.5 + 2.5, y + vendorH - 7)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
  doc.text('Vendor GST Number:', xA + 2, gstLabelY)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(company?.gstin || '', xA + 2, gstLabelY + 4)

  // ── LEFT COLUMN — BUYER block + BUYER GST (one combined rect, no internal divider) ──
  const buyerBlockH = rBuyH + rGSTH   // combined height, no line between them
  bx(doc, xA, y + vendorH, cA, buyerBlockH)

  // "Buyer (Bill to)" label
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0)
  doc.text('Buyer (Bill to)', xA + 2, y + vendorH + 4)

  // Buyer name — 8pt (matched to vendor name size)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  const clientNameLines = doc.splitTextToSize(invoice.client_name || '', cA - 4)
  clientNameLines.slice(0, 2).forEach((l, i) => doc.text(l, xA + 2, y + vendorH + 9 + i * 3.8))

  // Buyer address — up to 4 lines
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  const buyerAddrLines = doc.splitTextToSize(invoice.client_address || '', cA - 4)
  const clientNameCount = Math.min(clientNameLines.length, 2)
  const buyerAddrStartY = y + vendorH + 9 + clientNameCount * 3.8 + 1.5
  buyerAddrLines.slice(0, 4).forEach((l, i) => doc.text(l, xA + 2, buyerAddrStartY + i * 3.5))

  // Buyer GST — near bottom of combined block (no rect, no top line)
  const buyerGSTLabelY = y + vendorH + buyerBlockH - 7.5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0)
  doc.text('Buyer GST Number :', xA + 2, buyerGSTLabelY)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(invoice.client_gstin || '', xA + 2, buyerGSTLabelY + 4)

  // ── MIDDLE + RIGHT — Row 1: Invoice No. / Invoice Date ─────────────────
  const y1 = y
  bx(doc, xB, y1, cB, rInvH)
  cellText(doc, { x: xB, y: y1, w: cB, label: 'Invoice No. :', value: invoice.invoice_number || '', valSz: 8, valBold: true })

  bx(doc, xC, y1, cC, rInvH)
  cellText(doc, { x: xC, y: y1, w: cC, label: 'Invoice Date :', value: fmtDate(invoice.invoice_date), valSz: 8 })

  // ── MIDDLE + RIGHT — Row 2: Order No. / Order Date ─────────────────────
  const y2 = y + rInvH
  bx(doc, xB, y2, cB, rOrdH)
  cellText(doc, { x: xB, y: y2, w: cB, label: "Buyer's Order Number :", value: invoice.work_order_number || '' })

  bx(doc, xC, y2, cC, rOrdH)
  cellText(doc, { x: xC, y: y2, w: cC, label: 'Order Date :', value: fmtDate(invoice.work_order_date) })

  // ── MIDDLE + RIGHT — Row 3: Work Done Period (merged) ──────────────────
  const y3 = y + rInvH + rOrdH
  bx(doc, xB, y3, cB + cC, rWrkH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0)
  doc.text('Work done Period', xB + 2, y3 + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  const fromStr = invoice.work_done_from ? fmtDate(invoice.work_done_from) : ''
  const toStr   = invoice.work_done_to   ? fmtDate(invoice.work_done_to)   : ''
  doc.text(`From : ${fromStr}`, xB + 2, y3 + 8)
  doc.text(`To : ${toStr}`, xB + 60, y3 + 8)

  // ── MIDDLE + RIGHT — Row 3b: Nature of Service (merged) ────────────────
  const y3b = y + rInvH + rOrdH + rWrkH
  bx(doc, xB, y3b, cB + cC, rNatH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0)
  doc.text('Nature of Service:', xB + 2, y3b + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  const natLines = doc.splitTextToSize(invoice.nature_of_supply || '', cB + cC - 4)
  natLines.slice(0, 1).forEach((l, i) => doc.text(l, xB + 2, y3b + 8 + i * 3.5))

  // ── MIDDLE + RIGHT — Rows 4+5: Place of Supply (merged, spans rBuyH+rGSTH) ──
  const y4 = y + vendorH
  bx(doc, xB, y4, cB + cC, rBuyH + rGSTH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0)
  doc.text('Place of Supply with Address:', xB + 2, y4 + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  const posText = [invoice.place_of_supply, invoice.place_of_supply_address].filter(Boolean).join(', ')
  const posLines = doc.splitTextToSize(posText, cB + cC - 4)
  posLines.slice(0, 5).forEach((l, i) => doc.text(l, xB + 2, y4 + 8 + i * 3.5))

  // Advance y past entire header block
  y += vendorH + rBuyH + rGSTH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 3 — LINE ITEMS TABLE
  // Columns: Sl No. | Item code | Description | SAC | GST Rate | UOM | Qty | Basic Rate | Amount
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const lineBody = lineItems.map((l, i) => {
    const gstR = l.gst_rate != null ? Number(l.gst_rate) : invGSTRate
    return [
      i + 1,
      l.item_code || '',
      l.description || '',
      l.sac_hsn_code || '',
      gstR > 0 ? `${gstR}%` : '0%',
      l.unit || '',
      fmtQty(l.quantity),
      fmtQty(l.rate),
      fmtQty(l.amount),
    ]
  })

  // Footer rows: subtotal, tax lines, grand total
  const footerRows = []
  footerRows.push(['', '', 'Subtotal', '', '', '', '', '', fmtINR(subtotal)])
  if (discount > 0) {
    footerRows.push(['', '', 'Less: Discount', '', '', '', '', '', `(${fmtINR(discount)})`])
  }
  if (isIGST) {
    footerRows.push(['', '', 'IGST', '', `${invoice.igst_rate}%`, '', '', '', fmtINR(igstAmt)])
  } else {
    footerRows.push(['', '', 'IGST', '', '0%', '', '', '', fmtINR(0)])
    footerRows.push(['', '', 'CGST', '', `${invoice.cgst_rate}%`, '', '', '', fmtINR(cgstAmt)])
    footerRows.push(['', '', 'SGST/UTGST', '', `${invoice.sgst_rate}%`, '', '', '', fmtINR(sgstAmt)])
  }
  footerRows.push(['', '', 'TOTAL', '', '', '', '', '', fmtINR(totalAmt)])

  const allBody   = [...lineBody, ...footerRows]
  const footerStart = lineBody.length

  autoTable(doc, {
    startY: y,
    margin: { left: L, right: L },
    tableWidth: W,
    head: [[
      { content: 'Sl\nNo.',      styles: { halign: 'center', valign: 'middle' } },
      { content: 'Item\nCode',   styles: { halign: 'center', valign: 'middle' } },
      { content: 'Description',  styles: { halign: 'center', valign: 'middle' } },
      { content: 'SAC',          styles: { halign: 'center', valign: 'middle' } },
      { content: 'GST\nRate',    styles: { halign: 'center', valign: 'middle' } },
      { content: 'UOM',          styles: { halign: 'center', valign: 'middle' } },
      { content: 'Quantity',     styles: { halign: 'center', valign: 'middle' } },
      { content: 'Basic\nRate',  styles: { halign: 'right',  valign: 'middle' } },
      { content: 'Amount',       styles: { halign: 'right',  valign: 'middle' } },
    ]],
    body: allBody,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.5,
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    bodyStyles: { fillColor: [255, 255, 255], minCellHeight: 8 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 11 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'left',   cellWidth: 'auto' },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 15 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'right',  cellWidth: 16 },
      7: { halign: 'right',  cellWidth: 24 },
      8: { halign: 'right',  cellWidth: 26 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const ri = data.row.index
      if (ri < footerStart) return
      // Footer rows: normal weight except TOTAL
      const isTotalRow = ri === allBody.length - 1
      data.cell.styles.fontStyle = isTotalRow ? 'bold' : 'normal'
      // Merge first 7 cols visually for label rows (just align label left in col 2)
    },
  })

  y = doc.lastAutoTable.finalY

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 4 — AMOUNT IN WORDS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const wordsH = 11
  bx(doc, L, y, W, wordsH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(0)
  doc.text('Amount chargeable (In Words):', L + 2, y + 4)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  const amtWords = numToWords(totalAmt)
  const amtWordLines = doc.splitTextToSize(amtWords, W - 4)
  amtWordLines.slice(0, 2).forEach((l, i) => doc.text(l, L + 2, y + 8 + i * 3.5))
  y += wordsH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 5 — TAX SUMMARY BREAK-UP
  // Header: SAC | Taxable Value | IGST (Rate | Amt) | CGST (Rate | Amt) | SGST (Rate | Amt) | Total Tax
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Section label row
  bx(doc, L, y, W, 6)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0)
  doc.text('Tax Summary Break-up', L + 2, y + 4.5)
  y += 6

  // Group line items by SAC code
  const gstMap = {}
  lineItems.forEach(l => {
    const key  = l.sac_hsn_code || '—'
    const lRate = l.gst_rate != null ? Number(l.gst_rate) : invGSTRate
    if (!gstMap[key]) gstMap[key] = { sac: key, taxableAmt: 0, gstRate: lRate }
    gstMap[key].taxableAmt += Number(l.amount || 0)
  })
  const gstGroups = Object.values(gstMap)

  let totTaxable = 0, totIGST = 0, totCGST = 0, totSGST = 0, totTax = 0

  const gstBody = gstGroups.map(g => {
    const taxableG = g.taxableAmt - (discount * g.taxableAmt / (subtotal || 1))
    const igstR = isIGST ? g.gstRate : 0
    const cgstR = isIGST ? 0 : g.gstRate / 2
    const sgstR = isIGST ? 0 : g.gstRate / 2
    const igstA = Number((taxableG * igstR / 100).toFixed(2))
    const cgstA = Number((taxableG * cgstR / 100).toFixed(2))
    const sgstA = Number((taxableG * sgstR / 100).toFixed(2))
    const totalT = igstA + cgstA + sgstA

    totTaxable += taxableG
    totIGST    += igstA
    totCGST    += cgstA
    totSGST    += sgstA
    totTax     += totalT

    return [
      g.sac,
      fmtINR(taxableG),
      igstR > 0 ? `${igstR}%` : '0%',
      fmtINR(igstA),
      cgstR > 0 ? `${cgstR}%` : '0%',
      fmtINR(cgstA),
      sgstR > 0 ? `${sgstR}%` : '0%',
      fmtINR(sgstA),
      fmtINR(totalT),
    ]
  })

  // TOTAL row
  gstBody.push([
    'TOTAL',
    fmtINR(totTaxable),
    '',
    fmtINR(totIGST),
    '',
    fmtINR(totCGST),
    '',
    fmtINR(totSGST),
    fmtINR(totTax),
  ])
  const gstTotalIdx = gstBody.length - 1

  // 2-row header: IGST/CGST/SGST each span 2 sub-columns (Rate + Amount)
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: L },
    tableWidth: W,
    head: [
      // Row 1: group labels
      [
        { content: 'SAC',             rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Taxable\nValue',  rowSpan: 2, styles: { halign: 'right',  valign: 'middle' } },
        { content: 'IGST',            colSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'CGST',            colSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'SGST/UTGST',      colSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Total Tax\nAmount', rowSpan: 2, styles: { halign: 'right',  valign: 'middle' } },
      ],
      // Row 2: Rate / Amount sub-headers (SAC, Taxable, Total are rowSpan so excluded)
      [
        { content: 'Rate',   styles: { halign: 'center', valign: 'middle' } },
        { content: 'Amount', styles: { halign: 'right',  valign: 'middle' } },
        { content: 'Rate',   styles: { halign: 'center', valign: 'middle' } },
        { content: 'Amount', styles: { halign: 'right',  valign: 'middle' } },
        { content: 'Rate',   styles: { halign: 'center', valign: 'middle' } },
        { content: 'Amount', styles: { halign: 'right',  valign: 'middle' } },
      ],
    ],
    body: gstBody,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7,
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      valign: 'middle',
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 24 },
      1: { halign: 'right',  cellWidth: 24 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right',  cellWidth: 22 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'right',  cellWidth: 22 },
      6: { halign: 'center', cellWidth: 18 },
      7: { halign: 'right',  cellWidth: 22 },
      8: { halign: 'right',  cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === gstTotalIdx) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = doc.lastAutoTable.finalY

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 6 — TAX AMOUNT IN WORDS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const taxWordsH = 11
  bx(doc, L, y, W, taxWordsH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(0)
  doc.text('Tax Amount (in Words) :', L + 2, y + 4)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  const taxWords = numToWords(totTax || totalGST)
  const taxWordLines = doc.splitTextToSize(taxWords, W - 4)
  taxWordLines.slice(0, 2).forEach((l, i) => doc.text(l, L + 2, y + 8 + i * 3.5))
  y += taxWordsH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 7 — REVERSE CHARGE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const rcH = 8
  bx(doc, L, y, W, rcH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0)
  doc.text('Whether Tax is payable under Reverse Charge :', L + 2, y + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text('Yes / No', L + W - 2, y + 5, { align: 'right' })
  y += rcH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 8 — DECLARATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const declH = 14
  bx(doc, L, y, W, declH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0)
  doc.text('Declaration :', L + 2, y + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text(
    'We declare that this invoice shows the actual price of the services described and all particulars are true and correct.',
    L + 2, y + 10, { maxWidth: W - 4 }
  )
  y += declH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 9 — SIGNATURE  (add page if too close to bottom)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const sigH = 32
  if (y + sigH > 287) { doc.addPage(); y = 10 }

  const sigLW = 85   // left seal box
  const sigRW = W - sigLW
  const sigRX = L + sigLW

  // Left box — Company Seal
  bx(doc, L, y, sigLW, sigH)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120)
  doc.text('(Company Seal)', L + sigLW / 2, y + sigH - 4, { align: 'center' })

  // Right box — Authorized Signatory
  bx(doc, sigRX, y, sigRW, sigH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0)
  doc.text(
    'For Authorized Signatory (Vendor seal and signature)',
    sigRX + 2, y + 5, { maxWidth: sigRW - 4 }
  )
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text(`For ${company?.name || ''}`, sigRX + 2, y + 12, { maxWidth: sigRW - 4 })

  // Signature line
  doc.setLineWidth(0.4); doc.setDrawColor(0)
  doc.line(sigRX + 5, y + sigH - 8, sigRX + sigRW - 5, y + sigH - 8)
  doc.setFontSize(7)
  doc.text('Authorised Signatory', sigRX + sigRW / 2, y + sigH - 3, { align: 'center' })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAGE FOOTER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const pageCount = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(150, 150, 150)
    doc.text('This is a computer generated invoice.', PW / 2, 293, { align: 'center' })
    doc.text(`Page ${p} of ${pageCount}`, L + W, 293, { align: 'right' })
  }

  doc.save(`Invoice_${invoice.invoice_number || 'Draft'}.pdf`)
}
