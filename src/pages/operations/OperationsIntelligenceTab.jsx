import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2,
  ChevronRight, CircleOff, Clock, Fuel, Gauge, Loader2, MapPin, RotateCcw,
  Search, Truck,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  addDays, buildOperationsIntelligence, filterOperationsRows, summariseOperationsRows,
} from '../../lib/operationsIntelligence'

const localDate = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const METRICS = {
  all: { label: 'All machines' },
  deployed: { label: 'Deployed' },
  missing_logs: { label: 'Missing logs' },
  hours: { label: 'Operating hours' },
  fuel: { label: 'Fuel consumed' },
  low_utilisation: { label: 'Low utilisation' },
  overdue_returns: { label: 'Overdue returns' },
}

function useOperationsIntelligence(companyId, startDate, endDate) {
  return useQuery({
    queryKey: ['operations-intelligence', companyId, startDate, endDate],
    enabled: Boolean(companyId && startDate && endDate && startDate <= endDate),
    staleTime: 30_000,
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from('equipment')
          .select('id,name,equipment_number,category,status,current_project_id')
          .eq('company_id', companyId).neq('status', 'disposed').order('name'),
        supabase.from('equipment_deployments')
          .select('id,equipment_id,project_id,deployed_date,withdrawn_date,expected_return_date,status,deployment_location')
          .eq('company_id', companyId).lte('deployed_date', endDate)
          .or(`withdrawn_date.is.null,withdrawn_date.gte.${startDate}`),
        supabase.from('equipment_deployment_plans')
          .select('id,equipment_id,project_id,mobilisation_date,expected_return_date,status')
          .eq('company_id', companyId).lte('mobilisation_date', endDate).gte('expected_return_date', startDate),
        supabase.from('daily_operations')
          .select('id,equipment_id,project_id,ops_date,status,running_hours,fuel_consumed,idle_reason')
          .eq('company_id', companyId).gte('ops_date', startDate).lte('ops_date', endDate),
        supabase.from('projects')
          .select('id,project_name,project_code,site_name,status,is_active')
          .eq('company_id', companyId).order('project_name'),
      ])
      const labels = ['equipment', 'deployments', 'plans', 'daily operations', 'projects']
      const failed = results.find(result => result.error)
      if (failed) {
        const index = results.indexOf(failed)
        throw new Error(`${labels[index]} could not be loaded: ${failed.error.message}`)
      }
      return {
        equipment: results[0].data || [], deployments: results[1].data || [],
        plans: results[2].data || [], operations: results[3].data || [], projects: results[4].data || [],
      }
    },
  })
}

function MetricTile({ icon: Icon, label, value, detail, tone, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-xl border p-3 text-left transition-all min-w-0 ${active
        ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30'
        : 'border-dark-700 bg-dark-800 hover:border-primary-500/50 hover:bg-dark-700/50'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] text-slate-500 leading-tight">{label}</span>
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} />
      </div>
      <p className={`text-xl font-bold mt-2 ${tone}`}>{value}</p>
      <p className="text-[10px] text-slate-600 mt-0.5 truncate">{detail}</p>
    </button>
  )
}

