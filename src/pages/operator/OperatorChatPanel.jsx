/**
 * OperatorChatPanel.jsx
 * Mobile-first chat embedded in the Operator Portal (Capacitor APK).
 *
 * Design rules (matches OperatorPortal):
 *  - Large touch targets (48px+)
 *  - Camera as primary input — operators send site photos, not text
 *  - Voice recording for hands-free messaging (dirty gloves, etc.)
 *  - Auto-joins all company channels — zero setup for operators
 *  - Realtime via Supabase postgres_changes
 *  - 4-language support: EN / தமிழ் / हिंदी / తెలుగు
 *
 * Reuses tables: chat_channels, chat_messages, chat_members, chat_last_read
 * Reuses bucket: chat-attachments
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtTime = iso =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''

const fmtRelDate = iso => {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

const isImage = t => t?.startsWith('image/')
const isAudio = t => t?.startsWith('audio/')
const fmtSize = b => {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}

// Avatar helpers
const COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500',
]
const aC = n => {
  let h = 0
  for (const c of (n || '')) h = c.charCodeAt(0) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}
const ini = n => {
  const p = (n || '').trim().split(' ')
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : (n || '').slice(0, 2).toUpperCase() || '?'
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Av({ name, size = 'md' }) {
  const sz = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }[size] || 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} ${aC(name)} rounded-full flex items-center justify-center font-black text-white flex-shrink-0`}>
      {ini(name)}
    </div>
  )
}

// ── Language labels ───────────────────────────────────────────────────────────
const LABELS = {
  en: { channels: 'Channels', typeMsg: 'Message…', noChannels: 'No channels yet', noMsgs: 'Say hello! 👋', recording: 'Recording…', newBadge: 'new' },
  ta: { channels: 'சேனல்கள்', typeMsg: 'செய்தி…', noChannels: 'சேனல் இல்லை', noMsgs: 'வணக்கம் சொல்லுங்கள்! 👋', recording: 'பதிவாகிறது…', newBadge: 'புதியது' },
  hi: { channels: 'चैनल', typeMsg: 'संदेश…', noChannels: 'कोई चैनल नहीं', noMsgs: 'नमस्ते कहें! 👋', recording: 'रिकॉर्ड हो रहा है…', newBadge: 'नया' },
  te: { channels: 'ఛానెల్స్', typeMsg: 'సందేశం…', noChannels: 'ఛానెల్స్ లేవు', noMsgs: 'హలో చెప్పండి! 👋', recording: 'రికార్డింగ్…', newBadge: 'కొత్త' },
}

// ── Channel list row ──────────────────────────────────────────────────────────
function ChannelRow({ ch, unread, lastMsg, lastAt, onSelect }) {
  return (
    <button
      onClick={() => onSelect(ch)}
      className="w-full flex items-center gap-3.5 px-4 py-4 active:bg-dark-700 transition-colors border-b border-dark-700/50 text-left"
    >
      {/* Channel icon */}
      <div className="w-12 h-12 rounded-2xl bg-primary-600/15 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
        <span className="text-primary-400 font-black text-2xl leading-none">#</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-100 truncate text-base">{ch.name}</p>
        {lastMsg && <p className="text-xs text-slate-500 truncate mt-0.5">{lastMsg}</p>}
      </div>

      {/* Right: date + unread badge */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
        {lastAt && <span className="text-[10px] text-slate-600">{fmtRelDate(lastAt)}</span>}
        {unread > 0 && (
          <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Date divider ──────────────────────────────────────────────────────────────
function DateDiv({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-dark-700" />
      <span className="text-[10px] font-semibold text-slate-600 px-2">{label}</span>
      <div className="flex-1 h-px bg-dark-700" />
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg, isMine }) {
  if (msg.is_deleted) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs italic text-slate-600">Message deleted</span>
      </div>
    )
  }
  const atts = msg.attachments || []
  const isVoice = atts.some(a => isAudio(a.type))

  return (
    <div className={`flex gap-2 items-end mb-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isMine && <Av name={msg.sender_name} size="sm" />}

      <div className={`max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (
          <span className="text-[11px] font-bold text-slate-400 mb-0.5 px-1 truncate max-w-full">
            {msg.sender_name}
            {msg.sender_role && (
              <span className="text-slate-600 font-normal ml-1">· {msg.sender_role}</span>
            )}
          </span>
        )}

        <div className={`px-3.5 py-2.5 rounded-2xl ${
          isMine
            ? 'bg-primary-600 text-white rounded-br-sm'
            : 'bg-dark-700 border border-dark-600 text-slate-100 rounded-bl-sm'
        }`}>
          {/* Text — hide if it's just the voice placeholder */}
          {msg.content && !isVoice && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
          )}

          {/* Attachments */}
          {atts.map((att, i) => (
            <div key={i} className={atts.length > 1 && i > 0 ? 'mt-1.5' : msg.content && !isVoice ? 'mt-1.5' : ''}>
              {isImage(att.type) ? (
                <a href={att.url} target="_blank" rel="noreferrer">
                  <img
                    src={att.url} alt={att.name}
                    className="max-w-[240px] max-h-[220px] rounded-xl object-cover cursor-zoom-in"
                  />
                </a>
              ) : isAudio(att.type) ? (
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${
                  isMine ? 'bg-primary-700/60' : 'bg-dark-800'
                }`}>
                  <span className="text-xl flex-shrink-0">🎤</span>
                  <audio src={att.url} controls style={{ width: '160px', height: '32px' }} />
                </div>
              ) : (
                <a
                  href={att.url} target="_blank" rel="noreferrer" download={att.name}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                    isMine ? 'border-white/20 bg-primary-700/60' : 'border-dark-500 bg-dark-800'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">📄</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{att.name}</p>
                    <p className="text-[10px] opacity-60">{fmtSize(att.size)}</p>
                  </div>
                </a>
              )}
            </div>
          ))}
        </div>

        <span className="text-[10px] text-slate-600 mt-0.5 px-1">{fmtTime(msg.created_at)}</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OperatorChatPanel({
  companyId,
  operatorId,
  operatorName,
  operatorRole = 'operator',
  lang = 'en',
}) {
  const L = LABELS[lang] || LABELS.en
  const queryClient = useQueryClient()

  const [channel, setChannel] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)

  const bottomRef   = useRef(null)
  const mediaRecRef = useRef(null)
  const audioChunks = useRef([])
  const recTimer    = useRef(null)

  // ── Load group channels ────────────────────────────────────────────────────
  const { data: channels = [] } = useQuery({
    queryKey: ['op_channels', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('chat_channels')
        .select('id,name,description,type,created_at')
        .eq('company_id', companyId)
        .eq('type', 'group')
        .eq('is_archived', false)
        .order('name')
      return data || []
    },
    enabled: !!companyId,
    refetchInterval: 30_000,
  })

  // Auto-join operator to all channels (silently)
  useEffect(() => {
    if (!operatorId || !channels.length) return
    channels.forEach(ch => {
      supabase.from('chat_members')
        .upsert(
          { channel_id: ch.id, user_id: operatorId, user_name: operatorName, user_role: operatorRole },
          { onConflict: 'channel_id,user_id', ignoreDuplicates: true }
        )
        .then(() => {})
    })
  }, [channels.length, operatorId, operatorName, operatorRole])

  // ── Last-read map ──────────────────────────────────────────────────────────
  const { data: lastReadMap = {} } = useQuery({
    queryKey: ['op_last_read', operatorId],
    queryFn: async () => {
      const { data } = await supabase
        .from('chat_last_read')
        .select('channel_id,last_read_at')
        .eq('user_id', operatorId)
      return Object.fromEntries((data || []).map(r => [r.channel_id, r.last_read_at]))
    },
    enabled: !!operatorId,
  })

  // ── Unread counts per channel ──────────────────────────────────────────────
  const { data: unreadMap = {} } = useQuery({
    queryKey: ['op_unread', operatorId, channels.map(c => c.id).join(',')],
    queryFn: async () => {
      const map = {}
      await Promise.all(channels.map(async ch => {
        const since = lastReadMap[ch.id] || '1970-01-01T00:00:00Z'
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', ch.id)
          .neq('sender_id', operatorId)
          .gt('created_at', since)
          .eq('is_deleted', false)
        map[ch.id] = count || 0
      }))
      return map
    },
    enabled: !!operatorId && channels.length > 0,
    refetchInterval: 15_000,
  })

  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0)

  // ── Last message previews ──────────────────────────────────────────────────
  const { data: lastMsgMap = {} } = useQuery({
    queryKey: ['op_last_msgs', companyId, channels.map(c => c.id).join(',')],
    queryFn: async () => {
      const map = {}
      await Promise.all(channels.map(async ch => {
        const { data } = await supabase
          .from('chat_messages')
          .select('content,sender_name,created_at,attachments')
          .eq('channel_id', ch.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(1)
        if (data?.[0]) map[ch.id] = data[0]
      }))
      return map
    },
    enabled: channels.length > 0,
    refetchInterval: 15_000,
  })

  // ── Messages in active channel ─────────────────────────────────────────────
  const { data: messages = [] } = useQuery({
    queryKey: ['op_messages', channel?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: true })
        .limit(100)
      return data || []
    },
    enabled: !!channel?.id,
  })

  // Realtime: append incoming messages
  useEffect(() => {
    if (!channel?.id) return
    const sub = supabase
      .channel(`op-chat-${channel.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channel.id}` },
        payload => {
          queryClient.setQueryData(['op_messages', channel.id], (old = []) => {
            if (old.some(m => m.id === payload.new.id)) return old
            return [...old, payload.new]
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [channel?.id, queryClient])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Mark as read when channel is opened
  useEffect(() => {
    if (!channel?.id || !operatorId) return
    supabase
      .from('chat_last_read')
      .upsert(
        { channel_id: channel.id, user_id: operatorId, last_read_at: new Date().toISOString() },
        { onConflict: 'channel_id,user_id' }
      )
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['op_unread'] })
        queryClient.invalidateQueries({ queryKey: ['op_last_read'] })
      })
  }, [channel?.id, operatorId, queryClient])

  // ── File upload to Supabase Storage ───────────────────────────────────────
  const uploadFile = async file => {
    const ext = file.name.split('.').pop()
    const path = `${companyId}/${channel.id}/${crypto.randomUUID()}.${ext}`
    await supabase.storage
      .from('chat-attachments')
      .upload(path, file, { cacheControl: '3600', upsert: false })
    const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path)
    return { name: file.name, type: file.type, size: file.size, url: publicUrl }
  }

  // ── Send text message ─────────────────────────────────────────────────────
  const sendText = async () => {
    const content = text.trim()
    if (!content || !channel?.id || sending) return
    setSending(true)
    setText('')
    try {
      await supabase.from('chat_messages').insert({
        channel_id: channel.id, company_id: companyId,
        sender_id: operatorId, sender_name: operatorName, sender_role: operatorRole,
        content, attachments: [],
      })
    } finally { setSending(false) }
  }

  // ── Photo capture (camera) ─────────────────────────────────────────────────
  const handlePhoto = async e => {
    const file = e.target.files?.[0]
    if (!file || !channel?.id) return
    setSending(true)
    try {
      const att = await uploadFile(file)
      await supabase.from('chat_messages').insert({
        channel_id: channel.id, company_id: companyId,
        sender_id: operatorId, sender_name: operatorName, sender_role: operatorRole,
        content: null, attachments: [att],
      })
    } finally {
      setSending(false)
      e.target.value = ''
    }
  }

  // ── Voice recording ───────────────────────────────────────────────────────
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunks.current = []
      const mr = new MediaRecorder(stream)
      mediaRecRef.current = mr

      mr.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (!channel?.id) return
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' })
        setSending(true)
        try {
          const att = await uploadFile(file)
          await supabase.from('chat_messages').insert({
            channel_id: channel.id, company_id: companyId,
            sender_id: operatorId, sender_name: operatorName, sender_role: operatorRole,
            content: null, attachments: [att],
          })
        } finally { setSending(false) }
      }

      mr.start()
      setRecording(true)
      setRecSecs(0)
      recTimer.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    } catch {
      // Microphone access denied — silently ignore
    }
  }

  const stopRec = () => {
    mediaRecRef.current?.stop()
    setRecording(false)
    clearInterval(recTimer.current)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Channel list
  // ══════════════════════════════════════════════════════════════════════════
  if (!channel) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 px-4 py-3.5 border-b border-dark-700 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">{L.channels}</h2>
          {totalUnread > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-primary-500 text-white text-xs font-bold">
              {totalUnread} {L.newBadge}
            </span>
          )}
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto">
          {channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
              <span className="text-6xl">💬</span>
              <p className="text-slate-500 text-sm">{L.noChannels}</p>
            </div>
          ) : (
            channels.map(ch => {
              const lm = lastMsgMap[ch.id]
              const preview = lm
                ? lm.content || (lm.attachments?.length ? '📎 Attachment' : null)
                : null
              return (
                <ChannelRow
                  key={ch.id}
                  ch={ch}
                  unread={unreadMap[ch.id] || 0}
                  lastMsg={preview}
                  lastAt={lm?.created_at}
                  onSelect={setChannel}
                />
              )
            })
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Message view
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full">

      {/* Channel header */}
      <div className="shrink-0 flex items-center gap-3 px-3 py-3 border-b border-dark-700 bg-dark-800">
        <button
          onClick={() => { setChannel(null); setText('') }}
          className="w-11 h-11 rounded-xl bg-dark-700 active:bg-dark-600 flex items-center justify-center flex-shrink-0 transition-colors"
        >
          <span className="text-slate-300 text-xl">←</span>
        </button>
        <div className="w-9 h-9 rounded-xl bg-primary-600/15 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
          <span className="text-primary-400 font-black text-base">#</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-100 leading-tight truncate">{channel.name}</p>
          {channel.description && (
            <p className="text-[11px] text-slate-500 truncate">{channel.description}</p>
          )}
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-slate-500 text-sm">{L.noMsgs}</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = messages[i - 1]
          const showDate = !prev || fmtRelDate(msg.created_at) !== fmtRelDate(prev.created_at)
          return (
            <div key={msg.id}>
              {showDate && <DateDiv label={fmtRelDate(msg.created_at)} />}
              <Bubble msg={msg} isMine={msg.sender_id === operatorId} />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-dark-700 bg-dark-800 px-3 py-3">

        {/* ── Recording state ── */}
        {recording ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-3 px-4 py-3.5 bg-red-900/30 border border-red-600/50 rounded-2xl">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-red-300 font-bold text-base tabular-nums">
                {String(Math.floor(recSecs / 60)).padStart(2, '0')}:{String(recSecs % 60).padStart(2, '0')}
              </span>
              <span className="text-slate-400 text-xs truncate">{L.recording}</span>
            </div>
            {/* Stop button — big red */}
            <button
              onClick={stopRec}
              className="w-14 h-14 rounded-2xl bg-red-600 active:scale-95 transition-transform flex items-center justify-center shadow-lg flex-shrink-0"
            >
              <span className="text-white text-2xl">⏹</span>
            </button>
          </div>

        ) : (
          /* ── Normal input row ── */
          <div className="flex items-end gap-2">

            {/* 📷 Camera — primary action for operators */}
            <label className="w-12 h-12 rounded-2xl bg-dark-700 border border-dark-600 flex items-center justify-center active:bg-dark-600 transition-colors cursor-pointer flex-shrink-0">
              <span className="text-2xl">📷</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhoto}
                disabled={sending}
              />
            </label>

            {/* Text area */}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
              }}
              placeholder={L.typeMsg}
              rows={1}
              className="flex-1 bg-dark-700 border border-dark-600 focus:border-primary-500 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none resize-none leading-snug"
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />

            {/* 🎤 Voice — tap to start, ⏹ to send */}
            <button
              onClick={startRec}
              disabled={sending}
              className="w-12 h-12 rounded-2xl bg-dark-700 border border-dark-600 active:bg-dark-600 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-40"
            >
              <span className="text-2xl">🎤</span>
            </button>

            {/* ↑ Send */}
            <button
              onClick={sendText}
              disabled={!text.trim() || sending}
              className="w-12 h-12 rounded-2xl bg-primary-600 disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center shadow-lg flex-shrink-0"
            >
              {sending
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <span className="text-white text-2xl font-bold">↑</span>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
