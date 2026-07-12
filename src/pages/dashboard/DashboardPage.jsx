import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart,
} from 'recharts'
import {
  TrendingUp, Truck, Users, FileText, ShoppingCart,
  Clock, AlertCircle, CheckCircle, Activity, Wallet, Receipt,
  Calendar, Wrench, Package, BarChart3,
  X, ChevronRight,
} from 'lucide-react'
import { ROLES } from '../../lib/constants'

// ── Chart Palette ──────────────────────────────────────────────────────────────
const C = {
  billed:      '#3b82f6',
  collected:   '#10b981',
  expense:     '#f59e0b',
  shifts:      '#818cf8',
  hours:       '#22d3ee',
  active:      '#10b981',
  idle:        '#60a5fa',
  maintenance: '#fbbf24',
  breakdown:   '#f87171',
  present:     '#34d399',
  absent:      '#f87171',
  leave:       '#fbbf24',
  notMarked:   '#374151',
}

const FLEET_PIE = [C.active, C.idle, C.maintenance, C.breakdown]

const STATUS_BG = {
  paid:        'bg-emerald-500/15 text-emerald-400',
  partial:     'bg-amber-500/15 text-amber-400',
  overdue:     'bg-red-500/15 text-red-400',
  sent:        'bg-blue-500/15 text-blue-400',
  draft:       'bg-slate-500/15 text-slate-400',
  cancelled:   'bg-slate-500/10 text-slate-500',
  active:      'bg-emerald-500/15 text-emerald-400',
  idle:        'bg-blue-500/15 text-blue-400',
  breakdown:   'bg-red-500/15 text-red-400',
  maintenance: 'bg-amber-500/15 text-amber-400',
  open:        'bg-amber-500/15 text-amber-400',
  closed:      'bg-blue-500/15 text-blue-400',
  approved:    'bg-emerald-500/15 text-emerald-400',
  in_progress: 'bg-blue-500/15 text-blue-400',
  present:     'bg-emerald-500/15 text-emerald-400',
  absent:      'bg-red-500/15 text-red-400',
  leave:       'bg-amber-500/15 text-amber-400',
  pending:     'bg-amber-500/15 text-amber-400',
  confirmed:   'bg-emerald-500/15 text-emerald-400',
  delivered:   'bg-emerald-500/15 text-emerald-400',
}

const STATUS_COLOR = {
  paid: 'text-emerald-400', partial: 'text-amber-400', overdue: 'text-red-400',
  sent: 'text-blue-400', draft: 'text-slate-400', cancelled: 'text-slate-500',
  open: 'text-amber-400', closed: 'text-blue-400', approved: 'text-emerald-400',
  active: 'text-emerald-400', idle: 'text-blue-400', breakdown: 'text-red-400', maintenance: 'text-amber-400',
  present: 'text-emerald-400', absent: 'text-red-400', leave: 'text-amber-400',
  pending: 'text-amber-400', accepted: 'text-emerald-400', rejected: 'text-red-400',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getRange(period) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  if (period === 'today') { const t = fmt(now); return { from: t, to: t } }
  if (period === 'week') {
    const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
    return { from: fmt(mon), to: fmt(now) }
  }
  return { from: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`, to: fmt(now) }
}

const fmtINRShort = (n) => {
  n = Number(n || 0)
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`
  if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`
  if (n >= 1000)     return `₹${(n/1000).toFixed(1)}K`
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function buildTimeline(from, to, series) {
  const result = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) {
    const key = cur.toISOString().substring(0, 10)
    const label = new Date(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    const entry = { date: key, label }
    series.forEach(s => { entry[s.key] = s.map[key] || 0 })
    result.push(entry)
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

function sumByDate(items, dateField, valueField) {
  const map = {}
  items.forEach(item => {
    const d = (item[dateField] || '').substring(0, 10)
    if (d) map[d] = (map[d] || 0) + Number(item[valueField] || 0)
  })
  return map
}

function countByDate(items, dateField) {
  const map = {}
  items.forEach(item => {
    const d = (item[dateField] || '').substring(0, 10)
    if (d) map[d] = (map[d] || 0) + 1
  })
  return map
}

function thinTicks(data, maxTicks = 10) {
  if (data.length <= maxTicks) return data.map(d => d.date)
  const step = Math.ceil(data.length / maxTicks)
  return data.filter((_, i) => i % step === 0).map(d => d.date)
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, moneyKeys = [] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a2236] border border-[#2d3748] rounded-xl p-3 shadow-2xl text-xs z-50">
      <p className="text-slate-400 mb-2 font-semibold">{label}</p>
      {payload.map((p, i) => {
        const isMoney = moneyKeys.includes(p.dataKey)
        const color = (p.fill && p.fill !== 'none') ? p.fill : p.stroke
        return (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-slate-400">{p.name}:</span>
            <span className="text-slate-100 font-bold">
              {isMoney ? fmtINRShort(p.value) : p.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PieTip({ active, payload }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#1a2236] border border-[#2d3748] rounded-xl px-3 py-2 text-xs shadow-2xl">
      <span style={{ color: d.color }} className="font-bold">{d.name}</span>
      <span className="text-slate-300 ml-2 font-semibold">{d.value}</span>
    </div>
  )
}

// ── Chart Axis Defaults ────────────────────────────────────────────────────────
const axTick  = { fill: '#64748b', fontSize: 11 }
const axLine  = { stroke: '#2d3748' }
const gridDash = { strokeDasharray: '3 3', stroke: '#2d3748' }

// ── Section Card wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, action, children, className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ title, onClose, onNavigate, navKey, navLabel, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-dark-800 border-l border-dark-700 flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <div className="flex items-center gap-2">
            {navKey && onNavigate && (
              <button
                onClick={() => { onClose(); onNavigate(navKey) }}
                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                {navLabel || 'View All'} <ChevronRight size={13} />
              </button>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'primary', onClick }) {
  const colors = {
    primary: 'text-primary-400 bg-primary-500/10',
    green:   'text-emerald-400 bg-emerald-500/10',
    amber:   'text-amber-400   bg-amber-500/10',
    red:     'text-red-400     bg-red-500/10',
    blue:    'text-blue-400    bg-blue-500/10',
    purple:  'text-purple-400  bg-purple-500/10',
  }
  return (
    <button
      onClick={onClick}
      className={`card p-4 flex items-start gap-3 text-left w-full transition-all ${
        onClick ? 'hover:border-primary-500/40 hover:bg-dark-700/60 cursor-pointer active:scale-[0.98]' : 'cursor-default'
      }`}
    >
      <div className={`p-2 rounded-lg shrink-0 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className="text-xl font-semibold text-slate-100 mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
      {onClick && <ChevronRight size={14} className="text-slate-600 mt-1 shrink-0" />}
    </button>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-slate-400" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
    </div>
  )
}

