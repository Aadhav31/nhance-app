import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import {
  AlertTriangle, ArrowRight, BarChart3, CheckCircle2, CircleDollarSign,
  DatabaseZap, Droplets, Fuel, Gauge, Loader2, Search, SlidersHorizontal,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  buildFuelReconciliation,
  filterFuelReconciliationRows,
  groupFuelRowsByDate,
} from '../../lib/fuelReconciliation'

const RANGE_OPTIONS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last 12 months' },
]

const METRIC_LABELS = {
  all: 'All reconciliation rows',
  supply: 'Fuel supplied',
  unaccounted: 'Unaccounted variance',
  over_standard: 'Above consumption standard',
  cost_impact: 'Financial exposure',
  data_gaps: 'Data-quality gaps',
}

const FLAG_LABELS = {
  missing_consumption_log: 'Consumption log missing',
  missing_benchmark: 'Fuel benchmark missing',
  duplicate_entry: 'Possible duplicate',
  missing_meter: 'Meter missing',
  missing_rate: 'Rate missing',
  issue_fill_mismatch: 'Issue/fill mismatch',
  unaccounted: 'Unaccounted fuel',
  over_standard: 'Above standard',
  over_reported: 'Consumption exceeds supply',
}

const litres = value => `${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`
const money = value => `₹${Math.round(Number(value || 0)).toLocaleString('en-IN')}`
const displayDate = value => format(new Date(`${value}T12:00:00`), 'dd MMM yyyy')

function selectClass() {
  return 'bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-primary-500'
}

