/**
 * FieldExpensePage.jsx
 * Mobile-first field expense recording — all roles can submit.
 * Managers/Admin see full history + summary.
 * Operators access via OperatorPortal tab.
 */

import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { nextDocNumber } from '../../utils/docNumbers'
import {
  Receipt, Camera, X, ChevronDown, Loader2, CheckCircle2,
  ArrowLeft, Plus, AlertCircle, IndianRupee, Smartphone,
  Banknote, CreditCard, FileText, Search, Filter, Download,
  Package, Wrench, Droplets, Users, Home, Utensils, Fuel,
  Building2, Zap, MoreHorizontal, Eye, Trash2, Clock, Car, HeartPulse, Pencil,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fmtINR   = n  => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const fmtDate  = d  => d ? format(new Date(d), 'dd MMM yyyy') : '—'
const inp = (x = '') =>
  `w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-600 ${x}`

// ── Expense Categories ────────────────────────────────────────────────────────
// Field Expenses = daily site operational expenses only
// Purchase (spares, equipment, maintenance) → handled in Purchase module
// Salary, EMI, financial → handled in Accounts module
const CATEGORIES = [
  { value: 'fuel',            label: 'Fuel',                  icon: Fuel,       color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-600/40'   },
  { value: 'food',            label: 'Food / Catering',       icon: Utensils,   color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-600/40'     },
  { value: 'travel',          label: 'Travel',                icon: Car,        color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-600/40'     },
  { value: 'accommodation',   label: 'Accommodation',         icon: Home,       color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-600/40'     },
  { value: 'medical',         label: 'Medical / Emergency',   icon: HeartPulse, color: 'text-red-400',    bg: 'bg-red-500/10 border-red-600/40'       },
  { value: 'site_allowance',  label: 'Site Allowance',        icon: Building2,  color: 'text-teal-400',   bg: 'bg-teal-500/10 border-teal-600/40'     },
  { value: 'spares_purchase', label: 'Spares (Breakdown)',    icon: Wrench,     color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-600/40', inv: true },
]
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

const PAYMENT_MODES = [
  { value: 'cash',          label: 'Cash',          icon: Banknote,     color: 'text-emerald-400' },
  { value: 'upi',           label: 'UPI',           icon: Smartphone,   color: 'text-violet-400' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2,    color: 'text-blue-400' },
  { value: 'cheque',        label: 'Cheque',        icon: FileText,     color: 'text-amber-400' },
  { value: 'card',          label: 'Card',          icon: CreditCard,   color: 'text-cyan-400' },
]
const PAY_MAP = Object.fromEntries(PAYMENT_MODES.map(m => [m.value, m]))

const INV_UNITS = ['unit','nos','kg','g','ton','litre','ml','m','m2','m3','ft','inch','set','box','bag','pair','roll','sheet','length']

// ── Photo capture ─────────────────────────────────────────────────────────────
function PhotoCapture({ label, value, onChange }) {
  const ref = useRef()
  const preview = value ? URL.createObjectURL(value) : null
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1.5">{label}</p>
      {preview
        ? (
          <div className="relative w-full h-36 rounded-xl overflow-hidden border border-dark-600">
            <img src={preview} alt="bill" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
        : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="w-full h-28 rounded-xl border-2 border-dashed border-dark-600 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-primary-500 hover:text-primary-400 transition-colors"
          >
            <Camera className="w-5 h-5" />
            <span className="text-xs">Tap to capture photo</span>
          </button>
        )
      }
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => onChange(e.target.files?.[0] || null)}
      />
    </div>
  )
}

// ── UPI Payment Flow ──────────────────────────────────────────────────────────
function UpiFlow({ amount, description, txnRef, onTxnRefChange }) {
  const [launched, setLaunched] = useState(false)

  const launchUpi = () => {
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter amount first')
    // Opens UPI app chooser — user scans QR or picks payee inside their UPI app
    const note   = encodeURIComponent(description || 'Field Payment')
    const upiUrl = `upi://pay?am=${amount}&cu=INR&tn=${note}`
    window.location.href = upiUrl
    // Show TxnID field immediately — user pastes it after returning from UPI app
    setTimeout(() => setLaunched(true), 1500)
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={launchUpi}
        className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
      >
        <Smartphone className="w-4 h-4" />
        Open UPI App — Pay ₹{amount ? Number(amount).toLocaleString('en-IN') : '0'}
      </button>
      <p className="text-[11px] text-slate-500 text-center">
        Opens GPay / PhonePe / Paytm — scan QR or enter UPI ID inside the app
      </p>
      {launched && (
        <div className="bg-violet-500/10 border border-violet-600/40 rounded-xl p-3 space-y-2">
          <p className="text-xs text-violet-300 font-semibold">Paid? Paste the Transaction ID:</p>
          <input
            className={inp()}
            placeholder="Transaction ID / UTR number"
            value={txnRef}
            onChange={e => onTxnRefChange('transaction_ref', e.target.value)}
          />
        </div>
      )}
      {!launched && (
        <button
          type="button"
          onClick={() => setLaunched(true)}
          className="w-full text-xs text-slate-500 hover:text-slate-300 py-1"
        >
          Already paid? Enter Transaction ID
        </button>
      )}
    </div>
  )
}

// ── Expense Form ──────────────────────────────────────────────────────────────
function ExpenseForm({ companyId, userId, userRole, userName, onSuccess, onBack }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [billPhoto, setBillPhoto] = useState(null)

  const INIT = {
    expense_date: todayStr(),
    equipment_id: '',
    project_id: '',
    category: '',
    payee_type: 'vendor',
    payee_name: '',
    payee_id: '',
    payee_upi: '',
    bill_number: '',
    description: '',
    amount: '',
    payment_mode: 'cash',
    transaction_ref: '',
    inv_item_name: '',
    inv_quantity: '',
    inv_unit: 'unit',
  }
  const [form, setForm] = useState(INIT)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Equipment list
  const { data: equipment = [] } = useQuery({
    queryKey: ['fe_equipment', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id, equipment_name, equipment_number').eq('company_id', companyId).order('equipment_name')
      return data || []
    },
    enabled: !!companyId,
  })

  // Projects list
  const { data: projects = [] } = useQuery({
    queryKey: ['fe_projects', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, project_name').eq('company_id', companyId).order('project_name')
      return data || []
    },
    enabled: !!companyId,
  })

  // HR employees (for operator payee)
  const { data: employees = [] } = useQuery({
    queryKey: ['fe_employees', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees').select('id, name, employee_number').eq('company_id', companyId).eq('is_active', true).order('name')
      return data || []
    },
    enabled: !!companyId && form.payee_type === 'operator',
  })

  // First store (for inventory auto-creation)
  const { data: stores = [] } = useQuery({
    queryKey: ['fe_stores', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('stores').select('id, store_name').eq('company_id', companyId).limit(3)
      return data || []
    },
    enabled: !!companyId,
  })

  const selectedCat = CAT_MAP[form.category]
  const needsInvDetails = selectedCat?.inv && form.category !== ''

  // Upload bill photo to Supabase Storage
  const uploadBillPhoto = async (file) => {
    const ext  = file.name.split('.').pop()
    const path = `${companyId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('expense-photos').upload(path, file, { upsert: true })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('expense-photos').getPublicUrl(path)
    return publicUrl
  }

  // Auto-create inventory entry for spares/lubricants
  const createInventoryEntry = async (expenseId, amount) => {
    if (!form.inv_item_name.trim() || !form.inv_quantity) return null
    try {
      const unitCost = parseFloat(form.inv_quantity) > 0
        ? parseFloat(amount) / parseFloat(form.inv_quantity)
        : parseFloat(amount)

      // Upsert inventory item
      const { data: existingItems } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('company_id', companyId)
        .ilike('item_name', form.inv_item_name.trim())
        .limit(1)

      let itemId
      if (existingItems?.length > 0) {
        itemId = existingItems[0].id
      } else {
        const invCat = form.category === 'lubricants' ? 'lubricant' : 'spare_part'
        const { data: newItem } = await supabase.from('inventory_items').insert({
          company_id: companyId,
          item_name: form.inv_item_name.trim(),
          unit: form.inv_unit,
          category: invCat,
          is_active: true,
        }).select('id').single()
        itemId = newItem?.id
      }

      if (!itemId) return null

      // Insert stock transaction
      const txnNum = await nextDocNumber(companyId, 'stock_in').catch(() => `GRN-${Date.now()}`)
      const storeId = stores[0]?.id || null
      const { data: txn } = await supabase.from('stock_transactions').insert({
        company_id:  companyId,
        txn_number:  txnNum,
        txn_type:    'in',
        txn_date:    form.expense_date,
        item_id:     itemId,
        store_id:    storeId,
        quantity:    parseFloat(form.inv_quantity),
        unit_cost:   unitCost,
        total_cost:  parseFloat(amount),
        notes:       `Field expense: ${form.description || form.category}`,
        created_by:  userId,
      }).select('id').single()

      // Update field_expense with inventory link
      await supabase.from('field_expenses').update({
        inv_item_id: itemId,
        inv_txn_id:  txn?.id || null,
      }).eq('id', expenseId)

      return itemId
    } catch (err) {
      console.warn('Inventory auto-link failed (non-fatal):', err)
      return null
    }
  }

  const handleSubmit = async () => {
    if (!form.category)     return toast.error('Select expense category')
    if (!form.payee_name.trim()) return toast.error('Enter payee name')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    if (form.payment_mode === 'upi' && !form.transaction_ref && !form.payee_upi)
      return toast.error('Enter UPI transaction ID')
    if (needsInvDetails && !form.inv_item_name.trim())
      return toast.error('Enter item name for inventory')

    setSaving(true)
    try {
      // Upload photo if any
      let billPhotoUrl = null
      if (billPhoto) {
        billPhotoUrl = await uploadBillPhoto(billPhoto)
      }

      const selEq  = equipment.find(e => e.id === form.equipment_id)
      const selPrj = projects.find(p => p.id === form.project_id)

      const payload = {
        company_id:      companyId,
        expense_date:    form.expense_date,
        equipment_id:    form.equipment_id || null,
        equipment_name:  selEq?.name || null,
        project_id:      form.project_id || null,
        project_name:    selPrj?.project_name || null,
        category:        form.category,
        payee_type:      form.payee_type,
        payee_name:      form.payee_name.trim(),
        payee_id:        form.payee_id || null,
        payee_upi_id:    form.payee_upi || null,
        bill_number:     form.bill_number || null,
        bill_photo_url:  billPhotoUrl,
        description:     form.description || null,
        amount:          parseFloat(form.amount),
        payment_mode:    form.payment_mode,
        transaction_ref: form.transaction_ref || null,
        payment_status:  'paid',
        inv_item_name:   form.inv_item_name || null,
        inv_quantity:    form.inv_quantity ? parseFloat(form.inv_quantity) : null,
        inv_unit:        form.inv_unit || null,
        created_by:      userId,
        created_by_name: userName,
        created_by_role: userRole,
      }

      const { data: expense, error } = await supabase.from('field_expenses').insert(payload).select('id').single()
      if (error) throw error

      // Auto-create inventory if applicable
      if (needsInvDetails && expense?.id) {
        await createInventoryEntry(expense.id, form.amount)
      }

      // Fetch the payment voucher auto-created by the DB trigger
      let voucher = null
      if (expense?.id) {
        const { data: v } = await supabase
          .from('payment_vouchers')
          .select('voucher_number, amount, payment_mode, payee_name')
          .eq('expense_id', expense.id)
          .single()
        voucher = v
      }

      qc.invalidateQueries({ queryKey: ['field_expenses'] })
      qc.invalidateQueries({ queryKey: ['inv_items'] })
      qc.invalidateQueries({ queryKey: ['inv_stock'] })

      if (voucher?.voucher_number) {
        toast.success(`Expense recorded · Voucher ${voucher.voucher_number}`, { duration: 5000 })
      } else {
        toast.success('Expense recorded!')
      }
      setForm(INIT)
      setBillPhoto(null)
      onSuccess?.(voucher)
    } catch (err) {
      console.error(err)
      toast.error('Failed to save: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto pb-8">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">

        {/* Date + Equipment + Project */}
        <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Basic Details</p>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Expense Date <span className="text-red-400">*</span> <span className="text-slate-600 font-normal">(past or future dates allowed)</span></label>
            <input type="date" className={inp()} value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Equipment / Machine</label>
            <select className={inp()} value={form.equipment_id} onChange={e => set('equipment_id', e.target.value)}>
              <option value="">— Select equipment (optional) —</option>
              {equipment.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.equipment_name} {eq.equipment_number ? `(${eq.equipment_number})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Project / Site</label>
            <select className={inp()} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">— Select project (optional) —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
        </div>

        {/* Category picker */}
        <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Expense Category <span className="text-red-400">*</span></p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon
              const active = form.category === cat.value
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => set('category', cat.value)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    active
                      ? `${cat.bg} ${cat.color} border-current ring-1 ring-current`
                      : 'bg-dark-700 border-dark-600 text-slate-400 hover:border-dark-500'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? cat.color : 'text-slate-500'}`} />
                  <span className="text-xs font-medium leading-tight">{cat.label}</span>
                </button>
              )
            })}
          </div>

          {/* Inventory fields for spares/lubricants */}
          {needsInvDetails && (
            <div className="bg-blue-500/5 border border-blue-700/30 rounded-xl p-3 space-y-2">
              <p className="text-xs text-blue-300 font-semibold flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Inventory Entry (auto-recorded)
              </p>
              <input
                className={inp()}
                placeholder="Item name e.g. Air Filter, Engine Oil *"
                value={form.inv_item_name}
                onChange={e => set('inv_item_name', e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className={inp('flex-1')}
                  type="number"
                  placeholder="Qty"
                  value={form.inv_quantity}
                  onChange={e => set('inv_quantity', e.target.value)}
                />
                <select className={inp('w-28')} value={form.inv_unit} onChange={e => set('inv_unit', e.target.value)}>
                  {INV_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Payee */}
        <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Payee Info <span className="text-red-400">*</span></p>
          <div className="flex rounded-xl border border-dark-600 overflow-hidden text-xs font-medium">
            {[
              { v: 'operator', l: 'Operator' },
              { v: 'vendor',   l: 'Vendor' },
              { v: 'direct',   l: 'Direct' },
            ].map(t => (
              <button
                key={t.v}
                type="button"
                onClick={() => { set('payee_type', t.v); set('payee_name', ''); set('payee_id', '') }}
                className={`flex-1 py-2.5 transition-colors ${form.payee_type === t.v ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.l}
              </button>
            ))}
          </div>

          {form.payee_type === 'operator'
            ? (
              <select
                className={inp()}
                value={form.payee_id}
                onChange={e => {
                  const emp = employees.find(x => x.id === e.target.value)
                  set('payee_id', e.target.value)
                  set('payee_name', emp?.name || '')
                }}
              >
                <option value="">— Select operator —</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_number})</option>
                ))}
              </select>
            )
            : (
              <input
                className={inp()}
                placeholder={form.payee_type === 'vendor' ? 'Vendor name *' : 'Payee name *'}
                value={form.payee_name}
                onChange={e => set('payee_name', e.target.value)}
              />
            )
          }
        </div>

        {/* Bill details + photo */}
        <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Bill Details</p>
          <input
            className={inp()}
            placeholder="Bill / Reference number"
            value={form.bill_number}
            onChange={e => set('bill_number', e.target.value)}
          />
          <textarea
            className={inp('resize-none h-16')}
            placeholder="Description / purpose of expense"
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
          <PhotoCapture label="Bill Photo" value={billPhoto} onChange={setBillPhoto} />
        </div>

        {/* Amount + Payment mode */}
        <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount & Payment <span className="text-red-400">*</span></p>

          {/* Amount */}
          <div className="relative">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className={inp('pl-9 text-lg font-bold')}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
            />
          </div>

          {/* Payment mode */}
          <div className="grid grid-cols-5 gap-1.5">
            {PAYMENT_MODES.map(m => {
              const Icon = m.icon
              const active = form.payment_mode === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => set('payment_mode', m.value)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center transition-all ${
                    active
                      ? 'bg-primary-600/20 border-primary-500 text-primary-300'
                      : 'bg-dark-700 border-dark-600 text-slate-500 hover:border-dark-500'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[9px] font-medium leading-none">{m.label}</span>
                </button>
              )
            })}
          </div>

          {/* UPI deep-link flow */}
          {form.payment_mode === 'upi' && (
            <UpiFlow
              amount={form.amount}
              description={form.description}
              txnRef={form.transaction_ref}
              onTxnRefChange={(k, v) => set(k, v)}
            />
          )}

          {/* Transaction ref for non-UPI, non-cash */}
          {['bank_transfer', 'cheque', 'card'].includes(form.payment_mode) && (
            <input
              className={inp()}
              placeholder={
                form.payment_mode === 'bank_transfer' ? 'UTR / Reference number' :
                form.payment_mode === 'cheque' ? 'Cheque number' : 'Card last 4 / reference'
              }
              value={form.transaction_ref}
              onChange={e => set('transaction_ref', e.target.value)}
            />
          )}
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg"
        >
          {saving
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
            : <><CheckCircle2 className="w-5 h-5" /> Record Expense</>
          }
        </button>
      </div>
    </div>
  )
}

