import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, CalendarClock, CheckCircle2, CircleOff, Fuel,
  Gauge, MapPin, ShieldAlert, Truck, Wrench,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { addDateDays, equipmentPlanningState, localDateKey } from '../../lib/deploymentPlanner'
import { buildOperationsIntelligence } from '../../lib/operationsIntelligence'

const STATUS = {
  active:      { label: 'Working', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  idle:        { label: 'Idle', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  breakdown:   { label: 'Breakdown', color: 'text-red-400', bg: 'bg-red-500/10' },
  maintenance: { label: 'Maintenance', color: 'text-amber-400', bg: 'bg-amber-500/10' },
}

const today = localDateKey
const dateAfter = days => addDateDays(today(), days)

function useControlTower(companyId) {
  return useQuery({
    queryKey: ['pm-control-tower', companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const requests = await Promise.all([
        supabase.from('equipment')
          .select('id,name,equipment_number,category,status,current_meter_reading,current_project_id')
          .eq('company_id', companyId),
        supabase.from('pm_schedules')
          .select('id,equipment_id,equipment_name,schedule_name,next_due_meter,next_due_date,alert_before_hours,is_active')
          .eq('company_id', companyId).eq('is_active', true),
        supabase.from('job_cards')
          .select('id,jc_number,equipment_id,equipment_name,jc_type,status,complaint,opened_date,downtime_hours')
          .eq('company_id', companyId).neq('status', 'closed')
          .order('opened_date', { ascending: true }),
        supabase.from('equipment_documents')
          .select('id,equipment_id,doc_name,doc_type,expiry_date')
          .eq('company_id', companyId).gte('expiry_date', today()).lte('expiry_date', dateAfter(30))
          .order('expiry_date'),
        supabase.from('equipment_deployments')
          .select('id,equipment_id,project_id,deployed_date,withdrawn_date,expected_return_date,status')
          .eq('company_id', companyId).lte('deployed_date', today()).or(`status.eq.active,withdrawn_date.gte.${today()}`),
        supabase.from('daily_operations')
          .select('equipment_id,ops_date,status,running_hours,fuel_consumed')
          .eq('company_id', companyId).gte('ops_date', dateAfter(-6)),
        supabase.from('equipment_deployment_plans')
          .select('id,equipment_id,project_id,mobilisation_date,expected_return_date,status')
          .eq('company_id', companyId).in('status', ['planned', 'confirmed'])
          .lte('mobilisation_date', today()).gte('expected_return_date', today()),
      ])

      const names = ['equipment', 'pmSchedules', 'jobCards', 'documents', 'deployments', 'operations', 'plans']
      const failures = requests.flatMap((result, index) => result.error ? [names[index]] : [])
      return {
        equipment:   requests[0].data || [],
        pmSchedules: requests[1].data || [],
        jobCards:    requests[2].data || [],
        documents:   requests[3].data || [],
        deployments: requests[4].data || [],
        operations:  requests[5].data || [],
        plans:       requests[6].data || [],
        failures,
      }
    },
  })
}

function Metric({ icon: Icon, label, value, tone = 'text-primary-400', onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Show ${label} equipment`}
      className="card p-4 text-left hover:border-primary-500/60 hover:bg-dark-700/30 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon className={`w-4 h-4 ${tone}`} />
      </div>
      <p className={`text-2xl font-bold mt-2 ${tone}`}>{value}</p>
    </button>
  )
}

function AttentionRow({ icon: Icon, tone, title, detail, action, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-3 rounded-xl bg-dark-700/50 border border-dark-700 hover:border-primary-500/30 text-left">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        <p className="text-xs text-slate-500 truncate">{detail}</p>
      </div>
      <span className="text-xs text-primary-400">{action}</span>
    </button>
  )
}

export default function ControlTowerPage({ onNavigate }) {
  const { companyId, company } = useAuth()
  const { data, isLoading, isError } = useControlTower(companyId)

  const insight = useMemo(() => {
    if (!data) return null
    const equipmentById = Object.fromEntries(data.equipment.map(item => [item.id, item]))
    const missingLogAssets = buildOperationsIntelligence({
      equipment: data.equipment,
      deployments: data.deployments,
      operations: data.operations,
      startDate: dateAfter(-6),
      endDate: today(),
      today: today(),
    }).filter(item => item.missingLogDays > 0).map(item => item.equipment)
    const pmDue = data.pmSchedules.filter(item => {
      const meter = Number(equipmentById[item.equipment_id]?.current_meter_reading || 0)
      return (item.next_due_date && item.next_due_date <= dateAfter(14)) ||
        (item.next_due_meter != null && Number(item.next_due_meter) - meter <= Number(item.alert_before_hours ?? 50))
    })
    const hours = data.operations.reduce((sum, item) => sum + Number(item.running_hours || 0), 0)
    const fuel = data.operations.reduce((sum, item) => sum + Number(item.fuel_consumed || 0), 0)
    return { equipmentById, missingLogAssets, pmDue, hours, fuel }
  }, [data])

  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading P&amp;M Control Tower…</div>
  if (isError || !data || !insight) return <div className="p-6 text-sm text-red-400">Control Tower data could not be loaded.</div>

  const counts = data.equipment.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {})
  const available = data.equipment.filter(item => item.status !== 'disposed' && equipmentPlanningState(item, data.deployments, data.plans, today(), today()).status === 'available').length
  const sevenDayDrilldown = { from: dateAfter(-6), to: today() }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary-400 font-semibold">P&amp;M Command Centre</p>
          <h1 className="text-xl font-bold text-slate-100 mt-1">{company?.name} Control Tower</h1>
          <p className="text-sm text-slate-500 mt-1">Fleet health, deployment, maintenance and field performance</p>
        </div>
        <div className="text-xs text-slate-500 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2">Last 7 days · live fleet status</div>
      </div>

      {data.failures.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          Some feeds are unavailable: {data.failures.join(', ')}. Available figures are still shown.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Metric icon={Truck} label="Total fleet" value={data.equipment.length} onClick={() => onNavigate('fleet', { fleetFilter: { kind: 'all', label: 'Total fleet' } })} />
        <Metric icon={CheckCircle2} label="Working" value={counts.active || 0} tone="text-emerald-400" onClick={() => onNavigate('fleet', { fleetFilter: { kind: 'status', value: 'active', label: 'Working' } })} />
        <Metric icon={CircleOff} label="Idle" value={counts.idle || 0} tone="text-blue-400" onClick={() => onNavigate('fleet', { fleetFilter: { kind: 'status', value: 'idle', label: 'Idle' } })} />
        <Metric icon={ShieldAlert} label="Breakdown" value={counts.breakdown || 0} tone="text-red-400" onClick={() => onNavigate('fleet', { fleetFilter: { kind: 'status', value: 'breakdown', label: 'Breakdown' } })} />
        <Metric icon={Wrench} label="Maintenance" value={counts.maintenance || 0} tone="text-amber-400" onClick={() => onNavigate('fleet', { fleetFilter: { kind: 'status', value: 'maintenance', label: 'Maintenance' } })} />
        <Metric icon={MapPin} label="Available" value={available} tone="text-purple-400" onClick={() => onNavigate('deployment_planner', { plannerStatus: 'available' })} />
      </div>

      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-4">
        <section className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div><h2 className="text-sm font-bold text-slate-100">Attention required</h2><p className="text-xs text-slate-500 mt-0.5">Items that need P&amp;M action</p></div>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="space-y-2">
            <AttentionRow icon={ShieldAlert} tone="bg-red-500/10 text-red-400" title={`${data.jobCards.length} open job cards`} detail={data.jobCards[0]?.complaint || 'No unresolved repair complaints'} action="Open workshop" onClick={() => onNavigate('maintenance', { tab: 'workshop', workshopStatus: 'active' })} />
            <AttentionRow icon={CalendarClock} tone="bg-amber-500/10 text-amber-400" title={`${insight.pmDue.length} PM services approaching`} detail="Due within 14 days or the configured operating-hour alert" action="Open PM planner" onClick={() => onNavigate('maintenance', { tab: 'planner', pmState: 'action_due' })} />
            <AttentionRow icon={CircleOff} tone="bg-blue-500/10 text-blue-400" title={`${insight.missingLogAssets.length} deployed assets with missing daily logs`} detail="Open the exact machine and site drill-down" action="View filtered" onClick={() => onNavigate('operations', { tab: 'intelligence', metric: 'missing_logs', ...sevenDayDrilldown })} />
            <AttentionRow icon={ShieldAlert} tone="bg-purple-500/10 text-purple-400" title={`${data.documents.length} documents expiring`} detail="Insurance, permit, fitness or compliance due in 30 days" action="View filtered" onClick={() => onNavigate('fleet', { fleetFilter: { kind: 'equipment_ids', ids: [...new Set(data.documents.map(item => item.equipment_id).filter(Boolean))], label: 'Expiring documents' } })} />
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-bold text-slate-100">Seven-day performance</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Based on daily operations entries</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => onNavigate('operations', { tab: 'intelligence', metric: 'hours', ...sevenDayDrilldown })} className="rounded-xl bg-dark-700/60 border border-dark-700 hover:border-primary-500/50 p-4 text-left"><Gauge className="w-5 h-5 text-primary-400" /><p className="text-2xl font-bold text-slate-100 mt-3">{insight.hours.toFixed(1)}</p><p className="text-xs text-slate-500">Operating hours · view machines</p></button>
            <button onClick={() => onNavigate('operations', { tab: 'intelligence', metric: 'fuel', ...sevenDayDrilldown })} className="rounded-xl bg-dark-700/60 border border-dark-700 hover:border-primary-500/50 p-4 text-left"><Fuel className="w-5 h-5 text-amber-400" /><p className="text-2xl font-bold text-slate-100 mt-3">{insight.fuel.toFixed(0)} L</p><p className="text-xs text-slate-500">Fuel consumed · view machines</p></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            <button onClick={() => onNavigate('operations', { tab: 'site_logs' })} className="btn-primary w-full justify-center text-sm">Record today&apos;s logs</button>
            <button onClick={() => onNavigate('operations', { tab: 'intelligence' })} className="btn-secondary w-full justify-center text-sm">Open utilization</button>
          </div>
        </section>
      </div>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-slate-100 mb-3">Fleet health distribution</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(STATUS).map(([key, meta]) => {
            const count = counts[key] || 0
            const pct = data.equipment.length ? Math.round((count / data.equipment.length) * 100) : 0
            return (
              <button key={key} type="button"
                onClick={() => onNavigate('fleet', { fleetFilter: { kind: 'status', value: key, label: meta.label } })}
                aria-label={`Show ${meta.label} equipment`}
                className={`rounded-xl p-3 text-left hover:ring-1 hover:ring-primary-500/50 transition-all ${meta.bg}`}>
                <div className="flex justify-between text-xs"><span className={meta.color}>{meta.label}</span><span className="text-slate-400">{pct}%</span></div>
                <div className="h-1.5 bg-dark-900/50 rounded-full mt-3 overflow-hidden"><div className="h-full bg-current rounded-full" style={{ width: `${pct}%` }} /></div>
                <p className={`text-xl font-bold mt-2 ${meta.color}`}>{count}</p>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
