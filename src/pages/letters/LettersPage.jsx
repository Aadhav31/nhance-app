/**
 * LettersPage.jsx — Official letter composer + issued document registry
 *
 * Tabs:
 *  1. Compose Letter    — form to generate letters on company letterhead
 *  2. Issued Documents  — all active/voided docs (letters deletable; invoices/POs protected)
 *  3. Deleted (Admin)   — soft-deleted letters only; restore within 30 days; archived after
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { generateLetterPDF, HIDE_TO_BLOCK } from '../../lib/letterheadPDF'
import { createVerification } from '../../lib/docVerify'
import {
  FileText, Download, Loader2, RotateCcw,
  ClipboardList, ExternalLink, ShieldCheck, ShieldOff,
  RefreshCw, Trash2, RotateCcw as Restore, Lock, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LETTER_TYPES = [
  { value: 'Experience Certificate',   label: 'Experience Certificate' },
  { value: 'No Objection Certificate', label: 'NOC (No Objection Certificate)' },
  { value: 'Reference Letter',         label: 'Reference Letter' },
  { value: 'Appointment Letter',       label: 'Appointment Letter' },
  { value: 'Salary Certificate',       label: 'Salary Certificate' },
  { value: 'Warning Letter',           label: 'Warning Letter' },
  { value: 'Transfer Certificate',     label: 'Transfer Certificate' },
  { value: 'Relieving Letter',         label: 'Relieving Letter' },
  { value: 'General Letter',           label: 'General Letter' },
]

const BODY_TEMPLATES = {
  'Experience Certificate': `TO WHOMSOEVER IT MAY CONCERN

This is to certify that [Employee Name], [Designation], has been employed with us from [Start Date] to [End Date].

During their tenure, [he/she/they] demonstrated excellent professional conduct, technical competence, and dedication to work.

We wish [him/her/them] all the best in future endeavours.`,

  'No Objection Certificate': `This is to certify that [Employee Name], holding the position of [Designation] in our organisation, has applied for [purpose — e.g. visa / higher studies / loan].

We have no objection to [him/her/them] pursuing the same. [He/She/They] continues to be in our employment and their character and conduct have been satisfactory.`,

  'Reference Letter': `It is with great pleasure that we recommend [Employee Name], who served as [Designation] at our organisation from [Start Date] to [End Date].

During this period, [he/she/they] consistently delivered high-quality work and exhibited strong professional skills. [He/She/They] is a reliable, hardworking, and collaborative individual.

We highly recommend [him/her/them] for any position of responsibility.`,

  'Appointment Letter': `We are pleased to appoint you as [Designation] at our organisation, effective [Joining Date].

Your gross monthly compensation will be INR [Amount], subject to applicable deductions. You will report to [Reporting Manager] at our [Location] office.

Please report on the joining date with all necessary original documents. This appointment is subject to the terms outlined in our HR policy.

We look forward to a long and productive association.`,

  'Salary Certificate': `This is to certify that [Employee Name], [Designation], is currently employed with us since [Joining Date].

[His/Her/Their] gross monthly salary is INR [Gross Amount], and net monthly salary (after statutory deductions) is INR [Net Amount].

This certificate is issued on request for [purpose — e.g. bank loan / visa] purposes only.`,

  'Warning Letter': `This letter serves as a formal warning regarding [describe the misconduct / poor performance issue].

Despite prior verbal counselling on [Date], we note that the above behaviour has not improved. This is not acceptable under our company code of conduct.

You are hereby advised to immediately correct this behaviour. Any further instance may result in disciplinary action, up to and including termination of employment.

Please acknowledge receipt of this letter.`,

  'Transfer Certificate': `This is to certify that [Employee Name], Employee ID [ID], has served as [Designation] at our [From Location] office from [Start Date] to [Transfer Date].

[He/She/They] is being transferred to our [To Location] office effective [Transfer Date], and is relieved from the current posting in good standing.

We wish [him/her/them] continued success in the new assignment.`,

  'Relieving Letter': `This is to confirm that [Employee Name], [Designation], has been relieved from [his/her/their] duties with effect from [Last Working Date], following [his/her/their] resignation dated [Resignation Date].

[He/She/They] has fulfilled all obligations and returned all company property. There are no dues pending from either side.

We wish [him/her/them] all success in future endeavours.`,

  'General Letter': '',
}

const DOC_TYPE_LABELS = {
  letter: 'Letter', invoice: 'Invoice', bill: 'Bill',
  po: 'Purchase Order', vendor_credit: 'Vendor Credit',
  quote: 'Quote', so: 'Sales Order', dc: 'Delivery Challan', cn: 'Credit Note',
}
const fmtDocType = t => DOC_TYPE_LABELS[t] || t

const fmtDate = d =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/** Days remaining in 30-day recovery window (negative = expired) */
const recoveryDaysLeft = deletedAt => {
  if (!deletedAt) return -1
  const expiry = new Date(new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000)
  return Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000))
}

