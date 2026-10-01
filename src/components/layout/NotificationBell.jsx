import { useEffect, useId, useRef, useState } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { canAccessPage } from '../../lib/navigation'

function loadReadIds(key) {
  if (!key) return []
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value.filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)).slice(-1000) : []
  } catch { return [] }
}

function notificationPage(notification) {
  if (notification.type?.startsWith('incident_')) return 'fleet'
  if (notification.type === 'meter_discrepancy') return 'operations'
  if (notification.type === 'outstanding_dues') return 'projects'
  return null
}

export default function NotificationBell({ onNavigate }) {
  const { companyId, session, role, hasModule } = useAuth()
  const userId = session?.user?.id
  const readKey = companyId && userId ? `nhance_notification_reads_v1:${companyId}:${userId}` : null
  const [readState, setReadState] = useState(() => ({ key: readKey, ids: loadReadIds(readKey) }))
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const closeRef = useRef(null)
  const panelId = useId()
  const titleId = useId()
  const readIds = new Set(readState.key === readKey ? readState.ids : [])
  const { data: notifications = [], isPending, isError, refetch } = useQuery({
    queryKey: ['notifications', companyId, userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications')
        .select('id,user_id,type,title,body,is_read,created_at')
        .eq('company_id', companyId).or(`user_id.is.null,user_id.eq.${userId}`)
        .order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data || []
    },
    enabled: !!companyId && !!userId,
    refetchInterval: 30_000,
  })
  const unread = notifications.filter(item => !item.is_read && !readIds.has(item.id)).length

  useEffect(() => {
    setReadState({ key: readKey, ids: loadReadIds(readKey) })
    setOpen(false)
    const onStorage = event => {
      if (event.key === readKey || event.key === null) setReadState({ key: readKey, ids: loadReadIds(readKey) })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [readKey])

  useEffect(() => {
    if (!open) return undefined
    closeRef.current?.focus()
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const markRead = ids => {
    // Broadcast alerts have no recipient-specific read column. Keep dismissal
    // scoped to this company/user/browser rather than hiding alerts for the team.
    const next = [...new Set([...readIds, ...ids])].slice(-1000)
    setReadState({ key: readKey, ids: next })
    if (readKey) {
      try { localStorage.setItem(readKey, JSON.stringify(next)) } catch { /* Memory-only when browser storage is unavailable. */ }
    }
  }

  const openNotification = notification => {
    markRead([notification.id])
    const page = notificationPage(notification)
    if (page && canAccessPage(page, { role, hasModule })) {
      setOpen(false)
      onNavigate?.(page)
    }
  }

  if (!companyId || !userId) return null

  return (
    <div className="relative" ref={rootRef}>
      <button ref={buttonRef} type="button" onClick={() => setOpen(value => !value)}
        aria-label="Notifications" title={unread ? `${unread} unread recent notification${unread === 1 ? '' : 's'}` : 'Notifications'}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
        aria-describedby={unread ? `${panelId}-unread` : undefined}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-dark-700 transition-all"
        style={{ color: 'rgb(var(--t2))' }}>
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unread > 0 && <span id={`${panelId}-unread`} aria-label={`${unread} unread notifications`} className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">{unread > 99 ? '99+' : unread}<span className="sr-only"> unread notifications</span></span>}
      </button>
      {open && (
        <section id={panelId} role="dialog" aria-labelledby={titleId} className="absolute right-0 top-full mt-3 z-[60] w-[min(380px,calc(100vw-2rem))] max-h-[min(560px,calc(100dvh-100px))] flex flex-col bg-dark-800 border border-dark-600 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-dark-600 shrink-0">
            <div>
              <h2 id={titleId} className="text-sm font-bold" style={{ color: 'rgb(var(--t1))' }}>Notifications</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--t3))' }}>{isPending ? 'Loading alerts…' : isError ? 'Alerts unavailable' : unread ? `${unread} unread` : 'You’re all caught up'}</p>
            </div>
            <button ref={closeRef} type="button" onClick={() => { setOpen(false); buttonRef.current?.focus() }} aria-label="Close notifications" className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
          </div>
          {isPending ? <p role="status" className="p-6 text-sm" style={{ color: 'rgb(var(--t3))' }}>Loading notifications…</p>
            : isError ? <div role="alert" className="p-6 text-sm"><p>Could not load notifications.</p><button type="button" className="btn-ghost mt-3" onClick={() => refetch()}>Try again</button></div>
            : notifications.length === 0 ? <div className="p-8 text-center"><Bell className="w-7 h-7 mx-auto mb-3 text-slate-500" /><p className="text-sm font-medium" style={{ color: 'rgb(var(--t1))' }}>No notifications yet</p><p className="text-xs mt-2" style={{ color: 'rgb(var(--t3))' }}>Operational alerts will appear here.</p></div>
            : <ul className="overflow-y-auto divide-y divide-dark-600">
              {notifications.map(notification => {
                const isUnread = !notification.is_read && !readIds.has(notification.id)
                const timestamp = new Date(notification.created_at)
                return <li key={notification.id}>
                  <button type="button" onClick={() => openNotification(notification)} className={`w-full flex gap-3 text-left p-4 hover:bg-dark-700 transition-colors ${isUnread ? 'bg-primary-600/5' : ''}`}>
                    <span aria-label={isUnread ? 'Unread' : 'Read'} className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${isUnread ? 'bg-primary-400' : 'bg-dark-600'}`} />
                    <span className="min-w-0">
                      <span className={`block text-sm break-words ${isUnread ? 'font-semibold' : 'font-medium'}`} style={{ color: 'rgb(var(--t1))' }}>{notification.title}</span>
                      {notification.body && <span className="block text-xs mt-1 leading-relaxed break-words" style={{ color: 'rgb(var(--t2))' }}>{notification.body}</span>}
                      {!Number.isNaN(timestamp.getTime()) && <time dateTime={timestamp.toISOString()} className="block text-[10px] mt-2" style={{ color: 'rgb(var(--t3))' }}>{timestamp.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>}
                    </span>
                  </button>
                </li>
              })}
            </ul>}
          {notifications.length > 0 && !isError && <div className="flex items-center justify-between gap-2 p-3 border-t border-dark-600 shrink-0"><span className="text-[10px]" style={{ color: 'rgb(var(--t3))' }}>Recent notifications{notifications.length === 50 ? ' · latest 50' : ''}</span><button type="button" disabled={!unread} onClick={() => markRead(notifications.map(item => item.id))} className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40"><Check className="w-3.5 h-3.5" />Mark all read</button></div>}
        </section>
      )}
    </div>
  )
}
