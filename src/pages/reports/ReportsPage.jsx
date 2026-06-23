import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ─── Constants ────────────────────────────────────────────────────────────────

const REPORTS = [
  { id: 'equip_utilization', cat: 'Operations',    label: 'Equipment Utilization', desc: 'Hours worked, idle & breakdown per machine' },
  { id: 'equip_pl',          cat: 'Operations',    label: 'Equipment P&L',          desc: 'Revenue vs fuel & maintenance costs' },
  { id: 'shift_log',         cat: 'Operations',    label: 'Shift Log',              desc: 'Full shift history with operator & project' },
  { id: 'fuel_report',       cat: 'Operations',    label: 'Fuel Report',            desc: 'Fuel consumption and cost by equipment' },
  { id: 'incident_report',   cat: 'Operations',    label: 'Incident Report',        desc: 'Incidents logged during shifts' },
  { id: 'attendance',        cat: 'HR & Payroll',  label: 'Attendance Report',      desc: 'Employee attendance by period' },
  { id: 'payroll',           cat: 'HR & Payroll',  label: 'Payroll Summary',        desc: 'Salary structure and net pay estimate' },
  { id: 'maintenance_cost',  cat: 'Maintenance',   label: 'Maintenance Cost',       desc: 'Maintenance spend by equipment & type' },
  { id: 'revenue',           cat: 'Finance',       label: 'Revenue & Collections',  desc: 'Invoiced, collected & outstanding' },
  { id: 'invoice_aging',     cat: 'Finance',       label: 'Invoice Aging',          desc: 'Outstanding dues bucketed by age' },
  { id: 'expense_report',    cat: 'Finance',       label: 'Expense Breakdown',      desc: 'Expenses by category and vendor' },
  { id: 'project_pl',        cat: 'Projects',      label: 'Project Summary',        desc: 'Project-wise hours, costs & revenue' },
  { id: 'client_statement',  cat: 'Clients',       label: 'Client Statement',       desc: 'Billing and collection per client' },
  { id: 'stock_status',      cat: 'Inventory',     label: 'Stock Status',           desc: 'Current inventory levels by item' },
]

const CATS = ['Operations', 'HR & Payroll', 'Maintenance', 'Finance', 'Projects', 'Clients', 'Inventory']
const CAT_ICONS = { 'Operations':'⚙️', 'HR & Payroll':'👥', 'Maintenance':'🔧', 'Finance':'💰', 'Projects':'🏗️', 'Clients':'🤝', 'Inventory':'📦' }

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmt  = n => '₹' + (Number(n)||0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const fmtN = (n, dec=1) => (Number(n)||0).toLocaleString('en-IN', { maximumFractionDigits: dec })
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const monthStart = () => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10) }
const todayStr = () => new Date().toISOString().slice(0,10)