function KpiTile({ active, title, value, note, icon: Icon, tone, onClick }) {
  const tones = {
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    red: 'text-red-400 bg-red-500/10 border-red-500/30',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-0 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
        active ? 'border-primary-400 ring-1 ring-primary-400/50 bg-primary-500/10' : 'border-dark-600 bg-dark-800 hover:border-dark-500'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-1 text-xl font-bold text-slate-100 truncate">{value}</p>
        </div>
        <span className={`rounded-lg border p-2 ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{note}</p>
    </button>
  )
}

function StatusBadge({ row }) {
  if (row.flags.includes('unaccounted') || row.flags.includes('over_standard')) {
    return <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300">Action required</span>
  }
  if (row.dataGap) {
    return <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300">Data gap</span>
  }
  if (row.reconciled) {
    return <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">Reconciled</span>
  }
  return <span className="rounded-full border border-dark-500 bg-dark-700 px-2 py-1 text-[10px] font-semibold text-slate-400">No comparison</span>
}

function EvidenceCard({ row }) {
  const variance = row.balanceVariance
  const varianceClass = variance == null ? 'text-slate-500' : variance > 5 ? 'text-red-400' : variance < -5 ? 'text-amber-400' : 'text-emerald-400'
  return (
    <div className="rounded-xl border border-dark-600 bg-dark-800 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-100">{row.equipment.name}</p>
            {row.equipment.equipment_number && <span className="font-mono text-[10px] text-primary-400">{row.equipment.equipment_number}</span>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{row.projectName} · {displayDate(row.date)}</p>
        </div>
        <StatusBadge row={row} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Supplied', litres(row.suppliedLitres), 'text-sky-400'],
          ['Consumed', row.consumedLitres > 0 ? litres(row.consumedLitres) : 'No log', row.consumedLitres > 0 ? 'text-slate-200' : 'text-amber-400'],
          ['Expected', row.expectedLitres == null ? 'Not available' : litres(row.expectedLitres), 'text-slate-300'],
          ['Efficiency', row.actualRate == null ? '—' : `${row.actualRate} L/hr`, 'text-cyan-400'],
          ['Balance variance', variance == null ? 'Pending' : `${variance > 0 ? '+' : ''}${litres(variance)}`, varianceClass],
          ['Cost impact', row.costImpact > 0 ? money(row.costImpact) : '—', row.costImpact > 0 ? 'text-violet-400' : 'text-slate-500'],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-lg bg-dark-700/70 p-2">
            <p className="text-[9px] uppercase tracking-wider text-slate-600">{label}</p>
            <p className={`mt-0.5 text-xs font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {row.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.flags.map(flag => (
            <span key={flag} className={`rounded px-1.5 py-0.5 text-[10px] ${
              ['unaccounted', 'over_standard'].includes(flag)
                ? 'bg-red-500/10 text-red-300'
                : 'bg-amber-500/10 text-amber-300'
            }`}>{FLAG_LABELS[flag] || flag}</span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-600">
        Evidence: {row.issues.length} issue record{row.issues.length === 1 ? '' : 's'} · {row.fills.length} fill record{row.fills.length === 1 ? '' : 's'} · {row.operations.length} approved operations log{row.operations.length === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export default function FuelReconciliationPage({
  onNavigate,
  initialRangeDays = 90,
  initialMetric = 'all',
  initialEquipmentId = 'all',
  initialProjectId = 'all',
}) {
  const { companyId } = useAuth()
  const [rangeDays, setRangeDays] = useState(() => RANGE_OPTIONS.some(option => option.value === Number(initialRangeDays)) ? Number(initialRangeDays) : 90)
  const [metric, setMetric] = useState(() => METRIC_LABELS[initialMetric] ? initialMetric : 'all')
  const [equipmentId, setEquipmentId] = useState(initialEquipmentId || 'all')
  const [projectId, setProjectId] = useState(initialProjectId || 'all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const nextRange = Number(initialRangeDays)
    setRangeDays(RANGE_OPTIONS.some(option => option.value === nextRange) ? nextRange : 90)
  }, [initialRangeDays])

  useEffect(() => {
    setMetric(METRIC_LABELS[initialMetric] ? initialMetric : 'all')
  }, [initialMetric])

  useEffect(() => {
    setEquipmentId(initialEquipmentId || 'all')
  }, [initialEquipmentId])

  useEffect(() => {
    setProjectId(initialProjectId || 'all')
  }, [initialProjectId])

  const endDate = format(new Date(), 'yyyy-MM-dd')
  const startDate = format(subDays(new Date(), rangeDays - 1), 'yyyy-MM-dd')

  const equipmentQuery = useQuery({
    queryKey: ['fuel_reconciliation_equipment', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment')
        .select('id,name,equipment_number,registration_number,category,meter_type,specific_consumption_lph,current_project_id,current_site_name,status')
        .eq('company_id', companyId).order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })
  const projectsQuery = useQuery({
    queryKey: ['fuel_reconciliation_projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects')
        .select('id,project_name,project_code,site_name,hsd_rate_per_liter')
        .eq('company_id', companyId).order('project_name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })
  const issuesQuery = useQuery({
    queryKey: ['fuel_reconciliation_issues', companyId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('fuel_issues').select('*')
        .eq('company_id', companyId).gte('issue_date', startDate).lte('issue_date', endDate)
        .order('issue_date', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })
  const fillsQuery = useQuery({
    queryKey: ['fuel_reconciliation_fills', companyId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('shift_fuel_entries').select('*')
        .eq('company_id', companyId)
        .gte('entry_time', `${startDate}T00:00:00`).lte('entry_time', `${endDate}T23:59:59`)
        .order('entry_time', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })
  const operationsQuery = useQuery({
    queryKey: ['fuel_reconciliation_operations', companyId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('daily_operations')
        .select('id,equipment_id,project_id,ops_date,status,running_hours,fuel_consumed,workflow_status,shift_type,operator_name')
        .eq('company_id', companyId).gte('ops_date', startDate).lte('ops_date', endDate)
        .order('ops_date', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })
  const deploymentsQuery = useQuery({
    queryKey: ['fuel_reconciliation_deployments', companyId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment_deployments')
        .select('id,equipment_id,project_id,deployed_date,withdrawn_date,status')
        .eq('company_id', companyId).lte('deployed_date', endDate)
        .or(`withdrawn_date.is.null,withdrawn_date.gte.${startDate}`)
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })
  const replenishmentsQuery = useQuery({
    queryKey: ['fuel_reconciliation_rates', companyId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('fuel_tank_replenishments')
        .select('id,replenish_date,quantity_liters,rate_per_liter,total_amount')
        .eq('company_id', companyId).gte('replenish_date', startDate).lte('replenish_date', endDate)
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const queries = [equipmentQuery, projectsQuery, issuesQuery, fillsQuery, operationsQuery, deploymentsQuery, replenishmentsQuery]
  const isLoading = queries.some(query => query.isLoading)
  const error = queries.find(query => query.error)?.error

  const report = useMemo(() => buildFuelReconciliation({
    equipment: equipmentQuery.data || [],
    projects: projectsQuery.data || [],
    issues: issuesQuery.data || [],
    fills: fillsQuery.data || [],
    operations: operationsQuery.data || [],
    deployments: deploymentsQuery.data || [],
    replenishments: replenishmentsQuery.data || [],
  }), [equipmentQuery.data, projectsQuery.data, issuesQuery.data, fillsQuery.data, operationsQuery.data, deploymentsQuery.data, replenishmentsQuery.data])

  const filteredRows = useMemo(() => filterFuelReconciliationRows(report.rows, {
    metric, equipmentId, projectId, search,
  }), [report.rows, metric, equipmentId, projectId, search])
  const chartData = useMemo(() => groupFuelRowsByDate(filteredRows).slice(-30), [filteredRows])
  const visibleProjects = useMemo(() => {
    const ids = new Set(report.rows.map(row => row.projectId).filter(Boolean))
    return (projectsQuery.data || []).filter(project => ids.has(project.id))
  }, [projectsQuery.data, report.rows])
  const visibleEquipment = useMemo(() => {
    const ids = new Set(report.rows.map(row => row.equipmentId))
    return (equipmentQuery.data || []).filter(machine => ids.has(machine.id))
  }, [equipmentQuery.data, report.rows])

  const persistFilters = next => onNavigate?.('fuel_reconciliation', {
    rangeDays: next.rangeDays ?? rangeDays,
    metric: next.metric ?? metric,
    equipmentId: next.equipmentId ?? equipmentId,
    projectId: next.projectId ?? projectId,
  }, { replace: true })
  const selectRange = value => { setRangeDays(value); persistFilters({ rangeDays: value }) }
  const selectMetric = value => { setMetric(value); persistFilters({ metric: value }) }
  const setTileMetric = value => selectMetric(metric === value ? 'all' : value)
  const selectEquipment = value => { setEquipmentId(value); persistFilters({ equipmentId: value }) }
  const selectProject = value => { setProjectId(value); persistFilters({ projectId: value }) }
  const clearFilters = () => {
    setMetric('all')
    setEquipmentId('all')
    setProjectId('all')
    setSearch('')
    persistFilters({ metric: 'all', equipmentId: 'all', projectId: 'all' })
  }
  const hasFilters = metric !== 'all' || equipmentId !== 'all' || projectId !== 'all' || Boolean(search.trim())
  const summary = report.summary

  return (
    <div className="h-full overflow-y-auto bg-dark-900 p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="flex flex-col gap-3 rounded-2xl border border-dark-600 bg-dark-800/60 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-400">Fuel control desk</p>
            <h1 className="mt-1 text-xl font-bold text-slate-100">Fuel Variance &amp; Diesel Reconciliation</h1>
            <p className="mt-1 text-xs text-slate-500">Match every fuel issue or fill against approved site consumption, machine standards, project and cost.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={rangeDays} onChange={event => selectRange(Number(event.target.value))} className={selectClass()} aria-label="Reconciliation period">
              {RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button onClick={() => onNavigate?.('fleet')} className="btn-ghost px-3 py-2 text-xs">
              Equipment fuel register <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onNavigate?.('operations', { tab: 'site_logs' })} className="btn-primary px-3 py-2 text-xs">
              Open site logs <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-700/50 bg-red-500/10 p-4 text-sm text-red-300">
            Fuel reconciliation could not load: {error.message}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiTile active={metric === 'supply'} onClick={() => setTileMetric('supply')} title="Fuel supplied" value={litres(summary.suppliedLitres)} note={`${report.rows.filter(row => row.suppliedLitres > 0).length} machine-days`} icon={Fuel} tone="sky" />
          <KpiTile active={metric === 'unaccounted'} onClick={() => setTileMetric('unaccounted')} title="Unaccounted" value={litres(summary.unaccountedLitres)} note="Issued minus consumption" icon={AlertTriangle} tone="red" />
          <KpiTile active={metric === 'over_standard'} onClick={() => setTileMetric('over_standard')} title="Above standard" value={litres(summary.excessLitres)} note="Actual above machine benchmark" icon={Gauge} tone="amber" />
          <KpiTile active={metric === 'cost_impact'} onClick={() => setTileMetric('cost_impact')} title="Financial exposure" value={money(summary.financialExposure)} note={summary.averageRate ? `Weighted diesel rate ₹${summary.averageRate}/L` : 'Add rates to calculate exposure'} icon={CircleDollarSign} tone="violet" />
          <KpiTile active={metric === 'data_gaps'} onClick={() => setTileMetric('data_gaps')} title="Data gaps" value={summary.dataGapRows} note={`${summary.duplicateEntries} possible duplicate entries`} icon={DatabaseZap} tone="cyan" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="rounded-xl border border-dark-600 bg-dark-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Daily fuel movement</p>
                <p className="text-[10px] text-slate-500">The chart follows the selected KPI and filters</p>
              </div>
              <BarChart3 className="h-4 w-4 text-primary-400" />
            </div>
            <div className="mt-3 h-56">
              {isLoading ? (
                <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-400" /></div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Droplets className="h-8 w-8 text-slate-700" />
                  <p className="mt-2 text-xs text-slate-500">No fuel evidence matches this filter</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#27344a" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={value => value.slice(5)} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#172033', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#cbd5e1' }} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                    <Bar dataKey="supplied" name="Supplied L" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="consumed" name="Consumed L" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expected" name="Expected L" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dark-600 bg-dark-800 p-4">
            <p className="text-sm font-semibold text-slate-100">Reconciliation health</p>
            <div className="mt-4 flex items-center gap-4">
              <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-8 ${
                summary.reconciliationRate == null ? 'border-slate-700 text-slate-500' :
                summary.reconciliationRate >= 90 ? 'border-emerald-500/60 text-emerald-400' :
                summary.reconciliationRate >= 70 ? 'border-amber-500/60 text-amber-400' : 'border-red-500/60 text-red-400'
              }`}>
                <span className="text-lg font-bold">{summary.reconciliationRate == null ? '—' : `${summary.reconciliationRate}%`}</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  {summary.reconciliationRate == null ? 'Awaiting comparable logs' : `${summary.reconciledRows} machine-days reconciled`}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {summary.comparableRows} machine-day{summary.comparableRows === 1 ? '' : 's'} have both supply and approved consumption evidence.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-dark-700 pt-3 text-[11px]">
              <div className="flex justify-between"><span className="text-slate-500">Operating hours</span><span className="font-semibold text-slate-300">{summary.operatingHours.toLocaleString('en-IN')} hrs</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Consumed</span><span className="font-semibold text-slate-300">{litres(summary.consumedLitres)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Expected</span><span className="font-semibold text-slate-300">{litres(summary.expectedLitres)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Risk rows</span><span className="font-semibold text-red-400">{summary.riskRows}</span></div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-dark-600 bg-dark-800/60 p-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 lg:mr-2">
              <SlidersHorizontal className="h-4 w-4 text-primary-400" /> Filter evidence
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-600" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Machine, registration, project or date…" className="w-full rounded-lg border border-dark-600 bg-dark-800 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-primary-500 focus:outline-none" />
            </div>
            <select value={equipmentId} onChange={event => selectEquipment(event.target.value)} className={selectClass()} aria-label="Filter reconciliation by equipment">
              <option value="all">All equipment</option>
              {visibleEquipment.map(machine => <option key={machine.id} value={machine.id}>{machine.name} {machine.equipment_number ? `· ${machine.equipment_number}` : ''}</option>)}
            </select>
            <select value={projectId} onChange={event => selectProject(event.target.value)} className={selectClass()} aria-label="Filter reconciliation by project">
              <option value="all">All projects</option>
              {visibleProjects.map(project => <option key={project.id} value={project.id}>{project.project_name}</option>)}
            </select>
          </div>
        </section>

        <section className="space-y-3 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-100">Reconciliation evidence</p>
              <p className="text-[10px] text-slate-500">{filteredRows.length} of {report.rows.length} machine-days · {displayDate(startDate)} to {displayDate(endDate)}</p>
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs text-primary-300">
                {metric !== 'all' ? `Showing: ${METRIC_LABELS[metric]} · ` : ''}Clear all filters
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-dark-700 bg-dark-800 py-20"><Loader2 className="h-7 w-7 animate-spin text-primary-400" /></div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dark-700 bg-dark-800 py-16 text-center">
              {metric === 'unaccounted' || metric === 'over_standard' ? <CheckCircle2 className="h-10 w-10 text-emerald-500" /> : <Fuel className="h-10 w-10 text-slate-700" />}
              <p className="mt-3 text-sm font-semibold text-slate-300">No rows match {METRIC_LABELS[metric].toLowerCase()}</p>
              <p className="mt-1 max-w-md text-xs text-slate-500">Change the period or clear filters. Supply records need approved Site Logs to calculate consumption variance.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRows.map(row => <EvidenceCard key={row.key} row={row} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
