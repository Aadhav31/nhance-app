import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { nextDocNumber } from '../../utils/docNumbers'
import { format, getDaysInMonth, startOfMonth, endOfMonth } from 'date-fns'
import {
  Truck, IndianRupee, FileText, CheckCircle, ChevronRight,
  Loader2, Building2, CalendarDays, Receipt, X,
} from 'lucide-react'
import toast from 'react-hot-toast'

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtDate  = (d) => d ? format(new Date(d), 'd MMM yyyy') : '—'

// ── Per-deployment billing query hooks ───────────────────────────────────────
function useProjectDetail(projectId) {
  return useQuery({
    queryKey: ['proj_billing', projectId],
    queryFn: async () => {
      if (!projectId) return null
      const { data } = await supabase.from('projects')
        .select('id, project_name, project_code, client_id, billing_cycle, payment_terms, gst_rate')
        .eq('id', projectId).single()
      return data
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  })
}

function useClientDetail(clientId) {
  return useQuery({
    queryKey: ['client_billing', clientId],
    queryFn: async () => {
      if (!clientId) return null
      const { data } = await supabase.from('clients')
        .select('id, display_name, business_name')
        .eq('id', clientId).single()
      return data
    },
    enabled: !!clientId,
    staleTime: 10 * 60 * 1000,
  })
}

// ── Deployment card (selectable) ─────────────────────────────────────────────
function DepCard({ dep, selected, onClick }) {
  const eq = dep.equipment
  const { data: pr }     = useProjectDetail(dep.project_id)
  const { data: client } = useClientDetail(dep.client_id || pr?.client_id)

  const rateLabel = () => {
    if (dep.billing_basis === 'hourly'  && dep.rate_per_hour)  return `₹${Number(dep.rate_per_hour).toLocaleString('en-IN')}/hr`
    if (dep.billing_basis === 'daily'   && dep.rate_per_day)   return `₹${Number(dep.rate_per_day).toLocaleString('en-IN')}/day`
    if (dep.billing_basis === 'monthly' && dep.rate_per_month) return `₹${Number(dep.rate_per_month).toLocaleString('en-IN')}/mo`
    return 'Rate not set'
  }

  return (
    <div onClick={onClick}
      className={`p-3 rounded-xl border cursor-pointer transition-all ${
        selected
          ? 'border-primary-500 bg-primary-500/5'
          : 'border-dark-700 bg-dark-800 hover:border-dark-500'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected ? 'bg-primary-500/20' : 'bg-dark-700'}`}>
            <Truck className={`w-4 h-4 ${selected ? 'text-primary-400' : 'text-slate-500'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{eq?.name || '—'}</p>
            <p className="text-xs text-slate-400 truncate">
              {[eq?.equipment_number, eq?.category].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-emerald-400 font-medium">{rateLabel()}</p>
          {pr && <p className="text-[10px] text-slate-500 truncate max-w-[100px]">{pr.project_name}</p>}
        </div>
      </div>
      {client && (
        <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
          <Building2 className="w-3 h-3" />{client.display_name || client.business_name}
        </p>
      )}
    </div>
  )
}

// ── Invoice Success Banner ────────────────────────────────────────────────────
function SuccessBanner({ invoice, onDismiss }) {
  return (
    <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-4 flex items-start gap-3">
      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-emerald-300">Invoice generated — {invoice.invoice_number}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Draft invoice saved · Total {fmtMoney(invoice.total_amount)} · Period {fmtDate(invoice.period_from)} – {fmtDate(invoice.period_to)}
        </p>
        <p className="text-xs text-slate-500 mt-1">Open <strong>Sales &amp; Invoicing</strong> to review, edit, and send it to the client.</p>
      </div>
      <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 shrink-0"><X className="w-4 h-4" /></button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsageBillingPage() {
  const { companyId, userProfile } = useAuth()
  const qc = useQueryClient()

  const [selectedDep,    setSelectedDep]    = useState(null)
  const [billingMonth,   setBillingMonth]   = useState(format(new Date(), 'yyyy-MM'))
  const [gstRate,        setGstRate]        = useState(18)
  const [generating,     setGenerating]     = useState(false)
  const [lastInvoice,    setLastInvoice]    = useState(null)

  // ── Active deployments ───────────────────────────────────────────────────────
  const { data: deployments = [], isLoading: depsLoading } = useQuery({
    queryKey: ['active_deps_billing', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_deployments')
        .select(`
          id, deployed_date, billing_basis,
          rate_per_hour, rate_per_day, rate_per_month,
          max_hours_per_day, ot_percentage,
          equipment_id, project_id, client_id,
          equipment:equipment_id (id, name, equipment_number, category, make, model)
        `)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('deployed_date', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  // ── Selected deployment's project + client ────────────────────────────────
  const { data: selProject } = useProjectDetail(selectedDep?.project_id)
  const effectiveClientId   = selectedDep?.client_id || selProject?.client_id
  const { data: selClient }  = useClientDetail(effectiveClientId)

  // ── Billing period dates ─────────────────────────────────────────────────────
  const periodStart = billingMonth ? `${billingMonth}-01` : null
  const periodEnd   = useMemo(() => {
    if (!billingMonth) return null
    const [y, m] = billingMonth.split('-').map(Number)
    return `${billingMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  }, [billingMonth])

  // ── Daily operations for selected equipment + month ──────────────────────────
  const { data: ops = [], isLoading: opsLoading } = useQuery({
    queryKey: ['ops_billing', selectedDep?.equipment_id, billingMonth],
    queryFn: async () => {
      const { data } = await supabase.from('daily_operations')
        .select('id, ops_date, shift_type, status, running_hours, kilometer_run, fuel_consumed, operator_name, activity')
        .eq('company_id', companyId)
        .eq('equipment_id', selectedDep.equipment_id)
        .gte('ops_date', periodStart)
        .lte('ops_date', periodEnd)
        .order('ops_date')
      return data || []
    },
    enabled: !!selectedDep && !!billingMonth,
  })

  // ── Billing calculations ─────────────────────────────────────────────────────
  const totalHours  = useMemo(() => ops.reduce((s, o) => s + (Number(o.running_hours) || 0), 0), [ops])
  const workingDays = useMemo(() => new Set(ops.filter(o => o.status === 'working').map(o => o.ops_date)).size, [ops])
  const totalFuel   = useMemo(() => ops.reduce((s, o) => s + (Number(o.fuel_consumed) || 0), 0), [ops])

  const subtotal = useMemo(() => {
    if (!selectedDep) return 0
    const { billing_basis, rate_per_hour, rate_per_day, rate_per_month } = selectedDep
    if (billing_basis === 'hourly'  && rate_per_hour)  return totalHours * Number(rate_per_hour)
    if (billing_basis === 'daily'   && rate_per_day)   return workingDays * Number(rate_per_day)
    if (billing_basis === 'monthly' && rate_per_month) return Number(rate_per_month)
    return 0
  }, [selectedDep, totalHours, workingDays])

  const taxAmount = useMemo(() => subtotal * (gstRate / 100), [subtotal, gstRate])
  const total     = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount])

  const billingBasisLabel = () => {
    if (!selectedDep) return ''
    const { billing_basis, rate_per_hour, rate_per_day, rate_per_month } = selectedDep
    if (billing_basis === 'hourly')  return `${totalHours.toFixed(1)} hrs × ₹${Number(rate_per_hour).toLocaleString('en-IN')}/hr`
    if (billing_basis === 'daily')   return `${workingDays} working days × ₹${Number(rate_per_day).toLocaleString('en-IN')}/day`
    if (billing_basis === 'monthly') return `Monthly flat — ₹${Number(rate_per_month).toLocaleString('en-IN')}`
    return ''
  }

  // ── Generate invoice ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedDep) return
    if (!effectiveClientId) { toast.error('No client linked to this deployment — set client in Equipment & Machines first'); return }
    if (subtotal === 0)     { toast.error('Billable amount is zero — check rate card and daily operations log'); return }

    setGenerating(true)
    try {
      // 1. Invoice number
      const invoiceNumber = await nextDocNumber(companyId, 'hire_invoice')

      // 2. Build description
      const eq    = selectedDep.equipment
      const month = format(new Date(periodStart), 'MMMM yyyy')
      const desc  = `Equipment Hire — ${eq?.name}${eq?.equipment_number ? ` (${eq.equipment_number})` : ''} — ${month}`

      // 3. Insert invoice
      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        company_id:     companyId,
        invoice_number: invoiceNumber,
        client_id:      effectiveClientId,
        project_id:     selectedDep.project_id || null,
        invoice_date:   format(new Date(), 'yyyy-MM-dd'),
        period_from:    periodStart,
        period_to:      periodEnd,
        subtotal:       Math.round(subtotal * 100) / 100,
        tax_rate:       gstRate,
        tax_amount:     Math.round(taxAmount * 100) / 100,
        total_amount:   Math.round(total * 100) / 100,
        paid_amount:    0,
        due_date:       format(new Date(new Date().setDate(new Date().getDate() + 30)), 'yyyy-MM-dd'),
        status:         'draft',
        notes:          `Auto-generated from daily operations log\n${billingBasisLabel()}${totalFuel > 0 ? `\nFuel consumed: ${totalFuel.toFixed(0)} L` : ''}`,
        created_by:     userProfile?.id || null,
      }).select().single()
      if (invErr) throw invErr

      // 4. Insert summary line item
      const { error: liErr } = await supabase.from('invoice_line_items').insert({
        company_id:  companyId,
        invoice_id:  inv.id,
        equipment_id: selectedDep.equipment_id,
        description: desc,
        quantity:    selectedDep.billing_basis === 'hourly' ? totalHours
                   : selectedDep.billing_basis === 'daily'  ? workingDays
                   : 1,
        unit:        selectedDep.billing_basis === 'hourly'  ? 'hours'
                   : selectedDep.billing_basis === 'daily'   ? 'days'
                   : 'month',
        rate:        selectedDep.billing_basis === 'hourly'  ? Number(selectedDep.rate_per_hour)
                   : selectedDep.billing_basis === 'daily'   ? Number(selectedDep.rate_per_day)
                   : Number(selectedDep.rate_per_month),
        amount:      Math.round(subtotal * 100) / 100,
        sort_order:  1,
      })
      if (liErr) throw liErr

      setLastInvoice(inv)
      qc.invalidateQueries(['invoices', companyId])
      toast.success(`Invoice ${invoiceNumber} created`)
    } catch (err) {
      toast.error(err.message || 'Failed to generate invoice')
    } finally {
      setGenerating(false)
    }
  }

  const STATUS_CLR = { working: 'text-emerald-400', idle: 'text-amber-400', breakdown: 'text-red-400', maintenance: 'text-orange-400' }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Usage Billing</h1>
        <p className="text-sm text-slate-400 mt-0.5">Pull hours from daily operations and generate a hire invoice</p>
      </div>

      {/* Success banner */}
      {lastInvoice && <SuccessBanner invoice={lastInvoice} onDismiss={() => setLastInvoice(null)} />}

      {/* Step 1 — Select deployment + month */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Deployment list */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">1 — Select Deployment</p>
          {depsLoading ? (
            <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-dark-800 rounded-xl animate-pulse" />)}</div>
          ) : deployments.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center bg-dark-800 border border-dark-700 rounded-xl">
              <Truck className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm text-slate-400">No active deployments</p>
              <p className="text-xs text-slate-500 mt-0.5">Deploy equipment from Equipment & Machines first</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deployments.map(dep => (
                <DepCard key={dep.id} dep={dep}
                  selected={selectedDep?.id === dep.id}
                  onClick={() => { setSelectedDep(dep); setLastInvoice(null) }} />
              ))}
            </div>
          )}
        </div>

        {/* Month + GST */}
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">2 — Billing Month</p>
            <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-primary-500" />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">GST Rate (%)</label>
            <select value={gstRate} onChange={e => setGstRate(Number(e.target.value))}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-primary-500">
              <option value={0}>0% — Exempt</option>
              <option value={5}>5%</option>
              <option value={12}>12%</option>
              <option value={18}>18% (standard)</option>
              <option value={28}>28%</option>
            </select>
          </div>

          {/* Selected deployment info */}
          {selectedDep && (
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Deployment Details</p>
              {selProject && (
                <div className="flex items-start gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-300">{selProject.project_name}</p>
                </div>
              )}
              {selClient && (
                <p className="text-xs text-slate-400 pl-5">{selClient.display_name || selClient.business_name}</p>
              )}
              <div className="flex items-start gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-400">Deployed since {fmtDate(selectedDep.deployed_date)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 2 — Daily operations log */}
      {selectedDep && billingMonth && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">3 — Daily Operations Log</p>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Total Hours', value: totalHours.toFixed(1), cls: 'text-primary-400' },
              { label: 'Working Days', value: workingDays, cls: 'text-emerald-400' },
              { label: `Fuel (L)`, value: totalFuel.toFixed(0), cls: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
                <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {opsLoading ? (
            <div className="space-y-1.5">{[1,2,3].map(i => <div key={i} className="h-9 bg-dark-800 rounded animate-pulse" />)}</div>
          ) : ops.length === 0 ? (
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 text-center">
              <p className="text-sm text-slate-400">No operations logged for {format(new Date(periodStart), 'MMMM yyyy')}</p>
              <p className="text-xs text-slate-500 mt-1">Log daily operations in Site Operations to populate billing data</p>
            </div>
          ) : (
            <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[80px_55px_65px_60px_1fr] px-3 py-2 bg-dark-750 border-b border-dark-700 text-[10px] text-slate-500 uppercase tracking-wider gap-1">
                <span>Date</span><span>Shift</span><span className="text-right">Hours</span><span className="text-right">Fuel L</span><span className="pl-2">Operator / Activity</span>
              </div>
              <div className="divide-y divide-dark-700/60">
                {ops.map(op => (
                  <div key={op.id} className="grid grid-cols-[80px_55px_65px_60px_1fr] px-3 py-2 gap-1 items-center">
                    <span className="text-xs text-slate-300">{format(new Date(op.ops_date), 'd MMM')}</span>
                    <span className="text-xs text-slate-500 capitalize">{op.shift_type}</span>
                    <span className={`text-xs text-right font-mono font-semibold ${STATUS_CLR[op.status] || 'text-slate-400'}`}>
                      {op.running_hours != null ? Number(op.running_hours).toFixed(1) : '—'}
                    </span>
                    <span className="text-xs text-right text-slate-500 font-mono">
                      {op.fuel_consumed != null ? Number(op.fuel_consumed).toFixed(0) : '—'}
                    </span>
                    <div className="pl-2 min-w-0">
                      {op.operator_name && <p className="text-xs text-slate-300 truncate">{op.operator_name}</p>}
                      {op.activity && <p className="text-[10px] text-slate-500 truncate">{op.activity}</p>}
                      {!op.operator_name && !op.activity && <p className="text-xs text-slate-600 capitalize">{op.status}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[80px_55px_65px_60px_1fr] px-3 py-2.5 border-t border-dark-600 bg-dark-750 gap-1">
                <span className="text-xs font-bold text-slate-300">Total</span>
                <span />
                <span className="text-xs text-right font-bold text-primary-400 font-mono">{totalHours.toFixed(1)}</span>
                <span className="text-xs text-right font-bold text-amber-400 font-mono">{totalFuel.toFixed(0)}</span>
                <span />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Billing summary + generate */}
      {selectedDep && subtotal > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">4 — Invoice Preview</p>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 space-y-2.5">

            {/* Equipment + Period */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Equipment</span>
              <span className="text-slate-200 font-medium">
                {selectedDep.equipment?.name}
                {selectedDep.equipment?.equipment_number && ` · ${selectedDep.equipment.equipment_number}`}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Period</span>
              <span className="text-slate-200">{fmtDate(periodStart)} – {fmtDate(periodEnd)}</span>
            </div>
            {selProject && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Project</span>
                <span className="text-slate-200">{selProject.project_name}</span>
              </div>
            )}
            {selClient && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Client</span>
                <span className="text-slate-200">{selClient.display_name || selClient.business_name}</span>
              </div>
            )}

            <div className="border-t border-dark-600 pt-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{billingBasisLabel()}</span>
                <span className="text-slate-100 font-medium">{fmtMoney(subtotal)}</span>
              </div>
              {gstRate > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">GST ({gstRate}%)</span>
                  <span className="text-slate-300">{fmtMoney(taxAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-dark-600 pt-2 mt-1">
                <span className="text-sm font-semibold text-slate-100">Total</span>
                <span className="text-lg font-bold text-emerald-300">{fmtMoney(total)}</span>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !effectiveClientId}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-semibold text-sm disabled:opacity-40 transition-colors">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                : <><Receipt className="w-4 h-4" />Generate Draft Invoice</>}
            </button>

            {!effectiveClientId && (
              <p className="text-[10px] text-amber-400 text-center">No client linked to this deployment — add client in Equipment & Machines → Deploy</p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!selectedDep && (
        <div className="flex flex-col items-center py-16 text-center">
          <IndianRupee className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-slate-400">Select an active deployment to begin billing</p>
          <p className="text-slate-500 text-sm mt-1">The system will pull logged hours and calculate the billable amount</p>
        </div>
      )}
    </div>
  )
}
