/**
 * FinancialsPage.jsx — Tally-format Financial Statements
 * P&L: Two-column Dr/Cr horizontal
 * Balance Sheet: Two-column Liabilities+Capital | Assets
 * Cash Flow: Vertical (Operating / Investing / Financing)
 * Trial Balance: Grouped Dr/Cr with account-type sections
 */
import React, { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  TrendingUp, FileText, Download, BarChart3, Scale,
  ArrowDownCircle, RefreshCw, Calendar, Edit2, Check, X, Info,
  ChevronDown, ChevronRight,
} from 'lucide-react'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n) => `₹${Math.abs(Number(n)||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`
const fmtS = (n) => Number(n) < 0 ? `(${fmt(n)})` : fmt(n)
const DR   = (n) => n > 0 ? `${fmt(n)} Dr` : '—'
const CR   = (n) => n > 0 ? `${fmt(n)} Cr` : '—'

// ── FY / Period helpers ───────────────────────────────────────────────────────
function currentFY() {
  const m = new Date().getMonth(), y = new Date().getFullYear()
  return m >= 3 ? y : y - 1
}
function fyRange(y)     { return { from:`${y}-04-01`,   to:`${y+1}-03-31` } }
function qRange(y, q)   {
  const s=['04-01','07-01','10-01','01-01'], e=['06-30','09-30','12-31','03-31']
  const yr = q === 4 ? y+1 : y
  const sy  = q === 4 ? y   : y
  return { from:`${sy}-${s[q-1]}`, to:`${yr}-${e[q-1]}` }
}
function mRange(y, m)   {
  const from=`${y}-${String(m).padStart(2,'0')}-01`
  const to=`${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`
  return { from, to }
}

const now    = new Date()
const CUR_FY = currentFY()

const PERIODS = [
  { label:'This Month',     ...mRange(now.getFullYear(), now.getMonth()+1) },
  { label:'Last Month',     ...mRange(now.getMonth()===0?now.getFullYear()-1:now.getFullYear(), now.getMonth()===0?12:now.getMonth()) },
  { label:'Q1 (Apr–Jun)',   ...qRange(CUR_FY,1) },
  { label:'Q2 (Jul–Sep)',   ...qRange(CUR_FY,2) },
  { label:'Q3 (Oct–Dec)',   ...qRange(CUR_FY,3) },
  { label:'Q4 (Jan–Mar)',   ...qRange(CUR_FY,4) },
  { label:`FY ${CUR_FY}–${String(CUR_FY+1).slice(2)}`, ...fyRange(CUR_FY) },
  { label:`FY ${CUR_FY-1}–${String(CUR_FY).slice(2)}`, ...fyRange(CUR_FY-1) },
  { label:'Custom', from:'', to:'' },
]

// ── Expense categorisation ────────────────────────────────────────────────────
const CAT_META = {
  fuel:                { section:'direct',  label:'Fuel & HSD' },
  repairs_maintenance: { section:'direct',  label:'Repairs & Maintenance' },
  maintenance:         { section:'direct',  label:'Repairs & Maintenance' },
  spares_purchase:     { section:'direct',  label:'Spares & Parts' },
  food:                { section:'field',   label:'Food & Catering' },
  travel:              { section:'field',   label:'Travel' },
  accommodation:       { section:'field',   label:'Accommodation' },
  site_allowance:      { section:'field',   label:'Site Allowance' },
  medical:             { section:'field',   label:'Medical' },
  salary:              { section:'payroll', label:'Salary & Wages' },
  payroll:             { section:'payroll', label:'Salary & Wages' },
  rent:                { section:'admin',   label:'Rent' },
  insurance:           { section:'admin',   label:'Insurance' },
  admin:               { section:'admin',   label:'Admin & Office' },
  emi:                 { section:'finance', label:'EMI Payments' },
  interest:            { section:'finance', label:'Interest & Finance' },
}

const SECTIONS = [
  { key:'direct',  label:'Cost of Operations',  tallyLabel:'To Cost of Operations' },
  { key:'field',   label:'Field Expenses',       tallyLabel:'To Field Expenses' },
  { key:'payroll', label:'Payroll',              tallyLabel:'To Payroll' },
  { key:'admin',   label:'Admin Expenses',       tallyLabel:'To Admin Expenses' },
  { key:'finance', label:'Finance Costs',        tallyLabel:'To Finance Costs' },
]

function categorizeTxn(txn) {
  if (txn.type === 'income') {
    return { section:'revenue', cat: txn.reference_type==='invoice' ? 'Invoice Collections' : 'Other Income' }
  }
  const raw = txn.expense_category || txn.reference_type || 'misc'
  const m = CAT_META[raw]
  return m ? { section:m.section, cat:m.label } : { section:'admin', cat:'Miscellaneous' }
}

