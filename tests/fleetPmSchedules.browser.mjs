import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.fleet-pm-browser-'))
const artifacts = resolve(process.env.FLEET_PM_ARTIFACT_DIR || 'test-artifacts/fleet-pm')
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
window.mockTables = tables; window.writes = []; window.reads = []; window.rpcs = [];
const equal = (a, b) => a == null && b == null || String(a) === String(b);
export const supabase = {
  from(table) {
    let filters = [], filterValues = [], mode = 'read', payload, single = false, count = false, ordering, max = Infinity;
    const q = {
      select(fields, options) { count = !!options?.count; return q; },
      eq(key, value) { filterValues.push([key,value]); filters.push(row => equal(row[key], value)); return q; },
      is(key, value) { filters.push(row => equal(row[key], value)); return q; },
      neq(key, value) { filters.push(row => !equal(row[key], value)); return q; },
      gte(key, value) { filters.push(row => String(row[key]) >= value); return q; },
      lte(key, value) { filters.push(row => String(row[key]) <= value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      not() { return q; }, or() { return q; }, range() { return q; },
      limit(value) { max = value; return q; },
      order(key, options) { ordering = { key, asc: options?.ascending !== false }; return q; },
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
          window.reads.push({ table, filters: filterValues });
          if (table === 'pm_schedules' && window.location.search.includes('load-error') && !window.readRecovered) return resolve({ data: null, error: { message: 'Schedule read failed' } });
        }
        if (ordering) rows = [...rows].sort((a,b) => String(a[ordering.key]).localeCompare(String(b[ordering.key])) * (ordering.asc ? 1 : -1));
        rows = rows.slice(0, max);
        return resolve({ data: structuredClone(single ? rows[0] || null : rows), error: null, count: count ? rows.length : null });
      }
    }; return q;
  },
  async rpc(name, params) {
    window.rpcs.push({ name, params: structuredClone(params) });
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
  hasModule: () => !window.location.search.includes('module-off'),
  userProfile: { id: 'admin', full_name: 'Demo Admin' }, session: { user: { id: 'admin' } }, company: {} });`)
await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary, 'main.jsx'), `import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import toast, { Toaster } from 'react-hot-toast';
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
  : <FleetPage initialEquipmentId="eq1" onNavigate={() => {}} />}</div><Toaster /></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary,
  plugins: [react(), { name: 'mock-fleet-pm', enforce: 'pre', resolveId(source) {
    if (/\/supabase(\.js)?$/.test(source)) return join(temporary, 'supabase.js')
    if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary, 'auth.js')
  } }], css: { postcss: { plugins: [tailwindcss({ config: join(root, 'tailwind.config.js') }), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 4183, fs: { allow: [root] } } })
