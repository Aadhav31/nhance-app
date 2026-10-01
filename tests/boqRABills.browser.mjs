import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.boq-ra-browser-'))
const artifacts = resolve(process.env.BOQ_RA_ARTIFACT_DIR || 'test-artifacts/boq-ra')
await mkdir(artifacts, { recursive: true })
const date = new Date().toISOString().slice(0, 10)
const boq = { id: 'boq1', company_id: 'company', boq_number: 'BOQ-DEMO-001', title: 'Demo Earthwork Contract',
  contract_number: 'WO-DEMO-001', client_name: 'Demo Construction Client', project_name: 'Demo Construction Site',
  status: 'active', total_value: 15000, executed_value: 3000, sd_pct: 5, mob_advance_pct: 10,
  it_applicable: true, it_pct: 2, labour_cess_applicable: true, labour_cess_pct: 1, created_at: date }
const other = { ...boq, id: 'boq2', boq_number: 'BOQ-DEMO-002', title: 'Other contract', it_pct: 0, labour_cess_pct: 0 }
const foreign = { ...boq, id: 'foreign', company_id: 'other-company', title: 'Foreign company contract' }
const item = { id: 'item1', boq_id: 'boq1', description: 'Excavation of ordinary soil', unit: 'm³', quantity: 100,
  rate: 150, amount: 15000, executed_qty: 20, sort_order: 0 }
const bill = { id: 'old-bill', company_id: 'company', boq_id: 'boq1', ra_number: 'RA-DEMO-OLD', bill_date: date,
  status: 'submitted', subtotal: 3000, total_amount: 3000, net_payable: 3000, created_at: date }
const tables = { boq_documents: [boq, other, foreign], boq_items: [item, { ...item, id: 'item2', boq_id: 'boq2' }],
  ra_bills: [bill], ra_bill_items: [], boq_sections: [], clients: [], projects: [] }
await writeFile(join(temporary, 'supabase.js'), `
const tables = ${JSON.stringify(tables)};
window.tables = tables; window.writes = []; window.reads = []; window.rpcs = []; let sequence = 1;
export const supabase = {
  from(table) {
    let predicates = [], filters = [], mode = 'read', payload, one = false, fields = '*';
    const q = {
      select(value='*') { fields = value; return q; },
      eq(key,value) { filters.push([key,value]); predicates.push(row => row[key] === value); return q; },
      neq(key,value) { predicates.push(row => row[key] !== value); return q; },
      in(key,values) { predicates.push(row => values.includes(row[key])); return q; },
      order() { return q; }, single() { one = true; return q; }, maybeSingle() { one = true; return q; },
      insert(value) { mode = 'insert'; payload = value; return q; },
      update(value) { mode = 'update'; payload = value; return q; }, delete() { mode = 'delete'; return q; },
      async then(done) {
        if (mode === 'read') window.reads.push({table,filters,fields});
        else window.writes.push({table,mode,filters,payload:structuredClone(payload)});
        await new Promise(resolve => setTimeout(resolve, window.readDelay || 20));
        if ((mode === 'insert' && table === 'ra_bills' && window.failHeader) ||
            (mode === 'insert' && table === 'ra_bill_items' && window.failLines) ||
            (mode === 'delete' && window.failDelete) ||
            (mode === 'read' && table === 'boq_documents' && fields !== '*' && window.failBoqRead) ||
            (mode === 'read' && table === 'boq_items' && window.failItemsRead)) {
          if (mode === 'insert' && table === 'ra_bills') window.failHeader = false;
          if (mode === 'insert' && table === 'ra_bill_items') window.failLines = false;
          if (mode === 'delete') window.failDelete = false;
          if (mode === 'read' && table === 'boq_documents') window.failBoqRead = false;
          if (mode === 'read' && table === 'boq_items') window.failItemsRead = false;
          return done({ data: null, error: { message: 'Simulated save or loading failure' } });
        }
        let rows = (tables[table] || []).filter(row => predicates.every(predicate => predicate(row)));
        if (mode === 'insert') {
          rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({id:crypto.randomUUID(),created_at:new Date().toISOString(),...structuredClone(row)}));
          (tables[table] ||= []).push(...rows);
        } else if (mode === 'delete') {
          tables[table] = tables[table].filter(row => !rows.includes(row));
          if (table === 'ra_bills') tables.ra_bill_items = tables.ra_bill_items.filter(line => !rows.some(row => row.id === line.ra_bill_id));
        } else if (mode === 'update') rows.forEach(row => Object.assign(row,payload));
        if ((mode === 'insert' && table === 'ra_bills' && window.failHeaderResponse) || (mode === 'insert' && table === 'ra_bill_items' && window.failLinesResponse)) {
          window.failHeaderResponse = window.failLinesResponse = false;
          return done({data:null,error:{message:'Response lost after save'}});
        }
        if (table === 'ra_bills' && fields.includes('boq:')) rows = rows.map(row => ({...row,boq:tables.boq_documents.find(boq => boq.id === row.boq_id)}));
        return done({ data: structuredClone(one ? rows[0] || null : rows), error: null });
      }
    }; return q;
  },
  async rpc(name,params) {
    window.rpcs.push({name,params});
    if (window.failSequence) { window.failSequence = false; return {data:null,error:{message:'Number generation failed'}}; }
    return {data:sequence++,error:null};
  }
};`)
await writeFile(join(temporary, 'auth.js'), `export const useAuth = () => ({ companyId:'company',
  role:new URLSearchParams(location.search).get('role') || 'admin', hasModule:() => !location.search.includes('module-off'),
  session:{user:{id:'actor',email:'demo@example.test'}}, company:{}, userProfile:{full_name:'Demo Admin'} });`)
