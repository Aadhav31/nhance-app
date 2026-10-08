import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/shared/Modal'
import { supabase } from '../../lib/supabase'
import { ACTIVITY_BASIS, ACTIVITY_SECTIONS, activityAction, activityBounds, activityDate, activityFields, activityMonthBounds, activityMonthDays, activityReference, activitySection, activitySectionCounts, activityTimestamp, activityValue, fetchActivityRange, fetchActivityStart, filterActivity, shiftActivityDate, validActivityDate } from '../../lib/dailyActivity'

const control = 'max-w-full rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-primary-500'
const button = 'rounded-lg border border-dark-500 bg-dark-700 px-3 py-2 text-xs text-slate-200 hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50'
const DEFAULT_FILTERS = { section: '', actor: '', action: '', source: '', search: '' }
const PAGE_SIZE = 50

function ActivityDetails({ event, onClose }) {
  const fields = activityFields(event)
  return <Modal title={`Activity #${event.event_no} — ${activityReference(event)}`} onClose={onClose} size="xl">
    <div className="space-y-4 text-xs text-slate-300">
      <p>{activityTimestamp(event.created_at)} IST · {activitySection(event)} · {activityAction(event)} · {event.actor_name || (event.actor_id ? 'Unknown user' : 'System / automation')}</p>
      <p className="break-words">{event.description}</p>
      <p>Table: {event.table_name || 'Application event'} · Source: {event.source} · Role: {event.actor_role || '—'}</p>
      <div className="overflow-x-auto rounded-lg border border-dark-600">
        <table className="w-full text-xs"><caption className="sr-only">Before and after record values</caption>
          <thead><tr className="bg-dark-800 text-left"><th scope="col" className="p-2">Field</th><th scope="col" className="p-2">Before</th><th scope="col" className="p-2">After</th></tr></thead>
          <tbody>{fields.map(field => <tr key={field} className="border-t border-dark-700"><th scope="row" className="p-2 text-left font-normal">{field}{event.changed_fields?.includes(field) && <span className="block text-primary-300">Changed</span>}</th><td className="max-w-xs break-all p-2 whitespace-pre-wrap">{activityValue(event.old_data?.[field])}</td><td className="max-w-xs break-all p-2 whitespace-pre-wrap">{activityValue(event.new_data?.[field])}</td></tr>)}</tbody>
        </table>
        {!fields.length && <p className="p-3 text-slate-400">Application event; no record snapshots.</p>}
      </div>
      <details><summary className="cursor-pointer text-primary-300">Full event details</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-dark-900 p-3 text-[10px]">{JSON.stringify(event, null, 2)}</pre></details>
    </div>
  </Modal>
}

