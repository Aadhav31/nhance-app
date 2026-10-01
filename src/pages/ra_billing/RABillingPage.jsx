/**
 * RABillingPage.jsx — Standalone Running Account Billing Module
 *
 * Features:
 *  • Global view of all RA bills across all BOQs
 *  • KPI dashboard: billed, outstanding, certified, paid
 *  • Filter by BOQ, client, status, date range
 *  • Full detail panel per bill: line items, deductions, to-date totals
 *  • Raise new RA bill (BOQ picker → quantity entry)
 *  • Status workflow: Draft → Submitted → Approved → Paid
 *  • Payment recording modal (mode, date, reference, amount)
 *  • Edit draft bills
 *  • Delete draft bills
 *  • PDF download
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { generateRABillPDF } from '../../lib/raBillPDF'
import { logAction } from '../../lib/auditLog'
import { filterRABills } from '../../lib/commercialFilters'
import { submitApprovalCase } from '../../lib/approvalWorkflow'
import toast from 'react-hot-toast'
import RaiseRABillModal from '../../components/shared/RaiseRABillModal'
import {
  Plus, X, Search, Loader2, ArrowLeft, FileText, Pencil, Trash2,
  Receipt, Check, ChevronDown, ChevronRight, Download, IndianRupee,
  CalendarDays, Building2, ClipboardList, AlertTriangle, TrendingDown,
  BadgeCheck, Banknote, CreditCard, CircleDollarSign, Send, RefreshCw,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR  = (n) => n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const todayStr= () => new Date().toISOString().split('T')[0]
const inp     = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`

const LINE_UNITS = ['nos','m','m²','m³','kg','MT','L','km','bag','sqft','rft','lot','set','hr','day','ls','RM','cum','sqm']

const STATUS_CFG = {
  draft:     { label: 'Draft',     cls: 'bg-slate-500/10 text-slate-400 border-slate-600/50',    dot: 'bg-slate-500' },
  submitted: { label: 'Submitted', cls: 'bg-amber-500/10 text-amber-400 border-amber-700/40',    dot: 'bg-amber-500' },
  approved:  { label: 'Approved',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40', dot: 'bg-emerald-500' },
  paid:      { label: 'Paid',      cls: 'bg-blue-500/10 text-blue-400 border-blue-700/40',       dot: 'bg-blue-500' },
}
const VALID_RA_METRICS = new Set(['all', 'billed', 'outstanding', 'paid', 'approved'])
const VALID_RA_STATUSES = new Set(['all', ...Object.keys(STATUS_CFG)])

const PAYMENT_MODES = ['NEFT','RTGS','Cheque','UPI','Cash','Bank Transfer']

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.draft
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ ra, onClose, onSaved }) {
  const [form, setForm] = useState({
    payment_date: todayStr(),
    payment_mode: 'NEFT',
    payment_ref: '',
    payment_amount: String(ra.net_payable || ''),
    payment_notes: '',
  })
  const [saving, setSaving] = useState(false)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('ra_bills').update({
        status: 'paid',
        payment_date:   form.payment_date || null,
        payment_mode:   form.payment_mode || null,
        payment_ref:    form.payment_ref.trim() || null,
        payment_amount: parseFloat(form.payment_amount) || null,
        payment_notes:  form.payment_notes.trim() || null,
      }).eq('id', ra.id)
      if (error) throw error
      toast.success(`${ra.ra_number} marked as Paid`)
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <div>
            <p className="font-bold text-slate-100">Record Payment</p>
            <p className="text-xs text-slate-500">{ra.ra_number} · Net Payable {fmtINR(ra.net_payable)}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment Date *">
              <input type="date" className={inp()} value={form.payment_date} onChange={e => setF('payment_date', e.target.value)} />
            </Field>
            <Field label="Payment Mode">
              <select className={inp()} value={form.payment_mode} onChange={e => setF('payment_mode', e.target.value)}>
                {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reference / UTR No.">
              <input className={inp()} placeholder="e.g. UTR123456789" value={form.payment_ref} onChange={e => setF('payment_ref', e.target.value)} />
            </Field>
            <Field label="Amount Received (₹)">
              <input type="number" className={inp()} value={form.payment_amount} onChange={e => setF('payment_amount', e.target.value)} step="0.01" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={`${inp()} resize-none`} rows={2} placeholder="e.g. Partial payment, remaining balance pending" value={form.payment_notes} onChange={e => setF('payment_notes', e.target.value)} />
          </Field>
          {parseFloat(form.payment_amount) < Number(ra.net_payable) && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-700/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">Amount received is less than net payable — this will still mark the bill as Paid.</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end px-5 pb-5 pt-2 border-t border-dark-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RA Bill Detail ────────────────────────────────────────────────────────────
function RABillDetail({ ra: initialRa, companyId, session, company, profile, onBack, onRefresh, onNavigate }) {
  const qc = useQueryClient()
  const [ra, setRa] = useState(initialRa)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showItems, setShowItems] = useState(true)
  const [downloadingPDF, setDownloadingPDF] = useState(false)

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['ra_bill_items', ra.id],
    queryFn: async () => {
      const { data } = await supabase.from('ra_bill_items')
        .select('*, boq_item:boq_items(item_code, quantity)')
        .eq('ra_bill_id', ra.id)
        .order('sort_order')
      return data || []
    },
  })

  // To-date totals for this BOQ
  const { data: boqBills = [] } = useQuery({
    queryKey: ['ra_bills_for_boq', ra.boq_id],
    queryFn: async () => {
      const { data } = await supabase.from('ra_bills').select('id, status, sd_amount, mob_advance_recovery, net_payable, created_at')
        .eq('boq_id', ra.boq_id)
        .neq('status', 'draft')
        .order('created_at')
      return data || []
    },
  })

  const boq = ra.boq || {}

  const sdToDate  = boqBills.reduce((s, b) => s + Number(b.sd_amount || 0), 0)
  const mobToDate = boqBills.reduce((s, b) => s + Number(b.mob_advance_recovery || 0), 0)

  const tax        = Number(ra.cgst_amount || 0) + Number(ra.sgst_amount || 0) + Number(ra.igst_amount || 0)
  const deductions = Number(ra.mob_advance_recovery || 0) + Number(ra.income_tax_amt || 0) +
    Number(ra.labour_cess_amt || 0) + Number(ra.sd_amount || 0) +
    Number(ra.other_deductions || 0) + Number(ra.retention_amt || 0)

  const refreshRa = useCallback(async () => {
    const { data } = await supabase.from('ra_bills')
      .select('*, boq:boq_documents(boq_number, title, contract_number, work_order_number, client_name, project_name, sd_pct, mob_advance_pct, it_applicable, it_pct, labour_cess_applicable, labour_cess_pct)')
      .eq('id', ra.id).single()
    if (data) setRa(data)
  }, [ra.id])

  const updateStatus = async (status) => {
    if (status === 'paid') { setShowPaymentModal(true); return }
    const userName = profile?.full_name || session?.user?.email || 'Unknown'
    if (status === 'submitted') {
      const boq = ra.boq || {}
      await submitApprovalCase({
        companyId, documentType: 'ra_bill', documentId: ra.id,
        documentRef: ra.ra_number,
        title: `RA Bill · ${boq.client_name || ''} · ${boq.title || ''}`,
        amount: ra.net_payable, requesterId: session?.user?.id, requesterName: userName,
        snapshot: {
          client: boq.client_name || null, project: boq.project_name || null,
          work_order: boq.work_order_number || null, billing_period: `${ra.period_from || '—'} to ${ra.period_to || '—'}`,
          certified_amount: ra.certified_amount, deductions,
        },
      })
      await supabase.from('ra_bills').update({ status: 'submitted' }).eq('id', ra.id)
    } else {
      await supabase.from('ra_bills').update({ status }).eq('id', ra.id)
    }

    // Audit log
    const boq = ra.boq || {}
    const actionDesc = {
      submitted: `RA Bill ${ra.ra_number} submitted for manager approval — ${boq.client_name || ''}`,
      approved:  `RA Bill ${ra.ra_number} approved / certified — ${boq.client_name || ''}`,
      draft:     `RA Bill ${ra.ra_number} recalled to draft`,
    }
    logAction({
      companyId,
      module:      'ra_billing',
      action:      status,
      recordId:    ra.id,
      recordRef:   ra.ra_number,
      description: actionDesc[status] || `RA Bill ${ra.ra_number} marked ${status}`,
      actorId:     session?.user?.id,
      actorName:   userName,
      actorRole:   profile?.role,
    })

    await refreshRa()
    onRefresh()
    qc.invalidateQueries({ queryKey: ['approval_pending'] })
    toast.success(`RA Bill marked ${STATUS_CFG[status]?.label || status}`)
  }

  const deleteRA = async () => {
    if (!window.confirm(`Delete ${ra.ra_number}? This cannot be undone.`)) return
    const userName = profile?.full_name || session?.user?.email || 'Unknown'
    await supabase.from('ra_bill_items').delete().eq('ra_bill_id', ra.id)
    await supabase.from('ra_bills').delete().eq('id', ra.id)
    logAction({
      companyId,
      module:      'ra_billing',
      action:      'deleted',
      recordId:    ra.id,
      recordRef:   ra.ra_number,
      description: `RA Bill ${ra.ra_number} permanently deleted`,
      actorId:     session?.user?.id,
      actorName:   userName,
      actorRole:   profile?.role,
    })
    onRefresh()
    onBack()
    toast.success('RA Bill deleted')
  }

  const downloadPDF = async () => {
    setDownloadingPDF(true)
    try {
      await generateRABillPDF({ ra, items, company, boqBills })
    } catch (e) { toast.error('PDF generation failed: ' + e.message) }
    finally { setDownloadingPDF(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-800 shrink-0">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-300 mt-0.5 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-mono font-bold text-primary-400">{ra.ra_number}</p>
              <StatusBadge status={ra.status} />
              {ra.boq?.client_name && <span className="text-xs text-slate-500 flex items-center gap-1"><Building2 className="w-3 h-3"/>{ra.boq.client_name}</span>}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {ra.boq?.title || 'BOQ'} · {ra.boq?.contract_number || ra.boq?.boq_number || ''}
            </p>
            {ra.period_from && (
              <p className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                Period: {fmtDate(ra.period_from)} — {fmtDate(ra.period_to)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={downloadPDF} disabled={downloadingPDF}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-300 border border-dark-600 transition-colors">
              {downloadingPDF ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              PDF
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: 'Work Done',   value: fmtINR(ra.subtotal),    color: 'text-slate-100' },
            { label: 'Tax',         value: fmtINR(tax),            color: 'text-slate-300' },
            { label: 'Deductions',  value: fmtINR(deductions),     color: 'text-orange-400' },
            { label: 'Net Payable', value: fmtINR(ra.net_payable), color: 'text-emerald-400' },
          ].map(t => (
            <div key={t.label} className="bg-dark-800 rounded-lg p-2 text-center">
              <p className="text-[10px] text-slate-500">{t.label}</p>
              <p className={`text-sm font-black mt-0.5 ${t.color}`}>{t.value}</p>
            </div>
          ))}
        </div>

        {/* Bill date */}
        <p className="text-[11px] text-slate-600 mt-2">
          Bill Date: {fmtDate(ra.bill_date)}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Line Items */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowItems(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-300 hover:text-slate-100"
          >
            <span>Measurement Abstract ({items.length} items)</span>
            {showItems ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {showItems && (
            <div className="overflow-x-auto border-t border-dark-700">
              {loadingItems ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-600" /></div>
              ) : (
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="border-b border-dark-700 text-[10px] text-slate-500 uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-center">Unit</th>
                      <th className="px-3 py-2 text-right">BOQ Qty</th>
                      <th className="px-3 py-2 text-right">Prev Qty</th>
                      <th className="px-3 py-2 text-right">Cur Qty</th>
                      <th className="px-3 py-2 text-right">Cumulative</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {items.map((it, i) => (
                      <tr key={it.id} className="hover:bg-dark-700/20">
                        <td className="px-3 py-2">
                          <p className="text-slate-200">{it.description}</p>
                          {it.boq_item?.item_code && <p className="text-[10px] text-slate-600">{it.boq_item.item_code}</p>}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-500">{it.unit}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{Number(it.boq_item?.quantity || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{Number(it.previous_qty).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-emerald-400 font-semibold">{Number(it.current_qty).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{Number(it.total_qty || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{fmtINR(it.rate)}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-100">{fmtINR(it.current_amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-dark-600 bg-dark-700/30 font-bold">
                      <td colSpan={7} className="px-3 py-2 text-slate-300">Value of Work Done This Bill</td>
                      <td className="px-3 py-2 text-right text-slate-100">{fmtINR(ra.subtotal)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Bill Calculation */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bill Calculation</p>
          <div className="space-y-1.5">
            {[
              ['Value of Work Done',       ra.subtotal,         'text-slate-300'],
              ra.cgst_amount > 0 ? [`CGST @ ${ra.cgst_rate}%`, ra.cgst_amount, 'text-slate-400'] : null,
              ra.sgst_amount > 0 ? [`SGST @ ${ra.sgst_rate}%`, ra.sgst_amount, 'text-slate-400'] : null,
              ra.igst_amount > 0 ? [`IGST @ ${ra.igst_rate}%`, ra.igst_amount, 'text-slate-400'] : null,
              ['Gross Amount (incl. Tax)', ra.total_amount,     'text-slate-200 font-bold'],
            ].filter(Boolean).map(([label, val, cls]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-slate-500">{label}</span>
                <span className={cls}>{fmtINR(val)}</span>
              </div>
            ))}

            {/* Deductions */}
            {deductions > 0 && (
              <>
                <div className="border-t border-dark-700 my-2" />
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Recoveries & Deductions</p>
                {[
                  ra.mob_advance_recovery > 0 ? ['Less: Mob. Advance Recovery',              -ra.mob_advance_recovery, 'text-orange-400'] : null,
                  ra.income_tax_amt > 0       ? [`Less: TDS @ ${ra.income_tax_pct}%`,         -ra.income_tax_amt,       'text-orange-400'] : null,
                  ra.labour_cess_amt > 0      ? [`Less: Labour Cess @ ${ra.labour_cess_pct}%`,-ra.labour_cess_amt,      'text-orange-400'] : null,
                  ra.sd_amount > 0            ? ['Less: Security Deposit',                    -ra.sd_amount,            'text-orange-400'] : null,
                  ra.retention_amt > 0        ? [`Less: Retention @ ${ra.retention_pct}%`,    -ra.retention_amt,        'text-orange-400'] : null,
                  ra.other_deductions > 0     ? [`Less: ${ra.other_deductions_note || 'Other Deductions'}`, -ra.other_deductions, 'text-orange-400'] : null,
                ].filter(Boolean).map(([label, val, cls]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-slate-500">{label}</span>
                    <span className={cls}>−{fmtINR(Math.abs(val))}</span>
                  </div>
                ))}
              </>
            )}

            <div className="border-t-2 border-dark-600 mt-2 pt-2 flex justify-between items-center">
              <span className="text-sm font-bold text-slate-200">NET PAYABLE</span>
              <span className="text-xl font-black text-emerald-400">{fmtINR(ra.net_payable)}</span>
            </div>
          </div>
        </div>

        {/* To-date Recovery Summary */}
        {(sdToDate > 0 || mobToDate > 0) && (
          <div className="bg-dark-800 border border-amber-700/20 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Cumulative Recoveries — This Contract</p>
            <div className="grid grid-cols-2 gap-4">
              {sdToDate > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500">Security Deposit Recovered (Total)</p>
                  <p className="text-base font-black text-orange-400">{fmtINR(sdToDate)}</p>
                </div>
              )}
              {mobToDate > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500">Mob. Advance Recovered (Total)</p>
                  <p className="text-base font-black text-orange-400">{fmtINR(mobToDate)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment info (if paid) */}
        {ra.status === 'paid' && ra.payment_date && (
          <div className="bg-blue-500/10 border border-blue-700/30 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Payment Recorded</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Payment Date', value: fmtDate(ra.payment_date) },
                { label: 'Mode',         value: ra.payment_mode || '—' },
                { label: 'Reference',    value: ra.payment_ref  || '—' },
                { label: 'Amount',       value: fmtINR(ra.payment_amount || ra.net_payable) },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-[10px] text-slate-500">{f.label}</p>
                  <p className="text-xs font-semibold text-blue-300">{f.value}</p>
                </div>
              ))}
              {ra.payment_notes && (
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-[10px] text-slate-500">Notes</p>
                  <p className="text-xs text-slate-300">{ra.payment_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Actions</p>
          <div className="flex flex-wrap gap-2">
            {ra.status === 'draft' && (
              <>
                <button onClick={() => updateStatus('submitted')}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-700/40 font-semibold">
                  <Send className="w-3.5 h-3.5" /> Submit for Approval
                </button>
                <button onClick={deleteRA}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-700/40 font-semibold">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Bill
                </button>
              </>
            )}
            {ra.status === 'submitted' && (
              <button onClick={() => onNavigate?.('approval_center')}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-700/40 font-semibold">
                <BadgeCheck className="w-3.5 h-3.5" /> View Approval Chain
              </button>
            )}
            {ra.status === 'approved' && (
              <button onClick={() => updateStatus('paid')}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-700/40 font-semibold">
                <Banknote className="w-3.5 h-3.5" /> Record Payment & Mark Paid
              </button>
            )}
            {ra.status === 'submitted' && <p className="flex items-center text-xs text-slate-500">Withdraw or review decisions from Approval Centre.</p>}
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <PaymentModal ra={ra} onClose={() => setShowPaymentModal(false)} onSaved={async () => {
          setShowPaymentModal(false)
          await refreshRa()
          onRefresh()
        }} />
      )}
    </div>
  )
}

// ── RA Billing List ───────────────────────────────────────────────────────────
function RABillingList({
  companyId, session, company, onSelect, metricFilter, statusFilter, boqFilter,
  onFiltersChange, initialRaId,
}) {
  const [search, setSearch] = useState('')
  const [showRaise, setShowRaise] = useState(false)

  const { data: raBills = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ra_bills_global', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ra_bills')
        .select(`
          *,
          boq:boq_documents(boq_number, title, contract_number, work_order_number, client_name, project_name,
            sd_pct, mob_advance_pct, it_applicable, it_pct, labour_cess_applicable, labour_cess_pct)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  // KPIs
  const kpi = useMemo(() => {
    const approved = raBills.filter(r => r.status === 'approved')
    const paid     = raBills.filter(r => r.status === 'paid')
    const submitted= raBills.filter(r => r.status === 'submitted')
    const draft    = raBills.filter(r => r.status === 'draft')
    return {
      totalBilled:    raBills.filter(r => r.status !== 'draft').reduce((s, r) => s + Number(r.net_payable || 0), 0),
      outstanding:    [...submitted, ...approved].reduce((s, r) => s + Number(r.net_payable || 0), 0),
      paid:           paid.reduce((s, r) => s + Number(r.net_payable || 0), 0),
      draftCount:     draft.length,
      approvedCount:  approved.length,
    }
  }, [raBills])

  // Unique BOQs for filter
  const boqOptions = useMemo(() => {
    const seen = new Set()
    return raBills.reduce((acc, r) => {
      if (r.boq_id && !seen.has(r.boq_id)) {
        seen.add(r.boq_id)
        acc.push({ id: r.boq_id, label: `${r.boq?.boq_number} · ${r.boq?.title || ''}` })
      }
      return acc
    }, [])
  }, [raBills])

  const filtered = useMemo(() => filterRABills(raBills, {
    metric: metricFilter, status: statusFilter, boqId: boqFilter, search,
  }), [raBills, metricFilter, statusFilter, boqFilter, search])

  useEffect(() => {
    if (!initialRaId || raBills.length === 0) return
    const match = raBills.find(ra => ra.id === initialRaId)
    if (match) onSelect(match, { fromUrl: true })
  }, [initialRaId, onSelect, raBills])

  return (
    <div className="flex flex-col h-full">
      {/* KPI Summary */}
      <div className="px-4 py-3 border-b border-dark-800 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { metric: 'billed', label: 'Total Billed', value: fmtINR(kpi.totalBilled), color: 'text-slate-100', icon: CircleDollarSign },
            { metric: 'outstanding', label: 'Outstanding', value: fmtINR(kpi.outstanding), color: 'text-amber-400', icon: AlertTriangle },
            { metric: 'paid', label: 'Paid Out', value: fmtINR(kpi.paid), color: 'text-blue-400', icon: Banknote },
            { metric: 'approved', label: 'Approved Pending', value: String(kpi.approvedCount), color: 'text-emerald-400', icon: BadgeCheck },
          ].map(t => {
            const Icon = t.icon
            return (
              <button type="button" key={t.label} aria-pressed={metricFilter === t.metric}
                onClick={() => onFiltersChange({ metric: metricFilter === t.metric ? 'all' : t.metric })}
                className={`bg-dark-800 border rounded-xl p-3 flex items-center gap-3 text-left transition-colors ${metricFilter === t.metric ? 'border-primary-500 ring-1 ring-primary-500/30' : 'border-dark-700 hover:border-primary-600/50'}`}>
                <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${t.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500">{t.label}</p>
                  <p className={`text-sm font-black truncate ${t.color}`}>{t.value}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-2.5 border-b border-dark-800 shrink-0 flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-primary-500"
            placeholder="Search RA no., client, contract…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-slate-300"
          aria-label="Filter RA bills by status"
          value={statusFilter} onChange={e => onFiltersChange({ status: e.target.value })}>
          <option value="all">All Status</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {boqOptions.length > 1 && (
          <select className="text-xs bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-slate-300 max-w-[160px] truncate"
            aria-label="Filter RA bills by BOQ"
            value={boqFilter} onChange={e => onFiltersChange({ boqId: e.target.value })}>
            <option value="all">All BOQs</option>
            {boqOptions.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        )}
        <button onClick={() => setShowRaise(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors shrink-0">
          <Plus className="w-4 h-4" /> Raise RA Bill
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-2">
        {!isLoading && !isError && (metricFilter !== 'all' || statusFilter !== 'all' || boqFilter !== 'all' || search.trim()) && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-500/20 bg-primary-500/5 px-3 py-2">
            <p className="text-xs text-slate-400">{filtered.length} RA bill{filtered.length === 1 ? '' : 's'} match the active filters</p>
            <button type="button" onClick={() => { setSearch(''); onFiltersChange({ metric: 'all', status: 'all', boqId: 'all' }) }} className="text-xs text-primary-400 hover:text-primary-300">Clear filters</button>
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400" />
            <div><p className="text-sm font-medium text-red-300">RA bills could not be loaded</p><p className="mt-1 text-xs text-slate-500">{error?.message || 'Please retry the billing register.'}</p></div>
            <button type="button" onClick={() => refetch()} className="btn-secondary text-sm"><RefreshCw className="w-4 h-4" />Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-slate-500">
            <Receipt className="w-12 h-12 text-slate-700" />
            <p className="text-sm">{search || metricFilter !== 'all' || statusFilter !== 'all' || boqFilter !== 'all' ? 'No bills match your filters' : 'No RA bills raised yet'}</p>
            <button onClick={() => setShowRaise(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg">
              <Plus className="w-3.5 h-3.5" /> Raise First RA Bill
            </button>
          </div>
        ) : filtered.map(ra => {
          const tax        = Number(ra.cgst_amount || 0) + Number(ra.sgst_amount || 0) + Number(ra.igst_amount || 0)
          const deductions = Number(ra.mob_advance_recovery || 0) + Number(ra.income_tax_amt || 0) +
            Number(ra.labour_cess_amt || 0) + Number(ra.sd_amount || 0) + Number(ra.other_deductions || 0)
          return (
            <div key={ra.id} onClick={() => onSelect(ra)}
              className="bg-dark-800 border border-dark-700 hover:border-primary-600/40 rounded-xl p-4 cursor-pointer transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-mono font-bold text-primary-400">{ra.ra_number}</p>
                    <StatusBadge status={ra.status} />
                  </div>
                  <p className="font-semibold text-slate-100 truncate mt-0.5">{ra.boq?.title || 'Untitled BOQ'}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {ra.boq?.client_name && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />{ra.boq.client_name}
                      </span>
                    )}
                    {ra.boq?.contract_number && (
                      <span className="text-xs text-slate-600">{ra.boq.contract_number}</span>
                    )}
                    <span className="text-xs text-slate-600 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {ra.period_from ? `${fmtDate(ra.period_from)} → ${fmtDate(ra.period_to)}` : fmtDate(ra.bill_date)}
                    </span>
                  </div>
                  {deductions > 0 && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] text-slate-600">Gross {fmtINR(ra.total_amount)}</span>
                      <span className="text-[10px] text-orange-400 flex items-center gap-0.5">
                        <TrendingDown className="w-2.5 h-2.5" />Deductions {fmtINR(deductions)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-slate-100">{fmtINR(ra.net_payable)}</p>
                  <p className="text-[10px] text-slate-500">Net Payable</p>
                  {ra.status === 'paid' && ra.payment_date && (
                    <p className="text-[10px] text-blue-400 mt-0.5 flex items-center gap-0.5 justify-end">
                      <Banknote className="w-2.5 h-2.5" />Paid {fmtDate(ra.payment_date)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showRaise && (
        <RaiseRABillModal
          companyId={companyId} session={session}
          preselectedBoqId={boqFilter !== 'all' ? boqFilter : null}
          onClose={() => setShowRaise(false)}
          onSaved={() => setShowRaise(false)}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RABillingPage({
  onNavigate, initialMetric = 'all', initialStatus = 'all', initialBoqId = 'all', initialRaId = null,
}) {
  const { companyId, session, company, userProfile: profile } = useAuth()
  const qc = useQueryClient()
  const [selectedRA, setSelectedRA] = useState(null)
  const [metricFilter, setMetricFilter] = useState(() => VALID_RA_METRICS.has(initialMetric) ? initialMetric : 'all')
  const [statusFilter, setStatusFilter] = useState(() => VALID_RA_STATUSES.has(initialStatus) ? initialStatus : 'all')
  const [boqFilter, setBoqFilter] = useState(initialBoqId || 'all')

  useEffect(() => {
    setMetricFilter(VALID_RA_METRICS.has(initialMetric) ? initialMetric : 'all')
    setStatusFilter(VALID_RA_STATUSES.has(initialStatus) ? initialStatus : 'all')
    setBoqFilter(initialBoqId || 'all')
  }, [initialBoqId, initialMetric, initialStatus])

  useEffect(() => {
    if (!initialRaId) setSelectedRA(null)
  }, [initialRaId])

  const handleFiltersChange = useCallback((patch) => {
    const next = {
      metric: patch.metric ?? metricFilter,
      status: patch.status ?? statusFilter,
      boqId: patch.boqId ?? boqFilter,
    }
    setMetricFilter(next.metric)
    setStatusFilter(next.status)
    setBoqFilter(next.boqId)
    onNavigate?.('ra_billing', next, { replace: true })
  }, [boqFilter, metricFilter, onNavigate, statusFilter])

  const handleSelect = useCallback((ra, { fromUrl = false } = {}) => {
    setSelectedRA(ra)
    if (!fromUrl) {
      onNavigate?.('ra_billing', {
        metric: metricFilter, status: statusFilter, boqId: boqFilter, raId: ra.id,
      })
    }
  }, [boqFilter, metricFilter, onNavigate, statusFilter])

  const handleBack = () => {
    setSelectedRA(null)
    onNavigate?.('ra_billing', { metric: metricFilter, status: statusFilter, boqId: boqFilter }, { replace: true })
  }

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['ra_bills_global', companyId] })
    qc.invalidateQueries({ queryKey: ['ra_bill_items'] })
    qc.invalidateQueries({ queryKey: ['ra_bills_for_boq'] })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-6 pt-5 pb-4 shrink-0 border-b border-dark-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-700/40 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">RA Billing</h1>
            <p className="text-xs text-slate-500">Running Account Bills · Payments · Recovery Tracking</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedRA ? (
          <RABillDetail
            ra={selectedRA}
            companyId={companyId}
            session={session}
            company={company}
            profile={profile}
            onBack={handleBack}
            onRefresh={handleRefresh}
            onNavigate={onNavigate}
          />
        ) : (
          <RABillingList
            companyId={companyId}
            session={session}
            company={company}
            onSelect={handleSelect}
            metricFilter={metricFilter}
            statusFilter={statusFilter}
            boqFilter={boqFilter}
            onFiltersChange={handleFiltersChange}
            initialRaId={initialRaId}
          />
        )}
      </div>
    </div>
  )
}
