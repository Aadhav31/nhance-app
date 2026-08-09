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

  const [channel,  setChannel]  = useState(null)
  const [subView,  setSubView]  = useState(null)   // null | 'dm_picker' | 'group_create'
  const [text,     setText]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [recording, setRecording] = useState(false)
  const [recSecs,  setRecSecs]  = useState(0)
  const [dmSearch, setDmSearch] = useState('')
  const [groupName, setGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)

  const bottomRef   = useRef(null)
  const mediaRecRef = useRef(null)
  const audioChunks = useRef([])
  const recTimer    = useRef(null)

  // ── Load channels I am a member of (group + DM) ───────────────────────────
  const { data: channels = [], refetch: refetchChannels } = useQuery({
    queryKey: ['op_channels', companyId, operatorId],
    queryFn: async () => {
      // Get channel IDs I belong to
      const { data: memberships } = await supabase
        .from('chat_members').select('channel_id').eq('user_id', operatorId)
      const ids = (memberships || []).map(m => m.channel_id)
      if (!ids.length) return []
      const { data } = await supabase
        .from('chat_channels')
        .select('id,name,description,type,created_at')
        .in('id', ids)
        .eq('company_id', companyId)
        .eq('is_archived', false)
        .order('created_at')
      return data || []
    },
    enabled: !!companyId && !!operatorId,
    refetchInterval: 30_000,
  })

  // ── Company users (for DM picker) ─────────────────────────────────────────
  const { data: companyUsers = [] } = useQuery({
    queryKey: ['op_company_users', companyId],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from('user_profiles').select('id,full_name,email').eq('company_id', companyId).order('full_name'),
        supabase.from('user_roles').select('user_id,role'),
      ])
      const roleMap = Object.fromEntries((roles || []).map(r => [r.user_id, r.role]))
      return (profiles || []).map(p => ({ ...p, role: roleMap[p.id] || '' }))
    },
    enabled: !!companyId && subView === 'dm_picker',
  })

  // Filtered users for DM picker (exclude self)
  const filteredUsers = companyUsers.filter(u =>
    u.id !== operatorId &&
    (u.full_name || u.email || '').toLowerCase().includes(dmSearch.toLowerCase())
  )

  // ── Open or create a DM with another user ─────────────────────────────────
  const openDM = async (other) => {
    setSending(true)
    try {
      // Check if DM already exists between both users
      const { data: myMem }    = await supabase.from('chat_members').select('channel_id').eq('user_id', operatorId)
      const { data: otherMem } = await supabase.from('chat_members').select('channel_id').eq('user_id', other.id)
      const myIds    = new Set((myMem    || []).map(m => m.channel_id))
      const sharedIds = (otherMem || []).map(m => m.channel_id).filter(id => myIds.has(id))
      if (sharedIds.length) {
        const { data: existing } = await supabase.from('chat_channels')
          .select('*').in('id', sharedIds).eq('type', 'direct').limit(1)
        if (existing?.[0]) {
          setChannel(existing[0]); setSubView(null); return
        }
      }
      // Create new DM
      const { data: ch } = await supabase.from('chat_channels').insert({
        company_id: companyId,
        name: other.full_name || other.email,
        type: 'direct',
        created_by: operatorId,
      }).select().single()
      await supabase.from('chat_members').insert([
        { channel_id: ch.id, user_id: operatorId, user_name: operatorName, user_role: operatorRole },
        { channel_id: ch.id, user_id: other.id,   user_name: other.full_name || other.email, user_role: other.role || '' },
      ])
      refetchChannels()
      setChannel(ch)
      setSubView(null)
      setDmSearch('')
    } finally { setSending(false) }
  }

  // ── Create a group channel ─────────────────────────────────────────────────
  const createGroup = async () => {
    const name = groupName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!name) return
    setCreatingGroup(true)
    try {
      const { data: ch } = await supabase.from('chat_channels').insert({
        company_id: companyId,
        name,
        type: 'group',
        created_by: operatorId,
      }).select().single()
      await supabase.from('chat_members').insert({
        channel_id: ch.id, user_id: operatorId, user_name: operatorName, user_role: operatorRole,
      })
      refetchChannels()
      setChannel(ch)
      setSubView(null)
      setGroupName('')
    } finally { setCreatingGroup(false) }
  }

  // ── Placeholder to keep old auto-join removed — no longer auto-seeding ────
  // (channels are now only joined explicitly via DM/group creation buttons)
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
  // RENDER: DM user picker
  // ══════════════════════════════════════════════════════════════════════════
  if (subView === 'dm_picker') {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-3 px-3 py-3 border-b border-dark-700">
          <button onClick={() => { setSubView(null); setDmSearch('') }}
            className="w-11 h-11 rounded-xl bg-dark-700 active:bg-dark-600 flex items-center justify-center flex-shrink-0">
            <span className="text-slate-300 text-xl">←</span>
          </button>
          <p className="font-bold text-slate-100">💬 Start a Chat</p>
        </div>
        {/* Search bar */}
        <div className="shrink-0 px-3 py-2.5 border-b border-dark-700">
          <input
            value={dmSearch} onChange={e => setDmSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full bg-dark-700 border border-dark-600 focus:border-primary-500 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <span className="text-4xl">🔍</span>
              <p className="text-slate-500 text-sm">No users found</p>
            </div>
          ) : filteredUsers.map(u => (
            <button key={u.id} onClick={() => openDM(u)} disabled={sending}
              className="w-full flex items-center gap-3.5 px-4 py-4 active:bg-dark-700 border-b border-dark-700/40 transition-colors text-left">
              <div className={`w-11 h-11 rounded-full ${aC(u.full_name || u.email)} flex items-center justify-center font-black text-white text-sm flex-shrink-0`}>
                {ini(u.full_name || u.email)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-100 truncate">{u.full_name || u.email}</p>
                {u.role && <p className="text-xs text-slate-500 uppercase tracking-wide mt-0.5">{u.role}</p>}
              </div>
              <span className="text-slate-500 text-lg flex-shrink-0">→</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Group create
  // ══════════════════════════════════════════════════════════════════════════
  if (subView === 'group_create') {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-3 px-3 py-3 border-b border-dark-700">
          <button onClick={() => { setSubView(null); setGroupName('') }}
            className="w-11 h-11 rounded-xl bg-dark-700 active:bg-dark-600 flex items-center justify-center flex-shrink-0">
            <span className="text-slate-300 text-xl">←</span>
          </button>
          <p className="font-bold text-slate-100">👥 Start a Group Chat</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div className="w-20 h-20 rounded-3xl bg-primary-600/20 border-2 border-primary-500/40 flex items-center justify-center">
            <span className="text-4xl">👥</span>
          </div>
          <div className="w-full">
            <p className="text-xs text-slate-500 mb-2 text-center">Group / channel name</p>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createGroup()}
              placeholder="e.g. site-b or excavator-team"
              className="w-full bg-dark-700 border border-dark-600 focus:border-primary-500 rounded-2xl px-4 py-4 text-base text-slate-100 placeholder-slate-600 focus:outline-none text-center"
              autoFocus
            />
            <p className="text-[11px] text-slate-600 mt-1.5 text-center">Letters, numbers and hyphens only</p>
          </div>
          <button
            onClick={createGroup}
            disabled={!groupName.trim() || creatingGroup}
            className="w-full py-4 rounded-2xl font-bold text-base bg-primary-600 disabled:opacity-40 active:scale-[0.98] transition-all text-white shadow-lg flex items-center justify-center gap-2"
          >
            {creatingGroup
              ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : '✓ Create Group'
            }
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Channel / conversation list
  // ══════════════════════════════════════════════════════════════════════════
  if (!channel) {
    return (
      <div className="flex flex-col h-full">
        {/* Two action buttons — always at top */}
        <div className="shrink-0 px-3 py-3 border-b border-dark-700 flex gap-2.5">
          <button
            onClick={() => setSubView('dm_picker')}
            className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl bg-dark-700 border border-dark-600 active:bg-dark-600 transition-colors"
          >
            <span className="text-3xl">💬</span>
            <span className="text-xs font-bold text-slate-200">Start a Chat</span>
          </button>
          <button
            onClick={() => setSubView('group_create')}
            className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl bg-dark-700 border border-dark-600 active:bg-dark-600 transition-colors"
          >
            <span className="text-3xl">👥</span>
            <span className="text-xs font-bold text-slate-200">Group Chat</span>
          </button>
        </div>

        {/* Existing channels / DMs */}
        <div className="flex-1 overflow-y-auto">
          {channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 pb-8">
              <span className="text-5xl opacity-40">💬</span>
              <p className="text-slate-600 text-sm">No conversations yet</p>
              <p className="text-slate-700 text-xs">Tap the buttons above to start</p>
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
