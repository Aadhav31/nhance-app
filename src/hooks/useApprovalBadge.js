import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { isWorkflowEngineUnavailable } from '../lib/approvalWorkflow'

export function useApprovalBadge() {
  const { companyId, role, session } = useAuth()
  const userId = session?.user?.id
  const visibleRoles = role === 'admin' ? ['manager', 'accounts', 'admin']
    : ['manager', 'accounts', 'supervisor'].includes(role) ? [role] : []
  const query = useQuery({
    queryKey: ['approval_badge', companyId, userId, ...visibleRoles],
    queryFn: async () => {
      if (!visibleRoles.length) return 0
      const { count, error } = await supabase.from('approval_task_inbox').select('task_id', { count: 'exact', head: true })
      if (!error) return count || 0
      if (!isWorkflowEngineUnavailable(error)) throw error
      const { count: legacyCount, error: legacyError } = await supabase.from('approval_requests')
        .select('id', { count: 'exact', head: true }).eq('company_id', companyId)
        .eq('status', 'pending').in('required_role', visibleRoles)
      if (legacyError) throw legacyError
      return legacyCount || 0
    },
    enabled: !!companyId && !!userId && visibleRoles.length > 0,
    refetchInterval: 30_000,
  })
  return { canViewApprovals: visibleRoles.length > 0, pendingCount: query.data || 0 }
}
