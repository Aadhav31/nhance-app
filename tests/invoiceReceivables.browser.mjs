import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.receivables-browser-'))
const artifacts = resolve(process.env.RECEIVABLES_ARTIFACT_DIR || 'test-artifacts')
await mkdir(artifacts, { recursive: true })
const invoices = [
  { id: 'i1', invoice_number: 'INV-OLD', client_name: 'Alpha', client_gstin: 'GST-A', project_id: 'p1', project_name: 'Metro', invoice_date: '2025-01-01', due_date: '2025-02-01', total_amount: 100.50, paid_amount: 20.25, status: 'partial', invoice_type: 'tax' },
  { id: 'i2', invoice_number: 'INV-NEW', client_name: 'Beta', client_gstin: 'GST-B', project_id: 'p2', project_name: 'Road', invoice_date: '2026-09-01', due_date: '2099-01-01', total_amount: 200, paid_amount: 0, status: 'sent', invoice_type: 'tax_invoice', converted_from_id: 'pf-linked' },
  { id: 'i3', invoice_number: 'INV-DRAFT', client_name: 'Alpha', total_amount: 9999, paid_amount: 0, status: 'draft' },
  { id: 'pf-open', invoice_number: 'PF-OPEN', client_name: 'Alpha', client_gstin: 'GST-A', project_id: 'p1', project_name: 'Metro', invoice_date: '2026-09-01', due_date: '2026-09-02', total_amount: 40, paid_amount: 5, status: 'sent', invoice_type: 'proforma' },
  { id: 'pf-linked', invoice_number: 'PF-LINKED', client_name: 'Beta', total_amount: 5000, status: 'sent', invoice_type: 'proforma' },
  { id: 'pf-converted', invoice_number: 'PF-CONVERTED', total_amount: 5000, status: 'converted', invoice_type: 'proforma' },
  { id: 'pf-draft', invoice_number: 'PF-DRAFT', total_amount: 5000, status: 'draft', invoice_type: 'proforma' },
]
await writeFile(join(temporary, 'supabase.js'), `const tables = ${JSON.stringify({ client_invoices: invoices, clients: [], projects: [] })};
export const supabase = { from(table) { return { select() { return { eq() { return { order() { return { async range(start, end) {
  if (window.location.search.includes('fail')) return { data: null, error: { message: 'Report permission denied' } };
  return { data: tables[table].slice(start, Math.min(end + 1, start + 2)), count: tables[table].length, error: null };
} }; } }; } }; } }; } };`)
await writeFile(join(temporary, 'auth.js'), `export const useAuth = () => ({ companyId: 'test-company', company: { name: 'Nhance Test Company' } });`)
await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary, 'main.jsx'), `import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsPage from ${JSON.stringify(join(root, 'src/pages/reports/ReportsPage.jsx'))};
import SalesPage from ${JSON.stringify(join(root, 'src/pages/sales/SalesPage.jsx'))};
import ${JSON.stringify(join(root, 'src/index.css'))};
document.body.style.background='var(--nh-app-bg, #faf6f7)';
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><div style={{height:'100vh'}}>{window.location.search.includes('sales') ? <SalesPage initialTab="invoices" /> : <ReportsPage initialReport="invoice_outstanding" onNavigate={(page, args) => { window.lastNavigation = {page, args}; }} />}</div></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary, plugins: [react(), { name: 'mock-report-data', enforce: 'pre',
  resolveId(source) { if (/\/supabase(\.js)?$/.test(source)) return join(temporary, 'supabase.js'); if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary, 'auth.js'); },
}],
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query', 'xlsx', 'jspdf', 'jspdf-autotable'] },
  css: { postcss: { plugins: [tailwindcss({ config: join(root, 'tailwind.config.js') }), autoprefixer()] } }, server: { host: '127.0.0.1', port: 4175, fs: { allow: [root] } },
})
let browser
try {
  await server.listen()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:4175')
  await page.getByRole('table').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Outstanding Receivables', exact: true }).count(), 1)
  assert.match(await page.getByRole('table').innerText(), /INV-OLD/)
  assert.doesNotMatch(await page.getByRole('table').innerText(), /INV-DRAFT/)
  assert.match(await page.getByRole('table').innerText(), /280.25/)
  const includeProforma = page.getByRole('checkbox', { name: 'Include unconverted proforma invoices', exact: true })
  assert.equal(await includeProforma.isChecked(), false)
  assert.doesNotMatch(await page.getByRole('table').innerText(), /PF-OPEN/)
  await page.getByRole('button', { name: 'INV-OLD', exact: true }).click()
  assert.deepEqual(await page.evaluate(() => window.lastNavigation), { page: 'sales', args: { tab: 'invoices', invoiceId: 'i1' } })
  await page.getByRole('button', { name: 'Client-wise', exact: true }).click()
  assert.match(await page.getByRole('table').innerText(), /280.25/)
  await page.getByRole('table').getByRole('button', { name: 'Alpha', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Invoice-wise', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.match(await page.getByRole('table').innerText(), /INV-OLD/)
  assert.doesNotMatch(await page.getByRole('table').innerText(), /INV-NEW/)
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await includeProforma.check()
  assert.match(await page.getByRole('table').innerText(), /PF-OPEN/)
  assert.match(await page.getByRole('table').innerText(), /Proforma/)
  assert.doesNotMatch(await page.getByRole('table').innerText(), /PF-LINKED|PF-CONVERTED|PF-DRAFT/)
  assert.match(await page.getByRole('table').innerText(), /315.25/)
  await page.screenshot({ path: join(artifacts, 'receivables-proforma-invoices.png'), fullPage: true })
  await page.getByRole('button', { name: 'Client-wise', exact: true }).click()
  assert.match(await page.getByRole('table').innerText(), /315.25/)
  await page.getByRole('button', { name: 'Project-wise', exact: true }).click()
  assert.match(await page.getByRole('table').innerText(), /315.25/)
  assert.match(await page.getByRole('table').innerText(), /Road/)
  for (const [label, extension] of [['Download PDF', 'pdf'], ['Download Excel', 'xlsx']]) {
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: label, exact: true }).click()
    const download = await downloadPromise
    assert.ok(download.suggestedFilename().endsWith('.' + extension))
    assert.equal(await download.failure(), null)
    await download.saveAs(join(artifacts, `browser-download.${extension}`))
    if (extension === 'xlsx') {
      const workbook = XLSX.read(await readFile(join(artifacts, `browser-download.${extension}`)), { type: 'buffer' })
      const values = XLSX.utils.sheet_to_json(workbook.Sheets['Invoice-wise'], { header: 1 })
      assert.ok(values.some(row => row[0] === 'PF-OPEN'))
      assert.equal(values.at(-1)[values[5].indexOf('Outstanding (INR)')], 315.25)
      assert.match(workbook.Sheets.Summary.B9.v, /unconverted proformas/)
    }
    assert.equal(await page.getByRole('button', { name: 'Project-wise', exact: true }).getAttribute('aria-pressed'), 'true')
  }
  await page.screenshot({ path: join(artifacts, 'receivables-desktop.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: join(artifacts, 'receivables-desktop-dark.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
  await page.getByLabel('Payment status', { exact: true }).selectOption('overdue')
  assert.doesNotMatch(await page.getByRole('table').innerText(), /Road/)
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  assert.equal(await includeProforma.isChecked(), false)
  assert.match(await page.getByRole('table').innerText(), /280.25/)
  await page.getByLabel('Invoice date from', { exact: true }).fill('2026-09-30')
  await page.getByLabel('Invoice date to', { exact: true }).fill('2026-09-01')
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Download PDF', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(artifacts, 'receivables-mobile.png'), fullPage: true })
  await page.goto('http://127.0.0.1:4175/?fail')
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').innerText(), /permission denied/)
  assert.equal(await page.getByRole('button', { name: 'Retry', exact: true }).count(), 1)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://127.0.0.1:4175/?sales')
  const salesTotals = page.getByRole('group', { name: 'Company invoice totals', exact: true })
  await salesTotals.getByText('₹315.25', { exact: true }).waitFor()
  assert.match(await salesTotals.innerText(), /Collected\s*₹25.25/)
  assert.match(await salesTotals.innerText(), /Pending\s*₹315.25/)
  assert.equal(await page.getByText('PF-LINKED', { exact: true }).count(), 0)
  await page.getByPlaceholder('Search client or #…', { exact: true }).fill('INV-OLD')
  assert.match(await salesTotals.innerText(), /315.25/)
  assert.match(await page.getByText('Company totals before filters:', { exact: false }).innerText(), /unconverted proformas/)
  await page.getByPlaceholder('Search client or #…', { exact: true }).fill('')
  await page.screenshot({ path: join(artifacts, 'sales-invoice-overview.png'), fullPage: true })
  await page.goto('http://127.0.0.1:4175/?sales&fail')
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').innerText(), /permission denied/)
  assert.doesNotMatch(await page.getByRole('group', { name: 'Company invoice totals', exact: true }).innerText(), /₹0/)
  assert.deepEqual(errors, [])
  console.log('Browser checks passed: reconciled Sales/report totals, complete capped queries, proforma inclusion, conversion deduplication, grouped totals, invoice drill-down, filters, downloads, mobile and query error states.')
} finally {
  await browser?.close()
  await server.close()
  await rm(temporary, { recursive: true, force: true })
}
