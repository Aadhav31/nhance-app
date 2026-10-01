import { useState } from 'react'
import { AlertTriangle, Check, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canAccessPage } from '../../lib/navigation'
import { notificationDate, notificationTarget } from '../../lib/notifications'
import useNotifications from '../../hooks/useNotifications'

export default function HomeNotificationAlerts({ onNavigate }) {
  const { role, hasModule } = useAuth()
  const feed = useNotifications('alerts')
  const [error, setError] = useState('')
  const acknowledge = async item => {
    setError('')
    try { await feed.markRead({ ids: [item.id], review: true }) }
    catch (err) { setError(err.message || 'Could not acknowledge this alert. Try again.') }
  }
  if (!feed.enabled || !feed.isPending && !feed.isError && !feed.rows.length) return null
  return <section aria-label="Alerts awaiting review" className="card p-4 space-y-3">
    <div className="flex gap-3 items-start"><AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" /><div><h2 className="text-sm font-semibold text-slate-100">Alerts awaiting review{feed.total > 0 ? ` (${feed.total})` : ''}</h2><p className="text-xs text-slate-400 mt-1">Review alerts here. All notifications remain in the bell.</p></div></div>
    {feed.isPending && <p role="status" className="text-sm text-slate-400">Loading alerts…</p>}
    {(error || feed.isError) && <div role="alert" className="text-sm text-red-400"><p>{error || 'Could not load home alerts.'}</p>{feed.isError && <button className="btn-ghost text-xs mt-2" onClick={() => feed.refetch()}>Try again</button>}</div>}
    <div className="space-y-2">{feed.rows.map(item => {
      const target = notificationTarget(item)
      const canOpen = target && canAccessPage(target.page, { role, hasModule })
      const stamp = notificationDate(item.created_at)
      return <article key={item.id} className={`rounded-xl border p-3 ${item.alert_level === 'critical' ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
        <p className={`text-sm font-semibold break-words ${item.alert_level === 'critical' ? 'text-red-300' : 'text-amber-300'}`}>{item.title || 'Alert'}</p>
        {item.body && <p className="text-xs text-slate-300 mt-1 break-words leading-relaxed">{item.body}</p>}
        {stamp && <time dateTime={stamp.toISOString()} className="text-[10px] text-slate-500 block mt-2">{stamp.toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time>}
        <div className="flex flex-wrap gap-3 items-center mt-3">
          {canOpen && <button type="button" onClick={() => onNavigate?.(target.page,target.extra)} className="text-xs text-primary-400 inline-flex items-center gap-1">Review details <ChevronRight className="w-3 h-3" /></button>}
          <button type="button" aria-label={`Acknowledge ${item.title || 'alert'}`} disabled={feed.marking} onClick={() => acknowledge(item)} className="btn-ghost text-xs inline-flex items-center gap-1 disabled:opacity-50"><Check className="w-3 h-3" />Acknowledge alert</button>
        </div>
      </article>
    })}</div>
    {feed.hasNextPage && <button type="button" disabled={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()} className="btn-ghost text-xs w-full">{feed.isFetchingNextPage ? 'Loading alerts…' : 'Load older alerts'}</button>}
  </section>
}
