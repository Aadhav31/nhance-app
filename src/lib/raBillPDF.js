/**
 * raBillPDF.js — Running Account Bill PDF Generator
 *
 * Standard Indian Running Account Bill format:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │              RUNNING ACCOUNT BILL                       │
 *  │  [Company Name & Address]          [RA Bill No / Date]  │
 *  │  GSTIN: xxxx                       [BOQ / Contract No]  │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  To: [Client Name & Address]       Period: From → To    │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  MEASUREMENT ABSTRACT OF WORK DONE                      │
 *  │  Sl | Description | Unit | BOQ Qty | Prev | Cur | Cum  │
 *  │                   | Rate | Cur Amount                   │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  BILL CALCULATION                                        │
 *  │  Value of Work Done ........ ₹xxx                       │
 *  │  + CGST / SGST / IGST ...... ₹xxx                       │
 *  │  Gross Amount .............. ₹xxx                       │
 *  │  Less: Deductions .......... ₹xxx                       │
 *  │  NET PAYABLE ............... ₹xxx                       │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Net Payable in Words                                    │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Cumulative Recoveries | Signature block                 │
 *  └─────────────────────────────────────────────────────────┘
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Helpers ───────────────────────────────────────────────────────────────────
const INR = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const QTY = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

function parseLocalDate(d) {
  if (!d) return null
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return { y: Number(m[1]), mo: Number(m[2]), da: Number(m[3]) }
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return { y: dt.getFullYear(), mo: dt.getMonth() + 1, da: dt.getDate() }
}
const fmtDate = d => {
  const p = parseLocalDate(d)
  if (!p) return ''
  return `${String(p.da).padStart(2,'0')}/${String(p.mo).padStart(2,'0')}/${p.y}`
}

// ── Number to Words (Indian system) ──────────────────────────────────────────
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen',
  'Sixteen','Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function two(n) {
  if (n <= 0) return ''
  if (n < 20) return ONES[n]
  return (TENS[Math.floor(n/10)] + (n%10 ? ' '+ONES[n%10] : '')).trim()
}
function three(n) {
  if (n <= 0) return ''
  if (n < 100) return two(n)
  return ONES[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+two(n%100) : '')
}
function numToWords(amount) {
  if (!amount || isNaN(amount)) return 'Zero Rupees Only'
  amount = Math.abs(Number(amount))
  const rupees = Math.floor(amount)
  const paise  = Math.round((amount - rupees) * 100)
  let rem = rupees, parts = []
  if (rem >= 10000000) { parts.push(three(Math.floor(rem/10000000)) + ' Crore');    rem %= 10000000 }
  if (rem >= 100000)   { parts.push(two(Math.floor(rem/100000))     + ' Lakh');     rem %= 100000   }
  if (rem >= 1000)     { parts.push(two(Math.floor(rem/1000))       + ' Thousand'); rem %= 1000     }
  if (rem > 0)         { parts.push(three(rem)) }
  let out = 'Rupees ' + (parts.length ? parts.join(' ') : 'Zero')
  if (paise > 0) out += ' and ' + two(paise) + ' Paise'
  return out + ' Only'
}

// ── Logo loader ───────────────────────────────────────────────────────────────
async function loadLogo(url) {
  if (!url) return null
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width  = img.naturalWidth  || img.width
        c.height = img.naturalHeight || img.height
        c.getContext('2d').drawImage(img, 0, 0)
        resolve(c.toDataURL('image/png'))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = url.includes('?') ? url : url + '?t=' + Date.now()
  })
}

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  brand:   [15, 105, 195],   // primary blue
  dark:    [20,  24,  33],   // near-black
  mid:     [51,  65,  85],   // slate-700
  light:   [241, 245, 249],  // slate-100
  white:   [255, 255, 255],
  orange:  [234, 88,  12],   // deduction highlight
  green:   [5,   150, 105],  // net payable
  amber:   [180, 130, 20],
  text:    [30,  41,  59],   // slate-800
  muted:   [100, 116, 139],  // slate-500
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * @param {Object} params
 * @param {Object} params.ra        — ra_bills row (with .boq join)
 * @param {Array}  params.items     — ra_bill_items rows
 * @param {Object} params.company   — companies row (name, address, gstin, logo_url)
 * @param {Array}  params.boqBills  — other approved/paid ra_bills for same BOQ (for to-date totals)
 */
