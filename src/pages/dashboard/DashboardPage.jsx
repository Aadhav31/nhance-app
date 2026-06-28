import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  TrendingUp, TrendingDown, Truck, Users, FileText, ShoppingCart,
  Clock, AlertCircle, CheckCircle, Activity, Wallet, Receipt,
  Calendar, Wrench, Package, BarChart3, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { ROLES } from '../../lib/constants'

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }

function getRange(period) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

  if (period === 'today') {
    const t = fmt(now)
    return { from: t, to: t }
  }
  if (period === 'week') {
    const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
    return { from: fmt(mon), to: fmt(now) }
  }
  // month
  const from = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`
  return { from, to: fmt(now) }
}

const fmtINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtINRShort = (n) => {
  n = Number(n || 0)
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`
  if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`
  if (n >= 1000)     return `₹${(n/1000).toFixed(1)}K`
  return `₹${fmtINR(n)}`
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'primary', trend }) {
  const colors = {
    primary: 'text-primary-400 bg-primary-500/10',
    green:   'text-emerald-400 bg-emerald-500/10',
    amber:   'text-amber-400   bg-amber-500/10',
    red:     'text-red-400     bg-red-500/10',
    blue:    'text-blue-400    bg-blue-500/10',
    purple:  'text-purple-400  bg-purple-500/10',
  }
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className="text-xl font-semibold text-slate-100 mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`text-xs font-medium flex items-center gap-0.5 mt-1 ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend >= 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-slate-400" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {children}
      </div>
    </div>
  )
}

