import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.project-receivables-browser-'))
const artifacts = resolve(process.env.PROJECT_RECEIVABLES_ARTIFACT_DIR || 'test-artifacts/project-receivables')
await mkdir(artifacts, { recursive: true })
const date = offset => {
  const day = new Date()
  day.setDate(day.getDate() + offset)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}
const projects = ['active', 'completed', 'on_hold', 'closed', 'mobilization', 'tender'].map((status, index) => ({
  id: `p${index}`, company_id: 'company', project_name: `${status} project`, project_code: `PRJ-${index}`,
  status, is_active: true, created_at: `2026-01-0${index + 1}`, clients: { business_name: 'Example Client' },
}))
projects.push({ ...projects[0], id: 'foreign', company_id: 'foreign', project_name: 'Foreign project' })
const invoice = (id, extra = {}) => ({
  id, company_id: 'company', project_id: 'p0', invoice_number: id, invoice_type: 'tax_invoice',
  status: 'sent', total_amount: 100, paid_amount: 0, due_date: date(-1), ...extra,
})
const invoices = [
  invoice('partial', { status: 'partial', total_amount: 600.50, paid_amount: 40.25, balance_due: 0 }),
  invoice('not-due', { total_amount: 50, due_date: date(2) }),
  invoice('due-today', { total_amount: 10, due_date: date(0) }),
  invoice('no-date', { total_amount: 20, due_date: null }),
  invoice('paid', { total_amount: 100, paid_amount: 100, balance_due: 999 }),
  invoice('overpaid', { paid_amount: 200 }),
  invoice('draft', { status: 'draft', total_amount: 9000 }),
  invoice('cancelled', { status: 'cancelled', total_amount: 9000 }),
  invoice('open-proforma', { invoice_type: 'proforma', total_amount: 40 }),
  invoice('converted-proforma', { invoice_type: 'proforma', status: 'converted', total_amount: 9000 }),
  invoice('linked-proforma', { invoice_type: 'proforma', total_amount: 9000 }),
  invoice('converted-tax', { total_amount: 9000, paid_amount: 9000, converted_from_id: 'linked-proforma' }),
  invoice('completed', { project_id: 'p1', total_amount: 123.45, due_date: date(3) }),
  invoice('hold', { project_id: 'p2', total_amount: 80 }),
  invoice('closed', { project_id: 'p3', total_amount: 60 }),
  invoice('legacy', { project_id: null, project_name: 'mobilization project', total_amount: 30 }),
  invoice('foreign', { company_id: 'foreign', project_id: 'foreign', total_amount: 777777 }),
  ...Array.from({ length: 1200 }, (_, index) => invoice(`history-${index}`, { total_amount: 1, paid_amount: 1 })),
]
await writeFile(join(temporary, 'supabase.js'), `
const tables = ${JSON.stringify({ projects, client_invoices: invoices, clients: [], project_documents: [] })};
window.reads=[]; window.recovered=false; window.delayInvoices=false;
export const supabase={from(table){let filters=[],start=0,end=Infinity;const q={
select(){return q},eq(key,value){filters.push([key,value]);return q},order(){return q},not(){return q},range(a,b){start=a;end=b;return q},
async then(done){window.reads.push({table,filters,start,end});
if(table==='client_invoices'&&location.search.includes('fail')&&!window.recovered)return done({error:{message:'Invoice permission denied'}});
if(table==='client_invoices'&&window.delayInvoices)await new Promise(r=>setTimeout(r,500));
const rows=(tables[table]||[]).filter(row=>filters.every(([key,value])=>row[key]===value)).sort((a,b)=>a.id.localeCompare(b.id));
return done({data:rows.slice(start,Math.min(end+1,start+200)),count:rows.length,error:null});
}};return q}};
`)
await writeFile(join(temporary, 'auth.js'), `export const useAuth=()=>({role:'admin',userProfile:{company_id:location.search.includes('foreign')?'foreign':'company'}});`)
await writeFile(join(temporary, 'display.js'), `export const useDisplayMode=()=>({isAdvanced:true});`)
await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary, 'main.jsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import ProjectsPage from ${JSON.stringify(join(root, 'src/pages/projects/ProjectsPage.jsx'))};
import ${JSON.stringify(join(root, 'src/index.css'))};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><div style={{height:'100vh'}}><ProjectsPage onNavigate={(page,args)=>{window.lastNavigation={page,args}}}/></div></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary, plugins: [react(), {
  name: 'mock-project-receivables', enforce: 'pre', resolveId(source) {
    if (/\/supabase(\.js)?$/.test(source)) return join(temporary, 'supabase.js')
    if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary, 'auth.js')
    if (/\/DisplayModeContext(\.jsx)?$/.test(source)) return join(temporary, 'display.js')
  },
}], css: { postcss: { plugins: [tailwindcss({ config: join(root, 'tailwind.config.js') }), autoprefixer()] } },
server: { host: '127.0.0.1', port: 4187, strictPort: true, fs: { allow: [root] } } })
let browser
try {
  await server.listen()
  if (process.env.PROJECT_RECEIVABLES_PREVIEW) {
    console.log('Project receivables preview: http://127.0.0.1:4187')
    await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve) })
  } else {
    browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {})
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4187')
    const card = name => page.getByRole('button', { name: new RegExp(`^${name} project`) })
    await card('active').getByText('₹640.25', { exact: true }).waitFor()
    assert.match(await card('active').innerText(), /Overdue\s+₹560.25/)
    assert.match(await card('completed').innerText(), /Outstanding\s+₹123.45\s+Overdue\s+₹0/)
    for (const [name, value] of [['on_hold', '80'], ['closed', '60'], ['mobilization', '30']]) {
      assert.match(await card(name).innerText(), new RegExp(`Overdue\\s+₹${value}`))
    }
    assert.doesNotMatch(await card('tender').innerText(), /Outstanding|Overdue/)
    assert.equal(await card('Foreign').count(), 0)
    const reads = await page.evaluate(() => window.reads.filter(r => r.table === 'client_invoices'))
    assert.ok(reads.length > 6, 'Invoice history beyond the API cap is loaded')
    assert.ok(reads.every(r => r.filters.some(([key, value]) => key === 'company_id' && value === 'company')))
    await page.getByRole('checkbox', { name: 'Include unconverted proforma invoices' }).check()
    assert.match(await card('active').innerText(), /Outstanding\s+₹680.25\s+Overdue\s+₹600.25/)
    await page.getByRole('checkbox', { name: 'Include unconverted proforma invoices' }).uncheck()
    await page.getByRole('button', { name: 'Active (1)', exact: true }).click()
    assert.equal(await card('completed').count(), 0)
    assert.match(await card('active').innerText(), /₹560.25/)
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.screenshot({ path: join(artifacts, 'projects-desktop.png'), fullPage: true })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await page.screenshot({ path: join(artifacts, 'projects-desktop-dark.png'), fullPage: true })
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
    await page.setViewportSize({ width: 390, height: 844 })
    await card('active').scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(artifacts, 'projects-mobile.png') })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.goto('http://127.0.0.1:4187?fail')
    await page.getByRole('alert').waitFor()
    assert.doesNotMatch(await card('active').innerText(), /Outstanding|Overdue/)
    await page.evaluate(() => { window.recovered = true })
    await page.getByRole('button', { name: 'Retry invoice amounts' }).click()
    await card('active').getByText('₹640.25', { exact: true }).waitFor()
    await page.goto('http://127.0.0.1:4187?foreign')
    await card('Foreign').getByText('₹7,77,777', { exact: true }).first().waitFor()
    assert.equal(await card('active').count(), 0)
    assert.deepEqual(errors, [])
    console.log('Project receivables browser checks passed: statuses, overdue dates, proformas, historical paging, tenant scope, retry, filters and mobile layout.')
  }
} finally {
  await browser?.close()
  await server.close()
  await rm(temporary, { recursive: true, force: true })
}
