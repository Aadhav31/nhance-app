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
function ChannelRow({ ch, unread, lastMsg, lastAt, lastSender, operatorId, onSelect }) {
  const isDM   = ch.type === 'direct'
  const label  = ch.displayName || ch.name
  const preview = lastMsg
    ? (lastSender === operatorId ? `You: ${lastMsg}` : `${ch.displayName || ''}: ${lastMsg}`.trimStart())
    : null

  return (
    <button
      onClick={() => onSelect(ch)}
      className="w-full flex items-center gap-3.5 px-4 py-4 active:bg-dark-700 transition-colors border-b border-dark-700/50 text-left"
    >
      {/* Avatar / icon */}
      {isDM ? (
        <div className={`w-12 h-12 rounded-full ${aC(label)} flex items-center justify-center flex-shrink-0 font-black text-white text-lg`}>
          {ini(label)}
        </div>
      ) : (
        <div className="w-12 h-12 rounded-2xl bg-primary-600/15 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
          <span className="text-primary-400 font-black text-2xl leading-none">#</span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-100 truncate text-base">{label}</p>
        {preview && <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>{preview}</p>}
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
  // System call event messages — centered pill
  if (msg.sender_role === 'system') {
    return (
      <div className="flex justify-center py-1.5">
        <span className="text-[11px] text-slate-500 bg-dark-700 rounded-full px-3 py-1">{msg.content}</span>
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
  // ── Call state ────────────────────────────────────────────────────────────
  const [incomingCall,   setIncomingCall]   = useState(null) // {channelId, callerId, callerName}
  const [incomingOffer,  setIncomingOffer]  = useState(null) // RTCSessionDescriptionInit
  const [activeCall,     setActiveCall]     = useState(null) // {peerName, peerId, channelId, muted, callRecording}
  const [callStartTime,  setCallStartTime]  = useState(null)
  const pcRef          = useRef(null)
  const localAudRef    = useRef(null)
  const remoteAudRef   = useRef(null)
  const callRecRef     = useRef(null)   // MediaRecorder for call recording
  const callRecChunks  = useRef([])

  const bottomRef   = useRef(null)
  const mediaRecRef = useRef(null)
  const audioChunks = useRef([])
  const recTimer    = useRef(null)

  // ── Load channels I am a member of (group + DM) ───────────────────────────
  const { data: channels = [], refetch: refetchChannels } = useQuery({
    queryKey: ['op_channels', companyId, operatorId],
    queryFn: async () => {
      // Get channel IDs + member names I belong to
      const { data: memberships } = await supabase
        .from('chat_members').select('channel_id').eq('user_id', operatorId)
      const ids = (memberships || []).map(m => m.channel_id)
      if (!ids.length) return []
      const { data } = await supabase
        .from('chat_channels')
        .select('id,name,description,type,created_at,members:chat_members(user_id,user_name)')
        .in('id', ids)
        .eq('company_id', companyId)
        .eq('is_archived', false)
        .order('created_at')
      // For DMs, resolve the display name to the OTHER person
      return (data || []).map(ch => {
        if (ch.type === 'direct') {
          const other = (ch.members || []).find(m => m.user_id !== operatorId)
          return { ...ch, displayName: other?.user_name || ch.name }
        }
        return { ...ch, displayName: ch.name }
      })
    },
    enabled: !!companyId && !!operatorId,
    refetchInterval: 30_000,
  })

  // ── Company users (for DM picker) ─────────────────────────────────────────
  const { data: companyUsers = [] } = useQuery({
    queryKey: ['op_company_users', companyId],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }, { data: hrEmps }] = await Promise.all([
        supabase.from('user_profiles').select('id,full_name,email').eq('company_id', companyId).order('full_name'),
        supabase.from('user_roles').select('user_id,role'),
        supabase.from('hr_employees').select('user_id,name,designation').eq('company_id', companyId).not('user_id','is',null).eq('status','active'),
      ])
      const roleMap = Object.fromEntries((roles || []).map(r => [r.user_id, r.role]))
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
      const merged = new Map()
      ;(hrEmps || []).forEach(e => {
        if (!e.user_id) return
        const prof = profileMap[e.user_id]
        merged.set(e.user_id, { id: e.user_id, full_name: prof?.full_name || e.name, email: prof?.email || '', role: roleMap[e.user_id] || 'operator' })
      })
      ;(profiles || []).forEach(p => { if (!merged.has(p.id)) merged.set(p.id, { ...p, role: roleMap[p.id] || '' }) })
      return Array.from(merged.values()).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
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
          .select('content,sender_id,sender_name,created_at,attachments')
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

  // Broadcast channel ref for outgoing call replies
  const outCallChRef = useRef(null)
  // Stable ref to activeCall (avoids stale closure in broadcast handler)
  const activeCallRef = useRef(null)
  useEffect(() => { activeCallRef.current = activeCall }, [activeCall])

  // NOTE: Incoming calls handled at OperatorPortal level.
  // This handles REPLIES to our OUTGOING calls via broadcast.
  useEffect(() => {
    if (!operatorId || !companyId) return
    const ch = supabase.channel(`nhance-op-out-${operatorId}`, { config: { broadcast: { self: false } } })
    outCallChRef.current = ch
    ch.on('broadcast', { event: 'call-signal' }, async ({ payload: p }) => {
      if (p.to_user !== operatorId) return
      if (!pcRef.current) return  // only handle if we initiated a call
      if (p.signal_type === 'answer') {
        try { await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: p.type, sdp: p.sdp })) } catch {}
      } else if (p.signal_type === 'ice-candidate') {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(p.candidate)) } catch {}
      } else if (p.signal_type === 'call-end' || p.signal_type === 'busy') {
        const cur = activeCallRef.current
        if (!cur) return
        if (cur.callRecording) await stopCallRecord(cur.channelId, cur.peerId)
        pcRef.current.close(); pcRef.current = null
        localAudRef.current?.getTracks().forEach(t => t.stop()); localAudRef.current = null
        setActiveCall(null); setCallStartTime(null)
        await insertCallMsg(cur.channelId, p.signal_type === 'busy' ? '📵 Call declined' : '📞 Call ended')
      }
    })
    .subscribe()
    return () => { supabase.removeChannel(ch); outCallChRef.current = null }
  }, [operatorId, companyId])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmtDuration = ms => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const insertCallMsg = async (channelId, content) => {
    await supabase.from('chat_messages').insert({
      channel_id: channelId, company_id: companyId,
      sender_id: operatorId, sender_name: operatorName, sender_role: 'system',
      content, attachments: [],
    }).catch(() => {})
    queryClient.invalidateQueries(['op_messages', channelId])
  }

  // Send a WebRTC signal via broadcast (instant, no WAL/index issues)
  const bcastSignal = (toUser, channelId, signalType, extra = {}) => {
    // Use the company broadcast channel; all calls share nhance-calls-${companyId}
    supabase.channel(`nhance-calls-${companyId}`).send({
      type: 'broadcast', event: 'call-signal',
      payload: { to_user: toUser, from_user: operatorId, channel_id: channelId, signal_type: signalType, ...extra },
    }).catch(() => {})
  }

  const buildPC = (channelId, toUserId) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] })
    pcRef.current = pc
    pc.ontrack = e => {
      const audio = new Audio(); audio.srcObject = e.streams[0]; audio.play().catch(() => {})
      remoteAudRef.current = audio
    }
    pc.onicecandidate = e => {
      if (e.candidate) bcastSignal(toUserId, channelId, 'ice-candidate', { candidate: e.candidate.toJSON() })
    }
    return pc
  }

  // ── Outgoing call (from operator) ──────────────────────────────────────────
  const startDMCall = async () => {
    if (!channel || channel.type !== 'direct') return
    // channel.members may be empty if channel was just created — fetch directly
    let peer = (channel.members || []).find(m => m.user_id !== operatorId)
    if (!peer) {
      const { data: mems } = await supabase
        .from('chat_members')
        .select('user_id, user_name')
        .eq('channel_id', channel.id)
      peer = (mems || []).find(m => m.user_id !== operatorId)
    }
    if (!peer) { console.warn('startDMCall: no peer found in channel', channel.id); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localAudRef.current = stream
      const pc = buildPC(channel.id, peer.user_id)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      // call-start first so receiver shows overlay, then offer
      bcastSignal(peer.user_id, channel.id, 'call-start', { name: operatorName, callType: 'audio' })
      // Small delay so receiver subscribes before offer arrives
      await new Promise(r => setTimeout(r, 400))
      bcastSignal(peer.user_id, channel.id, 'offer', { type: offer.type, sdp: offer.sdp })
      await insertCallMsg(channel.id, `📞 ${operatorName} started a call`)
      setActiveCall({ peerName: peer.user_name || peer.user_id, peerId: peer.user_id, channelId: channel.id, muted: false, callRecording: false })
      setCallStartTime(Date.now())
    } catch (err) {
      console.error('start call error', err)
    }
  }

  // ── Accept incoming call ──────────────────────────────────────────────────
  const acceptCall = async () => {
    if (!incomingCall || !incomingOffer) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localAudRef.current = stream
      const pc = buildPC(incomingCall.channelId, incomingCall.callerId)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await supabase.from('chat_call_signals').insert({
        channel_id: incomingCall.channelId, company_id: companyId,
        from_user: operatorId, to_user: incomingCall.callerId,
        signal_type: 'answer', payload: answer,
      })
      await insertCallMsg(incomingCall.channelId, `📞 Call answered by ${operatorName}`)
      setActiveCall({ peerName: incomingCall.callerName, peerId: incomingCall.callerId, channelId: incomingCall.channelId, muted: false, callRecording: false })
      setCallStartTime(Date.now())
      setIncomingCall(null); setIncomingOffer(null)
    } catch (err) {
      console.error('accept call error', err)
      setIncomingCall(null); setIncomingOffer(null)
    }
  }

  // ── Decline incoming call ─────────────────────────────────────────────────
  const declineCall = async () => {
    if (!incomingCall) return
    await supabase.from('chat_call_signals').insert({
      channel_id: incomingCall.channelId, company_id: companyId,
      from_user: operatorId, to_user: incomingCall.callerId,
      signal_type: 'busy', payload: {},
    }).catch(() => {})
    setIncomingCall(null); setIncomingOffer(null)
  }

  // ── End active call ───────────────────────────────────────────────────────
  const endActiveCall = async () => {
    // Stop recording if active
    if (callRecRef.current?.state === 'recording') callRecRef.current.stop()
    // Send call-end signal
    if (activeCall?.peerId && activeCall?.channelId) {
      await supabase.from('chat_call_signals').insert({
        channel_id: activeCall.channelId, company_id: companyId,
        from_user: operatorId, to_user: activeCall.peerId,
        signal_type: 'call-end', payload: {},
      }).catch(() => {})
      const dur = callStartTime ? fmtDuration(Date.now() - callStartTime) : ''
      await insertCallMsg(activeCall.channelId, `📞 Call ended${dur ? ` — ${dur}` : ''}`)
    }
    pcRef.current?.close(); pcRef.current = null
    localAudRef.current?.getTracks().forEach(t => t.stop()); localAudRef.current = null
    remoteAudRef.current = null
    callRecRef.current = null; callRecChunks.current = []
    setActiveCall(null); setCallStartTime(null)
  }

  // ── Mute / unmute ─────────────────────────────────────────────────────────
  const toggleMute = () => {
    localAudRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setActiveCall(prev => prev ? { ...prev, muted: !prev.muted } : prev)
  }

  // ── Record call audio ─────────────────────────────────────────────────────
  const toggleCallRecord = async () => {
    if (!activeCall || !localAudRef.current) return
    if (callRecRef.current?.state === 'recording') {
      callRecRef.current.stop()
      return
    }
    try {
      // Mix local + remote into AudioContext for recording both sides
      const ctx = new AudioContext()
      const dest = ctx.createMediaStreamDestination()
      ctx.createMediaStreamSource(localAudRef.current).connect(dest)
      if (remoteAudRef.current?.srcObject) {
        ctx.createMediaStreamSource(remoteAudRef.current.srcObject).connect(dest)
      }
      const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' })
      callRecChunks.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) callRecChunks.current.push(e.data) }
      rec.onstop = async () => {
        const blob = new Blob(callRecChunks.current, { type: 'audio/webm' })
        const path = `${companyId}/call-rec-${Date.now()}.webm`
        const { data: up } = await supabase.storage.from('chat-attachments').upload(path, blob)
        if (up) {
          const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path)
          await supabase.from('chat_messages').insert({
            channel_id: activeCall.channelId, company_id: companyId,
            sender_id: operatorId, sender_name: operatorName, sender_role: 'operator',
            content: '🎙️ Call recording',
            attachments: [{ url: publicUrl, type: 'audio/webm', name: 'call-recording.webm', size: blob.size }],
          }).catch(() => {})
          queryClient.invalidateQueries(['op_messages', activeCall.channelId])
        }
        ctx.close().catch(() => {})
        setActiveCall(prev => prev ? { ...prev, callRecording: false } : prev)
      }
      rec.start()
      callRecRef.current = rec
      setActiveCall(prev => prev ? { ...prev, callRecording: true } : prev)
    } catch (err) {
      console.error('recording error', err)
    }
  }

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
                  lastSender={lm?.sender_id}
                  operatorId={operatorId}
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
    <div className="flex flex-col h-full relative">

      {/* ── Incoming call overlay ── */}
      {incomingCall && (
        <div className="absolute inset-0 z-50 bg-dark-900/95 flex flex-col items-center justify-center gap-6 px-6">
          <div className={`w-20 h-20 rounded-full ${aC(incomingCall.callerName)} flex items-center justify-center text-white font-black text-2xl`}>
            {ini(incomingCall.callerName)}
          </div>
          <div className="text-center">
            <p className="text-slate-400 text-sm mb-1">Incoming call from</p>
            <p className="text-slate-100 font-bold text-xl">{incomingCall.callerName}</p>
          </div>
          <div className="flex gap-6 mt-2">
            <button onClick={declineCall}
              className="w-16 h-16 rounded-full bg-red-600 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform">
              <span className="text-2xl">📵</span>
            </button>
            <button onClick={acceptCall} disabled={!incomingOffer}
              className="w-16 h-16 rounded-full bg-emerald-600 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-50">
              <span className="text-2xl">📞</span>
            </button>
          </div>
          {!incomingOffer && <p className="text-slate-600 text-xs animate-pulse">Connecting…</p>}
        </div>
      )}

      {/* ── Active call bar ── */}
      {activeCall && (
        <div className="shrink-0 bg-emerald-900/80 border-b border-emerald-700/50 px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <p className="flex-1 text-emerald-300 text-xs font-semibold truncate">📞 {activeCall.peerName}</p>
          {/* Mute */}
          <button onClick={toggleMute}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${activeCall.muted ? 'bg-red-600/40 text-red-300' : 'bg-dark-700 text-slate-300'}`}>
            {activeCall.muted ? '🔇' : '🎙️'}
          </button>
          {/* Record */}
          <button onClick={toggleCallRecord}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${activeCall.callRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-dark-700 text-slate-400'}`}
            title={activeCall.callRecording ? 'Stop recording' : 'Record call'}>
            {activeCall.callRecording ? '⏹' : '⏺'}
          </button>
          {/* End call */}
          <button onClick={endActiveCall}
            className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white text-sm font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Channel header */}
      <div className="shrink-0 flex items-center gap-3 px-3 py-2.5 border-b border-dark-700 bg-dark-800">
        <button
          onClick={() => { setChannel(null); setText('') }}
          className="w-9 h-9 rounded-xl bg-dark-700 active:bg-dark-600 flex items-center justify-center flex-shrink-0 transition-colors"
        >
          <span className="text-slate-300 text-lg">←</span>
        </button>
        {channel.type === 'direct' ? (
          <div className={`w-9 h-9 rounded-full ${aC(channel.displayName || channel.name)} flex items-center justify-center flex-shrink-0 font-black text-white text-sm`}>
            {ini(channel.displayName || channel.name)}
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-primary-600/15 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-400 font-black text-sm">#</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-100 leading-tight truncate text-sm">{channel.displayName || channel.name}</p>
          {channel.type === 'direct'
            ? <p className="text-[10px] text-slate-500">Direct Message</p>
            : channel.description && <p className="text-[10px] text-slate-500 truncate">{channel.description}</p>
          }
        </div>
        {/* Call button — only for DMs */}
        {channel.type === 'direct' && !activeCall && (
          <button
            onClick={startDMCall}
            className="w-9 h-9 rounded-xl bg-dark-700 border border-dark-600 active:bg-dark-600 flex items-center justify-center flex-shrink-0 transition-colors"
            title="Start audio call"
          >
            <span className="text-lg">📞</span>
          </button>
        )}
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
          <div className="flex items-end gap-1.5">

            {/* 📷 Camera — primary action for operators */}
            <label className="w-10 h-10 rounded-xl bg-dark-700 border border-dark-600 flex items-center justify-center active:bg-dark-600 transition-colors cursor-pointer flex-shrink-0">
              <span className="text-lg">📷</span>
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
              className="flex-1 bg-dark-700 border border-dark-600 focus:border-primary-500 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none resize-none leading-snug"
              style={{ minHeight: '40px', maxHeight: '100px' }}
            />

            {/* 🎤 Voice — tap to start, ⏹ to send */}
            <button
              onClick={startRec}
              disabled={sending}
              className="w-10 h-10 rounded-xl bg-dark-700 border border-dark-600 active:bg-dark-600 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-40"
            >
              <span className="text-lg">🎤</span>
            </button>

            {/* ↑ Send */}
            <button
              onClick={sendText}
              disabled={!text.trim() || sending}
              className="w-10 h-10 rounded-xl bg-primary-600 disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center shadow-lg flex-shrink-0"
            >
              {sending
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <span className="text-white text-base font-bold">↑</span>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
