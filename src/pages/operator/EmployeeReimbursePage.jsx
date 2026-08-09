/**
 * EmployeeReimbursePage.jsx
 * Mobile-first component rendered inside OperatorPortal's "Reimburse" tab.
 *
 * Features:
 *  - Submit new expense with: category, amount, description, expense date, receipt photo
 *  - Flag fields for future linkage (bill ref, equipment, project)
 *  - Own expense history with status badges (pending/approved/rejected/reimbursed)
 *  - Camera capture for receipt via getUserMedia (APK WebView)
 */

import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  Plus, X, Camera, Receipt, Clock, CheckCircle2, XCircle,
  Banknote, ChevronDown, Loader2, Image, Flag, IndianRupee,
  AlertCircle, Fuel, Utensils, Car, Home, HeartPulse,
  Wrench, Phone, Package, MoreHorizontal,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10)
const fmtINR   = n => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const fmtDate  = d => d ? format(new Date(d), 'dd MMM yyyy') : '—'
const inp      = (x = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-600 ${x}`

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'fuel',           label: 'Fuel',              Icon: Fuel,          color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-600/40'   },
  { value: 'food',           label: 'Food / Catering',   Icon: Utensils,      color: 'text-pink-400',    bg: 'bg-pink-500/10 border-pink-600/40'     },
  { value: 'travel',         label: 'Travel',            Icon: Car,           color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-600/40'     },
  { value: 'accommodation',  label: 'Stay / Lodge',      Icon: Home,          color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-600/40'     },
  { value: 'medical',        label: 'Medical',           Icon: HeartPulse,    color: 'text-red-400',     bg: 'bg-red-500/10 border-red-600/40'       },
  { value: 'tools',          label: 'Tools / Spares',    Icon: Wrench,        color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-600/40' },
  { value: 'communication',  label: 'Phone / Data',      Icon: Phone,         color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-600/40' },
  { value: 'other',          label: 'Other',             Icon: Package,       color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-600/40'   },
]
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  pending:     { label: 'Pending',     color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',   Icon: Clock         },
  approved:    { label: 'Approved',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30',Icon: CheckCircle2  },
  rejected:    { label: 'Rejected',    color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',       Icon: XCircle       },
  reimbursed:  { label: 'Reimbursed', color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/30',       Icon: Banknote      },
}

// ── Compress + upload receipt photo ──────────────────────────────────────────
async function uploadReceipt(blob, employeeId) {
  const compressed = await new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const maxW  = 1200
        const scale = img.width > maxW ? maxW / img.width : 1
        const w = img.width * scale, h = img.height * scale
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.80)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(blob)
  })
  const filename = `${employeeId}/${Date.now()}_receipt.jpg`
  const { data, error } = await supabase.storage
    .from('reimbursement-receipts')
    .upload(filename, compressed, { contentType: 'image/jpeg' })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage
    .from('reimbursement-receipts')
    .getPublicUrl(data.path)
  return publicUrl
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending
  const { Icon } = s
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.bg} ${s.color}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  )
}

// ── Expense submission form ────────────────────────────────────────────────────
function SubmitForm({ employeeId, employeeName, employeeRole, companyId, onDone }) {
  const qc = useQueryClient()
  const [cat,       setCat]       = useState('')
  const [amount,    setAmount]    = useState('')
  const [desc,      setDesc]      = useState('')
  const [date,      setDate]      = useState(todayStr())
  const [billRef,   setBillRef]   = useState('')   // flag: bill / voucher reference
  const [receiptBlob, setReceiptBlob] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [capturing,  setCapturing]  = useState(false)
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const fileRef   = useRef(null)

  // ── Camera capture (APK WebView) ────────────────────────────────────────────
  const openCamera = async () => {
    try {
      setCapturing(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
    } catch {
      setCapturing(false)
      // Fallback to file picker if camera unavailable
      fileRef.current?.click()
    }
  }

  const snapPhoto = () => {
    const video  = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      setReceiptBlob(blob)
      setReceiptPreview(URL.createObjectURL(blob))
      stopCamera()
    }, 'image/jpeg', 0.82)
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCapturing(false)
  }

  const onFileChange = e => {
    const f = e.target.files?.[0]
    if (!f) return
    setReceiptBlob(f)
    setReceiptPreview(URL.createObjectURL(f))
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!cat)    { toast.error('Pick a category'); return }
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return }

    setSubmitting(true)
    try {
      let receipt_url = null
      if (receiptBlob) {
        try { receipt_url = await uploadReceipt(receiptBlob, employeeId) } catch { /* non-blocking */ }
      }

      const { error } = await supabase.from('employee_reimbursements').insert({
        company_id:    companyId,
        employee_id:   employeeId,
        employee_name: employeeName,
        employee_role: employeeRole,
        amount:        Number(amount),
        category:      cat,
        description:   desc.trim() || null,
        expense_date:  date,
        receipt_url,
        flags:         billRef.trim() ? { bill_ref: billRef.trim() } : {},
        status:        'pending',
      })
      if (error) throw error

      toast.success('Expense submitted for approval')
      qc.invalidateQueries({ queryKey: ['emp_reimb', employeeId] })
      onDone()
    } catch (e) {
      toast.error('Submit failed: ' + (e.message || e))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Camera overlay ──────────────────────────────────────────────────────────
  if (capturing) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between p-4">
          <button onClick={stopCamera} className="text-white p-2"><X className="w-6 h-6" /></button>
          <span className="text-white font-semibold">Receipt Photo</span>
          <div className="w-10" />
        </div>
        <video ref={videoRef} autoPlay playsInline muted className="flex-1 object-cover w-full" />
        <div className="p-6 flex justify-center">
          <button
            onClick={snapPhoto}
            className="w-20 h-20 rounded-full border-4 border-white bg-white/20 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Camera className="w-10 h-10 text-white" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Category picker */}
      <div>
        <p className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-wide">Category *</p>
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map(c => {
            const { Icon } = c
            const active = cat === c.value
            return (
              <button
                key={c.value}
                onClick={() => setCat(c.value)}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                  active ? `${c.bg} ring-1 ring-primary-500` : 'bg-dark-700 border-dark-600'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? c.color : 'text-slate-500'}`} />
                <span className={`text-[9px] font-semibold text-center leading-tight ${active ? c.color : 'text-slate-500'}`}>
                  {c.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Amount */}
      <div>
        <p className="text-xs text-slate-400 font-semibold mb-1.5 uppercase tracking-wide">Amount Paid *</p>
        <div className="relative">
          <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="number" inputMode="decimal" min="0" step="0.01"
            placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            className={inp('pl-9')}
          />
        </div>
      </div>

      {/* Date */}
      <div>
        <p className="text-xs text-slate-400 font-semibold mb-1.5 uppercase tracking-wide">Expense Date</p>
        <input
          type="date" value={date} onChange={e => setDate(e.target.value)}
          className={inp()}
          style={{ colorScheme: 'dark' }}
        />
      </div>

      {/* Description */}
      <div>
        <p className="text-xs text-slate-400 font-semibold mb-1.5 uppercase tracking-wide">Description</p>
        <textarea
          rows={2} placeholder="What was this expense for?"
          value={desc} onChange={e => setDesc(e.target.value)}
          className={inp('resize-none')}
        />
      </div>

      {/* Flag: Bill / Voucher reference */}
      <div>
        <p className="text-xs text-slate-400 font-semibold mb-1.5 uppercase tracking-wide flex items-center gap-1">
          <Flag className="w-3 h-3 text-amber-400" />
          Bill / Voucher No. <span className="text-slate-600 normal-case font-normal">(for linking later)</span>
        </p>
        <input
          type="text" placeholder="e.g. INV-001, Voucher #123"
          value={billRef} onChange={e => setBillRef(e.target.value)}
          className={inp()}
        />
      </div>

      {/* Receipt photo */}
      <div>
        <p className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-wide">Receipt Photo</p>
        {receiptPreview ? (
          <div className="relative rounded-xl overflow-hidden">
            <img src={receiptPreview} alt="Receipt" className="w-full max-h-52 object-cover rounded-xl border border-dark-600" />
            <button
              onClick={() => { setReceiptBlob(null); setReceiptPreview(null) }}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={openCamera}
              className="flex-1 flex flex-col items-center gap-2 py-5 bg-dark-700 border border-dashed border-dark-600 rounded-xl text-slate-400 active:bg-dark-600 transition-colors"
            >
              <Camera className="w-6 h-6" />
              <span className="text-xs font-semibold">Take Photo</span>
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-2 py-5 bg-dark-700 border border-dashed border-dark-600 rounded-xl text-slate-400 active:bg-dark-600 transition-colors"
            >
              <Image className="w-6 h-6" />
              <span className="text-xs font-semibold">From Gallery</span>
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-4 bg-primary-600 text-white rounded-xl font-bold text-base active:scale-98 transition-transform disabled:opacity-60"
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Receipt className="w-5 h-5" />}
        {submitting ? 'Submitting…' : 'Submit for Approval'}
      </button>
    </div>
  )
}

