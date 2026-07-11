/**
 * voucherPDF.js — Payment Voucher PDF generator
 *
 * Generates a clean A4 payment voucher for any money-out transaction.
 * Voucher number is derived deterministically from the source record ID
 * so the same voucher number is produced every time for the same record.
 *
 * Usage:
 *   import { downloadVoucherPDF, makeVoucherNumber } from '../lib/voucherPDF'
 *   const vNo = makeVoucherNumber(expense.id, expense.expense_date)
 *   await downloadVoucherPDF(company, {
 *     voucherNumber: vNo,
 *     date:          expense.expense_date,
 *     amount:        expense.amount,
 *     payee:         expense.vendor_name || expense.description,
 *     purpose:       expense.description,
 *     category:      expense.category,
 *     paymentMode:   expense.payment_mode,
 *     bankRef:       expense.bank_reference,
 *   })
 */

import jsPDF from 'jspdf'

// ── Colour palette ────────────────────────────────────────────────────────────
const GREEN   = [26, 92, 42]
const BLACK   = [15, 15, 15]
const GREY    = [80, 80, 80]
const LGREY   = [180, 180, 180]
const BG_BAND = [245, 248, 245]   // very light green tint for header band

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

// ── Date formatter ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

function capitalize(s) {
  return (s || '').charAt(0).toUpperCase() + (s || '').slice(1)
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * @param {object} company   — from useAuth() / companies table
 * @param {object} voucher   — { voucherNumber, date, amount, payee, purpose, category, paymentMode, bankRef }
 */
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

  const pdf   = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const W     = 210
  const M     = 14          // margin
  const IW    = W - M * 2   // inner width = 182
  const fmt   = n => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

  // ── Outer border ──────────────────────────────────────────────────────────
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(1.0)
  pdf.rect(M - 2, 10, IW + 4, 270)
  pdf.setLineWidth(0.3)
  pdf.rect(M - 0.5, 10.5, IW + 1, 269)

  // ── Header band ───────────────────────────────────────────────────────────
  pdf.setFillColor(...BG_BAND)
  pdf.rect(M - 2, 10, IW + 4, 36, 'F')

  // Company name
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(...GREEN)
  pdf.text((company?.name || 'Company').toUpperCase(), W / 2, 22, { align: 'center' })

  // Address
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...GREY)
  if (company?.address) {
    pdf.text(company.address.toUpperCase(), W / 2, 28, { align: 'center' })
  }

  // GSTIN / CIN row
  const gLine = [
    company?.cin   ? `CIN: ${company.cin}`     : '',
    company?.gstin ? `GSTIN: ${company.gstin}` : '',
  ].filter(Boolean).join('     ')
  if (gLine) {
    pdf.setFontSize(7.5)
    pdf.text(gLine, W / 2, 33, { align: 'center' })
  }

  // contact row
  const cLine = [
    company?.contact_email ? `Email: ${company.contact_email}` : '',
    company?.contact_phone ? `Ph: ${company.contact_phone}`    : '',
  ].filter(Boolean).join('     ')
  if (cLine) {
    pdf.setFontSize(7.5)
    pdf.text(cLine, W / 2, 38, { align: 'center' })
  }

  // Header divider
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.8)
  pdf.line(M - 2, 46, M + IW + 2, 46)

  // ── Title ─────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.setTextColor(...BLACK)
  pdf.text('PAYMENT VOUCHER', W / 2, 54, { align: 'center' })

  // ── Voucher No + Date row ─────────────────────────────────────────────────
  pdf.setDrawColor(...LGREY)
  pdf.setLineWidth(0.3)
  pdf.rect(M, 58, IW, 12, 'S')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(...GREY)
  pdf.text('Voucher No:', M + 4, 65)
  pdf.setTextColor(...GREEN)
  pdf.setFontSize(10)
  pdf.text(voucherNumber, M + 30, 65)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(...GREY)
  pdf.text('Date:', M + IW - 50, 65)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(...BLACK)
  pdf.text(fmtDate(date), M + IW - 36, 65)

  // ── Amount box ────────────────────────────────────────────────────────────
  pdf.setFillColor(240, 250, 242)
  pdf.rect(M, 74, IW, 24, 'FD')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(...GREY)
  pdf.text('AMOUNT PAID', M + 4, 82)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.setTextColor(...GREEN)
  pdf.text(fmt(amount), M + IW - 4, 82, { align: 'right' })

  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(8.5)
  pdf.setTextColor(...GREY)
  const words = amountInWords(amount)
  const wordLines = pdf.splitTextToSize(words, IW - 8)
  wordLines.forEach((line, i) => {
    pdf.text(line, M + 4, 89 + i * 4.5)
  })

  // ── Details table ─────────────────────────────────────────────────────────
  let y = 104
  const rows = [
    ['Paid To',       payee],
    ['Purpose',       purpose],
    ['Category',      capitalize(category)],
    ['Payment Mode',  capitalize(paymentMode)],
    ...(bankRef ? [['Bank / Ref No', bankRef]] : []),
  ]

  const COL1 = 38
  rows.forEach(([label, value], idx) => {
    const bg = idx % 2 === 0 ? [252, 252, 252] : [255, 255, 255]
    pdf.setFillColor(...bg)
    pdf.rect(M, y, IW, 10, 'FD')

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(...GREY)
    pdf.text(label, M + 4, y + 6.5)

    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...BLACK)
    const valLines = pdf.splitTextToSize(String(value || '—'), IW - COL1 - 4)
    valLines.forEach((l, li) => {
      if (li === 0) {
        pdf.text(l, M + COL1, y + 6.5)
      } else {
        y += 5
        pdf.rect(M, y, IW, 5, 'FD')
        pdf.text(l, M + COL1, y + 4)
      }
    })
    y += 10
  })

  // ── Divider ───────────────────────────────────────────────────────────────
  y += 6
  pdf.setDrawColor(...LGREY)
  pdf.setLineWidth(0.3)
  pdf.line(M, y, M + IW, y)

  // ── Signatory section ─────────────────────────────────────────────────────
  y += 16
  const sigW = (IW - 16) / 3

  const sigBoxes = [
    { label: 'Prepared By',  x: M },
    { label: 'Approved By',  x: M + sigW + 8 },
    { label: 'Received By',  x: M + (sigW + 8) * 2 },
  ]

  sigBoxes.forEach(({ label, x }) => {
    pdf.setDrawColor(...LGREY)
    pdf.setLineWidth(0.3)
    pdf.rect(x, y - 10, sigW, 22, 'S')

    // signature line
    pdf.setDrawColor(...LGREY)
    pdf.line(x + 4, y + 5, x + sigW - 4, y + 5)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(...GREY)
    pdf.text(label, x + sigW / 2, y + 10, { align: 'center' })
  })

  y += 30

  // ── Footer divider + note ─────────────────────────────────────────────────
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.5)
  pdf.line(M - 2, 274, M + IW + 2, 274)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(...GREEN)
  pdf.text(
    'This is a computer-generated payment voucher.',
    W / 2, 278, { align: 'center' }
  )

  // ── Save ──────────────────────────────────────────────────────────────────
  pdf.save(`${voucherNumber}.pdf`)
}
