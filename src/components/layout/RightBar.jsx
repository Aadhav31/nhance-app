/**
 * RightBar — slim 48px vertical icon strip on the right edge.
 *
 * Contains: Chat, Notes, Approval Centre, Audit Log, Settings, Company Profile
 * These are "system/utility" actions — always accessible, not module content.
 *
 * Items are filtered by role + module access (same rules as Sidebar).
 * Approval Centre shows a badge when there are pending requests.
 */

import { useEffect, useState } from 'react'
import {
  MessageSquare, StickyNote, CheckCircle2,
  Shield, Settings, Building2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import { MODULES, ROLES } from '../../lib/constants'

// ── Right-bar item definitions ────────────────────────────────────────────────
const ITEMS_TOP = [
  {
    key:    'chat',
    Icon:   MessageSquare,
    label:  'Team Chat',
    roles:  [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
    module: MODULES.CORE,
    type:   'navigate',
  },
  {
    key:    'notes',
    Icon:   StickyNote,
    label:  'Quick Notes',
    roles:  [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN, ROLES.OPERATOR],
    module: MODULES.CORE,
    type:   'toggle',
    color:  'text-yellow-400',
  },
]

const ITEMS_BOTTOM = [
  {
    key:    'approval_center',
    Icon:   CheckCircle2,
    label:  'Approval Centre',
    roles:  [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
    module: MODULES.CORE,
    type:   'navigate',
    badge:  true,   // shows pending count badge
  },
  {
    key:    'audit_log',
    Icon:   Shield,
    label:  'Audit Log',
    roles:  [ROLES.ADMIN],
    module: MODULES.CORE,
    type:   'navigate',
  },
  {
    key:    'settings',
    Icon:   Settings,
    label:  'Settings',
    roles:  [ROLES.ADMIN],
    module: MODULES.CORE,
    type:   'navigate',
  },
  {
    key:    'company',
    Icon:   Building2,
    label:  'Company Profile',
    roles:  [ROLES.ADMIN],
    module: MODULES.CORE,
    type:   'navigate',
  },
]

// ── Icon button ───────────────────────────────────────────────────────────────
function RightBtn({ item, isActive, isOn, badge, onClick }) {
  const { Icon, label, color } = item
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'relative w-full flex flex-col items-center gap-1 py-3 transition-all duration-150 group',
        isActive || isOn
          ? 'text-primary-400'
          : color
            ? color
            : 'text-slate-500 hover:text-slate-200'
      )}
    >
      {/* Active indicator bar on RIGHT edge */}
      {(isActive || isOn) && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-l-full bg-primary-400" />
      )}

      <div className="relative">
        <Icon className="w-5 h-5" />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>

      <span className="text-[8px] font-bold uppercase tracking-wide leading-none text-center px-0.5 truncate w-full">
        {label.length > 8 ? label.split(' ')[0] : label}
      </span>
    </button>
  )
}

// ── MAIN RIGHT BAR ────────────────────────────────────────────────────────────
export default function RightBar({
  activePage,
  onNavigate,
  notesOpen,
  onToggleNotes,
}) {
  const { role, hasModule, companyId } = useAuth()

  // ── Pending approval count for badge ───────────────────────────────────────
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!companyId) return
    // Only fetch if user role can see approvals
    if (![ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN].includes(role)) return

    const fetchPending = async () => {
      try {
        const { count } = await supabase
          .from('approval_requests')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'pending')
        setPendingCount(count || 0)
      } catch {}
    }

    fetchPending()
    const interval = setInterval(fetchPending, 60_000)
    return () => clearInterval(interval)
  }, [companyId, role])

  // Filter items by role + module
  const visibleTop    = ITEMS_TOP.filter(i => i.roles.includes(role) && hasModule(i.module))
  const visibleBottom = ITEMS_BOTTOM.filter(i => i.roles.includes(role) && hasModule(i.module))

  if (visibleTop.length === 0 && visibleBottom.length === 0) return null

  const handleClick = (item) => {
    if (item.type === 'toggle' && item.key === 'notes') {
      onToggleNotes?.()
    } else {
      onNavigate(item.key)
    }
  }

  return (
    <aside className="hidden lg:flex flex-col bg-dark-800 border-l border-dark-700 flex-shrink-0 w-12">

      {/* Top group: Chat, Notes */}
      <div className="border-b border-dark-700">
        <div className="h-14 flex items-center justify-center">
          {/* spacer matching TopBar height */}
        </div>
        {visibleTop.map(item => (
          <RightBtn
            key={item.key}
            item={item}
            isActive={activePage === item.key}
            isOn={item.key === 'notes' && notesOpen}
            badge={item.badge ? pendingCount : 0}
            onClick={() => handleClick(item)}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom group: Approvals, Audit, Settings, Company */}
      {visibleBottom.length > 0 && (
        <div className="border-t border-dark-700 py-1">
          {visibleBottom.map(item => (
            <RightBtn
              key={item.key}
              item={item}
              isActive={activePage === item.key}
              isOn={false}
              badge={item.badge ? pendingCount : 0}
              onClick={() => handleClick(item)}
            />
          ))}
        </div>
      )}
    </aside>
  )
}