await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary, 'main.jsx'), `import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {Toaster} from 'react-hot-toast';
import BOQPage from ${JSON.stringify(join(root, 'src/pages/boq/BOQPage.jsx'))};
import RABillingPage from ${JSON.stringify(join(root, 'src/pages/ra_billing/RABillingPage.jsx'))};
import ${JSON.stringify(join(root, 'src/index.css'))};
document.documentElement.dataset.theme = 'dark';
const client = new QueryClient({defaultOptions:{queries:{retry:false}}}); window.client = client;
window.invalidations = []; const invalidate = client.invalidateQueries.bind(client);
client.invalidateQueries = options => {window.invalidations.push(options.queryKey); return invalidate(options)};
window.navigation=[]; const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><div style={{height:'100vh',position:'relative',transform:'translateZ(0)',overflow:'hidden'}}>
{params.has('ra') ? <RABillingPage initialBoqId={params.get('boq') || 'all'} onNavigate={(page,extra)=>window.navigation.push({page,extra})} /> :
<BOQPage initialBoqId="boq1" onNavigate={(page,extra)=>window.navigation.push({page,extra})} />}</div><Toaster/></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary,
  plugins: [react(), { name: 'mock-boq-ra', enforce: 'pre', resolveId(source) {
    if (/\/supabase(\.js)?$/.test(source)) return join(temporary, 'supabase.js')
    if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary, 'auth.js')
  } }], css: { postcss: { plugins: [tailwindcss({ config: join(root, 'tailwind.config.js') }), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 4185, fs: { allow: [root] } } })
let browser
try {
  await server.listen()
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, timezoneId: 'Asia/Kolkata' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const url = 'http://127.0.0.1:4185/'
  const dialog = () => page.getByRole('dialog', { name: 'Raise RA Bill', exact: true })
  const quantity = () => dialog().getByRole('spinbutton', { name: 'Current quantity for Excavation of ordinary soil', exact: true })
  const save = () => dialog().getByRole('button', { name: /^Raise RA Bill —/ })
  const openBoq = async (query = '') => {
    await page.goto(url + query)
    await page.getByRole('button', { name: /^RA Bills \(/ }).click()
  }
  const raise = async () => {
    await page.getByRole('button', { name: 'Raise RA Bill from BOQ', exact: true }).click()
    await quantity().waitFor()
  }
  await openBoq(); await raise()
  assert.match(await dialog().innerText(), /Demo Construction Client · Demo Construction Site/)
  assert.match(await dialog().innerText(), /WO-DEMO-001/)
  assert.match(await dialog().innerText(), /Remaining: 80/)
  assert.equal(await dialog().getByText('Other contract', { exact: true }).count(), 0)
  assert.equal(await dialog().getByLabel('Income Tax / TDS (%)', { exact: true }).inputValue(), '2')
  await quantity().fill('10')
  await dialog().getByLabel('CGST %', { exact: true }).fill('9')
  await dialog().getByLabel('SGST %', { exact: true }).fill('9')
  await dialog().getByLabel('Security Deposit (₹)', { exact: false }).fill('50')
  await dialog().getByLabel('Mob. Advance Recovery (₹)', { exact: true }).fill('100')
  await dialog().getByLabel('Other Deductions (₹)', { exact: true }).fill('25')
  assert.match(await save().innerText(), /1,550.00/)
  await dialog().getByText('NET PAYABLE',{exact:true}).scrollIntoViewIfNeeded()
  const footerTop = (await save().boundingBox()).y
  const netBounds = await dialog().getByText('NET PAYABLE',{exact:true}).boundingBox()
  assert.ok(netBounds.y+netBounds.height < footerTop)
  await page.screenshot({ path: join(artifacts, 'boq-ra-bill-desktop.png') })
  await save().click()
  await dialog().waitFor({ state: 'hidden' })
  const created = await page.evaluate(() => window.tables.ra_bills.find(row => row.id !== 'old-bill'))
  assert.deepEqual([created.company_id, created.boq_id, created.status, created.created_by], ['company','boq1','draft','actor'])
  assert.deepEqual([created.subtotal,created.cgst_amount,created.sgst_amount,created.income_tax_amt,created.labour_cess_amt,created.net_payable], [1500,135,135,30,15,1550])
  const lines = await page.evaluate(() => window.tables.ra_bill_items)
  assert.equal(lines.length,1)
  assert.deepEqual([lines[0].boq_item_id,lines[0].previous_qty,lines[0].current_qty,lines[0].total_qty,lines[0].current_amount], ['item1',20,10,30,1500])
  await page.getByText('RA bill summary (2)', { exact: true }).waitFor()
  assert.ok(await page.evaluate(() => window.invalidations.some(key => key[0] === 'ra_bills_global') && window.invalidations.some(key => key[0] === 'ra_bills')))
  await page.getByRole('button', { name: 'Open bill in RA Billing' }).last().click()
  assert.deepEqual(await page.evaluate(() => window.navigation.at(-1)), {page:'ra_billing',extra:{boqId:'boq1',raId:created.id}})

  // Parent/child/number failures retain inputs, remove partial drafts and allow retry.
  for (const flag of ['failHeader','failLines','failSequence','failHeaderResponse','failLinesResponse']) {
    await openBoq(); await raise(); await quantity().fill('5')
    await page.evaluate(flag => { window[flag] = true },flag)
    await save().click(); await dialog().getByRole('alert').waitFor()
    assert.equal(await quantity().inputValue(),'5')
    assert.equal(await page.evaluate(() => window.tables.ra_bills.length),1)
    await save().click(); await dialog().waitFor({state:'hidden'})
    assert.equal(await page.evaluate(() => window.tables.ra_bills.length),2)
  }
  await openBoq(); await raise(); await quantity().fill('5')
  await page.evaluate(() => { window.failLines=true; window.failDelete=true })
  await save().click(); await dialog().getByText(/could not be completed/).waitFor()
  assert.equal(await page.evaluate(() => window.tables.ra_bills.length),2)
  await save().click(); await dialog().waitFor({state:'hidden'})
  assert.equal(await page.evaluate(() => window.tables.ra_bills.length),2)

  await openBoq(); await raise()
  await quantity().fill('81'); await save().click()
  await dialog().getByText(/exceeds the remaining BOQ quantity/).waitFor()
  assert.equal(await page.evaluate(() => window.writes.length),0)
  await quantity().fill('5')
  await dialog().getByLabel('Period From').fill('2026-10-15')
  await dialog().getByLabel('Period To').fill('2026-10-01')
  await save().click(); await dialog().getByText(/valid billing period/).waitFor()
  await dialog().getByLabel('Period From').fill('2026-10-01')
  await page.evaluate(() => { window.tables.boq_items[0].rate=175 })
  await save().click(); await dialog().getByText(/quantities or rates changed/).waitFor()
  assert.equal(await page.evaluate(() => window.tables.ra_bills.length),1)
  assert.equal(await quantity().inputValue(),'5')
  await save().click(); await dialog().waitFor({state:'hidden'})
  assert.equal(await page.evaluate(() => window.tables.ra_bill_items[0].rate),175)

  await openBoq(); await raise(); await quantity().fill('0.333')
  await dialog().getByLabel('CGST %',{exact:true}).fill('9')
  await dialog().getByLabel('SGST %',{exact:true}).fill('9')
  await page.evaluate(() => { window.readDelay=80 })
  await save().evaluate(button => { button.click(); button.click() })
  await page.keyboard.press('Escape')
  assert.equal(await dialog().count(),1)
  await dialog().waitFor({state:'hidden'})
  const rounded = await page.evaluate(() => window.tables.ra_bills.at(-1))
  assert.equal(await page.evaluate(() => window.tables.ra_bills.length),2)
  assert.equal(rounded.total_amount,58.95)
  assert.equal(rounded.subtotal+rounded.cgst_amount+rounded.sgst_amount,rounded.total_amount)

  // Access and terminal BOQ statuses.
  for (const role of ['manager','accounts']) { await openBoq('?role='+role); await raise(); await page.keyboard.press('Escape'); await dialog().waitFor({state:'hidden'}) }
  for (const query of ['?role=supervisor','?role=operator','?module-off']) {
    await openBoq(query)
    assert.equal(await page.getByRole('button',{name:'Raise RA Bill from BOQ',exact:true}).count(),0)
  }
  await openBoq(); await page.evaluate(() => { window.tables.boq_documents[0].status='cancelled' })
  await page.getByRole('button',{name:'Raise RA Bill from BOQ',exact:true}).click()
  await dialog().getByText(/unavailable or is completed\/cancelled/).waitFor()
  assert.equal(await dialog().getByRole('spinbutton').count(),0)
  await page.keyboard.press('Escape')

  await openBoq(); await page.evaluate(() => { window.failItemsRead=true })
  await page.getByRole('button',{name:'Raise RA Bill from BOQ',exact:true}).click()
  await dialog().getByText(/Could not load BOQ items/).waitFor()
  await dialog().getByRole('button',{name:'Try again',exact:true}).click(); await quantity().waitFor()
  await page.keyboard.press('Escape')
  await openBoq(); await page.evaluate(() => { window.failBoqRead=true })
  await page.getByRole('button',{name:'Raise RA Bill from BOQ',exact:true}).click()
  await dialog().getByText(/Could not load BOQ contracts/).waitFor()
  await dialog().getByRole('button',{name:'Try again',exact:true}).click(); await quantity().waitFor()
  await page.keyboard.press('Escape')
  await openBoq(); await page.evaluate(() => { window.tables.boq_items=[] })
  await page.getByRole('button',{name:'Raise RA Bill from BOQ',exact:true}).click()
  await dialog().getByText(/no billable items/).waitFor()
  assert.equal(await save().isDisabled(),true)
  await page.keyboard.press('Escape')

  // The same form works from global and BOQ-filtered RA Billing.
  await page.goto(url+'?ra'); await page.getByRole('button',{name:'Raise RA Bill',exact:true}).click()
  await dialog().getByRole('button',{name:/BOQ-DEMO-002/}).click(); await quantity().waitFor()
  assert.equal(await dialog().getByLabel('Income Tax / TDS (%)',{exact:true}).inputValue(),'0')
  assert.equal(await dialog().getByText('Foreign company contract',{exact:true}).count(),0)
  await quantity().fill('3'); await save().click(); await dialog().waitFor({state:'hidden'})
  assert.equal(await page.evaluate(() => window.tables.ra_bills.at(-1).boq_id),'boq2')
  await page.goto(url+'?ra&boq=boq1'); await page.getByRole('button',{name:'Raise RA Bill',exact:true}).click()
  await quantity().waitFor(); assert.equal(await dialog().getByText(/Select the BOQ contract/).count(),0)
  await page.keyboard.press('Escape')

  await page.setViewportSize({width:390,height:844}); await openBoq(); await raise(); await quantity().fill('10')
  const bounds = await dialog().boundingBox(); assert.ok(bounds.x >= 0 && bounds.x+bounds.width <= 390)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await quantity().scrollIntoViewIfNeeded()
  const itemBounds = await dialog().getByText('Excavation of ordinary soil',{exact:true}).boundingBox()
  assert.ok(itemBounds.x >= 0 && itemBounds.x+itemBounds.width <= 390)
  await page.screenshot({path:join(artifacts,'boq-ra-bill-mobile.png')})
  await dialog().getByLabel('Other Deductions (₹)',{exact:true}).fill('25'); await save().click(); await dialog().waitFor({state:'hidden'})
  await page.setViewportSize({width:320,height:700}); await openBoq(); await raise()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.keyboard.press('Escape')
  assert.deepEqual(errors,[])
  console.log('BOQ RA billing browser checks passed: pre-fill, totals, draft writes, recovery, access, standalone regression and mobile.')
} finally { await browser?.close(); await server.close(); await rm(temporary,{recursive:true,force:true}) }