export default function DailyActivityReport({ initialDate = '', onDateChange }) {
  const { companyId, company, role } = useAuth()
  const allowed = role === 'admin'
  const today = activityDate()
  const [date, setDate] = useState(() => validActivityDate(initialDate) && initialDate <= today ? initialDate : today)
  const [month, setMonth] = useState(() => (validActivityDate(initialDate) && initialDate <= today ? initialDate : today).slice(0, 7))
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState(null)
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')
  useEffect(() => {
    if (!validActivityDate(initialDate) || initialDate > today) return
    setDate(initialDate); setMonth(initialDate.slice(0, 7)); setPage(0); setDetail(null)
  }, [initialDate, today])
  const valid = validActivityDate(date) && date <= today
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= today.slice(0, 7)
  const enabled = allowed && !!companyId
  const daily = useQuery({ queryKey: ['daily_activity', companyId, date], enabled: enabled && valid, queryFn: ({ signal }) => fetchActivityRange(supabase, companyId, activityBounds(date), { signal }), retry: 1, staleTime: 30000 })
  const calendar = useQuery({ queryKey: ['activity_calendar', companyId, month], enabled: enabled && monthValid, queryFn: ({ signal }) => fetchActivityRange(supabase, companyId, activityMonthBounds(month), { summary: true, signal }), retry: 1, staleTime: 30000 })
  const history = useQuery({ queryKey: ['activity_start', companyId], enabled, queryFn: ({ signal }) => fetchActivityStart(supabase, companyId, signal), staleTime: 300000, retry: 1 })
  const events = daily.data?.events || []
  const filtered = useMemo(() => filterActivity(events, filters), [events, filters])
  const sectionCounts = useMemo(() => activitySectionCounts(events), [events])
  const calendarCounts = useMemo(() => {
    const counts = {}
    for (const event of calendar.data?.events || []) { const day = activityDate(event.created_at); counts[day] = (counts[day] || 0) + 1 }
    // The selected-day snapshot is authoritative after its own refresh.
    if (daily.data && valid) counts[date] = daily.data.total
    return counts
  }, [calendar.data, daily.data, date, valid])
  const actors = useMemo(() => [...new Map(events.map(event => [event.actor_id || 'system', { id: event.actor_id || 'system', name: event.actor_name || (event.actor_id ? 'Unknown user' : 'System / automation') }])).values()].sort((a, b) => a.name.localeCompare(b.name)), [events])
  const actions = [...new Set(events.map(event => event.action))].sort()
  const sources = [...new Set(events.map(event => event.source))].sort()
  const days = monthValid ? activityMonthDays(month) : []
  const blanks = monthValid ? new Date(`${month}-01T00:00:00Z`).getUTCDay() : 0
  const historyStart = history.data ? activityDate(history.data) : ''
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1), currentPage = Math.min(page, maxPage)
  const chooseDate = value => { setDate(value); setPage(0); setDetail(null); setExportError(''); if (validActivityDate(value)) { setMonth(value.slice(0, 7)); onDateChange?.(value) } }
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(0); setDetail(null) }
  const refresh = () => { daily.refetch(); calendar.refetch(); history.refetch(); setDetail(null) }
  const filterDescription = `Section: ${filters.section || 'All sections'} | User: ${actors.find(a => a.id === filters.actor)?.name || 'All users'} | Action: ${filters.action ? activityAction({ action: filters.action }) : 'All actions'} | Source: ${filters.source || 'All sources'}${filters.search.trim() ? ` | Search: ${filters.search.trim()}` : ''}`
  const download = async format => {
    setExporting(format); setExportError('')
    try {
      const { downloadDailyActivity } = await import('../../lib/dailyActivityExport')
      await downloadDailyActivity(format, { ...daily.data, events: filtered, date, companyName: company?.name, historyStart, filterDescription })
    } catch (error) { setExportError(`Unable to download activity report: ${error.message || 'Please retry.'}`) }
    finally { setExporting('') }
  }
  if (!allowed) return <p role="alert" className="text-sm text-slate-300">The full daily activity report is available to company administrators.</p>
  if (!companyId) return <p className="text-sm text-slate-400">Select a company to view activity.</p>
  return <div className="min-w-0 space-y-4">
    <div className="rounded-xl border border-dark-600 bg-dark-800 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">Activity date (India time)<input aria-label="Activity date" type="date" className={control} max={today} value={date} onChange={e => chooseDate(e.target.value)} /></label>
        <button className={button} disabled={!valid} onClick={() => chooseDate(shiftActivityDate(date, -1))}>Previous day</button>
        <button className={button} disabled={!valid || date >= today} onClick={() => chooseDate(shiftActivityDate(date, 1))}>Next day</button>
        <button className={button} onClick={() => chooseDate(today)}>Today</button>
        <button className={button} disabled={daily.isFetching || calendar.isFetching || history.isFetching || !valid} onClick={refresh}>Refresh activity</button>
        <label className="flex flex-col gap-1 text-xs text-slate-400">Browse month<input aria-label="Activity calendar month" type="month" className={control} max={today.slice(0, 7)} value={month} onChange={e => setMonth(e.target.value)} /></label>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Click a date to view its activities. Times use IST (UTC+05:30).</p>
      {calendar.isError ? <p role="alert" className="mt-3 text-xs text-red-300">Unable to load calendar counts: {calendar.error?.message} <button className="underline" onClick={() => calendar.refetch()}>Retry calendar</button></p> : <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-2" aria-label="Activity calendar">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day} className="text-center text-[10px] text-slate-500">{day}</span>)}
        {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`} />)}
        {days.map(day => <button key={day} aria-label={`${day}, ${calendar.data ? calendarCounts[day] || 0 : 'loading'} activities`} aria-pressed={date === day} disabled={day > today} onClick={() => chooseDate(day)} className={`min-h-14 rounded-lg border px-1 py-2 text-center disabled:opacity-30 ${date === day ? 'border-primary-500 bg-primary-500/15 text-primary-300' : 'border-dark-700 text-slate-300 hover:border-dark-500'}`}><span className="block text-xs font-semibold">{Number(day.slice(-2))}</span><span className="block text-[9px] sm:text-[10px] text-slate-400">{calendar.isFetching ? '…' : `${calendarCounts[day] || 0} events`}</span></button>)}
      </div>}
    </div>
    <p className="text-[11px] text-slate-400">{ACTIVITY_BASIS}</p>
    {history.isError ? <p role="alert" className="text-xs text-red-300">Unable to confirm the history start: {history.error?.message} <button className="underline" onClick={() => history.refetch()}>Retry history</button></p> : <p className="text-[11px] text-slate-400">{history.isLoading ? 'Checking recorded history…' : historyStart ? `Recorded history starts on ${historyStart}. Earlier activity cannot be reconstructed from the ledger.` : 'No activity has been recorded for this company yet.'}</p>}
    {!valid && <p role="alert" className="text-xs text-red-300">Choose a valid activity date on or before today.</p>}
    {!monthValid && <p role="alert" className="text-xs text-red-300">Choose a valid calendar month on or before this month.</p>}
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dark-600 bg-dark-800 p-3">
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Section<select aria-label="Section" className={`${control} max-w-56`} value={filters.section} onChange={e => update('section', e.target.value)}><option value="">All sections</option>{ACTIVITY_SECTIONS.map(section => <option key={section} value={section}>{section} ({sectionCounts[section]})</option>)}</select></label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">User<select aria-label="User" className={`${control} max-w-56`} value={filters.actor} onChange={e => update('actor', e.target.value)}><option value="">All users</option>{actors.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Action<select aria-label="Action" className={control} value={filters.action} onChange={e => update('action', e.target.value)}><option value="">All actions</option>{actions.map(action => <option key={action} value={action}>{activityAction({ action })}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Event source<select aria-label="Event source" className={control} value={filters.source} onChange={e => update('source', e.target.value)}><option value="">All sources</option>{sources.map(source => <option key={source} value={source}>{source.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">Search activities<input className={control} type="search" value={filters.search} onChange={e => update('search', e.target.value)} placeholder="User, reference, table or change" /></label>
      <button className={button} onClick={() => { setFilters(DEFAULT_FILTERS); setPage(0); setDetail(null) }}>Reset activity filters</button>
    </div>
    <div className="flex flex-wrap gap-2">{[['pdf', 'PDF'], ['excel', 'Excel'], ['csv', 'CSV'], ['json', 'JSON']].map(([format, label]) => <button key={format} className={button} disabled={!valid || !daily.data || daily.isFetching || daily.isError || history.isLoading || history.isError || !!exporting} onClick={() => download(format)}>{exporting === format ? `Preparing ${label}…` : `Download ${label}`}</button>)}</div>
    {exportError && <p role="alert" className="text-xs text-red-300">{exportError}</p>}
    {daily.isError ? <div role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm text-red-300"><p>Unable to load a complete activity report: {daily.error?.message}</p><button className={`${button} mt-3`} disabled={daily.isFetching} onClick={() => daily.refetch()}>Retry activity report</button></div> : daily.isLoading ? <p role="status" className="py-8 text-center text-slate-400">Loading every activity for this date…</p> : valid && daily.data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Recorded activities', events.length], ['Users / automation', actors.length], ['Sections with activity', Object.values(sectionCounts).filter(count => count > 0).length], ['Deletions', events.filter(event => event.operation === 'DELETE' || /^(delete|deleted)$/.test(event.action)).length]].map(([label, value]) => <div key={label} className="rounded-xl border border-dark-600 bg-dark-800 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-primary-300">{value.toLocaleString('en-IN')}</p></div>)}</div>
      <details className="rounded-xl border border-dark-600 p-3"><summary className="cursor-pointer text-xs text-slate-300">Every section — daily activity counts</summary><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">{Object.entries(sectionCounts).map(([section, count]) => <button key={section} className="flex min-w-0 justify-between gap-2 rounded-lg bg-dark-800 p-2 text-left text-[11px] text-slate-400" onClick={() => update('section', section)}><span>{section}</span><span>{count}</span></button>)}</div></details>
      <p role="status" className="text-xs text-slate-400">{filtered.length.toLocaleString('en-IN')} matching activities of {events.length.toLocaleString('en-IN')} on {date}. Downloads include every match across all pages, with record values. Loaded at {activityTimestamp(daily.data.loadedAt)} IST.</p>
      <div className="overflow-x-auto rounded-xl border border-dark-600 bg-dark-800"><table className="w-full text-xs"><caption className="sr-only">Daily Activity Report for {date}</caption><thead><tr className="border-b border-dark-600 text-left text-slate-400">{['Event', 'Time (IST)', 'Section', 'User', 'Action', 'Reference / activity', 'Details'].map(label => <th scope="col" key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>
        {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(event => <tr key={event.id} className="border-b border-dark-700 text-slate-200"><td className="p-3">#{event.event_no}</td><td className="whitespace-nowrap p-3">{activityTimestamp(event.created_at)}</td><td className="p-3">{activitySection(event)}</td><td className="p-3">{event.actor_name || (event.actor_id ? 'Unknown user' : 'System / automation')}<span className="block text-[10px] text-slate-500">{event.actor_role}</span></td><td className="p-3">{activityAction(event)}</td><td className="max-w-sm break-words p-3"><span className="font-semibold">{activityReference(event)}</span><span className="block text-[10px] text-slate-400">{event.description}</span></td><td className="p-3"><button className="whitespace-nowrap text-primary-300 underline underline-offset-2" aria-label={`View activity ${event.event_no}`} onClick={() => setDetail(event)}>View changes</button></td></tr>)}
        {!filtered.length && <tr><td colSpan={7} className="p-8 text-center text-slate-400">{historyStart && date < historyStart ? 'This date is before recorded history began.' : 'No recorded activities match this date and these filters.'}</td></tr>}
      </tbody></table></div>
      {maxPage > 0 && <div className="flex items-center justify-between gap-2 text-xs text-slate-400"><span>Page {currentPage + 1} of {maxPage + 1}</span><div className="flex gap-2"><button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous activities</button><button className={button} disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>Next activities</button></div></div>}
    </>}
    {detail && <ActivityDetails event={detail} onClose={() => setDetail(null)} />}
  </div>
}
