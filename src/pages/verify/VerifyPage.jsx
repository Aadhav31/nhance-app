/**
 * VerifyPage — Public document verification (no login required)
 * Route: /verify/:token?sig=<hmac>
 *
 * Two independent checks:
 *   1. Document Status  — token exists in DB and status = 'active'
 *   2. Data Integrity   — HMAC recomputed from DB record matches stored sig
 *                         (proves document fields were not changed after issuance)
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { hmacSHA256, buildSigPayload } from '../../lib/docVerify'
import {
  CheckCircle2, XCircle, Loader2, ShieldCheck,
  ShieldAlert, FileText, AlertTriangle, Shield,
} from 'lucide-react'

const DOC_LABELS = {
  invoice:          'Tax Invoice',
  proforma:         'Proforma Invoice',
  quote:            'Quotation',
  so:               'Sales Order',
  dc:               'Delivery Challan',
  cn:               'Credit Note',
  bill:             'Purchase Bill',
  po:               'Purchase Order',
  vc:               'Vendor Credit',
  payment_received: 'Payment Receipt',
  payment_made:     'Payment Voucher',
}

const fmtINR = n =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = d => {
  if (!d) return '—'
  const [y, m, day] = String(d).split('-')
  return (y && m && day) ? `${day}/${m}/${y}` : d
}

function Field({ label, value }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">{label}</span>
      <span className="text-sm text-slate-100 font-medium">{value}</span>
    </div>
  )
}

// ── Check badge ───────────────────────────────────────────────────────────────
function CheckRow({ label, sublabel, status }) {
  // status: 'pass' | 'fail' | 'warn' | 'loading'
  const cfg = {
    pass:    { icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/8', border: 'border-emerald-600/25' },
    fail:    { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/8',     border: 'border-red-600/25'     },
    warn:    { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-500/8',   border: 'border-amber-600/25'   },
    loading: { icon: Loader2,       color: 'text-slate-500',   bg: 'bg-dark-700/40',   border: 'border-dark-600'       },
  }[status] || cfg.warn
  const Icon = cfg.icon
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${cfg.bg} ${cfg.border}`}>
      <Icon size={16} className={`${cfg.color} shrink-0 mt-0.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${cfg.color}`}>{label}</p>
        {sublabel && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{sublabel}</p>}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function VerifyPage({ token }) {
  const [phase, setPhase]         = useState('loading') // loading | done | not_found
  const [doc, setDoc]             = useState(null)
  const [company, setCompany]     = useState(null)
  const [statusCheck, setStatus]  = useState('loading') // pass | fail | warn
  const [integrityCheck, setSig]  = useState('loading') // pass | fail | warn

  // Extract sig from URL query string (may be absent for legacy QRs)
  const urlSig = new URLSearchParams(window.location.search).get('sig')

  useEffect(() => {
    if (!token) { setPhase('not_found'); return }

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('document_verifications')
          .select('*, companies(name, gstin, address)')
          .eq('token', token)
          .single()

        if (error || !data) {
          setPhase('not_found')
          return
        }

        setDoc(data)
        setCompany(data.companies)
        setPhase('done')

        // ── Check 1: Document status ──────────────────────────────────────
        setStatus(data.status === 'active' ? 'pass' : 'fail')

        // ── Check 2: Data integrity ───────────────────────────────────────
        if (!data.sig) {
          // Legacy record (created before HMAC was implemented)
          setSig('warn')
          return
        }

        // Recompute HMAC from the DB record to confirm fields weren't altered
        const recomputed = await hmacSHA256(buildSigPayload({
          docType:   data.doc_type,
          docNumber: data.doc_number,
          docDate:   data.doc_date,
          partyName: data.party_name,
          amount:    data.amount,
          companyId: data.company_id,
        }))

        const dbIntact = recomputed === data.sig           // DB record not tampered
        const qrMatch  = !urlSig    || urlSig === data.sig // QR sig matches DB

        setSig(dbIntact && qrMatch ? 'pass' : 'fail')
      } catch {
        setPhase('not_found')
      }
    })()
  }, [token, urlSig])

  // ── Overall result ────────────────────────────────────────────────────────
  const isFullyVerified = phase === 'done' && statusCheck === 'pass' && integrityCheck === 'pass'
  const isVoided        = phase === 'done' && statusCheck === 'fail'
  const isTampered      = phase === 'done' && statusCheck === 'pass' && integrityCheck === 'fail'
  const isLegacy        = phase === 'done' && statusCheck === 'pass' && integrityCheck === 'warn'

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 py-12">

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-8">
        <ShieldCheck size={22} className="text-primary-400" />
        <span className="text-base font-bold text-slate-100 tracking-tight">
          Nhance · Document Verification
        </span>
      </div>

      <div className="w-full max-w-md space-y-3">

        {/* ── LOADING ─────────────────────────────────────────────────────── */}
        {phase === 'loading' && (
          <div className="card p-10 text-center flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-primary-400 animate-spin" />
            <p className="text-sm text-slate-400">Verifying document…</p>
          </div>
        )}

        {/* ── NOT FOUND ───────────────────────────────────────────────────── */}
        {phase === 'not_found' && (
          <div className="card overflow-hidden">
            <div className="bg-red-500/10 border-b border-red-600/30 px-5 py-4 flex items-center gap-3">
              <ShieldAlert size={22} className="text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-300">Document Not Found</p>
                <p className="text-xs text-red-500/80 mt-0.5">
                  No matching record exists in our system.
                </p>
              </div>
            </div>
            <div className="px-5 py-5 space-y-3">
              <p className="text-sm text-slate-400 leading-relaxed">
                This QR code does not match any document issued through Nhance.
                It may be forged, from a different system, or the document may have been deleted.
              </p>
              <p className="text-[11px] text-slate-600 font-mono break-all">Token: {token || '—'}</p>
            </div>
          </div>
        )}

        {/* ── FOUND (all states) ──────────────────────────────────────────── */}
        {phase === 'done' && doc && (
          <>
            {/* ── Main status banner ── */}
            {isFullyVerified && (
              <div className="card border border-emerald-600/30 bg-emerald-500/8 px-5 py-4 flex items-center gap-3">
                <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-300">Verified Authentic</p>
                  <p className="text-xs text-emerald-500/80 mt-0.5">
                    Document is active and data integrity is confirmed.
                  </p>
                </div>
              </div>
            )}
            {isLegacy && (
              <div className="card border border-emerald-600/30 bg-emerald-500/8 px-5 py-4 flex items-center gap-3">
                <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-300">Document Verified</p>
                  <p className="text-xs text-emerald-500/80 mt-0.5">
                    Active in our records. Integrity signature not available for this document.
                  </p>
                </div>
              </div>
            )}
            {isVoided && (
              <div className="card border border-red-600/30 bg-red-500/8 px-5 py-4 flex items-center gap-3">
                <XCircle size={24} className="text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-300">Document Voided</p>
                  <p className="text-xs text-red-500/80 mt-0.5">
                    This document was cancelled by the issuer and is no longer valid.
                  </p>
                </div>
              </div>
            )}
            {isTampered && (
              <div className="card border border-amber-600/30 bg-amber-500/8 px-5 py-4 flex items-center gap-3">
                <ShieldAlert size={24} className="text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-300">Integrity Check Failed</p>
                  <p className="text-xs text-amber-500/80 mt-0.5">
                    Document data may have been altered. Do not accept this document.
                  </p>
                </div>
              </div>
            )}

            {/* ── Dual verification checks ── */}
            <div className="card px-5 py-4 space-y-2">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-3">Verification Checks</p>

              <CheckRow
                label="Document Status"
                sublabel={
                  statusCheck === 'pass' ? 'Active and valid in Nhance records' :
                  statusCheck === 'fail' ? `Status: ${doc.status?.toUpperCase()} — no longer valid` :
                  'Checking…'
                }
                status={statusCheck}
              />

              <CheckRow
                label="Data Integrity"
                sublabel={
                  integrityCheck === 'pass' ? 'HMAC-SHA256 signature verified — data unchanged since issuance' :
                  integrityCheck === 'fail' ? 'Signature mismatch — document data may have been tampered with' :
                  integrityCheck === 'warn' ? 'Legacy document — integrity signature not available' :
                  'Checking…'
                }
                status={integrityCheck}
              />
            </div>

            {/* ── Document details ── */}
            <div className="card px-5 py-5 space-y-4">

              {/* Doc type + status chip */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={15} className="text-primary-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-100 truncate">
                    {DOC_LABELS[doc.doc_type] || doc.doc_type}
                  </span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                  doc.status === 'active'
                    ? 'bg-emerald-500/10 border-emerald-600/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-600/30 text-red-400'
                }`}>
                  {doc.status?.toUpperCase()}
                </span>
              </div>

              <div className="h-px bg-dark-700" />

              <div className="grid grid-cols-2 gap-4">
                <Field label="Document No." value={doc.doc_number} />
                <Field label="Date"         value={fmtDate(doc.doc_date)} />
              </div>

              {doc.amount != null && (
                <Field label="Amount" value={`₹ ${fmtINR(doc.amount)}`} />
              )}

              {doc.party_name && (
                <Field label="Issued To / Party" value={doc.party_name} />
              )}

              <div className="h-px bg-dark-700" />

              {/* Issuer */}
              <div>
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Issued By</span>
                {/* Use stored snapshot fields (populated at PDF generation time) so this
                    works on the public page without needing to join RLS-protected tables */}
                <p className="text-sm font-bold text-slate-100 mt-1">
                  {doc.company_name || company?.name || '—'}
                </p>
                {doc.issued_by_name && (
                  <p className="text-xs text-slate-400 mt-0.5">Generated by: {doc.issued_by_name}</p>
                )}
                {(company?.gstin) && (
                  <p className="text-xs text-slate-500 mt-0.5">GSTIN: {company.gstin}</p>
                )}
                {(company?.address) && (
                  <p className="text-xs text-slate-500 mt-0.5">{company.address}</p>
                )}
              </div>

              <div className="h-px bg-dark-700" />

              <p className="text-[11px] text-slate-600">
                Record created:{' '}
                {new Date(doc.created_at).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>

            {/* ── Security note ── */}
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-dark-800/60 border border-dark-700">
              <Shield size={13} className="text-slate-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-600 leading-snug">
                This page is served directly from Nhance servers. The HMAC-SHA256 signature
                uses a private key held only by Nhance — it cannot be forged without access to that key.
              </p>
            </div>
          </>
        )}

      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-slate-700">
        Powered by <span className="text-slate-500 font-medium">Nhance</span> · Document Management Platform
      </p>
    </div>
  )
}
