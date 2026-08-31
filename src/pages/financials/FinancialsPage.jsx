import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  TrendingUp, TrendingDown, FileText, Download,
  ChevronDown, ChevronRight, BarChart3, Scale,
  ArrowDownCircle, ArrowUpCircle, RefreshCw, Calendar,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const fmtSigned = (n) => (n < 0 ? `(${fmt(n)})` : fmt(n))
const today = () => new Date().toISOString().slice(0, 10)

function fyRange(year) {
  // Indian FY: Apr 1 – Mar 31
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` }
}
function currentFY() {
  const m = new Date().getMonth() // 0=Jan
  const y = new Date().getFullYear()
  return m >= 3 ? y : y - 1 // Apr onwards → new FY
}
function quarterRange(year, q) {
  const starts = [`${year}-04-01`, `${year}-07-01`, `${year}-10-01`, `${year + 1}-01-01`]
  const ends   = [`${year}-06-30`, `${year}-09-30`, `${year}-12-31`, `${year + 1}-03-31`]
  return { from: starts[q - 1], to: ends[q - 1] }
}
function monthRange(y, m) {
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const end = new Date(y, m, 0)
  const to = `${y}-${String(m).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  return { from, to }
}

const CAT_LABEL = {
  fuel: 'Fuel & HSD', repairs_maintenance: 'Repairs & Maintenance',
  maintenance: 'Repairs & Maintenance', spares_purchase: 'Spares & Parts',
  food: 'Food & Catering', travel: 'Travel', accommodation: 'Accommodation',
  site_allowance: 'Site Allowance', medical: 'Medical',
  salary: 'Salary & Wages', payroll: 'Salary & Wages',
  emi: 'EMI Payments', interest: 'Interest & Finance',
  rent: 'Rent', insurance: 'Insurance',
  admin: 'Admin & Office', misc: 'Miscellaneous', other: 'Miscellaneous',
}

const SECTIONS = {
  direct:  { label: 'Cost of Operations', color: 'text-orange-400' },
  field:   { label: 'Field Expenses',     color: 'text-amber-400'  },
  payroll: { label: 'Payroll',            color: 'text-purple-400' },
  admin:   { label: 'Admin Expenses',     color: 'text-blue-400'   },
  finance: { label: 'Finance Costs',      color: 'text-red-400'    },
}

function categorizeTxn(txn) {
  if (txn.type === 'income') {
    return { side: 'income', section: 'revenue',
      cat: txn.reference_type === 'invoice' ? 'Invoice Collections' : 'Other Income' }
  }
  const raw = txn.expense_category || txn.reference_type || 'misc'
  if (['fuel'].includes(raw))
    return { side: 'expense', section: 'direct', cat: 'Fuel & HSD' }
  if (['repairs_maintenance', 'maintenance'].includes(raw))
    return { side: 'expense', section: 'direct', cat: 'Repairs & Maintenance' }
  if (['spares_purchase'].includes(raw))
    return { side: 'expense', section: 'direct', cat: 'Spares & Parts' }
  if (['food', 'travel', 'accommodation', 'site_allowance', 'medical'].includes(raw))
    return { side: 'expense', section: 'field', cat: CAT_LABEL[raw] || raw }
  if (['salary', 'payroll'].includes(raw))
    return { side: 'expense', section: 'payroll', cat: 'Salary & Wages' }
  if (['emi'].includes(raw))
    return { side: 'expense', section: 'finance', cat: 'EMI Payments' }
  if (['interest'].includes(raw))
    return { side: 'expense', section: 'finance', cat: 'Interest & Finance' }
  if (['rent'].includes(raw))
    return { side: 'expense', section: 'admin', cat: 'Rent' }
  if (['insurance'].includes(raw))
    return { side: 'expense', section: 'admin', cat: 'Insurance' }
  if (['admin'].includes(raw))
    return { side: 'expense', section: 'admin', cat: 'Admin & Office' }
  return { side: 'expense', section: 'admin', cat: 'Miscellaneous' }
}

// ── Period Picker ─────────────────────────────────────────────────────────────
const now = new Date()
const CUR_FY = currentFY()

const PERIODS = [
  { label: 'This Month',    ...monthRange(now.getFullYear(), now.getMonth() + 1) },
  { label: 'Last Month',    ...monthRange(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), now.getMonth() === 0 ? 12 : now.getMonth()) },
  { label: 'Q1 (Apr–Jun)', ...quarterRange(CUR_FY, 1) },
  { label: 'Q2 (Jul–Sep)', ...quarterRange(CUR_FY, 2) },
  { label: 'Q3 (Oct–Dec)', ...quarterRange(CUR_FY, 3) },
  { label: 'Q4 (Jan–Mar)', ...quarterRange(CUR_FY, 4) },
  { label: `FY ${CUR_FY}–${String(CUR_FY + 1).slice(2)}`,      ...fyRange(CUR_FY) },
  { label: `FY ${CUR_FY - 1}–${String(CUR_FY).slice(2)}`,  ...fyRange(CUR_FY - 1) },
  { label: 'Custom', from: '', to: '' },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function FinancialsPage() {
  const { companyId, company } = useAuth()

  const [periodIdx, setPeriodIdx] = useState(0)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [tab, setTab] = useState('pl')
  const [expanded, setExpanded] = useState({})

  const period = useMemo(() => {
    if (periodIdx === PERIODS.length - 1) return { from: customFrom, to: customTo }
    return PERIODS[periodIdx]
  }, [periodIdx, customFrom, customTo])

  const isCustom = periodIdx === PERIODS.length - 1

  // ── Queries ─────────────────────────────────────────────────────────────────
  // Period transactions
  const { data: txnRaw = [], isLoading: txnLoad } = useQuery({
    queryKey: ['fin_txns', companyId, period.from, period.to],
    queryFn: async () => {
      if (!period.from || !period.to) return []
      const { data } = await supabase.from('account_transactions')
        .select('id,txn_date,type,description,amount,reference_type,reference_id,expense_category,equipment_id,payment_mode')
        .eq('company_id', companyId)
        .gte('txn_date', period.from).lte('txn_date', period.to)
        .order('txn_date', { ascending: true })
      return data || []
    },
    enabled: !!companyId && !!period.from && !!period.to,
    staleTime: 60_000,
  })

  // Enrich expense transactions with expense_category from expenses table
  const { data: expCatMap = {} } = useQuery({
    queryKey: ['fin_exp_cats', companyId, period.from, period.to],
    queryFn: async () => {
      const ids = txnRaw.filter(t => t.reference_type === 'expense' && t.reference_id).map(t => t.reference_id)
      if (!ids.length) return {}
      const { data } = await supabase.from('expenses').select('id,expense_category').in('id', ids)
      return Object.fromEntries((data || []).map(e => [e.id, e.expense_category]))
    },
    enabled: txnRaw.length > 0,
    staleTime: 60_000,
  })

  // All-time outstanding AR
  const { data: arInvoices = [] } = useQuery({
    queryKey: ['fin_ar', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices')
        .select('id,total_amount,paid_amount,balance_due,status,client_name,invoice_number')
        .eq('company_id', companyId)
        .not('status', 'in', '("paid","cancelled")')
        .gt('balance_due', 0)
      return data || []
    },
    enabled: !!companyId, staleTime: 60_000,
  })

  // All-time outstanding AP
  const { data: apBills = [] } = useQuery({
    queryKey: ['fin_ap', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bills')
        .select('id,total_amount,paid_amount,balance_due,status,vendor_name,bill_number')
        .eq('company_id', companyId)
        .not('status', 'in', '("paid","cancelled")')
        .gt('balance_due', 0)
      return data || []
    },
    enabled: !!companyId, staleTime: 60_000,
  })

  // All-time cumulative net (for cash/bank estimate)
  const { data: allTimeTxns = [] } = useQuery({
    queryKey: ['fin_alltime', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('account_transactions')
        .select('type,amount').eq('company_id', companyId)
      return data || []
    },
    enabled: !!companyId, staleTime: 120_000,
  })

  // ── Compute enriched txns ──────────────────────────────────────────────────
  const txns = useMemo(() => txnRaw.map(t => ({
    ...t,
    expense_category: (t.reference_type === 'expense' && t.reference_id && expCatMap[t.reference_id])
      ? expCatMap[t.reference_id]
      : t.expense_category,
  })), [txnRaw, expCatMap])

  // ── P&L data ───────────────────────────────────────────────────────────────
  const pl = useMemo(() => {
    const bySection = {}
    txns.forEach(t => {
      const { side, section, cat } = categorizeTxn(t)
      if (!bySection[section]) bySection[section] = {}
      if (!bySection[section][cat]) bySection[section][cat] = 0
      bySection[section][cat] += Number(t.amount) || 0
    })

    const income   = txns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const direct   = sumSection(bySection, 'direct')
    const field    = sumSection(bySection, 'field')
    const payroll  = sumSection(bySection, 'payroll')
    const admin    = sumSection(bySection, 'admin')
    const finance  = sumSection(bySection, 'finance')
    const totalExp = direct + field + payroll + admin + finance
    const grossProfit = income - direct
    const ebit        = grossProfit - field - payroll - admin
    const netProfit   = ebit - finance

    return { bySection, income, direct, field, payroll, admin, finance, totalExp, grossProfit, ebit, netProfit }
  }, [txns])

  // ── Cash Flow ──────────────────────────────────────────────────────────────
  const cashFlow = useMemo(() => {
    const inflows  = txns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const outflows = txns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const net = inflows - outflows

    // Group inflows by payment_mode
    const byMode = {}
    txns.filter(t => t.type === 'income').forEach(t => {
      const m = t.payment_mode || 'unknown'
      byMode[m] = (byMode[m] || 0) + Number(t.amount)
    })

    // Group outflows by section
    return { inflows, outflows, net, byMode }
  }, [txns])

  // ── Balance Sheet ──────────────────────────────────────────────────────────
  const balSheet = useMemo(() => {
    const ar = arInvoices.reduce((s, i) => s + (Number(i.balance_due) || 0), 0)
    const ap = apBills.reduce((s, b) => s + (Number(b.balance_due) || 0), 0)
    const cumulativeIncome  = allTimeTxns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const cumulativeExpense = allTimeTxns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const cashBank = Math.max(0, cumulativeIncome - cumulativeExpense) // simplified
    const totalAssets = ar + cashBank
    const totalLiab   = ap
    const netPosition = totalAssets - totalLiab
    return { ar, ap, cashBank, totalAssets, totalLiab, netPosition }
  }, [arInvoices, apBills, allTimeTxns])

  // ── Trial Balance ──────────────────────────────────────────────────────────
  const trialBalance = useMemo(() => {
    const rows = {}
    txns.forEach(t => {
      const { cat } = categorizeTxn(t)
      if (!rows[cat]) rows[cat] = { debit: 0, credit: 0 }
      if (t.type === 'income') rows[cat].credit += Number(t.amount)
      else rows[cat].debit += Number(t.amount)
    })
    return Object.entries(rows).map(([cat, v]) => ({
      cat, debit: v.debit, credit: v.credit, balance: v.credit - v.debit,
    })).sort((a, b) => a.cat.localeCompare(b.cat))
  }, [txns])

  const isLoading = txnLoad

  // ── Toggle section expand ──────────────────────────────────────────────────
  const toggle = (k) => setExpanded(p => ({ ...p, [k]: !p[k] }))

  // ── PDF Export ────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const M = 14
    const periodLabel = PERIODS[periodIdx]?.label || `${period.from} to ${period.to}`
    const companyName = company?.name || 'Company'

    doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(companyName, M, 18)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    const tabLabel = { pl: 'Profit & Loss Statement', bs: 'Balance Sheet Summary', cf: 'Cash Flow Statement', tb: 'Trial Balance' }[tab]
    doc.text(`${tabLabel}  |  Period: ${periodLabel}`, M, 25)
    doc.setDrawColor(60, 80, 120); doc.line(M, 28, 196, 28)

    if (tab === 'pl') {
      const rows = buildPLRows()
      autoTable(doc, {
        startY: 32, head: [['Particulars', 'Amount (₹)']],
        body: rows.map(r => [r.label, r.val]),
        styles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
        didParseCell: ({ row, cell }) => {
          if (rows[row.index]?.bold) { cell.styles.fontStyle = 'bold' }
          if (rows[row.index]?.indent) { cell.styles.cellPadding = { left: 8, top: 2, bottom: 2, right: 2 } }
        },
        theme: 'grid',
      })
    } else if (tab === 'bs') {
      autoTable(doc, {
        startY: 32, head: [['Particulars', 'Amount (₹)']],
        body: [
          ['ASSETS', ''],
          ['  Cash & Bank (estimated)', fmt(balSheet.cashBank)],
          ['  Accounts Receivable', fmt(balSheet.ar)],
          ['Total Assets', fmt(balSheet.totalAssets)],
          ['', ''],
          ['LIABILITIES', ''],
          ['  Accounts Payable', fmt(balSheet.ap)],
          ['Total Liabilities', fmt(balSheet.totalLiab)],
          ['', ''],
          ['NET POSITION', fmtSigned(balSheet.netPosition)],
        ],
        styles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
        theme: 'grid',
      })
    } else if (tab === 'cf') {
      autoTable(doc, {
        startY: 32, head: [['Particulars', 'Amount (₹)']],
        body: [
          ['OPERATING ACTIVITIES', ''],
          ['  Cash Inflows (Collections)', fmt(cashFlow.inflows)],
          ['  Cash Outflows (Payments)', `(${fmt(cashFlow.outflows)})`],
          ['NET CASH FLOW', fmtSigned(cashFlow.net)],
        ],
        styles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
        theme: 'grid',
      })
    } else {
      autoTable(doc, {
        startY: 32, head: [['Account', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)']],
        body: [
          ...trialBalance.map(r => [r.cat, fmt(r.debit), fmt(r.credit), fmtSigned(r.balance)]),
          ['TOTALS',
            fmt(trialBalance.reduce((s, r) => s + r.debit, 0)),
            fmt(trialBalance.reduce((s, r) => s + r.credit, 0)),
            ''],
        ],
        styles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        theme: 'grid',
      })
    }

    doc.save(`${tabLabel.replace(/ /g, '_')}_${periodLabel.replace(/ /g, '_')}.pdf`)
  }

  // ── Excel Export ──────────────────────────────────────────────────────────
  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const periodLabel = PERIODS[periodIdx]?.label || `${period.from} to ${period.to}`
    const wb = XLSX.utils.book_new()

    if (tab === 'pl') {
      const rows = buildPLRows()
      const ws = XLSX.utils.aoa_to_sheet([
        ['Particulars', 'Amount (₹)'],
        ...rows.map(r => [r.label, r.rawVal]),
      ])
      XLSX.utils.book_append_sheet(wb, ws, 'P&L Statement')
    } else if (tab === 'bs') {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Particulars', 'Amount (₹)'],
        ['ASSETS', ''], ['Cash & Bank (estimated)', balSheet.cashBank], ['Accounts Receivable', balSheet.ar],
        ['Total Assets', balSheet.totalAssets], ['', ''],
        ['LIABILITIES', ''], ['Accounts Payable', balSheet.ap], ['Total Liabilities', balSheet.totalLiab],
        ['', ''], ['NET POSITION', balSheet.netPosition],
      ])
      XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet')
    } else if (tab === 'cf') {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Particulars', 'Amount (₹)'],
        ['Cash Inflows', cashFlow.inflows], ['Cash Outflows', -cashFlow.outflows], ['Net Cash Flow', cashFlow.net],
      ])
      XLSX.utils.book_append_sheet(wb, ws, 'Cash Flow')
    } else {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Account', 'Debit', 'Credit', 'Balance'],
        ...trialBalance.map(r => [r.cat, r.debit, r.credit, r.balance]),
      ])
      XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance')
    }

    XLSX.writeFile(wb, `Financial_Statement_${periodLabel.replace(/ /g, '_')}.xlsx`)
  }

  // ── Build P&L rows for PDF / render ──────────────────────────────────────
  function buildPLRows() {
    const rows = []
    const push = (label, rawVal, opts = {}) =>
      rows.push({ label, rawVal, val: opts.isNeg ? `(${fmt(rawVal)})` : fmt(rawVal), ...opts })

    push('REVENUE', null, { bold: true, val: '' })
    const revCats = pl.bySection['revenue'] || {}
    Object.entries(revCats).forEach(([cat, amt]) => push(`  ${cat}`, amt, { indent: true }))
    push('Total Revenue', pl.income, { bold: true })
    rows.push({ label: '', rawVal: 0, val: '' })

    Object.entries(SECTIONS).forEach(([sec, meta]) => {
      const cats = pl.bySection[sec]
      if (!cats) return
      push(meta.label.toUpperCase(), null, { bold: true, val: '' })
      Object.entries(cats).forEach(([cat, amt]) => push(`  ${cat}`, amt, { indent: true, isNeg: true }))
      const total = sumSection(pl.bySection, sec)
      push(`Total ${meta.label}`, total, { bold: true, isNeg: true })
      rows.push({ label: '', rawVal: 0, val: '' })

      if (sec === 'direct') push('GROSS PROFIT', pl.grossProfit, { bold: true, val: pl.grossProfit >= 0 ? fmt(pl.grossProfit) : `(${fmt(pl.grossProfit)})` })
      if (sec === 'admin')  push('OPERATING PROFIT (EBIT)', pl.ebit, { bold: true, val: pl.ebit >= 0 ? fmt(pl.ebit) : `(${fmt(pl.ebit)})` })
    })

    push('NET PROFIT / (LOSS)', pl.netProfit, { bold: true, val: pl.netProfit >= 0 ? fmt(pl.netProfit) : `(${fmt(pl.netProfit)})` })
    return rows
  }

  const TABS = [
    { key: 'pl', label: 'P&L Statement',  icon: TrendingUp },
    { key: 'bs', label: 'Balance Sheet',  icon: Scale },
    { key: 'cf', label: 'Cash Flow',      icon: ArrowDownCircle },
    { key: 'tb', label: 'Trial Balance',  icon: BarChart3 },
  ]

  return (
    <div className="min-h-full bg-dark-900 text-slate-100 px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Financial Statements</h1>
          <p className="text-sm text-slate-400 mt-0.5">{company?.name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportPDF}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:border-primary-600 hover:text-primary-300 transition-all">
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:border-emerald-600 hover:text-emerald-300 transition-all">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      {/* Period Picker */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 mb-5">
        <div className="flex items-center gap-1.5 mb-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Period</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p, i) => (
            <button key={i} onClick={() => setPeriodIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periodIdx === i
                  ? 'bg-primary-600 text-white shadow'
                  : 'bg-dark-700 text-slate-400 hover:text-slate-200 hover:bg-dark-600'
              }`}>{p.label}</button>
          ))}
        </div>
        {isCustom && (
          <div className="flex gap-3 mt-3">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 block mb-1">From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 block mb-1">To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500" />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-dark-800 border border-dark-700 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* ── P&L Statement ───────────────────────────────────────────── */}
          {tab === 'pl' && (
            <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
              <PLSection title="Revenue" total={pl.income} totalColor="text-emerald-400" defaultOpen>
                {Object.entries(pl.bySection['revenue'] || {}).map(([cat, amt]) => (
                  <PLRow key={cat} label={cat} amount={amt} color="text-emerald-300" />
                ))}
              </PLSection>

              {Object.entries(SECTIONS).map(([sec, meta]) => {
                const cats = pl.bySection[sec] || {}
                const total = Object.values(cats).reduce((s, v) => s + v, 0)
                return (
                  <React.Fragment key={sec}>
                    <PLSection title={meta.label} total={total} totalColor={meta.color} isExpense>
                      {Object.entries(cats).map(([cat, amt]) => (
                        <PLRow key={cat} label={cat} amount={amt} color={meta.color} isExpense />
                      ))}
                    </PLSection>

                    {sec === 'direct' && (
                      <SubtotalBar
                        label="Gross Profit"
                        value={pl.grossProfit}
                        note="Revenue − Direct Costs"
                      />
                    )}
                    {sec === 'admin' && (
                      <SubtotalBar
                        label="Operating Profit (EBIT)"
                        value={pl.ebit}
                        note="Gross Profit − Field − Payroll − Admin"
                      />
                    )}
                  </React.Fragment>
                )
              })}

              {/* Net Profit */}
              <div className={`px-5 py-4 flex justify-between items-center border-t-2 ${
                pl.netProfit >= 0 ? 'border-emerald-700/50 bg-emerald-900/10' : 'border-red-700/50 bg-red-900/10'
              }`}>
                <div>
                  <p className="text-sm font-bold text-slate-100">Net Profit / (Loss)</p>
                  <p className="text-[10px] text-slate-500">EBIT − Finance Costs</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold font-mono ${pl.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pl.netProfit >= 0 ? fmt(pl.netProfit) : `(${fmt(pl.netProfit)})`}
                  </p>
                  <p className={`text-[10px] font-semibold ${pl.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {pl.netProfit >= 0 ? 'Profit' : 'Loss'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Balance Sheet ────────────────────────────────────────────── */}
          {tab === 'bs' && (
            <div className="space-y-4">
              <div className="bg-amber-900/10 border border-amber-700/30 rounded-xl px-4 py-3 text-xs text-amber-400">
                ℹ️ Simplified view — Cash & Bank is estimated from cumulative ledger entries. A full asset register with opening balances is needed for a statutory balance sheet.
              </div>

              {/* Assets */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-emerald-900/20 border-b border-emerald-800/30">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Assets</p>
                </div>
                <BSRow label="Cash & Bank (estimated)" amount={balSheet.cashBank} note="Cumulative income − expenses" />
                <BSRow label="Accounts Receivable" amount={balSheet.ar} note={`${arInvoices.length} unpaid invoice${arInvoices.length !== 1 ? 's' : ''}`} />
                <BSRow label="Total Assets" amount={balSheet.totalAssets} bold />
              </div>

              {/* Liabilities */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-red-900/20 border-b border-red-800/30">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-400">Liabilities</p>
                </div>
                <BSRow label="Accounts Payable" amount={balSheet.ap} note={`${apBills.length} unpaid bill${apBills.length !== 1 ? 's' : ''}`} isLiab />
                <BSRow label="Total Liabilities" amount={balSheet.totalLiab} bold isLiab />
              </div>

              {/* Net */}
              <div className={`rounded-xl border px-5 py-4 flex justify-between items-center ${
                balSheet.netPosition >= 0 ? 'bg-emerald-900/10 border-emerald-700/40' : 'bg-red-900/10 border-red-700/40'
              }`}>
                <div>
                  <p className="text-sm font-bold text-slate-100">Net Position</p>
                  <p className="text-[10px] text-slate-500">Total Assets − Total Liabilities</p>
                </div>
                <p className={`text-xl font-bold font-mono ${balSheet.netPosition >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {balSheet.netPosition >= 0 ? fmt(balSheet.netPosition) : `(${fmt(balSheet.netPosition)})`}
                </p>
              </div>
            </div>
          )}

          {/* ── Cash Flow ────────────────────────────────────────────────── */}
          {tab === 'cf' && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Cash Inflows" amount={cashFlow.inflows} color="emerald" icon={ArrowDownCircle} />
                <SummaryCard label="Cash Outflows" amount={cashFlow.outflows} color="red" icon={ArrowUpCircle} />
                <SummaryCard label="Net Cash Flow" amount={cashFlow.net} color={cashFlow.net >= 0 ? 'emerald' : 'red'} icon={cashFlow.net >= 0 ? TrendingUp : TrendingDown} signed />
              </div>

              {/* Inflows breakdown */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-emerald-900/20 border-b border-emerald-800/30">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Operating Inflows — by Payment Mode</p>
                </div>
                {Object.entries(cashFlow.byMode).length === 0
                  ? <p className="text-xs text-slate-500 text-center py-6">No inflows in this period</p>
                  : Object.entries(cashFlow.byMode).map(([mode, amt]) => (
                    <div key={mode} className="flex justify-between items-center px-5 py-3 border-b border-dark-700/50 last:border-0">
                      <span className="text-sm text-slate-300 capitalize">{mode}</span>
                      <span className="font-mono text-sm font-semibold text-emerald-400">{fmt(amt)}</span>
                    </div>
                  ))
                }
              </div>

              {/* Outflows breakdown by section */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-red-900/20 border-b border-red-800/30">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-400">Operating Outflows — by Category</p>
                </div>
                {Object.entries(SECTIONS).map(([sec, meta]) => {
                  const total = sumSection(pl.bySection, sec)
                  if (!total) return null
                  return (
                    <div key={sec} className="flex justify-between items-center px-5 py-3 border-b border-dark-700/50 last:border-0">
                      <span className="text-sm text-slate-300">{meta.label}</span>
                      <span className={`font-mono text-sm font-semibold ${meta.color}`}>{fmt(total)}</span>
                    </div>
                  )
                })}
                <div className="flex justify-between items-center px-5 py-3 bg-dark-700/30 border-t border-dark-600">
                  <span className="text-sm font-bold text-slate-200">Total Outflows</span>
                  <span className="font-mono text-sm font-bold text-red-400">{fmt(cashFlow.outflows)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Trial Balance ─────────────────────────────────────────────── */}
          {tab === 'tb' && (
            <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-dark-700 grid grid-cols-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Account</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
                <span className="text-right">Balance</span>
              </div>
              {trialBalance.length === 0
                ? <p className="text-xs text-slate-500 text-center py-8">No transactions in this period</p>
                : trialBalance.map(r => (
                  <div key={r.cat} className="px-5 py-2.5 border-b border-dark-700/50 last:border-0 grid grid-cols-4 text-sm hover:bg-dark-700/30">
                    <span className="text-slate-300">{r.cat}</span>
                    <span className="text-right font-mono text-orange-400">{r.debit > 0 ? fmt(r.debit) : '—'}</span>
                    <span className="text-right font-mono text-emerald-400">{r.credit > 0 ? fmt(r.credit) : '—'}</span>
                    <span className={`text-right font-mono font-semibold ${r.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.balance >= 0 ? fmt(r.balance) : `(${fmt(r.balance)})`}
                    </span>
                  </div>
                ))
              }
              {/* Totals */}
              <div className="px-5 py-3 bg-dark-700/40 border-t border-dark-600 grid grid-cols-4 text-sm font-bold">
                <span className="text-slate-200">TOTAL</span>
                <span className="text-right font-mono text-orange-300">{fmt(trialBalance.reduce((s, r) => s + r.debit, 0))}</span>
                <span className="text-right font-mono text-emerald-300">{fmt(trialBalance.reduce((s, r) => s + r.credit, 0))}</span>
                <span className="text-right text-slate-400">—</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PLSection({ title, total, totalColor, isExpense, children, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true)
  const hasChildren = React.Children.count(children) > 0
  return (
    <div className="border-b border-dark-700/60">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-dark-700/30 transition-colors"
        onClick={() => setOpen(p => !p)}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</span>
        </div>
        <span className={`font-mono text-sm font-bold ${totalColor}`}>
          {isExpense ? `(${fmt(total)})` : fmt(total)}
        </span>
      </button>
      {open && hasChildren && (
        <div className="pb-1">
          {children}
        </div>
      )}
    </div>
  )
}

function PLRow({ label, amount, color, isExpense }) {
  return (
    <div className="flex justify-between items-center px-8 py-1.5">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`font-mono text-sm ${color}`}>
        {isExpense ? `(${fmt(amount)})` : fmt(amount)}
      </span>
    </div>
  )
}

function SubtotalBar({ label, value, note }) {
  return (
    <div className={`px-5 py-3 flex justify-between items-center border-y ${
      value >= 0 ? 'border-emerald-800/30 bg-emerald-900/10' : 'border-red-800/30 bg-red-900/10'
    }`}>
      <div>
        <p className="text-sm font-bold text-slate-100">{label}</p>
        {note && <p className="text-[10px] text-slate-500">{note}</p>}
      </div>
      <span className={`font-mono text-base font-bold ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {value >= 0 ? fmt(value) : `(${fmt(value)})`}
      </span>
    </div>
  )
}

function BSRow({ label, amount, note, bold, isLiab }) {
  return (
    <div className={`flex justify-between items-center px-5 py-3 border-b border-dark-700/50 last:border-0 ${bold ? 'bg-dark-700/30' : ''}`}>
      <div>
        <p className={`text-sm ${bold ? 'font-bold text-slate-100' : 'text-slate-300'}`}>{label}</p>
        {note && <p className="text-[10px] text-slate-500">{note}</p>}
      </div>
      <span className={`font-mono text-sm ${bold ? 'font-bold' : 'font-semibold'} ${isLiab ? 'text-red-400' : 'text-emerald-400'}`}>
        {fmt(amount)}
      </span>
    </div>
  )
}

function SummaryCard({ label, amount, color, icon: Icon, signed }) {
  const colors = {
    emerald: { bg: 'bg-emerald-900/20', border: 'border-emerald-700/30', text: 'text-emerald-400', icon: 'text-emerald-500' },
    red: { bg: 'bg-red-900/20', border: 'border-red-700/30', text: 'text-red-400', icon: 'text-red-500' },
  }
  const c = colors[color] || colors.emerald
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl px-4 py-4`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${c.icon}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <p className={`text-lg font-bold font-mono ${c.text}`}>
        {signed && amount < 0 ? `(${fmt(amount)})` : fmt(amount)}
      </p>
    </div>
  )
}

// ── Utility ───────────────────────────────────────────────────────────────────
function sumSection(bySection, sec) {
  return Object.values(bySection[sec] || {}).reduce((s, v) => s + v, 0)
}
