import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Tables to watch for live updates.
// Each change invalidates all React Query cache so every open page refreshes instantly.
const WATCHED_TABLES = [
  'account_transactions',
  'expenses',
  'field_expenses',
  'fixed_expenses',
  'fixed_expense_payments',
  'client_invoices',
  'invoice_line_items',
  'invoice_payments',
  'equipment',
  'daily_operations',
  'hr_employees',
  'maintenance_logs',
  'inventory_items',
  'projects',
]

export function useRealtimeSync() {
  const queryClient  = useQueryClient()
  const { companyId } = useAuth()
  const channelRef   = useRef(null)

  useEffect(() => {
    if (!companyId) return

    // Clean up any existing channel before creating a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase.channel(`nhance_live_${companyId}`)

    WATCHED_TABLES.forEach(table => {
      channel.on(
        'postgres_changes',
        {
          event:  '*',            // INSERT, UPDATE, DELETE
          schema: 'public',
          table,
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          // Invalidate all cached queries — React Query refetches only
          // what's currently rendered on screen (no wasted network calls).
          queryClient.invalidateQueries()
        }
      )
    })

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.log('[Nhance Live] ✓ Real-time sync active')
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[Nhance Live] Realtime not enabled for some tables — run the SQL migration to activate.')
      }
    })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [companyId, queryClient])
}
