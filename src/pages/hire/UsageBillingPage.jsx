import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { nextDocNumber } from '../../utils/docNumbers'
import { format } from 'date-fns'
import { calculateUsageBill } from '../../lib/usageBilling'
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
        .select('id, display_name, business_name, address, billing_address, state, billing_state, gstin')
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
function SuccessBanner({ invoice, onDismiss, onNavigate }) {
  return (
    <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-4 flex items-start gap-3">
      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-emerald-300">Invoice generated — {invoice.invoice_number}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Draft invoice saved · Total {fmtMoney(invoice.total_amount)} · Period {fmtDate(invoice.period_from)} – {fmtDate(invoice.period_to)}
        </p>
        <button onClick={() => onNavigate?.('sales', { tab: 'invoices' })} className="text-xs text-primary-300 hover:underline mt-2">Open in Sales → Invoices</button>
      </div>
      <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 shrink-0"><X className="w-4 h-4" /></button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsageBillingPage({ onNavigate, initialDeploymentId, initialMonth }) {
  const { companyId } = useAuth()
  const qc = useQueryClient()

  const [selectedDep,    setSelectedDep]    = useState(null)
  const [billingMonth,   setBillingMonth]   = useState(/^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth || '') ? initialMonth : format(new Date(), 'yyyy-MM'))
  const [gstRate,        setGstRate]        = useState(18)
  const [generating,     setGenerating]     = useState(false)
  const [lastInvoice,    setLastInvoice]    = useState(null)
  const [contractId, setContractId] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [adjustment, setAdjustment] = useState({ description: '', amount: '' })
  const [taxMode, setTaxMode] = useState('intra')

  // ── Active deployments ───────────────────────────────────────────────────────
  const { data: deployments = [], isLoading: depsLoading } = useQuery({
    queryKey: ['active_deps_billing', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_deployments')
        .select(`
          id, deployed_date, withdrawn_date, work_order_ref, billing_basis, working_days_per_month, max_hours_per_day,
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

  useEffect(() => {
    if (initialDeploymentId && deployments.length) setSelectedDep(deployments.find(dep => dep.id === initialDeploymentId) || null)
  }, [initialDeploymentId, deployments])

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
  const { data: contracts = [], isLoading: contractsLoading } = useQuery({
    queryKey: ['usage_contracts', companyId, selectedDep?.equipment_id, effectiveClientId, selectedDep?.project_id, billingMonth],
    queryFn: async () => {
      const { data, error } = await supabase.from('hire_contracts')
        .select('id, contract_number, status, equipment_id, client_id, project_id, start_date, end_date, billing_basis, rate, minimum_hours_per_day, overtime_rate, gst_applicable, gst_rate, terms_conditions, billing_rules')
        .eq('company_id', companyId).eq('equipment_id', selectedDep.equipment_id)
        .eq('client_id', effectiveClientId).lte('start_date', periodEnd)
        .in('status', ['active', 'completed']).order('start_date', { ascending: false })
      if (error) throw error
      return (data || []).filter(c => (!c.project_id || c.project_id === selectedDep.project_id) && (!c.end_date || c.end_date >= periodStart))
    },
    enabled: !!companyId && !!selectedDep && !!effectiveClientId && !!periodStart,
  })
  const selectedContract = contracts.find(c => c.id === contractId) || null

  const { data: previousInvoice, isLoading: invoiceLoading, error: invoiceError } = useQuery({
    queryKey: ['usage_invoice', companyId, selectedDep?.id, periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_invoices')
        .select('id, invoice_number, status').eq('company_id', companyId)
        .eq('billing_deployment_id', selectedDep.id)
        .eq('billing_period_from', periodStart).eq('billing_period_to', periodEnd)
        .neq('status', 'cancelled').maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!companyId && !!selectedDep && !!periodStart,
  })

  useEffect(() => { setContractId(''); setReviewed(false); setAdjustment({ description: '', amount: '' }) }, [selectedDep?.id, billingMonth])
  const { data: ops = [], isLoading: opsLoading, error: opsError } = useQuery({
    queryKey: ['ops_billing', companyId, selectedDep?.equipment_id, billingMonth],
    queryFn: async () => {
      const { data, error } = await supabase.from('daily_operations')
        .select('id, ops_date, shift_type, status, running_hours, kilometer_run, fuel_consumed, operator_name, activity, workflow_status, logsheet_photo_url, hire_contract_id, project_id, idle_reason')
        .eq('company_id', companyId)
        .eq('equipment_id', selectedDep.equipment_id)
        .gte('ops_date', periodStart)
        .lte('ops_date', periodEnd)
        .order('ops_date')
      if (error) throw error
      return data || []
    },
    enabled: !!selectedDep && !!billingMonth,
  })

  // ── Billing calculations ─────────────────────────────────────────────────────
  const bill = useMemo(() => selectedDep && periodStart && periodEnd
    ? calculateUsageBill({ deployment: selectedDep, contract: selectedContract, operations: ops, periodFrom: periodStart, periodTo: periodEnd, adjustment })
    : null, [selectedDep, selectedContract, ops, periodStart, periodEnd, adjustment])
  const totalHours = bill?.hours || 0
  const workingDays = bill?.workingDays || 0
  const totalFuel = bill?.fuel || 0
  const subtotal = bill?.subtotal || 0
  const taxRate = selectedContract ? (selectedContract.gst_applicable ? Number(selectedContract.gst_rate) : 0) : gstRate
  const taxAmount = Math.round(subtotal * taxRate) / 100
  const total = Math.round((subtotal + taxAmount) * 100) / 100

  // ── Generate invoice ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedDep) return
    if (!effectiveClientId) { toast.error('No client linked to this deployment — set client in Equipment & Machines first'); return }
    if (subtotal <= 0 || !reviewed || previousInvoice || opsError || invoiceError || opsLoading || contractsLoading || invoiceLoading) return
    if (contracts.length > 0 && !selectedContract) return toast.error('Select the applicable hire contract')
    if (taxRate && !selClient?.gstin) return toast.error('Add the client GSTIN before creating a taxable invoice')
    if (adjustment.amount && !adjustment.description.trim()) return toast.error('Explain the manual adjustment')

    setGenerating(true)
    try {
      // 1. Invoice number
      const invoiceNumber = await nextDocNumber(companyId, 'invoice')

      // 2. Build description
      const eq    = selectedDep.equipment
      const month = format(new Date(periodStart), 'MMMM yyyy')
      const desc  = `Equipment Hire — ${eq?.name}${eq?.equipment_number ? ` (${eq.equipment_number})` : ''} — ${month}`

      const id = crypto.randomUUID()
      const invoice = {
        id, company_id: companyId, invoice_number: invoiceNumber,
        invoice_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
        client_name: selClient.business_name || selClient.display_name,
        client_address: selClient.billing_address || selClient.address || '',
        client_gstin: selClient.gstin || '',
        project_id: selectedDep.project_id || '', inv_equipment_id: selectedDep.equipment_id,
        project_name: selProject?.project_name || '',
        work_order_number: selectedDep.work_order_ref || '',
        work_done_from: bill.from, work_done_to: bill.to,
        nature_of_supply: desc, place_of_supply: selClient.billing_state || selClient.state || '',
        subtotal, taxable_amount: subtotal, total_amount: total,
        cgst_rate: taxMode === 'intra' ? taxRate / 2 : 0,
        sgst_rate: taxMode === 'intra' ? taxRate / 2 : 0,
        igst_rate: taxMode === 'inter' ? taxRate : 0,
        cgst_amount: taxMode === 'intra' ? Math.round(taxAmount * 50) / 100 : 0,
        sgst_amount: taxMode === 'intra' ? taxAmount - Math.round(taxAmount * 50) / 100 : 0,
        igst_amount: taxMode === 'inter' ? taxAmount : 0,
        status: 'draft', invoice_type: taxRate ? 'tax_invoice' : 'non_tax',
        notes: `Usage billing review · ${selectedContract?.contract_number || 'deployment rate'} · ${bill.from} to ${bill.to}`,
        terms: selectedContract?.terms_conditions || '',
      }
      const { error } = await supabase.rpc('create_usage_invoice_with_items', {
        p_invoice: invoice,
        p_items: bill.lines.map((line, index) => ({ ...line, description: `${desc} — ${line.description}`, equipment_id: selectedDep.equipment_id, gst_rate: taxRate, sort_order: index })),
        p_billing: { deployment_id: selectedDep.id, contract_id: selectedContract?.id || '', period_from: periodStart, period_to: periodEnd,
          snapshot: { version: 1, reviewed_at: new Date().toISOString(), contract_number: selectedContract?.contract_number || null,
            ...bill, exceptions_acknowledged: reviewed, adjustment: adjustment.description ? adjustment : null, tax_mode: taxMode, tax_rate: taxRate } },
      })
      if (error) throw error

      setLastInvoice({ ...invoice, period_from: bill.from, period_to: bill.to })
      qc.invalidateQueries({ queryKey: ['sales_invoices', companyId] })
      qc.invalidateQueries({ queryKey: ['usage_invoice', companyId, selectedDep.id] })
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
        <p className="text-sm text-slate-400 mt-0.5">Review contract terms and daily logs before creating a draft in Sales</p>
      </div>

      {/* Success banner */}
      {lastInvoice && <SuccessBanner invoice={lastInvoice} onDismiss={() => setLastInvoice(null)} onNavigate={onNavigate} />}

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
                  onClick={() => { setSelectedDep(dep); setLastInvoice(null); setReviewed(false) }} />
              ))}
            </div>
          )}
        </div>

        {/* Month + GST */}
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">2 — Billing Month</p>
            <input type="month" value={billingMonth} onChange={e => { setBillingMonth(e.target.value); setReviewed(false) }}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-primary-500" />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">GST Rate (%)</label>
            <select value={selectedContract ? (selectedContract.gst_applicable ? selectedContract.gst_rate : 0) : gstRate} disabled={!!selectedContract} onChange={e => { setGstRate(Number(e.target.value)); setReviewed(false) }}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-primary-500">
              <option value={0}>0% — Exempt</option>
              <option value={5}>5%</option>
              <option value={12}>12%</option>
              <option value={18}>18% (standard)</option>
              <option value={28}>28%</option>
            </select>
            {selectedContract && <p className="mt-1 text-[11px] text-slate-500">GST follows selected contract.</p>}
            <label className="text-xs text-slate-400 block mt-3 mb-1">Tax treatment</label>
            <select value={taxMode} onChange={e => { setTaxMode(e.target.value); setReviewed(false) }} className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3 py-2 text-xs text-slate-200">
              <option value="intra">Within state · CGST + SGST</option><option value="inter">Across states · IGST</option>
            </select>
          </div>

          {selectedDep && <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
            <label className="text-xs font-semibold text-slate-300 block mb-2">Hire contract</label>
            <select value={contractId} disabled={contractsLoading} onChange={e => { setContractId(e.target.value); setReviewed(false) }}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-100">
              <option value="">{contracts.length ? 'Select applicable contract' : 'No matching active contract · use deployment rate'}</option>
              {contracts.map(c => <option key={c.id} value={c.id}>{c.contract_number} · {c.billing_basis} · {fmtMoney(c.rate)}</option>)}
            </select>
            {selectedContract && <p className="text-[11px] text-slate-400 mt-2">Rules: {selectedContract.billing_rules?.exclude_sundays ? 'Sundays excluded · ' : ''}{selectedContract.billing_rules?.bill_idle_days ? 'Idle billed · ' : ''}{selectedContract.billing_rules?.deduct_breakdown_days ? 'Breakdowns deducted' : 'No breakdown deduction'}</p>}
            {contracts.length > 0 && !selectedContract && <p className="text-[11px] text-amber-400 mt-2">Choose the contract before generating the invoice.</p>}
          </div>}

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

          {opsError ? <div className="rounded-xl border border-red-700/40 p-4 text-xs text-red-300">Daily logs could not be loaded: {opsError.message}</div> : opsLoading ? (
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
                      <p className="text-[10px] text-slate-500">{op.status} · {op.workflow_status || 'unreviewed'} · {op.logsheet_photo_url ? 'logsheet attached' : 'no logsheet'}</p>
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
      {selectedDep && bill && (
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
              {bill.lines.map((line, index) => <div key={index} className="flex items-start justify-between gap-4 text-xs">
                <span className="text-slate-400">{line.description} · {line.quantity} {line.unit} × {fmtMoney(line.rate)}</span>
                <span className="text-slate-100 font-medium whitespace-nowrap">{fmtMoney(line.amount)}</span>
              </div>)}
              {taxRate > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">GST ({taxRate}% · {taxMode === 'intra' ? 'CGST + SGST' : 'IGST'})</span>
                  <span className="text-slate-300">{fmtMoney(taxAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-dark-600 pt-2 mt-1">
                <span className="text-sm font-semibold text-slate-100">Total</span>
                <span className="text-lg font-bold text-emerald-300">{fmtMoney(total)}</span>
              </div>
            </div>

            <div className="border-t border-dark-600 pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-300">Reviewed addition or deduction</p>
              <div className="flex gap-2">
                <input value={adjustment.description} onChange={e => { setAdjustment(a => ({ ...a, description: e.target.value })); setReviewed(false) }}
                  placeholder="Reason, e.g. agreed attachment hire" aria-label="Adjustment reason" className="flex-1 min-w-0 bg-dark-700 rounded-lg border border-dark-600 px-3 py-2 text-xs text-slate-100" />
                <input type="number" step="0.01" value={adjustment.amount} onChange={e => { setAdjustment(a => ({ ...a, amount: e.target.value })); setReviewed(false) }}
                  placeholder="₹ amount" aria-label="Adjustment amount; negative for deduction" className="w-28 bg-dark-700 rounded-lg border border-dark-600 px-3 py-2 text-xs text-slate-100" />
              </div>
              <p className="text-[11px] text-slate-500">Enter a negative amount for a deduction; explain every adjustment.</p>
            </div>

            {bill.exceptions.length > 0 && <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200">
              <p className="font-semibold mb-1">Check before issuing</p>
              <ul className="list-disc pl-4 space-y-1">{bill.exceptions.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
            </div>}
            {previousInvoice && <p className="text-xs text-amber-300">Already billed as {previousInvoice.invoice_number} ({previousInvoice.status}). Void that invoice before creating a replacement.</p>}
            {invoiceError && <p className="text-xs text-red-300">Could not check prior invoices: {invoiceError.message}</p>}
            {taxRate > 0 && selClient && !selClient.gstin && <p className="text-xs text-amber-300">The client needs a GSTIN in Clients before a taxable draft can be created.</p>}
            <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-0.5 accent-primary-500" />
              I checked the contract, log status, missing evidence, deductions, and tax treatment for this draft.
            </label>

            <button
              onClick={handleGenerate}
              disabled={generating || !effectiveClientId || !selClient || !reviewed || subtotal <= 0 || !!previousInvoice || opsLoading || contractsLoading || invoiceLoading || !!invoiceError || !!opsError || (contracts.length > 0 && !selectedContract) || (!!adjustment.amount && !adjustment.description.trim()) || (taxRate > 0 && !selClient.gstin)}
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
