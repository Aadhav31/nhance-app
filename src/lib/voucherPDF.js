/**
 * voucherPDF.js — Payment Voucher PDF generator (A5)
 *
 * Compact A5 slip: company name + GSTIN, voucher details, signatures.
 * All text is wrapped/clipped within margins — nothing bleeds over the edge.
 */

import jsPDF from 'jspdf'

const GREEN = [26, 92, 42]
const BLACK = [20, 20, 20]
const GREY  = [90, 90, 90]
const LGREY = [190, 190, 190]

// ── Amount → Indian English words ─────────────────────────────────────────────
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
              'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
              'Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function twoDigits(n) {
  if (n < 20) return ONES[n]
  return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim()
}

function toWords(n) {
  if (n === 0) return 'Zero'
  const parts = []
  const cr  = Math.floor(n / 10000000); n %= 10000000
  const lac = Math.floor(n / 100000);   n %= 100000
  const th  = Math.floor(n / 1000);     n %= 1000
  const hun = Math.floor(n / 100);      n %= 100
  if (cr)  parts.push(twoDigits(cr)  + ' Crore')
  if (lac) parts.push(twoDigits(lac) + ' Lakh')
  if (th)  parts.push(twoDigits(th)  + ' Thousand')
  if (hun) parts.push(ONES[hun]      + ' Hundred')
  if (n)   parts.push(twoDigits(n))
  return parts.join(' ')
}

function amountInWords(amount) {
  const total = Math.round(Number(amount) || 0)
  const paise = Math.round(((Number(amount) || 0) - total) * 100)
  let w = 'Rupees ' + toWords(total)
  if (paise > 0) w += ' and ' + toWords(paise) + ' Paise'
  return w + ' Only'
}

