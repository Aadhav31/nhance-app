import test from 'node:test'
import assert from 'node:assert/strict'
import { searchRecords, verifyInvoice, verifyUsageBilling } from '../api/_lib/assistantTools.js'
import handler from '../api/assistant.js'
import { runAssistant } from '../api/_lib/assistantEngine.js'

const companyId = '00000000-0000-4000-8000-000000000001'
const invoices = [{ id: '00000000-0000-4000-8000-000000000002', invoice_number: 'INV-7', invoice_date: '2026-09-01', due_date: '2026-08-20', client_name: 'Client A', total_amount: 100, balance_due: 120, status: 'draft' }]

function fakeDb(rows = invoices) {
  const calls = []
  return { calls, from(table) {
    const filters = []
    const builder = {
      select(fields) { calls.push({ table, fields }); return builder },
      eq(field, value) { filters.push([field, value]); return builder },
      or() { return builder }, order() { return builder }, limit() { return builder },
      then(resolve) { resolve({ data: rows.filter(r => filters.every(([key, value]) => key === 'company_id' || r[key] === value)), error: null }) },
    }
    return builder
  } }
}

test('role and module gate reads before a database query', async () => {
  const db = fakeDb()
  const ctx = { db, companyId, role: 'supervisor', modules: ['core', 'sales'] }
  assert.match((await searchRecords(ctx, { entity: 'invoices', query: 'INV' })).error, /unavailable/)
  assert.match((await verifyInvoice(ctx, { invoiceNumber: 'INV-7' })).error, /unavailable/)
  assert.match((await verifyUsageBilling(ctx, { deploymentId: invoices[0].id, month: '2026-09' })).error, /unavailable/)
  assert.equal(db.calls.length, 0)
})

test('verified invoice reports concerns and explicitly scopes to company', async () => {
  const db = fakeDb()
  const ctx = { db, companyId, role: 'accounts', modules: ['core', 'sales'] }
  const result = await verifyInvoice(ctx, { invoiceNumber: 'INV-7' })
  assert.equal(result.found, true)
  assert.match(result.concerns.join(' '), /Due date precedes/)
  assert.match(result.concerns.join(' '), /Balance exceeds/)
  assert.equal(result.source.extra.invoiceId, invoices[0].id)
  assert.equal(db.calls[0].table, 'client_invoices')
  assert.deepEqual(await searchRecords(ctx, { entity: 'projects', query: '' }), { error: 'This record type is unavailable to your role or company.' })
})

test('endpoint refuses unauthenticated requests and disallowed methods', async () => {
  const invoke = async method => {
    let status, payload
    const res = { setHeader() {}, status(code) { status = code; return { json(body) { payload = body } } } }
    await handler({ method, headers: {} }, res)
    return { status, payload }
  }
  assert.equal((await invoke('POST')).status, 401)
  assert.equal((await invoke('DELETE')).status, 405)
})

test('assistant calls a permitted live tool and keeps the response stateless', async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-only-key'
  const requests = []
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    requests.push(body)
    const output = requests.length === 1
      ? [{ type: 'function_call', name: 'verify_invoice', call_id: 'call-1', arguments: '{"invoiceNumber":"INV-7"}' }]
      : [{ type: 'message', content: [{ type: 'output_text', text: 'INV-7 needs review because its due date precedes the invoice date.' }] }]
    return { ok: true, json: async () => ({ status: 'completed', output }) }
  }
  try {
    const result = await runAssistant({ db: fakeDb(), companyId, userId: 'u1', role: 'accounts', modules: ['core', 'sales'] }, { message: 'Check INV-7', history: [], page: 'sales', threadId: 'thread-1' })
    assert.equal(requests.length, 2)
    assert.equal(requests[0].store, false)
    assert.equal(requests[1].input.at(-1).call_id, 'call-1')
    assert.match(requests[1].input.at(-1).output, /Due date precedes/)
    assert.equal(result.sources[0].extra.invoiceId, invoices[0].id)
  } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey }
})

test('generated content stays in a proposed draft until the user saves it', async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-only-key'
  let stored = null, count = 0
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ status: 'completed', output: ++count === 1
    ? [{ type: 'function_call', name: 'prepare_draft', call_id: 'call-draft', arguments: JSON.stringify({ kind: 'email', title: 'Site update', content: 'Dear team, here is the update.' }) }]
    : [{ type: 'message', content: [{ type: 'output_text', text: 'Your draft is ready for review.' }] }] }) })
  const db = { from(table) {
    assert.equal(table, 'assistant_artifacts')
    return { insert(value) {
      stored = value
      return { select() { return { single: async () => ({ data: { id: 'draft-id', kind: value.kind, title: value.title, content: value.content, status: 'proposed' }, error: null }) } } }
    } }
  } }
  try {
    const result = await runAssistant({ db, companyId, userId: 'user-id', role: 'manager', modules: ['core'] }, { message: 'Draft a site update email', history: [], page: 'dashboard', threadId: 'thread-id' })
    assert.equal(stored.company_id, companyId)
    assert.equal(stored.user_id, 'user-id')
    assert.equal(stored.status, undefined)
    assert.equal(result.artifacts[0].status, 'proposed')
  } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey }
})
