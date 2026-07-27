import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, differenceInDays } from 'date-fns'
import {
  Search, X, ChevronRight, Truck, MapPin, Calendar,
  User, IndianRupee, FileSignature, CheckCircle,
  Building2, History, Clock,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? format(new Date(d), 'd MMM yyyy') : '—'
const fmt     = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'
const daysOn  = (d) => d ? differenceInDays(new Date(), new Date(d)) : null

// ── Row label/value ───────────────────────────────────────────────────────────
function Row({ label, value }) {
  if (value == null || value === '' || value === '—') return null
  return (
    <div className="flex justify-between py-1.5 border-b border-dark-700/50 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-200 text-right max-w-[60%]">{value}</span>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────
function SHead({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <Icon className="w-3.5 h-3.5 text-primary-400" />
      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</span>
    </div>
  )
}

// ── Days badge ────────────────────────────────────────────────────────────────
function DaysBadge({ date }) {
  const days = daysOn(date)
  if (days === null) return null
  const cls = days > 180
    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      {days}d on site
    </span>
  )
}

// ── Detail slide-in panel ─────────────────────────────────────────────────────
function DeploymentPanel({ eq, onClose }) {
  const { companyId } = useAuth()

  // Full project + client details
  const { data: project } = useQuery({
    queryKey: ['project_full', eq.current_project_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('*, clients(display_name, business_name)')
        .eq('id', eq.current_project_id)
        .single()
      return data
    },
    enabled: !!eq.current_project_id,
  })

  // Equipment deployment record for this project (billing terms)
  const { data: deployment } = useQuery({
    queryKey: ['eq_deployment_rate', eq.id, eq.current_project_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_deployments')
        .select('*')
        .eq('equipment_id', eq.id)
        .eq('project_id', eq.current_project_id)
        .is('withdrawn_date', null)
        .order('deployed_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!eq.id && !!eq.current_project_id,
  })

  // Hire contract linked to this equipment
  const { data: contract } = useQuery({
    queryKey: ['hire_contract_eq', eq.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('hire_contracts')
        .select('*')
        .eq('equipment_id', eq.id)
        .eq('company_id', companyId)
        .in('status', ['active', 'draft'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!eq.id,
  })

  // Recent operator assignments
  const { data: operators = [] } = useQuery({
    queryKey: ['eq_ops_recent', eq.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_assignments')
        .select('employee_name, assignment_role, assignment_date, status')
        .eq('equipment_id', eq.id)
        .eq('company_id', companyId)
        .order('assignment_date', { ascending: false })
        .limit(5)
      return data || []
    },
    enabled: !!eq.id,
  })

  // Deployment history (all past deployments)
  const { data: history = [] } = useQuery({
    queryKey: ['eq_deploy_history', eq.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_deployments')
        .select('*, projects:project_id(project_name, project_code)')
        .eq('equipment_id', eq.id)
        .order('deployed_date', { ascending: false })
        .limit(10)
      return data || []
    },
    enabled: !!eq.id,
  })

  const p       = project
  const client  = p?.clients
  const days    = daysOn(eq.mobilization_date || p?.mobilization_date || p?.start_date)

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-dark-800 border-l border-dark-700 h-full overflow-y-auto flex flex-col shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-dark-800 border-b border-dark-700 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">{eq.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {[eq.category, eq.make, eq.model].filter(Boolean).join(' · ')} · {eq.equipment_number}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 mt-0.5">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Active Deployment
            </span>
            {days !== null && <DaysBadge date={eq.mobilization_date || p?.mobilization_date || p?.start_date} />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── Equipment Details ──────────────────────── */}
          <SHead icon={Truck} title="Equipment Details" />
          <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
            <Row label="Name"        value={eq.name} />
            <Row label="Reg / ID"    value={eq.equipment_number} />
            <Row label="Category"    value={eq.category} />
            <Row label="Make"        value={eq.make} />
            <Row label="Model"       value={eq.model} />
            <Row label="Year"        value={eq.year_of_manufacture} />
            <Row label="Status"      value={eq.status} />
          </div>

          {/* ── Project Overview ───────────────────────── */}
          {p && (
            <>
              <SHead icon={Building2} title="Project Overview" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Project"     value={p.project_name} />
                <Row label="Project #"   value={p.project_code} />
                <Row label="Client"      value={client?.display_name || client?.business_name} />
                <Row label="Status"      value={p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : '—'} />
                <Row label="Nature of Job" value={p.nature_of_job} />
              </div>
            </>
          )}

          {/* ── Site & Location ────────────────────────── */}
          {p && (p.site_name || p.site_location || p.city) && (
            <>
              <SHead icon={MapPin} title="Site & Location" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Site Name"  value={p.site_name} />
                <Row label="Address"    value={p.site_location} />
                <Row label="City"       value={p.city} />
                <Row label="State"      value={p.state} />
                <Row label="Pincode"    value={p.pincode} />
              </div>
            </>
          )}

          {/* ── Timeline ──────────────────────────────── */}
          {p && (
            <>
              <SHead icon={Calendar} title="Timeline" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Mobilization"   value={fmtDate(p.mobilization_date)} />
                <Row label="Start / Comm."  value={fmtDate(p.commencement_date || p.start_date)} />
                <Row label="Expected End"   value={fmtDate(p.end_date)} />
                <Row label="Actual End"     value={fmtDate(p.actual_end_date)} />
              </div>
            </>
          )}

          {/* ── Operators ─────────────────────────────── */}
          {operators.length > 0 && (
            <>
              <SHead icon={User} title="Recent Assignments" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 divide-y divide-dark-700">
                {operators.map((op, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5">
                    <div>
                      <p className="text-xs text-slate-200">{op.employee_name}</p>
                      <p className="text-xs text-slate-500 capitalize">{op.assignment_role?.replace('_', ' ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{fmtDate(op.assignment_date)}</p>
                      <span className={`text-xs font-medium ${
                        op.status === 'present' ? 'text-emerald-400' :
                        op.status === 'absent'  ? 'text-red-400' : 'text-amber-400'}`}>
                        {op.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Contract Terms (from project) ─────────── */}
          {p && (p.contract_value || p.billing_cycle || p.payment_terms) && (
            <>
              <SHead icon={IndianRupee} title="Contract Terms" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Contract Value"   value={fmt(p.contract_value)} />
                <Row label="Billing Cycle"    value={p.billing_cycle} />
                <Row label="Payment Terms"    value={p.payment_terms} />
                <Row label="GST Rate"         value={p.gst_rate ? `${p.gst_rate}%` : '—'} />
                <Row label="Mob. Advance"     value={fmt(p.mobilization_advance)} />
                <Row label="Retention %"      value={p.retention_pct ? `${p.retention_pct}%` : null} />
              </div>
            </>
          )}

          {/* ── Deployment Rate (from equipment_deployments) ─ */}
          {deployment && (deployment.billing_basis || deployment.rate_per_day || deployment.rate_per_hour) && (
            <>
              <SHead icon={Clock} title="Deployed Rate" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Billing Basis"   value={deployment.billing_basis} />
                <Row label="Rate / Hour"     value={deployment.rate_per_hour ? fmt(deployment.rate_per_hour) : null} />
                <Row label="Rate / Day"      value={deployment.rate_per_day  ? fmt(deployment.rate_per_day)  : null} />
                <Row label="Rate / Month"    value={deployment.rate_per_month ? fmt(deployment.rate_per_month) : null} />
                <Row label="Min. Hours/Day"  value={deployment.minimum_hours_per_day ? `${deployment.minimum_hours_per_day} hrs` : null} />
                <Row label="Deployed Date"   value={fmtDate(deployment.deployed_date)} />
              </div>
            </>
          )}

          {/* ── Hire Contract ─────────────────────────── */}
          {contract && (
            <>
              <SHead icon={FileSignature} title="Hire Contract" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Contract #"   value={contract.contract_number} />
                <Row label="Status"       value={contract.status} />
                <Row label="Client"       value={contract.client_name} />
                <Row label="Basis"        value={contract.billing_basis?.replace('_', ' ')} />
                <Row label="Rate"         value={fmt(contract.rate)} />
                <Row label="GST"          value={contract.gst_applicable ? `${contract.gst_rate}%` : 'N/A'} />
                <Row label="Start"        value={fmtDate(contract.start_date)} />
                <Row label="End"          value={fmtDate(contract.end_date)} />
                <Row label="Deposit"      value={contract.security_deposit > 0 ? fmt(contract.security_deposit) : null} />
              </div>
            </>
          )}

          {/* ── Deployment History ────────────────────── */}
          {history.length > 0 && (
            <>
              <SHead icon={History} title="Deployment History" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 divide-y divide-dark-700">
                {history.map((h, i) => (
                  <div key={h.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-200">
                        {h.projects?.project_name || h.item_name || 'Project'}
                      </p>
                      {!h.withdrawn_date && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">Current</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span>{fmtDate(h.deployed_date)}</span>
                      {h.withdrawn_date
                        ? <><span>→</span><span>{fmtDate(h.withdrawn_date)}</span></>
                        : <span className="text-emerald-400">→ present</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="h-8" />
        </div>
      </div>
    </div>
  )
}

// ── Equipment card ────────────────────────────────────────────────────────────
function EquipCard({ eq, onClick }) {
  const days = daysOn(eq.mobilization_date || eq.project?.mobilization_date || eq.project?.start_date)
  const proj = eq.project
  const client = proj?.clients

  return (
    <div
      className="bg-dark-800 border border-dark-700 rounded-xl p-4 hover:border-primary-500/40 hover:shadow-lg transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-primary-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100 truncate">{eq.name}</h3>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-primary-400 transition-colors shrink-0" />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {[eq.category, eq.make, eq.model].filter(Boolean).join(' · ')} · {eq.equipment_number}
          </p>

          {proj && (
            <div className="mt-2 space-y-0.5">
              {(proj.project_name) && (
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-300 truncate">{proj.project_name}</span>
                </div>
              )}
              {(proj.site_name || proj.site_location || proj.city) && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-400 truncate">
                    {proj.site_name || proj.site_location || proj.city}
                    {proj.city && proj.site_name ? `, ${proj.city}` : ''}
                  </span>
                </div>
              )}
              {(client?.display_name || client?.business_name) && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-400 truncate">
                    {client.display_name || client.business_name}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {days !== null && <DaysBadge date={eq.mobilization_date || proj?.mobilization_date || proj?.start_date} />}
            {proj?.mobilization_date || proj?.start_date
              ? <span className="text-xs text-slate-500">Since {fmtDate(proj.mobilization_date || proj.start_date)}</span>
              : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ActiveDeploymentsPage() {
  const { companyId } = useAuth()
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)

  // Equipment currently on a project (current_project_id IS NOT NULL)
  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['active_deployments', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select(`
          id, name, equipment_number, category, make, model,
          year_of_manufacture, status, current_project_id,
          current_client_id, current_site_name,
          projects:current_project_id (
            id, project_name, project_code, site_name, site_location,
            city, state, pincode, status, nature_of_job,
            contract_value, billing_cycle, payment_terms, gst_rate,
            mobilization_advance, retention_pct,
            start_date, end_date, actual_end_date, mobilization_date,
            commencement_date,
            clients:client_id (display_name, business_name)
          )
        `)
        .eq('company_id', companyId)
        .not('current_project_id', 'is', null)
        .order('name')

      if (error) throw error
      return (data || []).map(eq => ({ ...eq, project: eq.projects }))
    },
    enabled: !!companyId,
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return deployments
    const q = search.toLowerCase()
    return deployments.filter(eq =>
      eq.name?.toLowerCase().includes(q) ||
      eq.equipment_number?.toLowerCase().includes(q) ||
      eq.project?.project_name?.toLowerCase().includes(q) ||
      eq.project?.city?.toLowerCase().includes(q) ||
      eq.project?.clients?.display_name?.toLowerCase().includes(q) ||
      eq.project?.clients?.business_name?.toLowerCase().includes(q)
    )
  }, [deployments, search])

  const uniqueProjects = useMemo(
    () => new Set(deployments.map(e => e.current_project_id).filter(Boolean)).size,
    [deployments]
  )

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Active Deployments</h1>
        <p className="text-sm text-slate-400 mt-0.5">Equipment currently deployed on site</p>
      </div>

      {/* Stats */}
      {deployments.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary-400">{deployments.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Machines on Site</p>
          </div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{uniqueProjects}</p>
            <p className="text-xs text-slate-400 mt-0.5">Active Projects</p>
          </div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">
              {deployments.filter(e => {
                const d = daysOn(e.project?.mobilization_date || e.project?.start_date)
                return d !== null && d > 90
              }).length}
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
          placeholder="Search machine, project, city, client…"
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
                <div className="flex-1 space-y-2 pt-1">
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
            {deployments.length === 0
              ? 'No equipment currently deployed'
              : 'No results for that search'}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {deployments.length === 0
              ? 'Assign equipment to a project from the Fleet or Projects page'
              : 'Try a different search term'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(eq => (
            <EquipCard key={eq.id} eq={eq} onClick={() => setSelected(eq)} />
          ))}
        </div>
      )}

      {selected && (
        <DeploymentPanel eq={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
