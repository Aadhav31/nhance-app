import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  buildInvoiceReceivables, fetchReceivablesRows, filterInvoiceReceivables,
  invoiceReceivablesTable, localReportDate,
} from '../../lib/invoiceReceivables'

const views = [['invoice', 'Invoice-wise'], ['client', 'Client-wise'], ['project', 'Project-wise']]
const statuses = { outstanding: 'Outstanding invoices', overdue: 'Overdue only', paid: 'Paid invoices', all: 'All issued invoices' }
const formatMoney = value => '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const control = 'bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-primary-500'
const button = 'px-3 py-2 rounded-lg text-xs border border-dark-500 bg-dark-700 text-slate-200 hover:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed'
const DEFAULT_FILTERS = { client: '', project: '', status: 'outstanding', search: '', from: '', to: '' }
const PAGE_SIZE = 50

function filterOptions(rows, key, label) {
  return [...new Map(rows.map(r => [r[key], { value: r[key], label: r[label] }])).values()].sort((a, b) => a.label.localeCompare(b.label))
}

export default function InvoiceReceivablesReport({ companyId, onNavigate }) {
  const { company } = useAuth()
  const companyName = company?.name
  const [view, setView] = useState('invoice')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')
  const reportDate = localReportDate()
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['invoice_receivables', companyId], enabled: !!companyId, staleTime: 0,
    queryFn: async () => {
      const [invoices, clients, projects] = await Promise.all([
        fetchReceivablesRows(supabase, 'client_invoices', 'id,invoice_number,invoice_date,due_date,client_name,client_gstin,project_id,project_name,total_amount,paid_amount,status,invoice_type', companyId),
        fetchReceivablesRows(supabase, 'clients', 'id,business_name,display_name,trade_name,contact_name,gstin', companyId),
        fetchReceivablesRows(supabase, 'projects', 'id,project_name,project_code', companyId),
      ])
      return { invoices, clients, projects }
    },
  })
  const invoices = useMemo(() => data ? buildInvoiceReceivables(data.invoices, data.clients, data.projects, reportDate) : [], [data, reportDate])
  const clients = useMemo(() => filterOptions(invoices, 'clientKey', 'clientName'), [invoices])
  const projects = useMemo(() => filterOptions(invoices, 'projectKey', 'projectName'), [invoices])
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to)
  const filtered = useMemo(() => invalidDates ? [] : filterInvoiceReceivables(invoices, filters), [invoices, filters, invalidDates])
  const table = useMemo(() => invoiceReceivablesTable(filtered, view), [filtered, view])
  const maxPage = Math.max(0, Math.ceil(table.rows.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, maxPage)
  const visible = table.rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const updateFilter = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(0) }
  const changeView = next => { setView(next); setPage(0) }
  const drillInto = row => {
    updateFilter(view === 'client' ? 'client' : 'project', row.key)
    changeView('invoice')
  }
  const filterDescription = [
    statuses[filters.status], `Invoice dates: ${filters.from || 'all dates'} to ${filters.to || 'latest'}`,
    filters.client && `Client: ${clients.find(c => c.value === filters.client)?.label || filters.client}`,
    filters.project && `Project: ${projects.find(p => p.value === filters.project)?.label || filters.project}`,
    filters.search && `Search: ${filters.search}`,
  ].filter(Boolean).join(' | ')
  const download = async type => {
    setExporting(type); setExportError('')
    try {
      const exporter = await import('../../lib/invoiceReceivablesExport')
      const report = { rows: filtered, companyName, reportDate, filterDescription, view }
      await (type === 'pdf' ? exporter.downloadInvoiceReceivablesPDF(report) : exporter.downloadInvoiceReceivablesExcel(report))
    } catch (e) { setExportError(e.message || 'Download failed. Please try again.') }
    finally { setExporting('') }
  }

  if (!companyId) return <p className="text-slate-400 text-sm">Select a company to view invoice receivables.</p>
  if (isLoading) return <p role="status" className="py-12 text-center text-slate-400">Loading invoice receivables…</p>
  if (isError) return <div role="alert" className="rounded-xl border border-red-500/30 p-5 text-red-300 text-sm">
    <p>Unable to load invoice receivables: {error?.message || 'Please try again.'}</p>
    <button className={`${button} mt-3`} onClick={() => refetch()}>Retry</button>
  </div>

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2 items-center justify-between">
      <div role="group" aria-label="Receivables view" className="flex flex-wrap gap-2">
        {views.map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => changeView(key)}
          className={`${button} ${view === key ? 'border-primary-500 text-primary-300 bg-primary-500/10' : ''}`}>{label}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => refetch()} disabled={isFetching} className={button}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>
        <button onClick={() => download('pdf')} disabled={!!exporting || isFetching || !filtered.length} className={button}>{exporting === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}</button>
        <button onClick={() => download('excel')} disabled={!!exporting || isFetching || !filtered.length} className={button}>{exporting === 'excel' ? 'Preparing Excel…' : 'Download Excel'}</button>
      </div>
    </div>
    <p className="text-xs text-slate-400">Current balances as of {reportDate}. All invoice dates are included unless you select a date range.</p>
    <div className="flex flex-wrap gap-3 p-3 rounded-xl bg-dark-800 border border-dark-600">
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Client
        <select aria-label="Client" className={`${control} max-w-60`} value={filters.client} onChange={e => updateFilter('client', e.target.value)}>
          <option value="">All clients</option>{clients.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Project
        <select aria-label="Project" className={`${control} max-w-60`} value={filters.project} onChange={e => updateFilter('project', e.target.value)}>
          <option value="">All projects</option>{projects.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Payment status
        <select aria-label="Payment status" className={control} value={filters.status} onChange={e => updateFilter('status', e.target.value)}>
          {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Invoice date from
        <input type="date" className={control} value={filters.from} onChange={e => updateFilter('from', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Invoice date to
        <input type="date" className={control} value={filters.to} onChange={e => updateFilter('to', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Search invoices
        <input type="search" className={control} placeholder="Invoice, client, project or GSTIN" value={filters.search} onChange={e => updateFilter('search', e.target.value)} />
      </label>
      <button className={`${button} self-end`} onClick={() => { setFilters(DEFAULT_FILTERS); setPage(0) }}>Reset filters</button>
    </div>
    {invalidDates && <p role="alert" className="text-red-300 text-xs">The invoice start date must be on or before the end date.</p>}
    {exportError && <p role="alert" className="text-red-300 text-xs">{exportError}</p>}
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {[['Billed', 'billed', 'text-slate-100'], ['Collected', 'received', 'text-emerald-400'], ['Outstanding', 'balance', 'text-amber-400'], ['Overdue', 'overdue', 'text-red-400']].map(([label, key, color]) =>
        <div key={key} className="p-4 rounded-xl border border-dark-600 bg-dark-800">
          <p className="text-[11px] text-slate-400">{label}</p><p className={`mt-1 text-lg font-bold ${color}`}>{formatMoney(table.totals[key])}</p>
        </div>)}
    </div>
    <p className="text-xs text-slate-400">{filtered.length} invoices · {table.rows.length} {view === 'invoice' ? 'invoice rows' : view === 'client' ? 'clients' : 'projects'}{view !== 'invoice' ? ' · Select a name to see its invoices.' : ''}</p>
    <div className="overflow-x-auto rounded-xl border border-dark-600 bg-dark-800">
      <table className="w-full text-xs">
        <caption className="sr-only">Invoice receivables — {views.find(([key]) => key === view)?.[1]}</caption>
        <thead><tr className="border-b border-dark-600">{table.columns.map(c => <th scope="col" key={c.key}
          className={`px-3 py-3 text-slate-400 whitespace-nowrap ${c.numeric || c.count ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr></thead>
        <tbody>{visible.length ? visible.map(row => <tr key={row.id || row.key} className="border-b border-dark-700 hover:bg-dark-700/30">
          {table.columns.map(c => <td key={c.key} className={`px-3 py-3 ${c.numeric || c.count ? 'text-right whitespace-nowrap font-mono' : 'text-left'} ${c.key === 'balance' ? 'text-amber-300 font-semibold' : c.key === 'overdue' ? 'text-red-300' : 'text-slate-200'}`}>
            {view !== 'invoice' && c.key === (view === 'client' ? 'clientName' : 'projectName')
              ? <button className="text-primary-300 underline underline-offset-2 text-left" onClick={() => drillInto(row)}>{row[c.key]}</button>
              : c.key === 'invoiceNumber' && onNavigate ? <button className="text-primary-300 underline underline-offset-2" onClick={() => onNavigate('sales', { tab: 'invoices', invoiceId: row.id })}>{row.invoiceNumber}</button>
                : c.numeric ? formatMoney(row[c.key]) : row[c.key] || (c.count ? 0 : '—')}
          </td>)}
        </tr>) : <tr><td colSpan={table.columns.length} className="text-center py-10 text-slate-400">No invoices match these filters.</td></tr>}</tbody>
        <tfoot><tr className="bg-dark-900/40 font-semibold">{table.columns.map((c, index) => <td key={c.key}
          className={`px-3 py-3 whitespace-nowrap ${c.numeric || c.count ? 'text-right' : 'text-left'} text-slate-200`}>
          {index === 0 ? 'Total (all filtered invoices)' : c.numeric ? formatMoney(table.totals[c.key]) : c.key === 'count' ? filtered.length : ''}
        </td>)}</tr></tfoot>
      </table>
    </div>
    {table.rows.length > PAGE_SIZE && <div className="flex items-center justify-between text-xs text-slate-400">
      <span>Page {currentPage + 1} of {maxPage + 1}. Downloads include every filtered row.</span>
      <div className="flex gap-2"><button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <button className={button} disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>Next</button></div>
    </div>}
    <p className="text-[11px] text-slate-500">Issued invoices less recorded payments. Drafts, proformas and cancelled invoices are excluded. Client opening balances, unallocated advances and credit notes are separate from invoice balances.</p>
  </div>
}
