/**
 * AuditLogPage.jsx
 *
 * Admin-only immutable audit trail viewer.
 * All records are read-only — no edit, delete, or export controls that modify data.
 *
 * Features:
 *  • Timeline table: timestamp | module | action | record | description | actor
 *  • Filter by module and date range
 *  • Text search across actor name and record ref
 *  • Load-more pagination (50 per page)
 *  • Immutability notice
 *  • Color-coded action and module badges
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield, Search, Filter, ChevronDown,
  RefreshCw, AlertTriangle, Lock,
  CheckCircle, XCircle, Clock, CreditCard,
  Trash2, FileText, Send, RotateCcw, CheckCheck,
  User, Calendar, Activity,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fmtDateTime } from '../../lib/utils'

// ── Action display config ─────────────────────────────────────────────────────
const ACTION_CFG = {
  created:      { label: 'Created',      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-600/40', Icon: FileText    },
  updated:      { label: 'Updated',      cls: 'bg-violet-500/15  text-violet-400  border-violet-600/40',  Icon: FileText    },
  submitted:    { label: 'Submitted',    cls: 'bg-amber-500/15   text-amber-400   border-amber-600/40',   Icon: Send        },
  approved:     { label: 'Approved',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-600/40', Icon: CheckCircle },
  rejected:     { label: 'Rejected',     cls: 'bg-red-500/15     text-red-400     border-red-600/40',     Icon: XCircle     },
  paid:         { label: 'Paid',         cls: 'bg-blue-500/15    text-blue-400    border-blue-600/40',    Icon: CreditCard  },
  deleted:      { label: 'Deleted',      cls: 'bg-red-600/15     text-red-500     border-red-700/40',     Icon: Trash2      },
  acknowledged: { label: 'Acknowledged', cls: 'bg-sky-500/15     text-sky-400     border-sky-600/40',     Icon: CheckCheck  },
  recalled:     { label: 'Recalled',     cls: 'bg-slate-500/15   text-slate-400   border-slate-600/40',   Icon: RotateCcw   },
  activated:    { label: 'Activated',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-600/40', Icon: CheckCircle },
  terminated:   { label: 'Terminated',  cls: 'bg-red-500/15     text-red-400     border-red-600/40',     Icon: XCircle     },
  login:        { label: 'Login',        cls: 'bg-slate-500/15   text-slate-400   border-slate-600/40',   Icon: User        },
  logout:       { label: 'Logout',       cls: 'bg-slate-500/15   text-slate-400   border-slate-600/40',   Icon: User        },
}

// ── Module display config ─────────────────────────────────────────────────────
const MODULE_CFG = {
  ra_billing:    { label: 'RA Billing',     cls: 'bg-blue-500/10    text-blue-400    border-blue-600/30'    },
  approvals:     { label: 'Approvals',      cls: 'bg-amber-500/10   text-amber-400   border-amber-600/30'   },
  hire_contract: { label: 'Hire Contract',  cls: 'bg-purple-500/10  text-purple-400  border-purple-600/30'  },
  purchase:      { label: 'Purchase',       cls: 'bg-orange-500/10  text-orange-400  border-orange-600/30'  },
  field_expense: { label: 'Field Expense',  cls: 'bg-yellow-500/10  text-yellow-400  border-yellow-600/30'  },
  boq:           { label: 'BOQ',            cls: 'bg-teal-500/10    text-teal-400    border-teal-600/30'    },
  inventory:     { label: 'Inventory',      cls: 'bg-indigo-500/10  text-indigo-400  border-indigo-600/30'  },
  settings:      { label: 'Settings',       cls: 'bg-slate-500/10   text-slate-400   border-slate-600/30'   },
  auth:          { label: 'Auth',           cls: 'bg-slate-500/10   text-slate-400   border-slate-600/30'   },
}

const ALL_MODULES = Object.entries(MODULE_CFG).map(([k, v]) => ({ key: k, label: v.label }))
const PAGE_SIZE   = 50

// ── Badges ────────────────────────────────────────────────────────────────────
function ActionBadge({ action }) {
  const cfg = ACTION_CFG[action] || { label: action, cls: 'bg-slate-500/15 text-slate-400 border-slate-600/40', Icon: Activity }
  const { Icon } = cfg
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  )
}

function ModuleBadge({ module }) {
  const cfg = MODULE_CFG[module] || { label: module, cls: 'bg-slate-500/10 text-slate-400 border-slate-600/30' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function RolePill({ role }) {
  if (!role) return null
  const cls = role === 'admin' ? 'text-red-400' : role === 'manager' ? 'text-amber-400' : role === 'accounts' ? 'text-blue-400' : 'text-slate-400'
  return <span className={`text-[10px] font-semibold uppercase ${cls}`}>{role}</span>
}

// ── Log row ───────────────────────────────────────────────────────────────────
function LogRow({ log, isLast }) {
  return (
    <div className={`flex gap-4 py-3 ${!isLast ? 'border-b border-dark-700' : ''}`}>
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1 flex-shrink-0 w-6">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ACTION_CFG[log.action]?.cls?.includes('emerald') ? 'bg-emerald-500' : ACTION_CFG[log.action]?.cls?.includes('red') ? 'bg-red-500' : ACTION_CFG[log.action]?.cls?.includes('amber') ? 'bg-amber-500' : ACTION_CFG[log.action]?.cls?.includes('blue') ? 'bg-blue-500' : 'bg-slate-500'}`} />
        {!isLast && <div className="w-px flex-1 bg-dark-700 mt-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Top row: badges + timestamp */}
        <div className="flex flex-wrap items-center gap-1.5">
          <ModuleBadge module={log.module} />
          <ActionBadge action={log.action} />
          {log.record_ref && (
            <span className="text-xs font-mono font-semibold" style={{ color: 'rgb(var(--t2))' }}>
              {log.record_ref}
            </span>
          )}
          <span className="ml-auto text-[10px] flex-shrink-0" style={{ color: 'rgb(var(--t3))' }}>
            {fmtDateTime(log.created_at)}
          </span>
        </div>

        {/* Description */}
        {log.description && (
          <p className="text-sm leading-snug" style={{ color: 'rgb(var(--t2))' }}>
            {log.description}
          </p>
        )}

        {/* Actor */}
        <div className="flex items-center gap-1.5">
          <User className="w-3 h-3 flex-shrink-0" style={{ color: 'rgb(var(--t3))' }} />
          <span className="text-xs" style={{ color: 'rgb(var(--t3))' }}>
            {log.actor_name || 'System'}
          </span>
          {log.actor_role && <RolePill role={log.actor_role} />}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const { companyId, role } = useAuth()

  const [moduleFilter, setModuleFilter] = useState('all')
  const [search,       setSearch]       = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [page,         setPage]         = useState(0)
  const [showFilters,  setShowFilters]  = useState(false)

  // Admin guard
  if (role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <Lock className="w-12 h-12 text-slate-600" />
        <p className="text-base font-semibold text-slate-300">Admin access required</p>
        <p className="text-sm text-slate-500">The audit log is restricted to company administrators.</p>
      </div>
    )
  }

  const { data: logs = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['audit_logs', companyId, moduleFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500)  // load up to 500, we filter client-side for search

      if (moduleFilter !== 'all') q = q.eq('module', moduleFilter)
      if (dateFrom)               q = q.gte('created_at', dateFrom + 'T00:00:00')
      if (dateTo)                 q = q.lte('created_at', dateTo   + 'T23:59:59')

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  // Client-side search (actor name + record ref + description)
  const filtered = useMemo(() => {
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter(l =>
      (l.actor_name  || '').toLowerCase().includes(q) ||
      (l.record_ref  || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q) ||
      (l.module      || '').toLowerCase().includes(q) ||
      (l.action      || '').toLowerCase().includes(q)
    )
  }, [logs, search])

  // Pagination
  const totalPages   = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRecords  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const hasMore      = filtered.length > (page + 1) * PAGE_SIZE

  const clearFilters = () => {
    setModuleFilter('all')
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setPage(0)
  }

  const activeFilterCount = [
    moduleFilter !== 'all',
    !!search,
    !!dateFrom,
    !!dateTo,
  ].filter(Boolean).length

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-600/30 flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold" style={{ color: 'rgb(var(--t1))' }}>Audit Log</h2>
            </div>
            <p className="text-sm mt-1" style={{ color: 'rgb(var(--t3))' }}>
              Immutable record of all system actions — {filtered.length} entries{search || moduleFilter !== 'all' || dateFrom || dateTo ? ' (filtered)' : ''}
            </p>
          </div>
          <button
            onClick={() => { setPage(0); refetch() }}
            title="Refresh"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-dark-700 transition-colors flex-shrink-0"
            style={{ color: 'rgb(var(--t3))' }}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Immutability notice */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-600/25">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'rgb(var(--t2))' }}>
            <span className="font-semibold text-amber-400">Immutable audit trail.</span>{' '}
            All entries are append-only. No record can be edited or deleted — this is enforced at the database level.
          </p>
        </div>

        {/* Search + Filter bar */}
        <div className="space-y-2">
          <div className="flex gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder="Search actor, record, description…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-sm focus:outline-none focus:border-primary-500"
                style={{ color: 'rgb(var(--t1))' }}
              />
            </div>
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showFilters ? 'bg-primary-600 text-white border-primary-500' : 'border-dark-600 hover:border-dark-500'}`}
              style={!showFilters ? { color: 'rgb(var(--t2))' } : undefined}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${showFilters ? 'bg-white/25 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 p-3 rounded-xl bg-dark-800 border border-dark-700">
              {/* Module filter */}
              <div className="flex flex-col gap-1 min-w-[160px]">
                <label className="text-xs text-slate-500">Module</label>
                <select
                  value={moduleFilter}
                  onChange={e => { setModuleFilter(e.target.value); setPage(0) }}
                  className="px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-sm focus:outline-none focus:border-primary-500"
                  style={{ color: 'rgb(var(--t1))' }}
                >
                  <option value="all">All modules</option>
                  {ALL_MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
              {/* Date from */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">From date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(0) }}
                  className="px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-sm focus:outline-none focus:border-primary-500"
                  style={{ color: 'rgb(var(--t1))' }}
                />
              </div>
              {/* Date to */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">To date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(0) }}
                  className="px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-sm focus:outline-none focus:border-primary-500"
                  style={{ color: 'rgb(var(--t1))' }}
                />
              </div>
              {/* Clear */}
              {activeFilterCount > 0 && (
                <div className="flex flex-col justify-end">
                  <button
                    onClick={clearFilters}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-600/30 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Log entries */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl px-4">
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && pageRecords.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Activity className="w-8 h-8 text-slate-600" />
              <p className="text-sm text-slate-500">
                {search || activeFilterCount > 0 ? 'No entries match your filters.' : 'No audit log entries yet.'}
              </p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-primary-400 hover:underline">Clear filters</button>
              )}
            </div>
          )}

          {!isLoading && pageRecords.length > 0 && (
            <div className="divide-y divide-dark-700">
              {pageRecords.map((log, i) => (
                <LogRow key={log.id} log={log} isLast={i === pageRecords.length - 1} />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'rgb(var(--t3))' }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg border border-dark-600 text-xs font-medium disabled:opacity-40 hover:border-dark-500 transition-colors"
                style={{ color: 'rgb(var(--t2))' }}
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={!hasMore}
                className="px-3 py-1.5 rounded-lg border border-dark-600 text-xs font-medium disabled:opacity-40 hover:border-dark-500 transition-colors"
                style={{ color: 'rgb(var(--t2))' }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-xs pb-2" style={{ color: 'rgb(var(--t3))' }}>
          🔒 Audit records are cryptographically protected at the database level and cannot be altered.
        </p>

      </div>
    </div>
  )
}