function exportCSV(rows, cols, filename) {
  const header = cols.map(c=>c.label).join(',')
  const body   = rows.map(r=>cols.map(c=>`"${r[c.key]??''}"`).join(',')).join('\n')
  const blob   = new Blob([header+'\n'+body], { type:'text/csv' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a'); a.href=url; a.download=filename+'.csv'; a.click()
  URL.revokeObjectURL(url)
}

function printSection(title, html) {
  const w = window.open('', '_blank', 'width=900,height=700')
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px}
  h1{font-size:18px;margin:0 0 4px}p.sub{color:#666;margin:0 0 16px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f3f4f6;text-align:left;padding:6px 8px;border:1px solid #e5e7eb;font-size:11px}
  td{padding:6px 8px;border:1px solid #e5e7eb;font-size:11px}tr:nth-child(even)td{background:#f9fafb}
  .stat{display:inline-block;margin:0 16px 16px 0;padding:12px 20px;border:1px solid #e5e7eb;border-radius:8px}
  .stat-v{font-size:22px;font-weight:700}.stat-l{font-size:11px;color:#666}
  @media print{body{padding:0}}</style></head><body>${html}</body></html>`)
  w.document.close(); w.focus(); w.print()
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent='text-primary-400' }) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

function BarChart({ data=[], color='#6366f1' }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d=>d.v), 1)
  return (
    <div className="flex items-end gap-1 h-32 px-1">
      {data.map((d,i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0 group relative">
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 whitespace-nowrap bg-dark-700 px-1 py-0.5 rounded z-10">
            {d.tip ?? fmtN(d.v)}
          </div>
          <div className="w-full rounded-t-sm" style={{ height:`${Math.max((d.v/max)*100,2)}%`, background:d.color||color }} />
          <span className="text-[9px] text-slate-500 truncate w-full text-center leading-none">{d.l}</span>
        </div>
      ))}
    </div>
  )
}

function FilterBar({ from, setFrom, to, setTo, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-dark-800 border border-dark-600 rounded-xl">
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-slate-400">From</label>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
          className="bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-primary-500" />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-slate-400">To</label>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)}
          className="bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-primary-500" />
      </div>
      {children}
    </div>
  )
}

function ExportBar({ onPrint, onCSV }) {
  return (
    <div className="flex gap-2 mt-4">
      <button onClick={onCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-500 hover:border-primary-500 rounded-lg text-xs text-slate-300 transition-colors">⬇ Export CSV</button>
      <button onClick={onPrint} className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 border border-dark-500 hover:border-primary-500 rounded-lg text-xs text-slate-300 transition-colors">🖨 Print / PDF</button>
    </div>
  )
}

function THead({ cols }) {
  return (
    <thead>
      <tr className="border-b border-dark-600">
        {cols.map(c => <th key={c} className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">{c}</th>)}
      </tr>
    </thead>
  )
}

function Empty({ msg='No data for this period' }) {
  return <div className="text-center text-slate-500 text-sm py-12">{msg}</div>
}

function Spinner() {
  return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
}

// ─── Equipment Utilization ────────────────────────────────────────────────────

function EquipUtilizationReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_equip_util', companyId, from, to],
    queryFn: async () => {
      const { data: shifts } = await supabase.from('shifts')
        .select('equipment_id,working_hours,idle_hours,breakdown_hours')
        .eq('company_id', companyId).gte('shift_date', from).lte('shift_date', to)
      if (!shifts?.length) return []
      const eqIds = [...new Set(shifts.map(s=>s.equipment_id).filter(Boolean))]
      const { data: eqs } = await supabase.from('equipment').select('id,name,equipment_number,category').in('id', eqIds)
      const eqMap = Object.fromEntries((eqs||[]).map(e=>[e.id,e]))
      const agg = {}
      for (const s of shifts) {
        if (!s.equipment_id) continue
        if (!agg[s.equipment_id]) agg[s.equipment_id] = { working:0, idle:0, breakdown:0 }
        agg[s.equipment_id].working   += Number(s.working_hours)||0
        agg[s.equipment_id].idle      += Number(s.idle_hours)||0
        agg[s.equipment_id].breakdown += Number(s.breakdown_hours)||0
      }
      return Object.entries(agg).map(([id,h]) => ({
        id, eq:eqMap[id], working:h.working, idle:h.idle, breakdown:h.breakdown,
        util: h.working+h.idle+h.breakdown>0 ? ((h.working/(h.working+h.idle+h.breakdown))*100).toFixed(1) : '0.0',
      })).sort((a,b)=>b.working-a.working)
    },
    enabled: !!companyId,
  })
  const totW = data.reduce((s,r)=>s+r.working,0)
  const totI = data.reduce((s,r)=>s+r.idle,0)
  const totB = data.reduce((s,r)=>s+r.breakdown,0)
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Working" value={`${fmtN(totW)} hrs`} />
        <StatCard label="Total Idle" value={`${fmtN(totI)} hrs`} accent="text-yellow-400" />
        <StatCard label="Total Breakdown" value={`${fmtN(totB)} hrs`} accent="text-red-400" />
        <StatCard label="Machines Active" value={data.length} />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 mb-5">
        <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-3">Working Hours by Equipment</p>
        <BarChart data={data.slice(0,12).map(r=>({ l:r.eq?.equipment_number||r.eq?.name?.slice(0,6)||'?', v:r.working, tip:`${fmtN(r.working)} hrs` }))} />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Equipment','Working','Idle','Breakdown','Utilization']} />
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3"><p className="text-xs text-slate-200 font-medium">{r.eq?.name||'—'}</p><p className="text-[10px] text-slate-500">{r.eq?.equipment_number} · {r.eq?.category}</p></td>
                <td className="py-2.5 px-3 text-xs text-green-400 font-mono">{fmtN(r.working)} hrs</td>
                <td className="py-2.5 px-3 text-xs text-yellow-400 font-mono">{fmtN(r.idle)} hrs</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-mono">{fmtN(r.breakdown)} hrs</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-dark-600 rounded-full h-1.5 max-w-[80px]">
                      <div className="h-1.5 rounded-full bg-primary-500" style={{ width:`${r.util}%` }} />
                    </div>
                    <span className="text-xs text-slate-300 font-mono">{r.util}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(r=>`<tr><td>${r.eq?.equipment_number||'—'}</td><td>${r.eq?.name||'—'}</td><td>${fmtN(r.working)} hrs</td><td>${fmtN(r.idle)} hrs</td><td>${fmtN(r.breakdown)} hrs</td><td>${r.util}%</td></tr>`).join('')
        printSection('Equipment Utilization',`<h1>Equipment Utilization</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><table><tr><th>Eq No.</th><th>Name</th><th>Working</th><th>Idle</th><th>Breakdown</th><th>Utilization</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(r=>({ eq_no:r.eq?.equipment_number, name:r.eq?.name, category:r.eq?.category, working_hrs:fmtN(r.working), idle_hrs:fmtN(r.idle), breakdown_hrs:fmtN(r.breakdown), utilization_pct:r.util })),
        [{key:'eq_no',label:'Eq No.'},{key:'name',label:'Equipment'},{key:'category',label:'Category'},{key:'working_hrs',label:'Working Hrs'},{key:'idle_hrs',label:'Idle Hrs'},{key:'breakdown_hrs',label:'Breakdown Hrs'},{key:'utilization_pct',label:'Utilization %'}],'equipment_utilization')} />
    </div>
  )
}

// ─── Equipment P&L ────────────────────────────────────────────────────────────

function EquipPLReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_equip_pl', companyId, from, to],
    queryFn: async () => {
      const { data: eqs } = await supabase.from('equipment').select('id,name,equipment_number,category').eq('company_id', companyId)
      if (!eqs?.length) return []
      const { data: lineItems } = await supabase.from('invoice_line_items').select('equipment_id,amount,invoice_id').in('equipment_id', eqs.map(e=>e.id))
      const { data: invoices } = await supabase.from('client_invoices').select('id,invoice_date').eq('company_id', companyId).gte('invoice_date', from).lte('invoice_date', to)
      const invoiceSet = new Set((invoices||[]).map(i=>i.id))
      const { data: shifts } = await supabase.from('shifts').select('id,equipment_id').eq('company_id', companyId).gte('shift_date', from).lte('shift_date', to)
      const shiftIds = (shifts||[]).map(s=>s.id)
      let fuelMap = {}
      if (shiftIds.length) {
        const { data: fuel } = await supabase.from('shift_fuel_entries').select('shift_id,total_amount').in('shift_id', shiftIds)
        for (const f of fuel||[]) {
          const sh = (shifts||[]).find(s=>s.id===f.shift_id)
          if (sh?.equipment_id) fuelMap[sh.equipment_id] = (fuelMap[sh.equipment_id]||0) + (Number(f.total_amount)||0)
        }
      }
      const { data: maint } = await supabase.from('maintenance_records').select('equipment_id,total_cost').eq('company_id', companyId).gte('service_date', from).lte('service_date', to)
      const maintMap = {}
      for (const m of maint||[]) maintMap[m.equipment_id] = (maintMap[m.equipment_id]||0) + (Number(m.total_cost)||0)
      return eqs.map(eq => {
        const revenue  = (lineItems||[]).filter(l=>l.equipment_id===eq.id && invoiceSet.has(l.invoice_id)).reduce((s,l)=>s+(Number(l.amount)||0),0)
        const fuelCost = fuelMap[eq.id]  || 0
        const maintCost= maintMap[eq.id] || 0
        return { id:eq.id, eq, revenue, fuelCost, maintCost, pl:revenue-fuelCost-maintCost }
      }).filter(r=>r.revenue+r.fuelCost+r.maintCost>0).sort((a,b)=>b.pl-a.pl)
    },
    enabled: !!companyId,
  })
  const totRevenue = data.reduce((s,r)=>s+r.revenue,0)
  const totFuel    = data.reduce((s,r)=>s+r.fuelCost,0)
  const totMaint   = data.reduce((s,r)=>s+r.maintCost,0)
  const totPL      = data.reduce((s,r)=>s+r.pl,0)
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No linked invoice line items or costs for this period" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Revenue" value={fmt(totRevenue)} />
        <StatCard label="Fuel Cost" value={fmt(totFuel)} accent="text-yellow-400" />
        <StatCard label="Maint. Cost" value={fmt(totMaint)} accent="text-orange-400" />
        <StatCard label="Net P&L" value={fmt(totPL)} accent={totPL>=0?'text-green-400':'text-red-400'} />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 mb-5">
        <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-3">P&L by Equipment</p>
        <BarChart data={data.slice(0,10).map(r=>({ l:r.eq?.equipment_number||r.eq?.name?.slice(0,6)||'?', v:Math.max(r.pl,0), color:r.pl>=0?'#22c55e':'#ef4444', tip:fmt(r.pl) }))} />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Equipment','Revenue','Fuel Cost','Maint. Cost','Net P&L']} />
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3"><p className="text-xs text-slate-200 font-medium">{r.eq?.name}</p><p className="text-[10px] text-slate-500">{r.eq?.equipment_number}</p></td>
                <td className="py-2.5 px-3 text-xs text-slate-200 font-mono">{fmt(r.revenue)}</td>
                <td className="py-2.5 px-3 text-xs text-yellow-400 font-mono">{fmt(r.fuelCost)}</td>
                <td className="py-2.5 px-3 text-xs text-orange-400 font-mono">{fmt(r.maintCost)}</td>
                <td className={`py-2.5 px-3 text-xs font-bold font-mono ${r.pl>=0?'text-green-400':'text-red-400'}`}>{fmt(r.pl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(r=>`<tr><td>${r.eq?.equipment_number||'—'}</td><td>${r.eq?.name}</td><td>${fmt(r.revenue)}</td><td>${fmt(r.fuelCost)}</td><td>${fmt(r.maintCost)}</td><td style="color:${r.pl>=0?'green':'red'}">${fmt(r.pl)}</td></tr>`).join('')
        printSection('Equipment P&L',`<h1>Equipment P&L</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><table><tr><th>Eq No.</th><th>Name</th><th>Revenue</th><th>Fuel Cost</th><th>Maint Cost</th><th>Net P&L</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(r=>({ eq_no:r.eq?.equipment_number, name:r.eq?.name, revenue:r.revenue, fuel_cost:r.fuelCost, maint_cost:r.maintCost, net_pl:r.pl })),
        [{key:'eq_no',label:'Eq No.'},{key:'name',label:'Equipment'},{key:'revenue',label:'Revenue'},{key:'fuel_cost',label:'Fuel Cost'},{key:'maint_cost',label:'Maint Cost'},{key:'net_pl',label:'Net P&L'}],'equipment_pl')} />
    </div>
  )
}

// ─── Shift Log ────────────────────────────────────────────────────────────────

function ShiftLogReport({ companyId, from, to }) {
  const [search, setSearch] = useState('')
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_shift_log', companyId, from, to],
    queryFn: async () => {
      const { data: shifts } = await supabase.from('shifts')
        .select('id,shift_date,shift_type,equipment_id,operator_name,working_hours,idle_hours,breakdown_hours,project_id,status')
        .eq('company_id', companyId).gte('shift_date', from).lte('shift_date', to).order('shift_date', { ascending:false })
      if (!shifts?.length) return []
      const eqIds = [...new Set(shifts.map(s=>s.equipment_id).filter(Boolean))]
      const { data: eqs } = await supabase.from('equipment').select('id,name,equipment_number').in('id', eqIds)
      const eqMap = Object.fromEntries((eqs||[]).map(e=>[e.id,e]))
      const pIds = [...new Set(shifts.map(s=>s.project_id).filter(Boolean))]
      let pMap = {}
      if (pIds.length) {
        const { data: ps } = await supabase.from('projects').select('id,project_name,project_code').in('id', pIds)
        pMap = Object.fromEntries((ps||[]).map(p=>[p.id,p]))
      }
      return shifts.map(s=>({ ...s, _eq:eqMap[s.equipment_id], _project:pMap[s.project_id] }))
    },
    enabled: !!companyId,
  })
  const filtered = useMemo(() => {
    if (!search) return data
    const q = search.toLowerCase()
    return data.filter(s => s._eq?.name?.toLowerCase().includes(q) || s.operator_name?.toLowerCase().includes(q) || s._project?.project_name?.toLowerCase().includes(q) || s.shift_date?.includes(q))
  }, [data, search])
  if (isLoading) return <Spinner />
  return (
    <div>
      <input type="text" placeholder="Search equipment, operator, project…" value={search} onChange={e=>setSearch(e.target.value)}
        className="w-full mb-4 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard label="Total Shifts" value={filtered.length} />
        <StatCard label="Working Hours" value={`${fmtN(filtered.reduce((s,r)=>s+(Number(r.working_hours)||0),0))} hrs`} />
        <StatCard label="Breakdown Hours" value={`${fmtN(filtered.reduce((s,r)=>s+(Number(r.breakdown_hours)||0),0))} hrs`} accent="text-red-400" />
      </div>
      {!filtered.length ? <Empty /> : (
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <THead cols={['Date','Equipment','Operator','Project','Hours','Status']} />
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                  <td className="py-2.5 px-3 text-xs text-slate-300">{fmtDate(s.shift_date)}<br/><span className="text-[10px] text-slate-500 capitalize">{s.shift_type} shift</span></td>
                  <td className="py-2.5 px-3 text-xs text-slate-200">{s._eq?.name||'—'}<br/><span className="text-[10px] text-slate-500">{s._eq?.equipment_number}</span></td>
                  <td className="py-2.5 px-3 text-xs text-slate-300">{s.operator_name||'—'}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400">{s._project?.project_name||'—'}</td>
                  <td className="py-2.5 px-3 text-xs font-mono text-slate-300">{fmtN(s.working_hours)} hrs</td>
                  <td className="py-2.5 px-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.status==='completed'?'bg-green-900/40 text-green-400':'bg-yellow-900/40 text-yellow-400'}`}>{s.status||'active'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ExportBar onPrint={() => {
        const rows = filtered.map(s=>`<tr><td>${fmtDate(s.shift_date)}</td><td>${s._eq?.name||'—'}</td><td>${s.operator_name||'—'}</td><td>${s._project?.project_name||'—'}</td><td>${fmtN(s.working_hours)} hrs</td><td>${s.status||'—'}</td></tr>`).join('')
        printSection('Shift Log',`<h1>Shift Log</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><table><tr><th>Date</th><th>Equipment</th><th>Operator</th><th>Project</th><th>Working Hrs</th><th>Status</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(filtered.map(s=>({ date:s.shift_date, type:s.shift_type, equipment:s._eq?.name, eq_no:s._eq?.equipment_number, operator:s.operator_name, project:s._project?.project_name, working_hrs:fmtN(s.working_hours), idle_hrs:fmtN(s.idle_hours), breakdown_hrs:fmtN(s.breakdown_hours), status:s.status })),
        [{key:'date',label:'Date'},{key:'type',label:'Shift'},{key:'equipment',label:'Equipment'},{key:'eq_no',label:'Eq No.'},{key:'operator',label:'Operator'},{key:'project',label:'Project'},{key:'working_hrs',label:'Working Hrs'},{key:'idle_hrs',label:'Idle Hrs'},{key:'breakdown_hrs',label:'Breakdown Hrs'},{key:'status',label:'Status'}],'shift_log')} />
    </div>
  )
}

// ─── Fuel Report ──────────────────────────────────────────────────────────────

function FuelReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_fuel', companyId, from, to],
    queryFn: async () => {
      const { data: shifts } = await supabase.from('shifts').select('id,equipment_id,shift_date').eq('company_id', companyId).gte('shift_date', from).lte('shift_date', to)
      if (!shifts?.length) return []
      const shiftIds = shifts.map(s=>s.id)
      const { data: fuel } = await supabase.from('shift_fuel_entries').select('shift_id,quantity_liters,rate_per_liter,total_amount').in('shift_id', shiftIds)
      if (!fuel?.length) return []
      const eqIds = [...new Set(shifts.map(s=>s.equipment_id).filter(Boolean))]
      const { data: eqs } = await supabase.from('equipment').select('id,name,equipment_number').in('id', eqIds)
      const eqMap = Object.fromEntries((eqs||[]).map(e=>[e.id,e]))
      const shiftMap = Object.fromEntries(shifts.map(s=>[s.id,s]))
      const agg = {}
      for (const f of fuel) {
        const sh = shiftMap[f.shift_id]
        if (!sh?.equipment_id) continue
        if (!agg[sh.equipment_id]) agg[sh.equipment_id] = { qty:0, amt:0, entries:0 }
        agg[sh.equipment_id].qty     += Number(f.quantity_liters)||0
        agg[sh.equipment_id].amt     += Number(f.total_amount)||0
        agg[sh.equipment_id].entries += 1
      }
      return Object.entries(agg).map(([id,d]) => ({
        id, eq:eqMap[id], qty:d.qty, amt:d.amt, entries:d.entries, avgRate:d.qty>0?d.amt/d.qty:0,
      })).sort((a,b)=>b.amt-a.amt)
    },
    enabled: !!companyId,
  })
  const totQty = data.reduce((s,r)=>s+r.qty,0)
  const totAmt = data.reduce((s,r)=>s+r.amt,0)
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No fuel entries for this period" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard label="Total Fuel" value={`${fmtN(totQty,0)} L`} />
        <StatCard label="Total Cost" value={fmt(totAmt)} />
        <StatCard label="Avg Rate" value={totQty>0?`₹${fmtN(totAmt/totQty,2)}/L`:'—'} />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 mb-5">
        <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-3">Fuel Cost by Equipment</p>
        <BarChart data={data.slice(0,12).map(r=>({ l:r.eq?.equipment_number||r.eq?.name?.slice(0,6)||'?', v:r.amt, tip:`${fmtN(r.qty)}L · ${fmt(r.amt)}` }))} color="#f59e0b" />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Equipment','Qty (Litres)','Avg Rate/L','Total Cost','Fill-ups']} />
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3"><p className="text-xs text-slate-200">{r.eq?.name||'—'}</p><p className="text-[10px] text-slate-500">{r.eq?.equipment_number}</p></td>
                <td className="py-2.5 px-3 text-xs text-slate-300 font-mono">{fmtN(r.qty,1)} L</td>
                <td className="py-2.5 px-3 text-xs text-slate-400 font-mono">₹{fmtN(r.avgRate,2)}</td>
                <td className="py-2.5 px-3 text-xs text-yellow-400 font-bold font-mono">{fmt(r.amt)}</td>
                <td className="py-2.5 px-3 text-xs text-slate-500">{r.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(r=>`<tr><td>${r.eq?.equipment_number||'—'}</td><td>${r.eq?.name}</td><td>${fmtN(r.qty,1)} L</td><td>₹${fmtN(r.avgRate,2)}</td><td>${fmt(r.amt)}</td><td>${r.entries}</td></tr>`).join('')
        printSection('Fuel Report',`<h1>Fuel Report</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><table><tr><th>Eq No.</th><th>Equipment</th><th>Qty (L)</th><th>Avg Rate</th><th>Total Cost</th><th>Fill-ups</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(r=>({ equipment:r.eq?.name, eq_no:r.eq?.equipment_number, qty_liters:fmtN(r.qty,2), total_cost:r.amt, avg_rate:fmtN(r.avgRate,2), fillups:r.entries })),
        [{key:'eq_no',label:'Eq No.'},{key:'equipment',label:'Equipment'},{key:'qty_liters',label:'Qty (L)'},{key:'total_cost',label:'Total Cost'},{key:'avg_rate',label:'Avg Rate/L'},{key:'fillups',label:'Fill-ups'}],'fuel_report')} />
    </div>
  )
}

// ─── Incident Report ──────────────────────────────────────────────────────────

function IncidentReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_incidents', companyId, from, to],
    queryFn: async () => {
      const { data: shifts } = await supabase.from('shifts').select('id,equipment_id,shift_date,operator_name').eq('company_id', companyId).gte('shift_date', from).lte('shift_date', to)
      if (!shifts?.length) return []
      const shiftIds = shifts.map(s=>s.id)
      const { data: incidents } = await supabase.from('shift_incidents').select('*').in('shift_id', shiftIds)
      if (!incidents?.length) return []
      const eqIds = [...new Set(shifts.map(s=>s.equipment_id).filter(Boolean))]
      const { data: eqs } = await supabase.from('equipment').select('id,name,equipment_number').in('id', eqIds)
      const eqMap = Object.fromEntries((eqs||[]).map(e=>[e.id,e]))
      const shiftMap = Object.fromEntries(shifts.map(s=>[s.id,s]))
      return incidents.map(inc => { const sh=shiftMap[inc.shift_id]; return { ...inc, _eq:eqMap[sh?.equipment_id], _shift:sh } })
    },
    enabled: !!companyId,
  })
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No incidents reported in this period" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Incidents" value={data.length} accent="text-red-400" />
        <StatCard label="Breakdowns" value={data.filter(i=>i.incident_type==='breakdown').length} accent="text-orange-400" />
        <StatCard label="Accidents" value={data.filter(i=>i.incident_type==='accident').length} accent="text-red-500" />
        <StatCard label="Near Misses" value={data.filter(i=>i.incident_type==='near_miss').length} accent="text-yellow-400" />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Date','Equipment','Operator','Type','Severity','Description']} />
          <tbody>
            {data.map(inc => (
              <tr key={inc.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3 text-xs text-slate-300">{fmtDate(inc._shift?.shift_date)}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200">{inc._eq?.name||'—'}<br/><span className="text-[10px] text-slate-500">{inc._eq?.equipment_number}</span></td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{inc._shift?.operator_name||'—'}</td>
                <td className="py-2.5 px-3 text-xs capitalize text-slate-300">{inc.incident_type||'—'}</td>
                <td className="py-2.5 px-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${inc.severity==='high'||inc.severity==='critical'?'bg-red-900/40 text-red-400':inc.severity==='medium'?'bg-yellow-900/40 text-yellow-400':'bg-dark-600 text-slate-400'}`}>{inc.severity||'—'}</span>
                </td>
                <td className="py-2.5 px-3 text-xs text-slate-400 max-w-xs truncate">{inc.description||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(i=>`<tr><td>${fmtDate(i._shift?.shift_date)}</td><td>${i._eq?.name||'—'}</td><td>${i._shift?.operator_name||'—'}</td><td>${i.incident_type||'—'}</td><td>${i.severity||'—'}</td><td>${i.description||'—'}</td></tr>`).join('')
        printSection('Incident Report',`<h1>Incident Report</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><table><tr><th>Date</th><th>Equipment</th><th>Operator</th><th>Type</th><th>Severity</th><th>Description</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(i=>({ date:i._shift?.shift_date, equipment:i._eq?.name, operator:i._shift?.operator_name, type:i.incident_type, severity:i.severity, description:i.description })),
        [{key:'date',label:'Date'},{key:'equipment',label:'Equipment'},{key:'operator',label:'Operator'},{key:'type',label:'Type'},{key:'severity',label:'Severity'},{key:'description',label:'Description'}],'incident_report')} />
    </div>
  )
}

// ─── Attendance Report ────────────────────────────────────────────────────────

function AttendanceReport({ companyId, from, to }) {
  const [empFilter, setEmpFilter] = useState('')
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_attendance', companyId, from, to],
    queryFn: async () => {
      const { data: emps } = await supabase.from('hr_employees').select('id,name,designation,employee_number,department').eq('company_id', companyId).eq('is_active', true)
      if (!emps?.length) return []
      const { data: att } = await supabase.from('hr_attendance').select('employee_id,date,status,ot_hours').eq('company_id', companyId).gte('date', from).lte('date', to)
      const attMap = {}
      for (const a of att||[]) {
        if (!attMap[a.employee_id]) attMap[a.employee_id] = { present:0, absent:0, halfday:0, leave:0, ot:0 }
        if (a.status==='present') attMap[a.employee_id].present++
        else if (a.status==='absent') attMap[a.employee_id].absent++
        else if (a.status==='half_day') attMap[a.employee_id].halfday++
        else if (a.status==='leave') attMap[a.employee_id].leave++
        attMap[a.employee_id].ot += Number(a.ot_hours)||0
      }
      const days = Math.max(Math.round((new Date(to)-new Date(from))/86400000)+1,1)
      return emps.map(e => ({
        ...e, ...(attMap[e.id]||{ present:0, absent:0, halfday:0, leave:0, ot:0 }),
        attPct: days>0?(((attMap[e.id]?.present||0)/days)*100).toFixed(0):0,
      }))
    },
    enabled: !!companyId,
  })
  const filtered = empFilter ? data.filter(e=>e.name.toLowerCase().includes(empFilter.toLowerCase())) : data
  if (isLoading) return <Spinner />
  if (!filtered.length) return <Empty />
  return (
    <div>
      <input type="text" placeholder="Search employee…" value={empFilter} onChange={e=>setEmpFilter(e.target.value)}
        className="w-full mb-4 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Present" value={filtered.reduce((s,e)=>s+e.present,0)} />
        <StatCard label="Total Absent" value={filtered.reduce((s,e)=>s+e.absent,0)} accent="text-red-400" />
        <StatCard label="Avg Attendance" value={filtered.length?Math.round(filtered.reduce((s,e)=>s+Number(e.attPct),0)/filtered.length)+'%':'—'} />
        <StatCard label="Employees" value={filtered.length} />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Employee','Department','Present','Absent','Half Day','Leave','OT Hrs','Attendance %']} />
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3"><p className="text-xs text-slate-200 font-medium">{e.name}</p><p className="text-[10px] text-slate-500">{e.employee_number} · {e.designation}</p></td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{e.department||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-green-400 font-mono">{e.present}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-mono">{e.absent}</td>
                <td className="py-2.5 px-3 text-xs text-yellow-400 font-mono">{e.halfday}</td>
                <td className="py-2.5 px-3 text-xs text-blue-400 font-mono">{e.leave}</td>
                <td className="py-2.5 px-3 text-xs text-slate-300 font-mono">{fmtN(e.ot,1)}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-dark-600 rounded-full h-1.5 max-w-[60px]"><div className="h-1.5 rounded-full bg-green-500" style={{ width:`${e.attPct}%` }} /></div>
                    <span className="text-xs text-slate-300 font-mono">{e.attPct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = filtered.map(e=>`<tr><td>${e.employee_number||'—'}</td><td>${e.name}</td><td>${e.department||'—'}</td><td>${e.present}</td><td>${e.absent}</td><td>${e.halfday}</td><td>${e.leave}</td><td>${fmtN(e.ot,1)}</td><td>${e.attPct}%</td></tr>`).join('')
        printSection('Attendance Report',`<h1>Attendance Report</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><table><tr><th>Emp No.</th><th>Name</th><th>Dept</th><th>Present</th><th>Absent</th><th>Half Day</th><th>Leave</th><th>OT Hrs</th><th>Att %</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(filtered.map(e=>({ emp_no:e.employee_number, name:e.name, department:e.department, designation:e.designation, present:e.present, absent:e.absent, half_day:e.halfday, leave:e.leave, ot_hrs:fmtN(e.ot,1), attendance_pct:e.attPct+'%' })),
        [{key:'emp_no',label:'Emp No.'},{key:'name',label:'Name'},{key:'department',label:'Dept'},{key:'designation',label:'Designation'},{key:'present',label:'Present'},{key:'absent',label:'Absent'},{key:'half_day',label:'Half Day'},{key:'leave',label:'Leave'},{key:'ot_hrs',label:'OT Hrs'},{key:'attendance_pct',label:'Att %'}],'attendance_report')} />
    </div>
  )
}

// ─── Payroll Summary ──────────────────────────────────────────────────────────

function PayrollReport({ companyId }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_payroll', companyId],
    queryFn: async () => {
      const { data: emps } = await supabase.from('hr_employees').select('id,name,designation,employee_number,department,employment_type,is_active').eq('company_id', companyId)
      if (!emps?.length) return []
      const { data: sal } = await supabase.from('hr_salary_structure').select('employee_id,basic_salary,hra,special_allowance,other_allowance,daily_rate,day_shift_rate,pf_applicable,esi_applicable,pt_applicable').in('employee_id', emps.map(e=>e.id))
      const salMap = Object.fromEntries((sal||[]).map(s=>[s.employee_id,s]))
      return emps.map(e => {
        const s = salMap[e.id]||{}
        const gross = (Number(s.basic_salary)||0)+(Number(s.hra)||0)+(Number(s.special_allowance)||0)+(Number(s.other_allowance)||0)
        const pf  = s.pf_applicable  ? Math.round(Number(s.basic_salary||0)*0.12) : 0
        const esi = s.esi_applicable && gross<=21000 ? Math.round(gross*0.0075) : 0
        const pt  = s.pt_applicable  ? (gross>75000?1025:gross>60000?690:gross>45000?315:gross>30000?135:0) : 0
        return { ...e, s, gross, pf, esi, pt, net:gross-pf-esi-pt, isDaily:!!(s.daily_rate||s.day_shift_rate), dailyRate:s.daily_rate||s.day_shift_rate||0 }
      })
    },
    enabled: !!companyId,
  })
  const active   = data.filter(e=>e.is_active)
  const totGross = active.reduce((s,e)=>s+e.gross,0)
  const totNet   = active.reduce((s,e)=>s+e.net,0)
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No employee salary data found" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Active Employees" value={active.length} />
        <StatCard label="Gross Monthly" value={fmt(totGross)} />
        <StatCard label="Net Payable" value={fmt(totNet)} />
        <StatCard label="Deductions" value={fmt(totGross-totNet)} accent="text-red-400" />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Employee','Department','Type','Gross','PF','ESI','PT','Net Pay']} />
          <tbody>
            {data.map(e => (
              <tr key={e.id} className={`border-b border-dark-700 hover:bg-dark-700/40 transition-colors ${!e.is_active?'opacity-40':''}`}>
                <td className="py-2.5 px-3"><p className="text-xs text-slate-200 font-medium">{e.name}</p><p className="text-[10px] text-slate-500">{e.employee_number} · {e.designation}</p></td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{e.department||'—'}</td>
                <td className="py-2.5 px-3 text-[10px] text-slate-500 capitalize">{e.employment_type||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200 font-mono">{e.isDaily?`₹${fmtN(e.dailyRate,0)}/day`:fmt(e.gross)}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-mono">{e.pf?fmt(e.pf):'—'}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-mono">{e.esi?fmt(e.esi):'—'}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-mono">{e.pt?fmt(e.pt):'—'}</td>
                <td className="py-2.5 px-3 text-xs text-green-400 font-bold font-mono">{e.isDaily?'—':fmt(e.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(e=>`<tr><td>${e.employee_number||'—'}</td><td>${e.name}</td><td>${e.department||'—'}</td><td>${e.isDaily?`₹${fmtN(e.dailyRate,0)}/day`:fmt(e.gross)}</td><td>${e.pf||'—'}</td><td>${e.esi||'—'}</td><td>${e.pt||'—'}</td><td>${e.isDaily?'—':fmt(e.net)}</td></tr>`).join('')
        printSection('Payroll Summary',`<h1>Payroll Summary</h1><div><span class="stat"><span class="stat-v">${fmt(totGross)}</span><br/><span class="stat-l">Gross Monthly</span></span><span class="stat"><span class="stat-v">${fmt(totNet)}</span><br/><span class="stat-l">Net Payable</span></span></div><table><tr><th>Emp No.</th><th>Name</th><th>Dept</th><th>Gross</th><th>PF</th><th>ESI</th><th>PT</th><th>Net Pay</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(e=>({ emp_no:e.employee_number, name:e.name, department:e.department, designation:e.designation, type:e.employment_type, gross:e.gross, pf:e.pf, esi:e.esi, pt:e.pt, net:e.net, status:e.is_active?'Active':'Inactive' })),
        [{key:'emp_no',label:'Emp No.'},{key:'name',label:'Name'},{key:'department',label:'Dept'},{key:'designation',label:'Designation'},{key:'type',label:'Type'},{key:'gross',label:'Gross'},{key:'pf',label:'PF'},{key:'esi',label:'ESI'},{key:'pt',label:'PT'},{key:'net',label:'Net'},{key:'status',label:'Status'}],'payroll_summary')} />
    </div>
  )
}

// ─── Maintenance Cost ─────────────────────────────────────────────────────────

function MaintenanceCostReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_maint_cost', companyId, from, to],
    queryFn: async () => {
      const { data: records } = await supabase.from('maintenance_records')
        .select('id,equipment_id,maintenance_type,service_date,total_cost,labour_cost,downtime_hours,status,technician_name,priority')
        .eq('company_id', companyId).gte('service_date', from).lte('service_date', to).order('service_date', { ascending:false })
      if (!records?.length) return []
      const eqIds = [...new Set(records.map(r=>r.equipment_id).filter(Boolean))]
      const { data: eqs } = await supabase.from('equipment').select('id,name,equipment_number,category').in('id', eqIds)
      const eqMap = Object.fromEntries((eqs||[]).map(e=>[e.id,e]))
      return records.map(r=>({ ...r, _eq:eqMap[r.equipment_id] }))
    },
    enabled: !!companyId,
  })
  const totCost     = data.reduce((s,r)=>s+(Number(r.total_cost)||0),0)
  const totLabour   = data.reduce((s,r)=>s+(Number(r.labour_cost)||0),0)
  const totDowntime = data.reduce((s,r)=>s+(Number(r.downtime_hours)||0),0)
  const byEq = useMemo(() => {
    const m={}; data.forEach(r=>{ if(!r.equipment_id) return; if(!m[r.equipment_id]) m[r.equipment_id]={eq:r._eq,cost:0}; m[r.equipment_id].cost+=Number(r.total_cost)||0 })
    return Object.values(m).sort((a,b)=>b.cost-a.cost).slice(0,10)
  }, [data])
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No maintenance records for this period" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Cost" value={fmt(totCost)} accent="text-orange-400" />
        <StatCard label="Labour Cost" value={fmt(totLabour)} />
        <StatCard label="Total Downtime" value={`${fmtN(totDowntime)} hrs`} accent="text-red-400" />
        <StatCard label="Records" value={data.length} />
      </div>
      {byEq.length>0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 mb-5">
          <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-3">Cost by Equipment</p>
          <BarChart data={byEq.map(r=>({ l:r.eq?.equipment_number||r.eq?.name?.slice(0,6)||'?', v:r.cost, tip:fmt(r.cost) }))} color="#f97316" />
        </div>
      )}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Date','Equipment','Type','Priority','Total Cost','Downtime','Status']} />
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3 text-xs text-slate-300">{fmtDate(r.service_date)}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200">{r._eq?.name||'—'}<br/><span className="text-[10px] text-slate-500">{r._eq?.equipment_number}</span></td>
                <td className="py-2.5 px-3 text-xs text-slate-400 capitalize">{(r.maintenance_type||'').replace(/_/g,' ')}</td>
                <td className="py-2.5 px-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.priority==='critical'?'bg-red-900/40 text-red-400':r.priority==='high'?'bg-orange-900/40 text-orange-400':'bg-dark-600 text-slate-400'}`}>{r.priority||'normal'}</span></td>
                <td className="py-2.5 px-3 text-xs text-orange-400 font-bold font-mono">{fmt(r.total_cost)}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-mono">{fmtN(r.downtime_hours)} hrs</td>
                <td className="py-2.5 px-3 text-[10px] text-slate-400 capitalize">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(r=>`<tr><td>${fmtDate(r.service_date)}</td><td>${r._eq?.name||'—'}</td><td>${r.maintenance_type||'—'}</td><td>${r.priority||'normal'}</td><td>${fmt(r.total_cost)}</td><td>${r.downtime_hours||0} hrs</td><td>${r.status}</td></tr>`).join('')
        printSection('Maintenance Cost',`<h1>Maintenance Cost Report</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><div><span class="stat"><span class="stat-v">${fmt(totCost)}</span><br/><span class="stat-l">Total Cost</span></span><span class="stat"><span class="stat-v">${fmtN(totDowntime)} hrs</span><br/><span class="stat-l">Downtime</span></span></div><table><tr><th>Date</th><th>Equipment</th><th>Type</th><th>Priority</th><th>Cost</th><th>Downtime</th><th>Status</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(r=>({ date:r.service_date, equipment:r._eq?.name, eq_no:r._eq?.equipment_number, type:r.maintenance_type, priority:r.priority, status:r.status, total_cost:r.total_cost||0, labour_cost:r.labour_cost||0, downtime_hrs:r.downtime_hours||0, technician:r.technician_name })),
        [{key:'date',label:'Date'},{key:'eq_no',label:'Eq No.'},{key:'equipment',label:'Equipment'},{key:'type',label:'Type'},{key:'priority',label:'Priority'},{key:'status',label:'Status'},{key:'total_cost',label:'Total Cost'},{key:'labour_cost',label:'Labour Cost'},{key:'downtime_hrs',label:'Downtime Hrs'},{key:'technician',label:'Technician'}],'maintenance_cost')} />
    </div>
  )
}

// ─── Revenue & Collections ────────────────────────────────────────────────────

function RevenueReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_revenue', companyId, from, to],
    queryFn: async () => {
      const { data: invoices } = await supabase.from('client_invoices')
        .select('id,invoice_number,invoice_date,due_date,total_amount,paid_amount,balance_due,status,client_id')
        .eq('company_id', companyId).gte('invoice_date', from).lte('invoice_date', to).order('invoice_date', { ascending:false })
      const { data: clients } = await supabase.from('clients').select('id,name').eq('company_id', companyId)
      const clientMap = Object.fromEntries((clients||[]).map(c=>[c.id,c]))
      return (invoices||[]).map(inv=>({ ...inv, _client:clientMap[inv.client_id] }))
    },
    enabled: !!companyId,
  })
  const totInvoiced    = data.reduce((s,r)=>s+(Number(r.total_amount)||0),0)
  const totCollected   = data.reduce((s,r)=>s+(Number(r.paid_amount)||0),0)
  const totOutstanding = data.reduce((s,r)=>s+(Number(r.balance_due)||0),0)
  const collRate = totInvoiced>0?((totCollected/totInvoiced)*100).toFixed(0):0
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No invoices found for this period" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Invoiced" value={fmt(totInvoiced)} />
        <StatCard label="Collected" value={fmt(totCollected)} accent="text-green-400" />
        <StatCard label="Outstanding" value={fmt(totOutstanding)} accent="text-red-400" />
        <StatCard label="Collection Rate" value={`${collRate}%`} />
      </div>
      <div className="mb-5 bg-dark-800 border border-dark-600 rounded-xl p-4">
        <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-2">Collection Progress</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-dark-600 rounded-full h-3"><div className="h-3 rounded-full bg-gradient-to-r from-green-500 to-primary-500 transition-all" style={{ width:`${collRate}%` }} /></div>
          <span className="text-sm font-bold text-slate-200">{collRate}%</span>
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-500"><span>Collected: {fmt(totCollected)}</span><span>Outstanding: {fmt(totOutstanding)}</span></div>
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Invoice','Client','Date','Due Date','Total','Paid','Balance','Status']} />
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3 text-xs text-primary-400 font-mono">{r.invoice_number}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200">{r._client?.name||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{fmtDate(r.invoice_date)}</td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{fmtDate(r.due_date)}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200 font-mono">{fmt(r.total_amount)}</td>
                <td className="py-2.5 px-3 text-xs text-green-400 font-mono">{fmt(r.paid_amount)}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-mono">{fmt(r.balance_due)}</td>
                <td className="py-2.5 px-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.status==='paid'?'bg-green-900/40 text-green-400':r.status==='sent'?'bg-blue-900/40 text-blue-400':r.status==='overdue'?'bg-red-900/40 text-red-400':'bg-dark-600 text-slate-400'}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(r=>`<tr><td>${r.invoice_number}</td><td>${r._client?.name||'—'}</td><td>${fmtDate(r.invoice_date)}</td><td>${fmtDate(r.due_date)}</td><td>${fmt(r.total_amount)}</td><td>${fmt(r.paid_amount)}</td><td>${fmt(r.balance_due)}</td><td>${r.status}</td></tr>`).join('')
        printSection('Revenue & Collections',`<h1>Revenue & Collections</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><div><span class="stat"><span class="stat-v">${fmt(totInvoiced)}</span><br/><span class="stat-l">Invoiced</span></span><span class="stat"><span class="stat-v">${fmt(totCollected)}</span><br/><span class="stat-l">Collected</span></span><span class="stat"><span class="stat-v">${fmt(totOutstanding)}</span><br/><span class="stat-l">Outstanding</span></span></div><table><tr><th>Invoice</th><th>Client</th><th>Date</th><th>Due</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(r=>({ invoice_no:r.invoice_number, client:r._client?.name, date:r.invoice_date, due_date:r.due_date, total:r.total_amount, paid:r.paid_amount, balance:r.balance_due, status:r.status })),
        [{key:'invoice_no',label:'Invoice No.'},{key:'client',label:'Client'},{key:'date',label:'Date'},{key:'due_date',label:'Due Date'},{key:'total',label:'Total'},{key:'paid',label:'Paid'},{key:'balance',label:'Balance'},{key:'status',label:'Status'}],'revenue_collections')} />
    </div>
  )
}

// ─── Invoice Aging ────────────────────────────────────────────────────────────

function InvoiceAgingReport({ companyId }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_aging', companyId],
    queryFn: async () => {
      const { data: invoices } = await supabase.from('client_invoices').select('id,invoice_number,due_date,balance_due,status,client_id').eq('company_id', companyId).neq('status','paid').gt('balance_due',0)
      const { data: clients } = await supabase.from('clients').select('id,name,phone').eq('company_id', companyId)
      const clientMap = Object.fromEntries((clients||[]).map(c=>[c.id,c]))
      const now = new Date()
      return (invoices||[]).map(inv => {
        const due = inv.due_date ? new Date(inv.due_date) : null
        const days = due ? Math.floor((now-due)/86400000) : 0
        const bucket = days<=0?'current':days<=30?'1-30':days<=60?'31-60':days<=90?'61-90':'90+'
        return { ...inv, _client:clientMap[inv.client_id], days, bucket }
      }).sort((a,b)=>b.days-a.days)
    },
    enabled: !!companyId,
  })
  const buckets = ['current','1-30','31-60','61-90','90+']
  const bucketTotals = useMemo(() => {
    const m={}; buckets.forEach(b=>{ m[b]={ count:0, amt:0 } }); data.forEach(r=>{ m[r.bucket].count++; m[r.bucket].amt+=Number(r.balance_due)||0 }); return m
  }, [data])
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No outstanding invoices" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {buckets.map(b => (
          <StatCard key={b} label={b==='current'?'Current / Not Due':`${b} days overdue`}
            value={fmt(bucketTotals[b].amt)} sub={`${bucketTotals[b].count} invoices`}
            accent={b==='current'?'text-slate-200':b==='1-30'?'text-yellow-400':b==='31-60'?'text-orange-400':'text-red-400'} />
        ))}
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Invoice','Client','Due Date','Days Overdue','Balance','Bucket']} />
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3 text-xs text-primary-400 font-mono">{r.invoice_number}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200">{r._client?.name||'—'}<br/><span className="text-[10px] text-slate-500">{r._client?.phone}</span></td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{fmtDate(r.due_date)}</td>
                <td className="py-2.5 px-3 text-xs font-mono text-slate-300">{r.days>0?`${r.days} days`:'Not due'}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-bold font-mono">{fmt(r.balance_due)}</td>
                <td className="py-2.5 px-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.bucket==='current'?'bg-dark-600 text-slate-400':r.bucket==='1-30'?'bg-yellow-900/40 text-yellow-400':r.bucket==='31-60'?'bg-orange-900/40 text-orange-400':'bg-red-900/40 text-red-400'}`}>{r.bucket}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(r=>`<tr><td>${r.invoice_number}</td><td>${r._client?.name||'—'}</td><td>${fmtDate(r.due_date)}</td><td>${r.days>0?r.days+' days':'Not due'}</td><td>${fmt(r.balance_due)}</td><td>${r.bucket}</td></tr>`).join('')
        printSection('Invoice Aging',`<h1>Invoice Aging Report</h1><p class="sub">As of today</p><table><tr><th>Invoice</th><th>Client</th><th>Due Date</th><th>Days Overdue</th><th>Balance</th><th>Bucket</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(r=>({ invoice_no:r.invoice_number, client:r._client?.name, due_date:r.due_date, days_overdue:r.days, balance:r.balance_due, bucket:r.bucket, status:r.status })),
        [{key:'invoice_no',label:'Invoice No.'},{key:'client',label:'Client'},{key:'due_date',label:'Due Date'},{key:'days_overdue',label:'Days Overdue'},{key:'balance',label:'Balance'},{key:'bucket',label:'Bucket'},{key:'status',label:'Status'}],'invoice_aging')} />
    </div>
  )
}

// ─── Expense Report ───────────────────────────────────────────────────────────

function ExpenseReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_expense', companyId, from, to],
    queryFn: async () => {
      const { data: exps } = await supabase.from('expenses').select('id,expense_date,category,vendor_name,description,amount,status,payment_method').eq('company_id', companyId).gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending:false })
      return exps||[]
    },
    enabled: !!companyId,
  })
  const totAmt = data.reduce((s,e)=>s+(Number(e.amount)||0),0)
  const byCat  = useMemo(() => {
    const m={}; data.forEach(e=>{ const c=e.category||'Other'; m[c]=(m[c]||0)+(Number(e.amount)||0) })
    return Object.entries(m).sort((a,b)=>b[1]-a[1])
  }, [data])
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No expenses for this period" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard label="Total Expenses" value={fmt(totAmt)} accent="text-red-400" />
        <StatCard label="Categories" value={byCat.length} />
        <StatCard label="Transactions" value={data.length} />
      </div>
      {byCat.length>0 && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 mb-5">
          <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-3">Spend by Category</p>
          <BarChart data={byCat.map(([cat,amt])=>({ l:cat.slice(0,8), v:amt, tip:fmt(amt) }))} color="#ef4444" />
        </div>
      )}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Date','Category','Vendor','Description','Amount','Status']} />
          <tbody>
            {data.map(e => (
              <tr key={e.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3 text-xs text-slate-300">{fmtDate(e.expense_date)}</td>
                <td className="py-2.5 px-3 text-xs text-slate-400 capitalize">{e.category||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200">{e.vendor_name||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-slate-500 max-w-xs truncate">{e.description||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-bold font-mono">{fmt(e.amount)}</td>
                <td className="py-2.5 px-3 text-[10px] text-slate-400 capitalize">{e.status||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(e=>`<tr><td>${fmtDate(e.expense_date)}</td><td>${e.category||'—'}</td><td>${e.vendor_name||'—'}</td><td>${e.description||'—'}</td><td>${fmt(e.amount)}</td><td>${e.status||'—'}</td></tr>`).join('')
        printSection('Expense Breakdown',`<h1>Expense Breakdown</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><div><span class="stat"><span class="stat-v">${fmt(totAmt)}</span><br/><span class="stat-l">Total Expenses</span></span></div><table><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th>Amount</th><th>Status</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(e=>({ date:e.expense_date, category:e.category, vendor:e.vendor_name, description:e.description, amount:e.amount, payment_method:e.payment_method, status:e.status })),
        [{key:'date',label:'Date'},{key:'category',label:'Category'},{key:'vendor',label:'Vendor'},{key:'description',label:'Description'},{key:'amount',label:'Amount'},{key:'payment_method',label:'Payment Method'},{key:'status',label:'Status'}],'expense_report')} />
    </div>
  )
}