// ── Voucher number: deterministic from record ID ───────────────────────────────
export function makeVoucherNumber(id = '', date = '') {
  const year  = date ? new Date(date).getFullYear() : new Date().getFullYear()
  const token = (id || '').replace(/-/g, '').slice(-6).toUpperCase()
  return `PV-${year}-${token || 'MANUAL'}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function cap(s) {
  return (s || '').charAt(0).toUpperCase() + (s || '').slice(1)
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function downloadVoucherPDF(company, voucher) {
  const {
    voucherNumber = '—',
    date          = new Date().toISOString().slice(0, 10),
    amount        = 0,
    payee         = '—',
    purpose       = '—',
    category      = '—',
    paymentMode   = '—',
    bankRef       = '',
  } = voucher

  // A5 = 148 × 210 mm
  const pdf   = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const W     = 148
  const M     = 12          // left/right margin
  const IW    = W - M * 2   // 124 mm usable width
  const RIGHT = M + IW      // right boundary = 136 mm
  const LINE  = 4           // standard line height (mm)
  // Note: jsPDF's built-in Helvetica doesn't support the ₹ glyph (U+20B9).
  // It renders as a tick and breaks right-align measurement. Use "Rs." instead.
  const fmtAmt = n => 'Rs. ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

  // Helper: wrap text, render all lines, return new y after last line
  const textBlock = (text, x, startY, maxW, lineH = LINE) => {
    const lines = pdf.splitTextToSize(String(text || ''), maxW)
    lines.forEach((l, i) => pdf.text(l, x, startY + i * lineH))
    return startY + lines.length * lineH
  }

  let y = 10
  const borderTop = y - 1

  // ── Company name ──────────────────────────────────────────────────────────
  y += 6
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.setTextColor(...GREEN)
  const nameLines = pdf.splitTextToSize((company?.name || 'Company').toUpperCase(), IW)
  nameLines.forEach((l, i) => pdf.text(l, W / 2, y + i * 5, { align: 'center' }))
  y += nameLines.length * 5

  // Address below company name
  if (company?.address) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...GREY)
    const addrLines = pdf.splitTextToSize(company.address, IW)
    addrLines.slice(0, 2).forEach((l, i) => pdf.text(l, W / 2, y + i * 3.8, { align: 'center' }))
    y += Math.min(addrLines.length, 2) * 3.8
  }

  // GSTIN / phone — one line
  const meta = [
    company?.gstin         ? `GSTIN: ${company.gstin}`       : '',
    company?.contact_phone ? `Ph: ${company.contact_phone}`  : '',
  ].filter(Boolean).join('   |   ')
  if (meta) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...GREY)
    const mLine = pdf.splitTextToSize(meta, IW)[0]
    pdf.text(mLine, W / 2, y + 1, { align: 'center' })
    y += 4
  }

  // ── Green divider ─────────────────────────────────────────────────────────
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.5)
  pdf.line(M, y, RIGHT, y)
  y += 1

  // ── Title ─────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...BLACK)
  pdf.text('PAYMENT VOUCHER', W / 2, y + 5, { align: 'center' })
  y += 9

  // ── Voucher No (left) + Date (right) — measure to avoid overlap ───────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...GREY)
  pdf.text('Voucher No:', M, y)

  pdf.setTextColor(...GREEN)
  pdf.text(voucherNumber, M + 23, y)

  // Date: right-anchored
  const dateStr  = fmtDate(date)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...GREY)
  const dateLabelW = pdf.getTextWidth('Date: ')
  pdf.text('Date: ', RIGHT - pdf.getTextWidth('Date: ') - pdf.getTextWidth(dateStr), y)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(...BLACK)
  pdf.text(dateStr, RIGHT - pdf.getTextWidth(dateStr), y)
  y += 8

  // ── Amount chip ───────────────────────────────────────────────────────────
  // Measure how many lines the "in words" text needs
  pdf.setFontSize(6.5)
  const wordLines = pdf.splitTextToSize(amountInWords(amount), IW - 6)
  const chipH = 8 + wordLines.length * 3.8   // base + lines

  pdf.setFillColor(236, 248, 239)
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(M, y, IW, chipH, 2, 2, 'FD')

  // Label
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.setTextColor(...GREY)
  pdf.text('AMOUNT PAID', M + 3, y + 5.5)

  // Amount figure — right-aligned, shrinks font if text is too wide for chip
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(...GREEN)
  const amtStr = fmtAmt(amount)
  const amtMaxW = IW - 44  // leave 44mm for "AMOUNT PAID" label on left
  let amtFontSz = 13
  pdf.setFontSize(amtFontSz)
  while (pdf.getTextWidth(amtStr) > amtMaxW && amtFontSz > 8) {
    amtFontSz -= 0.5
    pdf.setFontSize(amtFontSz)
  }
  pdf.text(amtStr, RIGHT - 3, y + 6, { align: 'right' })

  // In words — all lines
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(6.5)
  pdf.setTextColor(...GREY)
  wordLines.forEach((l, i) => pdf.text(l, M + 3, y + 10 + i * 3.8))
  y += chipH + 3

  // ── Details rows (label | value, value wraps, row expands) ───────────────
  const rows = [
    ['Paid To',      payee],
    ['Purpose',      purpose],
    ['Category',     cap(category)],
    ['Payment Mode', cap(paymentMode)],
    ...(bankRef ? [['Bank / Ref', bankRef]] : []),
  ]

  const COL1   = 28   // label column width
  const VAL_W  = IW - COL1 - 2  // value column width (fits within RIGHT)
  const ROW_PAD = 2   // top padding inside row
  const ROW_LEAD = 3.8 // line height for value text

  rows.forEach(([label, value], idx) => {
    // pre-measure wrapped value lines
    pdf.setFontSize(7.5)
    const valLines = pdf.splitTextToSize(String(value || '—'), VAL_W)
    const rowH = ROW_PAD * 2 + valLines.length * ROW_LEAD

    // alternating tint
    if (idx % 2 === 0) {
      pdf.setFillColor(248, 250, 248)
      pdf.rect(M, y, IW, rowH, 'F')
    }

    // label
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(...GREY)
    pdf.text(label, M + 2, y + ROW_PAD + ROW_LEAD)

    // value — all wrapped lines
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(...BLACK)
    valLines.forEach((l, li) => pdf.text(l, M + COL1, y + ROW_PAD + ROW_LEAD + li * ROW_LEAD))

    y += rowH
  })

  // ── Divider before signatures ─────────────────────────────────────────────
  y += 4
  pdf.setDrawColor(...LGREY)
  pdf.setLineWidth(0.2)
  pdf.line(M, y, RIGHT, y)
  y += 6

  // ── Signature boxes ───────────────────────────────────────────────────────
  const sigW = (IW - 8) / 3
  const sigH = 18
  const sigBoxes = [
    { label: 'Prepared By', x: M },
    { label: 'Approved By', x: M + sigW + 4 },
    { label: 'Received By', x: M + (sigW + 4) * 2 },
  ]

  sigBoxes.forEach(({ label, x }) => {
    pdf.setDrawColor(...LGREY)
    pdf.setLineWidth(0.25)
    pdf.rect(x, y, sigW, sigH, 'S')
    pdf.line(x + 3, y + sigH - 7, x + sigW - 3, y + sigH - 7)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.setTextColor(...GREY)
    pdf.text(label, x + sigW / 2, y + sigH - 2, { align: 'center' })
  })

  y += sigH + 5

  // ── Footer note ───────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.setTextColor(...LGREY)
  pdf.text('Computer-generated payment voucher.', W / 2, y, { align: 'center' })

  // ── Outer border — drawn last using actual content height ─────────────────
  const borderH = y + 3 - borderTop
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.6)
  pdf.rect(M - 3, borderTop, IW + 6, borderH)

  pdf.save(`${voucherNumber}.pdf`)
}
