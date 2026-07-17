/**
 * docPDF.js — Nhance document PDF generator
 * Uses jsPDF + jspdf-autotable
 * Install: npm install jspdf jspdf-autotable
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'

// ── QR stamp — generated locally via npm qrcode (no external API needed) ─────
// payloadOrLines: verification URL string (preferred) OR array of fallback text
async function stampQR(pdf, payloadOrLines) {
  try {
    const payload = Array.isArray(payloadOrLines)
      ? payloadOrLines.filter(Boolean).join(' | ')
      : payloadOrLines
    const dataUrl = await QRCode.toDataURL(payload, { width: 180, margin: 1, errorCorrectionLevel: 'M' })
    if (!dataUrl) return
    pdf.setPage(1)
    // x=178 y=12 → 18×18 mm at top-right corner (W=210, MR=12, MT=10)
    pdf.addImage(dataUrl, 'PNG', 178, 12, 18, 18)
  } catch { /* silently skip — PDF still saves without QR */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
}

// Indian state codes from GSTIN prefix
const STATE_CODES = {
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','25':'Daman & Diu','26':'Dadra & Nagar Haveli','27':'Maharashtra',
  '28':'Andhra Pradesh (Old)','29':'Karnataka','30':'Goa','31':'Lakshadweep',
  '32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman & Nicobar',
  '36':'Telangana','37':'Andhra Pradesh','38':'Ladakh','97':'Other Territory',
}

function getStateFromGSTIN(gstin) {
  if (!gstin || gstin.length < 2) return null
  const code = gstin.substring(0, 2)
  const name = STATE_CODES[code]
  return name ? `${name} (${code})` : null
}

// Indian number to words
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
              'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
              'Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function convertNum(n) {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n/10)] + (n%10 ? ' '+ONES[n%10] : '')
  if (n < 1000) return ONES[Math.floor(n/100)]+' Hundred'+(n%100?' '+convertNum(n%100):'')
  if (n < 100000) return convertNum(Math.floor(n/1000))+' Thousand'+(n%1000?' '+convertNum(n%1000):'')
  if (n < 10000000) return convertNum(Math.floor(n/100000))+' Lakh'+(n%100000?' '+convertNum(n%100000):'')
  return convertNum(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+convertNum(n%10000000):'')
}

function numToWords(amount) {
  const n = Math.floor(Number(amount || 0))
  if (n === 0) return 'Indian Rupee Zero Only'
  return 'Indian Rupee ' + convertNum(n) + ' Only'
}

// ── Core PDF Builder ──────────────────────────────────────────────────────────
/**
 * @param {Object} opts
 * @param {Object} opts.company        - { name, address, gstin, contact_phone, contact_email }
 * @param {string} opts.docTitle       - 'TAX INVOICE' | 'PURCHASE ORDER' | etc.
 * @param {string} opts.docNumber      - Document number
 * @param {string} opts.docDate        - ISO date string
 * @param {string} [opts.terms]        - Terms string
 * @param {string} [opts.dueDate]      - Due date ISO string
 * @param {string} [opts.placeOfSupply]
 * @param {string} opts.partyLabel     - 'Bill To' | 'Vendor' | 'Ship To'
 * @param {string} opts.partyName
 * @param {string} [opts.partyAddress]
 * @param {string} [opts.partyGstin]
 * @param {Array}  opts.lineItems      - [{ description, hsn_sac, quantity, unit, rate, amount }]
 * @param {number} opts.subtotal
 * @param {number} [opts.discountAmount]
 * @param {number} [opts.taxableAmount]
 * @param {number} [opts.cgst_rate] [opts.cgst_amount]
 * @param {number} [opts.sgst_rate] [opts.sgst_amount]
 * @param {number} [opts.igst_rate] [opts.igst_amount]
 * @param {number} opts.total
 * @param {number} [opts.paidAmount]
 * @param {number} [opts.balanceDue]
 * @param {string} [opts.notes]
 * @param {Array}  [opts.extraMetaLeft]  - [['Label','Value']] extra rows in meta box left
 * @param {boolean}[opts.noTotals]     - skip totals section (for DC)
 * @param {boolean}[opts.noLineItems]  - skip table (for payment receipts)
 * @param {string} [opts.bodyText]     - free text below party (for payment receipts)
 */
