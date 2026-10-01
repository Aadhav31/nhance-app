import { useEffect, useId, useRef, useState } from 'react'
import { Bell, Check, Loader2, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canAccessPage } from '../../lib/navigation'
import { notificationDate, notificationTarget } from '../../lib/notifications'
import useNotifications from '../../hooks/useNotifications'

export default function NotificationBell({ onNavigate }) {
  const { companyId, session, role, hasModule } = useAuth()
  const feed = useNotifications('all', { live: true })
  const [open, setOpen] = useState(false)
  const [saveError, setSaveError] = useState('')
  const rootRef = useRef(null), buttonRef = useRef(null), closeRef = useRef(null)
  const panelId = useId(), titleId = useId()
  const userId = session?.user?.id
  useEffect(() => { setOpen(false); setSaveError('') }, [companyId, userId])
  useEffect(() => {
    if (!open) return undefined
    closeRef.current?.focus()
    const pointer = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const key = event => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key) }
  }, [open])
  const read = async options => {
    setSaveError('')
    try { await feed.markRead(options); return true }
    catch (error) { setSaveError(error.message || 'Could not mark notifications as read. Try again.'); return false }
  }
  const openNotification = async notification => {
    if (feed.marking) return
    if (!notification.is_read && !await read({ ids: [notification.id] })) return
    const target = notificationTarget(notification)
    if (target && canAccessPage(target.page, { role, hasModule })) { setOpen(false); onNavigate?.(target.page, target.extra) }
  }
  if (!feed.enabled) return null
  return <div className="relative" ref={rootRef}>
    <button ref={buttonRef} type="button" onClick={() => setOpen(value => !value)}
      aria-label="Notifications" title={feed.unread ? `${feed.unread} unread notification${feed.unread === 1 ? '' : 's'}` : 'Notifications'}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
      aria-describedby={feed.unread ? `${panelId}-unread` : undefined}
      className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-dark-700 transition-all" style={{ color: 'rgb(var(--t2))' }}>
      <Bell className="w-4 h-4" aria-hidden="true" />
      {feed.unread > 0 && <span id={`${panelId}-unread`} aria-label={`${feed.unread} unread notifications`} className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">{feed.unread > 99 ? '99+' : feed.unread}<span className="sr-only"> unread notifications</span></span>}
    </button>
    {open && <section id={panelId} role="dialog" aria-labelledby={titleId} className="fixed right-4 top-[68px] sm:absolute sm:right-0 sm:top-full mt-3 z-[60] w-[min(380px,calc(100vw-2rem))] max-h-[min(560px,calc(100dvh-100px))] flex flex-col bg-dark-800 border border-dark-600 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-dark-600 shrink-0">
        <div><h2 id={titleId} className="text-sm font-bold" style={{ color: 'rgb(var(--t1))' }}>Notifications</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--t3))' }}>{feed.isPending ? 'Loading notifications…' : feed.isError && !feed.rows.length ? 'Notifications unavailable' : feed.unread ? `${feed.unread} unread` : 'You’re all caught up'}</p></div>
        <button ref={closeRef} type="button" onClick={() => { setOpen(false); buttonRef.current?.focus() }} aria-label="Close notifications" className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
      </div>
      {(saveError || feed.isError) && <div role="alert" className="p-4 text-xs text-red-400 border-b border-dark-600"><p>{saveError || 'Could not load notifications.'}</p>{feed.isError && <button type="button" className="btn-ghost mt-2" onClick={() => feed.refetch()}>Try again</button>}</div>}
      {feed.isPending ? <p role="status" className="p-6 text-sm text-slate-400">Loading notifications…</p>
        : !feed.isError && !feed.rows.length ? <div className="p-8 text-center"><Bell className="w-7 h-7 mx-auto mb-3 text-slate-500" /><p className="text-sm font-medium" style={{ color: 'rgb(var(--t1))' }}>No notifications yet</p><p className="text-xs mt-2" style={{ color: 'rgb(var(--t3))' }}>Updates appear here. Alerts also appear on Home.</p></div>
        : <div className="min-h-0 overflow-y-auto"><ul className="divide-y divide-dark-600">
          {feed.rows.map(notification => {
            const timestamp = notificationDate(notification.created_at)
            return <li key={notification.id}><button type="button" disabled={feed.marking} onClick={() => openNotification(notification)} className={`w-full flex gap-3 text-left p-4 hover:bg-dark-700 transition-colors disabled:opacity-60 ${!notification.is_read ? 'bg-primary-600/5' : ''}`}>
              <span aria-label={!notification.is_read ? 'Unread' : 'Read'} className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${!notification.is_read ? 'bg-primary-400' : 'bg-dark-600'}`} />
              <span className="min-w-0"><span className={`block text-sm break-words ${!notification.is_read ? 'font-semibold' : 'font-medium'}`} style={{ color: 'rgb(var(--t1))' }}>{notification.title || 'Notification'}</span>
                {notification.body && <span className="block text-xs mt-1 leading-relaxed break-words" style={{ color: 'rgb(var(--t2))' }}>{notification.body}</span>}
                {timestamp && <time dateTime={timestamp.toISOString()} className="block text-[10px] mt-2" style={{ color: 'rgb(var(--t3))' }}>{timestamp.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>}
              </span></button></li>
          })}</ul>
          {feed.hasNextPage && <div className="p-3 border-t border-dark-600"><button type="button" disabled={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()} className="btn-ghost text-xs w-full">{feed.isFetchingNextPage ? 'Loading older notifications…' : 'Load older notifications'}</button></div>}
        </div>}
      {feed.rows.length > 0 && <div className="flex items-center justify-between gap-2 p-3 border-t border-dark-600 shrink-0"><span className="text-[10px]" style={{ color: 'rgb(var(--t3))' }}>{feed.rows.length} of {feed.total} notifications</span><button type="button" disabled={!feed.unread || feed.marking || !feed.snapshot} onClick={() => read({ through: feed.snapshot })} className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40">{feed.marking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Mark all read</button></div>}
    </section>}
  </div>
}