// ── Expense history card ───────────────────────────────────────────────────────
function ExpenseCard({ r, onViewReceipt }) {
  const cat = CAT_MAP[r.category] || CAT_MAP.other
  const { Icon } = cat
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 active:bg-dark-750"
      >
        {/* Category icon */}
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${cat.bg}`}>
          <Icon className={`w-5 h-5 ${cat.color}`} />
        </div>
        {/* Details */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-slate-100 truncate">{cat.label}</p>
          <p className="text-xs text-slate-500 truncate">{fmtDate(r.expense_date)}</p>
        </div>
        {/* Amount + status */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-bold text-slate-100">{fmtINR(r.amount)}</span>
          <StatusBadge status={r.status} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-dark-700 pt-3">
          {r.description && (
            <p className="text-sm text-slate-300">{r.description}</p>
          )}

          {r.flags?.bill_ref && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <Flag className="w-3 h-3" />
              <span>Ref: {r.flags.bill_ref}</span>
            </div>
          )}

          {r.review_notes && (
            <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
              r.status === 'rejected' ? 'bg-red-500/10 text-red-300' : 'bg-dark-700 text-slate-300'
            }`}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{r.review_notes}</span>
            </div>
          )}

          {r.status === 'reimbursed' && (
            <div className="flex items-center gap-2 text-xs text-sky-400">
              <Banknote className="w-3.5 h-3.5" />
              <span>
                Reimbursed via {r.reimbursed_mode || 'cash'}
                {r.reimbursed_by_name ? ` · by ${r.reimbursed_by_name}` : ''}
                {r.reimbursed_at ? ` on ${fmtDate(r.reimbursed_at)}` : ''}
              </span>
            </div>
          )}

          {r.receipt_url && (
            <button
              onClick={() => onViewReceipt(r.receipt_url)}
              className="flex items-center gap-2 text-xs text-primary-400 font-semibold"
            >
              <Image className="w-3.5 h-3.5" />
              View Receipt
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function EmployeeReimbursePage({ embedded = false }) {
  const { userProfile, companyId } = useAuth()
  const employeeId   = userProfile?.id
  const employeeName = userProfile?.full_name || 'Employee'
  const employeeRole = userProfile?.role || 'operator'

  const [view,         setView]         = useState('history')  // 'history' | 'submit'
  const [filterStatus, setFilterStatus] = useState('all')
  const [lightboxUrl,  setLightboxUrl]  = useState(null)

  // Fetch own expenses
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['emp_reimb', employeeId],
    queryFn: async () => {
      if (!employeeId) return []
      const { data, error } = await supabase
        .from('employee_reimbursements')
        .select('*')
        .eq('company_id', companyId)
        .eq('employee_id', employeeId)
        .order('submitted_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!employeeId && !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const filtered = filterStatus === 'all'
    ? expenses
    : expenses.filter(e => e.status === filterStatus)

  // Summary totals
  const pending    = expenses.filter(e => e.status === 'pending').length
  const approved   = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0)
  const reimbursed = expenses.filter(e => e.status === 'reimbursed').reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="flex flex-col h-full bg-dark-900 text-slate-100">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-dark-800 border-b border-dark-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-slate-100">My Reimbursements</p>
            <p className="text-xs text-slate-500">
              {pending > 0 ? `${pending} pending approval` : 'Track expenses paid from pocket'}
            </p>
          </div>
          <button
            onClick={() => setView(v => v === 'submit' ? 'history' : 'submit')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              view === 'submit'
                ? 'bg-dark-700 border border-dark-600 text-slate-300'
                : 'bg-primary-600 text-white'
            }`}
          >
            {view === 'submit'
              ? <><X className="w-4 h-4" /> Cancel</>
              : <><Plus className="w-4 h-4" /> New Expense</>
            }
          </button>
        </div>
      </div>

      {/* ── Submit form ─────────────────────────────────────────────────────── */}
      {view === 'submit' && (
        <div className="flex-1 overflow-y-auto">
          <SubmitForm
            employeeId={employeeId}
            employeeName={employeeName}
            employeeRole={employeeRole}
            companyId={companyId}
            onDone={() => setView('history')}
          />
        </div>
      )}

      {/* ── History ─────────────────────────────────────────────────────────── */}
      {view === 'history' && (
        <div className="flex-1 overflow-y-auto">
          {/* Summary strip */}
          {expenses.length > 0 && (
            <div className="grid grid-cols-3 gap-2 p-4 pb-2">
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-0.5">Pending</p>
                <p className="text-base font-bold text-amber-400">{pending}</p>
              </div>
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-0.5">Approved</p>
                <p className="text-sm font-bold text-emerald-400">{fmtINR(approved)}</p>
              </div>
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-0.5">Received</p>
                <p className="text-sm font-bold text-sky-400">{fmtINR(reimbursed)}</p>
              </div>
            </div>
          )}

          {/* Status filter chips */}
          {expenses.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar">
              {[
                { v: 'all',       l: 'All'        },
                { v: 'pending',   l: 'Pending'    },
                { v: 'approved',  l: 'Approved'   },
                { v: 'rejected',  l: 'Rejected'   },
                { v: 'reimbursed',l: 'Reimbursed' },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setFilterStatus(v)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    filterStatus === v
                      ? 'bg-primary-600 border-primary-500 text-white'
                      : 'bg-dark-800 border-dark-700 text-slate-400'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div className="p-4 pt-2 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Receipt className="w-12 h-12 text-slate-700 mb-4" />
                <p className="text-slate-400 font-semibold">
                  {expenses.length === 0 ? 'No expenses yet' : 'None in this filter'}
                </p>
                {expenses.length === 0 && (
                  <p className="text-slate-600 text-sm mt-1">
                    Tap + New Expense to submit a reimbursement request
                  </p>
                )}
              </div>
            ) : (
              filtered.map(r => (
                <ExpenseCard key={r.id} r={r} onViewReceipt={setLightboxUrl} />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Receipt lightbox ─────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={lightboxUrl}
            alt="Receipt"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
