import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, ArrowRight, Calendar, CheckCircle2,
  ChevronRight, Clock3, Database, FileClock, Filter, Fingerprint,
  LockKeyhole, RefreshCw, Search, ShieldCheck, Trash2, User,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/shared/Modal'
import { supabase } from '../../lib/supabase'
import { fmtDateTime } from '../../lib/utils'

const PAGE_SIZE = 50

const ACTION_CFG = {
  insert: { label: 'Created', tone: 'emerald' },
  created: { label: 'Created', tone: 'emerald' },
  update: { label: 'Updated', tone: 'violet' },
  updated: { label: 'Updated', tone: 'violet' },
  delete: { label: 'Deleted', tone: 'red' },
  deleted: { label: 'Deleted', tone: 'red' },
  submitted: { label: 'Submitted', tone: 'amber' },
  approved: { label: 'Approved', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'red' },
  paid: { label: 'Paid', tone: 'blue' },
  acknowledged: { label: 'Acknowledged', tone: 'sky' },
  recalled: { label: 'Recalled', tone: 'slate' },
  activated: { label: 'Activated', tone: 'emerald' },
  terminated: { label: 'Terminated', tone: 'red' },
  login: { label: 'Login', tone: 'slate' },
  logout: { label: 'Logout', tone: 'slate' },
}

const TONE_CLASSES = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  red: 'border-red-500/30 bg-red-500/10 text-red-400',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  slate: 'border-dark-600 bg-dark-700 text-slate-400',
}

const MODULE_LABELS = {
  administration: 'Administration',
  approvals: 'Approvals',
  clients: 'Clients',
  collaboration: 'Collaboration',
  crusher: 'Crusher',
  equipment: 'Equipment',
  equipment_health: 'Equipment Health',
  finance: 'Finance',
  hr: 'HR & Payroll',
  inventory: 'Inventory',
  operations: 'Operations',
  projects: 'Projects',
  purchases: 'Purchases & Vendors',
  sales: 'Sales & Billing',
  ra_billing: 'RA Billing',
  field_expense: 'Field Expense',
  hire_contract: 'Hire Contract',
  settings: 'Settings',
  auth: 'Authentication',
}

function titleCase(value = '') {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function safeJson(value) {
  if (!value) return 'No snapshot available'
  return JSON.stringify(value, (key, item) => {
    if (typeof item === 'string' && item.length > 1200) {
      return `${item.slice(0, 240)}… [${item.length.toLocaleString('en-IN')} characters retained in ledger]`
    }
    return item
  }, 2)
}

function localDateBoundary(value, endOfDay = false) {
  if (!value) return null
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).toISOString()
}

