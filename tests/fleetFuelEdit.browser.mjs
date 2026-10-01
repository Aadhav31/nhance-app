import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'

const root = resolve('.')
const temporary = await mkdtemp(join(root, '.fleet-fuel-browser-'))
const artifacts = resolve(process.env.FLEET_FUEL_ARTIFACT_DIR || 'test-artifacts/fleet-fuel')
await mkdir(artifacts, { recursive: true })
const date = new Date().toISOString().slice(0, 10)
const equipment = { id: 'eq1', company_id: 'company', name: 'Demo Excavator', equipment_number: 'EX-001',
  category: 'Excavator', meter_type: 'both', current_meter_reading: 1250, status: 'active', ownership_type: 'own' }
const fuel = { id: 'fuel1', company_id: 'company', equipment_id: equipment.id, equipment, shift_id: null,
  quantity_liters: 100, rate_per_liter: 90, total_amount: 9000, meter_at_filling: 0, km_at_filling: 0,
  vendor_name: 'Demo Fuel Station', invoice_number: 'DEMO-001', delivered_by_name: 'Demo Driver', notes: 'Original note',
  fuel_source: 'client', issued_by: 'reporter', receipt_url: 'original-receipt',
  filling_location: 'Demo construction site', location_address: 'Demo construction site', location_lat: 11.2, location_lng: 78.8,
  fuel_photo_url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="gold"/></svg>',
  created_at: date + 'T04:00:00.123Z', entry_time: date + 'T04:00:00.123Z' }
await writeFile(join(temporary, 'supabase.js'), `
const tables = ${JSON.stringify({ equipment: [equipment], shift_fuel_entries: [fuel, { ...fuel, id: 'fuel2', invoice_number: 'DEMO-002', quantity_liters: 5, total_amount: 450 }] })};
if (window.location.search.includes('no-rate')) { tables.shift_fuel_entries[0].rate_per_liter = null; tables.shift_fuel_entries[0].total_amount = 1200; }
window.mockTables = tables; window.writes = []; window.reads = [];
const equal = (a, b) => a == null && b == null || String(a) === String(b);
export const supabase = {
  from(table) {
    let filters = [], mode = 'read', payload, single = false, count = false, ordering;
    const q = {
      select(fields, options) { count = !!options?.count; return q; },
      eq(key, value) { filters.push(row => equal(row[key], value)); return q; },
      is(key, value) { filters.push(row => equal(row[key], value)); return q; },
      gte(key, value) { filters.push(row => String(row[key]) >= value); return q; },
      lte(key, value) { filters.push(row => String(row[key]) <= value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      not() { return q; }, or() { return q; }, neq() { return q; }, limit() { return q; }, range() { return q; },
      order(key, options) { ordering = { key, asc: options?.ascending !== false }; return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      update(value) { mode = 'update'; payload = value; return q; },
      insert(value) { mode = 'insert'; payload = value; return q; },
      async then(resolve) {
        let rows = (tables[table] || []).filter(row => filters.every(f => f(row)));
        if (mode !== 'read') {
          window.writes.push({ table, mode, payload: structuredClone(payload), matchedIds: rows.map(row => row.id) });
          if (window.failNext) { window.failNext = false; return resolve({ error: { message: 'Save failed. Please retry.' }, data: null }); }
          await new Promise(done => setTimeout(done, 80));
          if (mode === 'update') rows.forEach(row => Object.assign(row, payload));
          else { const row = { ...payload, id: 'new-fuel', equipment }; tables[table].push(row); rows = [row]; }
        } else window.reads.push(table);
        if (ordering) rows = [...rows].sort((a,b) => String(a[ordering.key]).localeCompare(String(b[ordering.key])) * (ordering.asc ? 1 : -1));
        return resolve({ data: structuredClone(single ? rows[0] || null : rows), error: null, count: count ? rows.length : null });
      }
    }; return q;
  }, rpc: async () => ({ data: [], error: null })
};
const equipment = tables.equipment[0];
`)
await writeFile(join(temporary, 'auth.js'), `export const useAuth = () => ({ companyId: 'company',
  role: new URLSearchParams(window.location.search).get('role') || 'admin', industryType: 'construction',
  userProfile: { id: 'admin', full_name: 'Demo Admin' }, session: { user: { id: 'admin' } }, company: {} });`)
