import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import {
  AlertTriangle, ArrowRight, BarChart3, Building2, CheckCircle2,
  ChevronRight, CircleDollarSign, FileWarning, IndianRupee, Loader2,
  Search, SlidersHorizontal, TrendingDown, TrendingUp, Truck, X,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  buildProfitabilityReport,
  filterProfitabilityEntities,
  filterProfitabilityRows,
  groupProfitabilityTrend,
  PROFITABILITY_METRICS,
  rowNeedsAllocation,
} from '../../lib/profitability'

const RANGE_OPTIONS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last 12 months' },
  { value: 0, label: 'All recorded data' },
]

const METRIC_LABELS = {
  all: 'All evidence',
  revenue: 'Recognised revenue',
  cost: 'Operating cost',
  profit: 'Profit calculation',
  loss_making: 'Loss-making entities',
  needs_allocation: 'Needs allocation',
}

const SOURCE_LABELS = {
  invoice: 'Invoice',
  bill: 'Vendor bill',
  field_expense: 'Field expense',
  expense: 'Expense',
  job_card: 'Workshop job',
  maintenance: 'Maintenance',
  fuel: 'Fuel issue',
}

const money = value => {
  const amount = Number(value || 0)
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(1)}Cr`
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(1)}L`
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`
}

const moneyFull = value => `${Number(value || 0) < 0 ? '-' : ''}₹${Math.abs(Math.round(Number(value || 0))).toLocaleString('en-IN')}`
const displayDate = value => value ? format(new Date(`${String(value).slice(0, 10)}T12:00:00`), 'dd MMM yyyy') : '—'
const humanize = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())

function selectClass() {
  return 'rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-slate-300 focus:border-primary-500 focus:outline-none'
}

function KpiTile({ active, title, value, note, icon: Icon, tone, danger = false, onClick }) {
  const tones = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
    sky: 'text-sky-400 bg-sky-500/10',
    red: 'text-red-400 bg-red-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-0 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
        active ? 'border-primary-400 bg-primary-500/10 ring-1 ring-primary-400/40' : 'border-dark-600 bg-dark-800 hover:border-dark-500'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className={`mt-2 truncate text-2xl font-bold ${danger ? 'text-red-400' : 'text-slate-100'}`}>{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{note}</p>
        </div>
        <span className={`rounded-lg p-2 ${tones[tone] || tones.sky}`}><Icon className="h-5 w-5" /></span>
      </div>
    </button>
  )
}

function ProfitBar({ value }) {
  if (value == null) return <span className="text-sm text-slate-600">No revenue</span>
  const positive = value >= 0
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-dark-700">
        <div className={`h-full rounded-full ${positive ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.abs(value))}%` }} />
      </div>
    </div>
  )
}

function EntityTable({ dimension, entities, selectedId, onSelect }) {
  const icon = dimension === 'equipment' ? Truck : Building2
  const Icon = icon
  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        <p className="mt-3 text-sm font-semibold text-slate-300">No {dimension} matches this KPI</p>
        <p className="mt-1 text-sm text-slate-500">Clear the active tile or change the period.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b border-dark-600 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-3 font-semibold">{dimension === 'equipment' ? 'Equipment' : 'Project'}</th>
            <th className="px-3 py-3 text-right font-semibold">Revenue</th>
            <th className="px-3 py-3 text-right font-semibold">Cost</th>
            <th className="px-3 py-3 text-right font-semibold">Profit / Loss</th>
            <th className="px-3 py-3 font-semibold">Margin</th>
            <th className="px-3 py-3 text-right font-semibold">Evidence</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {entities.map(item => (
            <tr
              key={item.id}
              onClick={() => onSelect(item)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(item)
                }
              }}
              role="button"
              tabIndex={0}
              className={`cursor-pointer border-b border-dark-700/70 transition-colors last:border-0 hover:bg-dark-700/40 ${selectedId === item.id ? 'bg-primary-500/10' : ''}`}
            >
              <td className="px-3 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-dark-700 p-2 text-primary-400"><Icon className="h-4 w-4" /></span>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.code || humanize(item.status) || `${item.evidenceCount} records`}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3.5 text-right text-sm font-medium text-emerald-400">{moneyFull(item.revenue)}</td>
              <td className="px-3 py-3.5 text-right text-sm font-medium text-orange-400">{moneyFull(item.cost)}</td>
              <td className={`px-3 py-3.5 text-right text-sm font-bold ${item.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{moneyFull(item.profit)}</td>
              <td className="px-3 py-3.5"><ProfitBar value={item.marginPct} /></td>
              <td className="px-3 py-3.5 text-right">
                <span className="text-sm text-slate-300">{item.evidenceCount}</span>
                {item.gapCount > 0 && <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">{item.gapCount} gap</span>}
              </td>
              <td className="px-3 py-3.5"><ChevronRight className="h-4 w-4 text-slate-600" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EvidenceRows({ rows, dimension, limit = 60 }) {
  const visible = rows.slice(0, limit)
  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <FileWarning className="h-9 w-9 text-slate-700" />
        <p className="mt-3 text-sm font-semibold text-slate-300">No evidence matches these filters</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-dark-700/70">
      {visible.map(row => {
        const needsAllocation = rowNeedsAllocation(row, dimension)
        return (
          <div key={row.id} className="grid gap-3 px-1 py-3 md:grid-cols-[100px_1fr_150px_120px] md:items-center">
            <div>
              <p className="text-xs font-medium text-slate-400">{displayDate(row.entry_date)}</p>
              <p className="mt-1 text-xs text-slate-600">{SOURCE_LABELS[row.source_type] || humanize(row.source_type)}</p>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-200">{row.reference}</p>
                {row.project_inferred && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400">Project inferred</span>}
                {needsAllocation && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">Needs allocation</span>}
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{row.description}</p>
            </div>
            <div className="text-sm">
              <p className="truncate text-slate-300">{dimension === 'equipment' ? row.equipment_name || 'No equipment' : row.project_name || 'No project'}</p>
              <p className="mt-1 truncate text-xs text-slate-600">{humanize(row.category)}</p>
            </div>
            <p className={`text-right text-sm font-bold ${row.entry_type === 'revenue' ? 'text-emerald-400' : 'text-orange-400'}`}>
              {row.entry_type === 'revenue' ? '+' : '-'}{moneyFull(row.amount)}
            </p>
          </div>
        )
      })}
      {rows.length > limit && <p className="py-3 text-center text-xs text-slate-500">Showing {limit} of {rows.length} records. Refine the filters to narrow the evidence.</p>}
    </div>
  )
}

function EntityDrawer({ entity, dimension, rows, onClose, onNavigate }) {
  if (!entity) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-dark-600 bg-dark-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-dark-600 bg-dark-900/95 p-5 backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-400">{dimension} profitability 360</p>
            <h2 className="mt-1 text-xl font-bold text-slate-100">{entity.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{entity.code || `${entity.evidenceCount} linked records`}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-dark-700 hover:text-white" aria-label="Close profitability details"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Revenue', entity.revenue, 'text-emerald-400'],
              ['Cost', entity.cost, 'text-orange-400'],
              ['Profit / Loss', entity.profit, entity.profit >= 0 ? 'text-emerald-400' : 'text-red-400'],
              ['Margin', entity.marginPct == null ? '—' : `${entity.marginPct}%`, entity.marginPct >= 0 ? 'text-emerald-400' : 'text-red-400'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-dark-600 bg-dark-800 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`mt-2 text-lg font-bold ${tone}`}>{typeof value === 'number' ? moneyFull(value) : value}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate?.(dimension === 'equipment' ? 'fleet' : 'projects', dimension === 'equipment' ? { equipmentId: entity.id } : { projectId: entity.id })}
            className="btn-primary w-full justify-center py-2.5 text-sm"
          >
            Open {dimension === 'equipment' ? 'Equipment 360' : 'Project 360'} <ArrowRight className="h-4 w-4" />
          </button>
          <section className="rounded-xl border border-dark-600 bg-dark-800 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Revenue and cost evidence</h3>
              <span className="text-xs text-slate-500">{rows.length} records</span>
            </div>
            <EvidenceRows rows={rows} dimension={dimension} limit={100} />
          </section>
        </div>
      </aside>
    </div>
  )
}

export default function ProfitabilityPage({ onNavigate, initialDimension = 'project', initialMetric = 'all' }) {
  const { companyId } = useAuth()
  const [dimension, setDimension] = useState(initialDimension === 'equipment' ? 'equipment' : 'project')
  const [metric, setMetric] = useState(METRIC_LABELS[initialMetric] ? initialMetric : 'all')
  const [rangeDays, setRangeDays] = useState(365)
  const [entityId, setEntityId] = useState('all')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedEntity, setSelectedEntity] = useState(null)

  const today = format(new Date(), 'yyyy-MM-dd')
  const from = rangeDays > 0 ? format(subDays(new Date(), rangeDays - 1), 'yyyy-MM-dd') : '2000-01-01'

  useEffect(() => {
    setEntityId('all')
    setSelectedEntity(null)
  }, [dimension])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('page', 'profitability')
    if (dimension === 'project') url.searchParams.delete('profitDimension')
    else url.searchParams.set('profitDimension', dimension)
    if (metric === 'all') url.searchParams.delete('profitMetric')
    else url.searchParams.set('profitMetric', metric)
    window.history.replaceState(null, '', url)
  }, [dimension, metric])

  const { data, isLoading, error } = useQuery({
    queryKey: ['profitability_control_centre', companyId, from, today],
    queryFn: async () => {
      const [ledgerResult, projectsResult, equipmentResult] = await Promise.all([
        supabase.rpc('get_profitability_ledger', {
          p_company_id: companyId,
          p_from: from,
          p_to: today,
        }).range(0, 4999),
        supabase.from('projects')
          .select('id,project_name,project_code,status,is_active')
          .eq('company_id', companyId).order('project_name'),
        supabase.from('equipment')
          .select('id,name,equipment_number,registration_number,status,category')
          .eq('company_id', companyId).order('name'),
      ])
      if (ledgerResult.error) throw ledgerResult.error
      if (projectsResult.error) throw projectsResult.error
      if (equipmentResult.error) throw equipmentResult.error
      return {
        ledger: ledgerResult.data || [],
        projects: projectsResult.data || [],
        equipment: equipmentResult.data || [],
      }
    },
    enabled: !!companyId,
  })

  const ledger = data?.ledger || []
  const entities = dimension === 'equipment' ? data?.equipment || [] : data?.projects || []
  const report = useMemo(() => buildProfitabilityReport(ledger, entities, dimension), [ledger, entities, dimension])
  const lossEntityIds = useMemo(() => report.entities.filter(item => item.profit < 0).map(item => item.id), [report.entities])
  const filteredRows = useMemo(() => filterProfitabilityRows(ledger, {
    dimension, metric, entityId, category, search, lossEntityIds,
  }), [ledger, dimension, metric, entityId, category, search, lossEntityIds])
  const filteredEntities = useMemo(() => {
    const byMetric = filterProfitabilityEntities(report.entities, metric)
    if (entityId === 'all') return byMetric
    return byMetric.filter(item => item.id === entityId)
  }, [report.entities, metric, entityId])
  const selectedRows = useMemo(() => selectedEntity
    ? ledger.filter(row => row[dimension === 'equipment' ? 'equipment_id' : 'project_id'] === selectedEntity.id)
    : [], [ledger, selectedEntity, dimension])
  const trend = useMemo(() => groupProfitabilityTrend(filteredRows), [filteredRows])
  const categories = useMemo(() => [...new Set(ledger.map(row => row.category).filter(Boolean))].sort(), [ledger])
  const chartEntities = useMemo(() => [...filteredEntities]
    .sort((a, b) => (b.revenue + b.cost) - (a.revenue + a.cost))
    .slice(0, 8)
    .map(item => ({ name: item.code || item.name.slice(0, 18), revenue: item.revenue, cost: item.cost })), [filteredEntities])

  const chooseMetric = value => setMetric(current => current === value ? 'all' : value)
  const changeDimension = value => {
    setDimension(value)
    if (metric === 'loss_making') setMetric('all')
  }
  const summary = report.summary
  const marginLabel = summary.marginPct == null ? 'No recognised revenue' : `${summary.marginPct > 0 ? '+' : ''}${summary.marginPct}% margin`

  return (
    <div className="h-full overflow-y-auto bg-dark-900 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <section className="flex flex-col gap-4 rounded-2xl border border-dark-600 bg-dark-800/60 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-400">Commercial control</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-100">Equipment &amp; Project Profitability</h1>
            <p className="mt-1 text-sm text-slate-500">Recognised revenue minus tax-exclusive operating costs, backed by source evidence.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-dark-600 bg-dark-800 p-1">
              {[
                { value: 'project', label: 'Projects', Icon: Building2 },
                { value: 'equipment', label: 'Equipment', Icon: Truck },
              ].map(option => (
                <button key={option.value} onClick={() => changeDimension(option.value)} aria-pressed={dimension === option.value} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${dimension === option.value ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  <option.Icon className="h-4 w-4" /> {option.label}
                </button>
              ))}
            </div>
            <select value={rangeDays} onChange={event => setRangeDays(Number(event.target.value))} className={selectClass()} aria-label="Profitability period">
              {RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-700/50 bg-red-500/10 p-4 text-sm text-red-300">
            Profitability data could not load: {error.message}
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiTile active={metric === 'revenue'} onClick={() => chooseMetric('revenue')} title="Recognised Revenue" value={money(summary.revenue)} note={`${money(summary.cashCollected)} cash collected`} icon={TrendingUp} tone="emerald" />
          <KpiTile active={metric === 'cost'} onClick={() => chooseMetric('cost')} title="Operating Cost" value={money(summary.cost)} note={`${money(summary.allocatedCost)} linked to ${dimension}`} icon={CircleDollarSign} tone="orange" />
          <KpiTile active={metric === 'profit'} onClick={() => chooseMetric('profit')} title="Gross Profit / Loss" value={money(summary.profit)} note={marginLabel} icon={summary.profit >= 0 ? TrendingUp : TrendingDown} tone={summary.profit >= 0 ? 'sky' : 'red'} danger={summary.profit < 0} />
          <KpiTile active={metric === 'loss_making'} onClick={() => chooseMetric('loss_making')} title={`Loss-making ${dimension === 'equipment' ? 'Equipment' : 'Projects'}`} value={summary.lossMakingCount} note={`${report.entities.length} with financial evidence`} icon={TrendingDown} tone="red" />
          <KpiTile active={metric === 'needs_allocation'} onClick={() => chooseMetric('needs_allocation')} title="Needs Allocation" value={summary.needsAllocationCount} note={`${money(summary.needsAllocationAmount)} needs attention`} icon={AlertTriangle} tone="amber" />
        </section>

        <section className="rounded-xl border border-dark-600 bg-dark-800/60 p-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-300 xl:mr-1"><SlidersHorizontal className="h-4 w-4 text-primary-400" /> Filter evidence</div>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-600" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Invoice, vendor, project, machine or category…" className="w-full rounded-lg border border-dark-600 bg-dark-800 py-2 pl-10 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-primary-500 focus:outline-none" />
            </div>
            <select value={entityId} onChange={event => setEntityId(event.target.value)} className={selectClass()}>
              <option value="all">All {dimension === 'equipment' ? 'equipment' : 'projects'}</option>
              {report.entities.map(item => <option key={item.id} value={item.id}>{item.name}{item.code ? ` · ${item.code}` : ''}</option>)}
            </select>
            <select value={category} onChange={event => setCategory(event.target.value)} className={selectClass()}>
              <option value="all">All categories</option>
              {categories.map(item => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
            {(metric !== 'all' || entityId !== 'all' || category !== 'all' || search) && (
              <button onClick={() => { setMetric('all'); setEntityId('all'); setCategory('all'); setSearch('') }} className="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-sm font-semibold text-primary-300">Clear filters</button>
            )}
          </div>
        </section>

        {isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dark-600 bg-dark-800"><Loader2 className="h-8 w-8 animate-spin text-primary-400" /></div>
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-dark-600 bg-dark-800 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">Revenue vs cost</h2>
                    <p className="mt-1 text-xs text-slate-500">Top {dimension} in the active result</p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-primary-400" />
                </div>
                <div className="mt-3 h-64">
                  {chartEntities.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-slate-500">No allocated evidence for this view</div> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartEntities} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="#27344a" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={money} axisLine={false} tickLine={false} />
                        <Tooltip formatter={value => moneyFull(value)} contentStyle={{ background: '#172033', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                        <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="cost" name="Cost" fill="#f97316" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-dark-600 bg-dark-800 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">Monthly movement</h2>
                    <p className="mt-1 text-xs text-slate-500">The timeline follows the selected KPI and filters</p>
                  </div>
                  <IndianRupee className="h-5 w-5 text-primary-400" />
                </div>
                <div className="mt-3 h-64">
                  {trend.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-slate-500">No monthly evidence matches</div> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trend} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="#27344a" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={value => format(new Date(`${value}-01T12:00:00`), 'MMM yy')} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={money} axisLine={false} tickLine={false} />
                        <Tooltip formatter={value => moneyFull(value)} contentStyle={{ background: '#172033', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                        <Bar dataKey="revenue" name="Revenue" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="cost" name="Cost" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-dark-600 bg-dark-800">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-600 px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">{dimension === 'equipment' ? 'Equipment profitability' : 'Project profitability'}</h2>
                  <p className="mt-1 text-xs text-slate-500">{filteredEntities.length} results · select a row for its complete evidence trail</p>
                </div>
                {metric !== 'all' && <button onClick={() => setMetric('all')} className="rounded-lg bg-primary-500/10 px-3 py-1.5 text-sm font-semibold text-primary-300">Showing: {METRIC_LABELS[metric]} · Clear</button>}
              </div>
              <EntityTable dimension={dimension} entities={filteredEntities} selectedId={selectedEntity?.id} onSelect={setSelectedEntity} />
            </section>

            <section className="rounded-xl border border-dark-600 bg-dark-800 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">Source evidence</h2>
                  <p className="mt-1 text-xs text-slate-500">{filteredRows.length} exact records · {displayDate(from)} to {displayDate(today)}</p>
                </div>
                <p className="text-xs text-slate-500">Revenue and costs exclude GST</p>
              </div>
              <EvidenceRows rows={filteredRows} dimension={dimension} />
            </section>
          </>
        )}
      </div>

      <EntityDrawer entity={selectedEntity} dimension={dimension} rows={selectedRows} onClose={() => setSelectedEntity(null)} onNavigate={onNavigate} />
    </div>
  )
}
