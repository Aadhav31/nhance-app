import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  StickyNote, Plus, X, Pin, PinOff, Trash2,
  ChevronLeft, Search, Palette,
} from 'lucide-react'

// ── Color palette ─────────────────────────────────────────────────────────────
const COLORS = {
  yellow: { bg: '#fef9c3', border: '#fde047', text: '#713f12', dot: 'bg-yellow-300' },
  blue:   { bg: '#dbeafe', border: '#93c5fd', text: '#1e3a5f', dot: 'bg-blue-300'   },
  green:  { bg: '#dcfce7', border: '#86efac', text: '#14532d', dot: 'bg-green-300'  },
  pink:   { bg: '#fce7f3', border: '#f9a8d4', text: '#831843', dot: 'bg-pink-300'   },
  purple: { bg: '#ede9fe', border: '#c4b5fd', text: '#3b0764', dot: 'bg-violet-300' },
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ── Note card (list view) ─────────────────────────────────────────────────────
function NoteCard({ note, onEdit, onPin, onDelete }) {
  const c = COLORS[note.color] || COLORS.yellow
  return (
    <div
      onClick={() => onEdit(note)}
      className="rounded-xl border p-3 cursor-pointer hover:shadow-md transition-shadow group relative"
      style={{ background: c.bg, borderColor: c.border }}>
      {/* Pin indicator */}
      {note.pinned && (
        <div className="absolute top-2 right-2 opacity-60">
          <Pin className="w-3 h-3" style={{ color: c.text }} />
        </div>
      )}
      {note.title && (
        <p className="text-xs font-bold mb-1 pr-4 line-clamp-1" style={{ color: c.text }}>
          {note.title}
        </p>
      )}
      <p className="text-xs leading-relaxed line-clamp-4 whitespace-pre-wrap" style={{ color: c.text }}>
        {note.content || <span className="opacity-40">Empty note</span>}
      </p>
      <p className="text-[10px] mt-2 opacity-50" style={{ color: c.text }}>{timeAgo(note.updated_at)}</p>
      {/* Hover actions */}
      <div className="absolute bottom-2 right-2 hidden group-hover:flex items-center gap-1">
        <button
          onClick={e => { e.stopPropagation(); onPin(note) }}
          className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
          title={note.pinned ? 'Unpin' : 'Pin to top'}
          style={{ color: c.text }}>
          {note.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(note) }}
          className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity text-red-500"
          title="Delete note">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ── Note editor ───────────────────────────────────────────────────────────────
function NoteEditor({ note, onSave, onDelete, onBack }) {
  const [title,   setTitle]   = useState(note?.title   || '')
  const [content, setContent] = useState(note?.content || '')
  const [color,   setColor]   = useState(note?.color   || 'yellow')
  const [showPalette, setShowPalette] = useState(false)
  const contentRef = useRef(null)

  useEffect(() => {
    contentRef.current?.focus()
  }, [])

  const c = COLORS[color] || COLORS.yellow
  const hasContent = title.trim() || content.trim()

  return (
    <div className="flex flex-col h-full" style={{ background: c.bg }}>
      {/* Editor toolbar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0" style={{ borderColor: c.border }}>
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-black/10 transition-colors" style={{ color: c.text }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {/* Color picker */}
        <div className="relative">
          <button
            onClick={() => setShowPalette(p => !p)}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors flex items-center gap-1"
            title="Change color"
            style={{ color: c.text }}>
            <Palette className="w-3.5 h-3.5" />
          </button>
          {showPalette && (
            <div className="absolute top-8 left-0 z-10 flex gap-1.5 bg-white border border-slate-200 rounded-xl p-2 shadow-xl">
              {Object.entries(COLORS).map(([key, col]) => (
                <button
                  key={key}
                  onClick={() => { setColor(key); setShowPalette(false) }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${col.dot} ${color === key ? 'border-slate-700 scale-110' : 'border-white'}`}
                  title={key}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {note && (
          <button
            onClick={() => onDelete(note)}
            className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors text-red-500"
            title="Delete note">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => hasContent && onSave({ title, content, color })}
          disabled={!hasContent}
          className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          style={{ background: c.border, color: c.text }}>
          Save
        </button>
      </div>

      {/* Editable area */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        <input
          className="w-full bg-transparent border-none outline-none text-sm font-bold placeholder-current/40"
          style={{ color: c.text }}
          placeholder="Title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          ref={contentRef}
          className="flex-1 w-full bg-transparent border-none outline-none text-xs leading-relaxed resize-none placeholder-current/40 min-h-[200px]"
          style={{ color: c.text }}
          placeholder="Write your note here…"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </div>
      {note && (
        <p className="text-center text-[10px] pb-2 opacity-40" style={{ color: c.text }}>
          Last edited {timeAgo(note.updated_at)}
        </p>
      )}
    </div>
  )
}

// ── Main StickyNotes panel ────────────────────────────────────────────────────
export default function StickyNotes() {
  const { companyId, session } = useAuth()
  const qc = useQueryClient()
  const [open,    setOpen]    = useState(false)
  const [editing, setEditing] = useState(null)   // null = list view, 'new' = new note, note obj = edit
  const [search,  setSearch]  = useState('')

  // ── Query ──────────────────────────────────────────────────────────────────
  const { data: notes = [] } = useQuery({
    queryKey: ['sticky_notes', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sticky_notes')
        .select('*')
        .eq('user_id', session.user.id)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
      if (error) {
        // Table likely not created yet — run migration in Supabase SQL editor
        console.warn('[StickyNotes] query error:', error.message)
        return []
      }
      return data || []
    },
    enabled: !!session?.user?.id,
    staleTime: 30_000,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return notes
    return notes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q)
    )
  }, [notes, search])

  const pinned   = filtered.filter(n => n.pinned)
  const unpinned = filtered.filter(n => !n.pinned)

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ['sticky_notes', session?.user?.id] })

  const handleSave = async ({ title, content, color }) => {
    try {
      let err
      if (editing && editing !== 'new') {
        const { error } = await supabase.from('sticky_notes').update({
          title: title || null, content, color, updated_at: new Date().toISOString(),
        }).eq('id', editing.id)
        err = error
      } else {
        const { error } = await supabase.from('sticky_notes').insert({
          company_id: companyId, user_id: session.user.id,
          title: title || null, content, color,
        })
        err = error
      }
      if (err) throw err
      invalidate()
      setEditing(null)
    } catch (e) {
      console.error('[StickyNotes] save error:', e)
      if (e.message?.includes('does not exist') || e.code === '42P01') {
        toast.error('Notes table missing — run the sticky_notes migration in Supabase SQL editor first.')
      } else {
        toast.error('Could not save note: ' + e.message)
      }
    }
  }

  const handlePin = async (note) => {
    const { error } = await supabase.from('sticky_notes').update({ pinned: !note.pinned }).eq('id', note.id)
    if (!error) invalidate()
  }

  const handleDelete = async (note) => {
    const { error } = await supabase.from('sticky_notes').delete().eq('id', note.id)
    if (!error) {
      invalidate()
      if (editing && editing !== 'new' && editing.id === note.id) setEditing(null)
    }
  }

  // Close with Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') { if (editing) setEditing(null); else setOpen(false) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, editing])

  const noteCount = notes.length

  return (
    <>
      {/* ── Floating trigger button ── */}
      <button
        onClick={() => { setOpen(p => !p); setEditing(null); setSearch('') }}
        className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-yellow-400 text-yellow-900 shadow-yellow-400/40 scale-95'
            : 'bg-yellow-300 hover:bg-yellow-400 text-yellow-900 shadow-yellow-300/30 hover:scale-105'
        }`}
        title="Quick Notes">
        <StickyNote className="w-5 h-5" />
        {noteCount > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none px-1">
            {noteCount > 99 ? '99+' : noteCount}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <>
          {/* Backdrop (mobile) */}
          <div
            className="fixed inset-0 z-40 lg:hidden bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* Slide-in panel */}
          <div className="fixed bottom-0 right-0 top-0 z-50 w-80 flex flex-col bg-dark-900 border-l border-dark-700 shadow-2xl animate-slide-in-right"
            style={{ animation: 'slideInRight 0.2s ease-out' }}>
            <style>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to   { transform: translateX(0);    opacity: 1; }
              }
            `}</style>

            {editing ? (
              /* ── EDITOR VIEW ── */
              <NoteEditor
                note={editing === 'new' ? null : editing}
                onSave={handleSave}
                onDelete={handleDelete}
                onBack={() => setEditing(null)}
              />
            ) : (
              /* ── LIST VIEW ── */
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700 shrink-0">
                  <div className="flex items-center gap-2">
                    <StickyNote className="w-4 h-4 text-yellow-400" />
                    <p className="font-bold text-sm text-slate-100">Notes</p>
                    {noteCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 font-semibold">
                        {noteCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing('new')}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-400 rounded-lg transition-colors">
                      <Plus className="w-3.5 h-3.5" /> New
                    </button>
                    <button onClick={() => setOpen(false)} className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Search */}
                {noteCount > 3 && (
                  <div className="px-3 py-2 border-b border-dark-800 shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                      <input
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-yellow-500/50"
                        placeholder="Search notes…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Notes list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {notes.length === 0 ? (
                    <div className="flex flex-col items-center py-12 gap-3 text-slate-600">
                      <StickyNote className="w-10 h-10 text-slate-700" />
                      <p className="text-xs text-center">No notes yet.<br />Hit <strong className="text-yellow-400">+ New</strong> to jot something down.</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-center text-xs text-slate-600 py-8">No notes match "{search}"</p>
                  ) : (
                    <>
                      {pinned.length > 0 && (
                        <>
                          <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1 flex items-center gap-1">
                            <Pin className="w-2.5 h-2.5" /> Pinned
                          </p>
                          {pinned.map(n => (
                            <NoteCard key={n.id} note={n} onEdit={setEditing} onPin={handlePin} onDelete={handleDelete} />
                          ))}
                          {unpinned.length > 0 && (
                            <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1 pt-1">
                              Other
                            </p>
                          )}
                        </>
                      )}
                      {unpinned.map(n => (
                        <NoteCard key={n.id} note={n} onEdit={setEditing} onPin={handlePin} onDelete={handleDelete} />
                      ))}
                    </>
                  )}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-2 border-t border-dark-800 shrink-0">
                  <p className="text-[10px] text-slate-700 text-center">Click any note to edit · Hover to pin or delete</p>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
