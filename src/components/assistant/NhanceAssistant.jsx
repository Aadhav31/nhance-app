import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, Plus, ChevronLeft, FileText, Copy, Download, Check, ExternalLink, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const suggestions = {
  control_tower: ['Which machines need attention?', 'Explain the control tower'],
  fleet: ['Show idle equipment', 'How do I review a machine?'],
  maintenance: ['Show open job cards', 'How does Equipment Health work?'],
  operations: ['Show recent daily logs', 'How do I submit a log?'],
  usage_billing: ['Explain usage billing verification', 'Show hire contracts'],
  sales: ['Show recent invoices', 'How do I check an invoice?'],
}

export default function NhanceAssistant({ open, onClose, onOpen, page, onNavigate }) {
  const { session } = useAuth()
  const [threadId, setThreadId] = useState(null)
  const [threads, setThreads] = useState([])
  const [messages, setMessages] = useState([])
  const [artifacts, setArtifacts] = useState([])
  const [ready, setReady] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showThreads, setShowThreads] = useState(false)
  const [selectedArtifact, setSelectedArtifact] = useState(null)
  const scrollRef = useRef(null)

  const request = async (method, body, id) => {
    const token = session?.access_token
    if (!token) throw new Error('Sign in again to use the assistant.')
    const response = await fetch(`/api/assistant${id ? `?threadId=${encodeURIComponent(id)}` : ''}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.error || 'Assistant is unavailable. Try again.')
    return json
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    request('GET').then(data => { if (!cancelled) { setThreads(data.threads || []); setReady(data.ready !== false) } }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [open, session?.access_token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

  const loadThread = async id => {
    setBusy(true); setError('')
    try {
      const data = await request('GET', null, id)
      setThreadId(id); setMessages(data.messages || []); setArtifacts(data.artifacts || []); setShowThreads(false); setSelectedArtifact(null)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const newThread = () => { setThreadId(null); setMessages([]); setArtifacts([]); setShowThreads(false); setSelectedArtifact(null); setError('') }

  const submit = async value => {
    const prompt = value.trim()
    if (!prompt || busy) return
    setText(''); setError(''); setBusy(true)
    const tempId = `pending-${Date.now()}`
    setMessages(old => [...old, { id: tempId, role: 'user', content: prompt }])
    try {
      const result = await request('POST', { action: 'chat', message: prompt, threadId, page })
      setThreadId(result.threadId)
      setMessages(old => [...old.map(m => m.id === tempId ? { ...m, id: `${tempId}-sent` } : m), result.message])
      setArtifacts(old => [...old, ...(result.artifacts || [])])
      if (!threadId) setThreads(old => [{ id: result.threadId, title: prompt.slice(0, 90) }, ...old])
    } catch (e) {
      setMessages(old => old.filter(m => m.id !== tempId))
      setText(prompt)
      setError(e.message)
    } finally { setBusy(false) }
  }

  const saveDraft = async artifact => {
    setBusy(true); setError('')
    try {
      const result = await request('POST', { action: 'save_artifact', threadId, artifactId: artifact.id })
      setArtifacts(old => old.map(a => a.id === artifact.id ? { ...a, ...result.artifact } : a))
      setSelectedArtifact(old => old?.id === artifact.id ? { ...old, ...result.artifact } : old)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const downloadDraft = artifact => {
    const url = URL.createObjectURL(new Blob([`${artifact.title}\n\n${artifact.content}`], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `${artifact.title.replace(/[^a-z0-9 -]/gi, '').slice(0, 60) || 'draft'}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  const openSource = source => { onNavigate(source.page, source.extra || {}); onClose() }

  return <>
    {!open && <button type="button" onClick={onOpen} title="Ask Nhance" aria-label="Open Ask Nhance assistant" className={`fixed z-40 bottom-20 right-4 ${page === 'chat' ? '' : 'lg:hidden'} flex items-center gap-2 rounded-full bg-primary-600 px-4 py-3 text-white shadow-xl border border-primary-400/40`}><Sparkles size={19} /><span className="text-sm font-semibold">Ask Nhance</span></button>}
    {open && <div className="fixed inset-0 z-[90] bg-black/60 lg:bg-black/30" onClick={onClose} aria-hidden="true" />}
    {open && <section role="dialog" aria-modal="true" aria-label="Ask Nhance assistant" className="fixed z-[91] right-0 top-0 bottom-0 w-full sm:w-[440px] bg-dark-900 border-l border-dark-600 shadow-2xl flex flex-col text-slate-100">
      <header className="flex items-center gap-3 px-4 py-4 border-b border-dark-700 bg-dark-800">
        {showThreads || selectedArtifact ? <button type="button" onClick={() => { setShowThreads(false); setSelectedArtifact(null) }} aria-label="Back to conversation" className="p-1 text-slate-300 hover:text-white"><ChevronLeft size={21} /></button> : <span className="rounded-xl bg-primary-500/15 p-2 text-primary-300"><Sparkles size={19} /></span>}
        <div className="flex-1 min-w-0"><h2 className="font-semibold">Ask Nhance</h2><p className="text-xs text-slate-400">Guidance · verification · drafts</p></div>
        <button type="button" onClick={() => { setShowThreads(true); setSelectedArtifact(null) }} title="Conversations" aria-label="View conversations" className="p-2 hover:bg-dark-700 rounded-lg text-slate-300"><FileText size={18} /></button>
        <button type="button" onClick={newThread} title="New conversation" aria-label="New conversation" className="p-2 hover:bg-dark-700 rounded-lg text-slate-300"><Plus size={19} /></button>
        <button type="button" onClick={onClose} title="Close" aria-label="Close assistant" className="p-2 hover:bg-dark-700 rounded-lg text-slate-300"><X size={19} /></button>
      </header>

      {selectedArtifact ? <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div><p className="text-xs uppercase tracking-wide text-primary-300">{selectedArtifact.kind} · {selectedArtifact.status === 'saved' ? 'Saved draft' : 'Review draft'}</p><h3 className="mt-1 font-semibold text-lg">{selectedArtifact.title}</h3></div>
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed bg-dark-800 border border-dark-700 rounded-xl p-4">{selectedArtifact.content}</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-xs flex gap-1.5 items-center" onClick={() => navigator.clipboard.writeText(selectedArtifact.content).catch(() => setError('Copy failed. Try downloading the draft.'))}><Copy size={14} />Copy</button>
          <button type="button" className="btn-secondary text-xs flex gap-1.5 items-center" onClick={() => downloadDraft(selectedArtifact)}><Download size={14} />Download</button>
          {selectedArtifact.status !== 'saved' && <button type="button" disabled={busy} className="btn-primary text-xs flex gap-1.5 items-center" onClick={() => saveDraft(selectedArtifact)}><Check size={14} />Save reviewed draft</button>}
        </div><p className="text-xs text-slate-400">Saving keeps this draft in your private assistant history. Sending or filing it is a separate action.</p>
      </div> : showThreads ? <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <p className="text-xs uppercase font-semibold tracking-widest text-slate-400 mb-4">Your conversations</p>
        {threads.length === 0 && <p className="text-sm text-slate-400">No conversations yet.</p>}
        {threads.map(t => <button type="button" key={t.id} onClick={() => loadThread(t.id)} className="w-full text-left rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 px-4 py-3 text-sm truncate">{t.title}</button>)}
      </div> : <>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4" aria-live="polite">
          {messages.length === 0 && <div className="space-y-5"><div className="rounded-2xl bg-dark-800 border border-dark-700 p-4"><h3 className="font-semibold text-base">How can I help?</h3><p className="text-sm text-slate-400 mt-2">Ask me to find a record, verify an invoice or billing estimate, explain a workflow, or prepare a draft for your review.</p></div><div className="grid gap-2">{(suggestions[page] || ['Find recent records', 'Help me with this page', 'Draft a project update']).map(s => <button type="button" key={s} onClick={() => submit(s)} className="text-left text-sm rounded-xl border border-dark-700 hover:border-primary-500 bg-dark-800 px-3 py-3">{s}</button>)}</div></div>}
          {messages.map(m => <div key={m.id} className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words leading-relaxed ${m.role === 'user' ? 'ml-8 bg-primary-700/35 border border-primary-600/30' : 'mr-4 bg-dark-800 border border-dark-700'}`}><div>{m.content}</div>{m.sources?.length > 0 && <div className="border-t border-dark-600 mt-3 pt-2 flex flex-wrap gap-2">{m.sources.map((s, i) => <button type="button" key={`${s.page}-${s.id || i}`} onClick={() => openSource(s)} className="flex items-center gap-1 text-xs text-primary-300 hover:underline"><ExternalLink size={12} />{s.label}</button>)}</div>}</div>)}
          {artifacts.map(a => <button type="button" key={a.id} onClick={() => setSelectedArtifact(a)} className="w-full flex items-center gap-3 text-left rounded-xl border border-primary-600/30 bg-primary-500/10 p-3"><FileText size={19} className="text-primary-300 shrink-0" /><span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{a.title}</span><span className="text-xs text-slate-400">{a.status === 'saved' ? 'Saved draft' : 'Review draft'}</span></span><ExternalLink size={14} /></button>)}
          {busy && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" />Checking…</p>}
        </div>
        <div className="border-t border-dark-700 p-3 bg-dark-800">
          {error && <p role="alert" className="text-xs text-red-300 mb-2">{error}</p>}
          {!ready && <p className="text-xs text-amber-300 mb-2">An administrator needs to configure the assistant API key before questions can be answered.</p>}
          <form onSubmit={e => { e.preventDefault(); submit(text) }} className="flex items-end gap-2"><label htmlFor="nhance-ai-message" className="sr-only">Message Ask Nhance</label><textarea id="nhance-ai-message" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(text) } }} maxLength={2000} rows={2} placeholder="Ask about this page or your records…" className="flex-1 resize-none bg-dark-900 border border-dark-600 rounded-xl p-3 text-sm focus:outline-none focus:border-primary-400" /><button type="submit" disabled={!text.trim() || busy || !ready} aria-label="Send message" className="p-3 bg-primary-600 disabled:opacity-40 rounded-xl text-white"><Send size={18} /></button></form>
          <p className="text-[11px] text-slate-500 mt-2">Relevant records are shared with the AI service to answer. Check figures and drafts before use.</p>
        </div>
      </>}
    </section>}
  </>
}
