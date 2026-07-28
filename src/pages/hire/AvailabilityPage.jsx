import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  format, getDaysInMonth, startOfMonth, endOfMonth,
  addMonths, subMonths, isToday, getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Truck } from 'lucide-react'

// ── Legend ────────────────────────────────────────────────────────────────────
const LEGEND = [
  { key: 'working',     label: 'Working',           bg: 'bg-emerald-500',       text: 'text-emerald-900' },
  { key: 'idle',        label: 'Idle',               bg: 'bg-amber-400',         text: 'text-amber-900' },
  { key: 'breakdown',   label: 'Breakdown',          bg: 'bg-red-500',           text: 'text-white' },
  { key: 'maintenance', label: 'Maintenance',        bg: 'bg-orange-400',        text: 'text-orange-900' },
  { key: 'deployed',    label: 'Deployed (no log)',  bg: 'bg-emerald-800/60',    text: '' },
  { key: 'available',   label: 'Available',          bg: 'bg-dark-700',          text: '' },
]

const CELL_BG = {
  working:     'bg-emerald-500',
  idle:        'bg-amber-400',
  breakdown:   'bg-red-500',
  maintenance: 'bg-orange-400',
  deployed:    'bg-emerald-800/60 border border-emerald-700/30',
  available:   'bg-dark-700',
}

// ── Day-of-week abbreviations ─────────────────────────────────────────────────
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa']