await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>')
await writeFile(join(temporary, 'main.jsx'), `import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { Toaster } from 'react-hot-toast';
import FleetPage from ${JSON.stringify(join(root, 'src/pages/fleet/FleetPage.jsx'))}; import ${JSON.stringify(join(root, 'src/index.css'))};
document.documentElement.setAttribute('data-theme', 'dark');
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.invalidations = []; const invalidate = client.invalidateQueries.bind(client);
client.invalidateQueries = options => { window.invalidations.push(options.queryKey); return invalidate(options); };
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><div style={{ height: '100vh', position: 'relative' }}>
<FleetPage initialEquipmentId={window.location.search.includes('machine') ? 'eq1' : null} onNavigate={() => {}} /></div><Toaster /></QueryClientProvider>);`)
const server = await createServer({ configFile: false, root: temporary,
  plugins: [react(), { name: 'mock-fleet-fuel', enforce: 'pre', resolveId(source) {
    if (/\/supabase(\.js)?$/.test(source)) return join(temporary, 'supabase.js')
    if (/\/AuthContext(\.jsx)?$/.test(source)) return join(temporary, 'auth.js')
  } }], css: { postcss: { plugins: [tailwindcss({ config: join(root, 'tailwind.config.js') }), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 4181, fs: { allow: [root] } } })
let browser
try {
  await server.listen()
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, timezoneId: 'Asia/Kolkata' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const openFilled = async (search = '') => {
    await page.goto('http://127.0.0.1:4181/' + search)
    await page.getByRole('button', { name: 'Fuel', exact: true }).click()
    await page.getByRole('button', { name: /Filled/ }).click()
    await page.getByText('Invoice: DEMO-001', { exact: true }).waitFor()
  }
  const edit = page.getByRole('button', { name: 'Edit fuel entry DEMO-001', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Edit Fuel Entry — Demo Excavator', exact: true })
  const save = () => dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  const finishAnimation = () => dialog.evaluate(el => Promise.all(el.getAnimations({ subtree: true })
    .filter(animation => animation.effect.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))))
  await openFilled()
  await page.screenshot({ path: join(artifacts, 'fleet-fuel-edit-list.png'), fullPage: true })
  await edit.click()
  for (const [label, value] of [['Quantity (Litres)', '100'], ['Rate per Litre (₹)', '90'],
    ['Hour Meter at Filling (hrs)', '0'], ['Odometer at Filling (km)', '0'], ['Invoice No.', 'DEMO-001'], ['Entry Date', date]]) {
    assert.equal(await dialog.getByLabel(label, { exact: true }).inputValue(), value)
  }
  assert.equal(await dialog.getByLabel('Vendor / Fuel Station', { exact: true }).inputValue(), 'Demo Fuel Station')
  await dialog.getByText('Demo construction site', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '✓ Photo taken', exact: true }).waitFor()
  await dialog.getByLabel('Quantity (Litres)', { exact: true }).fill('-1')
  await save(); assert.match(await dialog.getByRole('alert').innerText(), /greater than zero/)
  assert.equal(await page.evaluate(() => window.writes.length), 0)
  await dialog.getByLabel('Quantity (Litres)', { exact: true }).fill('85')
  await dialog.getByLabel('Rate per Litre (₹)', { exact: true }).fill('95')
  await dialog.getByLabel('Invoice No.', { exact: true }).fill('DEMO-CORRECTED')
  await dialog.getByPlaceholder('Supplier name').fill('Corrected Demo Station')
  await dialog.getByPlaceholder('Any remarks…').fill('Corrected receipt details')
  await dialog.getByText('₹8,075', { exact: true }).waitFor()
  assert.equal(await dialog.getByRole('alert').count(), 0)
  await finishAnimation()
  await page.screenshot({ path: join(artifacts, 'fleet-fuel-edit-desktop.png'), fullPage: true })
  await page.evaluate(() => { window.failNext = true })
  await save(); assert.match(await dialog.getByRole('alert').innerText(), /retry/)
  assert.equal(await dialog.getByLabel('Quantity (Litres)', { exact: true }).inputValue(), '85')
  await save(); await dialog.waitFor({ state: 'hidden' })
  await page.getByText('Invoice: DEMO-CORRECTED', { exact: true }).waitFor()
  const result = await page.evaluate(() => ({ rows: window.mockTables.shift_fuel_entries, writes: window.writes, invalidations: window.invalidations }))
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].quantity_liters, 85); assert.equal(result.rows[0].total_amount, 8075)
  assert.equal(result.rows[0].vendor_name, 'Corrected Demo Station'); assert.equal(result.rows[0].notes, 'Corrected receipt details')
  for (const key of ['issued_by', 'receipt_url', 'fuel_source', 'shift_id', 'fuel_photo_url', 'location_lat', 'location_lng', 'location_address']) assert.equal(result.rows[0][key], fuel[key])
  assert.equal(result.rows[1].quantity_liters, 5)
  assert.equal(result.writes.filter(w => w.mode === 'insert').length, 0)
  assert.deepEqual(result.writes[1].matchedIds, ['fuel1'])
  for (const key of ['all_fuel', 'equipment_fuel_stats', 'fuel_reconciliation_fills', 'monthly_fuel']) assert.ok(result.invalidations.some(q => q[0] === key))

  // A concurrent correction or an RLS-hidden/deleted row must not report success.
  await openFilled(); await edit.click()
  await dialog.getByLabel('Quantity (Litres)', { exact: true }).fill('70')
  await page.evaluate(() => { window.mockTables.shift_fuel_entries[0].quantity_liters = 120 })
  await save(); assert.match(await dialog.getByRole('alert').innerText(), /changed or is no longer available/)
  assert.equal(await page.evaluate(() => window.mockTables.shift_fuel_entries[0].quantity_liters), 120)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await page.evaluate(() => window.writes.length), 1)

  // Metadata-only corrections preserve a historic amount whose unit price is absent.
  await openFilled('?no-rate'); await edit.click()
  await dialog.getByLabel('Quantity (Litres)', { exact: true }).fill('90')
  await save(); assert.match(await dialog.getByRole('alert').innerText(), /unit price/)
  await dialog.getByLabel('Quantity (Litres)', { exact: true }).fill('100')
  await dialog.getByLabel('Invoice No.', { exact: true }).fill('DEMO-METADATA')
  await save(); await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.mockTables.shift_fuel_entries[0].total_amount), 1200)

  // Actual equipment panel: totals refresh, dates agree, and Escape leaves it open.
  await page.goto('http://127.0.0.1:4181/?machine')
  const machine = page.getByRole('dialog', { name: /Equipment 360/ })
  await machine.getByRole('button', { name: 'Fuel', exact: true }).click()
  await edit.click()
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); await machine.waitFor()
  await edit.click()
  const prior = new Date(date + 'T12:00:00Z'); prior.setUTCDate(prior.getUTCDate() - 1)
  const priorDate = prior.toISOString().slice(0, 10)
  await dialog.getByLabel('Entry Date', { exact: true }).fill(priorDate)
  await dialog.getByLabel('Quantity (Litres)', { exact: true }).fill('80')
  await dialog.getByLabel('Rate per Litre (₹)', { exact: true }).fill('95')
  await page.setViewportSize({ width: 390, height: 844 })
  await finishAnimation()
  await page.screenshot({ path: join(artifacts, 'fleet-fuel-edit-mobile.png'), fullPage: true })
  assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await page.setViewportSize({ width: 320, height: 740 })
  assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false)
  await save(); await dialog.waitFor({ state: 'hidden' })
  await machine.getByText('85.0 L · ₹8,050', { exact: true }).waitFor()
  const updated = await page.evaluate(() => window.mockTables.shift_fuel_entries[0])
  assert.equal(updated.created_at, updated.entry_time)
  assert.equal(updated.created_at.slice(0, 10), priorDate)
  assert.equal(updated.created_at.slice(11), fuel.created_at.slice(11))

  // The shared form still creates one new backdated entry.
  await machine.getByRole('button', { name: 'Log Fuel', exact: true }).last().click()
  const create = page.getByRole('dialog', { name: 'Fuel Entry — Demo Excavator', exact: true })
  await create.getByLabel('Entry Date', { exact: true }).fill(priorDate)
  await create.getByLabel('Quantity (Litres)', { exact: true }).fill('20')
  await create.getByLabel('Rate per Litre (₹)', { exact: true }).fill('90')
  await create.getByRole('button', { name: 'Log Fuel', exact: true }).click()
  await create.waitFor({ state: 'hidden' })
  const created = await page.evaluate(() => window.mockTables.shift_fuel_entries.at(-1))
  assert.equal(created.total_amount, 1800); assert.equal(created.created_at, created.entry_time)
  assert.equal(created.entry_time.slice(0, 10), priorDate)
  assert.equal(await page.evaluate(() => window.mockTables.shift_fuel_entries.length), 3)

  await page.setViewportSize({ width: 1440, height: 950 })
  for (const role of ['operator', 'supervisor']) {
    await openFilled('?role=' + role); assert.equal(await page.getByRole('button', { name: /Edit fuel entry/ }).count(), 0)
  }
  for (const role of ['manager', 'accounts', 'superadmin']) {
    await openFilled('?role=' + role); await edit.click(); await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  console.log('Fleet fuel edit browser checks passed: both entry points, prefilled values, receipt math, direct update without duplicates, preserved evidence, refreshed totals, validation, retry, concurrent edits, date/time, roles, nested Escape, and 390px/320px layouts.')
} finally {
  await browser?.close(); await server.close(); await rm(temporary, { recursive: true, force: true })
}
