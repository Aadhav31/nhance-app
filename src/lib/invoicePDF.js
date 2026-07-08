/**
 * invoicePDF.js — GST Tax Invoice (Government format)
 *
 * Matches the standard Indian GST Tax Invoice layout:
 *  ┌─────────────────────────────────────────────────────┐
 *  │  (Original for Recipient)             Tax Invoice   │
 *  │  IRN / Ack No / Ack Date  │  E-Invoice QR Code     │
 *  ├──────────────┬──────────────────────┬───────────────┤
 *  │ Vendor Name  │ Invoice No.          │ Invoice Date  │
 *  │ & Address    ├──────────────────────┼───────────────┤
 *  │              │ Buyer's Order No.    │ Order Date    │
 *  │              ├─────────────────────────────────────-┤
 *  │              │ Work Done Period: From … To …        │
 *  │ Vendor GSTIN ├──────────────────────────────────────┤
 *  │ Buyer Info   │ Nature of Service                    │
 *  │              ├──────────────────────────────────────┤
 *  │              │ Place of Supply with Address         │
 *  │ Buyer GSTIN  │                                      │
 *  ├──────────────┴──────────────────────────────────────┤
 *  │  Line Items Table (9 columns)                       │
 *  ├─────────────────────────────────────────────────────┤
 *  │  Amount chargeable (In Words)                       │
 *  ├─────────────────────────────────────────────────────┤
 *  │  Tax Summary Break-up (10 columns)                  │
 *  ├─────────────────────────────────────────────────────┤
 *  │  Tax Amount (in Words)                              │
 *  │  Reverse Charge                                     │
 *  │  Declaration                                        │
 *  ├──────────────────────┬──────────────────────────────┤
 *  │ Company Seal         │ Authorised Signatory         │
 *  └──────────────────────┴──────────────────────────────┘
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
const fmtINR = n => {
  const v = Number(n || 0)
  if (v === 0) return '-'
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtDate = d => {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
}

// ── Drawing helpers ────────────────────────────────────────────────────────
function cell(doc, x, y, w, h, content = {}) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h)

  const {
    label = '', value = '', size = 7.5, labelSize = 6.5,
    bold = false, center = false, padX = 2, padY = 4,
    lineH = 3.8, noValue = false,
  } = content

  let ty = y + padY
  if (label) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(labelSize)
    doc.setTextColor(0, 0, 0)
    if (center) doc.text(label, x + w / 2, ty, { align: 'center' })
    else doc.text(label, x + padX, ty)
    ty += lineH + 0.5
  }
  if (value && !noValue) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(0, 0, 0)
    const lines = doc.splitTextToSize(String(value), w - padX * 2)
    lines.forEach((l, i) => {
      if (center) doc.text(l, x + w / 2, ty + i * lineH, { align: 'center' })
      else doc.text(l, x + padX, ty + i * lineH)
    })
  }
}

function hline(doc, x, y, w) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.line(x, y, x + w, y)
}

function vline(doc, x, y, h) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.line(x, y, x, y + h)
}

// ── Main export ─────────────────────────────────────────────────────────────
export function generateInvoicePDF(invoice, lineItems, company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const L  = 10    // left margin
  const T  = 8     // top margin
  const PW = 210
  const W  = 190   // content width

  const isIGST = Number(invoice.igst_rate || 0) > 0 && !(Number(invoice.cgst_rate || 0) > 0)

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((s, l) => s + Number(l.amount || 0), 0)
  const discount = Number(invoice.discount_amount || 0)
  const taxable  = subtotal - discount
  const cgstAmt  = Number(invoice.cgst_amount || 0)
  const sgstAmt  = Number(invoice.sgst_amount || 0)
  const igstAmt  = Number(invoice.igst_amount || 0)
  const totalGST = cgstAmt + sgstAmt + igstAmt
  const totalAmt = Number(invoice.total_amount || 0)
  const invGSTRate = isIGST
    ? Number(invoice.igst_rate || 0)
    : (Number(invoice.cgst_rate || 0) + Number(invoice.sgst_rate || 0))

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 1 — TITLE + E-INVOICE HEADER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // "(Original for Recipient)" at top-right
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(0)
  doc.text('(Original for Recipient)', L + W, T, { align: 'right' })

  const titleY = T + 2
  const titleH = 28
  const qrW    = 48   // QR code column width
  const irnW   = W - qrW

  // Outer border for title block
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(L, titleY, W, titleH)
  // Vertical divider between IRN area and QR area
  vline(doc, L + irnW, titleY, titleH)

  // "Tax Invoice" — centered in full width (bold, large)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Tax Invoice', L + W / 2, titleY + 7, { align: 'center' })

  // IRN / Ack fields (left area)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('IRN         :', L + 2, titleY + 13)
  doc.text('Ack No.     :', L + 2, titleY + 18)
  doc.text('Ack. Date   :', L + 2, titleY + 23)

  // "E-Invoice QR Code" label (right area)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('E-Invoice QR Code', L + irnW + qrW / 2, titleY + 7, { align: 'center' })

  let y = titleY + titleH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 2 — VENDOR + INVOICE DETAILS  (3-column grid)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const cA = 66   // vendor / buyer column
  const cB = 66   // invoice no. / order no. / period / nature
  const cC = W - cA - cB  // invoice date / order date (= 58)

  const xA = L
  const xB = L + cA
  const xC = L + cA + cB

  // Row 1: Vendor Name + Invoice No. + Invoice Date  (h=22)
  const r1H = 22
  // Cell A1 — Vendor name & address
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(xA, y, cA, r1H)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
  doc.text('Vendor Name and Address (Bill from)', xA + 2, y + 4)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  const coName = company?.name || ''
  doc.text(doc.splitTextToSize(coName, cA - 4)[0], xA + 2, y + 9)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  const coAddr = [company?.address, company?.city, company?.state].filter(Boolean).join(', ')
  const coAddrLines = doc.splitTextToSize(coAddr, cA - 4)
  coAddrLines.slice(0, 3).forEach((l, i) => doc.text(l, xA + 2, y + 13 + i * 3.5))

  // Cell B1 — Invoice No.
  cell(doc, xB, y, cB, r1H, { label: 'Invoice No. :', value: invoice.invoice_number || '', size: 8, bold: true })

  // Cell C1 — Invoice Date
  cell(doc, xC, y, cC, r1H, { label: 'Invoice Date :', value: fmtDate(invoice.invoice_date), size: 8 })

  y += r1H

  // Row 2: (vendor cont.) + Buyer's Order No. + Order Date  (h=10)
  const r2H = 10
  vline(doc, xA, y, r2H)       // left border for cell A (no top border — continues)
  vline(doc, xB, y, r2H)       // divider
  hline(doc, xA, y + r2H, W)   // bottom border
  vline(doc, xC, y, r2H)
  vline(doc, L + W, y, r2H)

  cell(doc, xB, y, cB, r2H, { label: "Buyer's Order Number :", value: invoice.work_order_number || '' })
  cell(doc, xC, y, cC, r2H, { label: 'Order Date :', value: fmtDate(invoice.work_order_date) })

  y += r2H

  // Row 3: Vendor GST + Work Done Period (B+C merged)  (h=8)
  const r3H = 10
  // Cell A3 — Vendor GST (bottom of vendor block)
  vline(doc, xA, y, r3H)
  vline(doc, xB, y, r3H)
  vline(doc, L + W, y, r3H)
  hline(doc, xA, y + r3H, W)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0)
  doc.text('Vendor GST Number:', xA + 2, y + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(company?.gstin || '', xA + 2, y + 8)

  // Cell B3+C3 — Work Done Period (merged)
  const periodText = (invoice.work_done_from && invoice.work_done_to)
    ? `From : ${fmtDate(invoice.work_done_from)}        To : ${fmtDate(invoice.work_done_to)}`
    : 'From :                             To :'
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
  doc.text('Work done Period', xB + 2, y + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(periodText, xB + 2, y + 8)

  y += r3H

  // Row 4: Buyer (Bill to) + Nature of Service (B+C merged)  (h=16)
  const r4H = 16
  const buyerInfoH = r4H

  vline(doc, xA, y, buyerInfoH)
  vline(doc, xB, y, buyerInfoH)
  vline(doc, L + W, y, buyerInfoH)
  hline(doc, xA, y + buyerInfoH, W)

  // Cell A4 — Buyer (Bill to)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0)
  doc.text('Buyer (Bill to)', xA + 2, y + 4)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text(doc.splitTextToSize(invoice.client_name || '', cA - 4)[0], xA + 2, y + 8)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  const buyerAddr = invoice.client_address || ''
  const buyerAddrLines = doc.splitTextToSize(buyerAddr, cA - 4)
  buyerAddrLines.slice(0, 2).forEach((l, i) => doc.text(l, xA + 2, y + 12 + i * 3.5))

  // Cell B4+C4 — Nature of Service
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
  doc.text('Nature of Service:', xB + 2, y + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  const natureLines = doc.splitTextToSize(invoice.nature_of_supply || '', cB + cC - 4)
  natureLines.slice(0, 2).forEach((l, i) => doc.text(l, xB + 2, y + 8 + i * 3.8))

  // Horizontal divider inside B/C area
  hline(doc, xB, y + 9, cB + cC)

  // Place of supply below nature
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
  doc.text('Place of Supply with Address:', xB + 2, y + 12)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  const posText = [invoice.place_of_supply, invoice.place_of_supply_address].filter(Boolean).join(' — ')
  const posLines = doc.splitTextToSize(posText, cB + cC - 4)
  posLines.slice(0, 1).forEach((l, i) => doc.text(l, xB + 2, y + 15.5 + i * 3.5))

  y += buyerInfoH

  // Row 5: Buyer GST (h=8)
  const r5H = 8
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(xA, y, cA, r5H)
  doc.rect(xB, y, cB + cC, r5H)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
  doc.text('Buyer GST Number :', xA + 2, y + 3)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(invoice.client_gstin || '', xA + 2, y + 7)

  y += r5H

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 3 — LINE ITEMS TABLE
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
      Number(l.quantity || 0),
      fmtINR(l.rate),
      fmtINR(l.amount),
    ]
  })

  // Footer rows (subtotal, tax lines, grand total)
  const footerRows = []
  footerRows.push(['', '', 'Subtotal', '', '', '', '', '', fmtINR(subtotal)])
  if (discount > 0) footerRows.push(['', '', 'Less: Discount', '', '', '', '', '', `(${fmtINR(discount)})`])
  if (isIGST) {
    footerRows.push(['', '', 'IGST', '', `${invoice.igst_rate}%`, '', '', '', fmtINR(igstAmt)])
  } else {
    footerRows.push(['', '', 'IGST', '', '0%', '', '', '', '-'])
    footerRows.push(['', '', 'CGST', '', `${invoice.cgst_rate}%`, '', '', '', fmtINR(cgstAmt)])
    footerRows.push(['', '', 'SGST/UTGST', '', `${invoice.sgst_rate}%`, '', '', '', fmtINR(sgstAmt)])
  }
  footerRows.push(['', '', 'TOTAL', '', '', '', '', '', fmtINR(totalAmt)])

  const allBody = [...lineBody, ...footerRows]
  const footerStart = lineBody.length

  autoTable(doc, {
    startY: y,
    margin: { left: L, right: L },
    tableWidth: W,
    head: [[
      { content: 'Sl No.',      styles: { halign: 'center' } },
      { content: 'Item code',   styles: { halign: 'center' } },
      { content: 'Description', styles: { halign: 'center' } },
      { content: 'SAC',         styles: { halign: 'center' } },
      { content: 'GST Rate',    styles: { halign: 'center' } },
      { content: 'UOM',         styles: { halign: 'center' } },
      { content: 'Quantity',    styles: { halign: 'center' } },
      { content: 'Basic Rate',  styles: { halign: 'right'  } },
      { content: 'Amount',      styles: { halign: 'right'  } },
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
      0: { halign: 'center', cellWidth: 12 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'left',   cellWidth: 'auto' },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'right',  cellWidth: 16 },
      7: { halign: 'right',  cellWidth: 23 },
      8: { halign: 'right',  cellWidth: 25 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const ri = data.row.index
      if (ri < footerStart) return
      // Footer summary rows
      data.cell.styles.fontStyle = ri === allBody.length - 1 ? 'bold' : 'normal'
      // "TOTAL" row — bold all
      if (ri === allBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
    didDrawCell: (data) => {
      // Ensure black borders throughout
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.3)
    },
  })

  y = doc.lastAutoTable.finalY

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 4 — AMOUNT IN WORDS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const wordsH = 10
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(L, y, W, wordsH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(0)
  doc.text('Amount chargeable (In Words):', L + 2, y + 4)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  const amtWords = numToWords(totalAmt)
  doc.text(doc.splitTextToSize(amtWords, W - 4)[0], L + 2, y + 8)
  y += wordsH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 5 — TAX SUMMARY BREAK-UP
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Header label
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(L, y, W, 6)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0)
  doc.text('Tax Summary Break-up', L + 2, y + 4)
  y += 6

  // Group line items by SAC/HSN
  const gstMap = {}
  lineItems.forEach(l => {
    const key = l.sac_hsn_code || '—'
    const lRate = l.gst_rate != null ? Number(l.gst_rate) : invGSTRate
    if (!gstMap[key]) gstMap[key] = { sac: key, taxableAmt: 0, gstRate: lRate }
    gstMap[key].taxableAmt += Number(l.amount || 0)
  })

  const gstGroups = Object.values(gstMap)
  let totTaxableA = 0, totIGSTA = 0, totCGSTA = 0, totSGSTA = 0, totTaxA = 0

  const gstBody = gstGroups.map((g, i) => {
    const taxableG = g.taxableAmt - (discount * g.taxableAmt / (subtotal || 1))
    const igstR = isIGST ? g.gstRate : 0
    const cgstR = isIGST ? 0 : g.gstRate / 2
    const sgstR = isIGST ? 0 : g.gstRate / 2
    const igstA = Number((taxableG * igstR / 100).toFixed(2))
    const cgstA = Number((taxableG * cgstR / 100).toFixed(2))
    const sgstA = Number((taxableG * sgstR / 100).toFixed(2))
    const totalT = igstA + cgstA + sgstA

    totTaxableA += taxableG
    totIGSTA    += igstA
    totCGSTA    += cgstA
    totSGSTA    += sgstA
    totTaxA     += totalT

    return [
      g.sac,
      fmtINR(taxableG),
      igstR > 0 ? `${igstR}%` : '0%',
      igstA > 0 ? fmtINR(igstA) : '-',
      cgstR > 0 ? `${cgstR}%` : `${isIGST ? 0 : cgstR}%`,
      cgstA > 0 ? fmtINR(cgstA) : '-',
      sgstR > 0 ? `${sgstR}%` : `${isIGST ? 0 : sgstR}%`,
      sgstA > 0 ? fmtINR(sgstA) : '-',
      fmtINR(totalT),
    ]
  })

  // Totals row
  gstBody.push([
    'TOTAL',
    fmtINR(totTaxableA),
    '',
    totIGSTA > 0 ? fmtINR(totIGSTA) : '-',
    '',
    totCGSTA > 0 ? fmtINR(totCGSTA) : '-',
    '',
    totSGSTA > 0 ? fmtINR(totSGSTA) : '-',
    fmtINR(totTaxA),
  ])

  autoTable(doc, {
    startY: y,
    margin: { left: L, right: L },
    tableWidth: W,
    head: [[
      { content: 'SAC',              styles: { halign: 'center', valign: 'middle' } },
      { content: 'Taxable\nValue',   styles: { halign: 'right',  valign: 'middle' } },
      { content: 'IGST\nRate',       styles: { halign: 'center', valign: 'middle' } },
      { content: 'IGST\nAmount',     styles: { halign: 'right',  valign: 'middle' } },
      { content: 'CGST\nRate',       styles: { halign: 'center', valign: 'middle' } },
      { content: 'CGST\nAmount',     styles: { halign: 'right',  valign: 'middle' } },
      { content: 'SGST/UTGST\nRate', styles: { halign: 'center', valign: 'middle' } },
      { content: 'SGST/UTGST\nAmt', styles: { halign: 'right',  valign: 'middle' } },
      { content: 'Total Tax\nAmount',styles: { halign: 'right',  valign: 'middle' } },
    ]],
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
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 28 },
      1: { halign: 'right',  cellWidth: 22 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'right',  cellWidth: 22 },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'right',  cellWidth: 22 },
      6: { halign: 'center', cellWidth: 20 },
      7: { halign: 'right',  cellWidth: 22 },
      8: { halign: 'right',  cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === gstBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = doc.lastAutoTable.finalY

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 6 — TAX AMOUNT IN WORDS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const taxWordsH = 9
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(L, y, W, taxWordsH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(0)
  doc.text('Tax Amount (in Words) :', L + 2, y + 4)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  doc.text(doc.splitTextToSize(numToWords(totTaxA || totalGST), W - 4)[0], L + 2, y + 8)
  y += taxWordsH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 7 — REVERSE CHARGE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const rcH = 8
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(L, y, W, rcH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0)
  doc.text('Whether Tax is payable under Reverse Charge', L + 2, y + 5)
  doc.setFont('helvetica', 'normal')
  // "Yes" strikethrough + No
  doc.text('Yes / No', L + 120, y + 5)
  // Draw strikethrough on "Yes"
  const yesW = doc.getTextWidth('Yes')
  doc.setLineWidth(0.4)
  doc.line(L + 120, y + 4, L + 120 + yesW, y + 4)
  y += rcH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 8 — DECLARATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const declH = 14
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(L, y, W, declH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0)
  doc.text('Declaration :', L + 2, y + 5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  doc.text(
    'We declare that invoice shows the actual price of the services described and all particulars are true and correct.',
    L + 2, y + 10, { maxWidth: W - 4 }
  )
  y += declH

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK 9 — SIGNATURE  (check space, add page if needed)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const sigH = 35
  if (y + sigH > 287) { doc.addPage(); y = 10 }

  const sigLW = W / 2   // 95mm each
  const sigRX = L + sigLW

  // Left box — company seal
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.rect(L, y, sigLW, sigH)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(0)
  doc.text('(Company Seal)', L + 2, y + sigH - 3)

  // Right box — Authorized signatory
  doc.rect(sigRX, y, sigLW, sigH)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  doc.text('For Authorized Signatory (Vendor seal and signature)', sigRX + 2, y + 5, { maxWidth: sigLW - 4 })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text(`For ${company?.name || ''}`, sigRX + 2, y + 12, { maxWidth: sigLW - 4 })
  // Signature line
  doc.setLineWidth(0.4); doc.setDrawColor(0)
  doc.line(sigRX + 5, y + sigH - 7, sigRX + sigLW - 5, y + sigH - 7)
  doc.setFontSize(7)
  doc.text('Authorised Signatory', sigRX + sigLW / 2, y + sigH - 3, { align: 'center' })

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
