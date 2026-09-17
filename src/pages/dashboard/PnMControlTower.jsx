import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, CalendarClock, CheckCircle2, ChevronRight,
  FolderOpen, Fuel, RefreshCw, Truck, Wrench,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

const localISO = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const pct = (value) => Number.isFinite(value) ? `${Math.round(value)}%` : '—'
const oneDecimal = (value) => Number(value || 0).toFixed(1)

async function capture(label, request) {
  const { data, error } = await request
  return { label, data: data || [], error }
}

function usePnMControlData(companyId) {
  const today = localISO()
  const monthStart = localISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  return useQuery({
    queryKey: ['pnm-control-tower', companyId, today, monthStart],
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [equipment, projects, shifts, fuel, pm, jobs, breakdowns, deployments, dailyOps] = await Promise.all([
        capture('equipment', supabase.from('equipment')
          .select('id,name,equipment_number,category,status,current_project_id,current_site_name,current_meter_reading,specific_consumption_lph,next_service_meter,next_service_date,ownership_type')
          .eq('company_id', companyId)),
        capture('projects', supabase.from('projects')
          .select('id,project_name,project_code,status,is_active')
          .eq('company_id', companyId)),
        capture('shifts', supabase.from('shifts')
          .select('id,equipment_id,shift_date,status,working_hours,idle_hours,breakdown_hours')
          .eq('company_id', companyId)
          .gte('shift_date', monthStart)
          .lte('shift_date', today)),
        capture('fuel', supabase.from('shift_fuel_entries')
          .select('id,equipment_id,entry_time,quantity_liters')
          .eq('company_id', companyId)
          .gte('entry_time', `${monthStart}T00:00:00`)),
        capture('pm_schedules', supabase.from('pm_schedules')
          .select('id,equipment_id,equipment_name,schedule_name,next_due_meter,next_due_date,is_active')
          .eq('company_id', companyId)
          .eq('is_active', true)),
        capture('job_cards', supabase.from('job_cards')
          .select('id,jc_number,equipment_id,equipment_name,jc_type,status,complaint,opened_date,downtime_hours')
          .eq('company_id', companyId)
          .in('status', ['open', 'in_progress'])),
        capture('breakdown_alerts', supabase.from('breakdown_alerts')
          .select('id,equipment_id,equipment_name,project_id,breakdown_cause,reported_at,acknowledged_at,resolved_at')
          .eq('company_id', companyId)
          .is('resolved_at', null)
          .order('reported_at', { ascending: false })),
        capture('equipment_deployments', supabase.from('equipment_deployments')
          .select('id,equipment_id,project_id,status,deployed_date,withdrawn_date')
          .eq('company_id', companyId)
          .eq('status', 'active')),
        capture('daily_operations', supabase.from('daily_operations')
          .select('id,equipment_id,ops_date')
          .eq('company_id', companyId)
          .eq('ops_date', today)),
      ])

      const result = { equipment, projects, shifts, fuel, pm, jobs, breakdowns, deployments, dailyOps }
      return {
        equipment: equipment.data,
        projects: projects.data,
        shifts: shifts.data,
        fuel: fuel.data,
        pm: pm.data,
        jobs: jobs.data,
        breakdowns: breakdowns.data,
        deployments: deployments.data,
        dailyOps: dailyOps.data,
        warnings: Object.values(result)
          .filter(r => r.error)
          .map(r => `${r.label}: ${r.error.message}`),
        today,
      }
    },
  })
}

function MetricCard({ icon: Icon, label, value, sub, tone = 'slate', onClick }) {
  const toneClass = {
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    slate: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
  }[tone]

  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`card p-4 text-left w-full border transition-all ${onClick ? 'hover:border-primary-500/50 cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${toneClass}`}>
          <Icon size={18} />
        </div>
        {onClick && <ChevronRight size={14} className="text-slate-600 mt-1" />}
      </div>
      <p className="text-2xl font-bold text-slate-100 mt-3 leading-none">{value}</p>
      <p className="text-xs font-semibold text-slate-300 mt-2">{label}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{sub}</p>}
    </Tag>
  )
}

