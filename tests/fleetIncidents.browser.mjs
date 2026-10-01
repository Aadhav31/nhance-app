import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.fleet-incident-browser-'))
const artifacts = resolve(process.env.FLEET_INCIDENT_ARTIFACT_DIR || 'test-artifacts/fleet-incidents')
await mkdir(artifacts, { recursive: true })
const date = new Date().toISOString().slice(0, 10)
const stamp = date + 'T04:00:00.000Z'
const equipment = { id: 'eq1', company_id: 'company', name: 'Demo Excavator', equipment_number: 'EX-001',
  category: 'Excavator', meter_type: 'hours', current_meter_reading: 1250, status: 'active',
  ownership_type: 'own', current_project_id: 'p1' }
const otherEquipment = { ...equipment, id: 'eq2', name: 'Demo Loader', equipment_number: 'LD-002' }
const project = { id: 'p1', company_id: 'company', project_name: 'Demo construction site', project_code: 'DEMO' }
const base = { company_id: 'company', equipment_id: equipment.id, equipment, equipment_name: equipment.name,
  project_id: project.id, project, jc_type: 'inspection', priority: 'normal', status: 'open',
  workflow_stage: 'open', complaint: 'Inspect the hydraulic hose', opened_date: date, opened_at: stamp,
  created_at: stamp, updated_at: stamp, meter_at_open: 1250, test_result: 'pending',
  job_card_parts: [], job_card_events: [], completion_checklist: {} }
