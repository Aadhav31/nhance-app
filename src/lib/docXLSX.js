/**
 * docXLSX.js — Nhance document Excel generator
 * Uses SheetJS (xlsx)
 * Install: npm install xlsx
 */
import * as XLSX from 'xlsx'

const fmtINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
}

/**
 * Creates and downloads a single-doc xlsx (Invoice, Bill, PO, SO, DC, CN etc.)
 * Layout:
 *   Row 1-2 : Company header
 *   Row 3-4 : Document title + number/date
 *   Row 5-6 : Party info
 *   Row 8+  : Line items table (header + rows)
 *   After   : Totals block
 */
function buildDocXLSX(opts, filename) {
  const {
    company, docTitle, docNumber, docDate, terms, dueDate,
    partyLabel, partyName, partyAddress, partyGstin,
    lineItems = [], subtotal = 0, discountAmount = 0, taxableAmount,
    cgst_rate, cgst_amount = 0, sgst_rate, sgst_amount = 0,
    igst_rate, igst_amount = 0, total = 0, paidAmount = 0, balanceDue,
    notes, extraMeta = [],
  } = opts

  const rows = []

  // ── Header ──────────────────────────────────────────────────────────────────
  rows.push([company?.name || 'Company', '', '', '', '', docTitle])
  rows.push([company?.address || '', '', '', '', '', `No: ${docNumber}`])
  rows.push([company?.gstin ? `GSTIN: ${company.gstin}` : '', '', '', '', '', `Date: ${fmtDate(docDate)}`])
  rows.push([company?.contact_phone || '', '', '', '', '', terms ? `Terms: ${terms}` : ''])
  rows.push([company?.contact_email || '', '', '', '', '', dueDate ? `Due: ${fmtDate(dueDate)}` : ''])
  rows.push([])

  // Party
  rows.push([partyLabel || 'Bill To'])
  rows.push([partyName || ''])
  if (partyAddress) rows.push([partyAddress])
  if (partyGstin)   rows.push([`GSTIN: ${partyGstin}`])
  extraMeta.forEach(([k, v]) => rows.push([`${k}: ${v}`]))
  rows.push([])

  // Line items header
  rows.push(['#', 'Item & Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate (₹)', 'Amount (₹)'])
  lineItems.forEach((l, i) => {
    rows.push([
      i+1,
      l.description || '—',
      l.hsn_sac || '—',
      Number(l.quantity || 0),
      l.unit || '',
      Number(l.rate || 0),
      Number(l.amount || 0),
    ])
  })
  rows.push([])

  // Totals
  const taxBase = taxableAmount ?? (subtotal - discountAmount)
  rows.push(['', '', '', '', '', 'Sub Total', Number(subtotal)])
  if (discountAmount > 0)
    rows.push(['', '', '', '', '', 'Discount (-)', Number(discountAmount)])
  if (discountAmount > 0)
    rows.push(['', '', '', '', '', 'Taxable Amount', Number(taxBase)])
  if (cgst_amount > 0)
    rows.push(['', '', '', '', '', `CGST @ ${cgst_rate||0}%`, Number(cgst_amount)])
  if (sgst_amount > 0)
    rows.push(['', '', '', '', '', `SGST @ ${sgst_rate||0}%`, Number(sgst_amount)])
  if (igst_amount > 0)
    rows.push(['', '', '', '', '', `IGST @ ${igst_rate||0}%`, Number(igst_amount)])
  rows.push(['', '', '', '', '', 'TOTAL', Number(total)])
  if (paidAmount > 0)
    rows.push(['', '', '', '', '', 'Payment Made (-)', Number(paidAmount)])
  rows.push(['', '', '', '', '', 'Balance Due', Number(balanceDue ?? Math.max(0, total - paidAmount))])

  if (notes) {
    rows.push([])
    rows.push(['Notes:', notes])
  }

  // Build sheet
  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 5 },   // #
    { wch: 45 },  // description
    { wch: 14 },  // HSN
    { wch: 10 },  // qty
    { wch: 8 },   // unit
    { wch: 18 },  // rate / label
    { wch: 18 },  // amount / value
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, docTitle.slice(0,31))
  XLSX.writeFile(wb, filename)
}

// ── Public download functions ─────────────────────────────────────────────────

export function downloadInvoiceXLSX(invoice, lineItems, company) {
  buildDocXLSX({
    company,
    docTitle: invoice.is_tax_invoice !== false ? 'TAX INVOICE' : 'INVOICE',
    docNumber: invoice.invoice_number,
    docDate: invoice.invoice_date,
    terms: invoice.terms || 'Due on Receipt',
    dueDate: invoice.due_date,
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
  }, `${invoice.invoice_number}.xlsx`)
}

export function downloadQuoteXLSX(quote, lineItems, company) {
  buildDocXLSX({
    company,
    docTitle: 'QUOTATION',
    docNumber: quote.quote_number,
    docDate: quote.quote_date,
    partyLabel: 'Quoted To',
    partyName: quote.client_name,
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
  }, `${quote.quote_number}.xlsx`)
}