export async function generateRABillPDF({ ra, items = [], company = {}, boqBills = [] }) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW   = 210
  const PH   = 297
  const ML   = 12   // left margin
  const MR   = 12   // right margin
  const CW   = PW - ML - MR  // 186mm content width

  const boq    = ra.boq || {}
  const CLIENT = boq.client_name || ''

  // To-date totals
  const sdToDate  = boqBills.reduce((s, b) => s + Number(b.sd_amount || 0), 0)
  const mobToDate = boqBills.reduce((s, b) => s + Number(b.mob_advance_recovery || 0), 0)

  // Deduction breakdown
  const tax        = Number(ra.cgst_amount||0) + Number(ra.sgst_amount||0) + Number(ra.igst_amount||0)
  const deductions = Number(ra.mob_advance_recovery||0) + Number(ra.income_tax_amt||0) +
    Number(ra.labour_cess_amt||0) + Number(ra.sd_amount||0) +
    Number(ra.other_deductions||0) + Number(ra.retention_amt||0)

  // Load logo
  const logo = await loadLogo(company?.logo_url)

  let y = ML  // current Y cursor

  // ── HEADER BAND ─────────────────────────────────────────────────────────────
  // Background band
  doc.setFillColor(...C.brand)
  doc.rect(0, 0, PW, 14, 'F')

  // "RUNNING ACCOUNT BILL" title — centred in band
  doc.setTextColor(...C.white)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('RUNNING ACCOUNT BILL', PW / 2, 9, { align: 'center' })

  y = 18

  // ── COMPANY + BILL INFO BLOCK ────────────────────────────────────────────────
  // Logo (if available)
  if (logo) {
    try { doc.addImage(logo, 'PNG', ML, y, 18, 18) } catch {}
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...C.dark)
    doc.text(company?.name || 'Company', ML + 21, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.muted)
    if (company?.address) {
      const addrLines = doc.splitTextToSize(company.address, 80)
      doc.text(addrLines, ML + 21, y + 10)
    }
    if (company?.gstin)  doc.text('GSTIN: ' + company.gstin,  ML + 21, y + 22)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...C.dark)
    doc.text(company?.name || 'Company', ML, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.muted)
    if (company?.address) {
      const addrLines = doc.splitTextToSize(company.address, 90)
      doc.text(addrLines, ML, y + 10)
    }
    if (company?.gstin) doc.text('GSTIN: ' + company.gstin, ML, y + 22)
  }

  // Right column: bill details
  const RC = ML + CW   // right column right edge
  const RL = ML + CW * 0.57  // label start (right column)

  const billInfo = [
    ['RA Bill No.',    ra.ra_number || '—'],
    ['Bill Date',      fmtDate(ra.bill_date)],
    ['BOQ No.',        boq.boq_number || '—'],
    ['Contract No.',   boq.contract_number || boq.boq_number || '—'],
    ['Work Order No.', boq.work_order_number || '—'],
    ['Period',         ra.period_from ? `${fmtDate(ra.period_from)} to ${fmtDate(ra.period_to)}` : '—'],
  ]

  billInfo.forEach(([label, value], i) => {
    const ry = y + 2 + i * 5.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.muted)
    doc.text(label + ':', RL, ry)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(value, RL + 28, ry)
  })

  y += 32

  // ── SEPARATOR LINE ────────────────────────────────────────────────────────────
  doc.setDrawColor(...C.brand)
  doc.setLineWidth(0.5)
  doc.line(ML, y, ML + CW, y)
  y += 4

  // ── CLIENT + PROJECT BLOCK ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.muted)
  doc.text('TO:', ML, y + 4)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.text(CLIENT || 'Client', ML + 10, y + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.muted)
  if (boq.project_name) doc.text('Project: ' + boq.project_name, ML + 10, y + 9)

  y += 16

  doc.setDrawColor(...C.mid)
  doc.setLineWidth(0.2)
  doc.line(ML, y, ML + CW, y)
  y += 6

  // ── MEASUREMENT ABSTRACT TABLE ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.dark)
  doc.text('MEASUREMENT ABSTRACT OF WORK DONE', ML, y)
  y += 3

  const tableHead = [
    ['S.No', 'Description', 'Unit', 'BOQ\nQty', 'Prev\nQty', 'Cur\nQty', 'Cum\nQty', 'Rate\n(₹)', 'Cur Amount\n(₹)'],
  ]
  const tableBody = items.map((it, i) => [
    String(i + 1),
    it.description || '',
    it.unit || '',
    QTY(it.boq_item?.quantity || 0),
    QTY(it.previous_qty),
    QTY(it.current_qty),
    QTY(it.total_qty),
    INR(it.rate),
    INR(it.current_amount),
  ])
  // Total row
  tableBody.push([
    '', { content: 'TOTAL VALUE OF WORK DONE (This Bill)', styles: { fontStyle: 'bold', halign: 'right', colSpan: 7 } },
    '', '', '', '', '', '',
    { content: INR(ra.subtotal), styles: { fontStyle: 'bold', halign: 'right' } },
  ])

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    margin: { left: ML, right: MR },
    styles: {
      fontSize: 7,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      lineColor: C.mid,
      lineWidth: 0.15,
      textColor: C.text,
      font: 'helvetica',
    },
    headStyles: {
      fillColor: C.brand,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 9,  halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 17, halign: 'right' },
      4: { cellWidth: 17, halign: 'right' },
      5: { cellWidth: 17, halign: 'right' },
      6: { cellWidth: 17, halign: 'right' },
      7: { cellWidth: 20, halign: 'right' },
      8: { cellWidth: 22, halign: 'right' },
    },
    didParseCell(data) {
      // Style total row
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fillColor = C.light
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = C.dark
      }
    },
  })

  y = doc.lastAutoTable.finalY + 6

  // ── BILL CALCULATION ──────────────────────────────────────────────────────────
  // Check if we need a new page
  if (y + 80 > PH - 20) { doc.addPage(); y = 16 }

  // Two-column layout: left empty, right = calculation summary (60mm wide)
  const CALC_X  = ML + CW - 80   // start of calculation box (right-aligned, 80mm wide)
  const CALC_W  = 80
  const LW      = 52              // label column width
  const VW      = CALC_W - LW    // value column width

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.dark)
  doc.text('BILL CALCULATION', CALC_X, y)
  y += 1

  // Box background
  const calcRows = [
    { label: 'Value of Work Done (A)',     val: INR(ra.subtotal),      bold: false, color: null },
    ...(ra.cgst_amount > 0 ? [{ label: `Add: CGST @ ${ra.cgst_rate}%`, val: INR(ra.cgst_amount), bold: false, color: null }] : []),
    ...(ra.sgst_amount > 0 ? [{ label: `Add: SGST @ ${ra.sgst_rate}%`, val: INR(ra.sgst_amount), bold: false, color: null }] : []),
    ...(ra.igst_amount > 0 ? [{ label: `Add: IGST @ ${ra.igst_rate}%`, val: INR(ra.igst_amount), bold: false, color: null }] : []),
    { label: 'Gross Amount (incl. Tax) (B)', val: INR(ra.total_amount), bold: true,  color: C.dark, sep: true },
    ...(ra.mob_advance_recovery > 0  ? [{ label: `Less: Mob. Advance Recovery`,        val: '('+INR(ra.mob_advance_recovery)+')', bold: false, color: C.orange }] : []),
    ...(ra.income_tax_amt > 0        ? [{ label: `Less: TDS @ ${ra.income_tax_pct}%`,  val: '('+INR(ra.income_tax_amt)+')',       bold: false, color: C.orange }] : []),
    ...(ra.labour_cess_amt > 0       ? [{ label: `Less: Labour Cess @ ${ra.labour_cess_pct}%`, val: '('+INR(ra.labour_cess_amt)+')', bold: false, color: C.orange }] : []),
    ...(ra.sd_amount > 0             ? [{ label: 'Less: Security Deposit',             val: '('+INR(ra.sd_amount)+')',            bold: false, color: C.orange }] : []),
    ...(ra.retention_amt > 0         ? [{ label: `Less: Retention @ ${ra.retention_pct}%`, val: '('+INR(ra.retention_amt)+')',   bold: false, color: C.orange }] : []),
    ...(ra.other_deductions > 0      ? [{ label: `Less: ${ra.other_deductions_note || 'Other Deductions'}`, val: '('+INR(ra.other_deductions)+')', bold: false, color: C.orange }] : []),
    { label: 'NET PAYABLE',          val: INR(ra.net_payable), bold: true, color: C.green, big: true, sep: true },
  ]

  const ROW_H = 5
  const totalCalcH = calcRows.length * ROW_H + 8

  doc.setFillColor(...C.light)
  doc.rect(CALC_X, y + 2, CALC_W, totalCalcH, 'F')
  doc.setDrawColor(...C.mid)
  doc.setLineWidth(0.2)
  doc.rect(CALC_X, y + 2, CALC_W, totalCalcH, 'S')

  let cy = y + 7
  calcRows.forEach(row => {
    if (row.sep) {
      doc.setDrawColor(...C.mid)
      doc.setLineWidth(0.5)
      doc.line(CALC_X + 2, cy - 1.5, CALC_X + CALC_W - 2, cy - 1.5)
    }
    const [r, g, b] = row.color || C.text
    doc.setTextColor(r, g, b)
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.setFontSize(row.big ? 8.5 : 7.5)
    doc.text(row.label, CALC_X + 3, cy)
    doc.text(row.val, CALC_X + CALC_W - 3, cy, { align: 'right' })
    cy += ROW_H
  })

  y += totalCalcH + 10

  // ── AMOUNT IN WORDS ───────────────────────────────────────────────────────────
  if (y + 16 > PH - 20) { doc.addPage(); y = 16 }

  doc.setFillColor(240, 253, 244)
  doc.setDrawColor(...C.green)
  doc.setLineWidth(0.3)
  const wordsText = 'Net Payable (in words): ' + numToWords(ra.net_payable)
  const wordsLines = doc.splitTextToSize(wordsText, CW - 8)
  const wordsH = wordsLines.length * 4 + 6
  doc.rect(ML, y, CW, wordsH, 'FD')
  doc.setTextColor(...C.green)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  wordsLines.forEach((line, i) => {
    doc.text(line, ML + 4, y + 5 + i * 4)
  })
  y += wordsH + 6

  // ── CUMULATIVE RECOVERY SUMMARY ───────────────────────────────────────────────
  if (sdToDate > 0 || mobToDate > 0) {
    if (y + 24 > PH - 30) { doc.addPage(); y = 16 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text('CUMULATIVE RECOVERIES — THIS CONTRACT', ML, y)
    y += 3

    const recData = [
      sdToDate  > 0 ? ['Security Deposit Recovered to Date',   INR(sdToDate)]  : null,
      mobToDate > 0 ? ['Mob. Advance Recovered to Date',       INR(mobToDate)] : null,
    ].filter(Boolean)

    autoTable(doc, {
      startY: y,
      head: [['Recovery Type', 'Amount (₹)']],
      body: recData,
      theme: 'striped',
      margin: { left: ML, right: ML + CW * 0.5 },
      styles: { fontSize: 7.5, cellPadding: 2, textColor: C.text },
      headStyles: { fillColor: C.amber, textColor: C.white, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── SIGNATURE BLOCK ───────────────────────────────────────────────────────────
  if (y + 28 > PH - 16) { doc.addPage(); y = 16 }

  const sigCols = [ML, ML + CW / 2]
  const sigLabels = ['Prepared by', 'For ' + (company?.name || 'Company')]
  const sigSubs   = ['Signature & Date', 'Authorized Signatory']

  sigCols.forEach((sx, i) => {
    doc.setDrawColor(...C.mid)
    doc.setLineWidth(0.3)
    doc.line(sx, y + 18, sx + 70, y + 18)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.dark)
    doc.text(sigLabels[i], sx, y + 22)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    doc.text(sigSubs[i], sx, y + 27)
  })

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFillColor(...C.brand)
    doc.rect(0, PH - 10, PW, 10, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.white)
    doc.text(`${company?.name || ''} | ${ra.ra_number}`, ML, PH - 5)
    doc.text(`Page ${p} of ${pageCount}`, PW - MR, PH - 5, { align: 'right' })
  }

  // ── SAVE ──────────────────────────────────────────────────────────────────────
  doc.save(`${ra.ra_number || 'RA-Bill'}.pdf`)
}
