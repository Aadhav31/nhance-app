import { useEffect } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { legacyNotificationReadIds } from '../lib/notifications'

export default function useNotifications(view = 'all', { live = false } = {}) {
  const { companyId, session } = useAuth()
  const userId = session?.user?.id
  const qc = useQueryClient()
  const enabled = !!companyId && !!userId
  const prefix = ['notifications', companyId, userId]
  const query = useInfiniteQuery({
    queryKey: [...prefix, view], enabled, initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_notification_feed', {
        p_view: view, p_limit: 25,
        p_before_created_at: pageParam?.created_at || null, p_before_id: pageParam?.id || null,
      })
      if (error) throw error
      if (!data || data.company_id !== companyId || data.actor_id !== userId) throw new Error('Sign in again to refresh your notifications.')
      return data
    },
    getNextPageParam: page => page.next_cursor || undefined,
    staleTime: 10_000, refetchInterval: 30_000,
  })

  // The bell owns one app-wide subscription; Home shares its query cache.
  useEffect(() => {
    if (!enabled || !live) return undefined
    let timer, stopped = false
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { if (!stopped) qc.invalidateQueries({ queryKey: prefix }) }, 100)
    }
    const channel = supabase.channel(`notification-inbox:${companyId}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `company_id=eq.${companyId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_receipts', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh() })
    const online = () => refresh()
    window.addEventListener('online', online)
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('online', online); supabase.removeChannel(channel) }
  }, [companyId, userId, enabled, live, qc])

  useEffect(() => {
    if (!enabled || !live) return undefined
    const key = `nhance_notification_reads_v1:${companyId}:${userId}`
    const ids = legacyNotificationReadIds(key)
    if (!ids.length) return undefined
    let stopped = false
    supabase.rpc('mark_notifications_read', { p_ids: ids }).then(({ error }) => {
      if (error || stopped) return
      try { localStorage.removeItem(key) } catch { /* The database remains authoritative. */ }
      qc.invalidateQueries({ queryKey: prefix })
    }).catch(() => { /* Retain old reads for a later migration retry. */ })
    return () => { stopped = true }
  }, [companyId, userId, enabled, live, qc])

  const mutation = useMutation({
    mutationFn: async ({ ids = null, through = null, review = false }) => {
      const { data, error } = await supabase.rpc('mark_notifications_read', {
        p_ids: ids, p_through_created_at: through?.created_at || null,
        p_through_id: through?.id || null, p_review: review,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: prefix }),
  })
  const pages = query.data?.pages || []
  const rows = [...new Map(pages.flatMap(page => page.items || []).map(row => [row.id, row])).values()]
  return { ...query, enabled, rows, unread: Number(pages[0]?.unread_count || 0),
    total: Number(pages[0]?.total_count || 0), snapshot: pages[0]?.snapshot || null,
    markRead: mutation.mutateAsync, marking: mutation.isPending }
}