const todayStr  = () => new Date().toISOString().slice(0, 10)
const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function LettersPage() {
  const { company, companyId, role } = useAuth()
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState('compose')   // 'compose' | 'history' | 'deleted'

  // ── Compose ────────────────────────────────────────────────────────────────
  const [downloading, setDownloading] = useState(false)
  const [form, setForm] = useState({
    letterType: 'Experience Certificate', refNumber: '', date: todayStr(),
    toName: '', toAddress: '', subject: '',
    body: BODY_TEMPLATES['Experience Certificate'],
    signatoryName: '', signatoryDesignation: '',
  })
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const hideToBlock = HIDE_TO_BLOCK.has(form.letterType)

  const handleTypeChange = type => {
    const currentIsTemplate = Object.values(BODY_TEMPLATES).includes(form.body)
    setForm(p => ({
      ...p, letterType: type,
      body: currentIsTemplate ? (BODY_TEMPLATES[type] || '') : p.body,
    }))
  }

  const handleReset = () => {
    if (!window.confirm('Clear this letter?')) return
    setForm({ letterType: 'General Letter', refNumber: '', date: todayStr(), toName: '', toAddress: '', subject: '', body: '', signatoryName: '', signatoryDesignation: '' })
  }

  const handleDownload = async () => {
    if (!form.body.trim()) return toast.error('Letter body cannot be empty')
    setDownloading(true)
    try {
      const refNo = form.refNumber.trim() ||
        `LTR-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}`
      const verifyUrl = await createVerification(supabase, companyId, {
        docType: 'letter', docNumber: refNo, docDate: form.date,
        partyName: form.toName || form.letterType, amount: null,
      })
      await generateLetterPDF(company, { ...form, refNumber: refNo }, verifyUrl)
    } catch (e) {
      toast.error('PDF generation failed: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  // ── Issued Documents ───────────────────────────────────────────────────────
  const [docs, setDocs]               = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [docFilter, setDocFilter]     = useState('all')

  const fetchDocs = () => {
    if (!companyId) return
    setLoadingDocs(true)
    let q = supabase
      .from('document_verifications')
      .select('token,doc_type,doc_number,doc_date,party_name,amount,status,created_at')
      .eq('company_id', companyId)
      .neq('status', 'deleted')          // never show soft-deleted in main list
      .order('created_at', { ascending: false })
      .limit(200)
    if (docFilter !== 'all') q = q.eq('doc_type', docFilter)
    q.then(({ data, error }) => {
      if (!error) setDocs(data || [])
      setLoadingDocs(false)
    })
  }

  useEffect(() => { if (tab === 'history') fetchDocs() }, [tab, companyId, docFilter]) // eslint-disable-line

  const handleDelete = async doc => {
    if (doc.doc_type !== 'letter') return // guard: only letters deletable
    if (!window.confirm(
      `Delete letter "${doc.doc_number}"?\n\nIt will be moved to Deleted Documents and can be restored within 30 days.`
    )) return
    const { error } = await supabase
      .from('document_verifications')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('token', doc.token)
      .eq('company_id', companyId)
      .eq('doc_type', 'letter')
    if (error) return toast.error('Delete failed: ' + error.message)
    toast.success('Letter moved to Deleted Documents')
    setDocs(prev => prev.filter(d => d.token !== doc.token))
  }

  const ALL_DOC_TYPES = ['all','letter','invoice','bill','po','vendor_credit','quote','so','dc','cn']

  // ── Deleted Documents (admin only) ─────────────────────────────────────────
  const [deleted, setDeleted]               = useState([])
  const [loadingDeleted, setLoadingDeleted] = useState(false)

  const fetchDeleted = () => {
    if (!companyId || !isAdmin) return
    setLoadingDeleted(true)
    supabase
      .from('document_verifications')
      .select('token,doc_type,doc_number,doc_date,party_name,status,created_at,deleted_at')
      .eq('company_id', companyId)
      .eq('status', 'deleted')
      .eq('doc_type', 'letter')
      .order('deleted_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (!error) setDeleted(data || [])
        setLoadingDeleted(false)
      })
  }

  useEffect(() => { if (tab === 'deleted') fetchDeleted() }, [tab, companyId]) // eslint-disable-line

  const handleRestore = async doc => {
    if (recoveryDaysLeft(doc.deleted_at) <= 0) return
    if (!window.confirm(`Restore letter "${doc.doc_number}"? It will become active again.`)) return
    const { error } = await supabase
      .from('document_verifications')
      .update({ status: 'active', deleted_at: null })
      .eq('token', doc.token)
      .eq('company_id', companyId)
    if (error) return toast.error('Restore failed: ' + error.message)
    toast.success('Letter restored successfully')
    setDeleted(prev => prev.filter(d => d.token !== doc.token))
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center">
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Official Letters</h1>
            <p className="text-xs text-slate-400">{company?.name || 'Your Company'}</p>
          </div>
        </div>
        {tab === 'compose' && (
          <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-dark-800 border border-dark-700 rounded-lg p-1 w-fit">
        {[
          { key: 'compose',  label: 'Compose Letter',    Icon: FileText },
          { key: 'history',  label: 'Issued Documents',  Icon: ClipboardList },
          ...(isAdmin ? [{ key: 'deleted', label: 'Deleted', Icon: Trash2 }] : []),
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === key
                ? key === 'deleted'
                  ? 'bg-rose-700 text-white shadow'
                  : 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ══════════════════ COMPOSE TAB ═════════════════════════════════════ */}
      {tab === 'compose' && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-6 space-y-5">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Letter Type *</label>
              <select className={inp} value={form.letterType} onChange={e => handleTypeChange(e.target.value)}>
                {LETTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Ref Number</label>
                <input className={inp} value={form.refNumber} onChange={e => setF('refNumber', e.target.value)} placeholder="SRA/HR/001/2026" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Date *</label>
                <input type="date" className={inp} value={form.date} onChange={e => setF('date', e.target.value)} />
              </div>
            </div>
          </div>

          {!hideToBlock && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">To (Name)</label>
                <input className={inp} value={form.toName} onChange={e => setF('toName', e.target.value)} placeholder="Mr. Ravi Kumar" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">To (Address / Organisation)</label>
                <input className={inp} value={form.toAddress} onChange={e => setF('toAddress', e.target.value)} placeholder="123, Main Road, Chennai – 600001" />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Subject</label>
            <input className={inp} value={form.subject} onChange={e => setF('subject', e.target.value)} placeholder="Issue of Experience Certificate for Mr. Ravi Kumar" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Letter Body *</label>
            <textarea
              className={`${inp} min-h-[220px] resize-y font-mono text-xs leading-relaxed`}
              value={form.body}
              onChange={e => setF('body', e.target.value)}
              placeholder="Type the letter content here. Replace [placeholders] with actual values."
            />
            <p className="text-[10px] text-slate-500 mt-1">Replace [placeholders] before downloading.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Signatory Name</label>
              <input className={inp} value={form.signatoryName} onChange={e => setF('signatoryName', e.target.value)} placeholder="Aadhavun S." />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Designation</label>
              <input className={inp} value={form.signatoryDesignation} onChange={e => setF('signatoryDesignation', e.target.value)} placeholder="Managing Director" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Each letter gets a unique verification QR — scan to authenticate
            </p>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
            >
              {downloading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Download className="w-4 h-4" /> Download PDF</>}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ ISSUED DOCUMENTS TAB ════════════════════════════ */}
      {tab === 'history' && (
        <div className="space-y-4">

          {/* Filter + Refresh */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {ALL_DOC_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setDocFilter(t)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    docFilter === t
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-dark-600 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {t === 'all' ? 'All' : fmtDocType(t)}
                </button>
              ))}
            </div>
            <button onClick={fetchDocs} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {/* Info banner — delete only for letters */}
          <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-800/40 rounded-lg px-4 py-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Only Letter documents can be deleted. Invoices, POs, Bills and other financial documents are protected.
          </div>

          {/* Table */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
            {loadingDocs ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-emerald-400" /></div>
            ) : docs.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm">No issued documents found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-dark-700 text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Document No.</th>
                      <th className="text-left px-4 py-3 font-semibold">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Party / Subject</th>
                      <th className="text-left px-4 py-3 font-semibold">Issued On</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-right px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map(doc => (
                      <tr key={doc.token} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
                        <td className="px-4 py-3 text-slate-300 font-medium">{fmtDocType(doc.doc_type)}</td>
                        <td className="px-4 py-3 text-slate-300 font-mono">{doc.doc_number || '—'}</td>
                        <td className="px-4 py-3 text-slate-400">{fmtDate(doc.doc_date)}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-[150px] truncate">{doc.party_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{fmtDate(doc.created_at?.slice(0,10))}</td>
                        <td className="px-4 py-3">
                          {doc.status === 'active'
                            ? <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck className="w-3 h-3" /> Active</span>
                            : <span className="flex items-center gap-1 text-amber-400"><ShieldOff className="w-3 h-3" /> Voided</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <a
                              href={`/verify/${doc.token}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 transition-colors"
                              title="Open verify page"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {/* Delete — letters only */}
                            {doc.doc_type === 'letter' ? (
                              <button
                                onClick={() => handleDelete(doc)}
                                className="text-rose-500 hover:text-rose-400 transition-colors"
                                title="Delete letter"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span title="Financial documents cannot be deleted" className="text-slate-700 cursor-not-allowed">
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-600 text-center">Showing last 200 records · Financial documents (invoices, bills, POs etc.) cannot be deleted</p>
        </div>
      )}

      {/* ══════════════════ DELETED TAB (ADMIN ONLY) ════════════════════════ */}
      {tab === 'deleted' && (
        !isAdmin ? (
          /* Should never render — tab is hidden from non-admins — but safety gate */
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Lock className="w-8 h-8 text-slate-600" />
            <p className="text-slate-500 text-sm">This section is restricted to admins only.</p>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Warning banner */}
            <div className="bg-rose-900/20 border border-rose-800/40 rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Deleted Letters — Admin View
              </p>
              <p className="text-xs text-rose-400/80">
                Letters deleted within the last 30 days can be restored. After 30 days they are permanently archived
                and the verification QR becomes inaccessible. This page is only visible to admins.
              </p>
            </div>

            {/* Refresh */}
            <div className="flex justify-end">
              <button onClick={fetchDeleted} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {/* Table */}
            <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
              {loadingDeleted ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-rose-400" /></div>
              ) : deleted.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm">No deleted letters</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-dark-700 text-slate-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-semibold">Document No.</th>
                        <th className="text-left px-4 py-3 font-semibold">Date</th>
                        <th className="text-left px-4 py-3 font-semibold">Party / Subject</th>
                        <th className="text-left px-4 py-3 font-semibold">Deleted On</th>
                        <th className="text-left px-4 py-3 font-semibold">Recovery</th>
                        <th className="text-right px-4 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deleted.map(doc => {
                        const daysLeft    = recoveryDaysLeft(doc.deleted_at)
                        const restorable  = daysLeft > 0
                        return (
                          <tr
                            key={doc.token}
                            className={`border-b border-dark-700/50 transition-colors ${
                              restorable ? 'hover:bg-dark-700/30' : 'opacity-40'
                            }`}
                          >
                            <td className="px-4 py-3 text-slate-300 font-mono">{doc.doc_number || '—'}</td>
                            <td className="px-4 py-3 text-slate-400">{fmtDate(doc.doc_date)}</td>
                            <td className="px-4 py-3 text-slate-400 max-w-[140px] truncate">{doc.party_name || '—'}</td>
                            <td className="px-4 py-3 text-slate-500">{fmtDate(doc.deleted_at?.slice(0,10))}</td>
                            <td className="px-4 py-3">
                              {restorable ? (
                                <span className="text-amber-400 font-medium">
                                  {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-slate-600">
                                  <Lock className="w-3 h-3" /> Permanently archived
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {restorable ? (
                                <button
                                  onClick={() => handleRestore(doc)}
                                  className="flex items-center gap-1 ml-auto text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                                >
                                  <Restore className="w-3.5 h-3.5" /> Restore
                                </button>
                              ) : (
                                <span className="text-slate-700 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-600 text-center">
              Showing last 200 deleted letters · This view is accessible to admins only
            </p>
          </div>
        )
      )}
    </div>
  )
}
