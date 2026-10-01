import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.fleet-job-browser-'))
const artifacts = resolve(process.env.FLEET_JOB_ARTIFACT_DIR || 'test-artifacts/fleet-jobs')
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
    schedule_name: '250 hour service', interval_hours: 250, next_due_meter: 1240, tasks: ['Change oil', 'Inspect filters'] }],
}
await writeFile(join(temporary, 'supabase.js'), `
const tables = ${JSON.stringify(tables)};
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
          await new Promise(done => setTimeout(done, 80));
          if (mode === 'update') rows.forEach(row => Object.assign(row, payload, { updated_at: new Date().toISOString() }));
          else { const row = { ...payload, id: 'unexpected-insert' }; (tables[table] ||= []).push(row); rows = [row]; }
        } else window.reads.push({ table, filters: filterValues });
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
import WorkshopBoardTab from ${JSON.stringify(join(root, 'src/pages/maintenance/WorkshopBoardTab.jsx'))};
import ${JSON.stringify(join(root, 'src/index.css'))};
document.documentElement.setAttribute('data-theme', 'dark'); window.clearToasts = () => toast.remove();
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.invalidations = []; const invalidate = client.invalidateQueries.bind(client);
client.invalidateQueries = options => { window.invalidations.push(options.queryKey); return invalidate(options); };
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><div style={{ height: '100vh', position: 'relative' }}>
{window.location.search.includes('workshop') ? <WorkshopBoardTab companyId="company" role="admin" initialStatus="all" />
  : <FleetPage initialEquipmentId="eq1" onNavigate={() => {}} />}</div><Toaster /></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary,
  plugins: [react(), { name: 'mock-fleet-jobs', enforce: 'pre', resolveId(source) {
    if (/\/supabase(\.js)?$/.test(source)) return join(temporary, 'supabase.js')
    if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary, 'auth.js')
  } }], css: { postcss: { plugins: [tailwindcss({ config: join(root, 'tailwind.config.js') }), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 4182, fs: { allow: [root] } } })
let browser
try {
  await server.listen()
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Kolkata' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const machine = page.getByRole('dialog', { name: /Equipment 360/ })
  const create = page.getByRole('dialog', { name: 'New workshop job card', exact: true })
  const detail = number => page.getByRole('dialog', { name: 'Job card ' + number, exact: true })
  const openFleet = async (search = '') => {
    await page.goto('http://127.0.0.1:4182/' + search)
    await machine.getByRole('button', { name: 'Maintenance', exact: true }).click()
    await page.getByText('JC-DEMO-001', { exact: true }).waitFor()
  }
  const finishAnimation = () => machine.evaluate(el => Promise.all(el.getAnimations({ subtree: true })
    .filter(animation => animation.effect.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))))
  await openFleet()
  assert.equal(await page.getByText('JC-OTHER-MACHINE', { exact: true }).count(), 0)
  assert.ok(await page.evaluate(() => window.reads.some(read => read.table === 'job_cards' &&
    read.filters.some(([key,value]) => key === 'company_id' && value === 'company') &&
    read.filters.some(([key,value]) => key === 'equipment_id' && value === 'eq1'))))
  await finishAnimation()
  await machine.getByText('Workshop execution board', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(artifacts, 'fleet-job-cards-desktop.png'), fullPage: true })
  await machine.getByRole('button', { name: 'New job card', exact: true }).click()
  assert.equal(await create.getByLabel(/^Equipment \*/).inputValue(), 'eq1')
  assert.equal(await create.getByLabel(/^Equipment \*/).isDisabled(), true)
  assert.equal(await create.getByLabel(/^Project/).inputValue(), 'p1')
  await create.getByLabel('Complaint / reported problem *').fill('Hydraulic hose leaking near pump')
  await create.getByLabel(/^Assign technician/).selectOption('tech1')
  await create.getByLabel(/^Priority/).selectOption('critical')
  await finishAnimation()
  await page.screenshot({ path: join(artifacts, 'fleet-job-create-desktop.png'), fullPage: true })
  await page.evaluate(() => { window.failRpc = true })
  await create.getByRole('button', { name: 'Create job card', exact: true }).click()
  await create.getByRole('alert').getByText('Creation failed. Please retry.').waitFor()
  assert.equal(await create.getByLabel('Complaint / reported problem *').inputValue(), 'Hydraulic hose leaking near pump')
  await create.getByRole('button', { name: 'Create job card', exact: true }).click()
  const newJob = detail('JC-DEMO-NEW')
  await newJob.waitFor()
  const created = await page.evaluate(() => ({ jobs: window.mockTables.job_cards, rpcs: window.rpcs, writes: window.writes }))
  assert.equal(created.jobs.length, 5)
  assert.equal(created.writes.length, 0)
  const params = created.rpcs.at(-1).params
  assert.equal(params.p_equipment_id, 'eq1'); assert.equal(params.p_meter_at_open, 1250)
  assert.equal(params.p_project_id, 'p1'); assert.equal(params.p_technician_id, 'tech1')
  assert.equal(params.p_priority, 'critical'); assert.equal(params.p_complaint, 'Hydraulic hose leaking near pump')
  await newJob.getByRole('button', { name: 'Start work', exact: true }).click()
  await page.getByText('Moved to In Progress', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.mockTables.job_cards.find(row => row.id === 'new-job').workflow_stage), 'in_progress')
  assert.deepEqual(await page.evaluate(() => window.rpcs.find(call => call.name === 'transition_workshop_job').params),
    { p_job_card_id: 'new-job', p_stage: 'in_progress', p_note: null, p_meter_at_close: null, p_test_result: 'pending' })
  await page.keyboard.press('Escape'); await newJob.waitFor({ state: 'hidden' }); await machine.waitFor()
  await page.getByRole('button', { name: /JC-DEMO-001 Open/ }).click()
  const job = detail('JC-DEMO-001')
  await job.getByLabel('Diagnosis').fill('Split return hose')
  await job.getByLabel('Root cause').fill('Hose abrasion at clamp')
  await job.getByLabel('Work completed').fill('Replaced damaged return hose')
  await job.getByLabel('Labour cost').fill('1800')
  await job.getByLabel(/^Test result/).selectOption('passed')
  await page.evaluate(() => { window.failSave = true })
  await job.getByRole('button', { name: 'Save details', exact: true }).click()
  await page.getByText('Save failed. Please retry.', { exact: true }).waitFor()
  assert.equal(await job.getByLabel('Diagnosis').inputValue(), 'Split return hose')
  await job.getByRole('button', { name: 'Save details', exact: true }).click()
  await page.getByText('Job card details saved', { exact: true }).waitFor()
  await job.getByRole('button', { name: 'Save details', exact: true }).waitFor({ state: 'visible' })
  const saved = await page.evaluate(() => ({ rows: window.mockTables.job_cards, writes: window.writes, invalidations: window.invalidations }))
  assert.equal(saved.rows[0].diagnosis, 'Split return hose'); assert.equal(saved.rows[0].labor_cost, 1800)
  assert.equal(saved.rows[0].workflow_stage, 'open'); assert.equal(saved.rows[3].diagnosis, undefined)
  assert.deepEqual(saved.writes.at(-1).matchedIds, ['job1'])
  assert.equal('status' in saved.writes.at(-1).payload, false)
  assert.equal('workflow_stage' in saved.writes.at(-1).payload, false)
  for (const key of ['job_cards', 'maint_records', 'workshop-board', 'equipment', 'pm_schedules'])
    assert.ok(saved.invalidations.some(query => query[0] === key))
  await page.evaluate(() => window.clearToasts())
  await page.getByText('Job card details saved', { exact: true }).waitFor({ state: 'hidden' })
  await job.evaluate(el => { el.querySelector('.overflow-y-auto').scrollTop = 0 })
  await finishAnimation()
  await page.screenshot({ path: join(artifacts, 'fleet-job-edit-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.deepEqual(await job.boundingBox(), { x: 0, y: 0, width: 390, height: 844 })
  assert.equal(await job.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await page.screenshot({ path: join(artifacts, 'fleet-job-edit-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 740 })
  assert.equal(await job.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await page.keyboard.press('Escape'); await job.waitFor({ state: 'hidden' }); await machine.waitFor()
  await machine.getByRole('button', { name: 'New job card', exact: true }).click()
  assert.deepEqual(await create.boundingBox(), { x: 0, y: 0, width: 320, height: 740 })
  assert.equal(await create.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await page.keyboard.press('Escape'); await create.waitFor({ state: 'hidden' }); await machine.waitFor()
  await page.setViewportSize({ width: 1440, height: 1000 })

  // No row returned after a concurrent edit must keep the user's correction and report the conflict.
  await openFleet(); await page.getByRole('button', { name: /JC-DEMO-001 Open/ }).click()
  await job.getByLabel('Diagnosis').fill('My pending correction')
  await page.evaluate(() => { window.mockTables.job_cards[0].updated_at = '2099-01-01T00:00:00.000Z' })
  await job.getByRole('button', { name: 'Save details', exact: true }).click()
  await page.getByText('This job card changed or is no longer available. Reopen it before saving.', { exact: true }).waitFor()
  assert.equal(await job.getByLabel('Diagnosis').inputValue(), 'My pending correction')
  assert.equal(await page.evaluate(() => window.mockTables.job_cards[0].diagnosis), undefined)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /JC-DEMO-CLOSED Closed/ }).click()
  const closed = detail('JC-DEMO-CLOSED')
  assert.equal(await closed.getByLabel('Diagnosis').isDisabled(), true)
  assert.equal(await closed.getByRole('button', { name: 'Save details', exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /JC-DEMO-APPROVAL Approval/ }).click()
  const approval = detail('JC-DEMO-APPROVAL')
  const release = approval.getByRole('button', { name: 'Approve & release', exact: true })
  assert.equal(await release.isDisabled(), true)
  await approval.getByLabel('Diagnosis').fill('Hose leak')
  await approval.getByLabel('Work completed').fill('Hose replaced')
  await approval.getByLabel(/^Test result/).selectOption('passed')
  for (const label of ['Safety guards fitted', 'Leak check completed', 'Trial run completed'])
    await approval.getByLabel(label, { exact: true }).check()
  assert.equal(await release.isEnabled(), true)
  await release.click()
  await approval.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.mockTables.job_cards.find(row => row.id === 'approval1').workflow_stage), 'closed')
  await machine.getByRole('button', { name: 'PM Schedules', exact: true }).click()
  await machine.getByRole('button', { name: 'Raise Job Card for this PM', exact: true }).click()
  const pm = detail('JC-DEMO-PM')
  await pm.waitFor()
  assert.equal(await pm.getByLabel('Meter at release *').count(), 1)
  await page.keyboard.press('Escape')
  await machine.getByRole('button', { name: 'PM Schedules', exact: true }).click()
  await machine.getByRole('button', { name: 'Raise Job Card for this PM', exact: true }).click()
  await pm.waitFor()
  assert.equal(await page.evaluate(() => window.mockTables.job_cards.filter(row => row.pm_schedule_id === 'pm1').length), 1)
  assert.deepEqual(await page.evaluate(() => window.rpcs.filter(call => call.name === 'open_pm_job').map(call => call.params)), [{ p_schedule_id: 'pm1' }, { p_schedule_id: 'pm1' }])

  for (const role of ['supervisor', 'manager']) {
    await openFleet('?role=' + role)
    assert.equal(await machine.getByRole('button', { name: 'New job card', exact: true }).count(), 1)
    await page.getByRole('button', { name: /JC-DEMO-APPROVAL Approval/ }).click()
    assert.equal(await approval.getByRole('button', { name: 'Approve & release', exact: true }).count(), role === 'manager' ? 1 : 0)
  }
  for (const search of ['?role=accounts', '?role=operator', '?module-off']) {
    await openFleet(search)
    assert.equal(await machine.getByRole('button', { name: 'New job card', exact: true }).count(), 0)
    await machine.getByRole('button', { name: 'PM Schedules', exact: true }).click()
    assert.equal(await machine.getByRole('button', { name: 'Raise Job Card for this PM', exact: true }).count(), 0)
  }
  // The company-wide Workshop still lets users select a machine.
  await page.goto('http://127.0.0.1:4182/?workshop')
  await page.getByRole('button', { name: 'New job card', exact: true }).click()
  assert.equal(await create.getByLabel(/^Equipment \*/).isEnabled(), true)
  await create.getByLabel(/^Equipment \*/).selectOption('eq2')
  assert.equal(await create.getByLabel(/^Project/).inputValue(), 'p1')
  await create.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.deepEqual(errors, [])
  console.log('Fleet job-card browser checks passed: machine scope, create/retry, atomic RPC, edit/retry/conflict, refreshed data, closed records, release checks, PM reuse, role/module access, nested Escape, mobile layouts, and company-wide Workshop.')
} catch (error) {
  const pages = browser?.contexts().flatMap(context => context.pages()) || []
  for (const page of pages) await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await browser?.close(); await server.close(); await rm(temporary, { recursive: true, force: true })
}