const tables = {
  equipment: [equipment, otherEquipment], projects: [project],
  user_profiles: [{ id: 'tech1', company_id: 'company', full_name: 'Demo Technician', designation: 'Mechanic', is_active: true }],
  job_cards: [
    { ...base, id: 'job1', jc_number: 'JC-DEMO-001' },
    { ...base, id: 'closed1', jc_number: 'JC-DEMO-CLOSED', status: 'closed', workflow_stage: 'closed', diagnosis: 'Completed inspection' },
    { ...base, id: 'approval1', jc_number: 'JC-DEMO-APPROVAL', workflow_stage: 'pending_approval' },
    { ...base, id: 'other1', jc_number: 'JC-OTHER-MACHINE', equipment_id: 'eq2', equipment: otherEquipment },
  ],
  pm_schedules: [{ id: 'pm1', company_id: 'company', equipment_id: 'eq1', is_active: true,
    schedule_name: '250 hour service', interval_hours: 250, last_done_meter: 0, last_done_date: date, next_due_meter: 1240, next_due_date: '', alert_before_hours: 20, auto_create_job_card: false, notes: 'Original note', created_by: 'creator', created_at: stamp, updated_at: stamp, tasks: [{ task: 'Inspect hose', required: false, category: 'Hydraulics' }, 'Change oil'] }],
}
await writeFile(join(temporary, 'supabase.js'), `
const tables = ${JSON.stringify(tables)};
tables.pm_schedules.push({ ...tables.pm_schedules[0], id: 'pm2', equipment_id: 'eq2', schedule_name: 'Other machine schedule' });
tables.job_cards = []; tables.pm_schedules = [];
if(window.location.search.includes('disposed')) tables.equipment[0].status='disposed';
if(window.location.search.includes('global')) {
 const common={company_id:'company',resolved:false,created_at:${JSON.stringify(stamp)},incident_time:${JSON.stringify(stamp)},job_card_id:null,description:'Demo incident',incident_type:'other',equipment_id:'eq1',equipment:tables.equipment[0]};
 tables.shift_incidents=[
  {...common,id:'global-breakdown',incident_type:'breakdown',job_card_id:'global-job',description:'Hydraulic hose burst',breakdown_cause:'Hydraulic hose burst',rectification_needed:'Replace hose and pressure test'},
  {...common,id:'global-near-miss',equipment_id:'eq2',equipment:tables.equipment[1],shift_id:'shift-1',incident_type:'near_miss',severity:'high',description:'Load swung near the operator',action_taken:'Work stopped; exclusion area marked'},
  {...common,id:'global-damage',incident_type:'damage',description:'Bucket struck by truck',damage_cause:'Impact during unloading',what_needs_to_be_done:'Inspect bucket and mounting pins'},
  {...common,id:'global-resolved',resolved:true,incident_type:'safety_issue',description:'Emergency stop switch inspected',action_taken:'Switch replaced',resolved_by:'admin'},
  {...common,id:'foreign-report',company_id:'foreign',equipment:{name:'Foreign company machine'},description:'Private report'},
  ...Array.from({length:56},(_,index)=>({...common,id:'old-'+index,description:'Older incident '+index,created_at:'2026-09-20T04:00:00Z',incident_time:'2026-09-20T04:00:00Z'}))
 ];
 tables.shift_incidents.find(row=>row.id==='old-0').resolved=null;
 if(window.location.search.includes('global-large')) tables.shift_incidents.push(...Array.from({length:1050},(_,index)=>({...common,id:'large-'+String(index).padStart(4,'0'),description:index===0?'Oldest incident beyond API cap':'Large history '+index,created_at:'2025-09-20T04:00:00Z',incident_time:'2025-09-20T04:00:00Z'})));
 if(window.location.search.includes('empty')) tables.shift_incidents=[];
 if(window.location.search.includes('all-resolved')) tables.shift_incidents.forEach(row=>row.resolved=true);
}

window.emails = []; window.navigations = []; window.mockTables = tables; window.writes = []; window.reads = []; window.rpcs = [];
const equal = (a, b) => a == null && b == null || String(a) === String(b);
export const supabase = {
  functions: { async invoke(name, options) { window.emails.push({ name, options }); return {data: {}, error: null}; } },
  from(table) {
    let filters = [], filterValues = [], mode = 'read', payload, single = false, count = false, ordering = [], max = Infinity, offset=0, selectedFields;
    const q = {
      select(fields, options) { selectedFields=fields; count = !!options?.count; return q; },
      eq(key, value) { filterValues.push([key,value]); filters.push(row => equal(row[key], value)); return q; },
      is(key, value) { filterValues.push([key,value]); filters.push(row => equal(row[key], value)); return q; },
      neq(key, value) { filterValues.push([key,'neq',value]); filters.push(row => !equal(row[key], value)); return q; },
      gte(key, value) { filters.push(row => String(row[key]) >= value); return q; },
      lte(key, value) { filters.push(row => String(row[key]) <= value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      not() { return q; }, or(value) { if(value==='resolved.eq.false,resolved.is.null') {filterValues.push(['or',value]); filters.push(row=>row.resolved!==true);}return q; }, range(from,to) {offset=from; max=to-from+1; return q; },
      limit(value) { max = value; return q; },
      order(key, options) { ordering.push({ key, asc: options?.ascending !== false }); return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      update(value) { mode = 'update'; payload = value; return q; },
      insert(value) { mode = 'insert'; payload = value; return q; },
      async then(resolve) {
        let rows = (tables[table] || []).filter(row => filters.every(f => f(row)));
        if (mode !== 'read') {
          window.writes.push({ table, mode, payload: structuredClone(payload), filters: filterValues, matchedIds: rows.map(row => row.id) });
          if (window.failSave) { window.failSave = false; return resolve({ error: { message: 'Save failed. Please retry.' }, data: null }); }
          await new Promise(done => setTimeout(done, window.saveDelay || 80));
          if (mode === 'update') rows.forEach(row => Object.assign(row, payload, { updated_at: new Date().toISOString() }));
          else { const row = { ...payload, id: 'pm-new', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: 'admin' }; (tables[table] ||= []).push(row); rows = [row]; }
        } else {
          window.reads.push({ table, fields: selectedFields, filters: filterValues, max, offset });
          if(table==='shift_incidents' && window.failMore && offset>0) {window.failMore=false; return resolve({data:null,error:{message:'More reports failed'}});}
          if(table==='shift_incidents' && window.location.search.includes('global-load-error') && !window.readRecovered) return resolve({data:null,error:{message:'Could not read incident table'}});
          if (table === 'pm_schedules' && window.location.search.includes('load-error') && !window.readRecovered) return resolve({ data: null, error: { message: 'Schedule read failed' } });
        }
        const total=rows.length;
        if (ordering.length) rows = [...rows].sort((a,b) => {for(const sort of ordering){const compared=String(a[sort.key]).localeCompare(String(b[sort.key]))*(sort.asc?1:-1); if(compared) return compared;}return 0;});
        rows = rows.slice(offset, offset+Math.min(max,1000));
        return resolve({ data: structuredClone(single ? rows[0] || null : rows), error: null, count: count ? total : null });
      }
    }; return q;
  },
  async rpc(name, params) {
    window.rpcs.push({ name, params: structuredClone(params) });
    if (name === 'report_equipment_incident') {
      await new Promise(done => setTimeout(done, window.saveDelay || 80));
      if (window.failRpc) { window.failRpc=false; return {data:null,error:{message:'Save failed. Please retry.',code:'P0001'}}; }
      const existing=(tables.shift_incidents||[]).find(row=>row.id===params.p_incident_id);
      if(existing) return {data:{incident_id:existing.id,created:false,alert_created:false},error:null};
      const details=params.p_details;
      const machine=tables.equipment.find(row=>row.id===params.p_equipment_id);
      const incident={...details,id:params.p_incident_id,company_id:'company',equipment_id:machine.id,shift_id:null,reported_by:'admin',resolved:false,incident_time:details.occurred_at,created_at:details.occurred_at};
      (tables.shift_incidents||=[]).push(incident);
      let createdAlert=false;
      if(details.incident_type==='breakdown') {
        machine.status='breakdown';
        if(!(tables.breakdown_alerts||[]).some(row=>!row.resolved_at)) {
          (tables.breakdown_alerts||=[]).push({id:'alert-1',company_id:'company',equipment_id:machine.id,incident_id:incident.id,breakdown_cause:details.breakdown_cause,reported_at:details.occurred_at,notify_chain:[]});
          createdAlert=true;
        }
        if(!tables.job_cards.length) tables.job_cards.push({id:'job-1',company_id:'company',equipment_id:machine.id,equipment:machine,equipment_name:machine.name,jc_number:'JC-DEMO-NEW',jc_type:'breakdown',status:'open',workflow_stage:'open',complaint:details.breakdown_cause,priority:'high',created_at:details.occurred_at,updated_at:details.occurred_at,opened_at:details.occurred_at,opened_date:details.occurred_at.slice(0,10),job_card_parts:[],job_card_events:[]});
        (tables.maintenance_records||=[]).push({id:'record-1',company_id:'company',equipment_id:machine.id,job_card_id:'job-1',maintenance_type:'breakdown',description:details.breakdown_cause,service_date:details.occurred_at.slice(0,10),status:'open'});
      } else if(['regular_maintenance','unscheduled_maintenance'].includes(details.incident_type)) machine.status='maintenance';
      if(['breakdown','damage','theft','safety_issue','accident'].includes(details.incident_type))
        (tables.notifications||=[]).push({id:'notice-'+incident.id,company_id:'company',type:'incident_'+details.incident_type,title:details.incident_type+' — '+machine.name,body:details.description,is_read:false,created_at:new Date().toISOString()});
      if(window.loseResponse) {window.loseResponse=false; return {data:null,error:{message:'Connection lost. Please retry.'}};}
      return {data:{incident_id:incident.id,created:true,alert_created:createdAlert,reported_at:details.occurred_at,notify_chain:[]},error:null};
    }
    if (window.failRpc) { window.failRpc = false; return { data: null, error: { message: 'Creation failed. Please retry.' } }; }
    await new Promise(done => setTimeout(done, 80));
    if (name === 'create_workshop_job' || name === 'open_pm_job') {
      const pm = name === 'open_pm_job';
      const existing = pm && tables.job_cards.find(row => row.pm_schedule_id === params.p_schedule_id);
      if (existing) return { data: existing.id, error: null };
      const machine = tables.equipment.find(row => row.id === (pm ? 'eq1' : params.p_equipment_id));
      const id = pm ? 'pm-job' : 'new-job';
      const type = pm ? 'pm_service' : params.p_jc_type;
      const technician = tables.user_profiles.find(row => row.id === params.p_technician_id);
      const job = { ...tables.job_cards[0], id, jc_number: pm ? 'JC-DEMO-PM' : 'JC-DEMO-NEW',
        equipment_id: machine.id, equipment: machine, equipment_name: machine.name,
        jc_type: type, complaint: pm ? '250 hour service' : params.p_complaint, priority: params.p_priority || 'normal',
        technician_id: technician?.id || null, technician_name: technician?.full_name || null,
        workflow_stage: technician ? 'assigned' : 'open', pm_schedule_id: pm ? params.p_schedule_id : null,
        meter_at_open: machine.current_meter_reading, updated_at: new Date().toISOString() };
      tables.job_cards.push(job);
      (tables.maintenance_records ||= []).push({ id: 'record-' + id, equipment_id: machine.id, service_date: ${JSON.stringify(date)}, job_card_id: id });
      if (type === 'breakdown') machine.status = 'breakdown';
      return { data: id, error: null };
    }
    if (name === 'transition_workshop_job') {
      const job = tables.job_cards.find(row => row.id === params.p_job_card_id);
      job.workflow_stage = params.p_stage; job.updated_at = new Date().toISOString();
      return { data: null, error: null };
    }
    return { data: [], error: null };
  }
};
`)
await writeFile(join(temporary, 'auth.js'), `export const useAuth = () => ({ companyId: 'company',
  role: new URLSearchParams(window.location.search).get('role') || 'admin', industryType: 'construction',
  hasModule: name => !window.location.search.includes('module-off') && !(name==='maintenance' && window.location.search.includes('maintenance-off')),
  userProfile: { id: 'admin', full_name: 'Demo Admin' }, session: { user: { id: 'admin' } }, company: {} });`)