let browser
try {
  await server.listen()
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Kolkata' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const machine = page.getByRole('dialog', { name: /Equipment 360/ })
  const create = page.getByRole('dialog', { name: 'New PM Schedule', exact: true })
  const edit = page.getByRole('dialog', { name: 'Edit PM Schedule', exact: true })
  const editButton = page.getByRole('button', { name: 'Edit PM schedule 250 hour service', exact: true })
  const openFleet = async (search = '', wait = true) => {
    await page.goto('http://127.0.0.1:4183/' + search)
    await machine.getByRole('button', { name: 'Maintenance', exact: true }).click()
    await machine.getByRole('button', { name: 'PM Schedules', exact: true }).click()
    if (wait) await machine.getByText('250 hour service', { exact: true }).waitFor()
  }
  const save = dialog => dialog.getByRole('button', { name: 'Save schedule', exact: true }).click()
  const clearToasts = () => page.evaluate(() => window.clearToasts())
  await openFleet()
  assert.equal(await page.getByText('Other machine schedule', { exact: true }).count(), 0)
  await machine.getByRole('button', { name: 'Add PM Schedule', exact: true }).click()
  assert.equal(await create.getByLabel(/^Equipment/).inputValue(), 'eq1')
  assert.equal(await create.getByLabel(/^Equipment/).isDisabled(), true)
  assert.equal(await create.getByLabel('Last service meter').inputValue(), '1250')
  assert.equal(await create.getByLabel('Next due meter').inputValue(), '')
  await create.getByLabel('Schedule name *').fill('')
  await save(create); await create.getByRole('alert').getByText('Enter a schedule name').waitFor()
  assert.equal(await page.evaluate(() => window.writes.length), 0)
  await create.getByLabel('Schedule name *').fill('500 hour service')
  await create.getByLabel('Service interval (hours) *').fill('0')
  await save(create); assert.match(await create.getByRole('alert').innerText(), /greater than zero/)
  await create.getByLabel('Service interval (hours) *').fill('500')
  await create.getByLabel('Last service meter').fill('-1')
  await save(create); assert.match(await create.getByRole('alert').innerText(), /positive/)
  await create.getByLabel('Last service meter').fill('1250')
  await create.getByLabel('Alert before (hours)').fill('75')
  await create.getByLabel('Service checklist').fill('Change oil\nInspect hydraulic hoses')
  await create.getByLabel('Notes').fill('Service plan for the selected machine')
  await create.getByLabel('Automatically create a PM work order').uncheck()
  await page.screenshot({ path: join(artifacts, 'fleet-pm-create-desktop.png'), fullPage: true })
  await page.evaluate(() => { window.failSave = true })
  await save(create); assert.match(await create.getByRole('alert').innerText(), /retry/)
  assert.equal(await create.getByLabel('Schedule name *').inputValue(), '500 hour service')
  await page.evaluate(() => { window.saveDelay = 500 })
  await save(create)
  assert.equal(await create.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true)
  await page.keyboard.press('Escape'); await create.waitFor()
  await create.waitFor({ state: 'hidden' })
  await machine.getByText('500 hour service', { exact: true }).waitFor()
  const inserted = await page.evaluate(() => window.mockTables.pm_schedules.find(row => row.id === 'pm-new'))
  assert.equal(inserted.equipment_id, 'eq1'); assert.equal(inserted.company_id, 'company')
  assert.equal(inserted.interval_hours, 500); assert.equal(inserted.last_done_meter, 1250)
  assert.equal(inserted.next_due_meter, 1750); assert.equal(inserted.alert_before_hours, 75)
  assert.equal(inserted.auto_create_job_card, false)
  assert.deepEqual(inserted.tasks, [{ task: 'Change oil', required: true }, { task: 'Inspect hydraulic hoses', required: true }])
  assert.equal(await page.evaluate(() => window.mockTables.pm_schedules.length), 3)
  await page.evaluate(() => { window.saveDelay = 80 })
  await clearToasts()
  await machine.getByText('500 hour service', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(artifacts, 'fleet-pm-schedules-desktop.png'), fullPage: true })

  await editButton.click()
  for (const [label, value] of [['Schedule name *', '250 hour service'], ['Service interval (hours) *', '250'],
    ['Last service meter', '0'], ['Next due meter', '1240'], ['Alert before (hours)', '20'], ['Last service date', date]]) {
    assert.equal(await edit.getByLabel(label).inputValue(), value)
  }
  assert.equal(await edit.getByLabel('Service checklist').inputValue(), 'Inspect hose\nChange oil')
  assert.equal(await edit.getByLabel('Automatically create a PM work order').isChecked(), false)
  await edit.getByLabel('Notes').fill('Edited service plan')
  await edit.getByLabel('Next due meter').fill('1300')
  await edit.getByLabel('Alert before (hours)').fill('10')
  await page.evaluate(() => { window.failSave = true })
  await save(edit); assert.match(await edit.getByRole('alert').innerText(), /retry/)
  assert.equal(await edit.getByLabel('Notes').inputValue(), 'Edited service plan')
  await save(edit); await edit.waitFor({ state: 'hidden' })
  await machine.getByText('10 hrs before due', { exact: true }).waitFor()
  assert.equal(await machine.getByRole('button', { name: 'Raise Job Card for this PM', exact: true }).count(), 0)
  const saved = await page.evaluate(() => ({ rows: window.mockTables.pm_schedules, writes: window.writes, invalidations: window.invalidations }))
  assert.equal(saved.rows[0].notes, 'Edited service plan')
  assert.equal(saved.rows[0].next_due_meter, 1300); assert.equal(saved.rows[0].last_done_meter, 0)
  assert.equal(saved.rows[0].created_by, 'creator'); assert.equal(saved.rows[0].created_at, stamp)
  assert.deepEqual(saved.rows[0].tasks, tables.pm_schedules[0].tasks)
  assert.equal(saved.rows[1].notes, 'Original note')
  assert.deepEqual(saved.writes.at(-1).matchedIds, ['pm1'])
  for (const pair of [['company_id', 'company'], ['equipment_id', 'eq1'], ['id', 'pm1']])
    assert.ok(saved.writes.at(-1).filters.some(filter => JSON.stringify(filter) === JSON.stringify(pair)))
  for (const key of ['pm_schedules', 'pm-planner', 'pm-control-tower', 'job_cards', 'workshop-board', 'maint_records'])
    assert.ok(saved.invalidations.some(query => query[0] === key))

  await editButton.click()
  await edit.getByLabel('Alert before (hours)').fill('100')
  const tomorrow = new Date(date + 'T12:00:00Z'); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  await edit.getByLabel('Calendar due date (optional)').fill(tomorrow.toISOString().slice(0, 10))
  await clearToasts()
  await edit.locator('.overflow-y-auto').evaluate(el => { el.scrollTop = 0 })
  await page.screenshot({ path: join(artifacts, 'fleet-pm-edit-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.deepEqual(await edit.boundingBox(), { x: 0, y: 0, width: 390, height: 844 })
  assert.equal(await edit.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await page.screenshot({ path: join(artifacts, 'fleet-pm-edit-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 740 })
  assert.equal(await edit.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await save(edit); await edit.waitFor({ state: 'hidden' })
  await machine.getByRole('button', { name: 'Raise Job Card for this PM', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.mockTables.pm_schedules[0].next_due_date), tomorrow.toISOString().slice(0, 10))
  await editButton.click()
  await page.keyboard.press('Escape'); await edit.waitFor({ state: 'hidden' }); await machine.waitFor()
  await machine.getByRole('button', { name: 'Add PM Schedule', exact: true }).click()
  assert.equal(await create.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await create.getByRole('button', { name: 'Close PM schedule', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  assert.equal(await create.getByRole('button', { name: 'Save schedule', exact: true }).evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Escape'); await create.waitFor({ state: 'hidden' }); await machine.waitFor()
  await page.setViewportSize({ width: 1440, height: 1000 })

  await openFleet(); await editButton.click()
  await edit.getByLabel('Notes').fill('My pending correction')
  await page.evaluate(() => { Object.assign(window.mockTables.pm_schedules[0], { notes: 'Another user correction', updated_at: '2099-01-01T00:00:00.000Z' }) })
  await save(edit); assert.match(await edit.getByRole('alert').innerText(), /changed or is no longer available/)
  assert.equal(await edit.getByLabel('Notes').inputValue(), 'My pending correction')
  assert.equal(await page.evaluate(() => window.mockTables.pm_schedules[0].notes), 'Another user correction')
  await page.keyboard.press('Escape')
  await openFleet(); await editButton.click()
  await page.evaluate(() => { window.mockTables.pm_schedules.splice(0, 1) })
  await save(edit); assert.match(await edit.getByRole('alert').innerText(), /changed or is no longer available/)
  await page.keyboard.press('Escape')

  await openFleet('?load-error', false)
  await machine.getByRole('alert').getByText(/PM schedules could not be loaded/).waitFor()
  await page.evaluate(() => { window.readRecovered = true })
  await machine.getByRole('button', { name: 'Retry', exact: true }).click()
  await machine.getByText('250 hour service', { exact: true }).waitFor()
  for (const role of ['supervisor', 'manager']) {
    await openFleet('?role=' + role)
    await machine.getByRole('button', { name: 'Add PM Schedule', exact: true }).click()
    await create.waitFor(); await page.keyboard.press('Escape')
    await editButton.click(); await edit.waitFor(); await page.keyboard.press('Escape')
  }
  for (const search of ['?role=accounts', '?role=operator', '?module-off']) {
    await openFleet(search)
    assert.equal(await machine.getByRole('button', { name: 'Add PM Schedule', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /Edit PM schedule/ }).count(), 0)
  }
  // The company-wide planner still supports choosing another machine and calculating its interval.
  await page.goto('http://127.0.0.1:4183/?planner')
  await page.getByRole('button', { name: 'New schedule', exact: true }).click()
  assert.equal(await create.getByLabel(/^Equipment/).isEnabled(), true)
  await create.getByLabel(/^Equipment/).selectOption('eq2')
  await create.getByLabel('Service interval (hours) *').fill('1000')
  assert.equal(await create.getByLabel('Next due meter').inputValue(), '')
  await create.getByLabel('Automatically create a PM work order').uncheck()
  await save(create); await create.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.mockTables.pm_schedules.find(row => row.id === 'pm-new').next_due_meter), 2250)
  await page.getByRole('button', { name: 'Edit 250 hour service', exact: true }).click()
  await edit.getByLabel('Notes').fill('Edited from Equipment Health')
  await save(edit); await edit.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.mockTables.pm_schedules[0].notes), 'Edited from Equipment Health')
  assert.deepEqual(errors, [])
  console.log('Fleet PM schedule browser checks passed: create/edit, selected machine, interval math, zero meter, checklist preservation, alert/date/automatic-order settings, retry, concurrent/deleted rows, refreshed queries, load retry, role/module access, focus/Escape, 390px/320px layout and company-wide planner.')
} catch (error) {
  const pages = browser?.contexts().flatMap(context => context.pages()) || []
  for (const page of pages) await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await browser?.close(); await server.close(); await rm(temporary, { recursive: true, force: true })
}
