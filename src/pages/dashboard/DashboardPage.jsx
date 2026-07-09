import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  TrendingUp, Truck, Users, FileText, ShoppingCart,
  Clock, AlertCircle, CheckCircle, Activity, Wallet, Receipt,
  Calendar, Wrench, Package, BarChart3, ArrowUpRight, ArrowDownRight,
  X, ChevronRight,
} from 'lucide-react'
import { ROLES } from '../../lib/constants'

// ── Helpers ───────────────────────────────────────────────────────────────────
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

const STATUS_COLOR = {
  paid: 'text-emerald-400', partial: 'text-amber-400', overdue: 'text-red-400',
  sent: 'text-blue-400', draft: 'text-slate-400', cancelled: 'text-slate-500',
  open: 'text-amber-400', closed: 'text-blue-400', approved: 'text-emerald-400',
  active: 'text-emerald-400', idle: 'text-blue-400', breakdown: 'text-red-400', maintenance: 'text-amber-400',
  present: 'text-emerald-400', absent: 'text-red-400', leave: 'text-amber-400',
  pending: 'text-amber-400', accepted: 'text-emerald-400', rejected: 'text-red-400',
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ title, onClose, onNavigate, navKey, navLabel, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-dark-800 border-l border-dark-700 flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Content */}
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

// ── Section header ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// DATA HOOKS
// ─────────────────────────────────────────────────────────────────────────────