// ── Status pill ────────────────────────────────────────────────────────────────
function Pill({ label, count, color }) {
  const c = {
    green:  'bg-emerald-500/15 text-emerald-300',
    amber:  'bg-amber-500/15   text-amber-300',
    red:    'bg-red-500/15     text-red-300',
    blue:   'bg-blue-500/15    text-blue-300',
    slate:  'bg-slate-500/15   text-slate-400',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c[color]}`}>
      <span className="font-bold">{count}</span> {label}
    </span>
  )
}

// ── Recent row ─────────────────────────────────────────────────────────────────
function RecentRow({ left, right, sub, amount, amountColor = 'text-slate-200' }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-dark-700 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-slate-200 truncate">{left}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      <div className="text-right shrink-0 ml-2">
        {amount && <p className={`text-sm font-medium ${amountColor}`}>{amount}</p>}
        {right && <p className="text-xs text-slate-500">{right}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FinancialsSection({ companyId, range }) {
  const { data: invoices = [] } = useQuery({
    queryKey: ['dash_invoices', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices')
        .select('total_amount,paid_amount,balance_due,status,invoice_date')
        .eq('company_id', companyId)
        .gte('invoice_date', range.from).lte('invoice_date', range.to)
      return data || []
    },
    staleTime: 60_000,
  })

  const { data: bills = [] } = useQuery({
    queryKey: ['dash_bills', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('bills')
        .select('total_amount,balance_due,status,due_date')
        .eq('company_id', companyId)
        .gte('bill_date', range.from).lte('bill_date', range.to)
      return data || []
    },
    staleTime: 60_000,
  })

  const revenue     = invoices.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0)
  const outstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (Number(i.balance_due) || 0), 0)
  const totalBilled = invoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
  const billsDue    = bills.filter(b => b.status !== 'paid').reduce((s, b) => s + (Number(b.balance_due) || 0), 0)
  const overdue     = invoices.filter(i => i.status === 'overdue').length

  const { data: recentInv = [] } = useQuery({
    queryKey: ['dash_recent_inv', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices')
        .select('invoice_number,client_name,total_amount,status,invoice_date')
        .eq('company_id', companyId)
        .order('invoice_date', { ascending: false }).limit(5)
      return data || []
    },
    staleTime: 60_000,
  })

  const statusColor = { paid: 'green', partial: 'amber', overdue: 'red', sent: 'blue', draft: 'slate', cancelled: 'slate' }

  return (
    <div className="space-y-3">
      <Section icon={Wallet} title="Financials">
        <KpiCard icon={TrendingUp}    label="Revenue Collected"  value={fmtINRShort(revenue)}     sub={`of ${fmtINRShort(totalBilled)} billed`} color="green" />
        <KpiCard icon={Receipt}       label="Outstanding"        value={fmtINRShort(outstanding)}  sub={overdue > 0 ? `${overdue} overdue` : 'invoices'} color={overdue > 0 ? 'red' : 'amber'} />
        <KpiCard icon={ShoppingCart}  label="Bills Due"          value={fmtINRShort(billsDue)}     sub={`${bills.filter(b=>b.status!=='paid').length} pending bills`} color="amber" />
        <KpiCard icon={BarChart3}     label="Net"                value={fmtINRShort(revenue - billsDue)} sub="collected − bills due" color={revenue - billsDue >= 0 ? 'green' : 'red'} />
      </Section>

      {recentInv.length > 0 && (
        <div className="card p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Recent Invoices</p>
          {recentInv.map(inv => (
            <RecentRow
              key={inv.invoice_number}
              left={inv.client_name || inv.invoice_number}
              sub={inv.invoice_number + ' · ' + inv.invoice_date}
              amount={fmtINRShort(inv.total_amount)}
              right={<Pill label={inv.status} count="" color={statusColor[inv.status] || 'slate'} />}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OperationsSection({ companyId, range }) {
  const { data: shifts = [] } = useQuery({
    queryKey: ['dash_shifts', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('shifts')
        .select('id,status,shift_date,equipment_id,working_hours,fuel_filled')
        .eq('company_id', companyId)
        .gte('shift_date', range.from).lte('shift_date', range.to)
      return data || []
    },
    staleTime: 30_000,
  })

  const { data: equipment = [] } = useQuery({
    queryKey: ['dash_equipment', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id,status,name')
        .eq('company_id', companyId)
      return data || []
    },
    staleTime: 60_000,
  })

  const { data: maintenance = [] } = useQuery({
    queryKey: ['dash_maint', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('maintenance_records')
        .select('id,status')
        .eq('company_id', companyId)
        .in('status', ['open','in_progress'])
      return data || []
    },
    staleTime: 60_000,
  })

  const openShifts   = shifts.filter(s => s.status === 'open').length
  const closedShifts = shifts.filter(s => s.status !== 'open').length
  const totalHours   = shifts.reduce((s, sh) => s + (Number(sh.working_hours) || 0), 0)
  const totalFuel    = shifts.reduce((s, sh) => s + (Number(sh.fuel_filled)  || 0), 0)

  const eqActive      = equipment.filter(e => e.status === 'active').length
  const eqBreakdown   = equipment.filter(e => e.status === 'breakdown').length
  const eqMaintenance = equipment.filter(e => e.status === 'maintenance').length
  const eqIdle        = equipment.filter(e => e.status === 'idle').length

  return (
    <div className="space-y-3">
      <Section icon={Activity} title="Equipment & Operations">
        <KpiCard icon={Clock}    label="Open Shifts"       value={openShifts}                       sub={`${closedShifts} completed`}           color="amber" />
        <KpiCard icon={Truck}    label="Active Equipment"  value={`${eqActive}/${equipment.length}`} sub={eqBreakdown > 0 ? `${eqBreakdown} breakdown` : 'running'} color={eqBreakdown > 0 ? 'red' : 'green'} />
        <KpiCard icon={Activity} label="Hours Logged"      value={totalHours.toFixed(1) + 'h'}       sub={`${shifts.length} shifts`}             color="blue" />
        <KpiCard icon={Wrench}   label="Open Maintenance"  value={maintenance.length}                 sub={eqMaintenance > 0 ? `${eqMaintenance} in service` : 'all clear'} color={maintenance.length > 0 ? 'red' : 'green'} />
      </Section>

      {equipment.length > 0 && (
        <div className="card p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Fleet Status</p>
          <div className="flex flex-wrap gap-2">
            <Pill label="Active"      count={eqActive}      color="green" />
            <Pill label="Idle"        count={eqIdle}        color="blue" />
            <Pill label="Maintenance" count={eqMaintenance} color="amber" />
            <Pill label="Breakdown"   count={eqBreakdown}   color="red" />
          </div>
          {totalFuel > 0 && (
            <p className="text-xs text-slate-500 mt-3">⛽ {totalFuel.toFixed(0)} L fuel filled this period</p>
          )}
        </div>
      )}
    </div>
  )
}

function HRSection({ companyId, range }) {
  const { data: employees = [] } = useQuery({
    queryKey: ['dash_employees', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id,is_active,employment_type')
        .eq('company_id', companyId)
      return data || []
    },
    staleTime: 120_000,
  })

  const { data: attendance = [] } = useQuery({
    queryKey: ['dash_attendance', companyId, range.to],
    queryFn: async () => {
      const { data } = await supabase.from('hr_attendance')
        .select('status')
        .eq('company_id', companyId)
        .eq('attendance_date', range.to)      // latest date in range
      return data || []
    },
    staleTime: 60_000,
  })

  const { data: leaves = [] } = useQuery({
    queryKey: ['dash_leaves', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('leave_requests')
        .select('id,status')
        .eq('company_id', companyId)
        .in('status', ['pending','approved'])
        .gte('from_date', range.from).lte('from_date', range.to)
      return data || []
    },
    staleTime: 60_000,
  })

  const active   = employees.filter(e => e.is_active).length
  const present  = attendance.filter(a => a.status === 'present').length
  const absent   = attendance.filter(a => a.status === 'absent').length
  const onLeave  = attendance.filter(a => a.status === 'leave').length
  const pending  = leaves.filter(l => l.status === 'pending').length

  return (
    <Section icon={Users} title="HR & Attendance">
      <KpiCard icon={Users}        label="Total Employees"  value={active}                              sub="active headcount"           color="blue" />
      <KpiCard icon={CheckCircle}  label="Present Today"    value={present}                             sub={attendance.length > 0 ? `of ${attendance.length} marked` : 'not marked yet'} color="green" />
      <KpiCard icon={AlertCircle}  label="Absent / Leave"   value={absent + onLeave}                    sub={onLeave > 0 ? `${onLeave} on leave` : 'today'} color={absent + onLeave > 0 ? 'amber' : 'green'} />
      <KpiCard icon={Calendar}      label="Leave Requests"  value={pending}                             sub="pending approval"           color={pending > 0 ? 'amber' : 'green'} />
    </Section>
  )
}

function SalesSection({ companyId, range }) {
  const { data: quotes = [] } = useQuery({
    queryKey: ['dash_quotes', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('quotes')
        .select('id,status,total_amount')
        .eq('company_id', companyId)
        .gte('quote_date', range.from).lte('quote_date', range.to)
      return data || []
    },
    staleTime: 60_000,
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['dash_so', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders')
        .select('id,status,total_amount')
        .eq('company_id', companyId)
        .gte('so_date', range.from).lte('so_date', range.to)
      return data || []
    },
    staleTime: 60_000,
  })

  const { data: pos = [] } = useQuery({
    queryKey: ['dash_po', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_orders')
        .select('id,status,total_amount')
        .eq('company_id', companyId)
        .gte('po_date', range.from).lte('po_date', range.to)
      return data || []
    },
    staleTime: 60_000,
  })

  const openQuotes  = quotes.filter(q => q.status === 'sent' || q.status === 'draft').length
  const wonQuotes   = quotes.filter(q => q.status === 'accepted').length
  const openSOs     = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length
  const pendingPOs  = pos.filter(p => p.status === 'sent' || p.status === 'draft').length
  const quoteValue  = quotes.reduce((s, q) => s + (Number(q.total_amount) || 0), 0)
  const poValue     = pos.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)

  return (
    <Section icon={FileText} title="Sales & Purchase">
      <KpiCard icon={FileText}     label="Open Quotes"      value={openQuotes}              sub={wonQuotes > 0 ? `${wonQuotes} won` : fmtINRShort(quoteValue) + ' pipeline'} color="blue" />
      <KpiCard icon={TrendingUp}   label="Sales Orders"     value={openSOs}                 sub="in progress"    color="primary" />
      <KpiCard icon={ShoppingCart} label="Pending POs"      value={pendingPOs}              sub={fmtINRShort(poValue) + ' value'} color="amber" />
      <KpiCard icon={Package}      label="PO Value"         value={fmtINRShort(poValue)}    sub={`${pos.length} orders`}        color="purple" />
    </Section>
  )
}

// ── Operator Dashboard ────────────────────────────────────────────────────────
function OperatorDashboard({ companyId, userId, range }) {
  const { data: employee } = useQuery({
    queryKey: ['dash_op_employee', userId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id,name').eq('user_id', userId).maybeSingle()
      return data || null
    },
    enabled: !!userId,
    staleTime: 120_000,
  })
  const employeeId = employee?.id || null

  const { data: myShifts = [] } = useQuery({
    queryKey: ['dash_my_shifts', companyId, employeeId, range],
    queryFn: async () => {
      let q = supabase.from('shifts')
        .select('id,status,shift_date,equipment_name,start_time,end_time,working_hours,fuel_filled,start_km,end_km')
        .eq('company_id', companyId)
        .gte('shift_date', range.from).lte('shift_date', range.to)
        .order('shift_date', { ascending: false })
      if (employeeId) q = q.eq('operator_id', employeeId)
      const { data } = await q
      return data || []
    },
    staleTime: 30_000,
  })

  const openShift   = myShifts.find(s => s.status === 'open')
  const totalHours  = myShifts.reduce((s, sh) => s + (Number(sh.working_hours) || 0), 0)
  const totalFuel   = myShifts.reduce((s, sh) => s + (Number(sh.fuel_filled)  || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard icon={Clock}    label="My Shifts"      value={myShifts.length}          sub={openShift ? '1 shift open' : 'all closed'} color={openShift ? 'amber' : 'green'} />
        <KpiCard icon={Activity} label="Hours Logged"   value={totalHours.toFixed(1)+'h'} sub="this period"   color="blue" />
        <KpiCard icon={Truck}    label="Fuel Filled"    value={totalFuel.toFixed(0)+' L'} sub="this period"   color="primary" />
        <KpiCard icon={CheckCircle} label="Completed"  value={myShifts.filter(s=>s.status==='closed'||s.status==='approved').length} sub="shifts done" color="green" />
      </div>

      <div className="card p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">My Recent Shifts</p>
        {myShifts.length === 0
          ? <p className="text-sm text-slate-500 text-center py-4">No shifts this period</p>
          : myShifts.slice(0, 6).map(s => (
            <RecentRow
              key={s.id}
              left={s.equipment_name || 'Equipment'}
              sub={s.shift_date + (s.start_time ? ' · ' + s.start_time : '')}
              amount={s.working_hours ? s.working_hours + 'h' : '—'}
              right={<Pill label={s.status} count="" color={s.status==='open'?'amber':s.status==='approved'?'green':'blue'} />}
            />
          ))
        }
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { company, role, userProfile } = useAuth()
  const companyId = company?.id
  const [period, setPeriod] = useState('month')
  const range = useMemo(() => getRange(period), [period])

  const isAdmin    = [ROLES.ADMIN, ROLES.ACCOUNTS, ROLES.MANAGER].includes(role)
  const isSupervisor = role === ROLES.SUPERVISOR
  const isOperator = role === ROLES.OPERATOR

  const periods = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: 'This Week' },
    { key: 'month', label: 'This Month' },
  ]

  if (!companyId) return (
    <div className="flex items-center justify-center h-full text-slate-500 text-sm">
      Loading…
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{company?.name}</h1>
          <p className="text-sm text-slate-500 capitalize">{role} Dashboard · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        {/* Period switcher */}
        <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-1 border border-dark-700">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                period === p.key
                  ? 'bg-primary-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Operator view */}
      {isOperator && (
        <OperatorDashboard
          companyId={companyId}
          userId={userProfile?.id}
          range={range}
        />
      )}

      {/* Supervisor view */}
      {isSupervisor && (
        <>
          <OperationsSection companyId={companyId} range={range} />
          <HRSection         companyId={companyId} range={range} />
        </>
      )}

      {/* Admin / Manager / Accounts view */}
      {isAdmin && (
        <>
          <FinancialsSection companyId={companyId} range={range} />
          <OperationsSection companyId={companyId} range={range} />
          <HRSection         companyId={companyId} range={range} />
          <SalesSection      companyId={companyId} range={range} />
        </>
      )}
    </div>
  )
}