function StatusPill({ label, value, tone }) {
  const colors = {
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    red: 'bg-red-500/10 text-red-300 border-red-500/20',
    slate: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  }
  return (
    <div className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-3 ${colors[tone] || colors.slate}`}>
      <span className="text-xs">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  )
}

export default function PnMControlTower({ companyId, onNavigate }) {
  const { data, isLoading, isFetching, error, refetch } = usePnMControlData(companyId)

  const metrics = useMemo(() => {
    if (!data) return null

    const fleet = data.equipment.filter(e => e.status !== 'disposed')
    const eqById = new Map(fleet.map(e => [e.id, e]))
    const projectById = new Map(data.projects.map(p => [p.id, p]))
    const deploymentByEquipment = new Map(data.deployments.map(d => [d.equipment_id, d]))

    const counts = fleet.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1
      return acc
    }, {})

    const deployed = fleet.filter(e => e.current_project_id || deploymentByEquipment.has(e.id))
    const available = fleet.filter(e => e.status === 'active' && !e.current_project_id && !deploymentByEquipment.has(e.id))
    const physicallyAvailable = (counts.active || 0) + (counts.idle || 0)
    const availabilityPct = fleet.length ? (physicallyAvailable / fleet.length) * 100 : NaN

    const shiftTotals = data.shifts.reduce((acc, s) => {
      acc.working += Number(s.working_hours || 0)
      acc.idle += Number(s.idle_hours || 0)
      acc.breakdown += Number(s.breakdown_hours || 0)
      return acc
    }, { working: 0, idle: 0, breakdown: 0 })
    const scheduledHours = shiftTotals.working + shiftTotals.idle + shiftTotals.breakdown
    const utilizationPct = scheduledHours ? (shiftTotals.working / scheduledHours) * 100 : NaN

    const sevenDays = new Date()
    sevenDays.setDate(sevenDays.getDate() + 7)
    const sevenDaysISO = localISO(sevenDays)
    const overduePm = []
    const duePm = []

    data.pm.forEach(schedule => {
      const equipment = eqById.get(schedule.equipment_id)
      const currentMeter = Number(equipment?.current_meter_reading || 0)
      const dueMeter = schedule.next_due_meter == null ? null : Number(schedule.next_due_meter)
      const meterRemaining = dueMeter == null ? null : dueMeter - currentMeter
      const dateOverdue = !!schedule.next_due_date && schedule.next_due_date < data.today
      const meterOverdue = meterRemaining != null && meterRemaining <= 0
      const dateSoon = !!schedule.next_due_date && schedule.next_due_date >= data.today && schedule.next_due_date <= sevenDaysISO
      const meterSoon = meterRemaining != null && meterRemaining > 0 && meterRemaining <= 50
      const item = { ...schedule, equipment, meterRemaining }
      if (dateOverdue || meterOverdue) overduePm.push(item)
      else if (dateSoon || meterSoon) duePm.push(item)
    })

    const hoursByEquipment = new Map()
    data.shifts.forEach(s => {
      hoursByEquipment.set(s.equipment_id, (hoursByEquipment.get(s.equipment_id) || 0) + Number(s.working_hours || 0))
    })
    const fuelByEquipment = new Map()
    data.fuel.forEach(f => {
      fuelByEquipment.set(f.equipment_id, (fuelByEquipment.get(f.equipment_id) || 0) + Number(f.quantity_liters || 0))
    })

    const fuelVariance = fleet
      .map(e => {
        const hours = hoursByEquipment.get(e.id) || 0
        const litres = fuelByEquipment.get(e.id) || 0
        const norm = Number(e.specific_consumption_lph || 0)
        const actual = hours > 0 ? litres / hours : 0
        const variance = norm > 0 && hours > 0 ? ((actual - norm) / norm) * 100 : 0
        return { equipment: e, hours, litres, norm, actual, variance }
      })
      .filter(x => x.hours >= 1 && x.norm > 0 && x.actual > x.norm * 1.15)
      .sort((a, b) => b.variance - a.variance)

    const loggedToday = new Set([
      ...data.shifts.filter(s => s.shift_date === data.today).map(s => s.equipment_id),
      ...data.dailyOps.map(o => o.equipment_id),
    ])
    const notLoggedToday = deployed.filter(e => !loggedToday.has(e.id))

    const projectLoads = new Map()
    deployed.forEach(e => {
      const projectId = e.current_project_id || deploymentByEquipment.get(e.id)?.project_id
      if (!projectId) return
      const current = projectLoads.get(projectId) || { project: projectById.get(projectId), equipment: [] }
      current.equipment.push(e)
      projectLoads.set(projectId, current)
    })

    const attention = []
    data.breakdowns.slice(0, 4).forEach(b => attention.push({
      level: 'critical',
      title: `${b.equipment_name || eqById.get(b.equipment_id)?.name || 'Equipment'} breakdown`,
      sub: b.breakdown_cause || 'Breakdown awaiting resolution',
      nav: 'maintenance',
    }))
    overduePm.slice(0, 4).forEach(p => attention.push({
      level: 'critical',
      title: `${p.equipment?.name || p.equipment_name || 'Equipment'} PM overdue`,
      sub: p.schedule_name || 'Preventive maintenance',
      nav: 'maintenance',
    }))
    fuelVariance.slice(0, 3).forEach(f => attention.push({
      level: 'warning',
      title: `${f.equipment.name} fuel +${Math.round(f.variance)}% above norm`,
      sub: `${oneDecimal(f.actual)} L/hr actual · ${oneDecimal(f.norm)} L/hr norm`,
      nav: 'operations',
    }))
    if (notLoggedToday.length) attention.push({
      level: 'warning',
      title: `${notLoggedToday.length} deployed machine${notLoggedToday.length === 1 ? '' : 's'} not logged today`,
      sub: notLoggedToday.slice(0, 4).map(e => e.name).join(', '),
      nav: 'fleet',
      extra: { filterUnloggedIds: notLoggedToday.map(e => e.id) },
    })
    if (data.jobs.length) attention.push({
      level: 'info',
      title: `${data.jobs.length} job card${data.jobs.length === 1 ? '' : 's'} open`,
      sub: data.jobs.slice(0, 3).map(j => j.jc_number).join(', '),
      nav: 'maintenance',
    })
    duePm.slice(0, 2).forEach(p => attention.push({
      level: 'info',
      title: `${p.equipment?.name || p.equipment_name || 'Equipment'} PM due soon`,
      sub: p.meterRemaining != null ? `${Math.max(0, Math.round(p.meterRemaining))} hours remaining` : `Due ${p.next_due_date}`,
      nav: 'maintenance',
    }))

    return {
      fleet,
      counts,
      deployed,
      available,
      availabilityPct,
      utilizationPct,
      shiftTotals,
      overduePm,
      duePm,
      fuelVariance,
      notLoggedToday,
      projectLoads: Array.from(projectLoads.values()).sort((a, b) => b.equipment.length - a.equipment.length),
      attention: attention.slice(0, 10),
    }
  }, [data])

  if (!companyId) return null

  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
      <div className="rounded-2xl border border-dark-700 bg-dark-800/70 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-dark-700 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={17} className="text-primary-400" />
              <h2 className="text-base font-bold text-slate-100">P&M Control Tower</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-primary-500/20 bg-primary-500/10 text-primary-300">LIVE</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Fleet health, deployment, utilization, PM and fuel exceptions</p>
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-600 text-xs text-slate-400 hover:text-slate-200 hover:border-dark-500 disabled:opacity-50">
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {isLoading && (
          <div className="p-8 text-center text-sm text-slate-500">Loading P&M operational data…</div>
        )}

        {error && (
          <div className="m-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            P&M control data could not be loaded: {error.message}
          </div>
        )}

        {!isLoading && !error && metrics && (
          <div className="p-4 md:p-5 space-y-5">
            {data.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 flex gap-3">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-300">Some P&M metrics are unavailable</p>
                  <p className="text-[11px] text-amber-400/70 mt-1">{data.warnings.slice(0, 2).join(' · ')}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard icon={Truck} label="Fleet" value={metrics.fleet.length} sub={`${metrics.deployed.length} deployed · ${metrics.available.length} available`} tone="blue" onClick={() => onNavigate?.('fleet')} />
              <MetricCard icon={CheckCircle2} label="Fleet Availability" value={pct(metrics.availabilityPct)} sub={`${(metrics.counts.breakdown || 0) + (metrics.counts.maintenance || 0)} unavailable now`} tone={(metrics.counts.breakdown || 0) > 0 ? 'amber' : 'green'} onClick={() => onNavigate?.('fleet')} />
              <MetricCard icon={Activity} label="Utilization MTD" value={pct(metrics.utilizationPct)} sub={`${oneDecimal(metrics.shiftTotals.working)} working hours`} tone="green" onClick={() => onNavigate?.('operations')} />
              <MetricCard icon={Wrench} label="Maintenance Attention" value={metrics.overduePm.length + data.jobs.length} sub={`${metrics.overduePm.length} PM overdue · ${data.jobs.length} open job cards`} tone={(metrics.overduePm.length + data.jobs.length) > 0 ? 'red' : 'green'} onClick={() => onNavigate?.('maintenance')} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <StatusPill label="Working / Active" value={metrics.counts.active || 0} tone="green" />
              <StatusPill label="Idle" value={metrics.counts.idle || 0} tone="blue" />
              <StatusPill label="Breakdown" value={metrics.counts.breakdown || 0} tone="red" />
              <StatusPill label="Maintenance" value={metrics.counts.maintenance || 0} tone="amber" />
              <StatusPill label="Available" value={metrics.available.length} tone="slate" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 rounded-xl border border-dark-700 bg-dark-900/35 overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className={metrics.attention.some(a => a.level === 'critical') ? 'text-red-400' : 'text-amber-400'} />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Attention Required</h3>
                  </div>
                  <span className="text-xs text-slate-500">{metrics.attention.length}</span>
                </div>
                {metrics.attention.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">No P&M exceptions detected from available data.</div>
                ) : (
                  <div className="divide-y divide-dark-700/60">
                    {metrics.attention.map((item, idx) => (
                      <button key={`${item.title}-${idx}`} onClick={() => onNavigate?.(item.nav, item.extra || {})}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-dark-700/30 transition-colors group">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${item.level === 'critical' ? 'bg-red-500' : item.level === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{item.title}</p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.sub}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-700 group-hover:text-slate-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 rounded-xl border border-dark-700 bg-dark-900/35 overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={14} className="text-primary-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Project Deployment</h3>
                  </div>
                  <button onClick={() => onNavigate?.('projects')} className="text-[11px] text-primary-400 hover:text-primary-300">Projects</button>
                </div>
                {metrics.projectLoads.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">No equipment currently linked to projects.</div>
                ) : (
                  <div className="divide-y divide-dark-700/60">
                    {metrics.projectLoads.slice(0, 6).map((row, idx) => (
                      <button key={row.project?.id || idx} onClick={() => onNavigate?.('projects')}
                        className="w-full px-4 py-3 text-left hover:bg-dark-700/30 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-200 truncate">{row.project?.project_name || 'Unmapped project'}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{row.project?.project_code || row.project?.status || 'Active deployment'}</p>
                          </div>
                          <span className="text-sm font-bold text-primary-300">{row.equipment.length}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button onClick={() => onNavigate?.('maintenance')} className="rounded-xl border border-dark-700 bg-dark-900/35 p-4 text-left hover:border-amber-500/30 transition-colors">
                <div className="flex items-center gap-2 text-amber-400"><CalendarClock size={15} /><span className="text-xs font-semibold">Preventive Maintenance</span></div>
                <p className="text-lg font-bold text-slate-100 mt-2">{metrics.overduePm.length} overdue · {metrics.duePm.length} due soon</p>
                <p className="text-[11px] text-slate-500 mt-1">Due soon = within 50 HMR or 7 days</p>
              </button>
              <button onClick={() => onNavigate?.('operations')} className="rounded-xl border border-dark-700 bg-dark-900/35 p-4 text-left hover:border-blue-500/30 transition-colors">
                <div className="flex items-center gap-2 text-blue-400"><Fuel size={15} /><span className="text-xs font-semibold">Fuel Exceptions</span></div>
                <p className="text-lg font-bold text-slate-100 mt-2">{metrics.fuelVariance.length} above norm</p>
                <p className="text-[11px] text-slate-500 mt-1">Flagged when actual L/hr exceeds equipment norm by 15%+</p>
              </button>
              <button onClick={() => onNavigate?.('fleet', { filterUnloggedIds: metrics.notLoggedToday.map(e => e.id) })} className="rounded-xl border border-dark-700 bg-dark-900/35 p-4 text-left hover:border-red-500/30 transition-colors">
                <div className="flex items-center gap-2 text-red-400"><AlertTriangle size={15} /><span className="text-xs font-semibold">Daily Log Compliance</span></div>
                <p className="text-lg font-bold text-slate-100 mt-2">{metrics.notLoggedToday.length} not logged</p>
                <p className="text-[11px] text-slate-500 mt-1">Deployed machines without a shift or daily operation today</p>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
