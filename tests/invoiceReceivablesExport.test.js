import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildInvoiceReceivables } from '../src/lib/invoiceReceivables.js'
import { createInvoiceReceivablesPDF, createInvoiceReceivablesWorkbook } from '../src/lib/invoiceReceivablesExport.js'

const rows = buildInvoiceReceivables(Array.from({ length: 140 }, (_, index) => ({
  id: `invoice-${index}`, invoice_number: `INV-${index}`, invoice_date: '2025-01-01', due_date: '2025-02-01',
  client_name: index % 2 ? 'Alpha Construction Limited' : 'Beta Construction Limited',
  client_gstin: index % 2 ? 'GST-A' : 'GST-B', project_id: `p${index % 3}`, project_name: `Metro Project ${index % 3}`,
  total_amount: '100.50', paid_amount: '20.25', status: 'partial', invoice_type: 'tax',
})), [], [], '2026-09-30')
const report = { rows, companyName: 'Nhance Test Company', reportDate: '2026-09-30', filterDescription: 'Outstanding invoices | All invoice dates', view: 'invoice' }

test('Excel contains every filtered invoice and numeric, reconciled totals in all views', async () => {
  const XLSX = await import('xlsx')
  const workbook = await createInvoiceReceivablesWorkbook(report)
  assert.deepEqual(workbook.SheetNames, ['Invoice-wise', 'Client-wise', 'Project-wise', 'Summary'])
  for (const name of workbook.SheetNames.slice(0, 3)) {
    const sheet = workbook.Sheets[name]
    const values = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const headings = values[5]
    const balanceColumn = headings.indexOf('Outstanding (INR)')
    const total = values.at(-1)
    assert.equal(total[balanceColumn], 11235)
    assert.equal(sheet[XLSX.utils.encode_cell({ r: values.length - 1, c: balanceColumn })].t, 'n')
  }
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['Invoice-wise'], { header: 1 }).length, 147)
  if (process.env.RECEIVABLES_ARTIFACT_DIR) {
    await mkdir(process.env.RECEIVABLES_ARTIFACT_DIR, { recursive: true })
    await writeFile(join(process.env.RECEIVABLES_ARTIFACT_DIR, 'invoice-receivables.xlsx'), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  }
})

test('PDF generates each view and paginates invoice details with final totals', async () => {
  for (const view of ['invoice', 'client', 'project']) {
    const pdf = await createInvoiceReceivablesPDF({ ...report, view })
    const content = pdf.output()
    assert.ok(content.startsWith('%PDF-'))
    assert.match(content, /11,235.00/)
    assert.match(content, /TOTAL/)
    if (view === 'invoice') assert.ok(pdf.getNumberOfPages() > 1)
    if (process.env.RECEIVABLES_ARTIFACT_DIR) {
      await mkdir(process.env.RECEIVABLES_ARTIFACT_DIR, { recursive: true })
      await writeFile(join(process.env.RECEIVABLES_ARTIFACT_DIR, `invoice-receivables-${view}.pdf`), Buffer.from(pdf.output('arraybuffer')))
    }
  }
})