// ── Edit Field Expense Modal ──────────────────────────────────────────────────
function EditFieldExpenseModal({ exp, companyId, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    expense_date:    exp.expense_date || todayStr(),
    equipment_id:    exp.equipment_id || '',
    project_id:      exp.project_id || '',
    category:        exp.category || '',
    payee_name:      exp.payee_name || '',
    bill_number:     exp.bill_number || '',
    description:     exp.description || '',
    amount:          exp.amount ? String(exp.amount) : '',
    payment_mode:    exp.payment_mode || 'cash',
    transaction_ref: exp.transaction_ref || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: equipment = [] } = useQuery({
    queryKey: ['fe_equipment', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('id, equipment_name, equipment_number').eq('company_id', companyId).order('equipment_name')
      return data || []
    },
    enabled: !!companyId,
  })
  const { data: projects = [] } = useQuery({
    queryKey: ['fe_projects', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, project_name').eq('company_id', companyId).order('project_name')
      return data || []
    },
    enabled: !!companyId,
  })

  const handleSave = async () => {
    if (!form.category)           return toast.error('Select a category')
    if (!form.payee_name.trim())  return toast.error('Enter payee name')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount')

    setSaving(true)
    try {
      const selEq  = equipment.find(e => e.id === form.equipment_id)
      const selPrj = projects.find(p => p.id === form.project_id)

      const { error } = await supabase.from('field_expenses').update({
        expense_date:    form.expense_date,
        equipment_id:    form.equipment_id || null,
        equipment_name:  selEq?.equipment_name || null,
        project_id:      form.project_id || null,
        project_name:    selPrj?.project_name || null,
        category:        form.category,
        payee_name:      form.payee_name.trim(),
        bill_number:     form.bill_number || null,
        description:     form.description || null,
        amount:          parseFloat(form.amount),
        payment_mode:    form.payment_mode,
        transaction_ref: form.transaction_ref || null,
      }).eq('id', exp.id)

      if (error) throw error

      // Also sync the expenses & account_transactions rows if they exist
      await supabase.from('expenses').update({
        expense_date:   form.expense_date,
        category:       form.category,
        description:    form.description || form.payee_name,
        vendor_name:    form.payee_name.trim(),
        amount:         parseFloat(form.amount),
        total_amount:   parseFloat(form.amount),
        payment_mode:   form.payment_mode,
        bank_reference: form.transaction_ref || null,
      }).eq('field_expense_id', exp.id)

      await supabase.from('account_transactions').update({
        txn_date:       form.expense_date,
        description:    form.description || form.payee_name,
        amount:         parseFloat(form.amount),
        payment_mode:   form.payment_mode,
        bank_reference: form.transaction_ref || null,
      }).eq('reference_type', 'expense').in('reference_id',
        (await supabase.from('expenses').select('id').eq('field_expense_id', exp.id)).data?.map(r => r.id) || []
      )

      toast.success('Expense updated')
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error('Update failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md bg-dark-800 border border-dark-700 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary-600/20 rounded-xl flex items-center justify-center">
              <Pencil className="w-4 h-4 text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-100">Edit Expense</p>
              <p className="text-[11px] text-slate-500">{exp.payee_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Date */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date</label>
            <input type="date" className={inp()} value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
          </div>

          {/* Equipment */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Equipment / Machine</label>
            <select className={inp()} value={form.equipment_id} onChange={e => set('equipment_id', e.target.value)}>
              <option value="">— None —</option>
              {equipment.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.equipment_name} {eq.equipment_number ? `(${eq.equipment_number})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Project */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Project / Site</label>
            <select className={inp()} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">— None —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon
                const active = form.category === cat.value
                return (
                  <button key={cat.value} type="button" onClick={() => set('category', cat.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all text-xs ${
                      active ? `${cat.bg} ${cat.color} border-current ring-1 ring-current` : 'bg-dark-700 border-dark-600 text-slate-400 hover:border-dark-500'
                    }`}>
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? cat.color : 'text-slate-500'}`} />
                    {cat.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Payee */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Payee Name</label>
            <input className={inp()} value={form.payee_name} onChange={e => set('payee_name', e.target.value)} />
          </div>

          {/* Bill + Description */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Bill / Reference Number</label>
            <input className={inp()} value={form.bill_number} onChange={e => set('bill_number', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description</label>
            <textarea className={inp('resize-none h-14')} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount (₹)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input className={inp('pl-9 text-lg font-bold')} type="number" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
          </div>

          {/* Payment mode */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Payment Mode</label>
            <div className="grid grid-cols-5 gap-1.5">
              {PAYMENT_MODES.map(m => {
                const Icon = m.icon
                const active = form.payment_mode === m.value
                return (
                  <button key={m.value} type="button" onClick={() => set('payment_mode', m.value)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-center transition-all ${
                      active ? 'bg-primary-600/20 border-primary-500 text-primary-300' : 'bg-dark-700 border-dark-600 text-slate-500 hover:border-dark-500'
                    }`}>
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-medium leading-none">{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Txn ref */}
          {form.payment_mode !== 'cash' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Transaction Reference</label>
              <input className={inp()} placeholder="UTR / Cheque / Card ref" value={form.transaction_ref} onChange={e => set('transaction_ref', e.target.value)} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-dark-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-dark-600 text-slate-400 text-sm font-semibold hover:bg-dark-700">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Expense History ───────────────────────────────────────────────────────────
function ExpenseHistory({ companyId, userId, userRole }) {
  const isAdmin   = ['admin', 'superadmin', 'manager', 'accounts'].includes(userRole)
  const canEdit   = ['admin', 'superadmin', 'accounts'].includes(userRole)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [editExp, setEditExp] = useState(null)
  const qc = useQueryClient()

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['field_expenses', companyId, isAdmin ? 'all' : userId],
    queryFn: async () => {
      let q = supabase.from('field_expenses').select('*').eq('company_id', companyId).order('expense_date', { ascending: false }).order('created_at', { ascending: false })
      if (!isAdmin) q = q.eq('created_by', userId)
      const { data } = await q
      return data || []
    },
    enabled: !!companyId,
  })

  const filtered = expenses.filter(e => {
    const matchSearch = !search || [e.payee_name, e.description, e.bill_number, e.equipment_name, e.project_name]
      .filter(Boolean).some(s => s.toLowerCase().includes(search.toLowerCase()))
    const matchCat  = !catFilter  || e.category === catFilter
    const matchMode = !modeFilter || e.payment_mode === modeFilter
    return matchSearch && matchCat && matchMode
  })

  const totalAmt = filtered.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)

  const handleDelete = async (id) => {
    const { error } = await supabase.from('field_expenses').delete().eq('id', id)
    if (error) return toast.error('Delete failed')
    toast.success('Expense deleted')
    qc.invalidateQueries({ queryKey: ['field_expenses'] })
    setDeleteId(null)
  }

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 space-y-4">

      {/* Summary */}
      {filtered.length > 0 && (
        <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-500">{isAdmin ? 'All Expenses' : 'My Expenses'}</p>
            <p className="text-xl font-black text-slate-100">{fmtINR(totalAmt)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Entries</p>
            <p className="text-2xl font-black text-primary-400">{filtered.length}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input className={inp('pl-9')} placeholder="Search payee, description, bill…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className={inp('flex-1 text-xs')} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select className={inp('flex-1 text-xs')} value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
            <option value="">All Modes</option>
            {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0
        ? (
          <div className="text-center py-12 text-slate-600">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No expenses found</p>
          </div>
        )
        : (
          <div className="space-y-2">
            {filtered.map(exp => {
              const cat  = CAT_MAP[exp.category]
              const pay  = PAY_MAP[exp.payment_mode]
              const Icon = cat?.icon || Receipt
              const PayIcon = pay?.icon || Banknote

              return (
                <div key={exp.id} className="bg-dark-800 border border-dark-700 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cat?.bg || 'bg-slate-700/50 border border-slate-600'}`}>
                      <Icon className={`w-4 h-4 ${cat?.color || 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{exp.payee_name}</p>
                          <p className="text-xs text-slate-500">{cat?.label || exp.category} · {fmtDate(exp.expense_date)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-black text-primary-400">{fmtINR(exp.amount)}</p>
                          <span className={`text-[10px] flex items-center gap-1 justify-end ${pay?.color || 'text-slate-400'}`}>
                            <PayIcon className="w-3 h-3" />{pay?.label || exp.payment_mode}
                          </span>
                        </div>
                      </div>

                      {/* Secondary info */}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {exp.equipment_name && <span className="text-[11px] text-slate-500">🔧 {exp.equipment_name}</span>}
                        {exp.project_name   && <span className="text-[11px] text-slate-500">📁 {exp.project_name}</span>}
                        {exp.bill_number    && <span className="text-[11px] text-slate-500">Bill: {exp.bill_number}</span>}
                        {exp.description    && <span className="text-[11px] text-slate-400 truncate max-w-[180px]">{exp.description}</span>}
                        {exp.transaction_ref && <span className="text-[11px] text-slate-500">Ref: {exp.transaction_ref}</span>}
                      </div>

                      {/* Inventory badge */}
                      {exp.inv_item_name && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-400">
                          <Package className="w-3 h-3" />
                          <span>Inventory: {exp.inv_item_name} ({exp.inv_quantity} {exp.inv_unit})</span>
                        </div>
                      )}

                      {/* Bill photo */}
                      {exp.bill_photo_url && (
                        <a
                          href={exp.bill_photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 flex items-center gap-1 text-[11px] text-primary-400 hover:underline"
                        >
                          <Eye className="w-3 h-3" /> View Bill Photo
                        </a>
                      )}

                      {/* Submitted by (admin view) */}
                      {isAdmin && exp.created_by_name && (
                        <p className="mt-1.5 text-[10px] text-slate-600">Submitted by {exp.created_by_name} ({exp.created_by_role})</p>
                      )}
                    </div>
                  </div>

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="mt-3 pt-3 border-t border-dark-700 flex items-center justify-between">
                      {/* Edit — admin/accounts only */}
                      {canEdit && deleteId !== exp.id && (
                        <button
                          onClick={() => setEditExp(exp)}
                          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-primary-400 transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                      {/* Delete confirm */}
                      <div className="flex items-center gap-2 ml-auto">
                        {deleteId === exp.id
                          ? (
                            <>
                              <span className="text-xs text-red-400">Delete this expense?</span>
                              <button onClick={() => handleDelete(exp.id)} className="text-xs text-red-400 font-semibold hover:text-red-300">Yes, delete</button>
                              <button onClick={() => setDeleteId(null)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
                            </>
                          )
                          : (
                            <button
                              onClick={() => setDeleteId(exp.id)}
                              className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          )
                        }
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      }

      {/* Edit modal */}
      {editExp && (
        <EditFieldExpenseModal
          exp={editExp}
          companyId={companyId}
          onClose={() => setEditExp(null)}
          onSaved={() => {
            setEditExp(null)
            qc.invalidateQueries({ queryKey: ['field_expenses'] })
          }}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FieldExpensePage({ embedded = false, onBack }) {
  const { session, role, companyId, userProfile } = useAuth()
  // Fallback: use userProfile.company_id if companyId from company object not yet resolved
  const effectiveCompanyId = companyId || userProfile?.company_id
  const userId   = session?.user?.id
  const userRole = role
  const [tab, setTab] = useState('submit')
  const [submitted, setSubmitted] = useState(false)

  // Get user name from profile
  const { data: profile } = useQuery({
    queryKey: ['fe_profile', userId],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles').select('full_name').eq('id', userId).single()
      return data
    },
    enabled: !!userId,
  })
  const userName = profile?.full_name || session?.user?.email || 'Unknown'

  const isAdmin = ['admin', 'superadmin', 'manager', 'accounts'].includes(userRole)

  return (
    <div className={`flex flex-col h-full bg-dark-900 ${embedded ? '' : ''}`}>

      {/* Header */}
      <div className="shrink-0 bg-dark-800 border-b border-dark-700 px-4 py-3 flex items-center gap-3">
        {(embedded || onBack) && (
          <button onClick={onBack} className="text-slate-400 hover:text-slate-100 p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-100">Field Expenses</h1>
          <p className="text-xs text-slate-500">Record on-site payments</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-dark-700 bg-dark-800">
        <button
          onClick={() => { setTab('submit'); setSubmitted(false) }}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            tab === 'submit'
              ? 'text-primary-400 border-b-2 border-primary-500'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          + Add Expense
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            tab === 'history'
              ? 'text-primary-400 border-b-2 border-primary-500'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {isAdmin ? 'All Expenses' : 'My Expenses'}
        </button>
      </div>

      {/* Content */}
      {tab === 'submit'
        ? (
          submitted
            ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-100">Expense Recorded!</p>
                  <p className="text-sm text-slate-500 mt-1">All done. The expense has been saved.</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSubmitted(false)}
                    className="px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold"
                  >
                    Add Another
                  </button>
                  <button
                    onClick={() => setTab('history')}
                    className="px-5 py-2.5 rounded-xl bg-dark-700 text-slate-300 text-sm font-semibold"
                  >
                    View History
                  </button>
                </div>
              </div>
            )
            : (
              <ExpenseForm
                companyId={effectiveCompanyId}
                userId={userId}
                userRole={userRole}
                userName={userName}
                onSuccess={() => setSubmitted(true)}
                onBack={onBack}
              />
            )
        )
        : (
          <ExpenseHistory
            companyId={effectiveCompanyId}
            userId={userId}
            userRole={userRole}
          />
        )
      }
    </div>
  )
}
