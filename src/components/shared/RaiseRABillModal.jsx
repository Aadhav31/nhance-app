import { useState, useEffect, useRef, useId, cloneElement, Children } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { canAccessPage } from '../../lib/navigation'
import { nextDocNumber } from '../../utils/docNumbers'
import OverlayDialog from './OverlayDialog'
import toast from 'react-hot-toast'
import { ArrowLeft, Building2, ChevronRight, FileText, Loader2, X } from 'lucide-react'

const fmtINR = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const inp = (x = '') => `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500 ${x}`
function Field({ label, children, hint }) {
  const id = useId()
  const control = children.type === 'div'
    ? cloneElement(children, { children: Children.map(children.props.children, child => child?.type === 'input' ? cloneElement(child, { id }) : child) })
    : cloneElement(children, { id })
  return <div className="min-w-0"><label htmlFor={id} className="text-xs text-slate-400 mb-1 block">{label}</label>{control}{hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}</div>
}
const money = value => Math.round((value + Number.EPSILON) * 100) / 100

// ── Raise RA Bill Modal ───────────────────────────────────────────────────────
export default function RaiseRABillModal({ companyId, session, onClose, onSaved, preselectedBoqId }) {
  const qc = useQueryClient()
  const { role, hasModule } = useAuth()
  const canCreate = canAccessPage('ra_billing', { role, hasModule }) && !!session?.user?.id && !!companyId
  const [selectedBoqId, setSelectedBoqId] = useState(preselectedBoqId || null)
  const initializedBoq = useRef(null)
  const saveLock = useRef(false)
  const [saveError, setSaveError] = useState('')
  const [incompleteDraft, setIncompleteDraft] = useState(null)
  const [raLines, setRaLines] = useState([])
  const [saving, setSaving] = useState(false)
  const [raForm, setRaForm] = useState({
    bill_date: todayStr(), period_from: '', period_to: '',
    cgst_rate: '0', sgst_rate: '0', igst_rate: '0',
    mob_advance_recovery: '0', sd_amount: '0',
    income_tax_pct: '1', labour_cess_pct: '1',
    other_deductions: '0', other_deductions_note: '',
  })
  const setRF = (k, v) => setRaForm(p => ({ ...p, [k]: v }))

  const { data: boqs = [], isLoading: loadingBoqs, isError: boqError, refetch: retryBoqs } = useQuery({
    queryKey: ['boq_list_for_ra', companyId, preselectedBoqId || 'all'],
    queryFn: async () => {
      let query = supabase.from('boq_documents')
        .select('id, boq_number, title, contract_number, client_name, project_name, sd_pct, mob_advance_pct, it_applicable, it_pct, labour_cess_applicable, labour_cess_pct')
        .eq('company_id', companyId)
        .in('status', ['active','draft'])
        .order('created_at', { ascending: false })
      if (preselectedBoqId) query = query.eq('id', preselectedBoqId)
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
    enabled: !!companyId && canCreate,
  })

  const selectedBoq = boqs.find(boq => boq.id === selectedBoqId)
  const step = selectedBoqId ? 2 : 1

  const { data: boqItems = [], isLoading: loadingItems, isError: itemsError, refetch: retryItems } = useQuery({
    queryKey: ['boq_items_for_ra', selectedBoq?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('boq_items').select('*')
        .eq('boq_id', selectedBoq.id).order('sort_order')
      if (error) throw error
      return data || []
    },
    enabled: !!selectedBoq?.id && canCreate,
    refetchOnWindowFocus: false,
  })

  const selectBoq = boq => { setSelectedBoqId(boq.id); setRaLines([]); setSaveError('') }
  useEffect(() => {
    if (!selectedBoq || loadingItems || itemsError) return
    const changed = initializedBoq.current !== selectedBoq.id
    initializedBoq.current = selectedBoq.id
    if (changed) setRaForm(p => ({ ...p, income_tax_pct: String(selectedBoq.it_pct ?? 1), labour_cess_pct: String(selectedBoq.labour_cess_pct ?? 1) }))
    setRaLines(previous => boqItems.filter(i => Number(i.quantity) > 0).map(i => ({
      boq_item_id: i.id, description: i.description, unit: i.unit,
      rate: Number(i.rate), previous_qty: Number(i.executed_qty || 0),
      current_qty: changed ? '' : previous.find(line => line.boq_item_id === i.id)?.current_qty || '',
    })))
  }, [boqItems, selectedBoq, loadingItems, itemsError])

  // Calculations
  const subtotal      = money(raLines.reduce((s, l) => s + money((parseFloat(l.current_qty) || 0) * (l.rate || 0)), 0))
  const cgst          = money(subtotal * (parseFloat(raForm.cgst_rate) || 0) / 100)
  const sgst          = money(subtotal * (parseFloat(raForm.sgst_rate) || 0) / 100)
  const igst          = money(subtotal * (parseFloat(raForm.igst_rate) || 0) / 100)
  const grossWithTax  = money(subtotal + cgst + sgst + igst)
  const mobRec        = money(parseFloat(raForm.mob_advance_recovery) || 0)
  const itAmt         = (selectedBoq?.it_applicable) ? money(subtotal * (parseFloat(raForm.income_tax_pct) || 0) / 100) : 0
  const lcAmt         = (selectedBoq?.labour_cess_applicable) ? money(subtotal * (parseFloat(raForm.labour_cess_pct) || 0) / 100) : 0
  const sdAmt         = money(parseFloat(raForm.sd_amount) || 0)
  const otherDed      = money(parseFloat(raForm.other_deductions) || 0)
  const totalDed      = money(mobRec + itAmt + lcAmt + sdAmt + otherDed)
  const netPayable    = money(grossWithTax - totalDed)

  const close = () => { if (!saveLock.current) onClose() }
  const removeDraft = async draft => {
    const { error } = await supabase.from('ra_bills').delete()
      .eq('company_id', companyId).eq('id', draft.id)
      .eq('created_by', session.user.id).eq('status', 'draft')
    if (error) throw error
    const { data: remaining, error: readError } = await supabase.from('ra_bills').select('id')
      .eq('company_id', companyId).eq('id', draft.id).maybeSingle()
    if (readError) throw readError
    if (remaining) throw new Error(`Draft ${draft.ra_number} could not be reset. Review it in RA Billing before creating another bill.`)
  }
  const saveRA = async () => {
    if (saveLock.current || !canCreate) return
    setSaveError('')
    const validLines = raLines.filter(l => Number(l.current_qty) > 0)
    if (!selectedBoq || loadingItems || itemsError || boqError) { setSaveError('Load the BOQ and its items before saving.'); return }
    if (!raForm.bill_date || (raForm.period_from && raForm.period_to && raForm.period_from > raForm.period_to)) { setSaveError('Enter a bill date and a valid billing period.'); return }
    const numbers = ['cgst_rate','sgst_rate','igst_rate','mob_advance_recovery','sd_amount','income_tax_pct','labour_cess_pct','other_deductions']
    if (numbers.some(key => !Number.isFinite(Number(raForm[key])) || Number(raForm[key]) < 0) || numbers.filter(key => key.endsWith('rate') || key.endsWith('pct')).some(key => Number(raForm[key]) > 100)) { setSaveError('Enter non-negative amounts and percentage rates between 0 and 100.'); return }
    if (raLines.some(line => !Number.isFinite(Number(line.current_qty)) || Number(line.current_qty) < 0)) { setSaveError('Enter valid non-negative work quantities.'); return }
    if (validLines.some(line => Math.abs(Number(line.current_qty) * 1000 - Math.round(Number(line.current_qty) * 1000)) > 0.000001)) { setSaveError('Work quantities can have at most three decimal places.'); return }
    if (!validLines.length) { setSaveError('Enter quantities for at least one item.'); return }
    if (validLines.some(line => Number(line.current_qty) > Number(boqItems.find(item => item.id === line.boq_item_id)?.quantity || 0) - line.previous_qty + 0.000001)) { setSaveError('A work quantity exceeds the remaining BOQ quantity.'); return }
    if (!Number.isFinite(netPayable) || netPayable < 0) { setSaveError('Deductions cannot exceed the gross bill amount.'); return }
    saveLock.current = true
    setSaving(true)
    let createdDraft = null
    let linesSaved = false
    try {
      if (incompleteDraft) { await removeDraft(incompleteDraft); setIncompleteDraft(null) }
      const { data: latestBoq, error: latestError } = await supabase.from('boq_documents').select('id, status').eq('company_id', companyId).eq('id', selectedBoq.id).single()
      if (latestError) throw latestError
      if (!['active', 'draft'].includes(latestBoq.status)) throw new Error('This BOQ is no longer available for billing. Refresh the BOQ before trying again.')
      const { data: latestItems, error: latestItemsError } = await supabase.from('boq_items').select('*').eq('boq_id', selectedBoq.id)
      if (latestItemsError) throw latestItemsError
      const changed = validLines.some(line => {
        const item = latestItems.find(item => item.id === line.boq_item_id)
        return !item || Number(item.rate) !== line.rate || Number(item.executed_qty || 0) !== line.previous_qty || item.unit !== line.unit || item.description !== line.description || Number(line.current_qty) > Number(item.quantity) - Number(item.executed_qty || 0) + 0.000001
      })
      if (changed) { retryItems(); throw new Error('BOQ quantities or rates changed. Review the refreshed items before trying again.') }
      const raNum = await nextDocNumber(companyId, 'ra_bill')
      createdDraft = { id: crypto.randomUUID(), ra_number: raNum }
      const { data: ra, error } = await supabase.from('ra_bills').insert({
        id: createdDraft.id, company_id: companyId, boq_id: selectedBoq.id, ra_number: raNum,
        bill_date: raForm.bill_date,
        period_from: raForm.period_from || null,
        period_to:   raForm.period_to   || null,
        status: 'draft', subtotal,
        cgst_rate: parseFloat(raForm.cgst_rate) || 0,
        sgst_rate: parseFloat(raForm.sgst_rate) || 0,
        igst_rate: parseFloat(raForm.igst_rate) || 0,
        cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
        total_amount: grossWithTax,
        mob_advance_recovery: mobRec,
        income_tax_pct:  parseFloat(raForm.income_tax_pct) || 0, income_tax_amt: itAmt,
        labour_cess_pct: parseFloat(raForm.labour_cess_pct) || 0, labour_cess_amt: lcAmt,
        sd_amount: sdAmt,
        other_deductions: otherDed, other_deductions_note: raForm.other_deductions_note || null,
        net_payable: netPayable, certified_amount: netPayable,
        retention_pct: 0, retention_amt: 0,
        created_by: session.user.id,
      }).select().single()
      if (error) throw error
      if (!ra?.id) throw new Error('Could not confirm the saved draft. Try again.')
      createdDraft = ra

      const items = validLines.map((l, i) => ({
        ra_bill_id: ra.id, boq_item_id: l.boq_item_id,
        description: l.description, unit: l.unit, rate: l.rate,
        previous_qty:  parseFloat(l.previous_qty) || 0,
        current_qty:   parseFloat(l.current_qty) || 0,
        total_qty:     (parseFloat(l.previous_qty) || 0) + (parseFloat(l.current_qty) || 0),
        current_amount:money((parseFloat(l.current_qty) || 0) * (l.rate || 0)),
        sort_order: i,
      }))
      const { error: ie } = await supabase.from('ra_bill_items').insert(items)
      if (ie) throw ie
      linesSaved = true

      qc.invalidateQueries({ queryKey: ['ra_bills_global', companyId] })
      qc.invalidateQueries({ queryKey: ['boq_items', selectedBoq.id] })
      qc.invalidateQueries({ queryKey: ['boq_items_for_ra', selectedBoq.id] })
      qc.invalidateQueries({ queryKey: ['ra_bills', selectedBoq.id] })
      qc.invalidateQueries({ queryKey: ['boq_documents', companyId] })

      toast.success(`${raNum} raised — Net payable ${fmtINR(netPayable)}`)
      onSaved(ra)
    } catch (e) {
      let message = e.message || 'Could not save the bill. Try again.'
      if (createdDraft && !linesSaved) {
        try {
          await removeDraft(createdDraft)
        } catch {
          setIncompleteDraft(createdDraft)
          message += ` Draft ${createdDraft.ra_number} could not be completed. Retry before raising another bill.`
        }
      }
      setSaveError(message)
    } finally { saveLock.current = false; setSaving(false) }
  }

  if (!canCreate) return null
  const unavailable = selectedBoqId && !loadingBoqs && !boqError && !selectedBoq

  return (
    <OverlayDialog label="Raise RA Bill" onClose={close} className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-2 sm:p-4">
    <div className="absolute inset-0" onClick={close} />
    <div className="relative w-full max-w-3xl flex justify-center">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-3xl max-h-[94dvh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {step === 2 && !preselectedBoqId && (
              <button onClick={() => { setSelectedBoqId(null); setRaLines([]); setSaveError('') }} disabled={saving} className="text-slate-500 hover:text-slate-300">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="font-bold text-slate-100">Raise RA Bill</p>
              {selectedBoq && <><p className="text-xs text-slate-500 break-words">{selectedBoq.title} · {selectedBoq.contract_number || selectedBoq.boq_number}</p><p className="text-xs text-slate-400 break-words">{selectedBoq.client_name}{selectedBoq.project_name ? ` · ${selectedBoq.project_name}` : ""}</p></>}
            </div>
          </div>
          <button aria-label="Close RA bill form" onClick={close} disabled={saving} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>

        {saveError && <p role="alert" className="px-5 py-3 text-sm text-red-400 bg-red-500/10 shrink-0">{saveError}</p>}
        {loadingBoqs && <p role="status" className="p-5 text-sm text-slate-400">Loading BOQ contracts…</p>}
        {boqError && <div role="alert" className="p-5 text-sm text-red-400">Could not load BOQ contracts. <button type="button" onClick={() => retryBoqs()} className="underline">Try again</button></div>}
        {unavailable && <p role="alert" className="p-5 text-sm text-amber-400">This BOQ is unavailable or is completed/cancelled. Choose an active BOQ before raising a bill.</p>}
        {/* Step 1 — Select BOQ */}
        {step === 1 && !loadingBoqs && !boqError && (
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-xs text-slate-400 mb-3">Select the BOQ contract for this RA Bill</p>
            <div className="space-y-2">
              {boqs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-12">No active BOQs found. Create one in the BOQ module first.</p>
              ) : boqs.map(b => (
                <button key={b.id} onClick={() => selectBoq(b)}
                  className="w-full text-left bg-dark-800 border border-dark-700 hover:border-primary-600/50 rounded-xl p-4 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-primary-400">{b.boq_number}</p>
                      <p className="font-semibold text-slate-100">{b.title}</p>
                      {b.client_name && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3" />{b.client_name}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Work quantities + deductions */}
        {step === 2 && selectedBoq && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5"><fieldset disabled={saving} className="min-w-0 space-y-5">
              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Bill Date *"><input type="date" className={inp()} value={raForm.bill_date} onChange={e => setRF('bill_date', e.target.value)} /></Field>
                <Field label="Period From"><input type="date" className={inp()} value={raForm.period_from} onChange={e => setRF('period_from', e.target.value)} /></Field>
                <Field label="Period To"><input type="date" className={inp()} value={raForm.period_to} onChange={e => setRF('period_to', e.target.value)} /></Field>
              </div>

              {/* Work Done Table */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Measurement — Work Done This Bill</p>
                <div className="border border-dark-700 rounded-xl overflow-hidden">
                  <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_50px_70px_72px_80px_80px] text-[10px] text-slate-500 uppercase tracking-wider px-3 py-2 bg-dark-800/80 border-b border-dark-700">
                    <span>Item Description</span>
                    <span>Unit</span>
                    <span className="text-right">Rate</span>
                    <span className="text-right">Prev Qty</span>
                    <span className="text-right">Cur Qty *</span>
                    <span className="text-right">Amount</span>
                  </div>
                  {loadingItems ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                    </div>
                  ) : itemsError ? <div role="alert" className="p-4 text-sm text-red-400">Could not load BOQ items. <button type="button" onClick={() => retryItems()} className="underline">Try again</button></div> : raLines.length === 0 ? <p className="p-4 text-sm text-slate-500">This BOQ has no billable items. Add quantities in BOQ Items first.</p> : raLines.map((l, i) => {
                    const boqItem = boqItems.find(x => x.id === l.boq_item_id)
                    const boqQty  = Number(boqItem?.quantity || 0)
                    const remaining = boqQty - Number(l.previous_qty || 0)
                    return (
                      <div key={l.boq_item_id}
                        className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_50px_70px_72px_80px_80px] gap-y-3 sm:gap-y-0 border-b border-dark-800 last:border-0 items-center px-3 py-2.5">
                        <div className="col-span-2 sm:col-span-1 min-w-0">
                          <p className="text-xs text-slate-200 sm:truncate">{l.description}</p>
                          <p className="text-[10px] text-slate-600">BOQ: {boqQty.toLocaleString()} · Remaining: {remaining.toLocaleString()}</p>
                        </div>
                        <p className="text-xs text-slate-500"><span className="sm:hidden">Unit: </span>{l.unit}</p>
                        <p className="text-xs text-slate-400 text-right"><span className="sm:hidden">Rate: </span>{fmtINR(l.rate)}</p>
                        <p className="text-xs text-slate-500 sm:text-right"><span className="sm:hidden">Previous qty: </span>{Number(l.previous_qty).toLocaleString()}</p>
                        <div className="space-y-1 sm:contents"><label htmlFor={`ra-qty-${l.boq_item_id}`} className="text-xs text-slate-400 sm:hidden">Current quantity</label><input id={`ra-qty-${l.boq_item_id}`} type="number" step="0.001" min="0"
                          className="text-xs bg-dark-600 border border-dark-500 focus:border-primary-500 rounded px-2 py-1.5 text-right text-slate-100 focus:outline-none w-full"
                          aria-label={`Current quantity for ${l.description}`} max={Math.max(0, remaining)} placeholder="0" value={l.current_qty}
                          onChange={e => setRaLines(p => p.map((x, j) => j === i ? { ...x, current_qty: e.target.value } : x))} /></div>
                        <p className="col-span-2 sm:col-span-1 text-xs font-semibold text-slate-200 text-right">
                          <span className="sm:hidden">Amount: </span>{fmtINR(money((parseFloat(l.current_qty) || 0) * (l.rate || 0)))}
                        </p>
                      </div>
                    )
                  })}
                  {/* Subtotal row */}
                  <div className="flex justify-between items-center px-3 py-2 bg-dark-800/50 border-t border-dark-700">
                    <span className="text-xs font-bold text-slate-400">Value of Work Done</span>
                    <span className="text-sm font-black text-slate-100">{fmtINR(subtotal)}</span>
                  </div>
                </div>
              </div>

              {/* Tax */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">GST</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="CGST %"><input type="number" className={inp()} value={raForm.cgst_rate} onChange={e => setRF('cgst_rate', e.target.value)} step="0.01" /></Field>
                  <Field label="SGST %"><input type="number" className={inp()} value={raForm.sgst_rate} onChange={e => setRF('sgst_rate', e.target.value)} step="0.01" /></Field>
                  <Field label="IGST %"><input type="number" className={inp()} value={raForm.igst_rate} onChange={e => setRF('igst_rate', e.target.value)} step="0.01" /></Field>
                </div>
              </div>

              {/* Recoveries */}
              <div className="bg-dark-800/60 border border-orange-700/20 rounded-xl p-4">
                <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-3">Recoveries & Deductions</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Mob. Advance Recovery (₹)">
                    <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.mob_advance_recovery} onChange={e => setRF('mob_advance_recovery', e.target.value)} step="0.01" />
                  </Field>
                  <Field label="Security Deposit (₹)" hint={`BOQ default: ${selectedBoq.sd_pct}% of subtotal = ${fmtINR(subtotal * (selectedBoq.sd_pct || 0) / 100)}`}>
                    <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.sd_amount} onChange={e => setRF('sd_amount', e.target.value)} step="0.01" />
                  </Field>
                  {selectedBoq.it_applicable && (
                    <Field label="Income Tax / TDS (%)">
                      <div className="flex gap-2">
                        <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.income_tax_pct} onChange={e => setRF('income_tax_pct', e.target.value)} step="0.01" />
                        <div className="flex items-center justify-center text-xs text-orange-400 font-bold w-24 bg-dark-700 border border-dark-600 rounded-lg shrink-0">{fmtINR(itAmt)}</div>
                      </div>
                    </Field>
                  )}
                  {selectedBoq.labour_cess_applicable && (
                    <Field label="Labour Cess (%)">
                      <div className="flex gap-2">
                        <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.labour_cess_pct} onChange={e => setRF('labour_cess_pct', e.target.value)} step="0.01" />
                        <div className="flex items-center justify-center text-xs text-orange-400 font-bold w-24 bg-dark-700 border border-dark-600 rounded-lg shrink-0">{fmtINR(lcAmt)}</div>
                      </div>
                    </Field>
                  )}
                  <Field label="Other Deductions (₹)">
                    <input type="number" className={`${inp()} border-orange-700/40`} value={raForm.other_deductions} onChange={e => setRF('other_deductions', e.target.value)} step="0.01" />
                  </Field>
                  <Field label="Deduction Description">
                    <input className={inp()} placeholder="e.g. Penalty, Advance" value={raForm.other_deductions_note} onChange={e => setRF('other_deductions_note', e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Bill Summary</p>
                {[
                  ['Value of Work Done',       subtotal,       'text-slate-300'],
                  cgst > 0 ? ['CGST',          cgst,           'text-slate-400'] : null,
                  sgst > 0 ? ['SGST',          sgst,           'text-slate-400'] : null,
                  igst > 0 ? ['IGST',          igst,           'text-slate-400'] : null,
                  ['Gross Amount (incl. Tax)', grossWithTax,   'text-slate-200 font-bold'],
                  mobRec > 0 ? ['Less: Mob. Advance Recovery', -mobRec, 'text-orange-400'] : null,
                  itAmt > 0  ? [`Less: TDS @ ${raForm.income_tax_pct}%`, -itAmt, 'text-orange-400'] : null,
                  lcAmt > 0  ? [`Less: Labour Cess @ ${raForm.labour_cess_pct}%`, -lcAmt, 'text-orange-400'] : null,
                  sdAmt > 0  ? ['Less: Security Deposit',     -sdAmt,   'text-orange-400'] : null,
                  otherDed > 0 ? [`Less: ${raForm.other_deductions_note || 'Other Deductions'}`, -otherDed, 'text-orange-400'] : null,
                  ['NET PAYABLE',              netPayable,     'text-emerald-400 font-black text-base'],
                ].filter(Boolean).map(([label, val, cls]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className={`text-xs ${cls}`}>{val < 0 ? '−' : ''}{fmtINR(Math.abs(val))}</span>
                  </div>
                ))}
              </div>
            </fieldset></div>

            <div className="flex flex-wrap gap-3 justify-end px-5 pb-5 pt-3 border-t border-dark-800 shrink-0">
              <button onClick={close} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={saveRA} disabled={saving || loadingItems || itemsError || !raLines.length}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-xl">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Raise RA Bill — {fmtINR(netPayable)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </OverlayDialog>
  )
}

