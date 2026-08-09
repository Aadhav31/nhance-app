/**
 * ChatPage.jsx — Nhance In-House Chat
 *
 * Features:
 *  • Group channels (#general, custom) + Direct messages (1:1)
 *  • Real-time messaging via Supabase Realtime (postgres_changes)
 *  • File sharing: images (inline preview), videos (inline player), docs (file card)
 *  • File uploads to Supabase Storage (chat-attachments bucket)
 *  • Unread message counts per channel
 *  • Audio / Video calls via WebRTC + Supabase signaling
 *  • Screen sharing (getDisplayMedia)
 *  • Auto-seeds default channels (#general, #announcements, #maintenance) on first open
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Hash, MessageSquare, Plus, Send, Paperclip, X, Search,
  Phone, Video, Monitor, MicOff, Mic, VideoOff, PhoneOff,
  ChevronLeft, Settings, Users, Download, Play,
  MoreVertical, Smile, ArrowLeft, VolumeX, Volume2,
  CheckCheck, AlertCircle, ImageIcon, FileText, Film,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-blue-500','bg-emerald-500','bg-purple-500','bg-amber-500',
  'bg-red-500','bg-pink-500','bg-indigo-500','bg-teal-500','bg-orange-500',
]
const avatarColor = (name = '') => {
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
const initials = (name = '') => {
  const p = name.trim().split(' ')
  return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase() || '?'
}
const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso), today = new Date()
  const diff = Math.floor((today - d) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB'
  return (bytes/1048576).toFixed(1) + ' MB'
}
const isImage = (type = '') => type.startsWith('image/')
const isVideo = (type = '') => type.startsWith('video/')
const isAudio = (type = '') => type.startsWith('audio/')

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 'md' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return (
    <div className={`${sz} ${avatarColor(name)} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials(name)}
    </div>
  )
}

// ── File card (non-image/video attachments) ───────────────────────────────────
function FileCard({ att }) {
  const Icon = isAudio(att.type) ? Volume2 : FileText
  return (
    <a href={att.url} target="_blank" rel="noreferrer" download={att.name}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 hover:border-dark-500 transition-colors max-w-[240px] group">
      <div className="w-8 h-8 rounded-lg bg-primary-500/15 border border-primary-600/30 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate" style={{ color: 'rgb(var(--t1))' }}>{att.name}</p>
        <p className="text-[10px]" style={{ color: 'rgb(var(--t3))' }}>{fmtSize(att.size)}</p>
      </div>
      <Download className="w-3.5 h-3.5 text-slate-500 group-hover:text-primary-400 flex-shrink-0 transition-colors" />
    </a>
  )
}

// ── Attachment renderer ───────────────────────────────────────────────────────
function Attachments({ attachments }) {
  if (!attachments?.length) return null
  return (
    <div className="flex flex-col gap-1.5 mt-1.5">
      {attachments.map((att, i) => (
        <div key={i}>
          {isImage(att.type) ? (
            <a href={att.url} target="_blank" rel="noreferrer">
              <img src={att.url} alt={att.name}
                className="max-w-[280px] max-h-[200px] rounded-lg object-cover border border-dark-600 hover:opacity-90 transition-opacity cursor-zoom-in" />
            </a>
          ) : isVideo(att.type) ? (
            <video src={att.url} controls
              className="max-w-[320px] max-h-[220px] rounded-lg border border-dark-600"
              style={{ background: '#000' }} />
          ) : (
            <FileCard att={att} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isMine, showAvatar, prevMsg }) {
  const showDate = !prevMsg || fmtDate(msg.created_at) !== fmtDate(prevMsg.created_at)
  const showName = !isMine && (showAvatar || !prevMsg || prevMsg.sender_id !== msg.sender_id)
  if (msg.is_deleted) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs italic text-slate-600">Message deleted</span>
      </div>
    )
  }
  return (
    <>
      {showDate && (
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-dark-700" />
          <span className="text-[10px] font-semibold text-slate-500 px-2">{fmtDate(msg.created_at)}</span>
          <div className="flex-1 h-px bg-dark-700" />
        </div>
      )}
      <div className={`flex gap-2.5 items-end ${isMine ? 'flex-row-reverse' : 'flex-row'} group`}>
        {/* Avatar (others only) */}
        <div className="w-7 flex-shrink-0">
          {!isMine && showAvatar && <Avatar name={msg.sender_name} size="sm" />}
        </div>

        <div className={`flex flex-col max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
          {showName && (
            <div className="flex items-center gap-1.5 mb-0.5 px-1">
              <span className="text-[10px] font-bold" style={{ color: 'rgb(var(--t2))' }}>{msg.sender_name}</span>
              {msg.sender_role && (
                <span className="text-[9px] font-semibold uppercase text-slate-600">{msg.sender_role}</span>
              )}
            </div>
          )}
          <div className={`px-3 py-2 rounded-2xl ${
            isMine
              ? 'bg-primary-600 text-white rounded-br-sm'
              : 'bg-dark-700 border border-dark-600 rounded-bl-sm'
          }`}
            style={!isMine ? { color: 'rgb(var(--t1))' } : undefined}
          >
            {msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>}
            <Attachments attachments={msg.attachments} />
          </div>
          <span className="text-[9px] mt-0.5 px-1" style={{ color: 'rgb(var(--t3))' }}>{fmtTime(msg.created_at)}</span>
        </div>
      </div>
    </>
  )
}

// ── Uploading file preview ────────────────────────────────────────────────────
function PendingFile({ file, onRemove, progress }) {
  const preview = isImage(file.type) ? URL.createObjectURL(file) : null
  return (
    <div className="relative group flex-shrink-0">
      {preview ? (
        <img src={preview} alt={file.name} className="w-16 h-16 rounded-lg object-cover border border-dark-600" />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-dark-700 border border-dark-600 flex flex-col items-center justify-center gap-1">
          {isVideo(file.type) ? <Film className="w-5 h-5 text-primary-400" /> : <FileText className="w-5 h-5 text-slate-400" />}
          <span className="text-[9px] text-slate-500 text-center px-1 truncate w-full">{file.name.slice(0,10)}</span>
        </div>
      )}
      {progress < 100 && (
        <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">{progress}%</span>
        </div>
      )}
      <button onClick={() => onRemove(file.name)}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

// ── Incoming call banner ───────────────────────────────────────────────────────
function IncomingCallBanner({ caller, callType, onAccept, onDecline }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-3 rounded-2xl bg-dark-800 border border-dark-600 shadow-2xl">
      <Avatar name={caller} />
      <div>
        <p className="text-sm font-bold" style={{ color: 'rgb(var(--t1))' }}>{caller}</p>
        <p className="text-xs text-slate-400">Incoming {callType === 'video' ? 'video' : 'voice'} call…</p>
      </div>
      <button onClick={onDecline}
        className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center transition-colors">
        <PhoneOff className="w-4 h-4 text-white" />
      </button>
      <button onClick={onAccept}
        className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center transition-colors">
        <Phone className="w-4 h-4 text-white" />
      </button>
    </div>
  )
}

// ── Call UI overlay ────────────────────────────────────────────────────────────
function CallOverlay({ call, onEnd }) {
  const { peerName, callType, status, localStream, remoteStream, isScreenSharing } = call
  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  const [muted,    setMuted]    = useState(false)
  const [camOff,   setCamOff]   = useState(false)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (localVideoRef.current  && localStream)  localVideoRef.current.srcObject  = localStream
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream
  }, [localStream, remoteStream])

  useEffect(() => {
    if (status !== 'connected') return
    const t = setInterval(() => setDuration(d => d + 1), 1000)
    return () => clearInterval(t)
  }, [status])

  const fmtDuration = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMuted(m => !m)
  }
  const toggleCam = () => {
    localStream?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setCamOff(c => !c)
  }

  return (
    <div className="fixed inset-0 z-50 bg-dark-900/95 backdrop-blur-sm flex flex-col items-center justify-center gap-6">
      {/* Remote video */}
      {callType === 'video' || isScreenSharing ? (
        <div className="relative w-full max-w-2xl aspect-video bg-dark-800 rounded-2xl overflow-hidden border border-dark-700">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
          {status !== 'connected' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Avatar name={peerName} size="lg" />
              <p className="text-slate-400 text-sm animate-pulse">
                {status === 'calling' ? `Calling ${peerName}…` : status === 'ringing' ? 'Ringing…' : 'Connecting…'}
              </p>
            </div>
          )}
          {/* Local video (picture-in-picture) */}
          <div className="absolute bottom-3 right-3 w-28 aspect-video bg-dark-700 rounded-xl overflow-hidden border border-dark-600">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        </div>
      ) : (
        /* Voice-only view */
        <div className="flex flex-col items-center gap-4">
          <div className={`w-24 h-24 rounded-full ${avatarColor(peerName)} flex items-center justify-center text-2xl font-bold text-white shadow-2xl ${status === 'connected' ? 'ring-4 ring-emerald-500 ring-opacity-50 animate-pulse' : ''}`}>
            {initials(peerName)}
          </div>
          <p className="text-lg font-bold text-slate-100">{peerName}</p>
          <p className="text-slate-400 text-sm">
            {status === 'connected' ? fmtDuration(duration) : status === 'calling' ? 'Calling…' : 'Connecting…'}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-red-500 hover:bg-red-400' : 'bg-dark-700 hover:bg-dark-600 border border-dark-600'}`}>
          {muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-slate-300" />}
        </button>

        {callType === 'video' && (
          <button onClick={toggleCam}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${camOff ? 'bg-red-500 hover:bg-red-400' : 'bg-dark-700 hover:bg-dark-600 border border-dark-600'}`}>
            {camOff ? <VideoOff className="w-5 h-5 text-white" /> : <Video className="w-5 h-5 text-slate-300" />}
          </button>
        )}

        {/* Screen share */}
        <button onClick={call.onToggleScreen}
          title="Share screen"
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isScreenSharing ? 'bg-primary-600 hover:bg-primary-500' : 'bg-dark-700 hover:bg-dark-600 border border-dark-600'}`}>
          <Monitor className="w-5 h-5 text-slate-300" />
        </button>

        {/* End call */}
        <button onClick={onEnd}
          className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center transition-colors shadow-lg">
          <PhoneOff className="w-6 h-6 text-white" />
        </button>
      </div>
    </div>
  )
}

