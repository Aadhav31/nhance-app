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

const fmtDate = (d) => d ? format(new Date(d), 'd MMM yyyy') : '—'
const fmtMoney = (n) => (n != null && Number(n) !== 0) ? `₹${Number(n).toLocaleString('en-IN')}` : null
const daysOn  = (d) => d ? differenceInDays(new Date(), new Date(d)) : null

function Row({ label, value }) {
  if (value == null || value === '' || value === '—') return null
  return (
    <div className="flex justify-between py-1.5 border-b border-dark-700/50 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-200 text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function SHead({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <Icon className="w-3.5 h-3.5 text-primary-400" />
      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</span>
    </div>
  )
}

function DaysBadge({ days }) {
  if (days === null) return null
  const cls = days > 180
    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{days}d on site</span>
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DeploymentPanel({ dep, onClose }) {
  const { companyId } = useAuth()
  const eq = dep.equipment
  const pr = dep.projects

  const { data: operators = [] } = useQuery({
    queryKey: ['eq_ops', eq?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_assignments')
        .select('employee_name, assignment_role, assignment_date, status')
        .eq('equipment_id', eq.id)
        .eq('company_id', companyId)
        .order('assignment_date', { ascending: false })
        .limit(7)
      return data || []
    },
    enabled: !!eq?.id,
  })

  const { data: contract } = useQuery({
    queryKey: ['hire_contract_eq', eq?.id],
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
    enabled: !!eq?.id,
  })

  const { data: history = [] } = useQuery({
    queryKey: ['eq_depl_hist', eq?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_deployments')
        .select('deployed_date, withdrawn_date, status, billing_basis, rate_per_day, rate_per_hour, rate_per_month, projects:project_id(project_name, project_code)')
        .eq('equipment_id', eq.id)
        .order('deployed_date', { ascending: false })
        .limit(10)
      return data || []
    },
    enabled: !!eq?.id,
  })

  const deployDate = dep.deployed_date
  const days = daysOn(deployDate)

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-dark-800 border-l border-dark-700 h-full overflow-y-auto flex flex-col shadow-2xl">

        <div className="sticky top-0 z-10 bg-dark-800 border-b border-dark-700 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">{eq?.name || '—'}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {[eq?.category, eq?.make, eq?.model].filter(Boolean).join(' · ')}
                {eq?.equipment_number ? ` · ${eq.equipment_number}` : ''}
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
            {days !== null && <DaysBadge days={days} />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Equipment */}
          <SHead icon={Truck} title="Equipment" />
          <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
            <Row label="Name"      value={eq?.name} />
            <Row label="Reg / ID"  value={eq?.equipment_number} />
            <Row label="Category"  value={eq?.category} />
            <Row label="Make"      value={eq?.make} />
            <Row label="Model"     value={eq?.model} />
            <Row label="Year"      value={eq?.year_of_manufacture} />
          </div>

          {/* Project Overview */}
          {pr && (
            <>
              <SHead icon={Building2} title="Project Overview" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Project"       value={pr.project_name} />
                <Row label="Project #"     value={pr.project_code} />
                <Row label="Client"        value={dep.clients?.display_name || dep.clients?.business_name} />
                <Row label="Status"        value={pr.status ? pr.status.charAt(0).toUpperCase() + pr.status.slice(1) : null} />
                <Row label="Nature of Job" value={pr.nature_of_job} />
              </div>

              {(pr.site_name || pr.site_location || pr.city) && (
                <>
                  <SHead icon={MapPin} title="Site & Location" />
                  <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                    <Row label="Site Name" value={pr.site_name} />
                    <Row label="Address"   value={pr.site_location} />
                    <Row label="City"      value={pr.city} />
                    <Row label="State"     value={pr.state} />
                    <Row label="Pincode"   value={pr.pincode} />
                  </div>
                </>
              )}

              <SHead icon={Calendar} title="Timeline" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Mobilization"  value={fmtDate(pr.mobilization_date)} />
                <Row label="Commencement"  value={fmtDate(pr.commencement_date)} />
                <Row label="Start Date"    value={fmtDate(pr.start_date)} />
                <Row label="Expected End"  value={fmtDate(pr.end_date)} />
                <Row label="Actual End"    value={fmtDate(pr.actual_end_date)} />
              </div>

              {(pr.contract_value || pr.billing_cycle || pr.payment_terms) && (
                <>
                  <SHead icon={IndianRupee} title="Contract Terms" />
                  <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                    <Row label="Contract Value" value={fmtMoney(pr.contract_value)} />
                    <Row label="Billing Cycle"  value={pr.billing_cycle} />
                    <Row label="Payment Terms"  value={pr.payment_terms} />
                    <Row label="GST Rate"       value={pr.gst_rate ? `${pr.gst_rate}%` : null} />
                    <Row label="Mob. Advance"   value={fmtMoney(pr.mobilization_advance)} />
                  </div>
                </>
              )}
            </>
          )}

          {/* Deployed Rate */}
          {(dep.billing_basis || dep.rate_per_day || dep.rate_per_hour || dep.rate_per_month) && (
            <>
              <SHead icon={Clock} title="Deployed Rate" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Deployed Date"  value={fmtDate(dep.deployed_date)} />
                <Row label="Billing Basis"  value={dep.billing_basis} />
                <Row label="Rate / Hour"    value={fmtMoney(dep.rate_per_hour)} />
                <Row label="Rate / Day"     value={fmtMoney(dep.rate_per_day)} />
                <Row label="Rate / Month"   value={fmtMoney(dep.rate_per_month)} />
                <Row label="Max Hrs/Day"    value={dep.max_hours_per_day ? `${dep.max_hours_per_day} hrs` : null} />
                <Row label="OT %"           value={dep.ot_percentage ? `${dep.ot_percentage}%` : null} />
                <Row label="Fuel by Client" value={dep.fuel_by_client ? 'Yes' : null} />
              </div>
            </>
          )}

          {/* Operators */}
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
                      <span className={`text-xs font-medium ${op.status === 'present' ? 'text-emerald-400' : op.status === 'absent' ? 'text-red-400' : 'text-amber-400'}`}>
                        {op.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Hire Contract */}
          {contract && (
            <>
              <SHead icon={FileSignature} title="Hire Contract" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 p-3">
                <Row label="Contract #"  value={contract.contract_number} />
                <Row label="Status"      value={contract.status} />
                <Row label="Client"      value={contract.client_name} />
                <Row label="Basis"       value={contract.billing_basis?.replace('_', ' ')} />
                <Row label="Rate"        value={fmtMoney(contract.rate)} />
                <Row label="GST"         value={contract.gst_applicable ? `${contract.gst_rate}%` : 'N/A'} />
                <Row label="Start"       value={fmtDate(contract.start_date)} />
                <Row label="End"         value={fmtDate(contract.end_date)} />
                <Row label="Deposit"     value={fmtMoney(contract.security_deposit)} />
              </div>
            </>
          )}

          {/* Deployment History */}
          {history.length > 0 && (
            <>
              <SHead icon={History} title="Deployment History" />
              <div className="bg-dark-750 rounded-xl border border-dark-600 divide-y divide-dark-700">
                {history.map((h, i) => (
                  <div key={i} className="px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-200">{h.projects?.project_name || '—'}</p>
                      {h.status === 'active' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">Current</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span>{fmtDate(h.deployed_date)}</span>
                      {h.withdrawn_date
                        ? <><span>→</span><span>{fmtDate(h.withdrawn_date)}</span></>
                        : h.status === 'active' && <span className="text-emerald-400">→ present</span>
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
function EquipCard({ dep, onClick }) {
  const eq   = dep.equipment
  const pr   = dep.projects
  const days = daysOn(dep.deployed_date)

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
            <h3 className="text-sm font-semibold text-slate-100 truncate">{eq?.name || '—'}</h3>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-primary-400 shrink-0 transition-colors" />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {[eq?.category, eq?.make, eq?.model].filter(Boolean).join(' · ')}
            {eq?.equipment_number ? ` · ${eq.equipment_number}` : ''}
          </p>

          {pr && (
            <div className="mt-2 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="text-xs text-slate-300 truncate">{pr.project_name}</span>
              </div>
              {(pr.site_name || pr.city) && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-400 truncate">
                    {[pr.site_name, pr.city].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              {(dep.clients?.display_name || dep.clients?.business_name) && (
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-400 truncate">
                    {dep.clients.display_name || dep.clients.business_name}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {days !== null && <DaysBadge days={days} />}
            {dep.deployed_date && <span className="text-xs text-slate-500">Since {fmtDate(dep.deployed_date)}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ActiveDeploymentsPage() {
  const { companyId } = useAuth()
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)

  // Primary source: equipment_deployments (has proper FKs → PostgREST joins work)
  const { data: fromDeployments = [], isLoading: d1 } = useQuery({
    queryKey: ['active_eq_deployments', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_deployments')
        .select(`
          id, deployed_date, billing_basis,
          rate_per_hour, rate_per_day, rate_per_month,
          max_hours_per_day, ot_percentage, fuel_by_client,
          equipment_id, project_id, client_id,
          equipment:equipment_id (
            id, name, equipment_number, category, make, model,
            year_of_manufacture, status
          ),
          projects:project_id (
            id, project_name, project_code, site_name, site_location,
            city, state, pincode, status, nature_of_job,
            contract_value, billing_cycle, payment_terms, gst_rate,
            mobilization_advance, start_date, end_date,
            actual_end_date, mobilization_date, commencement_date,
            client_id
          ),
          clients:client_id (
            id, display_name, business_name
          )
        `)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('deployed_date', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  // Fallback: equipment with current_project_id set but no active deployment record
  const { data: fromEquipment = [], isLoading: d2 } = useQuery({
    queryKey: ['eq_with_project', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('id, name, equipment_number, category, make, model, year_of_manufacture, status, current_project_id')
        .eq('company_id', companyId)
        .not('current_project_id', 'is', null)
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  // Merge: deployment records first, then add any equipment not already covered
  const deployedEquipIds = useMemo(() => new Set(fromDeployments.map(d => d.equipment_id)), [fromDeployments])

  const fallbackItems = useMemo(() =>
    fromEquipment
      .filter(eq => !deployedEquipIds.has(eq.id))
      .map(eq => ({
        id: `fallback-${eq.id}`,
        equipment_id: eq.id,
        project_id: eq.current_project_id,
        deployed_date: null,
        billing_basis: null, rate_per_hour: null, rate_per_day: null, rate_per_month: null,
        max_hours_per_day: null, ot_percentage: null, fuel_by_client: false,
        equipment: eq,
        projects: null,   // will show without project details
        clients: null,
        _fallback: true,
      })),
    [fromEquipment, deployedEquipIds]
  )

  const all = useMemo(() => [...fromDeployments, ...fallbackItems], [fromDeployments, fallbackItems])

  const filtered = useMemo(() => {
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter(dep =>
      dep.equipment?.name?.toLowerCase().includes(q) ||
      dep.equipment?.equipment_number?.toLowerCase().includes(q) ||
      dep.projects?.project_name?.toLowerCase().includes(q) ||
      dep.projects?.city?.toLowerCase().includes(q) ||
      dep.projects?.site_name?.toLowerCase().includes(q) ||
      dep.clients?.display_name?.toLowerCase().includes(q) ||
      dep.clients?.business_name?.toLowerCase().includes(q)
    )
  }, [all, search])

  const uniqueProjects = useMemo(
    () => new Set(all.map(d => d.project_id).filter(Boolean)).size,
    [all]
  )

  const isLoading = d1 || d2

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Active Deployments</h1>
        <p className="text-sm text-slate-400 mt-0.5">Equipment currently deployed on site</p>
      </div>

      {all.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary-400">{all.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Machines on Site</p>
          </div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{uniqueProjects}</p>
            <p className="text-xs text-slate-400 mt-0.5">Active Projects</p>
          </div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">
              {all.filter(d => daysOn(d.deployed_date) !== null && daysOn(d.deployed_date) > 90).length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">90d+ Deployed</p>
          </div>
        </div>
      )}

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

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1,2,3].map(i => <div key={i} className="bg-dark-800 border border-dark-700 rounded-xl p-4 animate-pulse h-32" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Truck className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">No active deployments found</p>
          <p className="text-slate-500 text-sm mt-1 max-w-xs">
            Open Equipment & Machines, select a machine, and use the Deploy button to assign it to a project.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(dep => (
            <EquipCard key={dep.id} dep={dep} onClick={() => setSelected(dep)} />
          ))}
        </div>
      )}

      {selected && (
        <DeploymentPanel dep={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
