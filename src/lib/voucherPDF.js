/**
 * voucherPDF.js — Payment Voucher PDF generator (A5)
 *
 * Compact A5 slip: company name + GSTIN, voucher details, signatures.
 * No full letterhead. Deterministic voucher number from record ID.
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
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const W   = 148
  const M   = 10          // margin
  const IW  = W - M * 2  // 128 mm inner width
  const fmtAmt = n => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

  let y = 8

  // ── Thin outer border ─────────────────────────────────────────────────────
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.6)
  pdf.rect(M - 3, y - 1, IW + 6, 200)

  // ── Company name ──────────────────────────────────────────────────────────
  y += 6
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.setTextColor(...GREEN)
  pdf.text((company?.name || 'Company').toUpperCase(), W / 2, y, { align: 'center' })

  // GSTIN / contact line
  y += 5
  const meta = [
    company?.gstin ? `GSTIN: ${company.gstin}` : '',
    company?.contact_phone ? company.contact_phone : '',
  ].filter(Boolean).join('   |   ')
  if (meta) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...GREY)
    pdf.text(meta, W / 2, y, { align: 'center' })
    y += 4
  }

  // ── Green divider ─────────────────────────────────────────────────────────
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.5)
  pdf.line(M - 3, y, M + IW + 3, y)
  y += 1

  // ── "PAYMENT VOUCHER" title ───────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...BLACK)
  pdf.text('PAYMENT VOUCHER', W / 2, y + 5, { align: 'center' })
  y += 9

  // ── Voucher No + Date (same line) ─────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...GREY)
  pdf.text('Voucher No:', M, y)
  pdf.setTextColor(...GREEN)
  pdf.text(voucherNumber, M + 24, y)

  pdf.setTextColor(...GREY)
  pdf.text('Date:', W - M - 38, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(...BLACK)
  pdf.text(fmtDate(date), W - M - 24, y)
  y += 6

  // ── Light divider ─────────────────────────────────────────────────────────
  pdf.setDrawColor(...LGREY)
  pdf.setLineWidth(0.2)
  pdf.line(M, y, M + IW, y)
  y += 4

  // ── Amount ────────────────────────────────────────────────────────────────
  // Background chip
  pdf.setFillColor(236, 248, 239)
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(M, y, IW, 16, 2, 2, 'FD')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...GREY)
  pdf.text('AMOUNT PAID', M + 3, y + 6)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.setTextColor(...GREEN)
  pdf.text(fmtAmt(amount), M + IW - 3, y + 7, { align: 'right' })

  // In words
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(6.5)
  pdf.setTextColor(...GREY)
  const wordLines = pdf.splitTextToSize(amountInWords(amount), IW - 6)
  pdf.text(wordLines[0] || '', M + 3, y + 13)  // single line is enough for A5
  y += 21

  // ── Details rows ──────────────────────────────────────────────────────────
  const rows = [
    ['Paid To',      payee],
    ['Purpose',      purpose],
    ['Category',     cap(category)],
    ['Payment Mode', cap(paymentMode)],
    ...(bankRef ? [['Bank / Ref', bankRef]] : []),
  ]

  const COL1 = 28  // label column width
  const ROW_H = 8

  rows.forEach(([label, value], idx) => {
    // alternating row tint
    if (idx % 2 === 0) {
      pdf.setFillColor(248, 250, 248)
      pdf.rect(M, y, IW, ROW_H, 'F')
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(...GREY)
    pdf.text(label, M + 2, y + 5.5)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(...BLACK)
    // truncate value to fit single row
    const safeVal = pdf.splitTextToSize(String(value || '—'), IW - COL1 - 4)[0] || '—'
    pdf.text(safeVal, M + COL1, y + 5.5)

    y += ROW_H
  })

  // ── Divider before signatures ─────────────────────────────────────────────
  y += 4
  pdf.setDrawColor(...LGREY)
  pdf.setLineWidth(0.2)
  pdf.line(M, y, M + IW, y)
  y += 6

  // ── Signature boxes (3 equal columns) ────────────────────────────────────
  const sigW   = (IW - 8) / 3
  const sigH   = 18
  const sigBoxes = [
    { label: 'Prepared By', x: M },
    { label: 'Approved By', x: M + sigW + 4 },
    { label: 'Received By', x: M + (sigW + 4) * 2 },
  ]

  sigBoxes.forEach(({ label, x }) => {
    pdf.setDrawColor(...LGREY)
    pdf.setLineWidth(0.25)
    pdf.rect(x, y, sigW, sigH, 'S')

    // signature underline inside box
    pdf.line(x + 3, y + sigH - 7, x + sigW - 3, y + sigH - 7)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.setTextColor(...GREY)
    pdf.text(label, x + sigW / 2, y + sigH - 2, { align: 'center' })
  })

  y += sigH + 4

  // ── Footer note ───────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.setTextColor(...LGREY)
  pdf.text('Computer-generated payment voucher.', W / 2, y, { align: 'center' })

  pdf.save(`${voucherNumber}.pdf`)
}