export default function AvailabilityPage() {
  const { companyId } = useAuth()
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [tooltip, setTooltip] = useState(null)   // { equipName, day, status }

  const monthStart  = format(currentMonth, 'yyyy-MM-dd')
  const monthEnd    = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
  const daysInMonth = getDaysInMonth(currentMonth)
  const dayNums     = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: equipment = [], isLoading: eqLoading } = useQuery({
    queryKey: ['equip_avail_list', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id, name, equipment_number, category, status')
        .eq('company_id', companyId)
        .order('name')
      return data || []
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  })

  // Deployments overlapping this month
  const { data: deployments = [] } = useQuery({
    queryKey: ['dep_avail', companyId, monthStart],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_deployments')
        .select('equipment_id, deployed_date, withdrawn_date, status')
        .eq('company_id', companyId)
        .lte('deployed_date', monthEnd)
        .or(`withdrawn_date.is.null,withdrawn_date.gte.${monthStart}`)
      return data || []
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  })

  // Daily ops for the month
  const { data: ops = [] } = useQuery({
    queryKey: ['ops_avail', companyId, monthStart],
    queryFn: async () => {
      const { data } = await supabase.from('daily_operations')
        .select('equipment_id, ops_date, status, running_hours, operator_name')
        .eq('company_id', companyId)
        .gte('ops_date', monthStart)
        .lte('ops_date', monthEnd)
      return data || []
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  })

  // ── Build lookup maps ─────────────────────────────────────────────────────────

  // opsMap[eqId][day] = { status, running_hours, operator_name }
  const opsMap = useMemo(() => {
    const m = {}
    for (const op of ops) {
      const day = new Date(op.ops_date).getDate()
      if (!m[op.equipment_id]) m[op.equipment_id] = {}
      // If multiple shifts same day, prefer 'working'
      if (!m[op.equipment_id][day] || op.status === 'working') {
        m[op.equipment_id][day] = { status: op.status, hours: op.running_hours, operator: op.operator_name }
      }
    }
    return m
  }, [ops])

  // deployedMap[eqId][day] = true
  const deployedMap = useMemo(() => {
    const m = {}
    const mthStart = currentMonth
    const mthEnd   = endOfMonth(currentMonth)

    for (const dep of deployments) {
      if (!m[dep.equipment_id]) m[dep.equipment_id] = {}

      const depDate = new Date(dep.deployed_date)
      const witDate = dep.withdrawn_date ? new Date(dep.withdrawn_date) : new Date()

      const overlapStart = depDate < mthStart ? mthStart : depDate
      const overlapEnd   = witDate > mthEnd   ? mthEnd   : witDate

      // iterate each day in overlap
      const cur = new Date(overlapStart)
      while (cur <= overlapEnd) {
        m[dep.equipment_id][cur.getDate()] = true
        cur.setDate(cur.getDate() + 1)
      }
    }
    return m
  }, [deployments, currentMonth])

  const cellStatus = (equipId, day) => {
    const op  = opsMap[equipId]?.[day]
    if (op) return op.status
    if (deployedMap[equipId]?.[day]) return 'deployed'
    return 'available'
  }

  const cellDetail = (equipId, day) => opsMap[equipId]?.[day] || null

  const now    = new Date()
  const isCurM = format(now, 'yyyy-MM') === format(currentMonth, 'yyyy-MM')

  // Summary counts for header stats
  const summary = useMemo(() => {
    const deployed   = new Set(deployments.map(d => d.equipment_id)).size
    const available  = equipment.length - deployed
    const breakdowns = equipment.filter(e => {
      return dayNums.some(d => cellStatus(e.id, d) === 'breakdown')
    }).length
    return { deployed, available, breakdowns }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployments, equipment, dayNums])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dark-900">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-dark-700">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-100">Equipment Availability</h1>
            <p className="text-xs text-slate-400 mt-0.5">Monthly swimlane — colour per daily status</p>
          </div>
          {/* Month nav */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-300 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-100 w-28 text-center tabular-nums">
              {format(currentMonth, 'MMM yyyy')}
            </span>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-300 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-3 text-xs">
          <span className="text-slate-400">
            <span className="font-bold text-emerald-400">{summary.deployed}</span> deployed
          </span>
          <span className="text-slate-400">
            <span className="font-bold text-slate-200">{summary.available}</span> available
          </span>
          {summary.breakdowns > 0 && (
            <span className="text-slate-400">
              <span className="font-bold text-red-400">{summary.breakdowns}</span> with breakdowns
            </span>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {LEGEND.map(l => (
            <div key={l.key} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded-sm ${l.bg}`} />
              <span className="text-[10px] text-slate-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Swimlane grid ── */}
      <div className="flex-1 overflow-auto">
        {eqLoading ? (
          <div className="p-4 space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-9 bg-dark-800 rounded-lg animate-pulse" />)}
          </div>
        ) : equipment.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <Truck className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400">No equipment found</p>
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3 min-w-max">

            {/* Day header */}
            <div className="flex" style={{ paddingLeft: '172px' }}>
              {dayNums.map(d => {
                const date    = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d)
                const dow     = DOW[getDay(date)]
                const isSun   = getDay(date) === 0
                const isTodayD = isCurM && d === now.getDate()
                return (
                  <div key={d} className={`w-6 flex-shrink-0 text-center ${isTodayD ? 'text-primary-400 font-bold' : isSun ? 'text-red-400/60' : 'text-slate-600'}`}>
                    <p className="text-[8px]">{dow}</p>
                    <p className="text-[9px]">{d}</p>
                  </div>
                )
              })}
            </div>

            {/* Equipment rows */}
            <div className="space-y-1 mt-1">
              {equipment.map(eq => (
                <div key={eq.id} className="flex items-center gap-1">
                  {/* Equipment label */}
                  <div className="w-44 shrink-0 pr-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-dark-700 flex items-center justify-center shrink-0">
                      <Truck className="w-3 h-3 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate leading-tight">{eq.name}</p>
                      <p className="text-[9px] text-slate-500 truncate">{eq.equipment_number || eq.category}</p>
                    </div>
                  </div>

                  {/* Day cells */}
                  {dayNums.map(d => {
                    const st     = cellStatus(eq.id, d)
                    const detail = cellDetail(eq.id, d)
                    const isTodayD = isCurM && d === now.getDate()
                    return (
                      <div
                        key={d}
                        className={`w-6 h-7 flex-shrink-0 rounded-sm cursor-default transition-opacity hover:opacity-80
                          ${CELL_BG[st] || 'bg-dark-700'}
                          ${isTodayD ? 'ring-1 ring-primary-500' : ''}`}
                        title={`${eq.name} — ${format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d), 'd MMM')}: ${st}${detail?.hours ? ` · ${detail.hours}h` : ''}${detail?.operator ? ` · ${detail.operator}` : ''}`}
                        onMouseEnter={() => setTooltip({ eq: eq.name, d, st, detail })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tooltip ── */}
      {tooltip && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-dark-700 border border-dark-500 rounded-xl px-4 py-2.5 shadow-2xl text-xs text-slate-200 pointer-events-none">
          <span className="font-semibold">{tooltip.eq}</span>
          <span className="text-slate-400 mx-1.5">—</span>
          <span>{format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), tooltip.d), 'd MMM yyyy')}</span>
          <span className={`ml-2 capitalize font-medium ${
            tooltip.st === 'working'     ? 'text-emerald-400'
            : tooltip.st === 'idle'     ? 'text-amber-400'
            : tooltip.st === 'breakdown'? 'text-red-400'
            : tooltip.st === 'maintenance'?'text-orange-400'
            : tooltip.st === 'deployed' ? 'text-emerald-600'
            : 'text-slate-500'
          }`}>{tooltip.st === 'deployed' ? 'Deployed (no log)' : tooltip.st}</span>
          {tooltip.detail?.hours && <span className="text-slate-400 ml-1.5">· {tooltip.detail.hours}h</span>}
          {tooltip.detail?.operator && <span className="text-slate-400 ml-1.5">· {tooltip.detail.operator}</span>}
        </div>
      )}
    </div>
  )
}
