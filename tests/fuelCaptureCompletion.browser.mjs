import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.fuel-browser-'))
const artifacts = resolve(process.env.FUEL_ARTIFACT_DIR || 'test-artifacts/fuel')
await mkdir(artifacts, { recursive: true })
const date = new Date().toISOString().slice(0,10)
const equipment = [{ id: 'eq1', name: 'Test excavator', equipment_number: 'EX-001', meter_type: 'hour_meter', specific_consumption_lph: 10 }]
const projects = [{ id: 'p1', project_name: 'Test construction site' }]
const incomplete = { id:'capture', source_document_type:'field_expense', source_document_id:'source', expense_date:date, equipment_id:'eq1', equipment:equipment[0], total_amount:2000, status:'needs_information', missing_fields:['project','litres','approval_route'], vendor_name:'Test operator', fuel_source:'petrol_pump', created_by:'creator' }
const captures = [incomplete, { ...incomplete, id:'pending', status:'pending_review', quantity_liters:10, missing_fields:[], approval_case:{status:'in_review'} }]
await writeFile(join(temporary, 'supabase.js'), `const tables=${JSON.stringify({equipment, projects, fuel_expense_captures:captures, fuel_issues:[{id:'approved',equipment_id:'eq1',project_id:'p1',issue_date:date,quantity_liters:40,rate_per_liter:100,total_amount:4000}], shift_fuel_entries:[],daily_operations:[],equipment_deployments:[],fuel_tank_replenishments:[]})};
export const supabase={from(table){const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},neq(){return q},or(){return q},order(){return q},then(resolve){return Promise.resolve({data:tables[table]||[],error:null}).then(resolve)}};return q;},async rpc(name,args){window.rpcCalls=(window.rpcCalls||[]).concat({name,args});if(window.location.search.includes('fail')&&args.p_submit)return {error:{message:'No independent reviewer configured'}};const row=tables.fuel_expense_captures.find(r=>r.id===args.p_capture_id);Object.assign(row,args.p_details,{station_name:args.p_details.station_name,quantity_liters:Number(args.p_details.quantity_liters),rate_per_liter:Number(args.p_details.rate_per_liter),project:tables.projects[0],source_snapshot:{station_name:args.p_details.station_name},status:args.p_submit?'pending_review':'needs_information',missing_fields:args.p_submit?[]:['approval_route'],approval_case:args.p_submit?{status:'in_review'}:null});return {data:{submitted:args.p_submit},error:null};}};`)
await writeFile(join(temporary,'auth.js'), `export const useAuth=()=>({companyId:'test-company',role:window.location.search.includes('readonly')?'operator':'admin',session:{user:{id:'different-user'}}});`)
await writeFile(join(temporary,'index.html'),'<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary,'main.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {Toaster} from 'react-hot-toast';import FuelPage from ${JSON.stringify(join(root,'src/pages/fuel/FuelReconciliationPage.jsx'))};import ${JSON.stringify(join(root,'src/index.css'))};document.documentElement.setAttribute('data-theme','dark');createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><div style={{height:'100vh'}}><FuelPage onNavigate={page=>window.lastNavigation=page}/></div><Toaster/></QueryClientProvider>);`)
const server = await createServer({configFile:false,root:temporary,plugins:[react(),{name:'mock-fuel-data',enforce:'pre',resolveId(source){if(/\/supabase(\.js)?$/.test(source))return join(temporary,'supabase.js');if(/\/AuthContext(\.jsx)?$/.test(source))return join(temporary,'auth.js');}}],css:{postcss:{plugins:[tailwindcss({config:join(root,'tailwind.config.js')}),autoprefixer()]}},server:{host:'127.0.0.1',port:4177,fs:{allow:[root]}}})
let browser
try {
  await server.listen()
  let launchOptions = {}
  if(process.env.FUEL_CHROMIUM_MODULE){const runtime=(await import(process.env.FUEL_CHROMIUM_MODULE)).default;launchOptions={executablePath:await runtime.executablePath(),args:runtime.args}}
  browser=await chromium.launch(launchOptions)
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto('http://127.0.0.1:4177')
  await page.getByRole('button',{name:'Complete fuel details',exact:true}).waitFor()
  assert.match(await page.getByRole('button',{name:/Fuel supplied/}).innerText(),/40 L/)
  assert.match(await page.getByRole('button',{name:/Pending fuel review/}).innerText(),/2/)
  await page.screenshot({path:join(artifacts,'fuel-review-queue.png'),fullPage:true})
  await page.getByRole('button',{name:'Complete fuel details',exact:true}).click()
  const dialog=page.getByRole('dialog')
  await dialog.waitFor()
  assert.equal(await dialog.getByLabel(/^Equipment \*/).inputValue(),'eq1')
  await dialog.getByLabel(/^Project \*/).selectOption('p1')
  await dialog.getByLabel('Litres filled *',{exact:true}).fill('20')
  await dialog.getByLabel('Unit price (₹/litre) *',{exact:true}).fill('90')
  await dialog.getByLabel('Fuel station / supplier *',{exact:true}).fill('Demo Fuel Station')
  await dialog.getByLabel('Invoice / bill number',{exact:true}).fill('DEMO-001')
  await dialog.getByLabel('Hour-meter reading',{exact:true}).fill('1500')
  await dialog.getByRole('button',{name:'Save & submit for approval',exact:true}).click()
  assert.match(await dialog.getByRole('alert').innerText(),/must match/)
  assert.equal(await page.evaluate(()=>window.rpcCalls?.length||0),0)
  await dialog.getByRole('button',{name:'Calculate unit price from amount',exact:true}).click()
  assert.equal(await dialog.getByLabel('Unit price (₹/litre) *',{exact:true}).inputValue(),'100.000')
  await page.screenshot({path:join(artifacts,'fuel-complete-details-desktop.png'),fullPage:true})
  await dialog.getByRole('button',{name:'Save & submit for approval',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  assert.equal(await page.getByRole('button',{name:'Complete fuel details',exact:true}).count(),0)
  assert.match(await page.getByRole('button',{name:/Fuel supplied/}).innerText(),/40 L/)
  const call=(await page.evaluate(()=>window.rpcCalls))[0]
  assert.equal(call.name,'complete_fuel_expense_capture');assert.equal(call.args.p_details.station_name,'Demo Fuel Station');assert.equal(call.args.p_submit,true)
  await page.getByRole('button',{name:'Open Approval Centre',exact:true}).click()
  assert.equal(await page.evaluate(()=>window.lastNavigation),'approval_center')
  await page.goto('http://127.0.0.1:4177?fail')
  await page.getByRole('button',{name:'Complete fuel details',exact:true}).click()
  await dialog.getByLabel(/^Project \*/).selectOption('p1')
  await dialog.getByLabel('Litres filled *',{exact:true}).fill('20')
  await dialog.getByLabel('Unit price (₹/litre) *',{exact:true}).fill('100')
  await dialog.getByLabel('Fuel station / supplier *',{exact:true}).fill('Demo Fuel Station')
  await dialog.getByRole('button',{name:'Save & submit for approval',exact:true}).click()
  await dialog.getByRole('alert').waitFor()
  assert.match(await dialog.getByRole('alert').innerText(),/independent reviewer/)
  assert.equal(await dialog.getByLabel('Litres filled *',{exact:true}).inputValue(),'20')
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:join(artifacts,'fuel-complete-details-mobile.png'),fullPage:true})
  assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false)
  await dialog.getByRole('button',{name:'Save details',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  await page.getByRole('button',{name:'Complete fuel details',exact:true}).click()
  assert.equal(await dialog.getByLabel('Fuel station / supplier *',{exact:true}).inputValue(),'Demo Fuel Station')
  assert.match(await dialog.innerText(),/Payee: Test operator/)
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
  await page.goto('http://127.0.0.1:4177?readonly')
  await page.getByText('Submitter or finance team must complete').waitFor()
  assert.equal(await page.getByRole('button',{name:'Complete fuel details',exact:true}).count(),0)
  assert.deepEqual(errors,[])
  console.log('Fuel browser checks passed: entry point, receipt math, submission, unchanged official totals, errors, save-only, retained details, role restriction and mobile layout.')
} finally {await browser?.close();await server.close();await rm(temporary,{recursive:true,force:true})}
