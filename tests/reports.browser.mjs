import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'
import { REPORTS } from '../src/lib/reportCatalog.js'
import { reportFixture } from './reports.fixture.mjs'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.reports-browser-'))
const artifacts = resolve(process.env.REPORTS_ARTIFACT_DIR || 'test-artifacts/reports')
await mkdir(artifacts, { recursive: true })
await writeFile(join(temporary, 'supabase.js'), `const tables=${JSON.stringify(reportFixture)};
window.reportReads=[];window.recovered=false;
export const supabase={from(table){let filters=[],start=0,end=Infinity,columns='';const q={
select(value){columns=value;return q},eq(key,value){filters.push([key,value]);return q},order(){return q},range(a,b){start=a;end=b;return q},
async then(done){window.reportReads.push({table,filters,start,end,columns});
if(table==='fuel_issues'&&location.search.includes('fail')&&!window.recovered)return done({error:{message:'Report permission denied'}});
const records=[...(tables[table]||[]),{id:'foreign',company_id:'other',name:'FOREIGN COMPANY'}].filter(r=>filters.every(([key,value])=>r[key]===value)).sort((a,b)=>a.id.localeCompare(b.id));
return done({data:records.slice(start,Math.min(end+1,start+2)),count:records.length,error:null});
}};return q}};`)
await writeFile(join(temporary, 'auth.js'), `export const useAuth=()=>({companyId:location.search.includes('no-company')?null:'test-company',company:{name:'Nhance Report Test'}});`)
await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary, 'main.jsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import ReportsPage from ${JSON.stringify(join(root,'src/pages/reports/ReportsPage.jsx'))};import ${JSON.stringify(join(root,'src/index.css'))};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><div style={{height:'100vh'}}><ReportsPage initialReport={new URL(location.href).searchParams.get('report')||'invoice_aging'} initialFrom="2026-10-01" initialTo="2026-10-07" /></div></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary, plugins: [react(), { name: 'mock-all-reports', enforce: 'pre', resolveId(source) {
  if (/\/supabase(\.js)?$/.test(source)) return join(temporary,'supabase.js')
  if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary,'auth.js')
} }], optimizeDeps: { include: ['react','react-dom/client','@tanstack/react-query','xlsx','jspdf','jspdf-autotable'] },
css: { postcss: { plugins: [tailwindcss({ config: join(root,'tailwind.config.js') }),autoprefixer()] } }, server: { host: '127.0.0.1', port: 4192, strictPort: true, fs: { allow: [root] } } })
let browser
try {
  await server.listen()
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'))
  const errors=[];page.on('pageerror', e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:4192')
  await page.getByRole('table').waitFor()
  assert.match(await page.getByRole('table').innerText(), /INV-OLD/)
  assert.match(await page.getByRole('table').innerText(), /320.25/)
  await page.getByLabel('Ageing bucket', {exact:true}).selectOption('61–90 days')
  assert.match(await page.getByRole('table').innerText(), /80.25/)
  assert.doesNotMatch(await page.getByRole('table').innerText(), /INV-FUTURE/)
  await page.getByRole('button',{name:'Reset filters',exact:true}).click()
  await page.getByRole('checkbox',{name:'All dates',exact:true}).uncheck()
  assert.doesNotMatch(await page.getByRole('table').innerText(), /INV-OLD/)
  await page.getByLabel('Report period start',{exact:true}).fill('2026-10-07')
  await page.getByLabel('Report period end',{exact:true}).fill('2026-10-01')
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('button',{name:'Download PDF',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'Reset filters',exact:true}).click()
  await page.screenshot({path:join(artifacts,'invoice-ageing-desktop.png'),fullPage:true})
  // Every report must load, and every new exporter must return a valid file.
  for(const report of REPORTS) {
    if(report.adminOnly) continue // Full activity history has its own admin-only suite.
    await page.getByRole('button',{name:report.label,exact:true}).click()
    await page.getByRole('heading',{name:report.label,exact:true}).waitFor()
    await page.getByRole('table').waitFor()
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Download Excel')?.disabled)
    const text=await page.getByRole('table').innerText()
    assert.doesNotMatch(text,/No records match|FOREIGN COMPANY/,report.id)
    if(report.existing) continue // Covered by the receivables browser suite.
    console.log(`Checking ${report.id}`)
    for(const [label,extension] of [['Excel','xlsx'],['CSV','csv'],['PDF','pdf']]) {
      const pending=page.waitForEvent('download')
      await page.getByRole('button',{name:`Download ${label}`,exact:true}).click()
      const download=await pending
      assert.equal(await download.failure(),null)
      assert.equal(download.suggestedFilename(),`${report.id}_2026-10-07.${extension}`)
      const file=join(artifacts,download.suggestedFilename());await download.saveAs(file)
      const bytes=await readFile(file)
      assert.ok(bytes.length>100)
      if(extension==='pdf') assert.equal(bytes.subarray(0,4).toString(),'%PDF')
      if(extension==='xlsx') {
        const workbook=XLSX.read(bytes,{type:'buffer'})
        const values=XLSX.utils.sheet_to_json(workbook.Sheets.Report,{header:1})
        assert.equal(values[1][0],report.label)
        assert.match(values.at(-1)[0],/TOTAL/)
        assert.ok(values.length>=9)
        assert.equal(workbook.Sheets.Summary.B5.v,values.length-8)
      }
      if(extension==='csv') assert.match(bytes.toString(),/TOTAL \(all filtered rows\)/)
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
  await page.getByRole('button',{name:'Fuel Report',exact:true}).click()
  await page.getByRole('table').waitFor()
  assert.match(await page.getByRole('table').innerText(),/FLEET-DIRECT/)
  assert.match(await page.getByRole('table').innerText(),/FIELD-INV-1/)
  await page.getByLabel('Equipment',{exact:true}).selectOption('e1')
  assert.doesNotMatch(await page.getByRole('table').innerText(),/BETA-FILL/)
  await page.getByLabel('Report view',{exact:true}).selectOption('equipment')
  assert.match(await page.getByRole('table').innerText(),/35.5/)
  await page.getByRole('button',{name:'View details for Excavator Alpha',exact:true}).click()
  await page.getByRole('dialog').waitFor()
  assert.match(await page.getByRole('dialog').innerText(),/FIELD-INV-1/)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(),0)
  await page.screenshot({path:join(artifacts,'fuel-summary-desktop.png'),fullPage:true})
  await page.getByLabel('Search report',{exact:true}).fill('no-match')
  assert.equal(await page.getByRole('button',{name:'Download Excel',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'Reset filters',exact:true}).click()
  await page.getByLabel('Entry source',{exact:true}).selectOption('Reconciled field expense')
  assert.match(await page.getByRole('table').innerText(),/FIELD-INV-1/)
  assert.doesNotMatch(await page.getByRole('table').innerText(),/FLEET-DIRECT/)
  const reads=await page.evaluate(()=>window.reportReads)
  assert.ok(reads.length>30)
  assert.ok(reads.every(r=>r.filters.some(([key,value])=>key==='company_id'&&value==='test-company')))
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:join(artifacts,'fuel-mobile.png'),fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
  await page.goto('http://127.0.0.1:4192/?report=fuel_report&fail')
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').innerText(),/fuel_issues: Report permission denied/)
  assert.equal(await page.getByRole('button',{name:'Download CSV',exact:true}).isDisabled(),true)
  await page.evaluate(()=>window.recovered=true)
  await page.getByRole('button',{name:'Retry',exact:true}).click()
  await page.getByRole('table').waitFor()
  assert.match(await page.getByRole('table').innerText(),/FIELD-INV-1/)
  await page.goto('http://127.0.0.1:4192/?no-company')
  await page.getByText('Select a company to view reports.',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.reportReads.length),0)
  assert.deepEqual(errors,[])
  console.log('All 18 report screens passed; 51 PDF/Excel/CSV downloads, filters, invalid dates, Fleet/field fuel, direct incidents, payroll month, tenant scope, API caps, retry, detail modal and mobile layout verified.')
} finally {
  await browser?.close();await server.close();await rm(temporary,{recursive:true,force:true})
}