function ActionBadge({ action }) {
  const key = String(action || '').toLowerCase()
  const cfg = ACTION_CFG[key] || { label: titleCase(key || 'Event'), tone: 'slate' }
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONE_CLASSES[cfg.tone]}`}>{cfg.label}</span>
}

function ModuleBadge({ module }) {
  return <span className="inline-flex items-center rounded-full border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-[10px] font-semibold text-primary-300">{MODULE_LABELS[module] || titleCase(module || 'System')}</span>
}

function SummaryCard({ label, value, help, Icon, tone = 'primary' }) {
  const iconTone = {
    primary: 'bg-primary-500/10 text-primary-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    violet: 'bg-violet-500/10 text-violet-400',
    red: 'bg-red-500/10 text-red-400',
  }[tone]
  return (
    <div className="card flex min-w-0 items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0">
        <p className="text-xl font-black text-slate-100">{value}</p>
        <p className="truncate text-xs font-semibold text-slate-300">{label}</p>
        <p className="truncate text-[10px] text-slate-500">{help}</p>
      </div>
    </div>
  )
}

function IntegrityCard({ integrity, loading, error, onVerify }) {
  const valid = integrity?.valid === true
  const unavailable = Boolean(error)
  return (
    <div className={`rounded-xl border p-4 ${valid ? 'border-emerald-500/25 bg-emerald-500/10' : unavailable ? 'border-amber-500/25 bg-amber-500/10' : 'border-dark-700 bg-dark-800'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${valid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
          {valid ? <ShieldCheck className="h-5 w-5" /> : <Fingerprint className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-100">Ledger integrity</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${valid ? 'bg-emerald-500/15 text-emerald-400' : unavailable ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-400'}`}>
              {loading ? 'Checking' : valid ? 'Verified' : unavailable ? 'Pending migration' : 'Not verified'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {valid ? `${Number(integrity.total_events || 0).toLocaleString('en-IN')} events form an unbroken SHA-256 chain.` : unavailable ? 'The tamper-evident database migration has not been applied to this environment yet.' : 'Run verification to validate sequence and hash continuity.'}
          </p>
        </div>
        <button type="button" onClick={onVerify} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Verify chain
        </button>
      </div>
    </div>
  )
}

function ChangeTable({ log }) {
  const fields = log.changed_fields || []
  if (!fields.length) return <p className="text-xs text-slate-500">No column-level differences were recorded for this event.</p>
  return (
    <div className="overflow-hidden rounded-xl border border-dark-700">
      <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1fr)_24px_minmax(0,1fr)] gap-3 border-b border-dark-700 bg-dark-800 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <span>Field</span><span>Before</span><span /><span>After</span>
      </div>
      <div className="max-h-72 divide-y divide-dark-700 overflow-y-auto">
        {fields.map(field => (
          <div key={field} className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1fr)_24px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-xs">
            <span className="break-words font-semibold text-slate-300">{titleCase(field)}</span>
            <span className="break-all text-slate-500">{displayValue(log.old_data?.[field])}</span>
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-slate-600" />
            <span className="break-all text-slate-200">{displayValue(log.new_data?.[field])}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SnapshotBlock({ title, subtitle, value, tone = 'slate' }) {
  const toneClass = tone === 'red' ? 'border-red-500/20 bg-red-500/5' : tone === 'emerald' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-dark-700 bg-dark-900'
  return (
    <section className={`overflow-hidden rounded-xl border ${toneClass}`}>
      <div className="border-b border-dark-700 px-3 py-2.5">
        <p className="text-xs font-bold text-slate-200">{title}</p>
        {subtitle && <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>}
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all p-3 text-[11px] leading-relaxed text-slate-400">{safeJson(value)}</pre>
    </section>
  )
}

function AuditDetail({ log, companyId, integrityValid, onClose }) {
  const historyQuery = useQuery({
    queryKey: ['audit_record_history', companyId, log?.table_name, log?.record_pk],
    queryFn: async () => {
      if (!log?.table_name || !log?.record_pk) return []
      const { data, error } = await supabase.from('audit_logs').select('*').eq('company_id', companyId).eq('table_name', log.table_name).contains('record_pk', log.record_pk).order('event_no', { ascending: true }).limit(250)
      if (error) throw error
      return data || []
    },
    enabled: Boolean(log && companyId && log.table_name && log.record_pk),
  })

  if (!log) return null
  const history = historyQuery.data || []
  const firstEvent = history[0]
  const originalSnapshot = firstEvent?.new_data || firstEvent?.old_data || log.new_data || log.old_data
  const asOfSnapshot = String(log.action).toLowerCase() === 'delete' ? log.old_data : log.new_data

  return (
    <Modal title={`Audit event #${log.event_no || '—'}`} onClose={onClose} size="xl">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailFact label="Activity time" value={fmtDateTime(log.created_at)} />
          <DetailFact label="Actor" value={log.actor_name || 'System'} help={log.actor_role || log.source || 'system'} />
          <DetailFact label="Record" value={log.record_ref || titleCase(log.table_name || log.module)} help={log.table_name || 'Explicit event'} />
          <div className="rounded-xl border border-dark-700 bg-dark-800 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Integrity</p>
            <div className="mt-1 flex items-center gap-1.5"><CheckCircle2 className={`h-3.5 w-3.5 ${integrityValid ? 'text-emerald-400' : 'text-slate-500'}`} /><p className={`text-xs font-semibold ${integrityValid ? 'text-emerald-400' : 'text-slate-400'}`}>{integrityValid ? 'Hash chain verified' : 'Verification pending'}</p></div>
          </div>
        </div>

        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2"><ModuleBadge module={log.module} /><ActionBadge action={log.action} /><p className="text-sm text-slate-300">{log.description || 'Database activity'}</p></div>
          <ChangeTable log={log} />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <SnapshotBlock title="Original record" subtitle={firstEvent ? `First captured on ${fmtDateTime(firstEvent.created_at)}` : 'Earliest retained state'} value={originalSnapshot} tone="emerald" />
          <SnapshotBlock title="Record at this activity date" subtitle={`State as of ${fmtDateTime(log.created_at)}`} value={asOfSnapshot} tone={String(log.action).toLowerCase() === 'delete' ? 'red' : 'slate'} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2"><SnapshotBlock title="Before this activity" value={log.old_data} /><SnapshotBlock title="After this activity" value={log.new_data} /></div>

        <section className="rounded-xl border border-dark-700 bg-dark-800 p-3">
          <div className="flex items-center gap-2"><FileClock className="h-4 w-4 text-primary-400" /><p className="text-xs font-bold text-slate-200">Record history</p><span className="ml-auto text-[10px] text-slate-500">{history.length} retained event{history.length === 1 ? '' : 's'}</span></div>
          {historyQuery.isLoading ? <p className="mt-3 text-xs text-slate-500">Loading history…</p> : history.length ? (
            <div className="mt-3 flex flex-wrap gap-2">{history.map(item => <span key={item.id} className={`rounded-lg border px-2 py-1 text-[10px] ${item.id === log.id ? 'border-primary-500/40 bg-primary-500/10 text-primary-300' : 'border-dark-600 text-slate-500'}`}>#{item.event_no} · {titleCase(item.action)} · {fmtDateTime(item.created_at)}</span>)}</div>
          ) : <p className="mt-3 text-xs text-slate-500">No linked record history is available for this explicit event.</p>}
        </section>

        <div className="rounded-xl border border-dark-700 bg-dark-900 p-3 font-mono text-[10px] text-slate-500">
          <p>Event hash: <span className="break-all text-slate-400">{log.event_hash || 'Available after database migration'}</span></p>
          <p className="mt-1">Previous hash: <span className="break-all text-slate-400">{log.previous_hash || '—'}</span></p>
          <p className="mt-1">Transaction: <span className="text-slate-400">{log.transaction_id || '—'}</span></p>
        </div>
      </div>
    </Modal>
  )
}

function DetailFact({ label, value, help }) {
  return <div className="rounded-xl border border-dark-700 bg-dark-800 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-xs font-semibold text-slate-200">{value}</p>{help && <p className="truncate text-[10px] uppercase text-slate-500">{help}</p>}</div>
}

function AuditRow({ log, onOpen }) {
  const actionKey = String(log.action || '').toLowerCase()
  const isDeletion = actionKey === 'delete' || actionKey === 'deleted'
  const changeCount = log.changed_fields?.length || 0
  return (
    <button type="button" onClick={() => onOpen(log)} className="group grid w-full grid-cols-[44px_minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-dark-700/40">
      <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${isDeletion ? 'bg-red-500/10 text-red-400' : 'bg-primary-500/10 text-primary-400'}`}>{isDeletion ? <Trash2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5"><ModuleBadge module={log.module} /><ActionBadge action={log.action} />{log.record_ref && <span className="truncate font-mono text-xs font-semibold text-slate-300">{log.record_ref}</span>}</div>
        <p className="mt-1.5 truncate text-sm text-slate-300">{log.description || `${titleCase(log.action)} ${titleCase(log.table_name)}`}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{log.actor_name || 'System'}</span><span className="inline-flex items-center gap-1"><Database className="h-3 w-3" />{log.table_name || 'Explicit event'}</span>{changeCount > 0 && <span>{changeCount} field{changeCount === 1 ? '' : 's'} captured</span>}</div>
      </div>
      <div className="flex items-center gap-2 pl-2"><div className="hidden text-right sm:block"><p className="whitespace-nowrap text-[11px] text-slate-400">{fmtDateTime(log.created_at)}</p><p className="mt-0.5 text-[10px] text-slate-600">Event #{log.event_no || '—'}</p></div><ChevronRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-400" /></div>
    </button>
  )
}

export default function AuditLogPage() {
  const { companyId, role } = useAuth()
  const [moduleFilter, setModuleFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedLog, setSelectedLog] = useState(null)
  const isAdmin = role === 'admin' || role === 'superadmin'

  const logsQuery = useQuery({
    queryKey: ['audit_logs', companyId, moduleFilter, actionFilter, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from('audit_logs').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1000)
      if (moduleFilter !== 'all') query = query.eq('module', moduleFilter)
      if (actionFilter !== 'all') query = query.eq('action', actionFilter)
      if (dateFrom) query = query.gte('created_at', localDateBoundary(dateFrom))
      if (dateTo) query = query.lte('created_at', localDateBoundary(dateTo, true))
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
    enabled: Boolean(companyId && isAdmin),
  })

  const integrityQuery = useQuery({
    queryKey: ['audit_integrity', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('verify_audit_chain', { p_company_id: companyId })
      if (error) throw error
      return data
    },
    enabled: Boolean(companyId && isAdmin),
    retry: false,
  })

  const logs = logsQuery.data || []
  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return logs
    return logs.filter(log => [log.actor_name, log.actor_role, log.record_ref, log.description, log.module, log.action, log.table_name].some(value => String(value || '').toLowerCase().includes(needle)))
  }, [logs, search])

  const moduleOptions = useMemo(() => {
    const keys = new Set([...Object.keys(MODULE_LABELS), ...logs.map(log => log.module).filter(Boolean)])
    return [...keys].sort((a, b) => (MODULE_LABELS[a] || a).localeCompare(MODULE_LABELS[b] || b))
  }, [logs])
  const summary = useMemo(() => ({
    total: filteredLogs.length,
    updates: filteredLogs.filter(log => ['update', 'updated'].includes(String(log.action).toLowerCase())).length,
    deletions: filteredLogs.filter(log => ['delete', 'deleted'].includes(String(log.action).toLowerCase())).length,
  }), [filteredLogs])

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRecords = filteredLogs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const activeFilterCount = [moduleFilter !== 'all', actionFilter !== 'all', Boolean(search), Boolean(dateFrom), Boolean(dateTo)].filter(Boolean).length
  const clearFilters = () => { setModuleFilter('all'); setActionFilter('all'); setSearch(''); setDateFrom(''); setDateTo(''); setPage(0) }

  if (!isAdmin) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"><LockKeyhole className="h-12 w-12 text-slate-600" /><p className="text-base font-semibold text-slate-300">Administrator access required</p><p className="max-w-md text-sm text-slate-500">Audit evidence contains historical business data and is restricted to company administrators.</p></div>
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10"><ShieldCheck className="h-5 w-5 text-emerald-400" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Governance & Evidence</p><h1 className="text-xl font-black text-slate-100">Audit Log</h1></div></div>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">Every business-data change is recorded with its actor, exact time, original value, resulting value, and deletion snapshot.</p>
          </div>
          <button type="button" onClick={() => { logsQuery.refetch(); integrityQuery.refetch() }} className="btn-secondary"><RefreshCw className={`h-4 w-4 ${logsQuery.isFetching || integrityQuery.isFetching ? 'animate-spin' : ''}`} />Refresh evidence</button>
        </header>

        <IntegrityCard integrity={integrityQuery.data} loading={integrityQuery.isFetching} error={integrityQuery.error} onVerify={() => integrityQuery.refetch()} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Visible events" value={summary.total.toLocaleString('en-IN')} help="Current search and filters" Icon={Activity} />
          <SummaryCard label="Alterations" value={summary.updates.toLocaleString('en-IN')} help="Before and after retained" Icon={FileClock} tone="violet" />
          <SummaryCard label="Deletions" value={summary.deletions.toLocaleString('en-IN')} help="Original snapshot retained" Icon={Trash2} tone="red" />
          <SummaryCard label="Chain status" value={integrityQuery.data?.valid ? 'Verified' : 'Pending'} help="SHA-256 continuity check" Icon={Fingerprint} tone={integrityQuery.data?.valid ? 'emerald' : 'primary'} />
        </div>

        <section className="space-y-2">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} placeholder="Search person, record, activity, or database table…" className="input w-full pl-9" /></div>
            <button type="button" onClick={() => setShowFilters(value => !value)} className={`btn-secondary ${showFilters ? 'border-primary-500/40 text-primary-300' : ''}`}><Filter className="h-4 w-4" />Filters{activeFilterCount > 0 && <span className="rounded-full bg-primary-500/20 px-1.5 py-0.5 text-[10px] font-bold text-primary-300">{activeFilterCount}</span>}</button>
          </div>
          {showFilters && (
            <div className="grid gap-3 rounded-xl border border-dark-700 bg-dark-800 p-3 sm:grid-cols-2 lg:grid-cols-5">
              <FilterSelect label="Module" value={moduleFilter} onChange={value => { setModuleFilter(value); setPage(0) }}><option value="all">All modules</option>{moduleOptions.map(module => <option key={module} value={module}>{MODULE_LABELS[module] || titleCase(module)}</option>)}</FilterSelect>
              <FilterSelect label="Activity" value={actionFilter} onChange={value => { setActionFilter(value); setPage(0) }}><option value="all">All activity</option><option value="insert">Created</option><option value="update">Updated</option><option value="delete">Deleted</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="paid">Paid</option></FilterSelect>
              <FilterDate label="From date" value={dateFrom} onChange={value => { setDateFrom(value); setPage(0) }} />
              <FilterDate label="To date" value={dateTo} onChange={value => { setDateTo(value); setPage(0) }} />
              <div className="flex items-end"><button type="button" onClick={clearFilters} disabled={activeFilterCount === 0} className="btn-ghost w-full text-xs text-red-400 disabled:opacity-40">Clear filters</button></div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-dark-700 bg-dark-800">
          <div className="flex flex-wrap items-center gap-2 border-b border-dark-700 px-4 py-3"><Clock3 className="h-4 w-4 text-primary-400" /><h2 className="text-sm font-bold text-slate-200">Activity timeline</h2><span className="text-xs text-slate-500">Newest first</span><span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-500"><Calendar className="h-3 w-3" />Times shown in your local timezone</span></div>
          {logsQuery.isLoading ? <div className="flex items-center justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-primary-400" /></div> : logsQuery.error ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center"><AlertTriangle className="h-8 w-8 text-amber-400" /><p className="text-sm font-semibold text-slate-300">Audit evidence could not be loaded</p><p className="max-w-lg text-xs text-slate-500">{logsQuery.error.message}</p><button type="button" onClick={() => logsQuery.refetch()} className="btn-secondary mt-2 text-xs">Try again</button></div>
          ) : pageRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center"><Database className="h-8 w-8 text-slate-600" /><p className="text-sm font-semibold text-slate-300">{activeFilterCount ? 'No evidence matches these filters' : 'No audit events have been recorded yet'}</p><p className="max-w-lg text-xs text-slate-500">{activeFilterCount ? 'Clear one or more filters to broaden the timeline.' : 'Events will appear automatically after the database audit migration is activated.'}</p>{activeFilterCount > 0 && <button type="button" onClick={clearFilters} className="btn-ghost mt-2 text-xs text-primary-400">Clear filters</button>}</div>
          ) : <div className="divide-y divide-dark-700">{pageRecords.map(log => <AuditRow key={log.id} log={log} onOpen={setSelectedLog} />)}</div>}
        </section>

        {filteredLogs.length > PAGE_SIZE && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length}</p><div className="flex gap-2"><button type="button" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={safePage === 0} className="btn-secondary text-xs disabled:opacity-40">Previous</button><button type="button" onClick={() => setPage(value => Math.min(totalPages - 1, value + 1))} disabled={safePage >= totalPages - 1} className="btn-secondary text-xs disabled:opacity-40">Next</button></div></div>}

        <div className="flex items-start gap-2 rounded-xl border border-dark-700 bg-dark-800 px-4 py-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><p className="text-xs leading-relaxed text-slate-400"><span className="font-semibold text-emerald-400">Append-only evidence.</span> Application users cannot edit, delete, insert directly into, or truncate this ledger. A database owner can administer database objects, so SHA-256 chain verification is used to expose any later modification.</p></div>
      </div>

      {selectedLog && <AuditDetail log={selectedLog} companyId={companyId} integrityValid={integrityQuery.data?.valid === true} onClose={() => setSelectedLog(null)} />}
    </div>
  )
}

function FilterSelect({ label, value, onChange, children }) {
  return <label className="space-y-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="input w-full text-sm">{children}</select></label>
}

function FilterDate({ label, value, onChange }) {
  return <label className="space-y-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span><input type="date" value={value} onChange={event => onChange(event.target.value)} className="input w-full text-sm" /></label>
}
