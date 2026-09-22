import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '../src/lib/supabasePublic.js'
import { runAssistant } from './_lib/assistantEngine.js'
import { canAccessPage } from '../src/lib/navigation.js'

const send = (res, status, data) => res.status(status).json(data)
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const read = async request => { const { data, error } = await request; if (error) throw error; return data }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'Method not allowed' })
  const token = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return send(res, 401, { error: 'Sign in to use Ask Nhance.' })
  try {
    const url = process.env.SUPABASE_URL || PUBLIC_SUPABASE_URL
    const anon = process.env.SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY
    const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data: auth, error: authError } = await db.auth.getUser(token)
    if (authError || !auth.user) return send(res, 401, { error: 'Your session expired. Sign in again.' })
    const userId = auth.user.id
    const profile = await read(db.from('user_profiles').select('company_id,is_active').eq('id', userId).single())
    const role = await read(db.from('user_roles').select('role').eq('user_id', userId).single())
    if (!profile?.company_id || !profile.is_active || !['admin', 'manager', 'accounts', 'supervisor'].includes(role?.role)) return send(res, 403, { error: 'Ask Nhance is unavailable for this account.' })
    const company = await read(db.from('companies').select('id,is_active').eq('id', profile.company_id).single())
    if (!company?.is_active) return send(res, 403, { error: 'This company account is inactive.' })
    const modules = await read(db.from('company_modules').select('module_key').eq('company_id', profile.company_id).eq('is_enabled', true))
    const moduleKeys = (modules || []).map(x => x.module_key)
    if (!moduleKeys.includes('core')) return send(res, 403, { error: 'Core module is unavailable.' })
    const ctx = { db, userId, companyId: company.id, role: role.role, modules: moduleKeys }
    const threadId = req.method === 'GET' ? req.query.threadId : req.body?.threadId
    if (threadId && !validUuid(threadId)) return send(res, 400, { error: 'Invalid conversation.' })
    if (req.method === 'GET') {
      if (threadId) {
        const thread = await read(db.from('assistant_threads').select('id,title,created_at').eq('id', threadId).eq('company_id', company.id).eq('user_id', userId).maybeSingle())
        if (!thread) return send(res, 404, { error: 'Conversation not found.' })
        const [messages, artifacts] = await Promise.all([
          read(db.from('assistant_messages').select('id,role,content,sources,created_at').eq('company_id', company.id).eq('user_id', userId).eq('thread_id', threadId).order('created_at').limit(100)),
          read(db.from('assistant_artifacts').select('id,kind,title,content,status,created_at,saved_at').eq('company_id', company.id).eq('user_id', userId).eq('thread_id', threadId).order('created_at').limit(100)),
        ])
        return send(res, 200, { thread, messages, artifacts })
      }
      const threads = await read(db.from('assistant_threads').select('id,title,updated_at').eq('company_id', company.id).eq('user_id', userId).order('updated_at', { ascending: false }).limit(30))
      return send(res, 200, { threads, ready: Boolean(process.env.OPENAI_API_KEY) })
    }
    const action = req.body?.action || 'chat'
    if (action === 'save_artifact') {
      if (!validUuid(threadId) || !validUuid(req.body?.artifactId)) return send(res, 400, { error: 'Invalid draft.' })
      const thread = await read(db.from('assistant_threads').select('id').eq('id', threadId).eq('company_id', company.id).eq('user_id', userId).maybeSingle())
      if (!thread) return send(res, 404, { error: 'Conversation not found.' })
      const artifact = await read(db.from('assistant_artifacts').select('id,status').eq('id', req.body.artifactId).eq('thread_id', threadId).eq('company_id', company.id).eq('user_id', userId).maybeSingle())
      if (!artifact) return send(res, 404, { error: 'Draft not found.' })
      if (artifact.status === 'saved') return send(res, 200, { artifact })
      const saved = await read(db.from('assistant_artifacts').update({ status: 'saved', saved_at: new Date().toISOString() }).eq('id', artifact.id).eq('thread_id', threadId).eq('company_id', company.id).eq('user_id', userId).select('id,status,saved_at').single())
      return send(res, 200, { artifact: saved })
    }
    if (action !== 'chat') return send(res, 400, { error: 'Unknown action.' })
    if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'Ask Nhance needs an OpenAI API key configured by the app administrator.' })
    const message = req.body?.message
    if (typeof message !== 'string' || !message.trim() || message.length > 2000) return send(res, 400, { error: 'Enter a message under 2,000 characters.' })
    const cutoff = new Date(Date.now() - 3600000).toISOString()
    const { count, error: rateError } = await db.from('assistant_messages').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('user_id', userId).eq('role', 'user').gte('created_at', cutoff)
    if (rateError) throw rateError
    if (count >= 40) return send(res, 429, { error: 'You have reached the hourly assistant limit. Try again later.' })
    let thread
    if (threadId) {
      thread = await read(db.from('assistant_threads').select('id').eq('id', threadId).eq('company_id', company.id).eq('user_id', userId).maybeSingle())
      if (!thread) return send(res, 404, { error: 'Conversation not found.' })
    } else thread = await read(db.from('assistant_threads').insert({ company_id: company.id, user_id: userId, title: message.trim().slice(0, 90) }).select('id').single())
    const previous = await read(db.from('assistant_messages').select('role,content').eq('company_id', company.id).eq('user_id', userId).eq('thread_id', thread.id).order('created_at', { ascending: false }).limit(8))
    await read(db.from('assistant_messages').insert({ thread_id: thread.id, company_id: company.id, user_id: userId, role: 'user', content: message.trim() }))
    const requestedPage = typeof req.body?.page === 'string' ? req.body.page : 'dashboard'
    const page = canAccessPage(requestedPage, { role: ctx.role, hasModule: key => moduleKeys.includes(key) }) ? requestedPage : 'dashboard'
    const result = await runAssistant(ctx, { message: message.trim(), history: (previous || []).reverse(), page, threadId: thread.id })
    const assistant = await read(db.from('assistant_messages').insert({ thread_id: thread.id, company_id: company.id, user_id: userId, role: 'assistant', content: result.answer, sources: result.sources }).select('id,role,content,sources,created_at').single())
    await read(db.from('assistant_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread.id).eq('company_id', company.id).eq('user_id', userId))
    return send(res, 200, { threadId: thread.id, message: assistant, artifacts: result.artifacts })
  } catch (error) {
    console.error('Assistant request failed', error?.message || error)
    return send(res, 500, { error: /^AI_/.test(error?.message || '') ? 'The AI service is temporarily unavailable. Please try again.' : 'Unable to complete this request right now.' })
  }
}