export function downloadSOXLSX(so, lineItems, company) {
  buildDocXLSX({
    company,
    docTitle: 'SALES ORDER',
    docNumber: so.so_number,
    docDate: so.so_date,
    dueDate: so.expected_delivery,
    partyLabel: 'Customer',
    partyName: so.client_name,
    partyGstin: so.client_gstin,
    extraMeta: so.project_name ? [['Project', so.project_name]] : [],
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
  }, `${so.so_number}.xlsx`)
}

export function downloadDCXLSX(dc, lineItems, company) {
  buildDocXLSX({
    company,
    docTitle: 'DELIVERY CHALLAN',
    docNumber: dc.dc_number,
    docDate: dc.dc_date,
    partyLabel: 'Deliver To',
    partyName: dc.client_name,
    partyAddress: dc.delivery_address,
    extraMeta: [
      ...(dc.vehicle_number ? [['Vehicle No', dc.vehicle_number]] : []),
      ...(dc.driver_name    ? [['Driver', dc.driver_name]] : []),
    ],
    lineItems,
    subtotal: lineItems.reduce((s,l)=>s+(Number(l.amount)||0),0),
    total: lineItems.reduce((s,l)=>s+(Number(l.amount)||0),0),
    paidAmount: 0,
    balanceDue: 0,
    notes: dc.notes,
  }, `${dc.dc_number}.xlsx`)
}

export function downloadCNXLSX(cn, lineItems, company) {
  buildDocXLSX({
    company,
    docTitle: 'CREDIT NOTE',
    docNumber: cn.cn_number,
    docDate: cn.cn_date,
    partyLabel: 'Issued To',
    partyName: cn.client_name,
    partyGstin: cn.client_gstin,
    extraMeta: cn.reason ? [['Reason', cn.reason]] : [],
    lineItems,
    subtotal: cn.subtotal || 0,
    cgst_rate: cn.cgst_rate, cgst_amount: cn.cgst_amount || 0,
    sgst_rate: cn.sgst_rate, sgst_amount: cn.sgst_amount || 0,
    igst_rate: cn.igst_rate, igst_amount: cn.igst_amount || 0,
    total: cn.total_amount || 0,
    paidAmount: 0,
    balanceDue: cn.total_amount || 0,
    notes: cn.notes,
  }, `${cn.cn_number}.xlsx`)
}

export function downloadBillXLSX(bill, lineItems, company) {
  buildDocXLSX({
    company,
    docTitle: 'PURCHASE BILL',
    docNumber: bill.bill_number,
    docDate: bill.bill_date,
    terms: bill.bill_ref ? `Ref: ${bill.bill_ref}` : undefined,
    dueDate: bill.due_date,
    partyLabel: 'Vendor',
    partyName: bill.vendor_name,
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
  }, `${bill.bill_number}.xlsx`)
}

export function downloadPOXLSX(po, lineItems, company) {
  buildDocXLSX({
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
  }, `${po.po_number}.xlsx`)
}

export function downloadPaymentReceivedXLSX(p, company) {
  const rows = [
    [company?.name || ''],
    [company?.address || ''],
    [company?.gstin ? `GSTIN: ${company.gstin}` : ''],
    [],
    ['PAYMENT RECEIPT', '', '', `No: ${p.payment_number}`],
    ['Date', fmtDate(p.payment_date), '', `Mode: ${(p.payment_mode||'').toUpperCase()}`],
    ['Received From', p.client_name],
    ...(p.bank_reference ? [['Reference', p.bank_reference]] : []),
    [],
    ['Amount Received (₹)', Number(p.amount || 0)],
    [],
    ...(p.notes ? [['Notes', p.notes]] : []),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 25 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Payment Receipt')
  XLSX.writeFile(wb, `${p.payment_number}.xlsx`)
}

export function downloadPaymentMadeXLSX(p, company) {
  const rows = [
    [company?.name || ''],
    [company?.address || ''],
    [company?.gstin ? `GSTIN: ${company.gstin}` : ''],
    [],
    ['PAYMENT VOUCHER', '', '', `No: ${p.payment_number}`],
    ['Date', fmtDate(p.payment_date), '', `Mode: ${(p.payment_mode||'').toUpperCase()}`],
    ['Paid To', p.vendor_name],
    ...(p.bank_reference ? [['Reference', p.bank_reference]] : []),
    [],
    ['Amount Paid (₹)', Number(p.amount || 0)],
    [],
    ...(p.notes ? [['Notes', p.notes]] : []),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 25 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Payment Voucher')
  XLSX.writeFile(wb, `${p.payment_number}.xlsx`)
}

// ── Report table export (generic) ─────────────────────────────────────────────
/**
 * @param {string} reportName
 * @param {Array<{key:string,label:string}>} columns
 * @param {Array<Object>} data
 */
export function downloadReportXLSX(reportName, columns, data) {
  const header = columns.map(c => c.label)
  const rows   = data.map(row => columns.map(c => row[c.key] ?? ''))

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws['!cols'] = columns.map(() => ({ wch: 20 }))

  // Bold header row
  columns.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci })
    if (!ws[cellRef]) return
    ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D0D0D0' } } }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, reportName.slice(0,31))
  XLSX.writeFile(wb, `${reportName.replace(/\s+/g,'_')}.xlsx`)
}
