/**
 * LettersPage.jsx — Official letter composer
 *
 * Generates formal letters on the company letterhead (SRA green double-border design).
 * Letter types: Experience Certificate, NOC, Reference Letter, Appointment Letter,
 *               Salary Certificate, Warning Letter, Transfer Certificate, General Letter
 */

import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { generateLetterPDF } from '../../lib/letterheadPDF'
import { FileText, Download, Loader2, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

// ── Letter type templates ──────────────────────────────────────────────────────
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

// ── Starter body templates ─────────────────────────────────────────────────────
const BODY_TEMPLATES = {
  'Experience Certificate': `This is to certify that [Employee Name], [Designation], has been employed with us from [Start Date] to [End Date].

During their tenure, [he/she/they] demonstrated excellent professional conduct, technical competence, and dedication to work.

We wish [him/her/them] all the best in future endeavours.`,

  'No Objection Certificate': `This is to certify that [Employee Name], holding the position of [Designation] in our organisation, has applied for [purpose — e.g. visa / higher studies / loan].

We have no objection to [him/her/them] pursuing the same. [He/She/They] continues to be in our employment and their character and conduct have been satisfactory.`,

  'Reference Letter': `It is with great pleasure that we recommend [Employee Name], who served as [Designation] at our organisation from [Start Date] to [End Date].

During this period, [he/she/they] consistently delivered high-quality work and exhibited strong professional skills. [He/She/They] is a reliable, hardworking, and collaborative individual.

We highly recommend [him/her/them] for any position of responsibility.`,

  'Appointment Letter': `We are pleased to appoint you as [Designation] at [Company Name], effective [Joining Date].

Your gross monthly compensation will be INR [Amount], subject to applicable deductions. You will report to [Reporting Manager] at our [Location] office.

Please report on the joining date with all necessary original documents. This appointment is subject to the terms outlined in our HR policy.

We look forward to a long and productive association.`,

  'Salary Certificate': `This is to certify that [Employee Name], [Designation], is currently employed with us since [Joining Date].

[His/Her/Their] gross monthly salary is INR [Gross Amount], and net monthly salary (after deductions) is INR [Net Amount].

This certificate is issued on request for [purpose — e.g. bank loan / visa] purposes only.`,

  'Warning Letter': `This letter serves as a formal warning regarding [describe the misconduct / poor performance issue].

Despite prior verbal counselling on [Date], we note that the above behaviour has not improved. This is not acceptable under our company code of conduct.

You are hereby advised to immediately correct this behaviour. Any further instance may result in disciplinary action, up to and including termination of employment.

Please acknowledge receipt of this letter.`,

  'Transfer Certificate': `This is to certify that [Employee Name] bearing employee ID [ID], has served as [Designation] at our [From Location] office from [Start Date] to [Transfer Date].

[He/She/They] is being transferred to our [To Location] office effective [Transfer Date], and is relieved from the current posting in good standing.

We wish [him/her/them] continued success in the new assignment.`,

  'Relieving Letter': `This is to confirm that [Employee Name], [Designation], has been relieved from [his/her/their] duties with effect from [Last Working Date], following [his/her/their] resignation dated [Resignation Date].

[He/She/They] has fulfilled all obligations and returned company property. There are no dues pending from either side.

We wish [him/her/them] all success in future endeavours.`,

  'General Letter': '',
}

const todayStr = () => new Date().toISOString().slice(0, 10)

const inp = 'w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500'

export default function LettersPage() {
  const { company } = useAuth()
  const [downloading, setDownloading] = useState(false)

  const [form, setForm] = useState({
    letterType:           'Experience Certificate',
    refNumber:            '',
    date:                 todayStr(),
    toName:               '',
    toAddress:            '',
    subject:              '',
    body:                 BODY_TEMPLATES['Experience Certificate'],
    signatoryName:        '',
    signatoryDesignation: '',
  })

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleTypeChange = (type) => {
    setF('letterType', type)
    // Only prefill if body is currently a template (user hasn't typed custom)
    const currentIsTemplate = Object.values(BODY_TEMPLATES).includes(form.body)
    if (currentIsTemplate) setF('body', BODY_TEMPLATES[type] || '')
  }

  const handleReset = () => {
    if (!window.confirm('Clear this letter?')) return
    setForm({
      letterType:           'General Letter',
      refNumber:            '',
      date:                 todayStr(),
      toName:               '',
      toAddress:            '',
      subject:              '',
      body:                 '',
      signatoryName:        '',
      signatoryDesignation: '',
    })
  }

  const handleDownload = async () => {
    if (!form.body.trim()) return toast.error('Letter body cannot be empty')
    setDownloading(true)
    try {
      generateLetterPDF(company, form)
    } catch (e) {
      toast.error('Failed to generate PDF: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center">
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Official Letters</h1>
            <p className="text-xs text-slate-400">Company letterhead — {company?.name || 'Your Company'}</p>
          </div>
        </div>
        <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors">
          <RotateCcw className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      {/* Form */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-6 space-y-5">

        {/* Row 1: Letter type + Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Letter Type *</label>
            <select
              className={inp}
              value={form.letterType}
              onChange={e => handleTypeChange(e.target.value)}
            >
              {LETTER_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Ref Number</label>
              <input
                className={inp}
                value={form.refNumber}
                onChange={e => setF('refNumber', e.target.value)}
                placeholder="SRA/HR/001/2026"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date *</label>
              <input
                type="date"
                className={inp}
                value={form.date}
                onChange={e => setF('date', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Row 2: To Name + Address */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">To (Name)</label>
            <input
              className={inp}
              value={form.toName}
              onChange={e => setF('toName', e.target.value)}
              placeholder="Mr. Ravi Kumar"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">To (Address / Organisation)</label>
            <input
              className={inp}
              value={form.toAddress}
              onChange={e => setF('toAddress', e.target.value)}
              placeholder="123, Main Road, Chennai – 600001"
            />
          </div>
        </div>

        {/* Subject */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Subject</label>
          <input
            className={inp}
            value={form.subject}
            onChange={e => setF('subject', e.target.value)}
            placeholder="Issue of Experience Certificate for Mr. Ravi Kumar"
          />
        </div>

        {/* Body */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Letter Body *</label>
          <textarea
            className={`${inp} min-h-[220px] resize-y font-mono text-xs leading-relaxed`}
            value={form.body}
            onChange={e => setF('body', e.target.value)}
            placeholder="Type the letter content here. Use [placeholders] for values to fill in."
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Tip: Replace [placeholders] with actual names, dates, and values before downloading.
          </p>
        </div>

        {/* Signatory */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Signatory Name</label>
            <input
              className={inp}
              value={form.signatoryName}
              onChange={e => setF('signatoryName', e.target.value)}
              placeholder="Aadhavun S."
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Designation</label>
            <input
              className={inp}
              value={form.signatoryDesignation}
              onChange={e => setF('signatoryDesignation', e.target.value)}
              placeholder="Director"
            />
          </div>
        </div>

        {/* Download button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
          >
            {downloading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Download className="w-4 h-4" /> Download PDF</>
            }
          </button>
        </div>
      </div>

      {/* Preview hint */}
      <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-emerald-400 font-semibold">Letterhead includes:</span>{' '}
          Company name · Address · CIN · GSTIN · Email · Mobile — all pulled from your company settings.
          The green double-border design matches your official SRA letterhead.
        </p>
      </div>
    </div>
  )
}