// ─── Project Summary ──────────────────────────────────────────────────────────

function ProjectPLReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_project_pl', companyId, from, to],
    queryFn: async () => {
      const { data: projects } = await supabase.from('projects').select('id,project_name,project_code,status,client_id,start_date,end_date').eq('company_id', companyId)
      if (!projects?.length) return []
      const pIds = projects.map(p=>p.id)
      const { data: clients } = await supabase.from('clients').select('id,name').eq('company_id', companyId)
      const clientMap = Object.fromEntries((clients||[]).map(c=>[c.id,c]))
      const { data: shifts } = await supabase.from('shifts').select('project_id,working_hours,equipment_id').eq('company_id', companyId).gte('shift_date', from).lte('shift_date', to).in('project_id', pIds)
      const { data: invoices } = await supabase.from('client_invoices').select('id,total_amount,paid_amount,balance_due,project_id').eq('company_id', companyId).in('project_id', pIds)
      const { data: maint } = await supabase.from('maintenance_records').select('project_id,total_cost').eq('company_id', companyId).gte('service_date', from).lte('service_date', to).in('project_id', pIds)
      return projects.map(p => {
        const pShifts = (shifts||[]).filter(s=>s.project_id===p.id)
        const pInvs   = (invoices||[]).filter(i=>i.project_id===p.id)
        const pMaint  = (maint||[]).filter(m=>m.project_id===p.id)
        const hrs     = pShifts.reduce((s,sh)=>s+(Number(sh.working_hours)||0),0)
        const revenue = pInvs.reduce((s,i)=>s+(Number(i.total_amount)||0),0)
        const collected=pInvs.reduce((s,i)=>s+(Number(i.paid_amount)||0),0)
        const equipSet = new Set(pShifts.map(s=>s.equipment_id).filter(Boolean))
        return { ...p, _client:clientMap[p.client_id], hrs, revenue, collected, equipCount:equipSet.size, invoiceCount:pInvs.length }
      }).filter(p=>p.hrs>0||p.revenue>0).sort((a,b)=>b.revenue-a.revenue)
    },
    enabled: !!companyId,
  })
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No project activity in this period" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Active Projects" value={data.length} />
        <StatCard label="Total Revenue" value={fmt(data.reduce((s,p)=>s+p.revenue,0))} />
        <StatCard label="Collected" value={fmt(data.reduce((s,p)=>s+p.collected,0))} accent="text-green-400" />
        <StatCard label="Total Shift Hours" value={`${fmtN(data.reduce((s,p)=>s+p.hrs,0))} hrs`} />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Project','Client','Equipment','Shift Hours','Revenue','Collected','Status']} />
          <tbody>
            {data.map(p => (
              <tr key={p.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3"><p className="text-xs text-slate-200 font-medium">{p.project_name}</p><p className="text-[10px] text-slate-500">{p.project_code}</p></td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{p._client?.name||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-slate-300 font-mono">{p.equipCount}</td>
                <td className="py-2.5 px-3 text-xs text-primary-400 font-mono">{fmtN(p.hrs)} hrs</td>
                <td className="py-2.5 px-3 text-xs text-slate-200 font-mono">{fmt(p.revenue)}</td>
                <td className="py-2.5 px-3 text-xs text-green-400 font-mono">{fmt(p.collected)}</td>
                <td className="py-2.5 px-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.status==='active'?'bg-green-900/40 text-green-400':p.status==='completed'?'bg-blue-900/40 text-blue-400':'bg-dark-600 text-slate-400'}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(p=>`<tr><td>${p.project_name}</td><td>${p._client?.name||'—'}</td><td>${p.equipCount}</td><td>${fmtN(p.hrs)} hrs</td><td>${fmt(p.revenue)}</td><td>${fmt(p.collected)}</td><td>${p.status}</td></tr>`).join('')
        printSection('Project Summary',`<h1>Project Summary</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><table><tr><th>Project</th><th>Client</th><th>Equipment</th><th>Shift Hrs</th><th>Revenue</th><th>Collected</th><th>Status</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(p=>({ project:p.project_name, code:p.project_code, client:p._client?.name, status:p.status, equip_count:p.equipCount, shift_hrs:fmtN(p.hrs), revenue:p.revenue, collected:p.collected })),
        [{key:'project',label:'Project'},{key:'code',label:'Code'},{key:'client',label:'Client'},{key:'status',label:'Status'},{key:'equip_count',label:'Equipment'},{key:'shift_hrs',label:'Shift Hrs'},{key:'revenue',label:'Revenue'},{key:'collected',label:'Collected'}],'project_summary')} />
    </div>
  )
}

// ─── Client Statement ─────────────────────────────────────────────────────────

function ClientStatementReport({ companyId, from, to }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_client_statement', companyId, from, to],
    queryFn: async () => {
      const { data: clients } = await supabase.from('clients').select('id,name,phone,email,gstin').eq('company_id', companyId).eq('is_active', true)
      if (!clients?.length) return []
      const { data: invoices } = await supabase.from('client_invoices').select('client_id,total_amount,paid_amount,balance_due,status').eq('company_id', companyId).gte('invoice_date', from).lte('invoice_date', to)
      const invMap = {}
      for (const i of invoices||[]) {
        if (!invMap[i.client_id]) invMap[i.client_id]={ invoiced:0, paid:0, outstanding:0, count:0 }
        invMap[i.client_id].invoiced    += Number(i.total_amount)||0
        invMap[i.client_id].paid        += Number(i.paid_amount)||0
        invMap[i.client_id].outstanding += Number(i.balance_due)||0
        invMap[i.client_id].count++
      }
      return clients.map(c=>({ ...c, ...(invMap[c.id]||{ invoiced:0, paid:0, outstanding:0, count:0 }) })).filter(c=>c.invoiced>0).sort((a,b)=>b.invoiced-a.invoiced)
    },
    enabled: !!companyId,
  })
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No client invoices for this period" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard label="Active Clients" value={data.length} />
        <StatCard label="Total Billed" value={fmt(data.reduce((s,c)=>s+c.invoiced,0))} />
        <StatCard label="Total Outstanding" value={fmt(data.reduce((s,c)=>s+c.outstanding,0))} accent="text-red-400" />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Client','Contact','Invoices','Total Billed','Paid','Outstanding']} />
          <tbody>
            {data.map(c => (
              <tr key={c.id} className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors">
                <td className="py-2.5 px-3"><p className="text-xs text-slate-200 font-medium">{c.name}</p>{c.gstin&&<p className="text-[10px] text-slate-500 font-mono">{c.gstin}</p>}</td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{c.phone||c.email||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-slate-400 font-mono">{c.count}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200 font-mono">{fmt(c.invoiced)}</td>
                <td className="py-2.5 px-3 text-xs text-green-400 font-mono">{fmt(c.paid)}</td>
                <td className="py-2.5 px-3 text-xs text-red-400 font-bold font-mono">{fmt(c.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(c=>`<tr><td>${c.name}</td><td>${c.phone||c.email||'—'}</td><td>${c.count}</td><td>${fmt(c.invoiced)}</td><td>${fmt(c.paid)}</td><td>${fmt(c.outstanding)}</td></tr>`).join('')
        printSection('Client Statement',`<h1>Client Statement</h1><p class="sub">${fmtDate(from)} — ${fmtDate(to)}</p><table><tr><th>Client</th><th>Contact</th><th>Invoices</th><th>Billed</th><th>Paid</th><th>Outstanding</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(c=>({ client:c.name, phone:c.phone, email:c.email, gstin:c.gstin, invoices:c.count, billed:c.invoiced, paid:c.paid, outstanding:c.outstanding })),
        [{key:'client',label:'Client'},{key:'phone',label:'Phone'},{key:'email',label:'Email'},{key:'gstin',label:'GSTIN'},{key:'invoices',label:'Invoices'},{key:'billed',label:'Billed'},{key:'paid',label:'Paid'},{key:'outstanding',label:'Outstanding'}],'client_statement')} />
    </div>
  )
}

// ─── Stock Status ─────────────────────────────────────────────────────────────

function StockStatusReport({ companyId }) {
  const { data=[], isLoading } = useQuery({
    queryKey: ['rpt_stock', companyId],
    queryFn: async () => {
      const { data: stock } = await supabase.from('inventory_stock')
        .select('*, inventory_items(item_name,item_code,unit,min_stock_level,category), stores(store_name)')
        .eq('company_id', companyId)
      return (stock||[]).map(s => ({
        id:s.id, item:s.inventory_items?.item_name||'—', code:s.inventory_items?.item_code, category:s.inventory_items?.category,
        unit:s.inventory_items?.unit, minLevel:s.inventory_items?.min_stock_level||0, store:s.stores?.store_name||'—',
        qty:Number(s.quantity_on_hand)||0, avgCost:Number(s.avg_unit_cost)||0,
        value:(Number(s.quantity_on_hand)||0)*(Number(s.avg_unit_cost)||0),
        isLow:(Number(s.quantity_on_hand)||0)<=(Number(s.inventory_items?.min_stock_level)||0),
      })).sort((a,b)=>b.value-a.value)
    },
    enabled: !!companyId,
  })
  const totValue = data.reduce((s,r)=>s+r.value,0)
  const lowStock = data.filter(r=>r.isLow).length
  if (isLoading) return <Spinner />
  if (!data.length) return <Empty msg="No inventory stock records found" />
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Items" value={data.length} />
        <StatCard label="Stock Value" value={fmt(totValue)} />
        <StatCard label="Low Stock Alert" value={lowStock} accent={lowStock>0?'text-red-400':'text-green-400'} sub={lowStock>0?'Need reorder':'All stocked'} />
        <StatCard label="Stores" value={new Set(data.map(d=>d.store)).size} />
      </div>
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <THead cols={['Item','Category','Store','Qty on Hand','Min Level','Avg Cost','Stock Value','Status']} />
          <tbody>
            {data.map(r => (
              <tr key={r.id} className={`border-b border-dark-700 hover:bg-dark-700/40 transition-colors ${r.isLow?'bg-red-950/10':''}`}>
                <td className="py-2.5 px-3"><p className="text-xs text-slate-200 font-medium">{r.item}</p><p className="text-[10px] text-slate-500 font-mono">{r.code}</p></td>
                <td className="py-2.5 px-3 text-xs text-slate-400 capitalize">{r.category||'—'}</td>
                <td className="py-2.5 px-3 text-xs text-slate-400">{r.store}</td>
                <td className="py-2.5 px-3 text-xs text-slate-200 font-mono">{fmtN(r.qty,2)} {r.unit}</td>
                <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{r.minLevel} {r.unit}</td>
                <td className="py-2.5 px-3 text-xs text-slate-400 font-mono">{fmt(r.avgCost)}/{r.unit}</td>
                <td className="py-2.5 px-3 text-xs text-primary-400 font-bold font-mono">{fmt(r.value)}</td>
                <td className="py-2.5 px-3">{r.isLow?<span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-900/40 text-red-400">Low Stock</span>:<span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-green-900/40 text-green-400">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExportBar onPrint={() => {
        const rows = data.map(r=>`<tr><td>${r.item}</td><td>${r.code||'—'}</td><td>${r.category||'—'}</td><td>${r.store}</td><td>${fmtN(r.qty,2)} ${r.unit}</td><td>${r.minLevel}</td><td>${fmt(r.value)}</td><td style="color:${r.isLow?'red':'green'}">${r.isLow?'Low Stock':'OK'}</td></tr>`).join('')
        printSection('Stock Status',`<h1>Stock Status Report</h1><div><span class="stat"><span class="stat-v">${fmt(totValue)}</span><br/><span class="stat-l">Stock Value</span></span><span class="stat"><span class="stat-v" style="color:${lowStock>0?'red':'green'}">${lowStock}</span><br/><span class="stat-l">Low Stock Alerts</span></span></div><table><tr><th>Item</th><th>Code</th><th>Category</th><th>Store</th><th>Qty</th><th>Min Level</th><th>Stock Value</th><th>Status</th></tr>${rows}</table>`)
      }} onCSV={() => exportCSV(data.map(r=>({ item:r.item, code:r.code, category:r.category, store:r.store, qty:r.qty, unit:r.unit, min_level:r.minLevel, avg_cost:r.avgCost, stock_value:r.value, status:r.isLow?'Low Stock':'OK' })),
        [{key:'item',label:'Item'},{key:'code',label:'Code'},{key:'category',label:'Category'},{key:'store',label:'Store'},{key:'qty',label:'Qty'},{key:'unit',label:'Unit'},{key:'min_level',label:'Min Level'},{key:'avg_cost',label:'Avg Cost'},{key:'stock_value',label:'Stock Value'},{key:'status',label:'Status'}],'stock_status')} />
    </div>
  )
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function ReportContent({ reportId, companyId, from, to }) {
  const p = { companyId, from, to }
  switch (reportId) {
    case 'equip_utilization': return <EquipUtilizationReport {...p} />
    case 'equip_pl':          return <EquipPLReport          {...p} />
    case 'shift_log':         return <ShiftLogReport         {...p} />
    case 'fuel_report':       return <FuelReport             {...p} />
    case 'incident_report':   return <IncidentReport         {...p} />
    case 'attendance':        return <AttendanceReport       {...p} />
    case 'payroll':           return <PayrollReport          companyId={companyId} />
    case 'maintenance_cost':  return <MaintenanceCostReport  {...p} />
    case 'revenue':           return <RevenueReport          {...p} />
    case 'invoice_aging':     return <InvoiceAgingReport     companyId={companyId} />
    case 'expense_report':    return <ExpenseReport          {...p} />
    case 'project_pl':        return <ProjectPLReport        {...p} />
    case 'client_statement':  return <ClientStatementReport  {...p} />
    case 'stock_status':      return <StockStatusReport      companyId={companyId} />
    default:                  return <Empty msg="Select a report from the sidebar" />
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { companyId } = useAuth()
  const [activeReport, setActiveReport] = useState('equip_utilization')
  const [from, setFrom] = useState(monthStart())
  const [to,   setTo]   = useState(todayStr())

  const current = REPORTS.find(r=>r.id===activeReport)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-dark-900 border-r border-dark-700 flex flex-col overflow-y-auto">
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
                  <button key={r.id} onClick={()=>setActiveReport(r.id)}
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
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-dark-700">
          <h1 className="text-base font-semibold text-slate-100">{current?.label||'Report'}</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">{current?.desc}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-8">
          {!['payroll','invoice_aging','stock_status'].includes(activeReport) && (
            <FilterBar from={from} setFrom={setFrom} to={to} setTo={setTo} />
          )}
          <ReportContent reportId={activeReport} companyId={companyId} from={from} to={to} />
        </div>
      </main>
    </div>
  )
}