function Progress({ value, tone = 'bg-primary-500' }) {
  return (
    <div className="h-1.5 bg-dark-900 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

function MachineRow({ row, onEquipment, onProject, onRecord }) {
  const projectLabel = row.project?.project_name || row.projectNames[0] || 'Unassigned'
  const utilizationTone = row.lowUtilisation ? 'text-amber-400' : 'text-emerald-400'
  return (
    <article className="rounded-xl border border-dark-700 bg-dark-800 p-3.5 hover:border-dark-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onEquipment} className="text-sm font-bold text-slate-100 hover:text-primary-400 text-left truncate block max-w-full">
            {row.equipment.name} <span className="text-xs font-medium text-primary-500">{row.equipment.equipment_number}</span>
          </button>
          <button onClick={row.project ? onProject : undefined} disabled={!row.project}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary-400 mt-1 disabled:hover:text-slate-500">
            <MapPin className="w-3 h-3" /> <span className="truncate">{projectLabel}{row.project?.site_name ? ` · ${row.project.site_name}` : ''}</span>
          </button>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
          {row.overdueReturn && <span className="badge bg-red-500/10 text-red-400 border-red-700/40">Return overdue</span>}
          {row.missingLogDays > 0 && <span className="badge bg-orange-500/10 text-orange-400 border-orange-700/40">{row.missingLogDays} logs missing</span>}
          {!row.overdueReturn && row.missingLogDays === 0 && row.deployedDays > 0 && <span className="badge bg-emerald-500/10 text-emerald-400 border-emerald-700/40">Logs complete</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
        <div><p className="text-[10px] text-slate-600">Planned</p><p className="text-sm font-semibold text-slate-300">{row.plannedDays}d</p></div>
        <div><p className="text-[10px] text-slate-600">Deployed</p><p className="text-sm font-semibold text-slate-300">{row.deployedDays}d</p></div>
        <div><p className="text-[10px] text-slate-600">Logged</p><p className="text-sm font-semibold text-slate-300">{row.loggedDeploymentDays}d</p></div>
        <div><p className="text-[10px] text-slate-600">Hours</p><p className="text-sm font-semibold text-primary-400">{row.operatingHours.toFixed(1)}</p></div>
        <div><p className="text-[10px] text-slate-600">Fuel</p><p className="text-sm font-semibold text-amber-400">{row.fuelConsumed.toFixed(0)} L</p></div>
        <div><p className="text-[10px] text-slate-600">Utilisation</p><p className={`text-sm font-semibold ${utilizationTone}`}>{row.deployedDays ? `${row.utilisation}%` : '—'}</p></div>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-600">Daily log coverage</span><span className={row.coverage < 100 ? 'text-orange-400' : 'text-emerald-400'}>{row.deployedDays ? `${row.coverage}%` : 'Not deployed'}</span></div>
        <Progress value={row.coverage} tone={row.coverage < 100 ? 'bg-orange-500' : 'bg-emerald-500'} />
      </div>

      {(row.missingDates.length > 0 || row.expectedReturnDate) && (
        <div className="mt-3 text-[11px] text-slate-500">
          {row.missingDates.length > 0 && <p>Missing: {row.missingDates.slice(-4).join(', ')}{row.missingDates.length > 4 ? ` +${row.missingDates.length - 4} more` : ''}</p>}
          {row.expectedReturnDate && <p className="text-red-400 mt-0.5">Expected return was {row.expectedReturnDate}</p>}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-700">
        <button onClick={onEquipment} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">Equipment 360 <ChevronRight className="w-3 h-3" /></button>
        {row.project && <button onClick={onProject} className="text-xs text-slate-400 hover:text-primary-300 flex items-center gap-1">Project <ChevronRight className="w-3 h-3" /></button>}
        <button onClick={onRecord} className="ml-auto text-xs font-semibold text-slate-200 bg-dark-700 hover:bg-primary-600 px-3 py-1.5 rounded-lg transition-colors">Record operation</button>
      </div>
    </article>
  )
}

export default function OperationsIntelligenceTab({ companyId, initialMetric = 'all', initialFrom, initialTo, initialProjectId = 'all', onNavigate, onRecord }) {
  const currentDate = localDate()
  const [startDate, setStartDate] = useState(initialFrom || addDays(currentDate, -6))
  const [endDate, setEndDate] = useState(initialTo || currentDate)
  const [metric, setMetric] = useState(METRICS[initialMetric] ? initialMetric : 'all')
  const [projectId, setProjectId] = useState(initialProjectId || 'all')
  const [search, setSearch] = useState('')
  const { data, isLoading, isError, error } = useOperationsIntelligence(companyId, startDate, endDate)

  useEffect(() => {
    setMetric(METRICS[initialMetric] ? initialMetric : 'all')
  }, [initialMetric])

  useEffect(() => {
    if (initialFrom) setStartDate(initialFrom)
    if (initialTo) setEndDate(initialTo)
  }, [initialFrom, initialTo])

  useEffect(() => {
    setProjectId(initialProjectId || 'all')
  }, [initialProjectId])

  const rows = useMemo(() => data ? buildOperationsIntelligence({ ...data, startDate, endDate, today: currentDate }) : [], [data, startDate, endDate, currentDate])
  const scopedRows = useMemo(() => filterOperationsRows(rows, { projectId, search }), [rows, projectId, search])
  const visibleRows = useMemo(() => filterOperationsRows(scopedRows, { metric }), [scopedRows, metric])
  const summary = useMemo(() => summariseOperationsRows(scopedRows), [scopedRows])

  const persistFilters = next => onNavigate?.('operations', {
    tab: 'intelligence',
    metric: next.metric ?? metric,
    from: next.from ?? startDate,
    to: next.to ?? endDate,
    projectId: next.projectId ?? projectId,
  }, { replace: true })
  const changeStartDate = value => { setStartDate(value); persistFilters({ from: value }) }
  const changeEndDate = value => { setEndDate(value); persistFilters({ to: value }) }
  const changeProject = value => { setProjectId(value); persistFilters({ projectId: value }) }
  const setPreset = days => {
    const from = addDays(currentDate, -(days - 1))
    setStartDate(from)
    setEndDate(currentDate)
    persistFilters({ from, to: currentDate })
  }
  const changeMetric = value => { setMetric(value); persistFilters({ metric: value }) }
  const selectMetric = value => changeMetric(metric === value ? 'all' : value)

  return (
    <div className="h-full overflow-y-auto px-4 pb-6 pt-3 space-y-4">
      <section className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-3.5 flex items-start gap-3">
        <BarChart3 className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" />
        <div><p className="text-sm font-semibold text-slate-200">Deployment-to-work intelligence</p><p className="text-xs text-slate-500 mt-0.5">Compare scheduled days, actual deployment and field logs. Select any metric to see only the machines behind it.</p></div>
      </section>

      <section className="card p-3.5 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-slate-500">From<input type="date" value={startDate} max={endDate} onChange={event => changeStartDate(event.target.value)} className="block mt-1 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-2 text-xs text-slate-200" /></label>
          <label className="text-[10px] text-slate-500">To<input type="date" value={endDate} min={startDate} max={currentDate} onChange={event => changeEndDate(event.target.value)} className="block mt-1 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-2 text-xs text-slate-200" /></label>
          <div className="flex gap-1.5">
            {[7, 14, 30].map(days => <button key={days} onClick={() => setPreset(days)} className="px-2.5 py-2 rounded-lg border border-dark-600 text-xs text-slate-400 hover:text-primary-400 hover:border-primary-600">{days}d</button>)}
          </div>
          <label className="text-[10px] text-slate-500 min-w-[180px] flex-1">Project / site<select value={projectId} onChange={event => changeProject(event.target.value)} className="block mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-2 text-xs text-slate-200"><option value="all">All projects</option>{data?.projects.map(project => <option key={project.id} value={project.id}>{project.project_name}{project.site_name ? ` · ${project.site_name}` : ''}</option>)}</select></label>
          <label className="relative min-w-[190px] flex-1"><Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Machine, number or site…" className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600" /></label>
        </div>
      </section>

      {isLoading ? <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div> : isError ? (
        <div className="card p-6 text-sm text-red-400">{error?.message || 'Operations intelligence could not be loaded.'}</div>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
            <MetricTile icon={Truck} label="Deployed machine-days" value={summary.deployedDays} detail={`${scopedRows.filter(row => row.deployedDays > 0).length} machines`} tone="text-primary-400" active={metric === 'deployed'} onClick={() => selectMetric('deployed')} />
            <MetricTile icon={CircleOff} label="Missing daily logs" value={summary.missingLogDays} detail={`${summary.logCoverage}% coverage`} tone="text-orange-400" active={metric === 'missing_logs'} onClick={() => selectMetric('missing_logs')} />
            <MetricTile icon={Clock} label="Operating hours" value={summary.operatingHours.toFixed(1)} detail="logged hours" tone="text-cyan-400" active={metric === 'hours'} onClick={() => selectMetric('hours')} />
            <MetricTile icon={Fuel} label="Fuel consumed" value={`${summary.fuelConsumed.toFixed(0)} L`} detail="logged consumption" tone="text-amber-400" active={metric === 'fuel'} onClick={() => selectMetric('fuel')} />
            <MetricTile icon={Gauge} label="Low utilisation" value={summary.lowUtilisationMachines} detail="below 4 hrs/day" tone="text-yellow-400" active={metric === 'low_utilisation'} onClick={() => selectMetric('low_utilisation')} />
            <MetricTile icon={AlertTriangle} label="Overdue returns" value={summary.overdueReturns} detail="active deployments" tone="text-red-400" active={metric === 'overdue_returns'} onClick={() => selectMetric('overdue_returns')} />
          </section>

          <section className="card p-3.5">
            <div className="flex items-center justify-between gap-3 mb-3"><div><p className="text-sm font-semibold text-slate-200">Planned → deployed → logged</p><p className="text-xs text-slate-500">Machine-days in the selected period</p></div><CalendarDays className="w-5 h-5 text-slate-600" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-purple-500/10 p-3"><p className="text-[10px] text-purple-400">Planned</p><p className="text-xl font-bold text-purple-300">{summary.plannedDays}</p></div>
              <div className="rounded-lg bg-primary-500/10 p-3"><p className="text-[10px] text-primary-400">Deployed</p><p className="text-xl font-bold text-primary-300">{summary.deployedDays}</p></div>
              <div className="rounded-lg bg-emerald-500/10 p-3"><p className="text-[10px] text-emerald-400">Logged</p><p className="text-xl font-bold text-emerald-300">{summary.loggedDeploymentDays}</p></div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div><p className="text-sm font-semibold text-slate-200">{METRICS[metric].label}</p><p className="text-xs text-slate-500">{visibleRows.length} machine{visibleRows.length === 1 ? '' : 's'} match this exact drill-down</p></div>
              {metric !== 'all' && <button onClick={() => changeMetric('all')} className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"><RotateCcw className="w-3 h-3" /> Clear metric</button>}
            </div>
            {visibleRows.length === 0 ? (
              <div className="card py-14 px-4 text-center"><CheckCircle2 className="w-9 h-9 text-emerald-500/50 mx-auto" /><p className="text-sm font-semibold text-slate-300 mt-3">No machines match {METRICS[metric].label.toLowerCase()}</p><p className="text-xs text-slate-500 mt-1">Change the date or project filter, or clear this metric.</p></div>
            ) : <div className="grid xl:grid-cols-2 gap-3">{visibleRows.map(row => <MachineRow key={row.equipment.id} row={row} onEquipment={() => onNavigate?.('fleet', { equipmentId: row.equipment.id })} onProject={() => row.project && onNavigate?.('projects', { projectId: row.project.id })} onRecord={() => onRecord?.(row.equipment)} />)}</div>}
          </section>
        </>
      )}
    </div>
  )
}