// ── Detail Row ─────────────────────────────────────────────────────────────────
function DetailRow({ title, sub, value, badge, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg bg-dark-700/50 border border-dark-700 ${onClick ? 'hover:border-primary-500/40 hover:bg-dark-700 cursor-pointer' : ''}`}
    >
      <div className="text-left min-w-0">
        <p className="text-sm text-slate-200 truncate">{title}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      <div className="text-right shrink-0 ml-3">
        {value && <p className="text-sm font-medium text-slate-100">{value}</p>}
        {badge && <p className={`text-xs capitalize ${STATUS_COLOR[badge] || 'text-slate-400'}`}>{badge}</p>}
      </div>
    </Tag>
  )
}

// ── Status Badge ───────────────────────────────────────────────────────────────
function Badge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${STATUS_BG[status] || 'bg-slate-500/15 text-slate-400'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA HOOKS (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function useInvoiceData(companyId, range) {
  return useQuery({
    queryKey: ['dash_invoices', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices')
        .select('id,invoice_number,client_name,total_amount,paid_amount,balance_due,status,invoice_date,due_date')
        .eq('company_id', companyId)
        .neq('invoice_type', 'proforma')
        .gte('invoice_date', range.from).lte('invoice_date', range.to)
        .order('invoice_date', { ascending: false })
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })
}

function useBillData(companyId, range) {
  return useQuery({
    queryKey: ['dash_bills', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('bills')
        .select('id,bill_number,vendor_name,total_amount,balance_due,status,bill_date,due_date')
        .eq('company_id', companyId)
        .gte('bill_date', range.from).lte('bill_date', range.to)
        .order('bill_date', { ascending: false })
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })
}

function useShiftData(companyId, range) {
  return useQuery({
    queryKey: ['dash_shifts', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('id,status,shift_date,equipment_name,operator_name,working_hours,fuel_filled')
        .eq('company_id', companyId)
        .gte('shift_date', range.from).lte('shift_date', range.to)
        .order('shift_date', { ascending: false })
      return data || []
    },
    staleTime: 30_000, enabled: !!companyId,
  })
}

function useEquipmentData(companyId) {
  return useQuery({
    queryKey: ['dash_equipment', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id,name,equipment_number,status,category').eq('company_id', companyId)
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })
}

function useEmployeeData(companyId) {
  return useQuery({
    queryKey: ['dash_employees', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id,name,designation,department,is_active,employment_type').eq('company_id', companyId)
      return data || []
    },
    staleTime: 120_000, enabled: !!companyId,
  })
}

function useAttendanceData(companyId, date) {
  return useQuery({
    queryKey: ['dash_attendance', companyId, date],
    queryFn: async () => {
      const { data } = await supabase.from('hr_attendance')
        .select('id,status,employee_id')
        .eq('company_id', companyId).eq('attendance_date', date)
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })
}

function useQuoteData(companyId, range) {
  return useQuery({
    queryKey: ['dash_quotes', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('quotes')
        .select('id,quote_number,client_name,total_amount,status,quote_date')
        .eq('company_id', companyId)
        .gte('quote_date', range.from).lte('quote_date', range.to)
        .order('quote_date', { ascending: false })
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })
}

function usePOData(companyId, range) {
  return useQuery({
    queryKey: ['dash_po', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_orders')
        .select('id,po_number,vendor_name,total_amount,status,po_date')
        .eq('company_id', companyId)
        .gte('po_date', range.from).lte('po_date', range.to)
        .order('po_date', { ascending: false })
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Revenue vs Expense ComposedChart (Bar billed + Bar bills + Line collected)
function RevenueExpenseChart({ invoices, bills, range }) {
  const billedMap    = useMemo(() => sumByDate(invoices, 'invoice_date', 'total_amount'),  [invoices])
  const collectedMap = useMemo(() => sumByDate(invoices, 'invoice_date', 'paid_amount'),   [invoices])
  const expenseMap   = useMemo(() => sumByDate(bills,    'bill_date',    'total_amount'),  [bills])

  const data = useMemo(() => buildTimeline(range.from, range.to, [
    { key: 'billed',    map: billedMap },
    { key: 'collected', map: collectedMap },
    { key: 'expense',   map: expenseMap },
  ]), [range, billedMap, collectedMap, expenseMap])

  const hasData = data.some(d => d.billed > 0 || d.collected > 0 || d.expense > 0)
  const ticks   = thinTicks(data)

  if (!hasData) return (
    <div className="flex items-center justify-center h-48 text-slate-500 text-sm">No financial data for this period</div>
  )

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridDash} vertical={false} />
        <XAxis
          dataKey="date" ticks={ticks}
          tickFormatter={v => new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          tick={axTick} axisLine={axLine} tickLine={false}
        />
        <YAxis tickFormatter={fmtINRShort} tick={axTick} axisLine={false} tickLine={false} width={52} />
        <Tooltip content={<ChartTip moneyKeys={['billed', 'collected', 'expense']} />} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} iconType="circle" iconSize={8} />
        <Bar dataKey="billed"    name="Billed"     fill={C.billed}    radius={[3,3,0,0]} maxBarSize={28} />
        <Bar dataKey="expense"   name="Bills"      fill={C.expense}   radius={[3,3,0,0]} maxBarSize={28} />
        <Line type="monotone" dataKey="collected" name="Collected" stroke={C.collected} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// Fleet Status Donut
function FleetDonut({ equipment }) {
  const counts = useMemo(() => equipment.reduce((acc, e) => {
    const s = e.status || 'idle'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {}), [equipment])

  const data = [
    { name: 'Active',      value: counts.active      || 0, color: C.active },
    { name: 'Idle',        value: counts.idle         || 0, color: C.idle },
    { name: 'Maintenance', value: counts.maintenance  || 0, color: C.maintenance },
    { name: 'Breakdown',   value: counts.breakdown    || 0, color: C.breakdown },
  ].filter(d => d.value > 0)

  if (!data.length) return (
    <div className="flex items-center justify-center h-36 text-slate-500 text-sm">No equipment registered</div>
  )

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={68}
            dataKey="value" paddingAngle={3}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip content={<PieTip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-slate-400">{d.name}</span>
            <span className="text-slate-100 font-bold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Shift Activity ComposedChart (Bar shifts + Line hours)
function ShiftActivityChart({ shifts, range }) {
  const closedShifts = useMemo(() => shifts.filter(s => s.status !== 'open'), [shifts])
  const shiftCountMap = useMemo(() => countByDate(closedShifts, 'shift_date'), [closedShifts])
  const hoursMap      = useMemo(() => sumByDate(shifts, 'shift_date', 'working_hours'), [shifts])

  const data = useMemo(() => buildTimeline(range.from, range.to, [
    { key: 'shifts', map: shiftCountMap },
    { key: 'hours',  map: hoursMap },
  ]), [range, shiftCountMap, hoursMap])

  const hasData = data.some(d => d.shifts > 0 || d.hours > 0)
  const ticks   = thinTicks(data)

  if (!hasData) return (
    <div className="flex items-center justify-center h-48 text-slate-500 text-sm">No shift data for this period</div>
  )

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridDash} vertical={false} />
        <XAxis
          dataKey="date" ticks={ticks}
          tickFormatter={v => new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          tick={axTick} axisLine={axLine} tickLine={false}
        />
        <YAxis yAxisId="left"  allowDecimals={false} tick={axTick} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={axTick} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} iconType="circle" iconSize={8} />
        <Bar yAxisId="left" dataKey="shifts" name="Shifts" fill={C.shifts} radius={[3,3,0,0]} maxBarSize={28} />
        <Line yAxisId="right" type="monotone" dataKey="hours" name="Hours" stroke={C.hours} strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// Equipment Hours horizontal bar chart
function EquipmentHoursChart({ shifts }) {
  const data = useMemo(() => {
    const map = {}
    shifts.forEach(s => {
      const n = s.equipment_name || 'Unknown'
      map[n] = (map[n] || 0) + Number(s.working_hours || 0)
    })
    return Object.entries(map)
      .map(([name, hours]) => ({
        name: name.length > 18 ? name.substring(0, 18) + '…' : name,
        hours: Number(hours.toFixed(1)),
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8)
  }, [shifts])

  if (!data.length) return (
    <div className="flex items-center justify-center h-24 text-slate-500 text-sm">No shift hours data</div>
  )

  return (
    <ResponsiveContainer width="100%" height={Math.max(100, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridDash} horizontal={false} />
        <XAxis type="number" tick={axTick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
        <Tooltip content={<ChartTip />} />
        <Bar dataKey="hours" name="Hours" fill={C.hours} radius={[0,3,3,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Attendance Ring Donut
function AttendanceRing({ attendance, employees }) {
  const active = employees.filter(e => e.is_active).length
  const present   = attendance.filter(a => a.status === 'present').length
  const absent    = attendance.filter(a => a.status === 'absent').length
  const onLeave   = attendance.filter(a => a.status === 'leave').length
  const notMarked = Math.max(0, active - attendance.length)

  const data = [
    { name: 'Present',    value: present,   color: C.present },
    { name: 'Absent',     value: absent,    color: C.absent },
    { name: 'Leave',      value: onLeave,   color: C.leave },
    { name: 'Not Marked', value: notMarked, color: C.notMarked },
  ].filter(d => d.value > 0)

  if (!data.length) return (
    <div className="flex items-center justify-center h-36 text-slate-500 text-sm">No attendance marked yet</div>
  )

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={60}
              dataKey="value" paddingAngle={2}
            >
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip content={<PieTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-slate-100">{present}</span>
          <span className="text-[10px] text-slate-500">present</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
            <span className="text-slate-400">{d.name}:</span>
            <span className="text-slate-100 font-bold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Th({ children, right }) {
  return (
    <th className={`text-slate-500 font-semibold text-[11px] pb-2 pr-3 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, mono, dim, className = '' }) {
  return (
    <td className={`py-2 pr-3 text-xs ${right ? 'text-right' : ''} ${mono ? 'font-mono' : ''} ${dim ? 'text-slate-500' : 'text-slate-200'} ${className}`}>
      {children}
    </td>
  )
}

