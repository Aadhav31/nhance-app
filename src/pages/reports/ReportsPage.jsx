import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import OutstandingReceivablesReport from './InvoiceReceivablesReport'
import ReportViewer from './ReportViewer'
import { REPORTS, REPORT_CATEGORIES as CATS } from '../../lib/reportCatalog'
import { localReportDate } from '../../lib/invoiceReceivables'

const REPORT_IDS = new Set(REPORTS.map(r => r.id))
const CAT_ICONS = { 'P&M Reports': '🚜', Operations: '⚙️', 'HR & Payroll': '👥', Maintenance: '🔧', Finance: '💰', Projects: '🏗️', Clients: '🤝', Inventory: '📦' }
const monthStart = () => `${localReportDate().slice(0, 7)}-01`
const todayStr = localReportDate

export default function ReportsPage({
  onNavigate, initialReport = 'equip_utilization', initialFrom = '', initialTo = '',
}) {
  const { companyId } = useAuth()
  const [activeReport, setActiveReport] = useState(() => REPORT_IDS.has(initialReport) ? initialReport : 'equip_utilization')
  const [from, setFrom] = useState(initialFrom || monthStart())
  const [to,   setTo]   = useState(initialTo || todayStr())

  useEffect(() => {
    setActiveReport(REPORT_IDS.has(initialReport) ? initialReport : 'equip_utilization')
    setFrom(initialFrom || monthStart())
    setTo(initialTo || todayStr())
  }, [initialFrom, initialReport, initialTo])

  const persistReport = next => onNavigate?.('reports', {
    reportId: next.reportId ?? activeReport,
    from: next.from ?? from,
    to: next.to ?? to,
  }, { replace: true })
  const selectReport = value => { setActiveReport(value); persistReport({ reportId: value }) }
  const selectFrom = value => { setFrom(value); persistReport({ from: value }) }
  const selectTo = value => { setTo(value); persistReport({ to: value }) }

  const current = REPORTS.find(r=>r.id===activeReport)

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-full md:w-56 max-h-56 md:max-h-none flex-shrink-0 bg-dark-900 border-b md:border-b-0 md:border-r border-dark-700 flex flex-col overflow-y-auto">
        <div className="px-4 py-4 border-b border-dark-700">
          <h2 className="text-sm font-semibold text-slate-200">Reports</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Analytics & exports</p>
        </div>
        <nav className="flex-1 py-2">
          {CATS.map(cat => {
            const catReports = REPORTS.filter(r=>r.cat===cat)
            if (!catReports.length) return null
            return (
              <div key={cat} className="mb-1">
                <div className="px-4 py-1 flex items-center gap-1.5">
                  <span className="text-[10px]">{CAT_ICONS[cat]}</span>
                  <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">{cat}</span>
                </div>
                {catReports.map(r => (
                  <button key={r.id} onClick={()=>selectReport(r.id)} aria-pressed={activeReport === r.id}
                    className={`w-full text-left px-4 py-1.5 text-[11px] transition-colors ${activeReport===r.id?'bg-primary-500/10 text-primary-400 border-r-2 border-primary-500':'text-slate-400 hover:text-slate-200 hover:bg-dark-800'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 md:px-6 pt-5 pb-3 border-b border-dark-700">
          <h1 className="text-base font-semibold text-slate-100">{current?.label||'Report'}</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">{current?.desc}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 pb-8">
          {activeReport === 'invoice_outstanding'
            ? <OutstandingReceivablesReport key={companyId} companyId={companyId} onNavigate={onNavigate} />
            : <ReportViewer key={`${companyId}:${activeReport}`} report={current} companyId={companyId} from={from} to={to} setFrom={selectFrom} setTo={selectTo} resetDates={() => { const start = monthStart(), end = todayStr(); setFrom(start); setTo(end); persistReport({ from: start, to: end }) }} />}
        </div>
      </main>
    </div>
  )
}