function sumSec(by, sec) { return Object.values(by[sec]||{}).reduce((s,v)=>s+v,0) }

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FinancialsPage() {
  const { companyId, company } = useAuth()

  const [pidx, setPidx]       = useState(6) // default: current FY
  const [cf, setCF]           = useState('')
  const [ct, setCT]           = useState('')
  const [tab, setTab]         = useState('pl')
  const [shareCapital, setSC] = useState(() => {
    try { return parseFloat(localStorage.getItem(`nhance_sc_${companyId}`)||'0') } catch { return 0 }
  })
  const [editSC, setEditSC]   = useState(false)
  const [scInput, setSCInput] = useState('')

  useEffect(() => {
    try { localStorage.setItem(`nhance_sc_${companyId}`, String(shareCapital)) } catch {}
  }, [shareCapital, companyId])

  const period = useMemo(() => {
    if (pidx === PERIODS.length-1) return { from:cf, to:ct }
    return PERIODS[pidx]
  }, [pidx, cf, ct])
  const isCustom = pidx === PERIODS.length-1

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data:txnRaw=[], isLoading:txnLoad } = useQuery({
    queryKey:['fin_txns', companyId, period.from, period.to],
    queryFn: async () => {
      if (!period.from||!period.to) return []
      const { data } = await supabase.from('account_transactions')
        .select('id,txn_date,type,amount,reference_type,reference_id,expense_category,payment_mode,description')
        .eq('company_id', companyId).gte('txn_date',period.from).lte('txn_date',period.to)
        .order('txn_date',{ascending:true})
      return data||[]
    },
    enabled:!!companyId&&!!period.from&&!!period.to, staleTime:60_000,
  })

  const { data:expCatMap={} } = useQuery({
    queryKey:['fin_exp_cats', companyId, period.from, period.to],
    queryFn: async () => {
      const ids = txnRaw.filter(t=>t.reference_type==='expense'&&t.reference_id).map(t=>t.reference_id)
      if (!ids.length) return {}
      const { data } = await supabase.from('expenses').select('id,expense_category').in('id',ids)
      return Object.fromEntries((data||[]).map(e=>[e.id,e.expense_category]))
    },
    enabled: txnRaw.length>0, staleTime:60_000,
  })

  const { data:preTxns=[] } = useQuery({
    queryKey:['fin_pre', companyId, period.from],
    queryFn: async () => {
      if (!period.from) return []
      const { data } = await supabase.from('account_transactions')
        .select('type,amount').eq('company_id',companyId).lt('txn_date',period.from)
      return data||[]
    },
    enabled:!!companyId&&!!period.from, staleTime:120_000,
  })

  const { data:allTimeTxns=[] } = useQuery({
    queryKey:['fin_alltime', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('account_transactions')
        .select('type,amount').eq('company_id',companyId)
      return data||[]
    },
    enabled:!!companyId, staleTime:120_000,
  })

  const { data:arInvoices=[] } = useQuery({
    queryKey:['fin_ar', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('client_invoices')
        .select('id,balance_due,client_name').eq('company_id',companyId)
        .not('status','in','("paid","cancelled")').gt('balance_due',0)
      return data||[]
    },
    enabled:!!companyId, staleTime:60_000,
  })

  const { data:apBills=[] } = useQuery({
    queryKey:['fin_ap', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bills')
        .select('id,balance_due,vendor_name').eq('company_id',companyId)
        .not('status','in','("paid","cancelled")').gt('balance_due',0)
      return data||[]
    },
    enabled:!!companyId, staleTime:60_000,
  })

  const { data:equipment=[] } = useQuery({
    queryKey:['fin_equipment', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment')
        .select('id,name,purchase_cost,current_value,status,purchase_date')
        .eq('company_id',companyId).neq('status','disposed')
      return data||[]
    },
    enabled:!!companyId, staleTime:120_000,
  })

  const { data:periodEquipment=[] } = useQuery({
    queryKey:['fin_equip_period', companyId, period.from, period.to],
    queryFn: async () => {
      if (!period.from||!period.to) return []
      const { data } = await supabase.from('equipment')
        .select('id,name,purchase_cost,purchase_date').eq('company_id',companyId)
        .gte('purchase_date',period.from).lte('purchase_date',period.to)
        .not('purchase_cost','is',null)
      return data||[]
    },
    enabled:!!companyId&&!!period.from&&!!period.to, staleTime:120_000,
  })

  // ── Enriched txns ─────────────────────────────────────────────────────────
  const txns = useMemo(()=>txnRaw.map(t=>({
    ...t,
    expense_category:(t.reference_type==='expense'&&t.reference_id&&expCatMap[t.reference_id])
      ? expCatMap[t.reference_id] : t.expense_category,
  })),[txnRaw,expCatMap])

  // ── P&L ───────────────────────────────────────────────────────────────────
  const pl = useMemo(()=>{
    const by = {}
    txns.forEach(t=>{
      const {section,cat} = categorizeTxn(t)
      if (!by[section]) by[section]={}
      by[section][cat]=(by[section][cat]||0)+Number(t.amount)
    })
    const income  = txns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0)
    const direct  = sumSec(by,'direct')
    const field   = sumSec(by,'field')
    const payroll = sumSec(by,'payroll')
    const admin   = sumSec(by,'admin')
    const finance = sumSec(by,'finance')
    const totalExp = direct+field+payroll+admin+finance
    const grossProfit = income-direct
    const ebit = grossProfit-field-payroll-admin
    const netProfit = ebit-finance
    return { by, income, direct, field, payroll, admin, finance, totalExp, grossProfit, ebit, netProfit }
  },[txns])

  // ── Balance Sheet ─────────────────────────────────────────────────────────
  const bs = useMemo(()=>{
    const ar = arInvoices.reduce((s,i)=>s+Number(i.balance_due||0),0)
    const ap = apBills.reduce((s,b)=>s+Number(b.balance_due||0),0)
    const allInc = allTimeTxns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0)
    const allExp = allTimeTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0)
    const retainedEarnings = allInc - allExp
    const cashBank   = Math.max(0, retainedEarnings - ar + ap)
    const fixedAssets = equipment.reduce((s,e)=>s+Number(e.current_value||e.purchase_cost||0),0)
    const totalCurrentAssets = ar + cashBank
    const totalAssets = fixedAssets + totalCurrentAssets
    const totalLiab   = ap
    const totalEquity = shareCapital + retainedEarnings
    return { ar, ap, cashBank, fixedAssets, totalCurrentAssets, totalAssets, totalLiab, retainedEarnings, totalEquity }
  },[arInvoices,apBills,allTimeTxns,equipment,shareCapital])

  // ── Cash Flow ─────────────────────────────────────────────────────────────
  const cf2 = useMemo(()=>{
    const operIn  = txns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0)
    const finOut  = txns.filter(t=>['emi','interest'].includes(t.expense_category||t.reference_type||'')).reduce((s,t)=>s+Number(t.amount),0)
    const totalOut= txns.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0)
    const operOut = totalOut - finOut
    const invOut  = periodEquipment.reduce((s,e)=>s+Number(e.purchase_cost||0),0)
    const netOper = operIn - operOut
    const netFin  = -finOut
    const netInv  = -invOut
    const netCash = netOper + netFin + netInv
    const preInc  = preTxns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0)
    const preExp  = preTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0)
    const opening = Math.max(0, preInc-preExp)
    const closing = Math.max(0, opening+netCash)
    const byMode  = {}
    txns.filter(t=>t.type==='income').forEach(t=>{ const m=t.payment_mode||'Unknown'; byMode[m]=(byMode[m]||0)+Number(t.amount) })
    return { operIn, operOut, netOper, finOut, netFin, invOut, netInv, netCash, opening, closing, byMode }
  },[txns,preTxns,periodEquipment])

  // ── Trial Balance ─────────────────────────────────────────────────────────
  const tb = useMemo(()=>{
    const rows = {}
    txns.forEach(t=>{
      const {section,cat} = categorizeTxn(t)
      const key = `${section}:::${cat}`
      if (!rows[key]) rows[key]={section,cat,dr:0,cr:0}
      if (t.type==='income') rows[key].cr+=Number(t.amount)
      else rows[key].dr+=Number(t.amount)
    })
    const secOrd = {revenue:0,direct:1,field:2,payroll:3,admin:4,finance:5}
    return Object.values(rows)
      .sort((a,b)=>(secOrd[a.section]??9)-(secOrd[b.section]??9)||a.cat.localeCompare(b.cat))
      .map(r=>({...r, balance: r.cr-r.dr}))
  },[txns])

  const tbDr = tb.reduce((s,r)=>s+r.dr,0)
  const tbCr = tb.reduce((s,r)=>s+r.cr,0)

  const periodLabel = PERIODS[pidx]?.label||`${period.from} – ${period.to}`

  // ── PDF Export ────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
    const M = 14, co = company?.name||'Company'
    const hdr = (title, isFirst=false) => {
      if (!isFirst) doc.addPage()
      doc.setFontSize(12); doc.setFont('helvetica','bold')
      doc.text(co.toUpperCase(), M, 16)
      doc.setFontSize(10); doc.setFont('helvetica','normal')
      doc.text(title, M, 23)
      doc.setFontSize(8.5)
      doc.text(`For the period: ${periodLabel}`, M, 28)
      doc.setDrawColor(100,100,100); doc.line(M, 30, 196, 30)
    }

    // ── P&L (Tally horizontal) ─────────────────────────────────────────────
    hdr('PROFIT & LOSS ACCOUNT', true)
    const { drRows, crRows, grandTotal } = buildTallyPLArrays()
    const maxRows = Math.max(drRows.length, crRows.length)
    const tableBody = []
    for (let i = 0; i < maxRows; i++) {
      const dr = drRows[i] || { label:'', amount:null }
      const cr = crRows[i] || { label:'', amount:null }
      tableBody.push([
        dr.label, dr.amount != null ? fmt(dr.amount) : '',
        cr.label, cr.amount != null ? fmt(cr.amount) : '',
      ])
    }
    tableBody.push(['TOTAL', fmt(grandTotal), 'TOTAL', fmt(grandTotal)])
    autoTable(doc, {
      startY:34,
      head:[['Particulars (Dr)', 'Amount (₹)', 'Particulars (Cr)', 'Amount (₹)']],
      body: tableBody,
      styles:{ fontSize:8 },
      headStyles:{ fillColor:[35,35,35], textColor:255, fontSize:8, fontStyle:'bold' },
      columnStyles:{ 1:{halign:'right',cellWidth:32}, 3:{halign:'right',cellWidth:32} },
      didParseCell:({row,cell,column})=>{
        if (row.index===tableBody.length-1) cell.styles.fontStyle='bold'
        if (cell.raw?.toString().startsWith('To ')) cell.styles.textColor=[200,60,60]
        if (cell.raw?.toString().startsWith('By ')) cell.styles.textColor=[22,163,74]
        if (cell.raw==='NET PROFIT') { cell.styles.textColor=[22,163,74]; cell.styles.fontStyle='bold' }
        if (cell.raw==='NET LOSS')   { cell.styles.textColor=[200,60,60];  cell.styles.fontStyle='bold' }
      },
      theme:'grid',
    })

    // ── Balance Sheet (Tally horizontal) ─────────────────────────────────
    hdr('BALANCE SHEET')
    doc.setFontSize(8); doc.setFont('helvetica','normal')
    doc.text(`As at: ${period.to||periodLabel}`, M, 32.5)
    const { liabRows, assetRows, bsTotal } = buildTallyBSArrays()
    const bsMax = Math.max(liabRows.length, assetRows.length)
    const bsBody = []
    for (let i = 0; i < bsMax; i++) {
      const l = liabRows[i]  || { label:'', amount:null }
      const a = assetRows[i] || { label:'', amount:null }
      bsBody.push([l.label, l.amount!=null?fmt(l.amount):'', a.label, a.amount!=null?fmt(a.amount):''])
    }
    bsBody.push(['TOTAL', fmt(bsTotal.liab), 'TOTAL', fmt(bsTotal.assets)])
    autoTable(doc, {
      startY:35,
      head:[['Liabilities & Capital', 'Amount (₹)', 'Assets', 'Amount (₹)']],
      body: bsBody,
      styles:{ fontSize:8 },
      headStyles:{ fillColor:[35,35,35], textColor:255, fontSize:8, fontStyle:'bold' },
      columnStyles:{ 1:{halign:'right',cellWidth:32}, 3:{halign:'right',cellWidth:32} },
      didParseCell:({row,cell})=>{
        if (row.index===bsBody.length-1) cell.styles.fontStyle='bold'
        if (['Capital Account','Current Liabilities','Fixed Assets','Current Assets, Loans & Advances'].includes(cell.raw?.toString().trim()))
          cell.styles.fontStyle='bold'
      },
      theme:'grid',
    })

    // ── Cash Flow ─────────────────────────────────────────────────────────
    hdr('CASH FLOW STATEMENT')
    autoTable(doc, {
      startY:34, head:[['Particulars','Amount (₹)']],
      body:[
        ['Opening Cash & Bank Balance', fmt(cf2.opening)],['',''],
        ['A. OPERATING ACTIVITIES',''],
        ['  Collections from Customers', fmt(cf2.operIn)],
        ['  Payments — Operations', `(${fmt(cf2.operOut)})`],
        ['  Net Operating Cash Flow', fmtS(cf2.netOper)],['',''],
        ['B. INVESTING ACTIVITIES',''],
        ['  Equipment Purchased (Capital Expenditure)', cf2.invOut>0?`(${fmt(cf2.invOut)})`:'Nil'],
        ['  Net Investing Cash Flow', fmtS(cf2.netInv)],['',''],
        ['C. FINANCING ACTIVITIES',''],
        ['  EMI & Interest Paid', cf2.finOut>0?`(${fmt(cf2.finOut)})`:'Nil'],
        ['  Net Financing Cash Flow', fmtS(cf2.netFin)],['',''],
        ['NET CHANGE IN CASH (A+B+C)', fmtS(cf2.netCash)],
        ['Closing Cash & Bank Balance', fmt(cf2.closing)],
      ],
      styles:{fontSize:8.5},
      columnStyles:{1:{halign:'right',cellWidth:45}},
      didParseCell:({cell,row})=>{
        const bold=['A. OPERATING ACTIVITIES','B. INVESTING ACTIVITIES','C. FINANCING ACTIVITIES','NET CHANGE IN CASH (A+B+C)','Opening Cash & Bank Balance','Closing Cash & Bank Balance']
        if (bold.includes(cell.raw?.toString().trim())) cell.styles.fontStyle='bold'
        if (row.index===13||row.index===14) cell.styles.fontStyle='bold'
      },
      theme:'grid',
    })

    // ── Trial Balance ────────────────────────────────────────────────────
    hdr('TRIAL BALANCE')
    autoTable(doc, {
      startY:34,
      head:[['Account Head','Account Group','Debit (₹)','Credit (₹)']],
      body:[
        ...tb.map(r=>[
          r.cat,
          SECTIONS.find(s=>s.key===r.section)?.label || (r.section==='revenue'?'Revenue':'Other'),
          r.dr>0?fmt(r.dr):'—',
          r.cr>0?fmt(r.cr):'—',
        ]),
        ['TOTAL','',fmt(tbDr),fmt(tbCr)],
      ],
      styles:{fontSize:8},
      headStyles:{fillColor:[35,35,35],textColor:255,fontSize:8,fontStyle:'bold'},
      columnStyles:{2:{halign:'right'},3:{halign:'right'}},
      didParseCell:({row,cell,column})=>{
        if (row.index===tb.length) cell.styles.fontStyle='bold'
        if (column.index===2&&cell.raw&&cell.raw!=='—'&&cell.raw!=='Debit (₹)'&&row.section==='body') cell.styles.textColor=[200,60,60]
        if (column.index===3&&cell.raw&&cell.raw!=='—'&&cell.raw!=='Credit (₹)'&&row.section==='body') cell.styles.textColor=[22,163,74]
      },
      theme:'grid',
    })

    doc.save(`Financial_Statements_Tally_${periodLabel.replace(/ /g,'_')}.pdf`)
  }

  // ── Excel Export ─────────────────────────────────────────────────────────
  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const wb   = XLSX.utils.book_new()
    const co   = company?.name||'Company'

    // P&L sheet
    const { drRows, crRows, grandTotal } = buildTallyPLArrays()
    const maxPL = Math.max(drRows.length, crRows.length)
    const plData = [
      [co], ['PROFIT & LOSS ACCOUNT', '', '', ''],
      [`For the period: ${periodLabel}`, '', '', ''],
      [],
      ['Particulars (Dr)', 'Amount (₹)', 'Particulars (Cr)', 'Amount (₹)'],
    ]
    for (let i=0; i<maxPL; i++) {
      const dr=drRows[i]||{label:'',amount:null}
      const cr=crRows[i]||{label:'',amount:null}
      plData.push([dr.label, dr.amount!=null?dr.amount:'', cr.label, cr.amount!=null?cr.amount:''])
    }
    plData.push(['TOTAL', grandTotal, 'TOTAL', grandTotal])
    const plSheet = XLSX.utils.aoa_to_sheet(plData)
    plSheet['!cols']=[{wch:40},{wch:16},{wch:40},{wch:16}]
    XLSX.utils.book_append_sheet(wb, plSheet, 'P&L Account')

    // Balance Sheet sheet
    const { liabRows, assetRows, bsTotal } = buildTallyBSArrays()
    const maxBS = Math.max(liabRows.length, assetRows.length)
    const bsData = [
      [co], ['BALANCE SHEET', '', '', ''],
      [`As at: ${period.to||periodLabel}`, '', '', ''],
      [],
      ['Liabilities & Capital', 'Amount (₹)', 'Assets', 'Amount (₹)'],
    ]
    for (let i=0; i<maxBS; i++) {
      const l=liabRows[i]||{label:'',amount:null}
      const a=assetRows[i]||{label:'',amount:null}
      bsData.push([l.label, l.amount!=null?l.amount:'', a.label, a.amount!=null?a.amount:''])
    }
    bsData.push(['TOTAL', bsTotal.liab, 'TOTAL', bsTotal.assets])
    const bsSheet = XLSX.utils.aoa_to_sheet(bsData)
    bsSheet['!cols']=[{wch:38},{wch:16},{wch:38},{wch:16}]
    XLSX.utils.book_append_sheet(wb, bsSheet, 'Balance Sheet')

    // Cash Flow sheet
    const cfSheet = XLSX.utils.aoa_to_sheet([
      [co], ['CASH FLOW STATEMENT'], [`For the period: ${periodLabel}`], [],
      ['Particulars','Amount (₹)'],
      ['Opening Cash & Bank Balance', cf2.opening], [],
      ['A. OPERATING ACTIVITIES',''],
      ['  Collections from Customers', cf2.operIn],
      ['  Payments — Operations', -cf2.operOut],
      ['  Net Operating Cash Flow', cf2.netOper], [],
      ['B. INVESTING ACTIVITIES',''],
      ['  Equipment Purchased', -cf2.invOut],
      ['  Net Investing Cash Flow', cf2.netInv], [],
      ['C. FINANCING ACTIVITIES',''],
      ['  EMI & Interest Paid', -cf2.finOut],
      ['  Net Financing Cash Flow', cf2.netFin], [],
      ['NET CHANGE IN CASH (A+B+C)', cf2.netCash],
      ['Closing Cash & Bank Balance', cf2.closing],
    ])
    cfSheet['!cols']=[{wch:42},{wch:18}]
    XLSX.utils.book_append_sheet(wb, cfSheet, 'Cash Flow')

    // Trial Balance sheet
    const tbSheet = XLSX.utils.aoa_to_sheet([
      [co], ['TRIAL BALANCE'], [`For the period: ${periodLabel}`], [],
      ['Account Head','Account Group','Debit (₹)','Credit (₹)'],
      ...tb.map(r=>[
        r.cat,
        SECTIONS.find(s=>s.key===r.section)?.label||(r.section==='revenue'?'Revenue':'Other'),
        r.dr, r.cr,
      ]),
      [], ['TOTAL','',tbDr,tbCr],
    ])
    tbSheet['!cols']=[{wch:32},{wch:24},{wch:16},{wch:16}]
    XLSX.utils.book_append_sheet(wb, tbSheet, 'Trial Balance')

    XLSX.writeFile(wb, `Financial_Statements_Tally_${periodLabel.replace(/ /g,'_')}.xlsx`)
  }

  // ── Tally XML Export ──────────────────────────────────────────────────────
  // Generates Tally-importable XML (vouchers from txns + Trial Balance memo entries)
  const exportTallyXML = () => {
    const co    = company?.name || 'Company'
    const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const tDate = d => d ? d.replace(/-/g,'') : ''  // YYYYMMDD for Tally

    // ── 1. Vouchers from period transactions (Receipts + Payments) ─────────
    const voucherXML = txns.map(t => {
      const vchType   = t.type === 'income' ? 'Receipt' : 'Payment'
      const isIncome  = t.type === 'income'
      const amt       = Math.abs(Number(t.amount || 0))
      // Ledger mapping based on category
      const expLedger = (() => {
        const raw = t.expense_category || t.reference_type || 'Miscellaneous'
        const m = CAT_META[raw]
        return m ? m.label : raw.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
      })()
      const partyLedger = isIncome ? 'Sales Account' : expLedger
      const bankLedger  = (() => {
        const mode = (t.payment_mode||'').toLowerCase()
        if (mode.includes('bank')||mode.includes('neft')||mode.includes('rtgs')||mode.includes('imps')) return 'Bank Account'
        if (mode.includes('upi')) return 'UPI Account'
        if (mode.includes('cheque')||mode.includes('check')) return 'Bank Account'
        return 'Cash'
      })()
      return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER REMOTEID="${esc(t.id)}" VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${tDate(t.txn_date)}</DATE>
        <NARRATION>${esc(t.description)}</NARRATION>
        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${esc(t.bank_reference || t.id?.slice(0,8).toUpperCase())}</VOUCHERNUMBER>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(isIncome ? bankLedger : expLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${isIncome ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${isIncome ? -amt : amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(isIncome ? partyLedger : bankLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${isIncome ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${isIncome ? amt : -amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`
    }).join('\n')

    // ── 2. Trial Balance memo entries (Journal type) ──────────────────────
    const tbXML = tb.map(r => {
      const amt = r.dr > 0 ? r.dr : r.cr
      if (!amt) return ''
      return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Journal" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${tDate(period.to || period.from)}</DATE>
        <NARRATION>Trial Balance entry: ${esc(r.cat)} | Period: ${esc(periodLabel)}</NARRATION>
        <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(r.cat)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${r.cr > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${r.cr > 0 ? -r.cr : r.dr}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Profit &amp; Loss A/c</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${r.dr > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${r.dr > 0 ? -r.dr : r.cr}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`
    }).filter(Boolean).join('\n')

    // ── 3. Balance Sheet memo (Capital Account) ───────────────────────────
    const bsMemo = `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Journal" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${tDate(period.to || period.from)}</DATE>
        <NARRATION>Balance Sheet memo | ${esc(periodLabel)} | Total Assets: ${fmt(bs.totalAssets)} | Total Liabilities+Equity: ${fmt(bs.totalLiab + bs.totalEquity)}</NARRATION>
        <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Capital Account</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${-bs.totalEquity}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Fixed Assets</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${bs.fixedAssets}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by Nhance | ${co} | ${periodLabel} -->
<!-- Import in Tally via: Gateway of Tally → Import Data → Vouchers -->
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(co)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${voucherXML}
${tbXML}
${bsMemo}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

    // Download
    const blob = new Blob([xml], { type: 'application/xml' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `Tally_FinancialStatements_${periodLabel.replace(/ /g,'_')}.xml`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Build Tally P&L two-column arrays ─────────────────────────────────────
  function buildTallyPLArrays() {
    const drRows = [] // Dr side: Expenses + (Net Profit if profitable)
    const crRows = [] // Cr side: Income + (Net Loss if loss)

    // Cr side: Income
    crRows.push({ label: 'By Income:', amount: null })
    Object.entries(pl.by['revenue']||{}).forEach(([cat,amt])=>{
      crRows.push({ label: `  By ${cat}`, amount: amt })
    })
    crRows.push({ label: '', amount: null })

    // Dr side: Expenses by section
    SECTIONS.forEach(({ key, label }) => {
      const cats = pl.by[key]
      if (!cats||!Object.keys(cats).length) return
      drRows.push({ label: `To ${label}:`, amount: null })
      Object.entries(cats).forEach(([cat,amt])=>{
        drRows.push({ label: `  ${cat}`, amount: amt })
      })
      drRows.push({ label: '', amount: null })
    })

    const grandTotal = pl.income

    // Balance the sides: Net Profit goes to Dr side, Net Loss to Cr side
    if (pl.netProfit >= 0) {
      drRows.push({ label: 'NET PROFIT', amount: pl.netProfit })
      crRows.push({ label: '(Transferred to Capital)', amount: null })
    } else {
      crRows.push({ label: 'NET LOSS', amount: Math.abs(pl.netProfit) })
      drRows.push({ label: '(Transferred to Capital)', amount: null })
    }

    return { drRows, crRows, grandTotal }
  }

  // ── Build Tally Balance Sheet two-column arrays ────────────────────────────
  function buildTallyBSArrays() {
    const liabRows  = []
    const assetRows = []

    // Liabilities: Capital Account
    liabRows.push({ label: 'Capital Account', amount: null })
    liabRows.push({ label: '  Share Capital', amount: shareCapital })
    liabRows.push({ label: '  Retained Earnings', amount: bs.retainedEarnings })
    liabRows.push({ label: 'Total Capital', amount: bs.totalEquity })
    liabRows.push({ label: '', amount: null })

    // Liabilities: Current Liabilities
    liabRows.push({ label: 'Current Liabilities', amount: null })
    liabRows.push({ label: '  Sundry Creditors (AP)', amount: bs.ap })
    liabRows.push({ label: 'Total Current Liabilities', amount: bs.ap })

    // Assets: Fixed Assets
    assetRows.push({ label: 'Fixed Assets', amount: null })
    if (equipment.length === 0) {
      assetRows.push({ label: '  Equipment & Machinery', amount: 0 })
    } else {
      equipment.slice(0,4).forEach(e=>{
        assetRows.push({ label: `  ${e.name||'Equipment'}`, amount: Number(e.current_value||e.purchase_cost||0) })
      })
      if (equipment.length>4) {
        assetRows.push({ label:`  +${equipment.length-4} more`, amount: equipment.slice(4).reduce((s,e)=>s+Number(e.current_value||e.purchase_cost||0),0) })
      }
    }
    assetRows.push({ label: 'Total Fixed Assets', amount: bs.fixedAssets })
    assetRows.push({ label: '', amount: null })

    // Assets: Current Assets
    assetRows.push({ label: 'Current Assets, Loans & Advances', amount: null })
    assetRows.push({ label: '  Sundry Debtors (AR)', amount: bs.ar })
    assetRows.push({ label: '  Cash & Bank (estimated)', amount: bs.cashBank })
    assetRows.push({ label: 'Total Current Assets', amount: bs.totalCurrentAssets })

    const bsTotal = { liab: bs.totalLiab + bs.totalEquity, assets: bs.totalAssets }
    return { liabRows, assetRows, bsTotal }
  }

  // ── TABS ──────────────────────────────────────────────────────────────────
  const TABS = [
    { key:'pl', label:'P&L Account',    icon:TrendingUp },
    { key:'bs', label:'Balance Sheet',  icon:Scale },
    { key:'cf', label:'Cash Flow',      icon:ArrowDownCircle },
    { key:'tb', label:'Trial Balance',  icon:BarChart3 },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-dark-900 text-slate-100 px-4 py-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Financial Statements</h1>
          <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-wide">Tally Format · {company?.name}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportPDF}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:border-primary-600 hover:text-primary-300 transition-all">
            <FileText className="w-3.5 h-3.5" /> PDF (All 4)
          </button>
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:border-emerald-600 hover:text-emerald-300 transition-all">
            <Download className="w-3.5 h-3.5" /> Excel (All 4)
          </button>
          <button onClick={exportTallyXML}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-dark-700 border border-dark-600 text-slate-300 hover:border-blue-500 hover:text-blue-300 transition-all"
            title="Download Tally XML — import via Gateway of Tally → Import Data → Vouchers">
            <span className="text-[11px] font-bold text-blue-400">TX</span> Tally XML
          </button>
        </div>
      </div>

      {/* Period Picker */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Period</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p,i)=>(
            <button key={i} onClick={()=>setPidx(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                pidx===i ? 'bg-primary-600 text-white shadow' : 'bg-dark-700 text-slate-400 hover:text-slate-200'
              }`}>{p.label}</button>
          ))}
        </div>
        {isCustom && (
          <div className="flex gap-3 mt-3">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 block mb-1">From</label>
              <input type="date" value={cf} onChange={e=>setCF(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 block mb-1">To</label>
              <input type="date" value={ct} onChange={e=>setCT(e.target.value)}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500" />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-dark-800 border border-dark-700 rounded-xl p-1">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              tab===t.key ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {txnLoad ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading…
        </div>
      ) : (
        <>
          {/* ── P&L Account (Tally Two-Column) ──────────────────────────── */}
          {tab==='pl' && (() => {
            const { drRows, crRows, grandTotal } = buildTallyPLArrays()
            const maxRows = Math.max(drRows.length, crRows.length)
            const rows = Array.from({length:maxRows},(_,i)=>({ dr:drRows[i]||{label:'',amount:null}, cr:crRows[i]||{label:'',amount:null} }))
            return (
              <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                {/* Statement title */}
                <div className="px-5 py-3 border-b border-dark-700 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Profit & Loss Account</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">For the period: {periodLabel}</p>
                </div>

                {/* Two-column table */}
                <div className="grid grid-cols-2 divide-x divide-dark-700">
                  {/* Dr header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-red-900/20 border-b border-dark-700">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Dr — Expenditure</span>
                    <span className="text-[10px] text-slate-500">Amount</span>
                  </div>
                  {/* Cr header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-emerald-900/20 border-b border-dark-700">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Cr — Income</span>
                    <span className="text-[10px] text-slate-500">Amount</span>
                  </div>

                  {/* Rows */}
                  {rows.map((row,i)=>(
                    <React.Fragment key={i}>
                      <PLCell side="dr" entry={row.dr} />
                      <PLCell side="cr" entry={row.cr} />
                    </React.Fragment>
                  ))}

                  {/* Grand total */}
                  <div className="px-4 py-2.5 flex justify-between items-center bg-dark-700/50 border-t border-dark-600">
                    <span className="text-xs font-bold text-slate-200 uppercase">Total</span>
                    <span className="font-mono text-sm font-bold text-slate-100">{fmt(grandTotal)}</span>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between items-center bg-dark-700/50 border-t border-dark-600">
                    <span className="text-xs font-bold text-slate-200 uppercase">Total</span>
                    <span className="font-mono text-sm font-bold text-slate-100">{fmt(grandTotal)}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Balance Sheet (Tally Two-Column) ────────────────────────── */}
          {tab==='bs' && (() => {
            const { liabRows, assetRows, bsTotal } = buildTallyBSArrays()
            const maxRows = Math.max(liabRows.length, assetRows.length)
            const rows = Array.from({length:maxRows},(_,i)=>({ l:liabRows[i]||{label:'',amount:null}, a:assetRows[i]||{label:'',amount:null} }))
            return (
              <div className="space-y-4">
                {/* Share Capital input */}
                <div className="bg-dark-800 border border-primary-700/30 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-primary-400" />
                    <span className="text-xs text-slate-400">Share Capital / Owner's Capital (edit to update Balance Sheet)</span>
                  </div>
                  {editSC ? (
                    <div className="flex items-center gap-2">
                      <input type="number" value={scInput} onChange={e=>setSCInput(e.target.value)}
                        className="w-36 bg-dark-700 border border-primary-600 rounded-lg px-2 py-1 text-sm text-right text-slate-100 focus:outline-none" autoFocus />
                      <button onClick={()=>{ setSC(parseFloat(scInput)||0); setEditSC(false) }}
                        className="p-1 rounded text-emerald-400 hover:bg-emerald-900/20"><Check className="w-4 h-4" /></button>
                      <button onClick={()=>setEditSC(false)} className="p-1 rounded text-slate-500 hover:bg-dark-700"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary-300">{fmt(shareCapital)}</span>
                      <button onClick={()=>{ setSCInput(String(shareCapital)); setEditSC(true) }}
                        className="p-1 rounded text-slate-500 hover:text-slate-300"><Edit2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>

                <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                  {/* Statement title */}
                  <div className="px-5 py-3 border-b border-dark-700 text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Balance Sheet</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">As at: {period.to||periodLabel}</p>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-dark-700">
                    {/* Liabilities header */}
                    <div className="flex items-center justify-between px-4 py-2 bg-red-900/15 border-b border-dark-700">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Liabilities & Capital</span>
                      <span className="text-[10px] text-slate-500">Amount (₹)</span>
                    </div>
                    {/* Assets header */}
                    <div className="flex items-center justify-between px-4 py-2 bg-emerald-900/15 border-b border-dark-700">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Assets</span>
                      <span className="text-[10px] text-slate-500">Amount (₹)</span>
                    </div>

                    {rows.map((row,i)=>(
                      <React.Fragment key={i}>
                        <BSCell entry={row.l} side="liab" />
                        <BSCell entry={row.a} side="asset" />
                      </React.Fragment>
                    ))}

                    {/* Totals */}
                    <div className="px-4 py-2.5 flex justify-between items-center bg-dark-700/50 border-t border-dark-600">
                      <span className="text-xs font-bold text-slate-200 uppercase">Total</span>
                      <span className="font-mono text-sm font-bold text-slate-100">{fmt(bsTotal.liab)}</span>
                    </div>
                    <div className="px-4 py-2.5 flex justify-between items-center bg-dark-700/50 border-t border-dark-600">
                      <span className="text-xs font-bold text-slate-200 uppercase">Total</span>
                      <span className="font-mono text-sm font-bold text-slate-100">{fmt(bsTotal.assets)}</span>
                    </div>
                  </div>

                  {/* Balance check */}
                  {Math.abs(bsTotal.liab - bsTotal.assets) > 0 && (
                    <div className="px-5 py-2.5 border-t border-amber-800/30 bg-amber-900/10">
                      <p className="text-xs text-amber-400">
                        Difference: {fmt(Math.abs(bsTotal.liab - bsTotal.assets))} — Enter correct Share Capital above to balance
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── Cash Flow ────────────────────────────────────────────────── */}
          {tab==='cf' && (
            <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-dark-700 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Cash Flow Statement</p>
                <p className="text-[10px] text-slate-500 mt-0.5">For the period: {periodLabel} · Direct Method</p>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-dark-700">
                <MiniCard label="Opening Balance" val={fmt(cf2.opening)} />
                <MiniCard label="Net Operating"   val={fmtS(cf2.netOper)} neg={cf2.netOper<0} />
                <MiniCard label="Net Cash Change" val={fmtS(cf2.netCash)} neg={cf2.netCash<0} />
                <MiniCard label="Closing Balance" val={fmt(cf2.closing)} />
              </div>

              <CFSection title="A.  Operating Activities" net={cf2.netOper}>
                <CFRow label="Collections from Customers (Inflows)" amount={cf2.operIn}   positive />
                <CFRow label="Payments — Operations (Outflows)"     amount={cf2.operOut}  />
                {Object.entries(cf2.byMode).length>0&&(
                  <div className="px-5 pb-2 pt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Inflows by Mode</p>
                    {Object.entries(cf2.byMode).map(([m,a])=>(
                      <div key={m} className="flex justify-between text-xs text-slate-500 py-0.5">
                        <span className="capitalize">{m}</span>
                        <span className="font-mono text-emerald-500">{fmt(a)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CFSection>

              <CFSection title="B.  Investing Activities" net={cf2.netInv}>
                {cf2.invOut>0
                  ? periodEquipment.map(e=><CFRow key={e.id} label={`  ${e.name||'Equipment Purchased'}`} amount={Number(e.purchase_cost||0)} note={e.purchase_date} />)
                  : <p className="text-xs text-slate-500 px-5 pb-3">No equipment purchases in this period</p>
                }
              </CFSection>

              <CFSection title="C.  Financing Activities" net={cf2.netFin}>
                {cf2.finOut>0
                  ? <CFRow label="EMI & Interest Paid" amount={cf2.finOut} />
                  : <p className="text-xs text-slate-500 px-5 pb-3">No EMI / interest payments in this period</p>
                }
              </CFSection>

              <div className="divide-y divide-dark-700 border-t border-dark-600">
                <div className="px-5 py-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-300">Net Change in Cash (A+B+C)</span>
                  <span className={`font-mono text-sm font-bold ${cf2.netCash>=0?'text-emerald-400':'text-red-400'}`}>{fmtS(cf2.netCash)}</span>
                </div>
                <div className="px-5 py-3 flex justify-between items-center bg-dark-700/30">
                  <span className="text-sm font-bold text-slate-100">Closing Cash & Bank Balance</span>
                  <span className="font-mono text-base font-bold text-slate-100">{fmt(cf2.closing)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Trial Balance ─────────────────────────────────────────────── */}
          {tab==='tb' && (
            <div className="space-y-3">
              <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold border ${
                Math.abs(tbDr-tbCr)<1 ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-400' : 'bg-amber-900/20 border-amber-700/30 text-amber-400'
              }`}>
                <span>{Math.abs(tbDr-tbCr)<1 ? '✓ Trial Balance is Balanced' : `Difference: ${fmt(Math.abs(tbDr-tbCr))}`}</span>
                <div className="flex gap-4 text-[11px]">
                  <span>Total Dr: <span className="font-mono">{fmt(tbDr)}</span></span>
                  <span>Total Cr: <span className="font-mono">{fmt(tbCr)}</span></span>
                </div>
              </div>

              <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-dark-700 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Trial Balance</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">For the period: {periodLabel}</p>
                </div>

                {/* Column headers */}
                <div className="px-5 py-2 border-b border-dark-700 grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Account Head</span>
                  <span>Account Group</span>
                  <span className="w-24 text-right">Debit (₹)</span>
                  <span className="w-24 text-right">Credit (₹)</span>
                  <span className="w-20 text-right">Balance</span>
                </div>

                {/* Group by section */}
                {['revenue','direct','field','payroll','admin','finance'].map(sec=>{
                  const secRows = tb.filter(r=>r.section===sec)
                  if (!secRows.length) return null
                  const secLabel = sec==='revenue' ? 'Revenue' : SECTIONS.find(s=>s.key===sec)?.label||sec
                  const secDr = secRows.reduce((s,r)=>s+r.dr,0)
                  const secCr = secRows.reduce((s,r)=>s+r.cr,0)
                  return (
                    <div key={sec}>
                      <div className={`px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-dark-700/60 ${
                        sec==='revenue' ? 'text-emerald-500 bg-emerald-900/10' : 'text-orange-400 bg-orange-900/10'
                      }`}>{secLabel}</div>
                      {secRows.map((r,i)=>(
                        <div key={i} className="px-5 py-2 border-b border-dark-700/30 last:border-0 grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center hover:bg-dark-700/20 text-sm">
                          <span className="text-slate-300">{r.cat}</span>
                          <span className="text-[11px] text-slate-500">{secLabel}</span>
                          <span className="w-24 text-right font-mono text-red-400">{r.dr>0?fmt(r.dr):'—'}</span>
                          <span className="w-24 text-right font-mono text-emerald-400">{r.cr>0?fmt(r.cr):'—'}</span>
                          <span className={`w-20 text-right font-mono text-xs font-semibold ${r.balance>=0?'text-emerald-400':'text-red-400'}`}>
                            {r.balance>=0 ? CR(r.balance) : DR(Math.abs(r.balance))}
                          </span>
                        </div>
                      ))}
                      {/* Section subtotal */}
                      <div className="px-5 py-1.5 border-b border-dark-700 grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 bg-dark-700/20 text-[11px] font-semibold">
                        <span className="text-slate-400">Sub-Total</span>
                        <span />
                        <span className="w-24 text-right font-mono text-red-300">{secDr>0?fmt(secDr):'—'}</span>
                        <span className="w-24 text-right font-mono text-emerald-300">{secCr>0?fmt(secCr):'—'}</span>
                        <span className="w-20" />
                      </div>
                    </div>
                  )
                })}

                {/* Grand total */}
                <div className="px-5 py-3 bg-dark-700/40 border-t border-dark-600 grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 text-sm font-bold">
                  <span className="text-slate-200 col-span-2">GRAND TOTAL</span>
                  <span className="w-24 text-right font-mono text-red-300">{fmt(tbDr)}</span>
                  <span className="w-24 text-right font-mono text-emerald-300">{fmt(tbCr)}</span>
                  <span className="w-20" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Cell components for two-column tables ─────────────────────────────────────
function PLCell({ entry, side }) {
  if (!entry.label && entry.amount==null)
    return <div className="px-4 py-1 border-b border-dark-700/30 min-h-[28px]" />
  const isSectionHead = entry.label?.startsWith('To ') || entry.label?.startsWith('By ')
  const isNet = entry.label==='NET PROFIT'||entry.label==='NET LOSS'
  const isNote = entry.label?.startsWith('(')
  return (
    <div className={`flex justify-between items-center px-4 py-1.5 border-b border-dark-700/30 min-h-[28px] ${isSectionHead?'bg-dark-700/20':''}`}>
      <span className={`text-sm ${
        isNet ? (entry.label==='NET PROFIT'?'font-bold text-emerald-400':'font-bold text-red-400')
        : isSectionHead ? 'font-semibold text-slate-200'
        : isNote ? 'text-xs italic text-slate-500'
        : 'text-slate-400'
      } ${entry.label?.startsWith('  ')?'pl-3':''}`}>
        {entry.label?.trim()}
      </span>
      {entry.amount!=null && (
        <span className={`font-mono text-sm font-semibold ${
          isNet ? (entry.label==='NET PROFIT'?'text-emerald-400':'text-red-400')
          : side==='dr' ? 'text-red-300' : 'text-emerald-300'
        }`}>{fmt(entry.amount)}</span>
      )}
    </div>
  )
}

function BSCell({ entry, side }) {
  if (!entry.label && entry.amount==null)
    return <div className="px-4 py-1 border-b border-dark-700/30 min-h-[28px]" />
  const isHead = ['Capital Account','Current Liabilities','Fixed Assets','Current Assets, Loans & Advances'].includes(entry.label?.trim())
  const isTotal = entry.label?.startsWith('Total')
  return (
    <div className={`flex justify-between items-center px-4 py-1.5 border-b border-dark-700/30 min-h-[28px] ${isHead||isTotal?'bg-dark-700/20':''}`}>
      <span className={`text-sm ${isHead?'font-bold text-slate-200':isTotal?'font-semibold text-slate-300':'text-slate-400'} ${entry.label?.startsWith('  ')?'pl-3':''}`}>
        {entry.label?.trim()}
      </span>
      {entry.amount!=null && (
        <span className={`font-mono text-sm ${isTotal?'font-bold text-slate-100':'font-semibold'} ${
          side==='liab' ? (entry.amount<0?'text-red-400':'text-orange-300') : 'text-emerald-300'
        }`}>{entry.amount<0?`(${fmt(entry.amount)})`:fmt(entry.amount)}</span>
      )}
    </div>
  )
}

function CFSection({ title, net, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-dark-700">
      <button className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-dark-700/20 text-left"
        onClick={()=>setOpen(p=>!p)}>
        <span className="text-xs font-bold text-slate-300">{title}</span>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-sm font-bold ${net>=0?'text-emerald-400':'text-red-400'}`}>{fmtS(net)}</span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
        </div>
      </button>
      {open&&<div className="border-t border-dark-700/40">{children}</div>}
    </div>
  )
}

function CFRow({ label, amount, positive, note }) {
  return (
    <div className="flex justify-between items-center px-5 py-2 border-b border-dark-700/30 last:border-0">
      <div>
        <span className="text-sm text-slate-300">{label}</span>
        {note&&<p className="text-[10px] text-slate-500">{note}</p>}
      </div>
      <span className={`font-mono text-sm font-semibold ${positive?'text-emerald-400':'text-red-400'}`}>
        {positive?fmt(amount):`(${fmt(amount)})`}
      </span>
    </div>
  )
}

function MiniCard({ label, val, neg }) {
  return (
    <div className="bg-dark-700/40 border border-dark-600 rounded-xl px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`font-mono text-sm font-bold ${neg?'text-red-400':'text-slate-100'}`}>{val}</p>
    </div>
  )
}