function InvoiceTable({ invoices, onNavigate }) {
  if (!invoices.length) return (
    <p className="text-sm text-slate-500 text-center py-8">No invoices this period</p>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-700">
            <Th>Client</Th>
            <Th>Invoice #</Th>
            <Th right>Billed</Th>
            <Th right>Balance</Th>
            <Th>Due Date</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {invoices.slice(0, 8).map(inv => (
            <tr key={inv.id} className="border-b border-dark-700/40 hover:bg-dark-700/30 transition-colors">
              <Td className="font-medium max-w-[130px] truncate">{inv.client_name || '—'}</Td>
              <Td dim>{inv.invoice_number}</Td>
              <Td right>{fmtINRShort(inv.total_amount)}</Td>
              <td className={`py-2 pr-3 text-xs text-right font-semibold ${Number(inv.balance_due) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {fmtINRShort(inv.balance_due)}
              </td>
              <Td dim>{fmtDate(inv.due_date)}</Td>
              <td className="py-2 pr-3"><Badge status={inv.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {invoices.length > 8 && (
        <p className="text-xs text-slate-500 text-right mt-2">{invoices.length - 8} more…</p>
      )}
    </div>
  )
}

function BillsTable({ bills }) {
  if (!bills.length) return (
    <p className="text-sm text-slate-500 text-center py-6">No bills this period</p>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-700">
            <Th>Vendor</Th>
            <Th>Bill #</Th>
            <Th right>Amount</Th>
            <Th right>Balance</Th>
            <Th>Due</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {bills.slice(0, 6).map(b => (
            <tr key={b.id} className="border-b border-dark-700/40 hover:bg-dark-700/30 transition-colors">
              <Td className="font-medium max-w-[130px] truncate">{b.vendor_name || '—'}</Td>
              <Td dim>{b.bill_number}</Td>
              <Td right>{fmtINRShort(b.total_amount)}</Td>
              <td className={`py-2 pr-3 text-xs text-right font-semibold ${Number(b.balance_due) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {fmtINRShort(b.balance_due)}
              </td>
              <Td dim>{fmtDate(b.due_date)}</Td>
              <td className="py-2 pr-3"><Badge status={b.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FleetUtilizationTable({ equipment, shifts }) {
  const eqStats = useMemo(() => {
    const map = {}
    shifts.forEach(s => {
      const n = s.equipment_name || 'Unknown'
      if (!map[n]) map[n] = { shifts: 0, hours: 0, lastDate: null }
      map[n].shifts++
      map[n].hours += Number(s.working_hours || 0)
      if (!map[n].lastDate || s.shift_date > map[n].lastDate) map[n].lastDate = s.shift_date
    })
    return map
  }, [shifts])

  const rows = useMemo(() =>
    equipment.map(e => ({ ...e, stats: eqStats[e.name] || { shifts: 0, hours: 0, lastDate: null } }))
  , [equipment, eqStats])

  if (!rows.length) return (
    <p className="text-sm text-slate-500 text-center py-6">No equipment registered</p>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-700">
            <Th>Equipment</Th>
            <Th>Status</Th>
            <Th right>Shifts</Th>
            <Th right>Hours</Th>
            <Th>Last Active</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(e => (
            <tr key={e.id} className="border-b border-dark-700/40 hover:bg-dark-700/30 transition-colors">
              <td className="py-2 pr-3">
                <p className="text-xs font-semibold text-slate-100">{e.name}</p>
                <p className="text-[11px] text-slate-500">{e.equipment_number || e.category || '—'}</p>
              </td>
              <td className="py-2 pr-3"><Badge status={e.status || 'idle'} /></td>
              <Td right>{e.stats.shifts}</Td>
              <td className="py-2 pr-3 text-xs text-right font-semibold" style={{ color: e.stats.hours > 0 ? C.hours : '#64748b' }}>
                {e.stats.hours.toFixed(1)}h
              </td>
              <Td dim>{fmtDate(e.stats.lastDate) || 'No shifts'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmployeeTable({ employees, attendance }) {
  const attMap = useMemo(() => {
    const m = {}
    attendance.forEach(a => { m[a.employee_id] = a.status })
    return m
  }, [attendance])

  if (!employees.length) return (
    <p className="text-sm text-slate-500 text-center py-6">No employees registered</p>
  )

  return (
    <div className="overflow-x-auto max-h-56 overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-dark-800 z-10">
          <tr className="border-b border-dark-700">
            <Th>Name</Th>
            <Th>Designation</Th>
            <Th>Dept</Th>
            <Th>Today</Th>
          </tr>
        </thead>
        <tbody>
          {employees.map(e => (
            <tr key={e.id} className="border-b border-dark-700/40 hover:bg-dark-700/30 transition-colors">
              <Td className="font-medium">{e.name}</Td>
              <Td dim>{e.designation || '—'}</Td>
              <Td dim>{e.department || '—'}</Td>
              <td className="py-2 pr-3">
                {attMap[e.id] ? <Badge status={attMap[e.id]} /> : <span className="text-[11px] text-slate-600">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ShiftLogTable({ shifts }) {
  if (!shifts.length) return (
    <p className="text-sm text-slate-500 text-center py-6">No shifts this period</p>
  )
  return (
    <div className="overflow-x-auto max-h-56 overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-dark-800 z-10">
          <tr className="border-b border-dark-700">
            <Th>Equipment</Th>
            <Th>Operator</Th>
            <Th>Date</Th>
            <Th right>Hours</Th>
            <Th right>Fuel (L)</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {shifts.slice(0, 12).map(s => (
            <tr key={s.id} className="border-b border-dark-700/40 hover:bg-dark-700/30 transition-colors">
              <Td className="font-medium max-w-[110px] truncate">{s.equipment_name || '—'}</Td>
              <Td dim>{s.operator_name || '—'}</Td>
              <Td dim>{fmtDate(s.shift_date)}</Td>
              <Td right>{s.working_hours ? s.working_hours + 'h' : '—'}</Td>
              <Td right dim>{s.fuel_filled || '—'}</Td>
              <td className="py-2 pr-3"><Badge status={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FinancialsSection({ companyId, range, onNavigate }) {
  const [panel, setPanel] = useState(null)
  const { data: invoices = [] } = useInvoiceData(companyId, range)
  const { data: bills = [] }    = useBillData(companyId, range)

  const revenue        = invoices.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0)
  const outstanding    = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
  const outstandingAmt = outstanding.reduce((s, i) => s + (Number(i.balance_due) || 0), 0)
  const overdue        = invoices.filter(i => i.status === 'overdue')
  const billsPending   = bills.filter(b => b.status !== 'paid' && b.status !== 'cancelled')
  const billsDue       = billsPending.reduce((s, b) => s + (Number(b.balance_due) || 0), 0)
  const totalBilled    = invoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
  const net            = revenue - billsDue

  return (
    <>
      <Section icon={Wallet} title="Financials">
        <KpiCard icon={TrendingUp}   label="Revenue Collected"  value={fmtINRShort(revenue)}       sub={`of ${fmtINRShort(totalBilled)} billed`}         color="green"  onClick={() => setPanel('revenue')} />
        <KpiCard icon={Receipt}      label="Outstanding"        value={fmtINRShort(outstandingAmt)} sub={overdue.length > 0 ? `${overdue.length} overdue` : `${outstanding.length} invoices`} color={overdue.length > 0 ? 'red' : 'amber'} onClick={() => setPanel('outstanding')} />
        <KpiCard icon={ShoppingCart} label="Bills Due"          value={fmtINRShort(billsDue)}       sub={`${billsPending.length} pending`}                 color="amber"  onClick={() => setPanel('bills')} />
        <KpiCard icon={BarChart3}    label="Net"                value={fmtINRShort(Math.abs(net))}  sub={net >= 0 ? 'net positive' : 'net negative'}       color={net >= 0 ? 'green' : 'red'} />
      </Section>

      {/* Revenue vs Expense Chart */}
      <ChartCard title="Revenue vs Expenses (Daily)">
        <RevenueExpenseChart invoices={invoices} bills={bills} range={range} />
      </ChartCard>

      {/* Invoice + Bills tables side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Recent Invoices"
          action={
            <button onClick={() => onNavigate?.('sales')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
              View All <ChevronRight size={12} />
            </button>
          }
        >
          <InvoiceTable invoices={invoices} />
        </ChartCard>

        <ChartCard
          title="Bills"
          action={
            <button onClick={() => onNavigate?.('purchase')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
              View All <ChevronRight size={12} />
            </button>
          }
        >
          <BillsTable bills={bills} />
        </ChartCard>
      </div>

      {/* Detail panels */}
      {panel === 'revenue' && (
        <DetailPanel title="Invoices" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="sales" navLabel="Go to Sales">
          {invoices.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No invoices this period</p>
            : invoices.map(inv => (
              <DetailRow key={inv.id}
                title={inv.client_name || inv.invoice_number}
                sub={`${inv.invoice_number} · ${fmtDate(inv.invoice_date)}`}
                value={fmtINRShort(inv.total_amount)}
                badge={inv.status}
              />
            ))
          }
        </DetailPanel>
      )}
      {panel === 'outstanding' && (
        <DetailPanel title="Outstanding Invoices" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="sales" navLabel="Go to Sales">
          {outstanding.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">All invoices settled</p>
            : outstanding.map(inv => (
              <DetailRow key={inv.id}
                title={inv.client_name || inv.invoice_number}
                sub={`${inv.invoice_number} · Due ${fmtDate(inv.due_date)}`}
                value={fmtINRShort(inv.balance_due)}
                badge={inv.status}
              />
            ))
          }
        </DetailPanel>
      )}
      {panel === 'bills' && (
        <DetailPanel title="Bills Due" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="purchase" navLabel="Go to Purchase">
          {billsPending.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No pending bills</p>
            : billsPending.map(b => (
              <DetailRow key={b.id}
                title={b.vendor_name || b.bill_number}
                sub={`${b.bill_number} · Due ${fmtDate(b.due_date)}`}
                value={fmtINRShort(b.balance_due)}
                badge={b.status}
              />
            ))
          }
        </DetailPanel>
      )}
    </>
  )
}

function OperationsSection({ companyId, range, onNavigate }) {
  const [panel, setPanel] = useState(null)
  const { data: shifts    = [] } = useShiftData(companyId, range)
  const { data: equipment = [] } = useEquipmentData(companyId)

  const { data: maintenance = [] } = useQuery({
    queryKey: ['dash_maint', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('maintenance_records')
        .select('id,title,status,equipment_id').eq('company_id', companyId)
        .in('status', ['open', 'in_progress'])
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })

  const openShifts = shifts.filter(s => s.status === 'open')
  const totalHours = shifts.reduce((s, sh) => s + (Number(sh.working_hours) || 0), 0)
  const totalFuel  = shifts.reduce((s, sh) => s + (Number(sh.fuel_filled)  || 0), 0)
  const eqByStatus = equipment.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc }, {})

  return (
    <>
      <Section icon={Activity} title="Equipment & Operations">
        <KpiCard icon={Clock}   label="Open Shifts"      value={openShifts.length}               sub={`${shifts.length} total this period`}               color="amber"  onClick={() => setPanel('shifts')} />
        <KpiCard icon={Truck}   label="Fleet Status"     value={`${eqByStatus.active||0}/${equipment.length}`} sub={(eqByStatus.breakdown||0) > 0 ? `${eqByStatus.breakdown} breakdown` : 'active'} color={(eqByStatus.breakdown||0) > 0 ? 'red' : 'green'} onClick={() => setPanel('equipment')} />
        <KpiCard icon={Activity} label="Hours Logged"    value={totalHours.toFixed(1) + 'h'}     sub={totalFuel > 0 ? `${totalFuel.toFixed(0)} L fuel` : `${shifts.length} shifts`} color="blue"   onClick={() => setPanel('shifts')} />
        <KpiCard icon={Wrench}  label="Open Maintenance" value={maintenance.length}               sub={maintenance.length > 0 ? 'needs attention' : 'all clear'} color={maintenance.length > 0 ? 'red' : 'green'} onClick={() => setPanel('maintenance')} />
      </Section>

      {/* Shift Activity + Fleet Donut */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Shift Activity (Daily)" className="md:col-span-2">
          <ShiftActivityChart shifts={shifts} range={range} />
        </ChartCard>
        <ChartCard title="Fleet Status">
          <FleetDonut equipment={equipment} />
        </ChartCard>
      </div>

      {/* Equipment Utilization Table + Hours Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Equipment Utilization">
          <FleetUtilizationTable equipment={equipment} shifts={shifts} />
        </ChartCard>
        <ChartCard title="Hours by Machine (this period)">
          <EquipmentHoursChart shifts={shifts} />
        </ChartCard>
      </div>

      {/* Shift Log Table */}
      <ChartCard
        title="Shift Log"
        action={
          <button onClick={() => onNavigate?.('operations')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
            View All <ChevronRight size={12} />
          </button>
        }
      >
        <ShiftLogTable shifts={shifts} />
      </ChartCard>

      {/* Detail panels */}
      {panel === 'shifts' && (
        <DetailPanel title="Shifts" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="operations" navLabel="Go to Operations">
          {shifts.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No shifts this period</p>
            : shifts.map(s => (
              <DetailRow key={s.id}
                title={s.equipment_name || 'Equipment'}
                sub={`${s.operator_name || 'Operator'} · ${fmtDate(s.shift_date)}`}
                value={s.working_hours ? s.working_hours + 'h' : '—'}
                badge={s.status}
              />
            ))
          }
        </DetailPanel>
      )}
      {panel === 'equipment' && (
        <DetailPanel title="Fleet" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="fleet" navLabel="Go to Fleet">
          {equipment.map(e => (
            <DetailRow key={e.id}
              title={e.name}
              sub={`${e.equipment_number || ''} · ${e.category || ''}`}
              badge={e.status}
            />
          ))}
        </DetailPanel>
      )}
      {panel === 'maintenance' && (
        <DetailPanel title="Open Maintenance" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="maintenance" navLabel="Go to Maintenance">
          {maintenance.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No open maintenance issues</p>
            : maintenance.map(m => (
              <DetailRow key={m.id} title={m.title || 'Maintenance'} badge={m.status} />
            ))
          }
        </DetailPanel>
      )}
    </>
  )
}

function HRSection({ companyId, range, onNavigate }) {
  const [panel, setPanel] = useState(null)
  const today = range.to
  const { data: employees  = [] } = useEmployeeData(companyId)
  const { data: attendance = [] } = useAttendanceData(companyId, today)

  const { data: leaves = [] } = useQuery({
    queryKey: ['dash_leaves', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('leave_requests')
        .select('id,employee_name,from_date,to_date,status,leave_type')
        .eq('company_id', companyId).eq('status', 'pending')
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })

  const active  = employees.filter(e => e.is_active)
  const present = attendance.filter(a => a.status === 'present')
  const absent  = attendance.filter(a => a.status === 'absent')
  const onLeave = attendance.filter(a => a.status === 'leave')

  return (
    <>
      <Section icon={Users} title="HR & Attendance">
        <KpiCard icon={Users}       label="Total Employees" value={active.length}                  sub="active headcount"               color="blue"   onClick={() => setPanel('employees')} />
        <KpiCard icon={CheckCircle} label="Present Today"   value={present.length}                 sub={attendance.length > 0 ? `of ${attendance.length} marked` : 'not marked yet'} color="green" onClick={() => setPanel('attendance')} />
        <KpiCard icon={AlertCircle} label="Absent / Leave"  value={absent.length + onLeave.length} sub={onLeave.length > 0 ? `${onLeave.length} on leave` : 'today'} color={(absent.length + onLeave.length) > 0 ? 'amber' : 'green'} onClick={() => setPanel('attendance')} />
        <KpiCard icon={Calendar}    label="Leave Requests"  value={leaves.length}                  sub="pending approval"               color={leaves.length > 0 ? 'amber' : 'green'} onClick={() => setPanel('leaves')} />
      </Section>

      {/* Attendance ring + Employee table */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title={`Attendance · ${fmtDate(today)}`}>
          <AttendanceRing attendance={attendance} employees={active} />
        </ChartCard>
        <ChartCard title="Staff Directory" className="md:col-span-2"
          action={
            <button onClick={() => onNavigate?.('hr')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
              HR Module <ChevronRight size={12} />
            </button>
          }
        >
          <EmployeeTable employees={active} attendance={attendance} />
        </ChartCard>
      </div>

      {/* Detail panels */}
      {panel === 'employees' && (
        <DetailPanel title="Employees" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="hr" navLabel="Go to HR">
          {active.map(e => (
            <DetailRow key={e.id}
              title={e.name}
              sub={`${e.designation || ''} · ${e.department || ''}`}
              badge={e.employment_type}
            />
          ))}
        </DetailPanel>
      )}
      {panel === 'attendance' && (
        <DetailPanel title={`Attendance — ${fmtDate(today)}`} onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="hr" navLabel="Go to HR">
          {attendance.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No attendance marked for today</p>
            : attendance.map(a => {
              const emp = employees.find(e => e.id === a.employee_id)
              return (
                <DetailRow key={a.id}
                  title={emp?.name || 'Employee'}
                  sub={emp?.designation || ''}
                  badge={a.status}
                />
              )
            })
          }
        </DetailPanel>
      )}
      {panel === 'leaves' && (
        <DetailPanel title="Pending Leave Requests" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="hr" navLabel="Go to HR">
          {leaves.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No pending leave requests</p>
            : leaves.map(l => (
              <DetailRow key={l.id}
                title={l.employee_name || 'Employee'}
                sub={`${l.leave_type || 'Leave'} · ${fmtDate(l.from_date)} → ${fmtDate(l.to_date)}`}
                badge={l.status}
              />
            ))
          }
        </DetailPanel>
      )}
    </>
  )
}

function SalesSection({ companyId, range, onNavigate }) {
  const [panel, setPanel] = useState(null)
  const { data: quotes = [] } = useQuoteData(companyId, range)
  const { data: pos    = [] } = usePOData(companyId, range)

  const { data: salesOrders = [] } = useQuery({
    queryKey: ['dash_so', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders')
        .select('id,so_number,client_name,total_amount,status,so_date')
        .eq('company_id', companyId)
        .gte('so_date', range.from).lte('so_date', range.to)
        .order('so_date', { ascending: false })
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })

  const openQuotes = quotes.filter(q => ['sent', 'draft'].includes(q.status))
  const openSOs    = salesOrders.filter(o => !['delivered', 'cancelled'].includes(o.status))
  const pendingPOs = pos.filter(p => ['sent', 'draft', 'confirmed'].includes(p.status))
  const poValue    = pos.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)

  return (
    <>
      <Section icon={FileText} title="Sales & Purchase">
        <KpiCard icon={FileText}     label="Open Quotes"   value={openQuotes.length}  sub={`${quotes.length} total this period`} color="blue"    onClick={() => setPanel('quotes')} />
        <KpiCard icon={TrendingUp}   label="Sales Orders"  value={openSOs.length}     sub="in progress"                          color="primary" onClick={() => setPanel('so')} />
        <KpiCard icon={ShoppingCart} label="Pending POs"   value={pendingPOs.length}  sub={fmtINRShort(poValue) + ' value'}      color="amber"   onClick={() => setPanel('po')} />
        <KpiCard icon={Package}      label="PO Value"      value={fmtINRShort(poValue)} sub={`${pos.length} orders`}             color="purple"  onClick={() => setPanel('po')} />
      </Section>

      {/* Quotes + Sales Orders tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Quotes"
          action={<button onClick={() => onNavigate?.('sales')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">Sales <ChevronRight size={12} /></button>}
        >
          {quotes.length === 0
            ? <p className="text-sm text-slate-500 text-center py-6">No quotes this period</p>
            : <div className="overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-dark-700"><Th>Client</Th><Th dim>Quote #</Th><Th right>Amount</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {quotes.slice(0, 6).map(q => (
                    <tr key={q.id} className="border-b border-dark-700/40 hover:bg-dark-700/30 transition-colors">
                      <Td className="font-medium max-w-[120px] truncate">{q.client_name || '—'}</Td>
                      <Td dim>{q.quote_number}</Td>
                      <Td right>{fmtINRShort(q.total_amount)}</Td>
                      <td className="py-2 pr-3"><Badge status={q.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
          }
        </ChartCard>

        <ChartCard title="Purchase Orders"
          action={<button onClick={() => onNavigate?.('purchase')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">Purchase <ChevronRight size={12} /></button>}
        >
          {pos.length === 0
            ? <p className="text-sm text-slate-500 text-center py-6">No purchase orders this period</p>
            : <div className="overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-dark-700"><Th>Vendor</Th><Th dim>PO #</Th><Th right>Amount</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {pos.slice(0, 6).map(p => (
                    <tr key={p.id} className="border-b border-dark-700/40 hover:bg-dark-700/30 transition-colors">
                      <Td className="font-medium max-w-[120px] truncate">{p.vendor_name || '—'}</Td>
                      <Td dim>{p.po_number}</Td>
                      <Td right>{fmtINRShort(p.total_amount)}</Td>
                      <td className="py-2 pr-3"><Badge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
          }
        </ChartCard>
      </div>

      {/* Detail panels */}
      {panel === 'quotes' && (
        <DetailPanel title="Quotes" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="sales" navLabel="Go to Sales">
          {quotes.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No quotes this period</p>
            : quotes.map(q => (
              <DetailRow key={q.id}
                title={q.client_name || q.quote_number}
                sub={`${q.quote_number} · ${fmtDate(q.quote_date)}`}
                value={fmtINRShort(q.total_amount)}
                badge={q.status}
              />
            ))
          }
        </DetailPanel>
      )}
      {panel === 'so' && (
        <DetailPanel title="Sales Orders" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="sales" navLabel="Go to Sales">
          {salesOrders.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No sales orders this period</p>
            : salesOrders.map(o => (
              <DetailRow key={o.id}
                title={o.client_name || o.so_number}
                sub={`${o.so_number} · ${fmtDate(o.so_date)}`}
                value={fmtINRShort(o.total_amount)}
                badge={o.status}
              />
            ))
          }
        </DetailPanel>
      )}
      {panel === 'po' && (
        <DetailPanel title="Purchase Orders" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="purchase" navLabel="Go to Purchase">
          {pos.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No purchase orders this period</p>
            : pos.map(p => (
              <DetailRow key={p.id}
                title={p.vendor_name || p.po_number}
                sub={`${p.po_number} · ${fmtDate(p.po_date)}`}
                value={fmtINRShort(p.total_amount)}
                badge={p.status}
              />
            ))
          }
        </DetailPanel>
      )}
    </>
  )
}

// ── Operator Dashboard ─────────────────────────────────────────────────────────
function OperatorDashboard({ companyId, userId, range, onNavigate }) {
  const [panel, setPanel] = useState(null)

  const { data: employee } = useQuery({
    queryKey: ['dash_op_employee', userId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id,name').eq('user_id', userId).maybeSingle()
      return data || null
    },
    enabled: !!userId, staleTime: 120_000,
  })
  const employeeId = employee?.id || null

  const { data: myShifts = [] } = useQuery({
    queryKey: ['dash_my_shifts', companyId, employeeId, range],
    queryFn: async () => {
      let q = supabase.from('shifts')
        .select('id,status,shift_date,equipment_name,start_time,working_hours,fuel_filled')
        .eq('company_id', companyId)
        .gte('shift_date', range.from).lte('shift_date', range.to)
        .order('shift_date', { ascending: false })
      if (employeeId) q = q.eq('operator_id', employeeId)
      const { data } = await q
      return data || []
    },
    staleTime: 30_000, enabled: !!companyId,
  })

  const openShift  = myShifts.find(s => s.status === 'open')
  const totalHours = myShifts.reduce((s, sh) => s + (Number(sh.working_hours) || 0), 0)
  const totalFuel  = myShifts.reduce((s, sh) => s + (Number(sh.fuel_filled)  || 0), 0)

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <KpiCard icon={Clock}       label="My Shifts"    value={myShifts.length}           sub={openShift ? '1 shift open' : 'all closed'} color={openShift ? 'amber' : 'green'} onClick={() => setPanel('shifts')} />
        <KpiCard icon={Activity}    label="Hours Logged" value={totalHours.toFixed(1)+'h'} sub="this period"   color="blue"    onClick={() => setPanel('shifts')} />
        <KpiCard icon={Truck}       label="Fuel Filled"  value={totalFuel.toFixed(0)+' L'} sub="this period"   color="primary" onClick={() => setPanel('shifts')} />
        <KpiCard icon={CheckCircle} label="Completed"    value={myShifts.filter(s => ['closed','approved'].includes(s.status)).length} sub="shifts done" color="green" onClick={() => setPanel('shifts')} />
      </div>

      <ChartCard title="My Shift Activity">
        <ShiftActivityChart shifts={myShifts} range={range} />
      </ChartCard>

      <ChartCard title="Shift Log">
        <ShiftLogTable shifts={myShifts} />
      </ChartCard>

      {panel === 'shifts' && (
        <DetailPanel title="My Shifts" onClose={() => setPanel(null)} onNavigate={onNavigate} navKey="operations" navLabel="Go to Operations">
          {myShifts.length === 0
            ? <p className="text-sm text-slate-500 text-center py-8">No shifts this period</p>
            : myShifts.map(s => (
              <DetailRow key={s.id}
                title={s.equipment_name || 'Equipment'}
                sub={`${fmtDate(s.shift_date)}${s.start_time ? ' · ' + s.start_time : ''}`}
                value={s.working_hours ? s.working_hours + 'h' : '—'}
                badge={s.status}
              />
            ))
          }
        </DetailPanel>
      )}
    </>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function DashboardPage({ onNavigate }) {
  const { company, role, userProfile } = useAuth()
  const companyId = company?.id
  const [period, setPeriod] = useState('month')
  const range = useMemo(() => getRange(period), [period])

  const isAdmin      = [ROLES.ADMIN, ROLES.ACCOUNTS, ROLES.MANAGER].includes(role)
  const isSupervisor = role === ROLES.SUPERVISOR
  const isOperator   = role === ROLES.OPERATOR

  if (!companyId) return (
    <div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading…</div>
  )

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{company?.name}</h1>
          <p className="text-sm text-slate-500 capitalize">
            {role} Dashboard · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-1 border border-dark-700">
          {[{ key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }].map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                period === p.key ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {isOperator   && <OperatorDashboard companyId={companyId} userId={userProfile?.id} range={range} onNavigate={onNavigate} />}
      {isSupervisor && <>
        <OperationsSection companyId={companyId} range={range} onNavigate={onNavigate} />
        <HRSection         companyId={companyId} range={range} onNavigate={onNavigate} />
      </>}
      {isAdmin && <>
        <FinancialsSection companyId={companyId} range={range} onNavigate={onNavigate} />
        <OperationsSection companyId={companyId} range={range} onNavigate={onNavigate} />
        <HRSection         companyId={companyId} range={range} onNavigate={onNavigate} />
        <SalesSection      companyId={companyId} range={range} onNavigate={onNavigate} />
      </>}
    </div>
  )
}
