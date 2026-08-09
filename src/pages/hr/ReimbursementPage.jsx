/**
 * ReimbursementPage.jsx
 * Admin / Manager view for employee expense reimbursements.
 *
 * Features:
 *  - List all employee expenses with filters (status, employee, date range)
 *  - Per-employee totals
 *  - Approve / Reject with notes
 *  - Mark as Reimbursed (with payment mode)
 *  - Flag viewer — shows bill ref for future linkage
 *  - Receipt photo viewer
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Receipt, CheckCircle2, XCircle, Clock, Banknote, Search,
  Filter, X, ChevronDown, Loader2, AlertCircle, Image,
  Flag, IndianRupee, Users, Download, RefreshCw, Eye,
  CheckCheck, Fuel, Utensils, Car, Home, HeartPulse,
  Wrench, Phone, Package,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR   = n  => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const fmtDate  = d  => d ? format(new Date(d), 'dd MMM yyyy') : '—'
const fmtDT    = d  => d ? format(new Date(d), 'dd MMM yyyy, h:mm a') : '—'
const monthStr = d  => format(d, 'yyyy-MM')

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORIES = {
  fuel:          { label: 'Fuel',            Icon: Fuel,       color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30'   },
  food:          { label: 'Food / Catering', Icon: Utensils,   color: 'text-pink-400',    bg: 'bg-pink-500/10 border-pink-500/30'     },
  travel:        { label: 'Travel',          Icon: Car,        color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30'     },
  accommodation: { label: 'Stay / Lodge',    Icon: Home,       color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/30'     },
  medical:       { label: 'Medical',         Icon: HeartPulse, color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30'       },
  tools:         { label: 'Tools / Spares',  Icon: Wrench,     color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/30' },
  communication: { label: 'Phone / Data',    Icon: Phone,      color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/30' },
  other:         { label: 'Other',           Icon: Package,    color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/30'   },
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  pending:    { label: 'Pending',     color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',    Icon: Clock        },
  approved:   { label: 'Approved',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30',Icon: CheckCircle2 },
  rejected:   { label: 'Rejected',    color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',        Icon: XCircle      },
  reimbursed: { label: 'Reimbursed', color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/30',        Icon: Banknote     },
}

const PAYMENT_MODES = [
  { value: 'cash',          label: 'Cash'          },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi',           label: 'UPI'           },
  { value: 'cheque',        label: 'Cheque'        },
]

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

// ── Action modal ──────────────────────────────────────────────────────────────
function ActionModal({ record, onClose, onDone, reviewerName, reviewerId }) {
  const [action,  setAction]  = useState('')   // 'approve'|'reject'|'reimburse'
  const [notes,   setNotes]   = useState('')
  const [mode,    setMode]    = useState('cash')
  const [saving,  setSaving]  = useState(false)
  const qc = useQueryClient()

  const handleSave = async () => {
    if (action === 'reject' && !notes.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }
    setSaving(true)
    try {
      let update = {}
      if (action === 'approve') {
        update = {
          status:           'approved',
          reviewed_by:      reviewerId,
          reviewed_by_name: reviewerName,
          reviewed_at:      new Date().toISOString(),
          review_notes:     notes.trim() || null,
        }
      } else if (action === 'reject') {
        update = {
          status:           'rejected',
          reviewed_by:      reviewerId,
          reviewed_by_name: reviewerName,
          reviewed_at:      new Date().toISOString(),
          review_notes:     notes.trim(),
        }
      } else if (action === 'reimburse') {
        update = {
          status:              'reimbursed',
          reimbursed_by:       reviewerId,
          reimbursed_by_name:  reviewerName,
          reimbursed_at:       new Date().toISOString(),
          reimbursed_mode:     mode,
        }
      }

      const { error } = await supabase
        .from('employee_reimbursements')
        .update(update)
        .eq('id', record.id)

      if (error) throw error

      toast.success(
        action === 'approve' ? 'Expense approved' :
        action === 'reject'  ? 'Expense rejected' :
        'Marked as reimbursed'
      )
      qc.invalidateQueries({ queryKey: ['reimb_all'] })
      onDone()
      onClose()
    } catch (e) {
      toast.error('Update failed: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const cat = CATEGORIES[record.category] || CATEGORIES.other
  const { Icon: CatIcon } = cat

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-dark-800 rounded-t-3xl sm:rounded-2xl border border-dark-700 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${cat.bg}`}>
              <CatIcon className={`w-4 h-4 ${cat.color}`} />
            </div>
            <div>
              <p className="font-semibold text-slate-100 text-sm">{record.employee_name}</p>
              <p className="text-xs text-slate-500">{cat.label} · {fmtINR(record.amount)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Description / flags */}
          {record.description && (
            <p className="text-sm text-slate-300 bg-dark-700 rounded-lg p-3">{record.description}</p>
          )}
          {record.flags?.bill_ref && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <Flag className="w-3.5 h-3.5" />
              <span>Bill / Voucher Ref: <strong>{record.flags.bill_ref}</strong></span>
            </div>
          )}

          {/* Action picker */}
          {record.status === 'pending' && (
            <div>
              <p className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-wide">Action</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAction('approve')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all ${
                    action === 'approve'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-dark-700 border-dark-600 text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </button>
                <button
                  onClick={() => setAction('reject')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all ${
                    action === 'reject'
                      ? 'bg-red-500/15 border-red-500/40 text-red-400'
                      : 'bg-dark-700 border-dark-600 text-slate-400'
                  }`}
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          )}

          {record.status === 'approved' && (
            <div>
              <p className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-wide">Action</p>
              <button
                onClick={() => setAction('reimburse')}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all ${
                  action === 'reimburse'
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                    : 'bg-dark-700 border-dark-600 text-slate-400'
                }`}
              >
                <Banknote className="w-4 h-4" /> Mark as Reimbursed
              </button>
            </div>
          )}

          {/* Payment mode (for reimburse action) */}
          {action === 'reimburse' && (
            <div>
              <p className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-wide">Payment Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_MODES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      mode === m.value
                        ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                        : 'bg-dark-700 border-dark-600 text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes (for approve/reject) */}
          {(action === 'approve' || action === 'reject') && (
            <div>
              <p className="text-xs text-slate-400 font-semibold mb-1.5 uppercase tracking-wide">
                Notes {action === 'reject' && <span className="text-red-400">*</span>}
              </p>
              <textarea
                rows={2}
                placeholder={action === 'reject' ? 'Reason for rejection (required)' : 'Optional comments…'}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-600 resize-none"
              />
            </div>
          )}

          {/* Confirm button */}
          {action && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${
                action === 'approve'   ? 'bg-emerald-600 text-white' :
                action === 'reject'    ? 'bg-red-600 text-white' :
                                         'bg-sky-600 text-white'
              }`}
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : action === 'approve' ? <CheckCircle2 className="w-4 h-4" />
                : action === 'reject'  ? <XCircle className="w-4 h-4" />
                :                        <Banknote className="w-4 h-4" />
              }
              {saving ? 'Saving…' :
               action === 'approve'   ? 'Confirm Approval' :
               action === 'reject'    ? 'Confirm Rejection' :
                                        'Confirm Reimbursement'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Expense row ────────────────────────────────────────────────────────────────
function ExpenseRow({ r, onAction, onReceipt }) {
  const cat = CATEGORIES[r.category] || CATEGORIES.other
  const { Icon: CatIcon } = cat

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 space-y-3">
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${cat.bg}`}>
          <CatIcon className={`w-5 h-5 ${cat.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-100">{r.employee_name}</span>
            {r.employee_role && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-slate-400 border border-dark-600">
                {r.employee_role}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{cat.label} · {fmtDate(r.expense_date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-base font-bold text-slate-100">{fmtINR(r.amount)}</span>
          <StatusBadge status={r.status} />
        </div>
      </div>

      {/* Description */}
      {r.description && (
        <p className="text-sm text-slate-400">{r.description}</p>
      )}

      {/* Flags */}
      {r.flags?.bill_ref && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400">
          <Flag className="w-3 h-3" />
          <span>Ref: <strong>{r.flags.bill_ref}</strong></span>
        </div>
      )}

      {/* Review notes */}
      {r.review_notes && (
        <div className={`text-xs p-2.5 rounded-lg flex items-start gap-2 ${
          r.status === 'rejected' ? 'bg-red-500/10 text-red-300' : 'bg-dark-700 text-slate-300'
        }`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {r.review_notes}
        </div>
      )}

      {/* Reimbursed info */}
      {r.status === 'reimbursed' && (
        <div className="text-xs text-sky-400 flex items-center gap-1.5">
          <CheckCheck className="w-3.5 h-3.5" />
          Paid via {r.reimbursed_mode || 'cash'} on {fmtDate(r.reimbursed_at)}
          {r.reimbursed_by_name && ` · ${r.reimbursed_by_name}`}
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex items-center gap-2 pt-1">
        {r.receipt_url && (
          <button
            onClick={() => onReceipt(r.receipt_url)}
            className="flex items-center gap-1.5 text-xs text-primary-400 font-semibold px-3 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-lg"
          >
            <Image className="w-3.5 h-3.5" /> Receipt
          </button>
        )}
        <div className="text-xs text-slate-600">{fmtDT(r.submitted_at)}</div>
        <div className="flex-1" />
        {(r.status === 'pending' || r.status === 'approved') && (
          <button
            onClick={() => onAction(r)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white"
          >
            <Eye className="w-3.5 h-3.5" />
            {r.status === 'pending' ? 'Review' : 'Reimburse'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ReimbursementPage() {
  const { userProfile, companyId } = useAuth()
  const reviewerId   = userProfile?.id
  const reviewerName = userProfile?.full_name || 'Admin'
  const qc = useQueryClient()

  const [statusFilter,   setStatusFilter]   = useState('pending')
  const [search,         setSearch]         = useState('')
  const [activeRecord,   setActiveRecord]   = useState(null)
  const [lightboxUrl,    setLightboxUrl]    = useState(null)

  // ── Fetch all reimbursements ─────────────────────────────────────────────
  const { data: all = [], isLoading, refetch } = useQuery({
    queryKey: ['reimb_all', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_reimbursements')
        .select('*')
        .eq('company_id', companyId)
        .order('submitted_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
    staleTime: 30_000,
  })

  // ── Filters ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let d = all
    if (statusFilter !== 'all') d = d.filter(r => r.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      d = d.filter(r =>
        r.employee_name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.flags?.bill_ref?.toLowerCase().includes(q)
      )
    }
    return d
  }, [all, statusFilter, search])

  // ── Summary by status ────────────────────────────────────────────────────
  const pending    = all.filter(r => r.status === 'pending')
  const approved   = all.filter(r => r.status === 'approved')
  const totalPend  = pending.reduce((s, r) => s + Number(r.amount), 0)
  const totalApprv = approved.reduce((s, r) => s + Number(r.amount), 0)
  const totalPaid  = all.filter(r => r.status === 'reimbursed').reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="flex flex-col h-full bg-dark-900 text-slate-100 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-dark-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-100">Employee Reimbursements</h1>
            <p className="text-sm text-slate-500">Review, approve and process out-of-pocket expenses</p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">

          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            <div
              onClick={() => setStatusFilter('pending')}
              className="cursor-pointer bg-dark-800 border border-dark-700 rounded-2xl p-4 hover:border-amber-500/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Pending</span>
              </div>
              <p className="text-2xl font-bold text-amber-400">{pending.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">{fmtINR(totalPend)} awaiting review</p>
            </div>
            <div
              onClick={() => setStatusFilter('approved')}
              className="cursor-pointer bg-dark-800 border border-dark-700 rounded-2xl p-4 hover:border-emerald-500/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Approved</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{approved.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">{fmtINR(totalApprv)} to be paid</p>
            </div>
            <div
              onClick={() => setStatusFilter('reimbursed')}
              className="cursor-pointer bg-dark-800 border border-dark-700 rounded-2xl p-4 hover:border-sky-500/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Banknote className="w-4 h-4 text-sky-400" />
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Reimbursed</span>
              </div>
              <p className="text-2xl font-bold text-sky-400">{fmtINR(totalPaid)}</p>
              <p className="text-xs text-slate-500 mt-0.5">total paid out</p>
            </div>
          </div>

          {/* ── Filters ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status filter chips */}
            <div className="flex gap-2">
              {[
                { v: 'all',       l: 'All'        },
                { v: 'pending',   l: 'Pending'    },
                { v: 'approved',  l: 'Approved'   },
                { v: 'rejected',  l: 'Rejected'   },
                { v: 'reimbursed',l: 'Reimbursed' },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setStatusFilter(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    statusFilter === v
                      ? 'bg-primary-600 border-primary-500 text-white'
                      : 'bg-dark-800 border-dark-700 text-slate-400 hover:border-dark-600'
                  }`}
                >
                  {l}
                  {v === 'pending' && pending.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px]">
                      {pending.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search name, category…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-dark-800 border border-dark-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-600 w-56"
              />
            </div>
          </div>

          {/* ── List ─────────────────────────────────────────────────────── */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Receipt className="w-14 h-14 text-slate-700 mb-4" />
              <p className="text-slate-400 font-semibold text-lg">
                {all.length === 0 ? 'No reimbursement requests yet' : 'Nothing matches your filter'}
              </p>
              <p className="text-slate-600 text-sm mt-1">
                {all.length === 0
                  ? 'Employees can submit expenses from the mobile app'
                  : 'Try a different status or clear the search'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(r => (
                <ExpenseRow
                  key={r.id}
                  r={r}
                  onAction={setActiveRecord}
                  onReceipt={setLightboxUrl}
                />
              ))}
            </div>
          )}

        </div>
      </div>

      {/* ── Action modal ──────────────────────────────────────────────────── */}
      {activeRecord && (
        <ActionModal
          record={activeRecord}
          reviewerId={reviewerId}
          reviewerName={reviewerName}
          onClose={() => setActiveRecord(null)}
          onDone={() => setActiveRecord(null)}
        />
      )}

      {/* ── Receipt lightbox ─────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6"
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