function buildDocPDF(opts) {
  const {
    company, docTitle, docNumber, docDate, terms, termsLabel = 'Terms', dueDate, placeOfSupply,
    partyLabel = 'Bill To', partyName, partyAddress, partyGstin, partyPhone,
    lineItems = [], subtotal = 0, discountAmount = 0, taxableAmount,
    cgst_rate, cgst_amount = 0, sgst_rate, sgst_amount = 0,
    igst_rate, igst_amount = 0, total = 0, paidAmount = 0, balanceDue,
    notes, extraMetaLeft = [], noTotals = false, bodyText,
  } = opts

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const W = 210
  const ML = 12, MR = 12, MT = 10

  // ── 1. HEADER ──────────────────────────────────────────────────────────────
  let y = MT

  // Pre-compute company text dimensions for tight-fit header
  pdf.setFont('helvetica','bold')
  pdf.setFontSize(13)
  const coName = (company?.name || 'Your Company').toUpperCase()
  const coNameLines = pdf.splitTextToSize(coName, 110)

  pdf.setFont('helvetica','normal')
  pdf.setFontSize(7.5)
  const coDetails = [
    company?.address,
    company?.gstin ? `GSTIN ${company.gstin}` : null,
    company?.contact_phone,
    company?.contact_email,
  ].filter(Boolean)

  const textH = 8 + coNameLines.length * 6 + 1 + coDetails.length * 4.5 + 4
  // QR sits at y+2..y+20 (18mm), title below at y+26 → needs ~34mm
  const headerH = Math.max(textH, 36)

  // outer rect
  pdf.setDrawColor(180)
  pdf.setLineWidth(0.3)
  pdf.rect(ML, y, W-ML-MR, headerH)

  // Company name
  pdf.setFont('helvetica','bold')
  pdf.setFontSize(13)
  pdf.setTextColor(15,15,15)
  coNameLines.forEach((line, i) => pdf.text(line, ML+3, y+8+i*6))

  // Company details (smaller)
  pdf.setFont('helvetica','normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(60,60,60)
  const detailStart = y + 8 + coNameLines.length * 6 + 1
  coDetails.forEach((line, i) => {
    const wrapped = pdf.splitTextToSize(line, 110)
    wrapped.forEach((wl, wi) => pdf.text(wl, ML+3, detailStart + i*4.5 + wi*4))
  })

  // Document title — right-aligned, below the QR code (QR occupies y+2..y+20)
  pdf.setFont('helvetica','bold')
  pdf.setFontSize(11)
  pdf.setTextColor(30,30,30)
  pdf.text(docTitle, W-MR-3, y+28, { align:'right' })

  y += headerH + 2

  // ── 2. META INFO ROW ────────────────────────────────────────────────────────
  const metaH = Math.max(24, 6 + (extraMetaLeft.length + 4) * 5)
  pdf.setDrawColor(180)
  pdf.setLineWidth(0.3)
  pdf.rect(ML, y, W-ML-MR, metaH)

  // Vertical divider
  const divX = ML + 90
  pdf.line(divX, y, divX, y+metaH)

  pdf.setFont('helvetica','normal')
  pdf.setFontSize(8)
  pdf.setTextColor(80,80,80)

  const labelX = ML+3
  const valX   = ML+38

  const metaRows = [
    [`${docTitle.includes('BILL') ? 'Bill' : docTitle.includes('QUOTE') || docTitle.includes('QUOTATION') ? 'Quote' : docTitle.includes('ORDER') ? 'Order' : docTitle.includes('CHALLAN') ? 'Challan' : docTitle.includes('CREDIT') ? 'Credit Note' : 'Invoice'} No.#`, docNumber],
    [`${docTitle.includes('CHALLAN') ? 'Challan' : docTitle.includes('ORDER') ? 'Order' : docTitle.includes('BILL') ? 'Bill' : 'Invoice'} Date`, fmtDate(docDate)],
    ...(terms ? [[termsLabel, terms]] : []),
    ...(dueDate ? [['Due Date', fmtDate(dueDate)]] : []),
    ...extraMetaLeft,
  ]

  metaRows.forEach(([lbl, val], i) => {
    pdf.setFont('helvetica','normal')
    pdf.setTextColor(80,80,80)
    pdf.text(lbl, labelX, y+6+i*5)
    pdf.setFont('helvetica','bold')
    pdf.setTextColor(20,20,20)
    // constrain value to left meta column (labelX → divX), never bleeds into right column
    const metaValW = divX - valX - 2
    const valLines = pdf.splitTextToSize(String(val || '—'), metaValW)
    pdf.text(valLines[0], valX, y+6+i*5)
  })

  if (placeOfSupply) {
    pdf.setFont('helvetica','normal')
    pdf.setTextColor(80,80,80)
    pdf.text('Place Of Supply', divX+3, y+6)
    pdf.setFont('helvetica','bold')
    pdf.setTextColor(20,20,20)
    // constrain to right meta column width
    const posW = W - MR - divX - 6
    const posLines = pdf.splitTextToSize(placeOfSupply, posW)
    pdf.text(posLines[0], divX+3, y+11)
  }

  y += metaH + 2

  // ── 3. PARTY SECTION ────────────────────────────────────────────────────────
  // Pre-compute dimensions for dynamic height
  pdf.setFont('helvetica','bold')
  pdf.setFontSize(9.5)
  const partyNameLines = pdf.splitTextToSize(partyName || '—', W-ML-MR-6)

  pdf.setFont('helvetica','normal')
  pdf.setFontSize(7.5)
  const partyDetailItems = [
    partyAddress,
    partyPhone ? `Ph: ${partyPhone}` : null,
    partyGstin ? `GSTIN: ${partyGstin}` : null,
  ].filter(Boolean)
  let totalDetailH = 0
  const partyDetailWrapped = partyDetailItems.map(item => {
    const wrapped = pdf.splitTextToSize(item, W-ML-MR-6)
    totalDetailH += wrapped.length * 4
    return wrapped
  })

  const partyH = Math.max(22, 6 + Math.min(partyNameLines.length, 2) * 5 + 3 + totalDetailH + 4)

  pdf.setDrawColor(180)
  pdf.setLineWidth(0.3)
  pdf.rect(ML, y, W-ML-MR, partyH)
  pdf.setFillColor(240,242,245)
  pdf.rect(ML, y, W-ML-MR, 6, 'F')

  pdf.setFont('helvetica','bold')
  pdf.setFontSize(8)
  pdf.setTextColor(40,40,40)
  pdf.text(partyLabel, ML+3, y+4.2)

  pdf.setFont('helvetica','bold')
  pdf.setFontSize(9.5)
  pdf.setTextColor(10,10,10)
  partyNameLines.slice(0,2).forEach((l, i) => pdf.text(l, ML+3, y+11+i*5))

  pdf.setFont('helvetica','normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(80,80,80)
  let detailY = y + 11 + Math.min(partyNameLines.length, 2) * 5 + 1
  partyDetailWrapped.forEach(lines => {
    lines.forEach(l => { pdf.text(l, ML+3, detailY); detailY += 4 })
  })

  y += partyH + 2

  // Optional free-form body (for payment receipts etc.)
  if (bodyText) {
    pdf.setFont('helvetica','normal')
    pdf.setFontSize(9)
    pdf.setTextColor(30,30,30)
    const btLines = pdf.splitTextToSize(bodyText, W-ML-MR-6)
    btLines.forEach((l, i) => pdf.text(l, ML+3, y+6+i*5))
    y += btLines.length * 5 + 12
  }

  // ── 4. LINE ITEMS TABLE ──────────────────────────────────────────────────────
  if (lineItems.length > 0) {
    autoTable(pdf, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['#', 'Item & Description', 'HSN/SAC', 'Qty', 'Rate', 'Amount']],
      body: lineItems.map((l, i) => [
        i+1,
        l.description || '—',
        l.hsn_sac || '—',
        `${Number(l.quantity||0).toLocaleString('en-IN')} ${l.unit||''}`.trim(),
        fmtINR(l.rate),
        fmtINR(l.amount),
      ]),
      headStyles: {
        fillColor: [35,35,35],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 2.8,
      },
      bodyStyles: { fontSize: 8, cellPadding: 2.8, textColor: [25,25,25] },
      alternateRowStyles: { fillColor: [248,249,252] },
      columnStyles: {
        0: { cellWidth: 8,  halign: 'center' },
        1: { cellWidth: 88 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
      tableLineColor: [180,180,180],
      tableLineWidth: 0.3,
    })
    y = pdf.lastAutoTable.finalY + 4
  }

  // ── 5. TOTALS + FOOTER ───────────────────────────────────────────────────────
  if (!noTotals) {
    const totX  = ML + 98   // left edge of totals column
    const totW  = W-MR-totX // width of totals column

    // Words + Notes (left half)
    pdf.setFont('helvetica','bold')
    pdf.setFontSize(8)
    pdf.setTextColor(20,20,20)
    pdf.text('Total In Words', ML+2, y+5)

    pdf.setFont('helvetica','italic')
    pdf.setFontSize(8)
    pdf.setTextColor(40,40,40)
    const wordsText = numToWords(total)
    const wordsLines = pdf.splitTextToSize(wordsText, 88)
    wordsLines.forEach((l, i) => pdf.text(l, ML+2, y+10+i*4.5))

    let wordsEndY = y + 10 + wordsLines.length * 4.5 + 4

    if (notes) {
      pdf.setFont('helvetica','bold')
      pdf.setFontSize(7.5)
      pdf.setTextColor(60,60,60)
      pdf.text('Notes', ML+2, wordsEndY)
      pdf.setFont('helvetica','normal')
      pdf.setFontSize(7.5)
      const noteLines = pdf.splitTextToSize(notes, 88)
      noteLines.forEach((l, i) => pdf.text(l, ML+2, wordsEndY+4.5+i*4))
    }

    // Totals right column
    let ty = y
    const addTotRow = (label, val, bold = false, color = [30,30,30]) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal')
      pdf.setFontSize(bold ? 9 : 8.5)
      pdf.setTextColor(...color)
      pdf.text(label, totX, ty+5)
      pdf.text(val, W-MR-2, ty+5, { align:'right' })
      ty += bold ? 7 : 5.5
    }

    addTotRow('Sub Total', fmtINR(subtotal))

    if (discountAmount > 0)
      addTotRow('Discount', `(-) ${fmtINR(discountAmount)}`, false, [180,60,60])

    const taxBase = taxableAmount ?? subtotal - discountAmount
    if (discountAmount > 0)
      addTotRow('Taxable Amount', fmtINR(taxBase))

    if (cgst_amount > 0)
      addTotRow(`CGST @ ${cgst_rate || 0}%`, fmtINR(cgst_amount))
    if (sgst_amount > 0)
      addTotRow(`SGST @ ${sgst_rate || 0}%`, fmtINR(sgst_amount))
    if (igst_amount > 0)
      addTotRow(`IGST @ ${igst_rate || 0}%`, fmtINR(igst_amount))

    // Divider before Total
    pdf.setDrawColor(180)
    pdf.setLineWidth(0.3)
    pdf.line(totX, ty+1, W-MR, ty+1)
    ty += 2

    addTotRow('Total', `Rs.${fmtINR(total)}`, true)

    if (paidAmount > 0)
      addTotRow('Payment Made', `(-) ${fmtINR(paidAmount)}`, false, [180,60,60])

    // Balance Due (bold, larger)
    pdf.setFont('helvetica','bold')
    pdf.setFontSize(10)
    pdf.setTextColor(10,10,10)
    const bd = balanceDue ?? Math.max(0, total - paidAmount)
    pdf.text('Balance Due', totX, ty+6)
    pdf.text(`Rs.${fmtINR(bd)}`, W-MR-2, ty+6, { align:'right' })
    ty += 32

    // Signature line
    const sigLineY = Math.max(ty, wordsEndY + (notes ? 30 : 10))
    pdf.setDrawColor(120)
    pdf.setLineWidth(0.3)
    pdf.line(totX+2, sigLineY, W-MR-2, sigLineY)
    pdf.setFont('helvetica','normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(100,100,100)
    pdf.text('Authorized Signature', totX+2 + (totW-4)/2, sigLineY+4, { align:'center' })
  }

  return pdf
}

// ── Public download functions ─────────────────────────────────────────────────

export async function downloadInvoicePDF(invoice, lineItems, company, verifyUrl = null) {
  const pos = invoice.client_gstin
    ? getStateFromGSTIN(invoice.client_gstin)
    : getStateFromGSTIN(company?.gstin)
  const pdf = buildDocPDF({
    company,
    docTitle: invoice.is_tax_invoice !== false ? 'TAX INVOICE' : 'INVOICE',
    docNumber: invoice.invoice_number,
    docDate: invoice.invoice_date,
    terms: invoice.terms || 'Due on Receipt',
    dueDate: invoice.due_date,
    placeOfSupply: pos || 'Tamil Nadu (33)',
    partyLabel: 'Bill To',
    partyName: invoice.client_name,
    partyAddress: invoice.client_address,
    partyGstin: invoice.client_gstin,
    lineItems,
    subtotal: invoice.subtotal || 0,
    discountAmount: invoice.discount_amount || 0,
    taxableAmount: invoice.taxable_amount,
    cgst_rate: invoice.cgst_rate, cgst_amount: invoice.cgst_amount || 0,
    sgst_rate: invoice.sgst_rate, sgst_amount: invoice.sgst_amount || 0,
    igst_rate: invoice.igst_rate, igst_amount: invoice.igst_amount || 0,
    total: invoice.total_amount || 0,
    paidAmount: invoice.paid_amount || 0,
    balanceDue: invoice.balance_due,
    notes: invoice.notes,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Tax Invoice`,
    `No: ${invoice.invoice_number}`, `Date: ${invoice.invoice_date || ''}`,
    `From: ${company?.name || ''} GSTIN:${company?.gstin || ''}`,
    `To: ${invoice.client_name || ''}`,
    `Amt: INR ${Number(invoice.total_amount || 0).toFixed(2)}`,
  ])
  pdf.save(`${invoice.invoice_number}.pdf`)
}

export async function downloadQuotePDF(quote, lineItems, company, verifyUrl = null) {
  const pdf = buildDocPDF({
    company,
    docTitle: quote.is_tax_invoice !== false ? 'TAX QUOTATION' : 'QUOTATION',
    docNumber: quote.quote_number,
    docDate: quote.quote_date,
    terms: 'Valid for 30 days',
    dueDate: quote.valid_until,
    partyLabel: 'Quoted To',
    partyName: quote.client_name,
    partyAddress: quote.client_address,
    partyGstin: quote.client_gstin,
    lineItems,
    subtotal: quote.subtotal || 0,
    discountAmount: quote.discount_amount || 0,
    taxableAmount: quote.taxable_amount,
    cgst_rate: quote.cgst_rate, cgst_amount: quote.cgst_amount || 0,
    sgst_rate: quote.sgst_rate, sgst_amount: quote.sgst_amount || 0,
    igst_rate: quote.igst_rate, igst_amount: quote.igst_amount || 0,
    total: quote.total_amount || 0,
    paidAmount: 0,
    balanceDue: quote.total_amount || 0,
    notes: quote.notes,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Quotation`,
    `No: ${quote.quote_number}`, `Date: ${quote.quote_date || ''}`,
    `From: ${company?.name || ''}`, `To: ${quote.client_name || ''}`,
    `Amt: INR ${Number(quote.total_amount || 0).toFixed(2)}`,
  ])
  pdf.save(`${quote.quote_number}.pdf`)
}

export async function downloadSOPDF(so, lineItems, company, verifyUrl = null) {
  const pdf = buildDocPDF({
    company,
    docTitle: 'SALES ORDER',
    docNumber: so.so_number,
    docDate: so.so_date,
    dueDate: so.expected_delivery,
    partyLabel: 'Customer',
    partyName: so.client_name,
    partyGstin: so.client_gstin,
    extraMetaLeft: so.project_name ? [['Project', so.project_name]] : [],
    lineItems,
    subtotal: so.subtotal || 0,
    discountAmount: so.discount_amount || 0,
    taxableAmount: so.taxable_amount,
    cgst_rate: so.cgst_rate, cgst_amount: so.cgst_amount || 0,
    sgst_rate: so.sgst_rate, sgst_amount: so.sgst_amount || 0,
    igst_rate: so.igst_rate, igst_amount: so.igst_amount || 0,
    total: so.total_amount || 0,
    paidAmount: 0,
    balanceDue: so.total_amount || 0,
    notes: so.notes,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Sales Order`,
    `No: ${so.so_number}`, `Date: ${so.so_date || ''}`,
    `From: ${company?.name || ''}`, `To: ${so.client_name || ''}`,
    `Amt: INR ${Number(so.total_amount || 0).toFixed(2)}`,
  ])
  pdf.save(`${so.so_number}.pdf`)
}

export async function downloadDCPDF(dc, lineItems, company, verifyUrl = null) {
  const dcTotal = lineItems.reduce((s, l) => s + (Number(l.amount)||0), 0)
  const pdf = buildDocPDF({
    company,
    docTitle: 'DELIVERY CHALLAN',
    docNumber: dc.dc_number,
    docDate: dc.dc_date,
    partyLabel: 'Deliver To',
    partyName: dc.client_name,
    partyAddress: dc.delivery_address,
    extraMetaLeft: [
      ...(dc.vehicle_number ? [['Vehicle No.', dc.vehicle_number]] : []),
      ...(dc.driver_name ? [['Driver', dc.driver_name]] : []),
    ],
    lineItems,
    subtotal: dcTotal,
    total: dcTotal,
    paidAmount: 0,
    balanceDue: 0,
    notes: dc.notes,
    noTotals: false,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Delivery Challan`,
    `No: ${dc.dc_number}`, `Date: ${dc.dc_date || ''}`,
    `From: ${company?.name || ''}`, `To: ${dc.client_name || ''}`,
    dc.vehicle_number ? `Vehicle: ${dc.vehicle_number}` : null,
  ])
  pdf.save(`${dc.dc_number}.pdf`)
}

export async function downloadCNPDF(cn, lineItems, company, verifyUrl = null) {
  const pdf = buildDocPDF({
    company,
    docTitle: 'CREDIT NOTE',
    docNumber: cn.cn_number,
    docDate: cn.cn_date,
    partyLabel: 'Issued To',
    partyName: cn.client_name,
    partyGstin: cn.client_gstin,
    extraMetaLeft: cn.reason ? [['Reason', cn.reason]] : [],
    lineItems,
    subtotal: cn.subtotal || 0,
    cgst_rate: cn.cgst_rate, cgst_amount: cn.cgst_amount || 0,
    sgst_rate: cn.sgst_rate, sgst_amount: cn.sgst_amount || 0,
    igst_rate: cn.igst_rate, igst_amount: cn.igst_amount || 0,
    total: cn.total_amount || 0,
    paidAmount: 0,
    balanceDue: cn.total_amount || 0,
    notes: cn.notes,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Credit Note`,
    `No: ${cn.cn_number}`, `Date: ${cn.cn_date || ''}`,
    `From: ${company?.name || ''}`, `To: ${cn.client_name || ''}`,
    `Amt: INR ${Number(cn.total_amount || 0).toFixed(2)}`,
  ])
  pdf.save(`${cn.cn_number}.pdf`)
}

export async function downloadBillPDF(bill, lineItems, company, verifyUrl = null) {
  const pdf = buildDocPDF({
    company,
    docTitle: bill.is_tax_invoice !== false ? 'PURCHASE BILL' : 'BILL',
    docNumber: bill.bill_number,
    docDate: bill.bill_date,
    terms: bill.bill_ref || undefined,
    termsLabel: 'Vendor Invoice No.',
    dueDate: bill.due_date,
    partyLabel: 'Vendor',
    partyName: bill.vendor_name,
    partyAddress: bill.vendor_address || null,
    partyPhone: bill.vendor_phone || null,
    partyGstin: bill.vendor_gstin,
    lineItems,
    subtotal: bill.subtotal || 0,
    discountAmount: bill.discount_amount || 0,
    taxableAmount: bill.taxable_amount,
    cgst_rate: bill.cgst_rate, cgst_amount: bill.cgst_amount || 0,
    sgst_rate: bill.sgst_rate, sgst_amount: bill.sgst_amount || 0,
    igst_rate: bill.igst_rate, igst_amount: bill.igst_amount || 0,
    total: bill.total_amount || 0,
    paidAmount: bill.paid_amount || 0,
    balanceDue: bill.balance_due,
    notes: bill.notes,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Purchase Bill`,
    `No: ${bill.bill_number}`, `Date: ${bill.bill_date || ''}`,
    `Co: ${company?.name || ''}`, `Vendor: ${bill.vendor_name || ''}`,
    `Amt: INR ${Number(bill.total_amount || 0).toFixed(2)}`,
  ])
  pdf.save(`${bill.bill_number}.pdf`)
}

export async function downloadPOPDF(po, lineItems, company, verifyUrl = null) {
  const pdf = buildDocPDF({
    company,
    docTitle: 'PURCHASE ORDER',
    docNumber: po.po_number,
    docDate: po.po_date,
    dueDate: po.expected_delivery,
    partyLabel: 'Vendor',
    partyName: po.vendor_name,
    partyGstin: po.vendor_gstin,
    lineItems,
    subtotal: po.subtotal || 0,
    discountAmount: po.discount_amount || 0,
    taxableAmount: po.taxable_amount,
    cgst_rate: po.cgst_rate, cgst_amount: po.cgst_amount || 0,
    sgst_rate: po.sgst_rate, sgst_amount: po.sgst_amount || 0,
    igst_rate: po.igst_rate, igst_amount: po.igst_amount || 0,
    total: po.total_amount || 0,
    paidAmount: 0,
    balanceDue: po.total_amount || 0,
    notes: po.notes,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Purchase Order`,
    `No: ${po.po_number}`, `Date: ${po.po_date || ''}`,
    `Co: ${company?.name || ''}`, `Vendor: ${po.vendor_name || ''}`,
    `Amt: INR ${Number(po.total_amount || 0).toFixed(2)}`,
  ])
  pdf.save(`${po.po_number}.pdf`)
}

export async function downloadVendorCreditPDF(vc, company, verifyUrl = null) {
  const pdf = buildDocPDF({
    company,
    docTitle: 'VENDOR CREDIT',
    docNumber: vc.vc_number || vc.id?.slice(0,8),
    docDate: vc.vc_date || vc.created_at,
    partyLabel: 'Vendor',
    partyName: vc.vendor_name,
    partyGstin: vc.vendor_gstin,
    extraMetaLeft: vc.reason ? [['Reason', vc.reason]] : [],
    lineItems: [],
    subtotal: vc.amount || 0,
    total: vc.amount || 0,
    paidAmount: 0,
    balanceDue: vc.amount || 0,
    bodyText: `Credit Amount: Rs.${fmtINR(vc.amount)}\nStatus: ${vc.status || 'open'}`,
    notes: vc.notes,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Vendor Credit`,
    `No: ${vc.vc_number || vc.id?.slice(0,8) || ''}`,
    `Co: ${company?.name || ''}`, `Vendor: ${vc.vendor_name || ''}`,
    `Amt: INR ${Number(vc.amount || 0).toFixed(2)}`,
  ])
  pdf.save(`VC-${(vc.vc_number||vc.id?.slice(0,8))}.pdf`)
}

export async function downloadPaymentReceivedPDF(p, company, verifyUrl = null) {
  const pdf = buildDocPDF({
    company,
    docTitle: 'PAYMENT RECEIPT',
    docNumber: p.payment_number,
    docDate: p.payment_date,
    partyLabel: 'Received From',
    partyName: p.client_name,
    extraMetaLeft: [
      ['Mode', (p.payment_mode||'').toUpperCase()],
      ...(p.bank_reference ? [['Reference', p.bank_reference]] : []),
    ],
    lineItems: [],
    subtotal: p.amount || 0,
    total: p.amount || 0,
    paidAmount: 0,
    balanceDue: 0,
    bodyText: `Payment of Rs.${fmtINR(p.amount)} received via ${(p.payment_mode||'').toUpperCase()}${p.bank_reference ? ` (Ref: ${p.bank_reference})` : ''}.`,
    notes: p.notes,
    noTotals: false,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Payment Receipt`,
    `No: ${p.payment_number}`, `Date: ${p.payment_date || ''}`,
    `Co: ${company?.name || ''}`, `From: ${p.client_name || ''}`,
    `Amt: INR ${Number(p.amount || 0).toFixed(2)}`,
  ])
  pdf.save(`${p.payment_number}.pdf`)
}

export async function downloadPaymentMadePDF(p, company, verifyUrl = null) {
  const pdf = buildDocPDF({
    company,
    docTitle: 'PAYMENT VOUCHER',
    docNumber: p.payment_number,
    docDate: p.payment_date,
    partyLabel: 'Paid To',
    partyName: p.vendor_name,
    extraMetaLeft: [
      ['Mode', (p.payment_mode||'').toUpperCase()],
      ...(p.bank_reference ? [['Reference', p.bank_reference]] : []),
    ],
    lineItems: [],
    subtotal: p.amount || 0,
    total: p.amount || 0,
    paidAmount: 0,
    balanceDue: 0,
    bodyText: `Payment of Rs.${fmtINR(p.amount)} made via ${(p.payment_mode||'').toUpperCase()}${p.bank_reference ? ` (Ref: ${p.bank_reference})` : ''}.`,
    notes: p.notes,
    noTotals: false,
  })
  await stampQR(pdf, verifyUrl || [
    'NHANCE DOCUMENT', `Type: Payment Voucher`,
    `No: ${p.payment_number}`, `Date: ${p.payment_date || ''}`,
    `Co: ${company?.name || ''}`, `To: ${p.vendor_name || ''}`,
    `Amt: INR ${Number(p.amount || 0).toFixed(2)}`,
  ])
  pdf.save(`${p.payment_number}.pdf`)
}
