/**
 * VerifyPage — Public document verification
 * Route: /verify/:token  (no login required)
 *
 * Fetches the document_verifications record for the given token
 * and shows whether the document is genuine and who issued it.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, XCircle, Loader2, ShieldCheck, FileText } from 'lucide-react'

const DOC_LABELS = {
  invoice:           'Tax Invoice',
  quote:             'Quotation',
  so:                'Sales Order',
  dc:                'Delivery Challan',
  cn:                'Credit Note',
  bill:              'Purchase Bill',
  po:                'Purchase Order',
  vc:                'Vendor Credit',
  payment_received:  'Payment Receipt',
  payment_made:      'Payment Voucher',
}

const fmtINR = n =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = d => {
  if (!d) return '—'
  const [y, m, day] = String(d).split('-')
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
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

export default function VerifyPage({ token }) {
  const [state, setState] = useState('loading') // loading | verified | not_found | error
  const [doc, setDoc]     = useState(null)
  const [company, setCompany] = useState(null)

  useEffect(() => {
    if (!token) { setState('not_found'); return }

    supabase
      .from('document_verifications')
      .select('*, companies(name, gstin, address)')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setState('not_found')
          return
        }
        setDoc(data)
        setCompany(data.companies)
        setState('verified')
      })
  }, [token])

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 py-12">

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-8">
        <ShieldCheck size={22} className="text-primary-400" />
        <span className="text-base font-bold text-slate-100 tracking-tight">Nhance · Document Verification</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md">

        {/* ── LOADING ── */}
        {state === 'loading' && (
          <div className="card p-10 text-center flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-primary-400 animate-spin" />
            <p className="text-sm text-slate-400">Verifying document…</p>
          </div>
        )}

        {/* ── VERIFIED ── */}
        {state === 'verified' && doc && (
          <div className="card overflow-hidden">
            {/* Status banner */}
            <div className="bg-emerald-500/15 border-b border-emerald-600/30 px-5 py-4 flex items-center gap-3">
              <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-300">Document Verified</p>
                <p className="text-xs text-emerald-500/80 mt-0.5">This document is genuine and was issued by the company below.</p>
              </div>
            </div>

            {/* Document details */}
            <div className="px-5 py-5 space-y-4">

              {/* Doc type + number */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={15} className="text-primary-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-100 truncate">
                    {DOC_LABELS[doc.doc_type] || doc.doc_type}
                  </span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${
                  doc.status === 'active'
                    ? 'bg-emerald-500/10 border-emerald-600/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-600/30 text-red-400'
                }`}>
                  {doc.status === 'active' ? 'ACTIVE' : doc.status?.toUpperCase()}
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

              {/* Issuer block */}
              <div>
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Issued By</span>
                <p className="text-sm font-bold text-slate-100 mt-1">{company?.name || '—'}</p>
                {company?.gstin && (
                  <p className="text-xs text-slate-500 mt-0.5">GSTIN: {company.gstin}</p>
                )}
                {company?.address && (
                  <p className="text-xs text-slate-500 mt-0.5">{company.address}</p>
                )}
              </div>

              <div className="h-px bg-dark-700" />

              {/* Generated timestamp */}
              <p className="text-[11px] text-slate-600">
                Verification record created:{' '}
                {new Date(doc.created_at).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        )}

        {/* ── NOT FOUND ── */}
        {(state === 'not_found' || state === 'error') && (
          <div className="card overflow-hidden">
            <div className="bg-red-500/10 border-b border-red-600/30 px-5 py-4 flex items-center gap-3">
              <XCircle size={22} className="text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-300">Cannot Verify</p>
                <p className="text-xs text-red-500/80 mt-0.5">No matching document was found in our records.</p>
              </div>
            </div>
            <div className="px-5 py-5">
              <p className="text-sm text-slate-400 leading-relaxed">
                This QR code does not match any document issued through Nhance.
                The document may be tampered, forged, or from a different system.
              </p>
              <p className="text-xs text-slate-600 mt-3">Token: {token || '—'}</p>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-slate-700">
        Powered by <span className="text-slate-500 font-medium">Nhance</span> · Document Management Platform
      </p>
    </div>
  )
}