await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary, 'main.jsx'), `import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import toast, { Toaster } from 'react-hot-toast';
import NotificationBell from ${JSON.stringify(join(root, 'src/components/layout/NotificationBell.jsx'))};
import FleetPage from ${JSON.stringify(join(root, 'src/pages/fleet/FleetPage.jsx'))};
import PreventiveMaintenanceTab from ${JSON.stringify(join(root, 'src/pages/maintenance/PreventiveMaintenanceTab.jsx'))};
import WorkshopBoardTab from ${JSON.stringify(join(root, 'src/pages/maintenance/WorkshopBoardTab.jsx'))};
import ${JSON.stringify(join(root, 'src/index.css'))};
document.documentElement.setAttribute('data-theme', 'dark'); window.clearToasts = () => toast.remove();
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.invalidations = []; const invalidate = client.invalidateQueries.bind(client);
client.invalidateQueries = options => { window.invalidations.push(options.queryKey); return invalidate(options); };
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><div style={{ height: '100vh', position: 'relative' }}>
{window.location.search.includes('planner') ? <PreventiveMaintenanceTab companyId="company" role="admin" /> : window.location.search.includes('workshop') ? <WorkshopBoardTab companyId="company" role="admin" initialStatus="all" />
  : <><div style={{position:"absolute",right:8,top:8,zIndex:60}}><NotificationBell onNavigate={page=>window.navigations.push(page)} /></div><FleetPage initialEquipmentId={window.location.search.includes('global') ? null : "eq1"} onNavigate={(...args)=>window.navigations.push(args)} /></>}</div><Toaster /></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary,
  plugins: [react(), { name: 'mock-fleet-incidents', enforce: 'pre', resolveId(source) {
    if (/\/supabase(\.js)?$/.test(source)) return join(temporary, 'supabase.js')
    if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary, 'auth.js')
  } }], css: { postcss: { plugins: [tailwindcss({ config: join(root, 'tailwind.config.js') }), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 4184, fs: { allow: [root] } } })
let browser
try {
  await server.listen()
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Kolkata' })
  const errors=[]; page.on('pageerror',error=>errors.push(error.message))
  const machine = page.getByRole('dialog',{name:/Equipment 360/})
  const modal = page.getByRole('dialog',{name:'Report Incident — Demo Excavator',exact:true})
  const reportButton=machine.getByRole('button',{name:'Report Incident',exact:true})
  const open=async (search='')=>{await page.goto('http://127.0.0.1:4184/'+search); await reportButton.waitFor(); await reportButton.click(); await modal.waitFor(); await modal.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))}
  const submit=()=>modal.getByRole('button',{name:'Report Incident',exact:true}).click()
  await open()
  assert.equal(await page.evaluate(()=>window.navigations.length),0)
  assert.match(await modal.innerText(),/shift entry is optional/)
  const localToday=await page.evaluate(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})
  assert.equal(await modal.getByLabel('Incident Date',{exact:true}).inputValue(),localToday)
  await modal.getByLabel('Incident Type',{exact:true}).selectOption('breakdown')
  await submit(); await modal.getByRole('alert').getByText('Cause of breakdown is required').waitFor()
  assert.equal(await page.evaluate(()=>window.rpcs.length),0)
  await modal.getByLabel('Incident Date',{exact:true}).fill('2026-09-29')
  await modal.getByLabel('Cause of breakdown',{exact:true}).fill('Hydraulic hose burst')
  await modal.getByLabel('What needs to be done to fix it',{exact:true}).fill('Replace hose and pressure test')
  await page.screenshot({path:join(artifacts,'fleet-incident-report-desktop.png'),fullPage:true})
  await page.evaluate(()=>{window.failRpc=true})
  await submit(); await modal.getByRole('alert').getByText('Save failed. Please retry.').waitFor()
  assert.equal(await modal.getByLabel('Cause of breakdown',{exact:true}).inputValue(),'Hydraulic hose burst')
  assert.equal(await page.evaluate(()=>window.mockTables.shift_incidents?.length||0),0)
  await page.evaluate(()=>{window.saveDelay=500})
  await submit(); assert.equal(await modal.getByRole('button',{name:'Cancel',exact:true}).isDisabled(),true)
  assert.equal(await modal.getByLabel('Cause of breakdown',{exact:true}).isDisabled(),true)
  await page.keyboard.press('Escape'); await modal.waitFor()
  await modal.waitFor({state:'hidden'})
  await machine.getByText(/1 Open Incident/).waitFor()
  await machine.getByText('Equipment Availability',{exact:true}).locator('..').getByText('Breakdown',{exact:true}).waitFor()
  const saved=await page.evaluate(()=>({rpcs:window.rpcs,tables:window.mockTables,invalidations:window.invalidations,emails:window.emails}))
  assert.equal(saved.rpcs.length,2); assert.equal(saved.rpcs[0].params.p_incident_id,saved.rpcs[1].params.p_incident_id)
  assert.equal(saved.rpcs[1].params.p_equipment_id,'eq1')
  assert.equal(saved.rpcs[1].params.p_details.description,'Hydraulic hose burst')
  assert.equal(saved.tables.shift_incidents.length,1); assert.equal(saved.tables.shift_incidents[0].shift_id,null)
  assert.equal(saved.tables.equipment[1].status,'active'); assert.equal(saved.tables.job_cards.length,1)
  assert.equal(saved.emails.length,1)
  for(const key of ['incidents','equipment','equipment_incident_log','equipment_breakdown_log','workshop-board','notifications'])
    assert.ok(saved.invalidations.some(value=>value[0]===key),key+' was refreshed')
  await page.getByRole('button',{name:'Notifications',exact:true}).click()
  await page.getByRole('dialog',{name:'Notifications',exact:true}).getByText('Hydraulic hose burst',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Close notifications',exact:true}).click()
  await machine.getByRole('button',{name:'Timeline',exact:true}).click()
  await machine.getByText('Hydraulic hose burst',{exact:true}).first().waitFor()
  await machine.getByRole('button',{name:'Maintenance',exact:true}).click()
  await machine.getByText('JC-DEMO-NEW',{exact:true}).waitFor()
  await page.screenshot({path:join(artifacts,'fleet-incident-workshop-desktop.png'),fullPage:true})

  // A committed report with a lost response is confirmed on retry, without duplicate alerts.
  await open()
  await modal.getByLabel('Incident Type',{exact:true}).selectOption('breakdown')
  await modal.getByLabel('Cause of breakdown',{exact:true}).fill('Engine overheating')
  await page.evaluate(()=>{window.loseResponse=true})
  await submit(); await modal.getByRole('alert').getByText(/Connection lost. Please retry./).waitFor()
  assert.equal(await modal.getByLabel('Cause of breakdown',{exact:true}).isDisabled(),true)
  await submit(); await modal.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(()=>window.mockTables.shift_incidents.length),1)
  assert.equal(await page.evaluate(()=>window.mockTables.job_cards.length),1)
  const retried=await page.evaluate(()=>window.rpcs)
  assert.equal(retried[0].params.p_incident_id,retried[1].params.p_incident_id)
  assert.deepEqual(retried[0].params.p_details,retried[1].params.p_details)

  await open()
  await modal.getByLabel('Incident Type',{exact:true}).selectOption('damage')
  await submit(); await modal.getByRole('alert').getByText('Describe how the damage happened').waitFor()
  await modal.getByLabel('How did the damage happen?',{exact:true}).fill('Bucket struck by truck')
  await submit(); await modal.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(()=>window.rpcs.at(-1).params.p_details.description),'Bucket struck by truck')
  for(const [type,label] of [['regular_maintenance','Description'],['unscheduled_maintenance','Description'],['theft','What was stolen?'],['safety_issue','What is the safety issue?'],['accident','What happened?'],['near_miss','What almost happened?'],['other','Description']]) {
    await open(); await modal.getByLabel('Incident Type',{exact:true}).selectOption(type)
    await modal.getByLabel(label,{exact:true}).fill('Demo '+type+' report')
    if(type==='accident') {await modal.getByRole('button',{name:'High',exact:true}).click(); assert.equal(await modal.getByRole('button',{name:'High',exact:true}).getAttribute('aria-pressed'),'true')}
    await submit(); await modal.waitFor({state:'hidden'})
    assert.equal(await page.evaluate(()=>window.mockTables.shift_incidents[0].incident_type),type)
  }
  // Switching type must not send hidden breakdown details.
  await open(); await modal.getByLabel('Incident Type',{exact:true}).selectOption('breakdown')
  await modal.getByLabel('Cause of breakdown',{exact:true}).fill('Stale cause')
  await modal.getByLabel('Incident Type',{exact:true}).selectOption('other')
  await modal.getByLabel('Description',{exact:true}).fill('Different issue')
  await submit(); await modal.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(()=>window.rpcs.at(-1).params.p_details.breakdown_cause),null)
  await open(); await page.keyboard.press('Escape'); await modal.waitFor({state:'hidden'}); await machine.waitFor()
  for(const query of ['?role=accounts','?role=operator','?module-off','?disposed']) {
    await page.goto('http://127.0.0.1:4184/'+query); await machine.waitFor()
    assert.equal(await reportButton.count(),0)
  }
  await open('?role=supervisor'); await page.keyboard.press('Escape'); await modal.waitFor({state:'hidden'})
  await open('?role=manager'); await page.keyboard.press('Escape'); await modal.waitFor({state:'hidden'})
  await page.setViewportSize({width:390,height:844})
  await open()
  await modal.getByLabel('Incident Type',{exact:true}).selectOption('breakdown')
  await modal.getByLabel('Cause of breakdown',{exact:true}).fill('Hydraulic hose burst')
  await modal.getByLabel('What needs to be done to fix it',{exact:true}).fill('Replace hose and pressure test')
  const mobileBox=await modal.boundingBox(); assert.equal(mobileBox.x,0); assert.equal(mobileBox.width,390)
  await page.screenshot({path:join(artifacts,'fleet-incident-report-mobile.png'),fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
  await submit(); await modal.waitFor({state:'hidden'}); await machine.getByText(/1 Open Incident/).waitFor()
  await page.setViewportSize({width:320,height:740}); await open();
  const smallBox=await modal.boundingBox(); assert.equal(smallBox.x,0); assert.equal(smallBox.width,320)
  await page.keyboard.press('Escape'); await modal.waitFor({state:'hidden'}); await machine.waitFor()
  // The Fleet tab opens a company-wide register without navigating to Operations.
  await page.setViewportSize({width:1440,height:1000})
  const register=page.getByRole('region',{name:'Company incidents',exact:true})
  const incidentsTab=page.getByRole('button',{name:'Incidents',exact:true})
  const openGlobal=async search=>{
    await page.goto('http://127.0.0.1:4184/'+(search||'?global'));
    await incidentsTab.click(); await register.waitFor();
  }
  const nearMiss=register.getByRole('article',{name:'Near Miss — Demo Loader',exact:true})
  const breakdown=register.getByRole('article',{name:'Breakdown — Demo Excavator',exact:true})
  await openGlobal()
  await register.getByText('Showing 50 of 60 reports across all machines',{exact:true}).waitFor()
  assert.equal(await incidentsTab.getAttribute('aria-pressed'),'true')
  assert.equal(await page.evaluate(()=>window.navigations.length),0)
  assert.equal(await register.getByText('Private report',{exact:true}).count(),0)
  await nearMiss.getByText(/Shift report/).waitFor(); await breakdown.getByText(/Standalone report/).waitFor()
  assert.equal(await breakdown.getByRole('button',{name:'Resolve',exact:true}).count(),0)
  await breakdown.getByRole('button',{name:'Review in Workshop',exact:true}).click()
  assert.deepEqual(await page.evaluate(()=>window.navigations.at(-1)),['maintenance',{tab:'workshop',workshopStatus:'all',equipmentId:'eq1'}])
  await page.screenshot({path:join(artifacts,'fleet-global-incidents-desktop.png'),fullPage:true})
  await page.evaluate(()=>{window.failMore=true})
  await register.getByRole('button',{name:'Load more reports',exact:true}).click()
  await register.getByRole('alert').getByText('Could not load more reports.',{exact:true}).waitFor()
  assert.equal(await register.getByRole('article').count(),50)
  await register.getByRole('button',{name:'Try again',exact:true}).click()
  await register.getByText('Showing 60 of 60 reports across all machines',{exact:true}).waitFor()
  assert.equal(await register.getByRole('article').count(),60)
  assert.equal(await register.getByRole('button',{name:'Load more reports',exact:true}).count(),0)
  await register.getByRole('button',{name:'Open reports',exact:true}).click()
  await register.getByText('Showing 50 of 59 open reports across all machines',{exact:true}).waitFor()
  assert.equal(await register.getByText('Emergency stop switch inspected',{exact:true}).count(),0)
  await register.getByRole('button',{name:'Resolved reports',exact:true}).click()
  await register.getByText('Showing 1 of 1 resolved reports across all machines',{exact:true}).waitFor()
  assert.equal(await register.getByRole('button',{name:'Resolve',exact:true}).count(),0)
  await register.getByRole('button',{name:'All reports',exact:true}).click(); await nearMiss.waitFor()
  await page.evaluate(()=>{window.failSave=true})
  await nearMiss.getByRole('button',{name:'Resolve',exact:true}).click()
  await register.getByRole('alert').getByText('Save failed. Please retry.',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.mockTables.shift_incidents.find(row=>row.id==='global-near-miss').resolved),false)
  await page.evaluate(()=>{window.saveDelay=400})
  await nearMiss.getByRole('button',{name:'Resolve',exact:true}).click()
  await nearMiss.getByRole('button',{name:'Resolving…',exact:true}).waitFor()
  assert.equal(await register.getByRole('article',{name:'Damage / Broken — Demo Excavator',exact:true}).getByRole('button',{name:'Resolve',exact:true}).isDisabled(),true)
  await nearMiss.getByText('Resolved',{exact:true}).waitFor()
  assert.equal(await nearMiss.getByRole('button',{name:'Resolve',exact:true}).count(),0)
  const resolution=await page.evaluate(()=>({writes:window.writes,rows:window.mockTables.shift_incidents,invalidations:window.invalidations,reads:window.reads}))
  const resolved=resolution.rows.find(row=>row.id==='global-near-miss')
  assert.equal(resolved.resolved,true); assert.equal(resolved.resolved_by,'admin'); assert.ok(resolved.resolved_at)
  assert.equal(resolved.shift_id,'shift-1'); assert.equal(resolved.action_taken,'Work stopped; exclusion area marked')
  assert.equal(resolution.rows.find(row=>row.id==='foreign-report').resolved,false)
  assert.equal(resolution.rows.find(row=>row.id==='global-breakdown').resolved,false)
  const write=resolution.writes.at(-1)
  assert.deepEqual(write.matchedIds,['global-near-miss'])
  for(const filter of [['company_id','company'],['id','global-near-miss'],['or','resolved.eq.false,resolved.is.null'],['job_card_id',null],['incident_type','neq','breakdown']])
    assert.ok(write.filters.some(value=>JSON.stringify(value)===JSON.stringify(filter)))
  for(const key of ['all_incidents','incidents','equipment_incident_log','shift_incidents_detail'])
    assert.ok(resolution.invalidations.some(value=>value[0]===key))
  const registerReads=resolution.reads.filter(value=>value.fields==='*, equipment(name, category, equipment_number)')
  assert.ok(registerReads.length); assert.ok(registerReads.every(value=>value.filters.some(filter=>JSON.stringify(filter)===JSON.stringify(['company_id','company']))))
  await openGlobal('?global-load-error')
  await register.getByRole('alert').getByText('Could not load incidents.',{exact:true}).waitFor()
  assert.equal(await register.getByText('No incidents reported',{exact:true}).count(),0)
  await page.evaluate(()=>{window.readRecovered=true})
  await register.getByRole('button',{name:'Try again',exact:true}).click(); await nearMiss.waitFor()
  await openGlobal('?global-empty'); await register.getByText('No incidents reported',{exact:true}).waitFor()
  await openGlobal('?global-all-resolved'); await register.getByRole('button',{name:'Open reports',exact:true}).click()
  await register.getByText('No open incidents',{exact:true}).waitFor()
  // A job linked after loading must block the stale direct resolve action.
  await openGlobal(); await nearMiss.waitFor()
  await page.evaluate(()=>{window.mockTables.shift_incidents.find(row=>row.id==='global-near-miss').job_card_id='newly-linked-job'})
  await nearMiss.getByRole('button',{name:'Resolve',exact:true}).click()
  await register.getByRole('alert').getByText(/This report changed or was already resolved/).waitFor()
  await nearMiss.getByRole('button',{name:'Review in Workshop',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.mockTables.shift_incidents.find(row=>row.id==='global-near-miss').resolved),false)
  for(const query of ['?global&role=accounts','?global&role=operator','?global&module-off']) {
    await page.goto('http://127.0.0.1:4184/'+query); await page.getByRole('heading',{name:'Equipments & Machineries',exact:true}).waitFor()
    assert.equal(await incidentsTab.count(),0); assert.equal(await register.count(),0)
  }
  for(const role of ['supervisor','manager']) {
    await openGlobal('?global&role='+role); await nearMiss.getByRole('button',{name:'Resolve',exact:true}).waitFor()
  }
  await openGlobal('?global&maintenance-off'); await breakdown.getByText('Resolve through Workshop',{exact:true}).waitFor()
  assert.equal(await breakdown.getByRole('button',{name:'Review in Workshop',exact:true}).count(),0)
  await nearMiss.getByRole('button',{name:'Resolve',exact:true}).waitFor()
  // Legacy rows with a null resolved flag still count as open and can be resolved.
  await openGlobal(); await register.getByRole('button',{name:'Open reports',exact:true}).click()
  await register.getByRole('button',{name:'Load more reports',exact:true}).click()
  await register.getByText('Showing 59 of 59 open reports across all machines',{exact:true}).waitFor()
  await register.getByText('Older incident 0',{exact:true}).locator('..').getByRole('button',{name:'Resolve',exact:true}).click()
  await register.getByText('Showing 58 of 58 open reports across all machines',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.mockTables.shift_incidents.find(row=>row.id==='old-0').resolved),true)
  await openGlobal('?global-large')
  await register.getByText('Showing 50 of 1110 reports across all machines',{exact:true}).waitFor()
  for(let count=0;count<22;count++) {
    const more=register.getByRole('button',{name:'Load more reports',exact:true})
    if(!await more.count()) break
    await more.click()
    await register.getByText('Showing '+Math.min((count+2)*50,1110)+' of 1110 reports across all machines',{exact:true}).waitFor()
  }
  await register.getByText('Oldest incident beyond API cap',{exact:true}).waitFor()
  assert.equal(await register.getByRole('article').count(),1110)
  assert.equal(await register.getByRole('button',{name:'Load more reports',exact:true}).count(),0)
  const largeReads=await page.evaluate(()=>window.reads.filter(row=>row.fields==='*, equipment(name, category, equipment_number)'))
  assert.ok(largeReads.some(row=>row.offset>=1000)); assert.ok(largeReads.every(row=>row.max===50))
  await page.setViewportSize({width:390,height:844}); await openGlobal(); await breakdown.waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
  await page.screenshot({path:join(artifacts,'fleet-global-incidents-mobile.png'),fullPage:true})
  await page.setViewportSize({width:320,height:740}); await openGlobal(); await nearMiss.waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
  assert.deepEqual(errors,[])
  console.log('PASS: company-wide Fleet incidents, all/open/resolved filters, older reports, both sources, tenant-scoped resolution/retry, linked-job protection, errors/empty states, roles and mobile')
  console.log('PASS: direct Fleet reporting, all types, optional notes/shift, validation, retries, status/history/workshop/notification refresh, roles/modules, nested Escape and mobile')
} finally {
  if(browser) await browser.close()
  await server.close()
  await rm(temporary,{recursive:true,force:true})
}
