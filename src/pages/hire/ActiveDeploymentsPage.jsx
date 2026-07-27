import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, differenceInDays } from 'date-fns'
import {
  Search, X, ChevronRight, Truck, MapPin, Calendar,
  User, IndianRupee, FileSignature, Clock, CheckCircle,
  AlertTriangle, ChevronDown, ChevronUp, Building2,
  BarChart2, Wrench, History,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate   = (d) => d ? format(new Date(d), 'd MMM yyyy') : '—'
const fmt       = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'
const daysOn    = (d) => d ? differenceInDays(new Date(), new Date(d)) : null

// ── Row label/value ───────────────────────────────────────────────────────────
function Row({ label, value }) {
  if (!value || value === '—') return null
  return (
    <div className="flex justify-between py-1.5 border-b border-dark-700/50 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-200 text-right max-w-[60%]">{value}</span>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mt-4 mb-2">
      <Icon className="w-3.5 h-3.5 text-primary-400" />
      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</span>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function DeployBadge({ days }) {
  if (days === null) return null
  if (days > 180) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">{days}d on site</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{days}d on site</span>
}

// ── Contract terms badge ──────────────────────────────────────────────────────
function BillingBadge({ basis }) {
  const map = { hourly: 'Hourly', daily: 'Daily', monthly: 'Monthly', lump_sum: 'Lump Sum' }
  if (!basis) return null
  return <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-300 border border-primary-500/30">{map[basis] || basis}</span>
}

// ── Deployment detail slide-in panel ─────────────────────────────────────────
function DeploymentPanel({ item, onClose }) {
  const { companyId } = useAuth()

  // Full project details
  const { data: project } = useQuery({
    queryKey: ['project_detail', item.project_id],
    queryFn: async () => {
      if (!item.project_id) return null
      const { data } = await supabase.from('projects')
        .select('*').eq('id', item.project_id).single()
      return data
    },
    enabled: !!item.project_id,
  })

  // All commissionings for this equipment
  const { data: history = [] } = useQuery({
    queryKey: ['eq_commissionings_history', item.equipment_id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_commissionings')
        .select('*, projects(project_name, project_number)')
        .eq('equipment_id', item.equipment_id)
        .eq('company_id', companyId)
        .order('commissioned_date', { ascending: false })
      return data || []
    },
    enabled: !!item.equipment_id,
  })

  // Hire contract linked to this equipment (active/latest)
  const { data: contract } = useQuery({
    queryKey: ['hire_contract_for_eq', item.equipment_id],
    queryFn: async () => {
      const { data } = await supabase.from('hire_contracts')
        .select('*')
        .eq('equipment_id', item.equipment_id)
        .eq('company_id', companyId)
        .in('status', ['active', 'draft'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!item.equipment_id,
  })

  // Recent operator assignments
  const { data: operators = [] } = useQuery({
    queryKey: ['eq_operators_recent', item.equipment_id],
    queryFn: async () => {
      const { data } = await supabase.from('equipment_assignments')
        .select('employee_name, assignment_role, assignment_date, status')
        .eq('equipment_id', item.equipment_id)
        .eq('company_id', companyId)
        .order('assignment_date', { ascending: false })
        .limit(5)
      return data || []
    },
    enabled: !!item.equipment_id,
  })

  const p = project
  const days = daysOn(item.commissioned_date)

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-dark-800 border-l border-dark-700 h-full overflow-y-auto flex flex-col shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-dark-800 border-b border-dark-700 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">{item.equipment_name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{item.equipment_type} · {item.equipment_number || 'No Reg.'}</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 mt-0.5"><X className="w-5 h-5" /></button>
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Active Deployment
            </span>
            {days !== null && <DeployBadge days={days} />}
            {contract && <BillingBadge basis={contract.billing_basis} />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">

          {/* ── Project overview ─────────────────────────────── */}
          <SectionHead icon={Building2} title="Project Overview" />
          <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
            <Row label="Project" value={p?.project_name || item.project_name || '—'} />
            <Row label="Project #" value={p?.project_number} />
            <Row label="Client" value={p?.client_name || item.client_name} />
            <Row label="Status" value={p?.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : '—'} />
            <Row label="Type" value={p?.type} />
          </div>

          {/* ── Site & Location ──────────────────────────────── */}
          {(p?.site_name || p?.city) && (
            <>
              <SectionHead icon={MapPin} title="Site & Location" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Site Name" value={p?.site_name} />
                <Row label="Address" value={p?.address} />
                <Row label="City" value={p?.city} />
                <Row label="State" value={p?.state} />
                <Row label="Pincode" value={p?.pincode} />
              </div>
            </>
          )}

          {/* ── Timeline ────────────────────────────────────── */}
          <SectionHead icon={Calendar} title="Timeline" />
          <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
            <Row label="Mobilization" value={fmtDate(p?.start_date || item.commissioned_date)} />
            <Row label="Commencement" value={fmtDate(p?.commencement_date)} />
            <Row label="Expected End" value={fmtDate(p?.expected_end_date)} />
            <Row label="Actual End" value={fmtDate(p?.actual_end_date)} />
            <Row label="Commissioned Since" value={fmtDate(item.commissioned_date)} />
            {item.withdrawn_date && <Row label="Withdrawn" value={fmtDate(item.withdrawn_date)} />}
          </div>

          {/* ── Operators ────────────────────────────────────── */}
          {item.operator_name && (
            <>
              <SectionHead icon={User} title="Deployed Operator" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Operator" value={item.operator_name} />
                {item.operator_notes && <Row label="Notes" value={item.operator_notes} />}
              </div>
            </>
          )}

          {operators.length > 0 && (
            <>
              <SectionHead icon={History} title="Recent Assignments" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 divide-y divide-dark-700">
                {operators.map((op, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="text-xs text-slate-200">{op.employee_name}</p>
                      <p className="text-xs text-slate-500">{op.assignment_role?.replace('_', ' ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{fmtDate(op.assignment_date)}</p>
                      <span className={`text-xs ${op.status === 'present' ? 'text-emerald-400' : op.status === 'absent' ? 'text-red-400' : 'text-amber-400'}`}>
                        {op.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Contract Terms ───────────────────────────────── */}
          {contract && (
            <>
              <SectionHead icon={FileSignature} title="Hire Contract" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Contract #" value={contract.contract_number} />
                <Row label="Status" value={contract.status} />
                <Row label="Client" value={contract.client_name} />
                <Row label="Billing Basis" value={contract.billing_basis?.replace('_', ' ')} />
                <Row label="Rate" value={fmt(contract.rate)} />
                {contract.minimum_hours_per_day && <Row label="Min hrs/day" value={`${contract.minimum_hours_per_day} hrs`} />}
                {contract.overtime_rate && <Row label="OT Rate" value={fmt(contract.overtime_rate)} />}
                <Row label="GST" value={contract.gst_applicable ? `${contract.gst_rate}%` : 'N/A'} />
                <Row label="Site" value={contract.site_location} />
                <Row label="Start" value={fmtDate(contract.start_date)} />
                <Row label="End" value={fmtDate(contract.end_date)} />
                {contract.mobilization_charge > 0 && <Row label="Mob. Charge" value={fmt(contract.mobilization_charge)} />}
                {contract.security_deposit > 0 && <Row label="Security Deposit" value={fmt(contract.security_deposit)} />}
              </div>
              {contract.terms_conditions && (
                <div className="bg-dark-750 rounded-xl border border-dark-600 p-3 mt-2">
                  <p className="text-xs text-slate-400 mb-1">Terms & Conditions</p>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap">{contract.terms_conditions}</p>
                </div>
              )}
            </>
          )}

          {/* ── Contract Terms from project ──────────────────── */}
          {p && !contract && (p.billing_cycle || p.payment_terms || p.contract_value) && (
            <>
              <SectionHead icon={IndianRupee} title="Contract Terms" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Contract Value" value={fmt(p.contract_value)} />
                <Row label="Billing Cycle" value={p.billing_cycle} />
                <Row label="Payment Terms" value={p.payment_terms} />
                <Row label="GST Rate" value={p.gst_rate ? `${p.gst_rate}%` : '—'} />
                {p.mobilization_advance && <Row label="Mob. Advance" value={fmt(p.mobilization_advance)} />}
              </div>
            </>
          )}

          {/* ── Deployment History ───────────────────────────── */}
          {history.length > 1 && (
            <>
              <SectionHead icon={History} title="Deployment History" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 divide-y divide-dark-700">
                {history.map((h, i) => (
                  <div key={h.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-200">{h.projects?.project_name || h.site_location || 'Unknown Site'}</p>
                      {i === 0 && h.withdrawn_date === null && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">Current</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span>{fmtDate(h.commissioned_date)}</span>
                      {h.withdrawn_date && <><span>→</span><span>{fmtDate(h.withdrawn_date)}</span></>}
                      {h.withdrawn_date === null && <span className="text-emerald-400">→ present</span>}
                    </div>
                    {h.operator_name && <p className="text-xs text-slate-400 mt-0.5">Operator: {h.operator_name}</p>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="h-6" />
        </div>
      </div>
    </div>
  )
}

// ── Equipment deployment card ─────────────────────────────────────────────────
function DeployCard({ item, onClick }) {
  const days = daysOn(item.commissioned_date)

  return (
    <div
      className="bg-dark-800 border border-dark-700 rounded-xl p-4 hover:border-primary-500/40 hover:shadow-lg transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-primary-400" />
        </div>

        {/* Equipment info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100 truncate">{item.equipment_name}</h3>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-primary-400 transition-colors shrink-0" />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{item.equipment_type} · {item.equipment_number || 'No Reg.'}</p>

          {/* Project & site */}
          {(item.project_name || item.site_location) && (
            <div className="flex items-center gap-1 mt-2">
              <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-300 truncate">
                {item.project_name || item.site_location}
              </span>
            </div>
          )}
          {item.client_name && (
            <div className="flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-400 truncate">{item.client_name}</span>
            </div>
          )}
          {item.operator_name && (
            <div className="flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-400 truncate">{item.operator_name}</span>
            </div>
          )}

          {/* Footer chips */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <DeployBadge days={days} />
            <span className="text-xs text-slate-500">Since {fmtDate(item.commissioned_date)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ActiveDeploymentsPage() {
  const { companyId } = useAuth()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  // Fetch all active deployments (commissionings where withdrawn_date IS NULL)
  // Join with equipment and projects
  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['active_deployments', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_commissionings')
        .select(`
          id,
          commissioned_date,
          withdrawn_date,
          site_location,
          client_name,
          operator_name,
          notes,
          equipment_id,
          project_id,
          equipment:equipment_id (
            id, name, equipment_number, equipment_type
          ),
          projects:project_id (
            id, project_name, project_number, client_name, site_name,
            city, state, status, type, contract_value, billing_cycle,
            payment_terms, gst_rate, start_date, expected_end_date
          )
        `)
        .eq('company_id', companyId)
        .is('withdrawn_date', null)
        .order('commissioned_date', { ascending: false })

      if (error) throw error
      return (data || []).map(d => ({
        ...d,
        equipment_name:   d.equipment?.name || '—',
        equipment_number: d.equipment?.equipment_number || '',
        equipment_type:   d.equipment?.equipment_type || '',
        project_name:     d.projects?.project_name || '',
        project_client:   d.projects?.client_name || d.client_name || '',
      }))
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return deployments
    const q = search.toLowerCase()
    return deployments.filter(d =>
      d.equipment_name.toLowerCase().includes(q) ||
      d.project_name.toLowerCase().includes(q) ||
      (d.project_client || '').toLowerCase().includes(q) ||
      (d.site_location || '').toLowerCase().includes(q) ||
      (d.operator_name || '').toLowerCase().includes(q)
    )
  }, [deployments, search])

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Active Deployments</h1>
        <p className="text-sm text-slate-400 mt-0.5">Equipment currently deployed on site</p>
      </div>

      {/* Stats bar */}
      {deployments.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary-400">{deployments.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">On Site</p>
          </div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">
              {new Set(deployments.map(d => d.project_id).filter(Boolean)).size}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Projects</p>
          </div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">
              {deployments.filter(d => daysOn(d.commissioned_date) > 90).length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">90d+ Deployed</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search equipment, project, operator…"
          className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-dark-800 border border-dark-700 rounded-xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-dark-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-dark-700 rounded w-3/4" />
                  <div className="h-2.5 bg-dark-700 rounded w-1/2" />
                  <div className="h-2.5 bg-dark-700 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Truck className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">
            {deployments.length === 0 ? 'No active deployments' : 'No results for that search'}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {deployments.length === 0
              ? 'Commission equipment from a project to see it here'
              : 'Try a different search term'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(item => (
            <DeployCard key={item.id} item={item} onClick={() => setSelected(item)} />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <DeploymentPanel
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
