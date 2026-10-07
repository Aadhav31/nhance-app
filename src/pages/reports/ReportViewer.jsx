import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/shared/Modal'
import { supabase } from '../../lib/supabase'
import { loadReportData } from '../../lib/reportData'
import { buildReportModel, reportFilterDescription } from '../../lib/reportModels'
import { FILTER_LABELS } from '../../lib/reportCatalog'
import { localReportDate } from '../../lib/invoiceReceivables'

const control = 'max-w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-primary-500'
const button = 'px-3 py-2 rounded-lg text-xs border border-dark-500 bg-dark-700 text-slate-200 hover:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed'
const number = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const format = (value, type) => value == null || value === '' ? '—' : type === 'money' ? `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : type === 'number' || type === 'percent' ? `${number(value)}${type === 'percent' ? '%' : ''}` : String(value)
const PAGE_SIZE = 50

export default function ReportViewer({ report, companyId, from, to, setFrom, setTo, resetDates }) {
  const { company } = useAuth()
  const today = localReportDate()
  const defaults = { search: '', month: from.slice(0, 7) || today.slice(0, 7), view: 'entries', status: report.id === 'fuel_report' ? 'Recorded' : '', includeProforma: false }
  const [filters, setFilters] = useState(defaults)
  const [allDates, setAllDates] = useState(report.allDates || false)
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')
  const [detailRow, setDetailRow] = useState(null)
  const applied = useMemo(() => ({ ...filters, from: allDates || report.current ? '' : from, to: allDates || report.current ? '' : to }), [filters, allDates, report.current, from, to])
  const invalidDates = !report.current && !report.month && !allDates && (!from || !to || from > to)
  const invalidMonth = report.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month)
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['reports_complete', companyId, report.id], enabled: !!companyId,
    queryFn: () => loadReportData(report.id, supabase, companyId), retry: 1,
  })
  const model = useMemo(() => buildReportModel(report.id, data, applied, today), [report.id, data, applied, today])
  const invalid = invalidDates || invalidMonth
  const maxPage = Math.max(0, Math.ceil(model.rows.length / PAGE_SIZE) - 1), currentPage = Math.min(page, maxPage)
  const visible = model.rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const update = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(0); setDetailRow(null) }
  const download = async type => {
    setExporting(type); setExportError('')
    try {
      const exporter = await import('../../lib/reportExport')
      const reportData = { model, companyName: company?.name, reportDate: today, filterDescription: reportFilterDescription(report, applied, model.options, today) }
      await ({ pdf: exporter.downloadReportPDF, excel: exporter.downloadReportExcel, csv: exporter.downloadReportCSV })[type](reportData)
    } catch (e) { setExportError(e.message || 'Download failed. Try again.') }
    finally { setExporting('') }
  }
  const reset = () => { resetDates(); setFilters({ ...defaults, month: today.slice(0, 7) }); setAllDates(!!report.allDates); setPage(0); setDetailRow(null); setExportError('') }
  if (!companyId) return <p className="text-slate-400 text-sm">Select a company to view reports.</p>
  return <div className="space-y-4 min-w-0">
    <div className="flex flex-wrap gap-3 p-3 rounded-xl bg-dark-800 border border-dark-600">
      {report.month ? <label className="flex flex-col gap-1 text-[11px] text-slate-400">Report month
        <input type="month" className={control} value={filters.month} onChange={e => update('month', e.target.value)} />
      </label> : !report.current && <>
        <label className="flex flex-col gap-1 text-[11px] text-slate-400">{report.financial ? 'Invoice date from' : 'From'}
          <input aria-label="Report period start" type="date" className={control} disabled={allDates} value={from} onChange={e => { setFrom(e.target.value); setPage(0) }} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-slate-400">{report.financial ? 'Invoice date to' : 'To'}
          <input aria-label="Report period end" type="date" className={control} disabled={allDates} value={to} onChange={e => { setTo(e.target.value); setPage(0) }} />
        </label>
        <label className="flex gap-2 items-center self-end py-2 text-xs text-slate-200"><input type="checkbox" checked={allDates} onChange={e => { setAllDates(e.target.checked); setPage(0) }} />All dates</label>
      </>}
      {report.filters.map(key => <label key={key} className="flex flex-col gap-1 text-[11px] text-slate-400">{report.id === 'maintenance_cost' && key === 'vendor' ? 'Technician' : FILTER_LABELS[key]}
        <select aria-label={FILTER_LABELS[key]} className={`${control} max-w-60`} value={filters[key] || ''} onChange={e => update(key, e.target.value)}>
          <option value="">All</option>{(model.options[key] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>)}
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Search report
        <input type="search" className={control} placeholder="Search report rows" value={filters.search} onChange={e => update('search', e.target.value)} />
      </label>
      {report.views && <label className="flex flex-col gap-1 text-[11px] text-slate-400">Report view
        <select aria-label="Report view" className={control} value={filters.view} onChange={e => update('view', e.target.value)}><option value="entries">Fuel entries</option><option value="equipment">Equipment summary</option></select>
      </label>}
      {report.financial && <label className="flex items-center gap-2 self-end py-2 text-xs text-slate-200"><input type="checkbox" checked={filters.includeProforma} onChange={e => update('includeProforma', e.target.checked)} />Include unconverted proforma invoices</label>}
      <button className={`${button} self-end`} onClick={reset}>Reset filters</button>
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <button className={button} disabled={isFetching} onClick={() => refetch()}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>
      {[['pdf', 'PDF'], ['excel', 'Excel'], ['csv', 'CSV']].map(([type, label]) => <button key={type} className={button} onClick={() => download(type)} disabled={invalid || isError || isFetching || !data || !model.rows.length || !!exporting}>{exporting === type ? `Preparing ${label}…` : `Download ${label}`}</button>)}
    </div>
    {invalid && <p role="alert" className="text-red-300 text-xs">{invalidMonth ? 'Choose a valid report month.' : 'Select a start date on or before the end date.'}</p>}
    {exportError && <p role="alert" className="text-red-300 text-xs">{exportError}</p>}
    {isError ? <div role="alert" className="rounded-xl border border-red-500/30 p-5 text-red-300 text-sm"><p>Unable to load {report.label}: {error?.message || 'Please try again.'}</p><button className={`${button} mt-3`} disabled={isFetching} onClick={() => refetch()}>{isFetching ? 'Retrying…' : 'Retry'}</button></div>
      : isLoading ? <p role="status" className="py-12 text-center text-slate-400">Loading {report.label}…</p>
        : !invalid && <>
          <p className="text-[11px] text-slate-400">{model.notes}</p>
          {model.buckets.length > 0 && <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">{model.buckets.map(bucket => <div key={bucket.label} className="p-3 rounded-xl border border-dark-600 bg-dark-800"><p className="text-xs text-slate-400">{bucket.label}</p><p className="mt-1 text-lg font-bold text-amber-400">{format(bucket.value, 'money')}</p></div>)}</div>}
          {!model.buckets.length && model.stats.length > 0 && <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{model.stats.map(stat => <div key={stat.label} className="p-3 rounded-xl border border-dark-600 bg-dark-800"><p className="text-xs text-slate-400">{stat.label}</p><p className="mt-1 text-lg font-bold text-primary-400">{format(stat.value, stat.type)}</p></div>)}</div>}
          <p role="status" className="text-xs text-slate-400">{model.rows.length} matching rows. Downloads include every filtered row.</p>
          <div className="overflow-x-auto rounded-xl border border-dark-600 bg-dark-800">
            <table className="w-full text-xs"><caption className="sr-only">{report.label}</caption>
              <thead><tr className="border-b border-dark-600">{model.columns.map(c => <th scope="col" key={c.key} className={`px-3 py-3 text-slate-400 whitespace-nowrap ${c.type === 'text' ? 'text-left' : 'text-right'}`}>{c.label}</th>)}</tr></thead>
              <tbody>{visible.length ? visible.map((row, i) => <tr key={row.id || row.key || i} className="border-b border-dark-700 hover:bg-dark-700/30">{model.columns.map((c, index) => <td key={c.key} className={`px-3 py-3 ${c.type === 'text' ? 'text-left' : 'text-right whitespace-nowrap font-mono'} ${/date/i.test(c.key) || c.key === 'invoiceNumber' ? 'whitespace-nowrap' : ''} text-slate-200`}>
                {index === 0 && row.details?.length ? <button className="text-primary-300 underline underline-offset-2" aria-label={`View details for ${row.equipmentName || row.clientName || row.projectName || row.employeeName}`} onClick={() => setDetailRow(row)}>{format(row[c.key], c.type)}</button> : format(row[c.key], c.type)}
              </td>)}</tr>) : <tr><td colSpan={model.columns.length} className="py-10 text-center text-slate-400">No records match these filters.</td></tr>}</tbody>
              <tfoot><tr className="bg-dark-900/40 font-semibold">{model.columns.map((c, i) => <td key={c.key} className={`px-3 py-3 whitespace-nowrap text-slate-200 ${c.type === 'text' ? 'text-left' : 'text-right'}`}>{i === 0 ? 'Total (all filtered rows)' : c.total ? format(model.totals[c.key], c.type) : ''}</td>)}</tr></tfoot>
            </table>
          </div>
          {maxPage > 0 && <div className="flex gap-2 items-center justify-between text-xs text-slate-400"><span>Page {currentPage + 1} of {maxPage + 1}</span><div className="flex gap-2"><button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button className={button} disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
        </>}
    {detailRow && <Modal title={`${detailRow.equipmentName || detailRow.clientName || detailRow.projectName || detailRow.employeeName} — Details`} onClose={() => setDetailRow(null)} size="xl">
      <div className="space-y-3">{detailRow.details.map((row, i) => <dl key={row.id || i} className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border border-dark-600 rounded-lg">{Object.entries(row).filter(([key, value]) => !['details', 'invoices', 'equipment', 'project', 'client', 'employee', 'source_document_type'].includes(key) && !/(?:_id|Id|Key)$/.test(key) && key !== 'id' && value != null && typeof value !== 'object').map(([key, value]) => <div key={key}><dt className="text-[10px] text-slate-500">{key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</dt><dd className="text-xs text-slate-200 break-words">{String(value)}</dd></div>)}</dl>)}</div>
    </Modal>}
  </div>
}
