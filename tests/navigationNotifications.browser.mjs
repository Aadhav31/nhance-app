import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.navigation-browser-'))
const artifacts = resolve(process.env.NAVIGATION_ARTIFACT_DIR || 'test-artifacts/navigation')
await mkdir(artifacts, { recursive: true })
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const user = id(1), otherUser = id(2), company = id(3), otherCompany = id(4)
const notifications = [
  { id: id(10), company_id: company, user_id: null, type: 'incident_breakdown', title: 'Breakdown — EX-001', body: 'Excavator stopped during the morning shift.', is_read: false, created_at: '2026-10-01T04:10:00Z' },
  { id: id(11), company_id: company, user_id: user, type: 'outstanding_dues', title: 'Outstanding dues — Site A', body: 'Invoice remains unpaid on the completed project.', is_read: false, created_at: '2026-10-01T04:00:00Z' },
  { id: id(12), company_id: company, user_id: otherUser, type: 'info', title: 'Private alert for another user', is_read: false, created_at: '2026-10-01T03:00:00Z' },
  { id: id(13), company_id: otherCompany, user_id: null, type: 'info', title: 'Another company alert', is_read: false, created_at: '2026-10-01T02:00:00Z' },
  { id: id(14), company_id: company, user_id: null, type: 'info', title: 'Earlier operational update', is_read: true, created_at: '2026-10-01T01:00:00Z' },
]
await writeFile(join(temporary, 'auth.js'), `export const useAuth=()=>{const q=new URLSearchParams(location.search);const companyId=q.has('foreign')?'${otherCompany}':'${company}';return {companyId,company:{id:companyId,name:'SRA Mining and Constructions'},role:q.has('operator')?'operator':'admin',session:{user:{id:q.has('other-user')?'${otherUser}':'${user}'}},userProfile:{id:'${user}',full_name:'Admin'},signOut:()=>{},hasModule:module=>!q.has('no-fleet')||module!=='fleet'}};`)
await writeFile(join(temporary, 'display.js'), `export const useDisplayMode=()=>({mode:'advanced',setMode:()=>{}});export const useTheme=()=>({theme:'dark',toggle:()=>{document.documentElement.setAttribute('data-theme',document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')}});`)
const receipts=new Map(), added=new Map()
const compare=(a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)
async function rpcFixture(_,name,params,scope){
  const q=new URLSearchParams(scope.search), actor=q.has('other-user')?otherUser:user, tenant=q.has('foreign')?otherCompany:company
  const scenario=q.has('large')?'large':q.has('save-error')?'save-error':q.has('legacy-read')?'legacy-read':'base'
  const key=`${scenario}:${actor}`, read=receipts.get(key)||new Map();receipts.set(key,read)
  if(name==='inject'){added.set(scenario,[...(added.get(scenario)||[]),params]);return {data:true,error:null}}
  if(name==='get_notification_feed'&&q.has('notification-error')&&!scope.recovered)return {error:{message:'Network unavailable'}}
  if(name==='mark_notifications_read'&&scope.failReads)return {error:{message:'Could not save read status'}}
  let rows=q.has('empty')?[]:[...notifications,...(added.get(scenario)||[])]
  if(q.has('large')) rows.push(...Array.from({length:70},(_,n)=>({id:id(100+n),company_id:company,user_id:null,type:'future_update',title:`Older update ${n}`,created_at:'2026-09-01T01:00:00Z',is_read:false})))
  rows=rows.filter(n=>n.company_id===tenant&&(n.user_id===null||n.user_id===actor)).sort(compare)
  if(name==='mark_notifications_read'){
    rows.filter(n=>params.p_ids?params.p_ids.includes(n.id):compare(n,params.p_through_created_at?{created_at:params.p_through_created_at,id:params.p_through_id}:rows[0])>=0).forEach(n=>read.set(n.id,{review:read.get(n.id)?.review||params.p_review||false}))
    return {data:read.size,error:null}
  }
  const visible=rows.map(n=>({...n,is_read:n.is_read||read.has(n.id),alert_level:n.type.startsWith('incident_')?'critical':n.type==='outstanding_dues'?'warning':null}))
  const eligible=params.p_view==='alerts'?visible.filter(n=>n.alert_level&&!read.get(n.id)?.review):visible
  const after=params.p_before_id?eligible.filter(n=>compare(n,{created_at:params.p_before_created_at,id:params.p_before_id})>0):eligible
  const items=after.slice(0,params.p_limit), last=items.at(-1)
  return {data:{company_id:tenant,actor_id:actor,items,unread_count:visible.filter(n=>!n.is_read).length,total_count:eligible.length,snapshot:visible[0]?{created_at:visible[0].created_at,id:visible[0].id}:null,next_cursor:after.length>params.p_limit?{created_at:last.created_at,id:last.id}:null},error:null}
}
await writeFile(join(temporary, 'supabase.js'), `
const handlers=[];window.emitNotificationUpdate=()=>handlers.forEach(h=>h());window.injectNotification=async row=>{await window.fixtureRpc('inject',row,{search:location.search});window.emitNotificationUpdate()};
export const supabase={rpc(name,params){window.rpcCalls=(window.rpcCalls||[]).concat({name,params});return window.fixtureRpc(name,params,{search:location.search,recovered:window.recovered,failReads:window.failReads})},channel(){const callbacks=[];const channel={on(event,filter,callback){if(event==='postgres_changes')callbacks.push(callback);window.subscriptions=(window.subscriptions||[]).concat(filter);return channel},subscribe(callback){handlers.push(...callbacks);callback?.('SUBSCRIBED');return channel},callbacks};return channel},removeChannel(channel){window.removedChannels=(window.removedChannels||0)+1;channel.callbacks.forEach(callback=>{const index=handlers.indexOf(callback);if(index>=0)handlers.splice(index,1)})},from(table){const filters={},actions=[];let columns;const q={select(value){columns=value;return q},eq(key,value){filters[key]=value;return q},is(key,value){filters[key]=value;return q},or(value){filters.recipient=value;return q},in(){return q},not(){return q},neq(){return q},gt(){return q},gte(){return q},lte(){return q},order(){return q},limit(){return q},update(value){actions.push(value);return q},maybeSingle(){filters.single=true;return q},then(resolve){window.queries=(window.queries||[]).concat({table,filters,columns,actions});if(table==='approval_task_inbox'&&location.search.includes('legacy'))return Promise.resolve({error:{code:'PGRST205',message:'Could not find the table approval_task_inbox'}}).then(resolve);if(table.startsWith('approval_'))return Promise.resolve({count:3,error:null}).then(resolve);
if(table==='leave_requests')return Promise.resolve({error:{code:'PGRST205',message:'Unknown leave_requests table'}}).then(resolve);
if(table==='hr_leaves'){
  if(columns.includes('employee_name')||!columns.includes('employee:employee_id(name)'))return Promise.resolve({error:{message:'Invalid leave columns'}}).then(resolve);
  return new Promise(done=>setTimeout(()=>done(location.search.includes('dashboard-query-error')&&!window.leavesRecovered?{error:{message:'Leave request network failure'}}:{data:[{id:'leave-1',status:'pending',from_date:'2026-10-04',to_date:'2026-10-05',leave_type:'casual',employee:{name:'Demo Worker'}}],error:null}),300)).then(resolve);
}
if(table==='shifts'&&location.search.includes('full-dashboard')){
  if(columns.includes('equipment_name')||columns.includes('fuel_filled'))return Promise.resolve({error:{message:'Invalid shift columns'}}).then(resolve);
  if(columns.includes('fuel_entries:shift_fuel_entries'))return Promise.resolve({data:[{id:'demo-shift',status:'open',shift_date:new Date().toISOString().slice(0,10),working_hours:7.5,operator_name:'Demo Operator',equipment:{name:'Demo Excavator'},fuel_entries:[{quantity_liters:'25.5'},{quantity_liters:10}]}],error:null}).then(resolve);
}
if(table==='maintenance_records'){
  if(columns.split(',').includes('title'))return Promise.resolve({error:{message:'Invalid maintenance title column'}}).then(resolve);
  if(location.search.includes('full-dashboard'))return Promise.resolve({data:[{id:'maintenance-1',description:'Replace hydraulic hose',status:'open'}],error:null}).then(resolve);
}
if(table==='shift_incidents'){if(columns?.includes('incident_date')||filters.status)return Promise.resolve({error:{message:'Invalid incident columns'}}).then(resolve);return Promise.resolve({data:[{id:'${id(60)}',equipment_id:'${id(61)}',incident_type:'damage',incident_time:'2026-10-01T08:00:00Z',equipment:{name:'Loader 61'}}],error:null}).then(resolve)}return Promise.resolve({data:filters.single?null:[],error:null}).then(resolve)}};return q}};
`)
await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary, 'main.jsx'), `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import TopBar from ${JSON.stringify(join(root, 'src/components/layout/TopBar.jsx'))};import RightBar from ${JSON.stringify(join(root, 'src/components/layout/RightBar.jsx'))};import HomeNotificationAlerts from ${JSON.stringify(join(root, 'src/components/shared/HomeNotificationAlerts.jsx'))};import DashboardPage from ${JSON.stringify(join(root, 'src/pages/dashboard/DashboardPage.jsx'))};import OperatorPortal from ${JSON.stringify(join(root,'src/pages/operator/OperatorPortal.jsx'))};import ${JSON.stringify(join(root, 'src/index.css'))};document.documentElement.setAttribute('data-theme','dark');function Preview(){const [page,setPage]=useState('dashboard');if(new URLSearchParams(location.search).has('operator-portal'))return <OperatorPortal/>;return <div className="flex h-screen bg-dark-900"><div className="hidden lg:flex w-60 flex-col bg-dark-800 border-r border-dark-600 p-6"><div className="text-xl font-bold text-primary-400">NHANCE</div><p className="text-xs text-slate-500 mt-2">Fleet & operations</p><div className="text-sm mt-10 text-slate-300">Dashboard</div><div className="text-sm mt-6 text-slate-500">Equipments & Machineries</div><div className="text-sm mt-6 text-slate-500">Daily Operations</div><div className="text-sm mt-6 text-slate-500">Fuel Reconciliation</div></div><div className="flex flex-1 min-w-0 flex-col"><TopBar activePage={page} onNavigate={setPage} onMenuToggle={()=>{}}/><main className="flex-1 overflow-y-auto p-6 min-w-0">{new URLSearchParams(location.search).has('full-dashboard')?<DashboardPage onNavigate={setPage}/>:<>{page==='dashboard'&&<HomeNotificationAlerts onNavigate={setPage}/>}<h2 data-testid="current-page" className="text-lg font-bold text-slate-100">{page==='approval_center'?'Approval Centre':page==='dashboard'?'Operations overview':page}</h2><p className="text-sm text-slate-500 mt-2">Your fleet and project updates at a glance</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">{['Active equipment','Open projects','Daily operations'].map((label,index)=><div key={label} className="p-5 rounded-xl bg-dark-800 border border-dark-600"><p className="text-sm text-slate-400">{label}</p><p className="text-2xl font-bold text-slate-100 mt-3">{[18,6,24][index]}</p></div>)}</div></>}</main></div>{page!=='chat'&&<RightBar activePage={page} onNavigate={setPage}/>}</div>}createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Preview/></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary, plugins: [react(), { name: 'mock-navigation-data', enforce: 'pre', resolveId(source) {
  if (/\/supabase(\.js)?$/.test(source)) return join(temporary, 'supabase.js')
  if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary, 'auth.js')
  if (/\/(DisplayModeContext|ThemeContext)(\.jsx)?$/.test(source)) return join(temporary, 'display.js')
} }], css: { postcss: { plugins: [tailwindcss({ config: join(root, 'tailwind.config.js') }), autoprefixer()] } }, server: { host: '127.0.0.1', port: 4180, fs: { allow: [root] } } })
let browser
try {
  await server.listen()
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {})
  const context=await browser.newContext({viewport:{width:1440,height:960}})
  await context.exposeBinding('fixtureRpc',rpcFixture)
  const page = await context.newPage()
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:4180')
  const rail = page.locator('.nhance-rightbar')
  const approval = rail.getByRole('button', { name: 'Approval Centre, 3 pending approvals', exact: true })
  await approval.waitFor()
  assert.equal(await approval.locator('svg circle').count(), 1)
  assert.equal(await approval.locator('.lucide-bell').count(), 0)
  assert.equal(await page.locator('.nhance-topbar').getByRole('button', { name: /Approval Centre/ }).isVisible(), false)
  const bell = page.getByRole('button', { name: 'Notifications', exact: true })
  await bell.getByLabel('2 unread notifications').waitFor()
  await approval.click()
  assert.equal(await page.getByTestId('current-page').innerText(), 'Approval Centre')
  assert.equal(await approval.getAttribute('aria-current'), 'page')
  await bell.click()
  const panel = page.getByRole('dialog', { name: 'Notifications', exact: true })
  await panel.waitFor()
  assert.equal(await panel.getByText('Private alert for another user').count(), 0)
  assert.equal(await panel.getByText('Another company alert').count(), 0)
  await panel.getByText('Breakdown — EX-001').waitFor()
  await page.screenshot({ path: join(artifacts, 'approval-notifications-desktop.png'), fullPage: true })
  await panel.getByRole('button', { name: /Mark all read/ }).click()
  await page.waitForFunction(()=>!document.querySelector('[aria-label="2 unread notifications"]'))
  assert.equal(await approval.isVisible(), true)
  await page.reload()
  await approval.waitFor()
  await bell.click()
  await panel.getByText('You’re all caught up').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await panel.count(), 0)
  assert.equal(await bell.evaluate(element => element === document.activeElement), true)
  await page.goto('http://127.0.0.1:4180?other-user')
  await bell.getByLabel('2 unread notifications').waitFor()
  await bell.click()
  await panel.getByText('Private alert for another user').waitFor()
  assert.equal(await panel.getByText('Outstanding dues — Site A').count(), 0)
  await panel.getByText('Breakdown — EX-001').click()
  await page.getByTestId('current-page').filter({hasText:/^fleet$/}).waitFor()
  await page.goto('http://127.0.0.1:4180?foreign')
  await bell.getByLabel('1 unread notifications').waitFor()
  await bell.click()
  await panel.getByText('Another company alert').waitFor()
  assert.equal(await panel.getByText('Breakdown — EX-001').count(), 0)
  await page.goto('http://127.0.0.1:4180?notification-error')
  await bell.click()
  await panel.getByRole('alert').waitFor()
  assert.equal(await panel.getByText('You’re all caught up').count(), 0)
  await page.waitForFunction(()=>window.rpcCalls.filter(call=>call.name==='get_notification_feed'&&call.params.p_view==='all').length>=2)
  await page.evaluate(() => { window.recovered = true })
  await panel.getByRole('button', { name: 'Try again' }).click()
  await panel.getByText('Breakdown — EX-001').waitFor()
  await page.goto('http://127.0.0.1:4180?empty')
  await bell.click()
  await panel.getByText('No notifications yet').waitFor()
  await page.goto('http://127.0.0.1:4180?legacy')
  await approval.waitFor()
  assert.equal((await page.evaluate(() => window.queries)).some(query => query.table === 'approval_requests'), true)
  await page.goto('http://127.0.0.1:4180?operator')
  await bell.waitFor()
  assert.equal(await page.getByRole('button', { name: /Approval Centre/ }).count(), 0)
  await page.goto('http://127.0.0.1:4180')
  await rail.getByRole('button', { name: 'Team Chat', exact: true }).click()
  assert.equal(await rail.count(), 0)
  await page.locator('.nhance-topbar').getByRole('button', { name: /Approval Centre/ }).click()
  await approval.waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileApproval = page.locator('.nhance-topbar').getByRole('button', { name: /Approval Centre/ })
  assert.equal(await mobileApproval.isVisible(), true)
  assert.equal(await rail.isVisible(), false)
  await bell.click()
  await panel.waitFor()
  const bounds = await panel.boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: join(artifacts, 'approval-notifications-mobile.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 320, height: 640 })
  await bell.click()
  const smallBounds = await panel.boundingBox()
  assert.ok(smallBounds.x >= 0 && smallBounds.x + smallBounds.width <= 320)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
  await page.screenshot({ path: join(artifacts, 'approval-notifications-light.png'), fullPage: true })
  await page.goto('http://127.0.0.1:4180?large')
  await bell.getByLabel('72 unread notifications').waitFor()
  const home=page.getByRole('region',{name:'Alerts awaiting review'})
  await home.getByText('Breakdown — EX-001').waitFor()
  assert.equal(await home.getByText('Older update 0').count(),0)
  await bell.click();await panel.getByText('25 of 73 notifications').waitFor()
  await panel.getByRole('button',{name:'Load older notifications'}).click()
  await panel.getByText('50 of 73 notifications').waitFor()
  await panel.getByText('Breakdown — EX-001').click()
  await bell.getByLabel('71 unread notifications').waitFor()
  // Return Home; reading the notification does not acknowledge the warning.
  await page.goto('http://127.0.0.1:4180?large')
  await home.getByText('Breakdown — EX-001').waitFor()
  await home.getByRole('button',{name:'Acknowledge Breakdown — EX-001',exact:true}).click()
  await home.getByText('Alerts awaiting review (1)').waitFor()
  await bell.click();await panel.getByRole('button',{name:'Mark all read'}).click()
  await panel.getByText('You’re all caught up').waitFor()
  // A server delivery refreshes both feeds without reopening the bell.
  await page.evaluate(row=>window.injectNotification(row),{id:id(200),company_id:company,user_id:null,type:'incident_safety_issue',title:'Live safety warning',body:'Review the new site warning.',is_read:false,created_at:'2026-10-01T12:00:00Z'})
  await bell.getByLabel('1 unread notifications').waitFor()
  await home.getByText('Live safety warning').waitFor()
  await panel.getByText('Live safety warning').waitFor()
  await page.keyboard.press('Escape')
  await page.screenshot({path:join(artifacts,'notification-home-desktop.png'),fullPage:true})
  // Read state comes from the server even in a fresh browser context.
  const secondContext=await browser.newContext();await secondContext.exposeBinding('fixtureRpc',rpcFixture)
  const second=await secondContext.newPage();await second.goto('http://127.0.0.1:4180?large')
  await second.getByRole('button',{name:'Notifications',exact:true}).getByLabel('1 unread notifications').waitFor();await secondContext.close()
  await page.goto('http://127.0.0.1:4180?save-error');await page.evaluate(()=>{window.failReads=true})
  await bell.getByLabel('2 unread notifications').waitFor();await bell.click()
  await panel.getByText('Breakdown — EX-001').click();await panel.getByText('Could not save read status').waitFor()
  await bell.getByLabel('2 unread notifications').waitFor()
  await page.evaluate(()=>{window.failReads=false});await panel.getByText('Breakdown — EX-001').click()
  await bell.getByLabel('1 unread notifications').waitFor()
  await page.goto('http://127.0.0.1:4180?legacy-read')
  await page.evaluate(({company,user,id})=>localStorage.setItem(`nhance_notification_reads_v1:${company}:${user}`,JSON.stringify([id])),{company,user,id:id(10)})
  await page.reload();await bell.getByLabel('1 unread notifications').waitFor()
  assert.equal(await page.evaluate(({company,user})=>localStorage.getItem(`nhance_notification_reads_v1:${company}:${user}`),{company,user}),null)
  await page.goto('http://127.0.0.1:4180?full-dashboard')
  await page.getByText('Open incident — Loader 61',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Operational alerts',exact:true}).getAttribute('aria-expanded'),'true')
  const queries=await page.evaluate(()=>window.queries)
  assert.ok(queries.some(q=>q.table==='shift_incidents'&&q.filters.recipient==='resolved.eq.false,resolved.is.null'&&q.columns.includes('incident_time')))
  assert.ok(queries.some(q=>q.table==='breakdown_alerts'&&q.filters.resolved_at===null))
  await page.getByText('1 leave request pending approval', {exact:true}).waitFor()
  await page.getByText('Demo Worker', {exact:true}).waitFor()
  assert.equal(await page.getByRole('alert').filter({hasText:'Some operational alerts could not load'}).count(),0)
  assert.ok(queries.some(q=>q.table==='hr_leaves'&&q.filters.company_id===company&&q.filters.status==='pending'&&q.columns.includes('employee:employee_id(name)')))
  assert.ok(queries.every(q=>q.table!=='leave_requests'))
  await page.getByText('Demo Excavator', {exact:true}).first().waitFor()
  await page.getByText('35.5', {exact:true}).waitFor()
  await page.getByText('Open Maintenance', {exact:true}).click()
  await page.getByText('Replace hydraulic hose', {exact:true}).waitFor()
  await page.getByRole('button',{name:'Close',exact:true}).click()
  await page.screenshot({path:join(artifacts,'dashboard-alerts-repaired-desktop.png'),fullPage:true})
  await page.goto('http://127.0.0.1:4180?full-dashboard&dashboard-query-error')
  const alertError=page.getByRole('alert').filter({hasText:'Some operational alerts could not load'})
  await alertError.waitFor()
  assert.match(await alertError.innerText(),/Leave requests/)
  const beforeRetry=await page.evaluate(()=>window.queries.length)
  await page.getByRole('button',{name:'Retry alerts',exact:true}).click()
  await page.getByRole('button',{name:'Retrying alerts…',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Retrying alerts…',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'Retry alerts',exact:true}).waitFor()
  assert.equal(await alertError.count(),1)
  await page.evaluate(()=>{window.leavesRecovered=true})
  await page.getByRole('button',{name:'Retry alerts',exact:true}).click()
  await alertError.waitFor({state:'hidden'})
  await page.getByText('1 leave request pending approval',{exact:true}).waitFor()
  const retryQueries=await page.evaluate(start=>window.queries.slice(start),beforeRetry)
  assert.ok(retryQueries.length>=2)
  assert.ok(retryQueries.every(q=>q.table==='hr_leaves'),'Retry does not reload successful alert sources')
  await page.setViewportSize({width:390,height:844})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:join(artifacts,'dashboard-alerts-repaired-mobile.png'),fullPage:true})
  await page.setViewportSize({width:1440,height:960})
  await page.goto('http://127.0.0.1:4180?operator')
  await home.getByText('Breakdown — EX-001').waitFor()
  assert.equal(await home.getByRole('button',{name:'Review details'}).count(),0)
  await page.goto('http://127.0.0.1:4180?large');await page.setViewportSize({width:390,height:844})
  await home.getByText('Live safety warning').waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:join(artifacts,'notification-home-mobile.png'),fullPage:true})
  await page.evaluate(()=>localStorage.setItem('nhance_perms_granted','yes'))
  await page.goto('http://127.0.0.1:4180?operator&operator-portal')
  await bell.waitFor();await home.getByText('Breakdown — EX-001').waitFor()
  await bell.click();await panel.getByText('Breakdown — EX-001').waitFor()
  const operatorBounds=await panel.boundingBox();assert.ok(operatorBounds.x>=0&&operatorBounds.x+operatorBounds.width<=390)
  assert.equal(await home.getByRole('button',{name:'Review details'}).count(),0)
  assert.deepEqual(errors, [])
  console.log('Navigation browser checks passed: approval icon/rail, independent counts, recipient/company filters, read persistence, error recovery, legacy approvals, permissions, Chat fallback, responsive panels and themes.')
} finally { await browser?.close(); await server.close(); await rm(temporary, { recursive: true, force: true }) }