function useInvoiceData(companyId, range) {
  return useQuery({
    queryKey: ['dash_invoices', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices')
        .select('id,invoice_number,client_name,total_amount,paid_amount,balance_due,status,invoice_date,due_date')
        .eq('company_id', companyId)
        .neq('invoice_type', 'proforma')   // proformas are pre-invoices — exclude from revenue
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
// SECTION COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FinancialsSection({ companyId, range, onNavigate }) {
  const [panel, setPanel] = useState(null)
  const { data: invoices = [] } = useInvoiceData(companyId, range)
  const { data: bills = [] }    = useBillData(companyId, range)

  const revenue      = invoices.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0)
  const outstanding  = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
  const outstandingAmt = outstanding.reduce((s, i) => s + (Number(i.balance_due) || 0), 0)
  const overdue      = invoices.filter(i => i.status === 'overdue')
  const billsPending = bills.filter(b => b.status !== 'paid' && b.status !== 'cancelled')
  const billsDue     = billsPending.reduce((s, b) => s + (Number(b.balance_due) || 0), 0)
  const totalBilled  = invoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)

  return (
    <>
      <Section icon={Wallet} title="Financials">
        <KpiCard icon={TrendingUp}  label="Revenue Collected"  value={fmtINRShort(revenue)}       sub={`of ${fmtINRShort(totalBilled)} billed`}         color="green"  onClick={() => setPanel('revenue')} />
        <KpiCard icon={Receipt}     label="Outstanding"        value={fmtINRShort(outstandingAmt)} sub={overdue.length > 0 ? `${overdue.length} overdue` : `${outstanding.length} invoices`} color={overdue.length > 0 ? 'red' : 'amber'} onClick={() => setPanel('outstanding')} />
        <KpiCard icon={ShoppingCart} label="Bills Due"         value={fmtINRShort(billsDue)}       sub={`${billsPending.length} pending`}                 color="amber"  onClick={() => setPanel('bills')} />
        <KpiCard icon={BarChart3}   label="Net"                value={fmtINRShort(revenue - billsDue)} sub="collected − bills due"                       color={revenue - billsDue >= 0 ? 'green' : 'red'} onClick={() => setPanel('revenue')} />
      </Section>

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
  const { data: shifts = [] }    = useShiftData(companyId, range)
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

  const openShifts    = shifts.filter(s => s.status === 'open')
  const totalHours    = shifts.reduce((s, sh) => s + (Number(sh.working_hours) || 0), 0)
  const totalFuel     = shifts.reduce((s, sh) => s + (Number(sh.fuel_filled)  || 0), 0)
  const eqByStatus    = equipment.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc }, {})

  const statusGroups = [
    { label: 'Active',      key: 'active',      color: 'text-emerald-400' },
    { label: 'Idle',        key: 'idle',        color: 'text-blue-400' },
    { label: 'Maintenance', key: 'maintenance', color: 'text-amber-400' },
    { label: 'Breakdown',   key: 'breakdown',   color: 'text-red-400' },
  ]

  return (
    <>
      <Section icon={Activity} title="Equipment & Operations">
        <KpiCard icon={Clock}    label="Open Shifts"       value={openShifts.length}              sub={`${shifts.length} total this period`}              color="amber"  onClick={() => setPanel('shifts')} />
        <KpiCard icon={Truck}    label="Fleet Status"      value={`${eqByStatus.active||0}/${equipment.length}`} sub={(eqByStatus.breakdown||0) > 0 ? `${eqByStatus.breakdown} breakdown` : 'active'} color={(eqByStatus.breakdown||0) > 0 ? 'red' : 'green'} onClick={() => setPanel('equipment')} />
        <KpiCard icon={Activity} label="Hours Logged"      value={totalHours.toFixed(1) + 'h'}   sub={totalFuel > 0 ? `${totalFuel.toFixed(0)} L fuel` : `${shifts.length} shifts`} color="blue"   onClick={() => setPanel('shifts')} />
        <KpiCard icon={Wrench}   label="Open Maintenance"  value={maintenance.length}              sub={maintenance.length > 0 ? 'needs attention' : 'all clear'}                  color={maintenance.length > 0 ? 'red' : 'green'} onClick={() => setPanel('maintenance')} />
      </Section>

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
          <div className="flex flex-wrap gap-2 mb-4">
            {statusGroups.map(g => (
              <span key={g.key} className={`text-xs font-medium ${g.color}`}>
                {eqByStatus[g.key] || 0} {g.label}
              </span>
            ))}
          </div>
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
  const { data: employees = [] }  = useEmployeeData(companyId)
  const { data: attendance = [] } = useAttendanceData(companyId, today)

  const { data: leaves = [] } = useQuery({
    queryKey: ['dash_leaves', companyId, range],
    queryFn: async () => {
      const { data } = await supabase.from('leave_requests')
        .select('id,employee_name,from_date,to_date,status,leave_type')
        .eq('company_id', companyId).eq('status', 'pending')
      return data || []
    },
    staleTime: 60_000, enabled: !!companyId,
  })

  const active   = employees.filter(e => e.is_active)
  const present  = attendance.filter(a => a.status === 'present')
  const absent   = attendance.filter(a => a.status === 'absent')
  const onLeave  = attendance.filter(a => a.status === 'leave')

  return (
    <>
      <Section icon={Users} title="HR & Attendance">
        <KpiCard icon={Users}         label="Total Employees"  value={active.length}                  sub="active headcount"             color="blue"   onClick={() => setPanel('employees')} />
        <KpiCard icon={CheckCircle}   label="Present Today"    value={present.length}                 sub={attendance.length > 0 ? `of ${attendance.length} marked` : 'not marked yet'} color="green"  onClick={() => setPanel('attendance')} />
        <KpiCard icon={AlertCircle}   label="Absent / Leave"   value={absent.length + onLeave.length} sub={onLeave.length > 0 ? `${onLeave.length} on leave` : 'today'} color={(absent.length + onLeave.length) > 0 ? 'amber' : 'green'} onClick={() => setPanel('attendance')} />
        <KpiCard icon={Calendar}      label="Leave Requests"   value={leaves.length}                  sub="pending approval"             color={leaves.length > 0 ? 'amber' : 'green'} onClick={() => setPanel('leaves')} />
      </Section>

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
  const { data: pos = [] }    = usePOData(companyId, range)

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
        <KpiCard icon={FileText}      label="Open Quotes"     value={openQuotes.length}           sub={`${quotes.length} total this period`}  color="blue"   onClick={() => setPanel('quotes')} />
        <KpiCard icon={TrendingUp}    label="Sales Orders"    value={openSOs.length}              sub="in progress"                           color="primary" onClick={() => setPanel('so')} />
        <KpiCard icon={ShoppingCart}  label="Pending POs"     value={pendingPOs.length}           sub={fmtINRShort(poValue) + ' value'}       color="amber"  onClick={() => setPanel('po')} />
        <KpiCard icon={Package}       label="PO Value"        value={fmtINRShort(poValue)}        sub={`${pos.length} orders`}                color="purple" onClick={() => setPanel('po')} />
      </Section>

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
        <KpiCard icon={Activity}    label="Hours Logged" value={totalHours.toFixed(1)+'h'} sub="this period"   color="blue"   onClick={() => setPanel('shifts')} />
        <KpiCard icon={Truck}       label="Fuel Filled"  value={totalFuel.toFixed(0)+' L'} sub="this period"   color="primary" onClick={() => setPanel('shifts')} />
        <KpiCard icon={CheckCircle} label="Completed"    value={myShifts.filter(s => ['closed','approved'].includes(s.status)).length} sub="shifts done" color="green" onClick={() => setPanel('shifts')} />
      </div>

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
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
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