// ── Message Thread ─────────────────────────────────────────────────────────────
function MessageThread({ channel, companyId, session, profile, allUsers, onStartCall }) {
  const queryClient = useQueryClient()
  const myId   = session?.user?.id
  const myName = profile?.full_name || session?.user?.email || 'Me'
  const myRole = profile?.role || ''

  const [text,         setText]         = useState('')
  const [pendingFiles, setPendingFiles] = useState([])
  const [fileProgress, setFileProgress] = useState({})
  const [sending,      setSending]      = useState(false)
  const bottomRef  = useRef(null)
  const fileInput  = useRef(null)

  // Channel name (DMs use the other person's name)
  const channelLabel = useMemo(() => {
    if (channel.type === 'group') return `#${channel.name}`
    const other = channel.members?.find(m => m.user_id !== myId)
    return other?.user_name || 'Direct Message'
  }, [channel, myId])

  // Fetch messages
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['chat_messages', channel.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return data || []
    },
    enabled: !!channel.id,
  })

  // Realtime subscription
  useEffect(() => {
    const sub = supabase
      .channel(`messages-${channel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channel.id}`,
      }, (payload) => {
        queryClient.setQueryData(['chat_messages', channel.id], (old = []) => {
          if (old.some(m => m.id === payload.new.id)) return old
          return [...old, payload.new]
        })
        scrollBottom()
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [channel.id, queryClient])

  // Mark as read + scroll on channel open
  useEffect(() => {
    scrollBottom()
    markRead()
  }, [channel.id, messages.length])

  const scrollBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const markRead = async () => {
    await supabase.from('chat_last_read').upsert({
      channel_id:   channel.id,
      user_id:      myId,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'channel_id,user_id' })
    queryClient.invalidateQueries({ queryKey: ['chat_unread'] })
  }

  // File select
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    setPendingFiles(prev => [...prev, ...files])
    e.target.value = ''
  }

  const removeFile = (name) => setPendingFiles(prev => prev.filter(f => f.name !== name))

  // Upload file to Supabase Storage
  const uploadFile = async (file) => {
    const ext  = file.name.split('.').pop()
    const path = `${companyId}/${channel.id}/${crypto.randomUUID()}.${ext}`
    setFileProgress(p => ({ ...p, [file.name]: 0 }))

    const { error } = await supabase.storage
      .from('chat-attachments')
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) throw error
    setFileProgress(p => ({ ...p, [file.name]: 100 }))

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(path)

    return { name: file.name, type: file.type, size: file.size, url: publicUrl, path }
  }

  // Send message
  const sendMessage = async () => {
    if (!text.trim() && pendingFiles.length === 0) return
    setSending(true)
    try {
      const attachments = await Promise.all(pendingFiles.map(uploadFile))
      const { error } = await supabase.from('chat_messages').insert({
        channel_id:  channel.id,
        company_id:  companyId,
        sender_id:   myId,
        sender_name: myName,
        sender_role: myRole,
        content:     text.trim() || null,
        attachments,
      })
      if (error) throw error
      setText('')
      setPendingFiles([])
      setFileProgress({})
    } catch (e) {
      alert('Send failed: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const otherMember = channel.type === 'direct'
    ? channel.members?.find(m => m.user_id !== myId)
    : null

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Channel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700 bg-dark-800 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {channel.type === 'group'
            ? <Hash className="w-4 h-4 text-slate-400 flex-shrink-0" />
            : otherMember ? <Avatar name={otherMember.user_name} size="sm" /> : null
          }
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: 'rgb(var(--t1))' }}>{channelLabel}</p>
            {channel.description && (
              <p className="text-[10px] truncate" style={{ color: 'rgb(var(--t3))' }}>{channel.description}</p>
            )}
          </div>
        </div>
        {/* Call buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => onStartCall('audio')}
            title="Voice call"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-dark-700 transition-colors"
            style={{ color: 'rgb(var(--t3))' }}>
            <Phone className="w-4 h-4" />
          </button>
          <button onClick={() => onStartCall('video')}
            title="Video call"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-dark-700 transition-colors"
            style={{ color: 'rgb(var(--t3))' }}>
            <Video className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-0">
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-dark-700 border border-dark-600 flex items-center justify-center">
              {channel.type === 'group' ? <Hash className="w-6 h-6 text-slate-500" /> : <MessageSquare className="w-6 h-6 text-slate-500" />}
            </div>
            <p className="text-sm font-semibold" style={{ color: 'rgb(var(--t2))' }}>
              {channel.type === 'group' ? `Start the conversation in #${channel.name}` : `Start a conversation`}
            </p>
            <p className="text-xs text-slate-600">Share updates, files, and keep your team in the loop.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMine={msg.sender_id === myId}
            showAvatar={i === 0 || messages[i-1]?.sender_id !== msg.sender_id}
            prevMsg={messages[i-1]}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div className="flex gap-2 flex-wrap px-4 py-2 border-t border-dark-700 bg-dark-800/50">
          {pendingFiles.map(f => (
            <PendingFile key={f.name} file={f} onRemove={removeFile} progress={fileProgress[f.name] || 0} />
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2 px-3 py-3 border-t border-dark-700 bg-dark-800 flex-shrink-0">
        <input type="file" ref={fileInput} multiple className="hidden" onChange={handleFileSelect} />
        <button onClick={() => fileInput.current?.click()}
          title="Attach file"
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-dark-700 transition-colors flex-shrink-0"
          style={{ color: 'rgb(var(--t3))' }}>
          <Paperclip className="w-4 h-4" />
        </button>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={`Message ${channelLabel}`}
          className="flex-1 resize-none bg-dark-700 border border-dark-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-500 leading-relaxed max-h-32 overflow-y-auto"
          style={{ color: 'rgb(var(--t1))' }}
        />
        <button
          onClick={sendMessage}
          disabled={sending || (!text.trim() && pendingFiles.length === 0)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0">
          {sending
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Send className="w-4 h-4 text-white" />
          }
        </button>
      </div>
    </div>
  )
}

// ── New Channel Modal ──────────────────────────────────────────────────────────
function NewChannelModal({ companyId, session, profile, onClose, onCreated }) {
  const [name, setName]   = useState('')
  const [desc, setDesc]   = useState('')
  const [saving, setSaving] = useState(false)
  const myName = profile?.full_name || session?.user?.email || ''
  const myRole = profile?.role || ''

  const create = async () => {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    if (!slug) return
    setSaving(true)
    try {
      const { data: ch, error } = await supabase.from('chat_channels').insert({
        company_id: companyId, name: slug, description: desc.trim() || null,
        type: 'group', created_by: session?.user?.id,
      }).select().single()
      if (error) throw error
      await supabase.from('chat_members').insert({
        channel_id: ch.id, user_id: session?.user?.id, user_name: myName, user_role: myRole,
      })
      onCreated(ch)
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-800 rounded-2xl border border-dark-700 w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: 'rgb(var(--t1))' }}>New Channel</p>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Channel name</label>
            <div className="flex items-center gap-1 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 focus-within:border-primary-500">
              <span className="text-slate-500 text-sm">#</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. site-b-team"
                className="flex-1 bg-transparent text-sm focus:outline-none" style={{ color: 'rgb(var(--t1))' }} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description (optional)</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's this channel for?"
              className="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-sm focus:outline-none focus:border-primary-500"
              style={{ color: 'rgb(var(--t1))' }} />
          </div>
        </div>
        <button onClick={create} disabled={saving || !name.trim()}
          className="w-full py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
          {saving ? 'Creating…' : 'Create Channel'}
        </button>
      </div>
    </div>
  )
}

// ── New DM Modal ───────────────────────────────────────────────────────────────
function NewDMModal({ companyId, session, profile, myRole, allUsers, onClose, onOpened }) {
  const [search, setSearch] = useState('')
  const myId   = session?.user?.id
  const myName = profile?.full_name || session?.user?.email || ''

  const filtered = allUsers.filter(u =>
    u.id !== myId &&
    (u.full_name || u.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const openDM = async (other) => {
    const { data: channels } = await supabase
      .from('chat_channels')
      .select('*, members:chat_members(*)')
      .eq('company_id', companyId)
      .eq('type', 'direct')

    const existing = channels?.find(ch => {
      const ids = (ch.members || []).map(m => m.user_id)
      return ids.includes(myId) && ids.includes(other.id) && ids.length === 2
    })

    if (existing) { onOpened({ ...existing, members: existing.members }); onClose(); return }

    const { data: ch, error } = await supabase.from('chat_channels').insert({
      company_id: companyId, type: 'direct', created_by: myId,
    }).select().single()
    if (error) { alert(error.message); return }

    const members = [
      { channel_id: ch.id, user_id: myId,     user_name: myName,                    user_role: myRole        },
      { channel_id: ch.id, user_id: other.id,  user_name: other.full_name || other.email, user_role: other.role },
    ]
    await supabase.from('chat_members').insert(members)
    onOpened({ ...ch, members })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-800 rounded-2xl border border-dark-700 w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: 'rgb(var(--t1))' }}>New Direct Message</p>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-sm focus:outline-none focus:border-primary-500"
            style={{ color: 'rgb(var(--t1))' }} />
        </div>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {filtered.length === 0 && <p className="text-xs text-slate-500 text-center py-4">No employees found</p>}
          {filtered.map(u => (
            <button key={u.id} onClick={() => openDM(u)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-dark-700 transition-colors text-left">
              <Avatar name={u.full_name || u.email} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'rgb(var(--t1))' }}>{u.full_name || u.email}</p>
                <p className="text-[10px] uppercase font-semibold text-slate-500">{u.role}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Channel sidebar item ───────────────────────────────────────────────────────
function ChannelItem({ channel, active, unread, myId, onClick }) {
  const isDM    = channel.type === 'direct'
  const other   = isDM ? channel.members?.find(m => m.user_id !== myId) : null
  const label   = isDM ? (other?.user_name || 'DM') : channel.name

  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors ${active ? 'bg-primary-600/20 text-primary-300' : 'hover:bg-dark-700'}`}
      style={!active ? { color: 'rgb(var(--t2))' } : undefined}>
      <div className="flex-shrink-0">
        {isDM ? <Avatar name={other?.user_name} size="sm" /> : <Hash className="w-3.5 h-3.5 text-slate-500" />}
      </div>
      <span className={`flex-1 text-sm truncate ${unread > 0 ? 'font-bold' : 'font-medium'}`}>{label}</span>
      {unread > 0 && (
        <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}

// ── WebRTC call hook ───────────────────────────────────────────────────────────
function useWebRTCCall({ channel, companyId, session, profile }) {
  const myId   = session?.user?.id
  const myName = profile?.full_name || session?.user?.email || 'Me'
  const [callState, setCallState] = useState(null)  // null | {status, peerName, peerId, callType, ...}
  const [incomingCall, setIncomingCall] = useState(null)
  const pcRef     = useRef(null)
  const localRef  = useRef(null)
  const screenRef = useRef(null)

  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]

  // Subscribe to incoming signals
  useEffect(() => {
    if (!channel?.id || !myId) return
    const sub = supabase.channel(`call-signals-${channel.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_call_signals',
        filter: `channel_id=eq.${channel.id}`,
      }, (payload) => {
        const sig = payload.new
        if (sig.from_user === myId) return  // ignore own signals
        handleIncomingSignal(sig)
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [channel?.id, myId])

  const sendSignal = async (type, payload, toUser = null) => {
    await supabase.from('chat_call_signals').insert({
      channel_id: channel.id, company_id: companyId,
      from_user: myId, to_user: toUser,
      signal_type: type, payload,
    })
  }

  const handleIncomingSignal = async (sig) => {
    if (sig.signal_type === 'call-start') {
      setIncomingCall({ callerId: sig.from_user, callerName: sig.payload.name, callType: sig.payload.callType })
    } else if (sig.signal_type === 'call-end') {
      endCallCleanup()
    } else if (sig.signal_type === 'offer') {
      await handleOffer(sig.payload, sig.from_user)
    } else if (sig.signal_type === 'answer') {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(sig.payload))
      setCallState(prev => ({ ...prev, status: 'connected' }))
    } else if (sig.signal_type === 'ice-candidate') {
      try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(sig.payload)) } catch (_) {}
    } else if (sig.signal_type === 'busy') {
      setCallState(prev => ({ ...prev, status: 'busy' }))
      setTimeout(endCallCleanup, 2000)
    }
  }

  const createPeerConnection = (peerId, callType, localStream) => {
    const pc = new RTCPeerConnection({ iceServers })
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream))

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal('ice-candidate', candidate.toJSON(), peerId)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState(prev => ({ ...prev, status: 'connected' }))
      } else if (['disconnected','failed','closed'].includes(pc.connectionState)) {
        endCallCleanup()
      }
    }
    pc.ontrack = (e) => {
      setCallState(prev => ({ ...prev, remoteStream: e.streams[0] }))
    }
    pcRef.current = pc
    return pc
  }

  const startCall = async (callType) => {
    try {
      const constraints = { audio: true, video: callType === 'video' }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localRef.current = stream

      // Get other members in channel
      const { data: members } = await supabase
        .from('chat_members').select('*').eq('channel_id', channel.id)
      const others = members?.filter(m => m.user_id !== myId) || []
      const peer   = others[0]  // For simplicity, call first other member (1:1)
      if (!peer) { alert('No one else in this channel to call'); stream.getTracks().forEach(t => t.stop()); return }

      const pc = createPeerConnection(peer.user_id, callType, stream)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await sendSignal('call-start', { name: myName, callType }, peer.user_id)
      await sendSignal('offer', offer, peer.user_id)

      setCallState({
        status: 'calling', peerId: peer.user_id, peerName: peer.user_name,
        callType, localStream: stream, remoteStream: null, isScreenSharing: false,
        onToggleScreen: toggleScreenShare,
      })
    } catch (e) {
      alert('Could not start call: ' + (e.message || 'Permission denied'))
    }
  }

  const handleOffer = async (offer, peerId) => {
    try {
      const { data: members } = await supabase
        .from('chat_members').select('*').eq('channel_id', channel.id)
      const caller = members?.find(m => m.user_id === peerId)
      if (!caller) return

      if (callState) { await sendSignal('busy', {}, peerId); return }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localRef.current = stream
      const pc = createPeerConnection(peerId, 'audio', stream)
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendSignal('answer', answer, peerId)

      setCallState({
        status: 'connected', peerId, peerName: caller.user_name,
        callType: 'audio', localStream: stream, remoteStream: null, isScreenSharing: false,
        onToggleScreen: toggleScreenShare,
      })
    } catch (e) { console.error('handleOffer error', e) }
  }

  const acceptCall = async () => {
    if (!incomingCall) return
    setIncomingCall(null)
    // startCall flow handled by offer → already in handleOffer
  }

  const declineCall = async () => {
    if (!incomingCall) return
    await sendSignal('busy', {}, incomingCall.callerId)
    setIncomingCall(null)
  }

  const toggleScreenShare = async () => {
    if (!callState?.isScreenSharing) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        screenRef.current = screen
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(screen.getVideoTracks()[0])
        screen.getVideoTracks()[0].onended = () => stopScreenShare()
        setCallState(prev => ({ ...prev, isScreenSharing: true }))
      } catch (e) { alert('Screen share denied') }
    } else {
      stopScreenShare()
    }
  }

  const stopScreenShare = async () => {
    screenRef.current?.getTracks().forEach(t => t.stop())
    const camTrack = localRef.current?.getVideoTracks()[0]
    if (camTrack) {
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
      if (sender) await sender.replaceTrack(camTrack)
    }
    setCallState(prev => prev ? { ...prev, isScreenSharing: false } : prev)
  }

  const endCallCleanup = () => {
    pcRef.current?.close(); pcRef.current = null
    localRef.current?.getTracks().forEach(t => t.stop()); localRef.current = null
    screenRef.current?.getTracks().forEach(t => t.stop()); screenRef.current = null
    setCallState(null); setIncomingCall(null)
  }

  const endCall = async () => {
    if (callState?.peerId) await sendSignal('call-end', {}, callState.peerId)
    endCallCleanup()
  }

  return { callState, incomingCall, startCall, endCall, acceptCall, declineCall }
}

// ── Main ChatPage ──────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { companyId, session, profile, role } = useAuth()
  const queryClient = useQueryClient()
  const myId   = session?.user?.id
  const myName = profile?.full_name || session?.user?.email || ''
  const myRole = role || ''

  const [activeChannel,   setActiveChannel]   = useState(null)
  const [showNewChannel,  setShowNewChannel]   = useState(false)
  const [showNewDM,       setShowNewDM]        = useState(false)
  const [sidebarOpen,     setSidebarOpen]      = useState(true)

  // All company users (for DM picker)
  // NOTE: role lives in user_roles table, not user_profiles — fetch and merge
  const { data: allUsers = [] } = useQuery({
    queryKey: ['company_users', companyId],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, full_name, email')
          .eq('company_id', companyId)
          .order('full_name'),
        supabase
          .from('user_roles')
          .select('user_id, role'),
      ])
      const roleMap = Object.fromEntries((roles || []).map(r => [r.user_id, r.role]))
      return (profiles || []).map(p => ({ ...p, role: roleMap[p.id] || '' }))
    },
    enabled: !!companyId,
  })

  // All channels (group + DMs I'm a member of)
  const { data: channels = [], refetch: refetchChannels } = useQuery({
    queryKey: ['chat_channels', companyId, myId],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('chat_members')
        .select('channel_id')
        .eq('user_id', myId)
      const channelIds = memberships?.map(m => m.channel_id) || []
      if (channelIds.length === 0) return []

      const { data: chs } = await supabase
        .from('chat_channels')
        .select('*, members:chat_members(user_id, user_name, user_role)')
        .in('id', channelIds)
        .eq('is_archived', false)
        .order('created_at')
      return chs || []
    },
    enabled: !!companyId && !!myId,
  })

  // Unread counts
  const { data: unreadMap = {} } = useQuery({
    queryKey: ['chat_unread', companyId, myId],
    queryFn: async () => {
      const { data: lastReads } = await supabase
        .from('chat_last_read')
        .select('channel_id, last_read_at')
        .eq('user_id', myId)

      const readMap = Object.fromEntries((lastReads || []).map(r => [r.channel_id, r.last_read_at]))

      const { data: memberships } = await supabase
        .from('chat_members').select('channel_id').eq('user_id', myId)
      const channelIds = memberships?.map(m => m.channel_id) || []

      const counts = {}
      await Promise.all(channelIds.map(async (cid) => {
        const since = readMap[cid] || '1970-01-01'
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', cid)
          .eq('is_deleted', false)
          .gt('created_at', since)
          .neq('sender_id', myId)
        counts[cid] = count || 0
      }))
      return counts
    },
    enabled: !!companyId && !!myId,
    refetchInterval: 15_000,
  })

  // Seed default channels on first open
  useEffect(() => {
    if (!companyId || !myId || channels.length > 0) return
    seedDefaultChannels()
  }, [companyId, myId, channels.length])

  const seedDefaultChannels = async () => {
    const defaults = [
      { name: 'general',       description: 'Company-wide announcements and updates' },
      { name: 'team-chat',     description: 'Day-to-day team conversations' },
      { name: 'site-updates',  description: 'On-site progress, issues and photos' },
    ]
    for (const ch of defaults) {
      const { data: created } = await supabase.from('chat_channels')
        .insert({ company_id: companyId, ...ch, type: 'group', created_by: myId })
        .select().single()
      if (created) {
        await supabase.from('chat_members').insert({
          channel_id: created.id, user_id: myId, user_name: myName, user_role: myRole,
        })
      }
    }
    refetchChannels()
  }

  const groupChannels = channels.filter(c => c.type === 'group')
  const dmChannels    = channels.filter(c => c.type === 'direct')

  const handleChannelCreated = (ch) => {
    refetchChannels()
    setShowNewChannel(false)
    setActiveChannel({ ...ch, members: [] })
  }

  const handleDMOpened = (ch) => {
    refetchChannels()
    setActiveChannel(ch)
  }

  // WebRTC
  const { callState, incomingCall, startCall, endCall, acceptCall, declineCall } = useWebRTCCall({
    channel: activeChannel, companyId, session, profile,
  })

  const totalUnread = Object.values(unreadMap).reduce((s, c) => s + c, 0)

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ── */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 bg-dark-800 border-r border-dark-700 flex flex-col transition-all duration-200 overflow-hidden`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-dark-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary-400" />
            <p className="text-sm font-bold" style={{ color: 'rgb(var(--t1))' }}>Team Chat</p>
            {totalUnread > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">
                {totalUnread}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-4 px-2">
          {/* Group channels */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Channels</p>
              <button onClick={() => setShowNewChannel(true)}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-dark-600 transition-colors text-slate-500 hover:text-slate-300">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {groupChannels.map(ch => (
              <ChannelItem key={ch.id} channel={ch} myId={myId}
                active={activeChannel?.id === ch.id}
                unread={unreadMap[ch.id] || 0}
                onClick={() => { setActiveChannel(ch); if (window.innerWidth < 1024) setSidebarOpen(false) }}
              />
            ))}
          </div>

          {/* DMs */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Direct Messages</p>
              <button onClick={() => setShowNewDM(true)}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-dark-600 transition-colors text-slate-500 hover:text-slate-300">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {dmChannels.map(ch => (
              <ChannelItem key={ch.id} channel={ch} myId={myId}
                active={activeChannel?.id === ch.id}
                unread={unreadMap[ch.id] || 0}
                onClick={() => { setActiveChannel(ch); if (window.innerWidth < 1024) setSidebarOpen(false) }}
              />
            ))}
            {dmChannels.length === 0 && (
              <p className="text-xs text-slate-600 px-3 py-1">No direct messages yet</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Main thread area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeChannel ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)}
                className="absolute top-4 left-4 p-2 rounded-lg hover:bg-dark-700 transition-colors"
                style={{ color: 'rgb(var(--t3))' }}>
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-16 h-16 rounded-2xl bg-dark-700 border border-dark-600 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-slate-500" />
            </div>
            <div>
              <p className="text-base font-semibold" style={{ color: 'rgb(var(--t1))' }}>Select a channel or DM</p>
              <p className="text-sm text-slate-500 mt-1">Choose from the left or start a new conversation</p>
            </div>
            <button onClick={() => setShowNewDM(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" /> New Message
            </button>
          </div>
        ) : (
          <>
            {/* Back button on mobile */}
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)}
                className="lg:hidden flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 border-b border-dark-700">
                <ArrowLeft className="w-3.5 h-3.5" /> Channels
              </button>
            )}
            <MessageThread
              key={activeChannel.id}
              channel={activeChannel}
              companyId={companyId}
              session={session}
              profile={profile}
              allUsers={allUsers}
              onStartCall={startCall}
            />
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showNewChannel && (
        <NewChannelModal companyId={companyId} session={session} profile={profile}
          onClose={() => setShowNewChannel(false)} onCreated={handleChannelCreated} />
      )}
      {showNewDM && (
        <NewDMModal companyId={companyId} session={session} profile={profile}
          myRole={myRole}
          allUsers={allUsers}
          onClose={() => setShowNewDM(false)} onOpened={handleDMOpened} />
      )}

      {/* ── Incoming call banner ── */}
      {incomingCall && (
        <IncomingCallBanner
          caller={incomingCall.callerName}
          callType={incomingCall.callType}
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}

      {/* ── Active call overlay ── */}
      {callState && (
        <CallOverlay call={callState} onEnd={endCall} />
      )}
    </div>
  )
}
